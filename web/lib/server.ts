import 'server-only';
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import type {Connection} from '@relate/relate';
import {openStore,assertSchema,versionSchema,incidentSchema,detect,timestamp,evaluateGate,parseLockfile,type VersionRecord} from '@patient-zero/core';
import type {Meta,Replay,IncidentInfo,Mode,Assessment,Explanation,Benchmark} from './contracts';
// Runtime-owned paths are intentionally external; trace only reviewed assets in next.config.ts.
const ROOT=resolve(/* turbopackIgnore: true */ process.env.PZ_PROJECT_ROOT??resolve(/* turbopackIgnore: true */ process.cwd(),process.cwd().endsWith('/web')?'..':'.'));
const STORE=resolve(ROOT,process.env.PZ_WEB_STORE??'patient-zero.rl');
interface StoreState {conn:Connection;mtime:number;size:number;sha:string;records:VersionRecord[];coverage:{fullHistoryPackages:string[];projectedPackages:string[]}}
const shared=globalThis as typeof globalThis&{pzWebStore?:StoreState};
export function store():StoreState{
 const stat=statSync(/* turbopackIgnore: true */ STORE);if(!stat.isFile())throw new Error('Configured store is not a file.');
 if(shared.pzWebStore){if(shared.pzWebStore.mtime!==stat.mtimeMs||shared.pzWebStore.size!==stat.size)throw new Error('The configured store changed. Restart the web server before assessing another file.');return shared.pzWebStore;}
 const conn=openStore(STORE).connect();assertSchema(conn);
 const records=conn.query('MATCH (v:Version) RETURN v.metadataJSON AS json').rows.map(r=>versionSchema.parse(JSON.parse(String(r.json))));
 const raw=conn.query('MATCH (s:Store {id:$id}) RETURN s.gateCoverageJSON AS json',{id:'patient-zero'}).single().json;
 const coverage=JSON.parse(String(raw));
 return shared.pzWebStore={conn,records,coverage,mtime:stat.mtimeMs,size:stat.size,sha:createHash('sha256').update(readFileSync(/* turbopackIgnore: true */ STORE)).digest('hex')};
}
const names:Record<string,string>={'chalk-debug-2025-09':'chalk/debug','shai-hulud-2025-09':'Shai-Hulud'};
export function incident(slug:string){if(!Object.hasOwn(names,slug))throw new Error('Unknown incident.');return incidentSchema.parse(JSON.parse(readFileSync(resolve(ROOT,'bench/incidents',`${slug}.json`),'utf8')));}
export function incidentInfo(slug:string):IncidentInfo{const i=incident(slug);return{slug:i.slug,name:names[slug]!,role:i.role,start:i.start,end:i.end,referenceVersions:new Set(i.labels.map(v=>`${v.pkg}@${v.semver}`)).size,advisoryPublishedAt:i.advisoryPublishedAt};}
export function metadata():Meta{const s=store();return{store:{name:STORE.split(/[\\/]/).at(-1)!,bytes:s.size,sha256:s.sha,versions:s.records.length,fullHistoryPackages:s.coverage.fullHistoryPackages.length,projectedPackages:s.coverage.projectedPackages.length},incidents:Object.keys(names).map(incidentInfo)};}
export function modeValue(value:string|null):Mode{if(value===null)return'retrospective';if(value!=='retrospective'&&value!=='evidence')throw new Error('Invalid temporal mode.');return value;}
function masked(v:VersionRecord,asOf:string,mode:Mode):VersionRecord|null{
 if(v.publishedAt===null||v.publishedAt>asOf||mode==='evidence'&&v.evidence.publishedAt!.observedAt>asOf)return null;
 const copy=structuredClone(v);
 if(mode==='evidence')for(const field of ['publisher','hasInstallScript','provenance','unpackedSize','dependencies']as const){if(copy.evidence[field]&&copy.evidence[field]!.observedAt>asOf){copy[field]=null;delete copy.evidence[field];}}
 return copy;
}
const replayCache=new Map<string,Replay>();
export function replay(slug:string,input:string,mode:Mode):Replay{
 const info=incidentInfo(slug),i=incident(slug),asOf=timestamp.parse(input);
 if(Date.parse(asOf)<Date.parse(info.start)-3600000||asOf>info.end)throw new Error('Replay freeze is outside this incident window.');
 const key=`${slug}:${asOf}:${mode}`;store();if(replayCache.has(key))return replayCache.get(key)!;
 const s=store(),packages=new Set(i.packages),visible=s.records.filter(v=>packages.has(v.pkg)).map(v=>masked(v,asOf,mode)).filter((v):v is VersionRecord=>v!==null);
 const baseline=new Map<string,VersionRecord>();for(const v of visible)if(v.publishedAt!<info.start&&(!baseline.has(v.pkg)||baseline.get(v.pkg)!.publishedAt!<v.publishedAt!))baseline.set(v.pkg,v);
 const window=visible.filter(v=>v.publishedAt!>=info.start),versions=[...baseline.values(),...window];
 const result=detect(s.conn,{asOf,mode});const findings=result.findings.filter(f=>f.reasons.some(r=>r.at>=info.start)&&versions.some(v=>`${v.pkg}@${v.semver}`===f.version));
 const value:Replay={incident:info,asOf,mode,versions,findings,coverage:result.coverage,warnings:result.warnings};replayCache.set(key,value);if(replayCache.size>48)replayCache.delete(replayCache.keys().next().value!);return value;
}
export function assess(text:string,asOfInput:string,mode:Mode,failOn:'medium'|'high'):Assessment{
 const input:unknown=JSON.parse(text);if(input&&typeof input==='object'&&'packages'in input&&input.packages&&typeof input.packages==='object'&&Object.keys(input.packages).length>2001)throw new Error('The local web assessor supports up to 2,000 locations. Use the CLI for larger lockfiles.');
 const lock=parseLockfile(text);if(lock.nodes.length>2000)throw new Error('The local web assessor supports up to 2,000 locations. Use the CLI for larger lockfiles.');
 const asOf=timestamp.parse(asOfInput),s=store();const result=evaluateGate(s.conn,lock,{asOf,mode,failOn});
 const ids=new Set(lock.nodes.map(n=>n.id));const versions=s.records.filter(v=>ids.has(`${v.pkg}@${v.semver}`)).map(v=>masked(v,asOf,mode)).filter((v):v is VersionRecord=>v!==null);
 return{result,lock,versions};
}
export function explain(id:string,asOfInput:string,mode:Mode):Explanation{
 const s=store(),asOf=timestamp.parse(asOfInput),raw=s.records.find(v=>`${v.pkg}@${v.semver}`===id);
 if(!raw)throw new Error('Version outside store coverage.');const record=masked(raw,asOf,mode);if(!record)throw new Error('Version has no visible publication evidence at this freeze.');
 const history=s.records.filter(v=>v.pkg===record.pkg).map(v=>masked(v,asOf,mode)).filter((v):v is VersionRecord=>v!==null).sort((a,b)=>a.publishedAt!.localeCompare(b.publishedAt!));
 const previous=history.filter(v=>v.publishedAt!<record.publishedAt!).at(-1)??null;
 const start=Date.parse(asOf)-72*3600000,activity=new Map<number,number>();
 if(record.publisher!==null)for(const v of s.records){const visible=masked(v,asOf,mode);if(visible?.publisher===record.publisher&&Date.parse(visible.publishedAt!)>=start){const hour=Math.floor(Date.parse(visible.publishedAt!)/3600000)*3600000;activity.set(hour,(activity.get(hour)??0)+1);}}
 return{record,previous,history:history.slice(-8),finding:detect(s.conn,{asOf,mode}).findings.find(f=>f.version===id)??null,activity:[...activity].sort((a,b)=>a[0]-b[0]).map(([at,count])=>({at:new Date(at).toISOString(),count})),projected:s.coverage.projectedPackages.includes(record.pkg),asOf,mode};
}
export function benchmark():Benchmark{return JSON.parse(readFileSync(resolve(ROOT,'bench/results.json'),'utf8'));}
