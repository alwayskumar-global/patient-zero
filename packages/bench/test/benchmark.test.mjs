import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from '@relate/relate';
import {populateGraph,detect,detectionConfigSchema,versionId} from '@patient-zero/core';
import {compactForWindow} from '@patient-zero/ingest';
import {scoreEvents,evaluateDataset} from '../dist/index.js';
import {version,at,old} from '../../../fixtures/synthetic.mjs';
const dataset=(records,labels=[])=>({versions:records,incident:{slug:'synthetic-test',role:'held-out',start:at(0),end:at(30),advisoryPublishedAt:null,advisorySource:'https://example.invalid/advisory',labels,packages:[...new Set(records.map(v=>v.pkg))],reconstructions:[],notes:'test only'},hash:'synthetic',cacheCoverage:{notFound:[],normalizationWarnings:0,originalVersions:records.length,projections:[]}});

test('event sampling agrees with literal 15-minute detection for burst thresholds and later taint strength',()=>{
 const records=[version('seed','1.0.0',old),version('seed','1.1.0',at(0),{publisher:'worm',hasInstallScript:true}),version('sibling','1.0.0',at(1),{publisher:'worm'}),version('third','1.0.0',at(17),{publisher:'worm'})];
 const d=dataset(records),config=detectionConfigSchema.parse({burstPackages:3});
 const c=Database.open(':memory:').connect();populateGraph(c,records,[],d.hash);
 const literal=new Map();for(let minute=0;minute<=30;minute+=15){const r=detect(c,{asOf:at(minute),config});for(const f of r.findings)if(f.score>=config.medium&&!literal.has(f.version))literal.set(f.version,at(minute));}
 const result=evaluateDataset(d,config,15);
 assert.deepEqual(new Map(result.firstDetections.map(d=>[d.version,d.tick])),literal);
});

test('all-reference recall counts missing metadata as misses and leaves unverified advisory metrics null',()=>{
 const records=[version('observed','1.0.0',at(1))];
 const labels=[{pkg:'observed',semver:'1.0.0',advisoryId:'MAL-1',publishedAt:at(20),source:'https://example.invalid/a'},{pkg:'missing',semver:'1.0.0',advisoryId:'IOC:missing',publishedAt:null,source:'https://example.invalid/b'}];
 const d=dataset(records,labels),r={events:[{version:'observed@1.0.0',score:3,at:at(1)}]};
 const score=scoreEvents(d,r,15);
 assert.equal(score.recallAtEnd,0.5);assert.equal(score.recallBeforeOsvPublication,1);assert.equal(score.osvLeadMinutes,5);
 assert.equal(score.recallAtFirstPublicAdvisory,null);assert.equal(score.referenceWithKnownPublication,1);
});

test('precision includes unlabelled flags, zero denominators stay null and leads may be negative',()=>{
 const records=[version('observed','1.0.0',at(1)),version('unlabelled','1.0.0',at(2))];
 const d=dataset(records,[{pkg:'observed',semver:'1.0.0',advisoryId:'MAL-1',publishedAt:at(5),source:'https://example.invalid/a'}]);
 const score=scoreEvents(d,{events:records.map(v=>({version:versionId(v),score:3,at:at(2)}))},15);
 assert.equal(score.referencePrecision,0.5);assert.equal(score.osvLeadMinutes,-10);assert.equal(score.recallBeforeOsvPublication,0);
 const empty=scoreEvents(dataset([]),{events:[]},15);
 assert.equal(empty.controlFlagsPer1000Publishes,null);assert.equal(empty.referencePrecision,null);assert.equal(empty.recallAtEnd,null);
});

test('control rate counts each published version once despite repeated or stronger events',()=>{
 const d=dataset([version('one','1.0.0',at(1)),version('two','1.0.0',at(2))]);
 const score=scoreEvents(d,{events:[{version:'one@1.0.0',score:3,at:at(1)},{version:'one@1.0.0',score:5,at:at(20)}]},15);
 assert.equal(score.controlFlagsPer1000Publishes,500);assert.equal(score.flaggedWindowVersions,1);
});

