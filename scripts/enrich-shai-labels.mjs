// Only benchmark labels are enriched; reconstructed detector facts stay unchanged.
import {readFile} from 'node:fs/promises';
import {fetchPackageMalwareLabels,writeJSON} from '../packages/ingest/dist/index.js';
import {incidentSchema,digest} from '../packages/core/dist/index.js';
const path='bench/incidents/shai-hulud-2025-09.json',manifestPath='data/shai-hulud/manifest.json';
const catalog=incidentSchema.parse(JSON.parse(await readFile(path,'utf8'))),byPackage=new Map();
for(const label of catalog.labels)byPackage.set(label.pkg,[...(byPackage.get(label.pkg)??[]),label]);
let index=0,count=0;const packages=catalog.packages,labels=[],failures=[];
async function worker(){while(index<packages.length){const pkg=packages[index++];try{
 const found=await fetchPackageMalwareLabels(pkg);const expected=byPackage.get(pkg)??[];
 for(const label of expected){const matches=found.filter(v=>v.semver===label.semver);labels.push(...(matches.length?matches:[label]));}
 count++;if(count%25===0)console.log(`OSV metadata ${count}/${packages.length}`);
}catch(e){failures.push({pkg,error:e.message});}}}
await Promise.all([worker(),worker()]);
if(failures.length){await writeJSON('data/shai-hulud/osv-failures.json',failures);throw new Error(`${failures.length} OSV gaps; catalog has not been replaced`);}
const enriched=incidentSchema.parse({...catalog,labels:labels.sort((a,b)=>`${a.pkg}@${a.semver}:${a.advisoryId}`.localeCompare(`${b.pkg}@${b.semver}:${b.advisoryId}`))});
await writeJSON(path,enriched);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.incidentSha256=digest(await readFile(path,'utf8'));await writeJSON(manifestPath,manifest);
await writeJSON('bench/sources/shai-osv-labels.json',{schemaVersion:1,observedAt:new Date().toISOString(),query:'https://api.osv.dev/v1/query',matchedVersions:new Set(labels.filter(v=>v.advisoryId.startsWith('MAL-')).map(v=>`${v.pkg}@${v.semver}`)).size,referenceVersions:new Set(catalog.labels.map(v=>`${v.pkg}@${v.semver}`)).size,firstPublicAdvisoryVerified:false});
console.log('Label enrichment complete; no detection run.');
