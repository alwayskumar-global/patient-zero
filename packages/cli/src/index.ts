#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { checkRelate, openStore, detect, timestamp, readLockfile, evaluateGate, type DetectionResult } from '@patient-zero/core';
import { buildStore, buildCombinedStore, ingestLockfile, ingestIncident, readIncident } from '@patient-zero/ingest';

const help = `Patient Zero — metadata ingestion and temporal graph detection

Usage:
  patient-zero doctor
  patient-zero mcp [--store patient-zero.rl] [--lockfile <file>] [--as-of <ISO>] [--mode evidence|retrospective] [--config <file>]
  patient-zero gate [--lockfile package-lock.json] [--store patient-zero.rl] [--fail-on medium|high] [--as-of <ISO>] [--mode evidence|retrospective] [--max-store-age-hours 168] [--config <file>] [--json]
  patient-zero ingest-lockfile [--lockfile package-lock.json] [--manifest <file>]
  patient-zero ingest --incident <file> [--manifest <file>]
  patient-zero build-store --from-cache [--manifest <file>] [--incident <file>] [--catalog <file>] [--store <file.rl>]
  patient-zero detect --as-of <ISO timestamp> [--mode retrospective|evidence] [--config <file>] [--store <file.rl>] [--json]
  patient-zero explain <pkg>@<version> [--as-of <ISO timestamp>] [--mode retrospective|evidence] [--store <file.rl>] [--json]
  patient-zero replay <incident-slug> [--step-minutes 15] [--speed <factor>] [--mode retrospective|evidence] [--store <file.rl>] [--json]

Frozen weights were selected on incident A only; held-out acceptance failed.
Gate validates package-lock v2/v3. MCP is stdio/read-only. UI: npm run web:dev.
No safe upgrade is inferred; MCP can assess a fully resolved candidate lockfile.
Exit codes: gate 0 policy pass, 1 blocked, 2 incomplete/operational failure. Other commands return 0 success or 2 failure.
`;
const commands:Record<string,string[]> = {
  mcp:['store','lockfile','as-of','mode','config','fail-on','max-store-age-hours'], doctor:[], 'ingest-lockfile':['lockfile','manifest'], gate:['lockfile','as-of','mode','config','store','json','fail-on','max-store-age-hours'], ingest:['incident','manifest'], 'build-store':['from-cache','manifest','incident','store','catalog'],
  detect:['as-of','mode','config','store','json'], explain:['as-of','mode','config','store','json'],
  replay:['speed','step-minutes','mode','config','store','incident','json'],
};
const displayWarning=(warning:string)=>warning.replace('Rule weights and thresholds are untuned.','Frozen defaults were selected on incident A only; held-out acceptance failed.');
function printResult(result:DetectionResult, json:boolean):void {
  if (json) { console.log(JSON.stringify(result,null,2)); return; }
  console.log(`${result.mode.toUpperCase()} at ${result.asOf} — ${result.coverage.visibleVersions} visible versions, ${result.findings.length} findings`);
  for (const f of result.findings) {
    console.log(`${f.severity.toUpperCase()} ${f.version} score=${f.score} first-signal=${f.at}`);
    for (const step of f.path) console.log(`  ${step.rule} ${step.version} — ${step.detail} (${step.at})`);
  }
  for (const warning of result.warnings) console.log(`NOTE: ${displayWarning(warning)}`);
}

