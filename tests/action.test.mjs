import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,copyFileSync,symlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const root=resolve('.');
test('Action runner preserves gate exit 0/1/2, exact paths, escaped summaries and private local reports',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pz-action-')),before=readFileSync('patient-zero.rl');
 copyFileSync('fixtures/lockfiles/chalk-v3.json',join(dir,'chalk.json'));
 try{
  const run=(inputs={})=>{const out=join(dir,'outputs'),summary=join(dir,'summary');writeFileSync(out,'');writeFileSync(summary,'');const r=spawnSync(process.execPath,['scripts/action.mjs'],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,GITHUB_WORKSPACE:dir,RUNNER_TEMP:dir,GITHUB_OUTPUT:out,GITHUB_STEP_SUMMARY:summary,PZ_ACTION_LOCKFILE:'chalk.json',PZ_ACTION_STORE:'',PZ_ACTION_CONFIG:'',PZ_ACTION_MODE:'retrospective',PZ_ACTION_AS_OF:'2025-09-08T14:00:00Z',PZ_ACTION_FAIL_ON:'medium',PZ_ACTION_MAX_AGE:'168',...inputs}});const outputs=Object.fromEntries(readFileSync(out,'utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));return{...r,outputs,report:JSON.parse(readFileSync(outputs.report,'utf8')),summary:readFileSync(summary,'utf8')};};
  const block=run();assert.equal(block.status,1,block.stderr);assert.equal(block.outputs.status,'blocked');assert.equal(block.report.blocked[0].dependencyPath.at(-1).label,'chalk@5.6.1');assert.match(block.summary,/Experimental metadata policy/);
  const pass=run({PZ_ACTION_AS_OF:'2025-08-18T00:00:00Z',PZ_ACTION_LOCKFILE:'clean.json'});
  // Missing files remain incomplete; no target source code is executed.
  assert.equal(pass.status,2);
  const clean=join(dir,'clean.json');
  try{writeFileSync(clean,JSON.stringify({name:'test-app',lockfileVersion:3,packages:{'':{name:'test-app',dependencies:{chalk:'5.6.0'}},'node_modules/chalk':{version:'5.6.0',resolved:'https://registry.npmjs.org/chalk/-/chalk-5.6.0.tgz'}}}));const allowed=run({PZ_ACTION_AS_OF:'2025-08-18T00:00:00Z',PZ_ACTION_LOCKFILE:'clean.json'});assert.equal(allowed.status,0,JSON.stringify(allowed.report));assert.equal(allowed.outputs['exit-code'],'0');}finally{rmSync(clean,{force:true});}
  const stale=run({PZ_ACTION_MODE:'evidence',PZ_ACTION_AS_OF:'2027-01-01T00:00:00Z'});assert.equal(stale.status,2);assert.equal(stale.outputs.status,'incomplete');
  const invalid=run({PZ_ACTION_FAIL_ON:'high; <script>alert(1)</script>'});assert.equal(invalid.status,2);assert.equal(invalid.report.error,'Invalid action policy input.');assert(!invalid.summary.includes('<script>'));
  const outside=run({PZ_ACTION_LOCKFILE:'../outside.json'});assert.equal(outside.status,2);
  const absolute=run({PZ_ACTION_LOCKFILE:resolve('fixtures/lockfiles/chalk-v3.json')});assert.equal(absolute.status,2);
  symlinkSync(resolve('fixtures/lockfiles/chalk-v3.json'),join(dir,'linked.json'));const linked=run({PZ_ACTION_LOCKFILE:'linked.json'});assert.equal(linked.status,2);assert.match(linked.report.error,/escapes/);

  assert.deepEqual(readFileSync('patient-zero.rl'),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
