import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ingestLockfile,loadLockfileSnapshot} from '../dist/index.js';
import {parseLockfile} from '@patient-zero/core';
import {locked,lockfile} from '../../../fixtures/locked.mjs';

test('explicit lockfile ingestion fetches public metadata only and its snapshot verifies integrity',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'pz-snapshot-')),manifest=join(dir,'manifest.json'),calls=[];
 try{
  t.mock.method(globalThis,'fetch',async(url)=>{calls.push(String(url));return new Response(JSON.stringify({name:'dep',time:{'1.0.0':'2026-11-16T00:00:00.000Z'},versions:{'1.0.0':{name:'dep',version:'1.0.0',_npmUser:{name:'publisher'},scripts:{test:'this body must not be retained'}}}}));});
  const input=parseLockfile(lockfile({'':{name:'private-project',dependencies:{dep:'1.0.0'}},'node_modules/dep':locked('dep')}));
  await ingestLockfile(input,manifest);const data=await loadLockfileSnapshot(manifest);
  assert.equal(data.versions.length,1);assert.deepEqual(calls,['https://registry.npmjs.org/dep']);
  const bytes=await readFile(manifest,'utf8');assert(!bytes.includes('private-project'));assert(!JSON.stringify(data).includes('this body'));
  const {spawnSync}=await import('node:child_process');const store=join(dir,'snapshot.rl'),lockPath=join(dir,'package-lock.json');
  await writeFile(lockPath,lockfile({'':{name:'private-project',dependencies:{dep:'1.0.0'}},'node_modules/dep':locked('dep')}));
  const call=args=>spawnSync(process.execPath,['--import','./tests/deny-network.mjs','packages/cli/dist/index.js',...args],{encoding:'utf8',timeout:30000});
  const built=call(['build-store','--from-cache','--manifest',manifest,'--store',store]);assert.equal(built.status,0,built.stderr);
  const assessed=call(['gate','--lockfile',lockPath,'--store',store,'--as-of','2026-11-17T00:00:00Z','--json']);assert.equal(assessed.status,0,assessed.stderr||assessed.stdout);
  assert.equal(JSON.parse(assessed.stdout).status,'passed');
  const entry=JSON.parse(bytes).packages[0],path=join(dir,'cache',entry.file);await writeFile(path,(await readFile(path,'utf8'))+' ');
  await assert.rejects(loadLockfileSnapshot(manifest),/checksum/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('malformed historical fields are represented as unknown, not guessed or removed from the package',async()=>{
 const {normalizePackument}=await import('../dist/index.js');
 async function* chunks(){yield Buffer.from(JSON.stringify({name:'old-package',time:{'1.0.0':'2020-01-01T00:00:00Z'},versions:{'1.0.0':{_npmUser:{name:''},scripts:{test:{invalid:true}},dependencies:{'../invalid':'*'}}}}));}
 const cache=await normalizePackument('old-package',chunks(),'2026-11-16T00:00:00Z');
 assert.equal(cache.versions[0].publisher,null);assert.equal(cache.versions[0].hasInstallScript,null);assert.equal(cache.versions[0].dependencies,null);assert.equal(cache.normalizationWarnings.length,3);
});
