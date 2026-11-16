import type {Connection} from '@relate/relate';
import {detect,type Finding,type DetectionConfig,type PathStep} from './detect.js';
import {timestamp,versionSchema,type VersionRecord} from './model.js';
import {rootPaths,type ParsedLockfile} from './lockfile.js';
import {z} from 'zod';

export interface LockImpact {location:string;version:string|null;score:number;severity:'low'|'medium'|'high';at:string;chain:string[];finding:Finding}
export interface GateResult {
 schemaVersion:1;status:'passed'|'blocked'|'incomplete';exitCode:0|1|2;lockfileHash:string;asOf:string;mode:'evidence'|'retrospective';failOn:'medium'|'high';
 assessed:number;blocked:{location:string;version:string;score:number;severity:string;dependencyPath:{location:string;label:string}[];evidencePath:PathStep[];resolvedDependencyChain:string[]}[];
 gaps:{location:string;version:string|null;reason:string}[];impacts:LockImpact[];warnings:string[];
}

/** Keep instance identities: collapsing duplicate installs to Version nodes can
 * invent dependency paths between distinct nested node_modules trees. */
export function propagateLockfileTaint(lock:ParsedLockfile,findings:Finding[],config:DetectionConfig):LockImpact[] {
 const byVersion=new Map(findings.map(f=>[f.version,f])),nodes=new Map(lock.nodes.map(n=>[n.path,n]));
 const parents=new Map<string,string[]>();for(const edge of lock.edges)parents.set(edge.to,[...(parents.get(edge.to)??[]),edge.from]);
 const best=new Map<string,LockImpact>(),queue:LockImpact[]=[];
 const severity=(score:number):LockImpact['severity']=>score>=config.high?'high':score>=config.medium?'medium':'low';
 for(const n of lock.nodes){const finding=n.id?byVersion.get(n.id):undefined;if(!finding)continue;
  const impact={location:n.path,version:n.id,score:finding.score,severity:finding.severity,at:finding.scoreAt,chain:[n.path],finding};
  best.set(n.path,impact);if(impact.score>=config.medium)queue.push(impact);
 }
 while(queue.length){
  queue.sort((a,b)=>b.score-a.score||a.at.localeCompare(b.at)||a.location.localeCompare(b.location));const source=queue.shift()!;
  if(source.chain.length-1>=config.maxHops)continue;
  for(const location of parents.get(source.location)??[]){
   if(source.chain.includes(location))continue;
   const score=Math.round(source.score*config.decay*1000)/1000,existing=best.get(location);
   if(existing && (existing.score>score || existing.score===score&&existing.at<=source.at))continue;
   const impact:LockImpact={location,version:nodes.get(location)!.id,score,severity:severity(score),at:source.at,chain:[...source.chain,location],finding:source.finding};
   best.set(location,impact);if(score>=config.medium)queue.push(impact);
  }
 }
 return [...best.values()].sort((a,b)=>a.location.localeCompare(b.location));
}

