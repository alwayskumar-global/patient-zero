import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from '@relate/relate';
import {parseLockfile,populateGraph,evaluateGate,propagateLockfileTaint,detect} from '../dist/index.js';
import {version,at,old} from '../../../fixtures/synthetic.mjs';
import {locked,lockfile} from '../../../fixtures/locked.mjs';
const graph=records=>{const c=Database.open(':memory:').connect();populateGraph(c,records,[],'synthetic');c.query('MATCH (s:Store) SET s.gateCoverageJSON=$json',{json:JSON.stringify({schemaVersion:1,fullHistoryPackages:[...new Set(records.map(v=>v.pkg))],projectedPackages:[]})});return c;};
const cleanLock=()=>parseLockfile(lockfile({'':{dependencies:{clean:'1.0.0'}},'node_modules/clean':locked('clean')}));

test('gate returns 0 only for fully covered, fresh evidence; unknown, stale and future evidence return 2',()=>{
 const c=graph([version('clean','1.0.0',at(0))]);
 assert.equal(evaluateGate(c,cleanLock(),{asOf:at(30)}).exitCode,0);
 assert.equal(evaluateGate(graph([]),cleanLock(),{asOf:at(30)}).exitCode,2);
 assert.equal(evaluateGate(c,cleanLock(),{asOf:'2026-01-01T00:00:00Z'}).exitCode,2);
 assert.equal(evaluateGate(c,cleanLock(),{asOf:'2025-09-08T12:00:00Z'}).exitCode,2);
 const unknown=graph([version('clean','1.0.0',at(0),{hasInstallScript:null})]);
 assert.equal(evaluateGate(unknown,cleanLock(),{asOf:at(30)}).exitCode,2);
});

test('gate blocks with an exact root path, rule evidence, severity policy and read-only behavior',()=>{
 const c=graph([version('bad','1.0.0',old),version('bad','1.1.0',at(0),{publisher:'intruder',hasInstallScript:true,provenance:false}),version('wrapper','1.0.0',at(1),{publisher:'other',dependencies:{bad:'1.1.0'}})]);
 const lock=parseLockfile(lockfile({'':{dependencies:{wrapper:'1.0.0'}},'node_modules/wrapper':locked('wrapper','1.0.0',{dependencies:{bad:'1.1.0'}}),'node_modules/wrapper/node_modules/bad':locked('bad','1.1.0')}));
 const before=c.query('MATCH (n) RETURN count(n) AS n').single().n;
 const result=evaluateGate(c,lock,{asOf:at(30)});
 assert.equal(result.exitCode,1);assert.equal(result.status,'blocked');
 const bad=result.blocked.find(b=>b.version==='bad@1.1.0');
 assert.deepEqual(bad.dependencyPath.map(p=>p.label),['test-app','wrapper@1.0.0','bad@1.1.0']);
 assert(bad.evidencePath.some(s=>s.rule==='R2'));assert(result.impacts.some(i=>i.location==='node_modules/wrapper'&&i.chain.length===2));
 assert.equal(c.query('MATCH (n) RETURN count(n) AS n').single().n,before,'gate must not mutate store');
 assert.equal(evaluateGate(c,lock,{asOf:at(30),failOn:'high'}).exitCode,1);
});

test('a decisive block survives unknown auxiliary metadata, while mixed missing package coverage remains incomplete',()=>{
 const records=Array.from({length:5},(_,i)=>version(`burst-${i}`,'1.0.0',at(i),{publisher:'burst',hasInstallScript:null,provenance:null,dependencies:null}));
 const c=graph(records),lock=parseLockfile(lockfile({'':{dependencies:{'burst-0':'*'}},'node_modules/burst-0':locked('burst-0')}));
 assert.equal(evaluateGate(c,lock,{asOf:at(30)}).exitCode,1);
 assert.equal(evaluateGate(c,lock,{asOf:at(30),failOn:'high'}).exitCode,2,'unknown low-policy evidence cannot become an allow');
 const mixed=parseLockfile(lockfile({'':{dependencies:{'burst-0':'*',unknown:'*'}},'node_modules/burst-0':locked('burst-0'),'node_modules/unknown':locked('unknown')}));
 assert.equal(evaluateGate(c,mixed,{asOf:at(30)}).exitCode,2);
});

test('instance taint never creates a path between duplicate version installations in different subtrees',()=>{
 const c=graph([version('bad','1.0.0',old),version('bad','1.1.0',at(0),{publisher:'intruder',hasInstallScript:true,provenance:false})]);
 const detection=detect(c,{asOf:at(30)});
 const parsed=parseLockfile(lockfile({'':{dependencies:{left:'*',right:'*'}},
 'node_modules/left':locked('left','1.0.0',{dependencies:{shared:'1.0.0'}}),
 'node_modules/right':locked('right','1.0.0',{dependencies:{shared:'1.0.0'}}),
 'node_modules/left/node_modules/shared':locked('shared','1.0.0',{dependencies:{bad:'1.1.0'}}),
 'node_modules/left/node_modules/shared/node_modules/bad':locked('bad','1.1.0'),
 'node_modules/right/node_modules/shared':locked('shared'),
 }));
 const impacts=propagateLockfileTaint(parsed,detection.findings,detection.config);
 assert(impacts.some(i=>i.location==='node_modules/left/node_modules/shared'));
 assert(!impacts.some(i=>i.location.startsWith('node_modules/right')));
});

test('projected or unmarked stores cannot authorize a policy pass',()=>{
 const c=graph([version('clean','1.0.0',at(0))]);
 c.query('MATCH (s:Store) SET s.gateCoverageJSON=$json',{json:JSON.stringify({schemaVersion:1,fullHistoryPackages:[],projectedPackages:['clean']})});
 assert.equal(evaluateGate(c,cleanLock(),{asOf:at(30)}).exitCode,2);
 c.query('MATCH (s:Store) REMOVE s.gateCoverageJSON');
 assert.equal(evaluateGate(c,cleanLock(),{asOf:at(30)}).exitCode,2);
});

test('unknown evidence needed for an applicable predecessor rule prevents an allow',()=>{
 const c=graph([version('clean','0.9.0',at(0),{hasInstallScript:null}),version('clean','1.0.0',at(1),{hasInstallScript:true})]);
 const result=evaluateGate(c,cleanLock(),{asOf:at(30)});
 assert.equal(result.exitCode,2);assert(result.gaps.some(g=>g.reason.includes('Required history')&&g.reason.includes('hasInstallScript')));
});

test('ambiguous same-time publication predecessors cannot authorize an allow',()=>{
 const c=graph([version('clean','0.9.0',at(0)),version('clean','1.0.0',at(0),{hasInstallScript:true})]);
 const result=evaluateGate(c,cleanLock(),{asOf:at(30)});assert.equal(result.exitCode,2);assert(result.gaps.some(g=>g.reason.includes('same-time')));
});
