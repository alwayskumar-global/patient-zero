import { readFile, mkdir, link, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cacheSchema, digest, incidentSchema, openStore, populateGraph, detect, persistFindings, type Incident, type VersionRecord } from '@patient-zero/core';
import { fetchPackument } from './registry.js';
import {writeJSON} from './io.js';
import {loadLockfileSnapshot} from './snapshot.js';
export {writeJSON} from './io.js';
export * from './snapshot.js';
export * from './registry.js';
export * from './osv.js';
export * from './compact.js';

export const manifestSchema = z.object({
  schemaVersion:z.literal(1), incident:z.string().regex(/^[a-z0-9-]+$/), incidentSha256:z.string().regex(/^[a-f0-9]{64}$/),
  packages:z.array(z.object({ pkg:z.string(), file:z.string().regex(/^[a-f0-9]{64}\.json$/), sha256:z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1),
}).strict();
export async function readIncident(path:string):Promise<Incident> { return incidentSchema.parse(JSON.parse(await readFile(path,'utf8'))); }
/** Refresh is explicit. Offline builders never call this or any HTTP client. */
export async function ingestIncident(incidentPath:string, manifestPath:string):Promise<void> {
  const bytes = await readFile(incidentPath,'utf8'), incident = incidentSchema.parse(JSON.parse(bytes));
  const packages = [];
  for (const pkg of [...new Set(incident.packages)].sort()) {
    const cache = await fetchPackument(pkg);
    const content = JSON.stringify(cache,null,2)+'\n';
    // Content-addressed records keep the previous manifest valid on partial failure.
    const sha256 = digest(content), file = `${sha256}.json`;
    await writeJSON(join(dirname(manifestPath),'cache',file),cache);
    packages.push({ pkg,file,sha256 });
  }
  await writeJSON(manifestPath, { schemaVersion:1,incident:incident.slug,incidentSha256:digest(bytes),packages });
}

export function mergeReconstruction(existing:VersionRecord|undefined, patch:VersionRecord):VersionRecord {
  if (!existing) return structuredClone(patch);
  if (existing.pkg !== patch.pkg || existing.semver !== patch.semver) throw new Error('Reconstruction identity mismatch');
  const merged = structuredClone(existing);
  for (const key of ['publishedAt','publisher','hasInstallScript','provenance','unpackedSize','dependencies'] as const) {
    const incoming = patch[key];
    if (incoming === null) continue;
    if (existing[key] !== null && JSON.stringify(existing[key]) !== JSON.stringify(incoming)) throw new Error(`Conflicting reconstruction ${patch.pkg}@${patch.semver}: ${key}`);
    if (existing[key] === null) {
      // Assigned as a whole below to preserve each field's type and evidence.
      Object.assign(merged,{ [key]:incoming }); merged.evidence[key] = patch.evidence[key]!;
    }
  }
  return merged;
}

export interface Dataset {versions:VersionRecord[];incident:Incident;hash:string;cacheCoverage:{notFound:string[];normalizationWarnings:number;originalVersions:number;projectedPackages:string[];projections:{start:string;end:string;lookbackMinutes:number}[]}}
export async function loadDataset(manifestPath:string, incidentPath:string):Promise<Dataset> {
  const manifestBytes = await readFile(manifestPath,'utf8'), manifest = manifestSchema.parse(JSON.parse(manifestBytes));
  const incidentBytes = await readFile(incidentPath,'utf8'), incident = incidentSchema.parse(JSON.parse(incidentBytes));
  if (digest(incidentBytes) !== manifest.incidentSha256 || manifest.incident !== incident.slug) throw new Error('Incident manifest integrity mismatch');
  if (new Set(manifest.packages.map(p=>p.pkg)).size !== manifest.packages.length || [...new Set(incident.packages)].sort().join('\n') !== manifest.packages.map(p=>p.pkg).sort().join('\n')) throw new Error('Manifest package coverage mismatch');
  const byId = new Map<string,VersionRecord>();
  const cacheCoverage:Dataset['cacheCoverage']={notFound:[],normalizationWarnings:0,originalVersions:0,projectedPackages:[],projections:[]};
  for (const entry of manifest.packages) {
    const content = await readFile(join(dirname(manifestPath),'cache',entry.file),'utf8');
    if (digest(content) !== entry.sha256) throw new Error(`Cache checksum mismatch for ${entry.pkg}`);
    const cache = cacheSchema.parse(JSON.parse(content));
    if (cache.pkg !== entry.pkg) throw new Error('Cache identity mismatch');
    if(cache.availability==='not-found')cacheCoverage.notFound.push(cache.pkg);
    cacheCoverage.normalizationWarnings+=cache.normalizationWarnings?.length??0;
    cacheCoverage.originalVersions+=cache.projection?.originalVersionCount??cache.versions.length;
    if(cache.projection){cacheCoverage.projections.push(cache.projection);cacheCoverage.projectedPackages.push(cache.pkg);}
    for (const v of cache.versions) byId.set(`${v.pkg}@${v.semver}`,v);
  }
  for (const patch of incident.reconstructions) {
    if (!incident.packages.includes(patch.pkg)) throw new Error('Reconstruction outside package coverage');
    const id = `${patch.pkg}@${patch.semver}`;
    byId.set(id,mergeReconstruction(byId.get(id),patch));
  }
  return { versions:[...byId.values()].sort((a,b)=>`${a.pkg}@${a.semver}`.localeCompare(`${b.pkg}@${b.semver}`)), incident, hash:digest(manifestBytes+incidentBytes),cacheCoverage };
}

export async function buildStore(manifestPath:string, incidentPath:string, outputPath:string):Promise<{versions:number;findings:number;datasetHash:string}> {
  const kind=JSON.parse(await readFile(manifestPath,'utf8')).kind;
  if(kind==='lockfile'){
    const data=await loadLockfileSnapshot(manifestPath);
    return publishStore(data.versions,[],data.hash,outputPath,{schemaVersion:1,fullHistoryPackages:[...new Set(data.versions.map(v=>v.pkg))],projectedPackages:[]});
  }
  const data=await loadDataset(manifestPath,incidentPath);
  return publishStore(data.versions,[data.incident],data.hash,outputPath,{schemaVersion:1,fullHistoryPackages:data.incident.packages.filter(p=>!data.cacheCoverage.projectedPackages.includes(p)&&!data.cacheCoverage.notFound.includes(p)),projectedPackages:data.cacheCoverage.projectedPackages});
}
export async function buildCombinedStore(inputs:{manifest:string;incident:string}[],outputPath:string):Promise<{versions:number;findings:number;datasetHash:string}> {
  inputs=z.array(z.object({manifest:z.string(),incident:z.string()}).strict()).min(1).max(32).parse(inputs);
  const versions=new Map<string,VersionRecord>(),incidents:Incident[]=[],hashes=[],full=new Set<string>(),projected=new Set<string>();
  for(const input of inputs){
    const data=await loadDataset(input.manifest,input.incident);incidents.push(data.incident);hashes.push(data.hash);
    for(const pkg of data.incident.packages)if(!data.cacheCoverage.projectedPackages.includes(pkg)&&!data.cacheCoverage.notFound.includes(pkg))full.add(pkg);
    for(const pkg of data.cacheCoverage.projectedPackages)projected.add(pkg);
    for(const v of data.versions){const id=`${v.pkg}@${v.semver}`;versions.set(id,mergeReconstruction(versions.get(id),v));}
  }
  if(new Set(incidents.map(i=>i.slug)).size!==incidents.length)throw new Error('Duplicate incident in combined store');
  return publishStore([...versions.values()],incidents,digest(JSON.stringify(hashes)),outputPath,{schemaVersion:1,fullHistoryPackages:[...full],projectedPackages:[...projected].filter(p=>!full.has(p))});
}
async function publishStore(versions:VersionRecord[],incidents:Incident[],hash:string,outputPath:string,coverage:{schemaVersion:1;fullHistoryPackages:string[];projectedPackages:string[]}):Promise<{versions:number;findings:number;datasetHash:string}> {
  if(!outputPath.endsWith('.rl'))throw new Error('Store must end in .rl');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  const temporary=join(dirname(resolve(outputPath)),`.pz-${randomUUID()}.rl`);
  try{
    const db=openStore(temporary,{readOnly:false}),conn=db.connect();populateGraph(conn,versions,incidents,hash);let findings=0;
    conn.query('MATCH (s:Store {id:$id}) SET s.gateCoverageJSON=$json',{id:'patient-zero',json:JSON.stringify(coverage)});
    for(const incident of incidents)if(incident.role==='tuning'){
      const result=detect(conn,{asOf:incident.end,mode:'retrospective'});persistFindings(conn,result);findings+=result.findings.length;
    }
    db.checkpoint();await link(temporary,resolve(outputPath));
    return{versions:versions.length,findings,datasetHash:hash};
  }finally{await unlink(temporary).catch(()=>{});}
}
