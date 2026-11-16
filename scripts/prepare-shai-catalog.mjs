// Extract IOC facts only. Source HTML is temporary; no malware/artifacts are fetched.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {incidentSchema,packageName,versionName} from '../packages/core/dist/index.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const observedAt=new Date().toISOString();
const specifications=[
 {name:'stepsecurity',url:'https://www.stepsecurity.io/blog/ctrl-tinycolor-and-40-npm-packages-compromised',file:'/tmp/pz-step.html'},
 {name:'wiz',url:'https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack',file:'/tmp/pz-wiz.html'},
];
const byId=new Map();const sources=[];const rejected=[];
for(const spec of specifications){
 const response=await fetch(spec.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok||!response.body)throw new Error(`Primary source HTTP ${response.status}`);
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw new Error('Source report exceeds 2 MiB');chunks.push(chunk);}
 const html=Buffer.concat(chunks).toString('utf8');const pairs=[];
 if(spec.name==='stepsecurity'){
  for(const m of html.matchAll(/<td class="package-name">([^<]+)<\/td>\s*<td class="versions">([^<]+)<\/td>/g))
   for(const version of m[2].split(',').map(s=>s.trim())) pairs.push([m[1].trim(),version]);
 }else{
  const start=html.indexOf('id="appendix-impacted-packages');
  if(start<0)throw new Error('Missing Wiz appendix');
  const end=html.indexOf('<h1',start+10);
  const section=html.slice(start,end<0?undefined:end);
  for(const m of section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)){
   const text=m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
   const name=text.match(/^(@?[^\s(]+?)(?=\s|\()/)?.[1];
   const special=text.match(/^(@ctrl\/tinycolor)@4\.1\.1/);
   const pkg=special?special[1]:name;
   const versions=[...text.matchAll(/\d+\.\d+\.\d+(?:-[\w.-]+)?/g)].map(m=>m[0]);
   if(pkg&&versions.length)for(const version of versions)pairs.push([pkg,version]);
  }
 }
 if(pairs.length<200)throw new Error(`Unexpectedly small ${spec.name} IOC list`);
 for(const [pkg,semver] of pairs){
  if(!packageName.safeParse(pkg).success||!versionName.safeParse(semver).success){rejected.push({pkg,semver,source:spec.url});continue;}
  const id=`${pkg}@${semver}`;const row=byId.get(id)??{pkg,semver,sources:[]};
  if(!row.sources.includes(spec.url))row.sources.push(spec.url);byId.set(id,row);
 }
 sources.push({name:spec.name,url:spec.url,observedAt,responseSha256:hash(html),extractedPairs:pairs.length});
}
if(rejected.length)throw new Error(`Unparsed IOC entries: ${JSON.stringify(rejected)}`);
const iocs=[...byId.values()].sort((a,b)=>`${a.pkg}@${a.semver}`.localeCompare(`${b.pkg}@${b.semver}`));
const previous=JSON.parse(await readFile('bench/incidents/shai-hulud-2025-09.json','utf8'));
const patches=new Map(previous.reconstructions.map(v=>[`${v.pkg}@${v.semver}`,v]));
const catalog=incidentSchema.parse({...previous,end:'2025-09-20T00:00:00.000Z',packages:[...new Set(iocs.map(v=>v.pkg))].sort(),
 notes:'Complete deduplicated union of the pinned September StepSecurity table and Wiz appendix, including hidden table rows. Full means coverage of these reference lists, not all globally compromised packages. Missing per-version metadata stays unknown; no campaign-wide publisher or script assumption is injected. Evidence observed in November 2026 cannot establish pre-advisory detection. First-public-disclosure cutoff remains unverified; OSV publication times are not substituted for it.',
 reconstructions:iocs.map(v=>patches.get(`${v.pkg}@${v.semver}`)??{pkg:v.pkg,semver:v.semver,publishedAt:null,publisher:null,hasInstallScript:null,provenance:null,unpackedSize:null,dependencies:null,evidence:{}}),
 labels:iocs.map(v=>({pkg:v.pkg,semver:v.semver,advisoryId:`IOC:${v.pkg}@${v.semver}`,source:v.sources[0],publishedAt:null})),
});
await mkdir('bench/sources',{recursive:true});
await writeFile('bench/sources/shai-hulud-reference.json',JSON.stringify({schemaVersion:1,observedAt,sources,iocs},null,2)+'\n');
await writeFile('bench/incidents/shai-hulud-2025-09.json',JSON.stringify(catalog,null,2)+'\n');
console.log(JSON.stringify({packages:catalog.packages.length,versions:iocs.length,sources:sources.map(s=>({name:s.name,pairs:s.extractedPairs}))}));
