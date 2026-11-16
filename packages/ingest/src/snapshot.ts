import {z} from 'zod';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {cacheSchema,digest,packageName,timestamp,type ParsedLockfile,type VersionRecord} from '@patient-zero/core';
import {fetchPackument} from './registry.js';
import {writeJSON} from './io.js';
const snapshotSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('lockfile'),lockfileHash:z.string().regex(/^[a-f0-9]{64}$/),observedAt:timestamp,
 packages:z.array(z.object({pkg:packageName,file:z.string().regex(/^[a-f0-9]{64}\.json$/),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()),
}).strict();
/** Explicit public-registry metadata collection. Lockfile bodies stay local. */
export async function ingestLockfile(lock:ParsedLockfile,manifestPath:string):Promise<void>{
 const names=[...new Set(lock.nodes.filter(n=>!n.local).map(n=>n.name))].sort(),packages=[];
 for(const pkg of names){
  const cache=await fetchPackument(pkg),bytes=JSON.stringify(cache,null,2)+'\n',sha256=digest(bytes),file=`${sha256}.json`;
  await writeJSON(join(dirname(manifestPath),'cache',file),cache);packages.push({pkg,file,sha256});
 }
 await writeJSON(manifestPath,{schemaVersion:1,kind:'lockfile',lockfileHash:lock.hash,observedAt:new Date().toISOString(),packages});
}
export async function loadLockfileSnapshot(path:string):Promise<{versions:VersionRecord[];hash:string}>{
 const bytes=await readFile(path,'utf8'),snapshot=snapshotSchema.parse(JSON.parse(bytes));
 if(new Set(snapshot.packages.map(p=>p.pkg)).size!==snapshot.packages.length)throw new Error('Duplicate lockfile snapshot package');
 const versions:VersionRecord[]=[];
 for(const entry of snapshot.packages){
  const data=await readFile(join(dirname(path),'cache',entry.file),'utf8');if(digest(data)!==entry.sha256)throw new Error('Lockfile snapshot checksum mismatch');
  const cache=cacheSchema.parse(JSON.parse(data));if(cache.pkg!==entry.pkg)throw new Error('Lockfile snapshot identity mismatch');
  if(cache.projection)throw new Error('A window-projected benchmark cache cannot be used as a current lockfile snapshot');
  versions.push(...cache.versions);
 }
 return{versions,hash:digest(bytes)};
}