try {
  const { values,positionals } = parseArgs({ allowPositionals:true,strict:true,options:{
    help:{type:'boolean',short:'h'}, catalog:{type:'string'},incident:{type:'string'},manifest:{type:'string'},store:{type:'string'},
    'from-cache':{type:'boolean'},'as-of':{type:'string'},mode:{type:'string'},config:{type:'string'},
    speed:{type:'string'},json:{type:'boolean'},'step-minutes':{type:'string'},lockfile:{type:'string'},'fail-on':{type:'string'},'max-store-age-hours':{type:'string'},
  } });
  const command = positionals[0];
  if (values.help || !command) console.log(help);
  else {
    const allowed = commands[command];
    if (!allowed) throw new Error(`Unsupported command: ${command}. No security verdict was produced.`);
    for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new Error(`--${key} is not supported by ${command}`);
    if (positionals.length !== (['explain','replay'].includes(command) ? 2 : 1)) throw new Error(`Unexpected or missing arguments for ${command}`);
    const store = resolve(values.store ?? 'patient-zero.rl');
    const mode = values.mode ?? (['gate','mcp','explain'].includes(command) ? 'evidence' : 'retrospective');
    if (mode !== 'retrospective' && mode !== 'evidence') throw new Error('--mode must be retrospective or evidence');
    const config:unknown = values.config ? JSON.parse(await readFile(values.config,'utf8')) : {};
    const manifest = resolve(values.manifest ?? (['ingest','ingest-lockfile'].includes(command) ? join(process.env.PZ_CACHE_DIR ?? 'data/cache','manifest.json') : 'data/replay/manifest.json'));
    const incidentPath = resolve(values.incident ?? `bench/incidents/${command === 'replay' ? positionals[1] : 'chalk-debug-2025-09'}.json`);
    if (command === 'doctor') console.log(JSON.stringify({ node:process.version,...checkRelate() },null,2));
    else if (command === 'mcp') {
      const failOn=values['fail-on']??'medium';if(failOn!=='medium'&&failOn!=='high')throw new Error('--fail-on must be medium or high');
      const age=Number(values['max-store-age-hours']??168);if(!Number.isFinite(age)||age<=0)throw new Error('--max-store-age-hours must be positive');
      const {startMcpServer}=await import('@patient-zero/mcp');
      await startMcpServer({store,mode,config,failOn,maxStoreAgeHours:age,...(values.lockfile?{lockfile:await readLockfile(values.lockfile)}:{}),...((values['as-of']??process.env.PZ_AS_OF)?{asOf:timestamp.parse(values['as-of']??process.env.PZ_AS_OF)}:{})});
    } else if (command === 'gate') {
      const failOn=values['fail-on']??'medium';
      if(failOn!=='medium'&&failOn!=='high')throw new Error('--fail-on must be medium or high');
      const lock=await readLockfile(values.lockfile??'package-lock.json');
      const result=evaluateGate(openStore(store).connect(),lock,{asOf:values['as-of']??(process.env.PZ_AS_OF||undefined)??new Date().toISOString(),mode,config,failOn,
        maxStoreAgeHours:Number(values['max-store-age-hours']??168)});
      if(values.json)console.log(JSON.stringify(result,null,2));
      else {
        console.log(`${result.status.toUpperCase()} — ${result.assessed} locked installations assessed; policy=${result.failOn}; mode=${result.mode}`);
        for(const item of result.blocked){
          console.log(`BLOCKED ${item.version} (${item.location}) score=${item.score}`);
          console.log(`  ${item.dependencyPath.map(p=>p.label).join(' → ')}`);
          for(const step of item.evidencePath)console.log(`  ${step.rule} ${step.version}: ${step.detail} (${step.at})`);
        }
        for(const gap of result.gaps)console.log(`INCOMPLETE ${gap.version??gap.location}: ${gap.reason}`);
        for(const warning of result.warnings)console.log(`NOTE: ${displayWarning(warning)}`);
      }
      process.exitCode=result.exitCode;
    } else if (command === 'ingest-lockfile') {
      await ingestLockfile(await readLockfile(values.lockfile??'package-lock.json'),manifest);console.log(`Public metadata snapshot: ${manifest}`);
    } else if (command === 'ingest') {
      if (!values.incident) throw new Error('--incident is required for explicit network ingestion');
      await ingestIncident(incidentPath,manifest); console.log(`Metadata cached with integrity manifest: ${manifest}`);
    } else if (command === 'build-store') {
      if (!values['from-cache']) throw new Error('--from-cache is required; store builds never fetch network data');
      if(values.catalog&&(values.manifest||values.incident))throw new Error('--catalog cannot be combined with --manifest or --incident');
      const built=values.catalog?await buildCombinedStore(JSON.parse(await readFile(values.catalog,'utf8')),store):await buildStore(manifest,incidentPath,store);
      console.log(JSON.stringify({store,...built},null,2));
    } else if (command === 'replay') {
      if (!/^[a-z0-9-]+$/.test(positionals[1]!)) throw new Error('Invalid incident slug');
      const incident = await readIncident(incidentPath);
      if (incident.slug !== positionals[1]) throw new Error('Incident slug does not match file');
      const speed=values.speed===undefined?null:Number(values.speed);
      if(speed!==null&&(!Number.isFinite(speed)||speed<=0))throw new Error('--speed must be a positive finite playback factor');
      const minutes = Number(values['step-minutes'] ?? '15');
      if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('--step-minutes must be positive');
      const ticks = Math.ceil((Date.parse(incident.end)-Date.parse(incident.start)+3_600_000)/(minutes*60_000));
      if (ticks > 1000) throw new Error('Replay exceeds 1000 ticks; increase --step-minutes');
      const conn = openStore(store).connect();
      const seen = new Set<string>();
      for (let t = Date.parse(incident.start)-3_600_000; ; t = Math.min(t+minutes*60_000,Date.parse(incident.end))) {
        const result = detect(conn,{ asOf:new Date(t).toISOString(),mode,config });
        const fresh = result.findings.filter(f => {
          if (!f.reasons.some(r=>r.at >= incident.start)) return false;
          const key = `${f.version}:${f.reasons.map(r=>r.rule).sort().join(',')}:${f.score}`;
          if (seen.has(key)) return false; seen.add(key); return true;
        });
        if (values.json) console.log(JSON.stringify({ ...result,findings:fresh,event:'replay-tick',totalFindings:result.findings.length }));
        else if (fresh.length || t === Date.parse(incident.start)-3_600_000 || t === Date.parse(incident.end)) printResult({ ...result,findings:fresh },false);
        if (t === Date.parse(incident.end)) break;
        if(speed!==null)await delay(Math.min(minutes*60_000,Date.parse(incident.end)-t)/speed);
      }
    } else {
      const asOf = timestamp.parse(values['as-of'] ?? (process.env.PZ_AS_OF||undefined) ?? (command==='explain'?new Date().toISOString():undefined));
      const conn = openStore(store).connect();
      const result = detect(conn,{ asOf,mode,config });
      if (command === 'explain') {
        const version = positionals[1]!;
        const row = conn.query('MATCH (v:Version {id:$id}) RETURN v.id AS id', { id:version }).rows;
        if (row.length === 0) throw new Error(`Version outside store coverage: ${version}`);
        result.findings = result.findings.filter(f => f.version === version);
        if (!result.findings.length) result.warnings.push(`No visible finding for ${version}; this is not a safety verdict.`);
      }
      printResult(result,values.json ?? false);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
