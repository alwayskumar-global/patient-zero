import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '@relate/relate';
import { populateGraph, detect, persistFindings, attachResolvedDependencies, initializeSchema } from '../dist/index.js';
import { version,at,old } from '../../../fixtures/synthetic.mjs';
const graph = (versions, incidents=[]) => { const c=Database.open(':memory:').connect(); populateGraph(c,versions,incidents,'synthetic'); return c; };
const run = (c,asOf=at(30),config={},extra={}) => detect(c,{asOf,config,...extra});
const rules = finding => finding?.reasons.map(r=>r.rule) ?? [];

test('R1 counts distinct packages; fires at threshold time and freezes future releases',()=>{
 const c=graph(Array.from({length:5},(_,i)=>version(`pkg-${i}`,'1.0.0',at(i),{publisher:'burst'})));
 assert.equal(run(c,at(3)).findings.length,0);
 const result=run(c,at(4));
 assert.equal(result.findings.length,5);
 for(const f of result.findings) { assert.deepEqual(rules(f),['R1']); assert.equal(f.at,at(4)); assert.equal(f.score,3); }
 assert.deepEqual(run(c,at(3)).findings,[],'later query must not contaminate earlier replay');
});

test('R1 ignores repeated releases of one package and releases outside the window',()=>{
 const c=graph([version('one','1.0.0',at(0)),version('one','1.0.1',at(1)),version('one','1.0.2',at(2)),version('two','1.0.0',at(20))]);
 assert(!run(c,at(25),{burstPackages:2,windowMinutes:10}).findings.some(f=>rules(f).includes('R1')));
});

test('R2/R3/R4 compare publication predecessor, not semver order or future versions',()=>{
 const c=graph([version('delta','2.0.0',old),version('delta','1.0.0',at(0),{publisher:'intruder',hasInstallScript:true,provenance:false}),version('delta','3.0.0',at(40))]);
 const f=run(c).findings.find(f=>f.version==='delta@1.0.0');
 assert.deepEqual(rules(f),['R2','R3','R4']); assert.equal(f.score,5); assert.equal(f.severity,'high');
 assert(!run(c).findings.some(f=>f.version==='delta@3.0.0'));
});

test('unknown predecessor scripts/provenance do not turn into false deltas',()=>{
 const c=graph([version('delta','1.0.0',old),version('delta','1.1.0',at(0),{hasInstallScript:null,provenance:null,publisher:null}),version('delta','1.2.0',at(1),{hasInstallScript:true,provenance:false,publisher:'new'})]);
 const f=run(c).findings.find(f=>f.version==='delta@1.2.0');
 assert(!rules(f).some(r=>['R2','R3','R4'].includes(r)));
});

test('R3 identifies dormant publishers only within known history; initial release is not new-publisher evidence',()=>{
 const c=graph([version('dormant','1.0.0',old),version('dormant','1.1.0',at(0)),version('initial','1.0.0',at(1),{publisher:'bob'})]);
 assert(rules(run(c).findings.find(f=>f.version==='dormant@1.1.0')).includes('R3'));
 assert(!run(c).findings.some(f=>f.version==='initial@1.0.0'));
});

test('evidence-time mode hides later-observed fields while retrospective mode exposes reconstruction',()=>{
 const versions=[version('delta','1.0.0',old),version('delta','1.1.0',at(0),{publisher:'intruder',hasInstallScript:true,provenance:false},at(10))];
 const c=graph(versions);
 assert.equal(run(c,at(5)).findings.length,1);
 assert.equal(run(c,at(5),{},{mode:'evidence'}).findings.length,0);
 assert.equal(run(c,at(15),{},{mode:'evidence'}).findings.length,1);
 assert.equal(run(c,at(15),{},{mode:'evidence'}).findings[0].at,at(10),'evidence-time signals must not be backdated to publication');
 // Publication is visible but the new script alone was only observed later.
 const partial=version('partial','1.1.0',at(0),{hasInstallScript:true});
 partial.evidence.hasInstallScript.observedAt=at(10);
 const p=graph([version('partial','1.0.0',old),partial]);
 assert(!rules(run(p,at(5),{},{mode:'evidence'}).findings[0]).includes('R2'));
});

test('advisory labels never influence findings',()=>{
 const records=[version('labelled','1.0.0',at(0))];
 const incident={slug:'fake',role:'tuning',start:at(0),end:at(30),advisoryPublishedAt:at(10),labels:[{pkg:'labelled',semver:'1.0.0',advisoryId:'MAL-test',source:'https://example.invalid/label',publishedAt:at(10)}]};
 const c=graph(records,[incident]), before=run(c);
 c.query('MATCH (a:Advisory) DETACH DELETE a');
 assert.deepEqual(run(c),before);
 assert.equal(before.findings.length,0);
});

