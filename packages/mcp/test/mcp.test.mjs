import {test} from 'node:test';import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createAnalysis,parseToolLockfile} from '../dist/index.js';
import {spawnSync} from 'node:child_process';import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,utimesSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
import {version,at} from '../../../fixtures/synthetic.mjs';import {locked,lockfile} from '../../../fixtures/locked.mjs';import {parseLockfile} from '../../core/dist/index.js';
const root=resolve('.');
const lock=v=>lockfile({'':{dependencies:{clean:v}},'node_modules/clean':locked('clean',v)});
async function protocol(run,extra=[]){
 const client=new Client({name:'patient-zero-test',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['--import',resolve('tests/deny-network.mjs'),resolve('packages/cli/dist/index.js'),'mcp','--store',resolve('patient-zero.rl'),...extra],cwd:root,stderr:'pipe'});
 let stderr='';transport.stderr?.on('data',chunk=>stderr+=chunk);
 try{await client.connect(transport);await run(client);assert.equal(stderr,'');}finally{await client.close();}
}
test('real stdio MCP lists exactly three readonly tools and returns sourced block paths without network or mutation',async()=>{
 const before=readFileSync('patient-zero.rl');
 await protocol(async client=>{
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['blast_radius','safe_upgrade_path','why_blocked']);assert(tools.tools.every(t=>t.annotations.readOnlyHint&&t.annotations.destructiveHint===false&&t.annotations.openWorldHint===false));
  const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert(!r.isError,JSON.stringify(r));assert.deepEqual(JSON.parse(r.content[0].text),r.structuredContent);return r.structuredContent;};
  const why=await call('why_blocked',{package:'chalk',version:'5.6.1'});assert.equal(why.status,'finding');assert(why.finding.path.some(p=>p.rule==='R1'));assert.equal(why.lockfile.exitCode,1);assert.deepEqual(why.lockfile.blocked[0].dependencyPath.map(p=>p.label),['incident-replay-example','chalk@5.6.1']);
  const blast=await call('blast_radius',{package:'chalk',version:'5.6.1'});assert.equal(blast.targets[0].publisher,'qix');assert(blast.sharedPublisherCount>=17);assert(blast.lockfile.impacts.some(i=>i.location===''));assert.equal(blast.lockfile.targets[0],'node_modules/chalk');
  const upgrade=await call('safe_upgrade_path',{package:'chalk',fromVersion:'5.6.1'});assert.equal(upgrade.safe,false);assert.equal(upgrade.status,'no_verified_upgrade');assert(upgrade.reasons.some(r=>r.includes('candidate lockfile')));
  const masked=await call('why_blocked',{package:'chalk',version:'5.6.1',mode:'evidence'});assert.equal(masked.status,'incomplete');assert.equal(masked.record,null);
  const shai=await call('blast_radius',{package:'@ctrl/tinycolor',version:'4.1.1',asOf:'2025-09-20T00:00:00Z'});assert.equal(shai.unknownPublisherTargets,1);assert.equal(shai.sharedPublisherCount,0);
  const bad=await client.callTool({name:'why_blocked',arguments:{package:'chalk',version:'5.6.1',cypher:'DELETE (n)'}});assert.equal(bad.isError,true);
  const malformed=await client.callTool({name:'blast_radius',arguments:{package:'chalk',lockfile:'{}'}});assert.equal(malformed.isError,true);
  const after=await call('why_blocked',{package:'chalk',version:'5.6.1'});assert.equal(after.status,'finding','server continues after invalid input');
 },['--as-of','2025-09-08T14:00:00Z','--mode','retrospective','--lockfile',resolve('fixtures/lockfiles/chalk-v3.json')]);
 assert.deepEqual(readFileSync('patient-zero.rl'),before);
});

test('upgrade qualification requires an actual complete fresh candidate lock, verified origin, same root and newer version',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pz-mcp-')),store=join(dir,'fresh.rl');
 try{
  const records=[version('clean','1.0.0',at(0)),version('clean','1.1.0',at(1)),version('clean','1.2.0',at(2),{publisher:null}),version('unknown-publisher','1.0.0',at(1),{publisher:null})];
  const build=spawnSync(process.execPath,['--input-type=module','-e',`import {Database} from '@relate/relate';import {populateGraph} from './packages/core/dist/index.js';const c=Database.open(process.argv[1]).connect();populateGraph(c,JSON.parse(process.argv[2]),[],'test');c.query('MATCH (s:Store) SET s.gateCoverageJSON=$json',{json:JSON.stringify({schemaVersion:1,fullHistoryPackages:['clean'],projectedPackages:[]})});`,store,JSON.stringify(records)],{cwd:root,encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  const before=readFileSync(store),analysis=createAnalysis({store,lockfile:parseLockfile(lock('1.0.0')),asOf:at(30)});
  const input={package:'clean',fromVersion:'1.0.0',candidateLockfile:lock('1.1.0')};
  const pass=analysis.safeUpgradePath(input);assert.equal(pass.status,'candidate_policy_pass');assert.equal(pass.safe,false);assert.equal(pass.candidateAssessment.exitCode,0);assert.equal(pass.transition[0].to,'clean@1.1.0');
  for(const variation of [{mode:'retrospective'},{asOf:'2026-01-01T00:00:00Z'},{candidateLockfile:lock('1.0.0')},{candidateLockfile:lock('1.2.0')},{candidateLockfile:lock('2.0.0')},{fromVersion:'0.1.0'},{candidateLockfile:lock('1.1.0').replaceAll('test-app','other-app')}])assert.equal(analysis.safeUpgradePath({...input,...variation}).status,'no_verified_upgrade');
  const unknown=analysis.blastRadius({package:'unknown-publisher'});assert.equal(unknown.unknownPublisherTargets,1);assert.equal(unknown.sharedPublisherCount,0);
  assert.deepEqual(readFileSync(store),before);
  const stat=statSync(store);utimesSync(store,stat.atime,new Date(stat.mtimeMs+10000));assert.throws(()=>analysis.whyBlocked({package:'clean',version:'1.0.0'}),/restart/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('MCP rejects oversized and unsupported lockfiles before graph traversal',()=>{
 assert.throws(()=>parseToolLockfile('x'.repeat(1_800_001)),/1.8 MB/);
 assert.throws(()=>parseToolLockfile(JSON.stringify({lockfileVersion:3,packages:Object.fromEntries(Array.from({length:2002},(_,i)=>[`node_modules/p${i}`,{}]))})),/2,000/);
 assert.throws(()=>parseToolLockfile('{"lockfileVersion":1}'));
});
