import {statSync} from 'node:fs';
import semver from 'semver';
import {openStore,assertSchema,versionSchema,detect,evaluateGate,parseLockfile,rootPaths,timestamp,packageName,versionName,
 type VersionRecord,type ParsedLockfile,type DetectionResult} from '@patient-zero/core';

export interface AnalysisOptions {
 store:string;lockfile?:ParsedLockfile;asOf?:string;mode?:'evidence'|'retrospective';config?:unknown;
 failOn?:'medium'|'high';maxStoreAgeHours?:number;
}
export interface Query {package:string;asOf?:string|undefined;mode?:'evidence'|'retrospective'|undefined;lockfile?:string|undefined}
export function parseToolLockfile(text:string):ParsedLockfile {
 if(Buffer.byteLength(text)>1_800_000)throw new Error('MCP lockfile input exceeds 1.8 MB; use the CLI for larger locks.');
 const raw:unknown=JSON.parse(text);
 if(raw&&typeof raw==='object'&&'packages'in raw&&raw.packages&&typeof raw.packages==='object'&&Object.keys(raw.packages).length>2001)throw new Error('MCP lockfiles support up to 2,000 installation locations.');
 const lock=parseLockfile(text);if(lock.nodes.length>2001)throw new Error('MCP lockfiles support up to 2,000 installation locations.');return lock;
}