function taintGraph() {
 return graph([
   version('seed','1.0.0',old),version('seed','1.1.0',at(0),{publisher:'worm',hasInstallScript:true,provenance:false}),
   version('sibling','1.0.0',old),version('sibling','1.1.0',at(1),{publisher:'worm'}),
   version('consumer','1.0.0',at(2),{publisher:'other',dependencies:{sibling:'^1.0.0'}}),
   version('unresolved','1.0.0',at(3),{publisher:'other',dependencies:{seed:'*'}}),
   version('late','1.0.0','2025-09-08T15:00:00.000Z',{publisher:'worm'}),
 ]);
}

test('R5 propagates publisher taint with decay, recording chain and avoiding package-range guesses',()=>{
 const c=taintGraph(); const result=run(c,at(30),{burstPackages:99});
 const f=result.findings.find(f=>f.version==='sibling@1.1.0');
 assert.equal(f.score,3.5); assert.deepEqual(rules(f),['R5']);
 assert.deepEqual([...new Set(f.path.map(s=>s.version))],['seed@1.1.0','sibling@1.1.0']);
 assert.equal(f.taintedVia.length,1);
 assert(!result.findings.some(f=>f.version==='consumer@1.0.0'));
 assert(!run(c,'2025-09-08T16:00:00Z',{burstPackages:99}).findings.some(f=>f.version==='late@1.0.0'));
});

test('R5 exact lockfile dependency taint is scoped, bounded and acyclic',()=>{
 const c=taintGraph(), hash='a'.repeat(64);
 attachResolvedDependencies(c,{hash,repo:'synthetic',builtAt:at(3),versions:['seed@1.1.0','sibling@1.1.0','consumer@1.0.0'],edges:[{from:'consumer@1.0.0',to:'sibling@1.1.0'},{from:'seed@1.1.0',to:'consumer@1.0.0'}]});
 const result=run(c,at(30),{burstPackages:99},{lockfileHash:hash});
 const f=result.findings.find(f=>f.version==='consumer@1.0.0');
 assert.equal(f.score,2.45); assert.equal(f.path.filter(s=>s.rule==='R5').length,2);
 assert(!run(c,at(30),{burstPackages:99,maxHops:1},{lockfileHash:hash}).findings.some(f=>f.version==='consumer@1.0.0'));
 assert.throws(()=>run(c,at(30),{},{lockfileHash:'b'.repeat(64)}),/outside store coverage/);
 assert.throws(()=>run(c,at(2),{},{lockfileHash:hash,mode:'evidence'}),/not available/);
 assert.throws(()=>attachResolvedDependencies(c,{hash:'b'.repeat(64),repo:'x',builtAt:at(3),versions:['missing@1.0.0'],edges:[]}),/outside store coverage/);
});

test('later seed-strength changes never backdate a stronger propagated finding',()=>{
 const c=graph([version('seed','1.0.0',old),version('seed','1.1.0',at(0),{publisher:'worm',hasInstallScript:true}),version('sibling','1.0.0',at(1),{publisher:'worm'}),version('third','1.0.0',at(2),{publisher:'worm'})]);
 const earlier=run(c,at(1),{burstPackages:3}).findings.find(f=>f.version==='sibling@1.0.0');
 assert.equal(earlier.score,2.1);assert.equal(earlier.scoreAt,at(1));assert.equal(earlier.flaggedAt,null);
 const later=run(c,at(2),{burstPackages:3}).findings.find(f=>f.version==='sibling@1.0.0');
 assert.equal(later.score,4.2);assert.equal(later.scoreAt,at(2));assert.equal(later.flaggedAt,at(2));
 assert(later.path.every(s=>s.at<=later.scoreAt));
});

test('findings persist with ON/TRIGGERED/TAINTED_VIA edges and repeated runs are idempotent',()=>{
 const c=taintGraph(), result=run(c,at(30),{burstPackages:99});
 persistFindings(c,result); persistFindings(c,result);
 assert.equal(Number(c.query('MATCH (f:Finding) RETURN count(f) AS n').single().n),result.findings.length);
 assert.equal(Number(c.query('MATCH (:Finding)-[:TAINTED_VIA]->(:Finding) RETURN count(*) AS n').single().n),1);
 assert.deepEqual(run(c,at(30),{burstPackages:99}),result,'stored findings must not become detector inputs');
 initializeSchema(c);
 assert.throws(()=>populateGraph(c,[],[],'x'),/nonempty/);
});

test('invalid timestamps/config and stores without schema fail loudly',()=>{
 const c=graph([]);
 assert.throws(()=>run(c,'yesterday'));
 assert.throws(()=>run(c,at(30),{windowMinutes:0}));
 assert.throws(()=>run(c,at(30),{medium:10,high:5}));
 assert.throws(()=>run(Database.open(':memory:').connect()),/schema/);
});