test('temporal compaction preserves in-window rules, missing publisher history, and immediate predecessor',()=>{
 const records=[version('pkg','1.0.0','2024-01-01T00:00:00.000Z',{publisher:'alice'}),version('pkg','1.1.0','2024-02-01T00:00:00.000Z',{publisher:'bob'}),
 version('pkg','1.2.0','2024-03-01T00:00:00.000Z',{publisher:'alice'}),version('pkg','1.3.0','2024-04-01T00:00:00.000Z',{publisher:null}),
 version('pkg','1.4.0','2025-09-01T00:00:00.000Z',{publisher:'bob',hasInstallScript:false}),version('pkg','1.5.0',at(1),{publisher:'alice',hasInstallScript:true,provenance:false})];
 const cache={schemaVersion:1,pkg:'pkg',source:'https://example.invalid/registry',fetchedAt:at(30),sourceSha256:'a'.repeat(64),versions:records};
 const compact=compactForWindow(cache,at(0),at(30));assert(compact.versions.length<records.length);
 const results=[];for(const input of [records,compact.versions]){const c=Database.open(':memory:').connect();populateGraph(c,input,[],'same');results.push(detect(c,{asOf:at(30)}).findings.filter(f=>f.version==='pkg@1.5.0'));}
 assert.deepEqual(results[0],results[1]);
 assert.throws(()=>compactForWindow(cache,at(0),at(30),30),/insufficient/);
});

test('sourced incident-A event sampling matches literal replay ticks',async()=>{
 const {loadDataset}=await import('@patient-zero/ingest');
 const data=await loadDataset('data/replay/manifest.json','bench/incidents/chalk-debug-2025-09.json'),config=detectionConfigSchema.parse({});
 const c=Database.open(':memory:').connect();populateGraph(c,data.versions,[data.incident],data.hash);
 const inWindow=new Set(data.versions.filter(v=>v.publishedAt!==null&&v.publishedAt>=data.incident.start&&v.publishedAt<data.incident.end).map(versionId)),literal=new Map();
 for(let time=Date.parse(data.incident.start)-3600000;time<=Date.parse(data.incident.end);time+=15*60000){
  const tick=new Date(time).toISOString();for(const f of detect(c,{asOf:tick,config}).findings)if(inWindow.has(f.version)&&f.score>=config.medium&&!literal.has(f.version))literal.set(f.version,tick);
 }
 const sampled=evaluateDataset(data,config,15);assert.deepEqual(new Map(sampled.firstDetections.map(v=>[v.version,v.tick])),literal);
});

test('tuning reads only incident A, freezes without overwrite, and rejects changed fingerprints before held-out access',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {digest}=await import('@patient-zero/core');const {tuneAndFreeze,runBenchmark}=await import('../dist/index.js');
 const dir=await mkdtemp(join(tmpdir(),'pz-freeze-'));
 try{
  const d=dataset([version('training','1.0.0',at(1))],[{pkg:'training',semver:'1.0.0',advisoryId:'IOC:training',source:'https://example.invalid/a',publishedAt:null}]);d.incident.role='tuning';d.incident.schemaVersion=1;
  const cache={schemaVersion:1,pkg:'training',source:'https://example.invalid/cache',fetchedAt:at(30),sourceSha256:'a'.repeat(64),versions:d.versions};
  const bytes=JSON.stringify(cache),sha=digest(bytes);const {mkdir}=await import('node:fs/promises');await mkdir(join(dir,'cache'));
  await writeFile(join(dir,'cache',`${sha}.json`),bytes);const incidentBytes=JSON.stringify(d.incident),incident=join(dir,'incident.json');await writeFile(incident,incidentBytes);
  const manifest=join(dir,'manifest.json');await writeFile(manifest,JSON.stringify({schemaVersion:1,incident:d.incident.slug,incidentSha256:digest(incidentBytes),packages:[{pkg:'training',file:`${sha}.json`,sha256:sha}]}));
  const spec=join(dir,'spec.json'),frozen=join(dir,'frozen.json');await writeFile(spec,JSON.stringify({schemaVersion:1,stepMinutes:15,training:{manifest,incident},heldOut:{manifest:'/must-not-read/heldout',incident:'/must-not-read/b'},control:{manifest:'/must-not-read/control',incident:'/must-not-read/c'},cohort:'/must-not-read/cohort',candidateBurstPackages:[5],candidateMedium:[3]}));
  await tuneAndFreeze(spec,frozen);await assert.rejects(tuneAndFreeze(spec,frozen),/EEXIST/);
  const profile=JSON.parse(await readFile(frozen,'utf8'));profile.codeHash='0'.repeat(64);await writeFile(frozen,JSON.stringify(profile));
  await assert.rejects(runBenchmark(spec,frozen,dir),/fingerprint mismatch/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