/** No network, arbitrary Cypher, filesystem tool arguments or graph mutation. */
export function createAnalysis(options:AnalysisOptions) {
 const initial=statSync(options.store),conn=openStore(options.store).connect();assertSchema(conn);
 const records=conn.query('MATCH (v:Version) RETURN v.metadataJSON AS json').rows.map(r=>versionSchema.parse(JSON.parse(String(r.json))));
 const cache=new Map<string,DetectionResult>();
 function context(input:Query) {
  packageName.parse(input.package);
  const stat=statSync(options.store);if(stat.mtimeMs!==initial.mtimeMs||stat.size!==initial.size)throw new Error('Store changed; restart the MCP server before another assessment.');
  const asOf=timestamp.parse(input.asOf??options.asOf??new Date().toISOString()),mode=input.mode??options.mode??'evidence';
  if(mode!=='evidence'&&mode!=='retrospective')throw new Error('Invalid temporal mode.');
  const key=`${asOf}:${mode}`;
  let detection=cache.get(key);if(!detection){detection=detect(conn,{asOf,mode,config:options.config??{}});cache.set(key,detection);if(cache.size>16)cache.delete(cache.keys().next().value!);}
  const visible=records.map(v=>{
   if(v.publishedAt===null||v.publishedAt>asOf||mode==='evidence'&&v.evidence.publishedAt!.observedAt>asOf)return null;
   const copy=structuredClone(v);
   if(mode==='evidence')for(const f of ['publisher','hasInstallScript','provenance','unpackedSize','dependencies']as const)if(copy.evidence[f]&&copy.evidence[f]!.observedAt>asOf){copy[f]=null;delete copy.evidence[f];}
   return copy;
  }).filter((v):v is VersionRecord=>v!==null);
  const lock=input.lockfile===undefined?options.lockfile:parseToolLockfile(input.lockfile);
  const gate=lock?evaluateGate(conn,lock,{asOf,mode,config:options.config??{},failOn:options.failOn??'medium',maxStoreAgeHours:options.maxStoreAgeHours??168}):null;
  return{asOf,mode,detection,visible,lock,gate};
 }
 const policyNote='Experimental metadata policy; no finding or policy pass establishes safety. Unknown, stale and incomplete evidence cannot authorize an allow. No package is installed or lockfile modified.';
 function blastRadius(input:Query&{version?:string|undefined}) {
  if(input.version!==undefined)versionName.parse(input.version);
  const c=context(input),target=c.visible.filter(v=>v.pkg===input.package&&(input.version===undefined||v.semver===input.version));
  const publishers=new Set(target.flatMap(v=>v.publisher===null?[]:[v.publisher]));
  const shared=c.visible.filter(v=>v.pkg!==input.package&&v.publisher!==null&&publishers.has(v.publisher));
  const byFinding=new Map(c.detection.findings.map(f=>[f.version,f]));
  const paths=c.lock?rootPaths(c.lock):new Map<string,string[]>(),nodes=new Map(c.lock?.nodes.map(n=>[n.path,n])??[]);
  const exactTargets=c.lock?.nodes.filter(n=>n.name===input.package&&(input.version===undefined||n.version===input.version))??[];
  const impacts: {location:string;version:string|null;dependencyChain:string[];pathToRoot:string[]}[]=[];
  {
   const queue=exactTargets.map(target=>({path:target.path,chain:[target.path]})),seen=new Set<string>();
   while(queue.length){const entry=queue.shift()!;if(seen.has(entry.path))continue;seen.add(entry.path);
    impacts.push({location:entry.path,version:nodes.get(entry.path)!.id,dependencyChain:entry.chain,pathToRoot:paths.get(entry.path)??[]});
    for(const edge of c.lock!.edges)if(edge.to===entry.path&&!seen.has(edge.from))queue.push({path:edge.from,chain:[edge.from,...entry.chain]});
   }
  }
  return{schemaVersion:1,asOf:c.asOf,mode:c.mode,package:input.package,version:input.version??null,
   status:target.length?'observed':'incomplete',scope:'Recorded publisher overlap; exact dependency exposure only within the supplied/configured lockfile. No ecosystem dependents claim.',
   targets:target.slice(0,200).map(v=>({version:`${v.pkg}@${v.semver}`,publisher:v.publisher,evidence:v.evidence,finding:byFinding.get(`${v.pkg}@${v.semver}`)??null})),targetCount:target.length,
   sharedPublisherVersions:shared.slice(0,200).map(v=>({version:`${v.pkg}@${v.semver}`,publisher:v.publisher,publishedAt:v.publishedAt,finding:byFinding.get(`${v.pkg}@${v.semver}`)??null})),sharedPublisherCount:shared.length,
   unknownPublisherTargets:target.filter(v=>v.publisher===null).length,
   lockfile:c.lock?{hash:c.lock.hash,root:c.lock.root,targets:exactTargets.map(n=>n.path),impacts:impacts.slice(0,200),impactCount:impacts.length,gate:c.gate}:null,
   truncated:target.length>200||shared.length>200||impacts.length>200,warnings:[policyNote,'Publisher overlap is context, not evidence that every version by that publisher is malicious.',...c.detection.warnings]};
 }
 function whyBlocked(input:Query&{version:string}) {
  versionName.parse(input.version);const c=context(input),id=`${input.package}@${input.version}`,record=c.visible.find(v=>`${v.pkg}@${v.semver}`===id)??null;
  const finding=c.detection.findings.find(f=>f.version===id)??null;
  return{schemaVersion:1,version:id,asOf:c.asOf,mode:c.mode,status:!record?'incomplete':finding?'finding':'no_visible_finding',record,finding,
   lockfile:c.lock?{hash:c.lock.hash,status:c.gate!.status,exitCode:c.gate!.exitCode,blocked:c.gate!.blocked.filter(b=>b.version===id),gaps:c.gate!.gaps.filter(g=>g.version===id),warnings:c.gate!.warnings}:null,
   warnings:[policyNote,...(!record?['Version has no visible publication evidence within store coverage at this freeze.']:[]),...c.detection.warnings]};
 }
 function safeUpgradePath(input:Query&{fromVersion:string;candidateLockfile?:string|undefined}) {
  versionName.parse(input.fromVersion);const c=context(input),from=`${input.package}@${input.fromVersion}`;
  const candidates=c.visible.filter(v=>v.pkg===input.package&&semver.gt(v.semver,input.fromVersion)).sort((a,b)=>semver.rcompare(a.semver,b.semver));
  let assessment:ReturnType<typeof evaluateGate>|null=null,transition:{from:string;to:string;location:string;pathToRoot:string[]}[]=[];
  const reasons:string[]=[];
  if(!c.visible.some(v=>`${v.pkg}@${v.semver}`===from))reasons.push('Starting version lacks visible metadata; the upgrade origin is unverified.');
  if(!c.lock)reasons.push('Supply the original lockfile or configure --lockfile to establish exact installation paths.');
  else if(!c.lock.nodes.some(n=>n.id===from))reasons.push('Starting version is absent from the original lockfile.');
  if(input.candidateLockfile===undefined)reasons.push('A fully resolved candidate lockfile is required; version metadata alone cannot establish a safe upgrade path.');
  else{
   const candidate=parseToolLockfile(input.candidateLockfile),paths=rootPaths(candidate);
   assessment=evaluateGate(conn,candidate,{asOf:c.asOf,mode:c.mode,config:options.config??{},failOn:options.failOn??'medium',maxStoreAgeHours:options.maxStoreAgeHours??168});
   if(candidate.root!==c.lock?.root)reasons.push('Candidate root differs from the original project.');
   if(candidate.nodes.some(n=>n.id===from))reasons.push('The candidate still resolves the starting version.');
   const replacement=candidate.nodes.filter(n=>n.name===input.package&&n.version!==null&&semver.gt(n.version,input.fromVersion));
   if(!replacement.length)reasons.push('The candidate does not resolve a newer version of the requested package.');
   transition=replacement.map(n=>({from,to:n.id!,location:n.path,pathToRoot:paths.get(n.path)??[]}));
   if(assessment.status!=='passed')reasons.push(`Candidate gate is ${assessment.status} (exit ${assessment.exitCode}).`);
   if(c.mode!=='evidence')reasons.push('Historical simulation cannot qualify a current upgrade.');
  }
  return{schemaVersion:1,package:input.package,fromVersion:input.fromVersion,asOf:c.asOf,mode:c.mode,
   status:reasons.length?'no_verified_upgrade':'candidate_policy_pass',safe:false,
   transition,reasons,candidateAssessment:assessment,
   candidates:candidates.slice(0,20).map(v=>({version:v.semver,publishedAt:v.publishedAt,finding:c.detection.findings.find(f=>f.version===`${v.pkg}@${v.semver}`)??null,evidence:v.evidence})),candidateCount:candidates.length,
   warnings:[policyNote,'Candidate versions are observed metadata, not recommended pins. A candidate policy pass covers the submitted resolved lockfile only; it is not a proof of safety. Regenerate it with lifecycle scripts disabled and review its diff before assessment.']};
 }
 return{blastRadius,whyBlocked,safeUpgradePath};
}
