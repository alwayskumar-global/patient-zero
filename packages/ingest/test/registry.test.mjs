import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePackument,mergeReconstruction} from '../dist/index.js';
import {version,at} from '../../../fixtures/synthetic.mjs';
async function* chunks(value,size=7){const bytes=Buffer.from(typeof value==='string'?value:JSON.stringify(value)); for(let i=0;i<bytes.length;i+=size) yield bytes.subarray(i,i+size);}
const packument=()=>({name:'test-pkg',time:{created:at(0),'1.0.0':at(0),'1.1.0':at(1),'1.2.0':at(2)},maintainers:[{name:'wrong-current-maintainer'}],readme:'discard',versions:{
 '1.0.0':{name:'test-pkg',version:'1.0.0',_npmUser:{name:'historical'},scripts:{test:'never execute this'},dependencies:{dep:'^1.0.0'},dist:{unpackedSize:42,attestations:{provenance:{predicateType:'https://slsa.dev/provenance/v1'}}}},
 '1.2.0':{_npmUser:{name:'GitHub Actions',trustedPublisher:{id:'github'},approver:{name:'human'}},scripts:{postinstall:'do not run'},dist:{}},
}});

test('chunked normalization keeps per-version publishers, script flags and attestations; removed manifests stay unknown',async()=>{
 const result=await normalizePackument('test-pkg',chunks(packument()),at(30));
 const first=result.versions[0], missing=result.versions[1], oidc=result.versions[2];
 assert.equal(first.publisher,'historical'); assert.equal(first.hasInstallScript,false); assert.equal(first.provenance,true);
 assert.equal(missing.semver,'1.1.0'); assert.equal(missing.publishedAt,at(1)); assert.equal(missing.hasInstallScript,null); assert.equal(missing.publisher,null);
 assert.equal(oidc.publisher,'human'); assert.equal(oidc.hasInstallScript,true); assert.equal(oidc.provenance,false);
 assert(!JSON.stringify(result).includes('never execute')); assert(!JSON.stringify(result).includes('do not run'));
 assert(!JSON.stringify(result).includes('wrong-current-maintainer'));
});

test('stream rejects truncated/wrong identity/oversized metadata and invalid dates',async()=>{
 await assert.rejects(normalizePackument('test-pkg',chunks('{"name":"test-pkg",'),at(30)));
 await assert.rejects(normalizePackument('other-pkg',chunks(packument()),at(30)),/identity/);
 await assert.rejects(normalizePackument('test-pkg',chunks(packument()),at(30),20),/exceeds/);
 const bad=packument(); bad.time['1.0.0']='not-a-date';
 await assert.rejects(normalizePackument('test-pkg',chunks(bad),at(30)));
});

test('removed publication timestamps and unknown OIDC publisher remain distinct from known metadata',async()=>{
 const p=packument(); delete p.time['1.0.0']; delete p.versions['1.2.0']._npmUser.approver;
 const r=await normalizePackument('test-pkg',chunks(p),at(30));
 assert.equal(r.versions[0].publishedAt,null); assert.equal(r.versions[2].publisher,null);
});

test('reconstruction fills only unknown fields and refuses conflicting known metadata',()=>{
 const original=version('pkg','1.0.0',at(0),{publisher:null,hasInstallScript:null});
 const patch=version('pkg','1.0.0',at(0),{publisher:'reported',hasInstallScript:null});
 patch.evidence.publisher.kind='report';
 const result=mergeReconstruction(original,patch);
 assert.equal(result.publisher,'reported'); assert.equal(result.evidence.publisher.kind,'report'); assert.equal(result.hasInstallScript,null);
 assert.equal(original.publisher,null);
 assert.throws(()=>mergeReconstruction(result,version('pkg','1.0.0',at(0),{publisher:'conflict'})),/Conflicting/);
});
