import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {loadDataset} from '../packages/ingest/dist/index.js';
const root=resolve('.');
const cli=(args,env={})=>spawnSync(process.execPath,['--import',resolve('tests/deny-network.mjs'),'packages/cli/dist/index.js',...args],{cwd:root,encoding:'utf8',timeout:60000,env:{...process.env,PZ_AS_OF:'',...env}});

test('sourced incident-A cache rebuild, detection, explain and replay work with fetch disabled',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pz-cli-')), store=join(dir,'incident.rl');
 try {
  const build=cli(['build-store','--from-cache','--store',store]);
  assert.equal(build.status,0,build.stderr); assert(JSON.parse(build.stdout).versions>18);
  const duplicate=cli(['build-store','--from-cache','--store',store]);
  assert.equal(duplicate.status,2); assert.match(duplicate.stderr,/EEXIST/);
  const args=['--store',store,'--as-of','2025-09-08T14:00:00Z','--json'];
  const detection=cli(['detect',...args]); assert.equal(detection.status,0,detection.stderr);
  const result=JSON.parse(detection.stdout), chalk=result.findings.find(f=>f.version==='chalk@5.6.1');
  assert(chalk?.reasons.some(r=>r.rule==='R1')); assert(chalk.path.every(s=>Object.keys(s.evidence).length>0));
  assert(result.warnings.some(w=>w.includes('cannot establish pre-advisory')));
  const explain=cli(['explain','chalk@5.6.1',...args,'--mode','retrospective']); assert.equal(explain.status,0,explain.stderr); assert.equal(JSON.parse(explain.stdout).findings.length,1);
  const evidence=cli(['detect',...args,'--mode','evidence']); assert.equal(evidence.status,0,evidence.stderr); assert.equal(JSON.parse(evidence.stdout).coverage.visibleVersions,0);
  const replay=cli(['replay','chalk-debug-2025-09','--store',store,'--step-minutes','60','--speed','1000000','--json']);
  assert.equal(replay.status,0,replay.stderr); assert.match(replay.stdout,/chalk@5.6.1/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('CLI rejects unsupported commands, missing stores, unknown options, malformed dates and replay path traversal',()=>{
 for(const args of [ ['unimplemented-command'],['detect','--as-of','2025-09-08T14:00:00Z','--store','/definitely-missing/patient-zero.rl'],['doctor','--store','x.rl'],['detect','--as-of','yesterday'],['replay','../../etc/passwd'],['replay','chalk-debug-2025-09','--step-minutes','0'],['replay','chalk-debug-2025-09','--speed','0'] ]) {
  const result=cli(args); assert.equal(result.status,2,`${args}: ${result.stdout} ${result.stderr}`);
 }
 const result=cli(['detect','--store','/missing.rl'],{PZ_AS_OF:'2025-09-08T14:00:00Z'}); assert.equal(result.status,2);
});

test('cache checksums, incident checksums and declared coverage fail closed',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pz-integrity-'));
 try {
  mkdirSync(join(dir,'cache')); const manifest=JSON.parse(readFileSync('data/replay/manifest.json','utf8'));
  cpSync('data/replay/cache',join(dir,'cache'),{recursive:true});
  writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
  const target=join(dir,'cache',manifest.packages[0].file); writeFileSync(target,readFileSync(target,'utf8')+' ');
  await assert.rejects(loadDataset(join(dir,'manifest.json'),'bench/incidents/chalk-debug-2025-09.json'),/checksum/);
  manifest.incidentSha256='0'.repeat(64); writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest));
  await assert.rejects(loadDataset(join(dir,'manifest.json'),'bench/incidents/chalk-debug-2025-09.json'),/integrity/);
  const original=JSON.parse(readFileSync('data/replay/manifest.json','utf8')); original.packages.pop(); writeFileSync(join(dir,'manifest.json'),JSON.stringify(original));
  await assert.rejects(loadDataset(join(dir,'manifest.json'),'bench/incidents/chalk-debug-2025-09.json'),/coverage/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('gate CLI returns 1/0/2 with exact paths and no network or store mutation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pz-gate-cli-'));
 try{
  const before=readFileSync('patient-zero.rl');
  const blocked=cli(['gate','--lockfile','fixtures/lockfiles/chalk-v3.json','--mode','retrospective','--as-of','2025-09-08T14:00:00Z','--json']);
  assert.equal(blocked.status,1,blocked.stderr);const result=JSON.parse(blocked.stdout);assert.equal(result.status,'blocked');assert.equal(result.blocked[0].dependencyPath.at(-1).label,'chalk@5.6.1');
  const clean={name:'demo-app',lockfileVersion:2,packages:{'':{name:'demo-app',dependencies:{chalk:'5.6.0'}},'node_modules/chalk':{version:'5.6.0',resolved:'https://registry.npmjs.org/chalk/-/chalk-5.6.0.tgz'}}};
  const file=join(dir,'lock.json');writeFileSync(file,JSON.stringify(clean));
  const pass=cli(['gate','--lockfile',file,'--mode','retrospective','--as-of','2025-08-18T00:00:00Z','--json']);assert.equal(pass.status,0,pass.stderr||pass.stdout);assert.equal(JSON.parse(pass.stdout).status,'passed');
  clean.packages['node_modules/chalk'].version='99.0.0';clean.packages['node_modules/chalk'].resolved='https://registry.npmjs.org/chalk/-/chalk-99.0.0.tgz';clean.packages[''].dependencies.chalk='99.0.0';writeFileSync(file,JSON.stringify(clean));
  const missing=cli(['gate','--lockfile',file,'--json']);assert.equal(missing.status,2,missing.stderr);assert.equal(JSON.parse(missing.stdout).status,'incomplete');
  const stale=cli(['gate','--lockfile','fixtures/lockfiles/chalk-v3.json','--as-of','2027-01-01T00:00:00Z','--json']);assert.equal(stale.status,2);assert(JSON.parse(stale.stdout).gaps.some(g=>g.reason.includes('Stale')));
  assert.deepEqual(readFileSync('patient-zero.rl'),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('explain defaults to current evidence time without requiring a historical freeze',()=>{
 const before=Date.now(),result=cli(['explain','chalk@5.6.1','--json']);assert.equal(result.status,0,result.stderr);const parsed=JSON.parse(result.stdout);assert.equal(parsed.mode,'evidence');assert(Date.parse(parsed.asOf)>=before&&Date.parse(parsed.asOf)<=Date.now());
});
