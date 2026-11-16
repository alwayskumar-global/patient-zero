// Explicit resumable network collection, metadata only. Fixed two-request concurrency.
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {parseArgs} from 'node:util';
import {fetchPackument,writeJSON,compactForWindow} from '../packages/ingest/dist/index.js';
import {incidentSchema,digest,cacheSchema} from '../packages/core/dist/index.js';
const {values}=parseArgs({options:{incident:{type:'string'},manifest:{type:'string'},start:{type:'string'},end:{type:'string'}}});
if(!values.incident||!values.manifest)throw new Error('--incident and --manifest required');
const incidentBytes=await readFile(values.incident,'utf8'),incident=incidentSchema.parse(JSON.parse(incidentBytes));
const root=dirname(values.manifest),progress=join(root,'progress.json');await mkdir(join(root,'cache'),{recursive:true});
let done={};try{done=JSON.parse(await readFile(progress,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const failures=[];let count=0, index=0;const packages=[...incident.packages].sort();
async function worker(){while(index<packages.length){const pkg=packages[index++];
 if(done[pkg]){try{const bytes=await readFile(join(root,'cache',done[pkg].file),'utf8');const cache=cacheSchema.parse(JSON.parse(bytes));if(digest(bytes)===done[pkg].sha256 && cache.pkg===pkg && (!values.start||cache.projection?.start===values.start)){count++;continue;}}catch{}}
 try{
  let cache;
  for(let attempt=0;attempt<3;attempt++){try{cache=await fetchPackument(pkg,{allowMissing:true});break;}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}
  if(values.start&&values.end)cache=compactForWindow(cache,values.start,values.end);
  const bytes=JSON.stringify(cache,null,2)+'\n',sha256=digest(bytes),file=`${sha256}.json`;
  await writeJSON(join(root,'cache',file),cache);done[pkg]={pkg,file,sha256};
  count++;if(count%20===0||count===packages.length)console.log(`Cached ${count}/${packages.length}; ${pkg}`);
 }catch(error){failures.push({pkg,error:error.message});console.error(`Metadata gap: ${pkg}: ${error.message.slice(0,200)}`);}
 // Serialized progress publication avoids two writers racing each other.
}}
await Promise.all([worker(),worker()]);await writeJSON(progress,done);
if(failures.length){await writeJSON(join(root,'collection-failures.json'),failures);throw new Error(`${failures.length} collection failures; progress saved. Rerun to retry.`);}
await writeJSON(values.manifest,{schemaVersion:1,incident:incident.slug,incidentSha256:digest(incidentBytes),packages:packages.map(p=>done[p])});
console.log(`Published ${values.manifest}`);
