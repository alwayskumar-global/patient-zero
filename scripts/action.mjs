import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,realpathSync,mkdtempSync} from 'node:fs';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const actionRoot=fileURLToPath(new URL('..',import.meta.url));
const workspace=realpathSync(process.env.GITHUB_WORKSPACE??process.cwd());
const temp=process.env.RUNNER_TEMP;
if(!temp)throw new Error('RUNNER_TEMP is required.');
const report=join(mkdtempSync(join(temp,'patient-zero-')),'gate.json');
let result={schemaVersion:1,status:'incomplete',exitCode:2,error:'Assessment not completed.'};
function inputPath(input){
 if(isAbsolute(input))throw new Error('Action input paths must be relative to GITHUB_WORKSPACE.');
 const path=realpathSync(resolve(workspace,input)),rel=relative(workspace,path);
 if(rel==='..'||rel.startsWith(`..${process.platform==='win32'?'\\':'/'}`)||isAbsolute(rel))throw new Error('Action input path escapes GITHUB_WORKSPACE.');return path;
}
try{
 const mode=process.env.PZ_ACTION_MODE||'evidence',failOn=process.env.PZ_ACTION_FAIL_ON||'medium',age=process.env.PZ_ACTION_MAX_AGE||'168';
 if(!['evidence','retrospective'].includes(mode)||!['medium','high'].includes(failOn)||!Number.isFinite(Number(age))||Number(age)<=0)throw new Error('Invalid action policy input.');
 const args=[fileURLToPath(new URL('../packages/cli/dist/index.js',import.meta.url)),'gate','--json','--lockfile',inputPath(process.env.PZ_ACTION_LOCKFILE||'package-lock.json'),
  '--store',process.env.PZ_ACTION_STORE?inputPath(process.env.PZ_ACTION_STORE):join(actionRoot,'patient-zero.rl'),'--mode',mode,'--fail-on',failOn,'--max-store-age-hours',age];
 if(process.env.PZ_ACTION_AS_OF)args.push('--as-of',process.env.PZ_ACTION_AS_OF);
 if(process.env.PZ_ACTION_CONFIG)args.push('--config',inputPath(process.env.PZ_ACTION_CONFIG));
 const child=spawnSync(process.execPath,args,{cwd:actionRoot,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,PZ_AS_OF:'',NODE_OPTIONS:''}});
 if(child.error)throw child.error;
 if(!child.stdout.trim())throw new Error(child.stderr.trim()||`Gate exited ${child.status} without a verdict.`);
 const parsed=JSON.parse(child.stdout);
 if(!['passed','blocked','incomplete'].includes(parsed.status)||!Number.isInteger(parsed.exitCode)||parsed.exitCode!==child.status||({passed:0,blocked:1,incomplete:2})[parsed.status]!==parsed.exitCode)throw new Error('Invalid gate result or exit status.');
 result=parsed;
}catch(error){result={schemaVersion:1,status:'incomplete',exitCode:2,error:error instanceof Error?error.message:String(error)};}
writeFileSync(report,JSON.stringify(result,null,2)+'\n',{mode:0o600});
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`status=${result.status}\nexit-code=${result.exitCode}\nreport=${report}\n`);
if(process.env.GITHUB_STEP_SUMMARY){
 const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 appendFileSync(process.env.GITHUB_STEP_SUMMARY,`### Patient Zero: ${result.status} (exit ${result.exitCode})\n\nExperimental metadata policy; no installation performed. This is not proof of dependency safety.\n\n<pre>${escape(JSON.stringify(result,null,2))}</pre>\n`);
}
console.log(`Patient Zero: ${result.status} (exit ${result.exitCode}). Report saved on the runner; no lockfile uploaded.`);
process.exitCode=result.exitCode;