export function evaluateGate(conn:Connection,lock:ParsedLockfile,options:{asOf?:string;mode?:'evidence'|'retrospective';config?:unknown;failOn?:'medium'|'high';maxStoreAgeHours?:number}={}):GateResult {
 const asOf=timestamp.parse(options.asOf??new Date().toISOString()),mode=options.mode??'evidence',failOn=options.failOn??'medium';
 if(!['medium','high'].includes(failOn))throw new Error('failOn must be medium or high');
 const ageHours=options.maxStoreAgeHours??168;
 if(!Number.isFinite(ageHours)||ageHours<=0)throw new Error('maxStoreAgeHours must be positive');
 const result=detect(conn,{asOf,mode,config:options.config??{}}),threshold=failOn==='high'?result.config.high:result.config.medium;
 const visible=new Map<string,VersionRecord>();
 for(const row of conn.query('MATCH (v:Version) RETURN v.id AS id,v.metadataJSON AS json').rows)visible.set(String(row.id),versionSchema.parse(JSON.parse(String(row.json))));
 const coverageValue=conn.query('MATCH (s:Store {id:$id}) RETURN s.gateCoverageJSON AS json',{id:'patient-zero'}).single().json;
 let fullHistory=new Set<string>();
 try{const coverage=z.object({schemaVersion:z.literal(1),fullHistoryPackages:z.array(z.string()),projectedPackages:z.array(z.string())}).strict().parse(JSON.parse(String(coverageValue)));fullHistory=new Set(coverage.fullHistoryPackages);}catch{/* Unmarked stores cannot authorize an allow. */}
 const paths=rootPaths(lock),nodes=new Map(lock.nodes.map(n=>[n.path,n]));
 const impacts=propagateLockfileTaint(lock,result.findings,result.config),byLocation=new Map(impacts.map(i=>[i.location,i]));
 const blocked:GateResult['blocked']=[],gaps:GateResult['gaps']=[];
 for(const node of lock.nodes){
  if(node.local)continue;
  const impact=byLocation.get(node.path),record=visible.get(node.id!);
  if(impact&&impact.score>=threshold)blocked.push({location:node.path,version:node.id!,score:impact.score,severity:impact.severity,
   dependencyPath:(paths.get(node.path)??[]).map(location=>({location,label:location===''?lock.root:nodes.get(location)!.id??`workspace:${nodes.get(location)!.name}`})),
   evidencePath:impact.finding.path,resolvedDependencyChain:impact.chain,
  });
  if(!record){gaps.push({location:node.path,version:node.id,reason:'Version outside store coverage'});continue;}
  if(record.publishedAt===null||record.publishedAt>asOf){gaps.push({location:node.path,version:node.id,reason:'Unknown or future publication time'});continue;}
  // A decisive block already prevents installation; missing auxiliary fields do
  // not erase that evidence. An allow requires every detector input below.
  const decisive=impact!==undefined&&impact.score>=threshold;
  if(!decisive&&!fullHistory.has(node.name))gaps.push({location:node.path,version:node.id,reason:'Package history is projected, unavailable, or lacks auditable gate coverage metadata'});
  for(const field of ['publishedAt','publisher','hasInstallScript','provenance','dependencies']as const){
   if(record[field]===null||!record.evidence[field]){if(!decisive)gaps.push({location:node.path,version:node.id,reason:`Missing ${field} evidence`});continue;}
   const observed=record.evidence[field]!.observedAt;
   if(mode==='evidence'&&observed>asOf)gaps.push({location:node.path,version:node.id,reason:`${field} evidence is after asOf`});
   if(mode==='evidence'&&Date.parse(asOf)-Date.parse(observed)>ageHours*3_600_000)gaps.push({location:node.path,version:node.id,reason:`Stale ${field} evidence (maximum ${ageHours} hours)`});
  }
  if(!decisive){
   if([...visible.values()].some(v=>v.pkg===node.name&&v.publishedAt===null))gaps.push({location:node.path,version:node.id,reason:'Package history has versions without publication times'});
   if([...visible.values()].some(v=>v.pkg===node.name&&v.semver!==node.version&&v.publishedAt===record.publishedAt))gaps.push({location:node.path,version:node.id,reason:'Ambiguous same-time publication order prevents complete history assessment'});
   const prior=[...visible.values()].filter(v=>v.pkg===node.name&&v.publishedAt!==null&&v.publishedAt<record.publishedAt!).sort((a,b)=>a.publishedAt!.localeCompare(b.publishedAt!));
   const predecessor=prior.at(-1);
   const required:{record:VersionRecord;field:string}[]=[];
   if(predecessor&&record.hasInstallScript===true)required.push({record:predecessor,field:'hasInstallScript'});
   if(predecessor&&record.provenance===false)required.push({record:predecessor,field:'provenance'});
   if(predecessor&&(record.hasInstallScript===true||record.provenance===false))required.push({record:predecessor,field:'publishedAt'});
   const recentSame=prior.some(v=>v.publisher===record.publisher&&record.publisher!==null&&Date.parse(record.publishedAt!)-Date.parse(v.publishedAt!)<=result.config.dormantDays*86400000&&
    (mode==='retrospective'||['publisher','publishedAt'].every(field=>{const e=v.evidence[field];return e!==undefined&&e.observedAt<=asOf&&Date.parse(asOf)-Date.parse(e.observedAt)<=ageHours*3600000;})));
   if(!recentSame)for(const previous of prior)required.push({record:previous,field:'publisher'},{record:previous,field:'publishedAt'});
   for(const input of required){
    const field=input.field as 'publisher'|'hasInstallScript'|'provenance'|'publishedAt',fact=input.record;
    const evidence=fact.evidence[field];
    if(fact[field]===null||!evidence||mode==='evidence'&&(evidence.observedAt>asOf||Date.parse(asOf)-Date.parse(evidence.observedAt)>ageHours*3600000)){
      gaps.push({location:node.path,version:node.id,reason:`Required history ${fact.pkg}@${fact.semver} has unavailable/future/stale ${field} evidence`});break;
    }
   }
  }
 }
 const status=gaps.length?'incomplete':blocked.length?'blocked':'passed';
 return{schemaVersion:1,status,exitCode:status==='incomplete'?2:status==='blocked'?1:0,lockfileHash:lock.hash,asOf,mode,failOn,
  assessed:lock.nodes.filter(n=>!n.local).length,blocked,gaps,impacts,warnings:[
   'PASS means no findings meet this policy within covered metadata; it is not proof of safety and does not install anything.',
   mode==='retrospective'?'Historical simulation: later-observed reconstructed metadata is allowed. Do not use this mode as current pre-install assurance.':'Evidence-time policy requires fresh observed fields; default maximum age is 168 hours.',
   'Version metadata does not cryptographically verify lockfile archive contents. No safe upgrade is inferred.',
   ...result.warnings,
  ]};
}
