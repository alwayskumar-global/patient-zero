import {spawnSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),cli=fileURLToPath(new URL('../packages/cli/dist/index.js',import.meta.url));
function run(args,expected=0){const child=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:60000});if(child.status!==expected)throw new Error(child.stderr||child.stdout||`Unexpected exit ${child.status}`);return child.stdout;}
console.log('Patient Zero — offline historical demo. No incident package is installed.\n');
console.log(run(['doctor']));
console.log(run(['replay','chalk-debug-2025-09','--step-minutes','60']));
console.log(run(['gate','--lockfile','fixtures/lockfiles/chalk-v3.json','--mode','retrospective','--as-of','2025-09-08T14:00:00Z'],1));
const results=JSON.parse(readFileSync(new URL('../bench/results.json',import.meta.url),'utf8'));
console.log('Frozen measured benchmark (not retuned):');
for(const row of results.rows)console.log(`${row.slug}: recall at end=${row.recallAtEnd===null?'unestablished':(row.recallAtEnd*100).toFixed(2)+'%'} (${row.truePositiveVersions}/${row.referenceVersions}); flagged=${row.flaggedWindowVersions}/${row.knownWindowPublishes}; control flags/1,000=${row.controlFlagsPer1000Publishes??'not applicable'}; first-public-advisory lead=${row.firstPublicLeadMinutes??'unverified'}`);
console.log('Production acceptance not met. Missing metadata is not a safety verdict.');
if(process.argv.includes('--no-ui'))process.exit(0);
console.log('\nOpen http://127.0.0.1:3000 — Replay, Gate, Lockfile, Explain and Benchmark. Stop another server on port 3000 first. Ctrl+C stops this demo.');
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/next/dist/bin/next',import.meta.url)),'dev',fileURLToPath(new URL('../web',import.meta.url)),'--hostname','127.0.0.1','--port','3000'],{cwd:root,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=2;});child.on('exit',code=>{process.exitCode=code??0;});
