import {Database} from '@relate/relate';
import {z} from 'zod';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {detect,detectionConfigSchema,digest,populateGraph,versionId,type DetectionConfig,type DetectionResult} from '@patient-zero/core';
import {loadDataset,writeJSON,type Dataset} from '@patient-zero/ingest';

const datasetRef=z.object({manifest:z.string(),incident:z.string()}).strict();
export const specSchema=z.object({schemaVersion:z.literal(1),stepMinutes:z.number().int().positive().max(60),training:datasetRef,heldOut:datasetRef,control:datasetRef,cohort:z.string(),candidateBurstPackages:z.array(z.number().int().min(2)).min(1),candidateMedium:z.array(z.number().positive()).min(1)}).strict();
const frozenSchema=z.object({schemaVersion:z.literal(1),createdAt:z.string(),config:detectionConfigSchema,configHash:z.string(),trainingHash:z.string(),codeHash:z.string(),stepMinutes:z.number().positive(),objective:z.string(),candidateResults:z.array(z.object({burstPackages:z.number(),medium:z.number(),f1:z.number(),precision:z.number(),recall:z.number()})),selectedIndex:z.number().int().nonnegative()}).strict();
export interface Evaluation {
 slug:string;role:string;datasetHash:string;mode:'retrospective';start:string;end:string;stepMinutes:number;tickCount:number;
 referenceVersions:number;referenceWithKnownPublication:number;referenceWithPublisher:number;referenceWithScriptState:number;referenceOutsideWindow:number;
 knownWindowPublishes:number;flaggedWindowVersions:number;truePositiveVersions:number;unlabelledFlaggedVersions:number;
 recallAtEnd:number|null;referencePrecision:number|null;recallAtFirstPublicAdvisory:number|null;firstPublicLeadMinutes:number|null;
 osvCutoffVersions:number;recallBeforeOsvPublication:number|null;osvLeadMinutes:number|null;osvLeadCount:number;
 controlFlagsPer1000Publishes:number|null;evidenceTimeVisibleVersions:number;unknownPublicationVersions:number;notFoundPackages:string[];normalizationWarnings:number;
 firstDetections:{version:string;tick:string}[];unlabelledFlags:string[];
}
function firstTicks(events:NonNullable<DetectionResult['events']>,start:string,end:string,stepMinutes:number):Map<string,string>{
 const origin=Date.parse(start)-3_600_000,step=stepMinutes*60_000,limit=Date.parse(end),first=new Map<string,string>();
 for(const e of events){
  const millis=Date.parse(e.at);if(millis>limit)continue;
  const tick=new Date(Math.min(limit,Math.max(origin,origin+Math.ceil((millis-origin)/step)*step))).toISOString();
  if(!first.has(e.version)||first.get(e.version)!>tick)first.set(e.version,tick);
 }
 return first;
}
const median=(values:number[]):number|null=>{if(!values.length)return null;values.sort((a,b)=>a-b);const n=values.length;return n%2?values[Math.floor(n/2)]!:(values[n/2-1]!+values[n/2]!)/2;};
export function scoreEvents(dataset:Dataset,result:DetectionResult,stepMinutes:number,evidenceVisible=0):Evaluation{
 const {incident,versions}=dataset,start=incident.start,end=incident.end;
 const first=firstTicks(result.events??[],start,end,stepMinutes),byId=new Map(versions.map(v=>[versionId(v),v]));
 const labels=new Set(incident.labels.map(versionId));
 const publications=versions.filter(v=>v.publishedAt!==null&&v.publishedAt>=start&&v.publishedAt<end);
 const windowIds=new Set(publications.map(versionId)),flags=[...first.keys()].filter(id=>windowIds.has(id));
 const truePositives=flags.filter(id=>labels.has(id));
 const recalls=[...labels].filter(id=>windowIds.has(id)&&first.has(id)&&first.get(id)!<=end).length;
 const cutoff=incident.advisoryPublishedAt;
 const firstPublic= cutoff ? [...labels].filter(id=>windowIds.has(id)&&first.has(id)&&first.get(id)!<cutoff).length : null;
 const firstLead= cutoff ? median([...labels].filter(id=>windowIds.has(id)&&first.has(id)).map(id=>(Date.parse(cutoff)-Date.parse(first.get(id)!))/60_000)) : null;
 const osv=new Map<string,string>();
 for(const label of incident.labels)if(label.advisoryId.startsWith('MAL-')&&label.publishedAt!==null){const id=versionId(label);if(!osv.has(id)||label.publishedAt<osv.get(id)!)osv.set(id,label.publishedAt);}
 const osvLead=[...osv].filter(([id])=>windowIds.has(id)&&first.has(id)).map(([id,at])=>(Date.parse(at)-Date.parse(first.get(id)!))/60_000);
 return {slug:incident.slug,role:incident.role,datasetHash:dataset.hash,mode:'retrospective',start,end,stepMinutes,
  tickCount:Math.ceil((Date.parse(end)-Date.parse(start)+3_600_000)/(stepMinutes*60_000))+1,
  referenceVersions:labels.size,referenceWithKnownPublication:[...labels].filter(id=>byId.get(id)?.publishedAt!=null).length,
  referenceWithPublisher:[...labels].filter(id=>byId.get(id)?.publisher!=null).length,
  referenceWithScriptState:[...labels].filter(id=>byId.get(id)?.hasInstallScript!=null).length,
  referenceOutsideWindow:[...labels].filter(id=>{const at=byId.get(id)?.publishedAt;return at!=null&&(at<start||at>=end);}).length,
  knownWindowPublishes:publications.length,flaggedWindowVersions:flags.length,truePositiveVersions:truePositives.length,unlabelledFlaggedVersions:flags.length-truePositives.length,
  recallAtEnd:labels.size?recalls/labels.size:null,referencePrecision:flags.length?truePositives.length/flags.length:null,
  recallAtFirstPublicAdvisory:firstPublic===null||labels.size===0?null:firstPublic/labels.size,firstPublicLeadMinutes:firstLead,
  osvCutoffVersions:osv.size,recallBeforeOsvPublication:osv.size?[...osv].filter(([id,at])=>windowIds.has(id)&&first.has(id)&&first.get(id)!<at).length/osv.size:null,
  osvLeadMinutes:median(osvLead),osvLeadCount:osvLead.length,controlFlagsPer1000Publishes:labels.size===0&&publications.length?flags.length/publications.length*1000:null,
  evidenceTimeVisibleVersions:evidenceVisible,unknownPublicationVersions:versions.filter(v=>v.publishedAt===null).length,
  notFoundPackages:dataset.cacheCoverage.notFound,normalizationWarnings:dataset.cacheCoverage.normalizationWarnings,
  firstDetections:[...first].filter(([id])=>windowIds.has(id)).map(([version,tick])=>({version,tick})).sort((a,b)=>a.tick.localeCompare(b.tick)||a.version.localeCompare(b.version)),
  unlabelledFlags:flags.filter(id=>!labels.has(id)).sort(),
 };
}
export function evaluateDataset(dataset:Dataset,config:DetectionConfig,stepMinutes:number):Evaluation{
 for(const p of dataset.cacheCoverage.projections){
  if(p.start>dataset.incident.start||p.end<dataset.incident.end||p.lookbackMinutes<(config.maxHops+1)*config.windowMinutes)throw new Error('Temporal cache projection does not cover this configuration/window');
 }
 const conn=Database.open(':memory:').connect();populateGraph(conn,dataset.versions,[dataset.incident],dataset.hash);
 const result=detect(conn,{asOf:dataset.incident.end,config,collectEvents:true});
 const evidence=detect(conn,{asOf:dataset.incident.end,config,mode:'evidence'});
 return scoreEvents(dataset,result,stepMinutes,evidence.coverage.visibleVersions);
}
export async function detectorCodeHash():Promise<string>{
 const files=['detect.js','graph.js','model.js','queue.js'];const contents=[];
 for(const file of files)contents.push(await readFile(fileURLToPath(new URL(`../../core/dist/${file}`,import.meta.url)),'utf8'));
 return digest(contents.join('\n'));
}

/** This entry point loads the tuning dataset ONLY, not held-out/control data. */
export async function tuneAndFreeze(specPath='bench/spec.json',output='bench/frozen-config.json'):Promise<unknown>{
 const spec=specSchema.parse(JSON.parse(await readFile(specPath,'utf8')));
 const training=await loadDataset(spec.training.manifest,spec.training.incident);
 if(training.incident.role!=='tuning')throw new Error('Training dataset must have tuning role');
 const configBase=detectionConfigSchema.parse({}),candidateResults=[];let best=-1,bestF1=-1;
 for(const burstPackages of spec.candidateBurstPackages)for(const medium of spec.candidateMedium){
  const config=detectionConfigSchema.parse({...configBase,burstPackages,medium,high:Math.max(configBase.high,medium)});
  const evaluated=evaluateDataset(training,config,spec.stepMinutes),precision=evaluated.referencePrecision??0,recall=evaluated.recallAtEnd??0;
  const f1=precision+recall?2*precision*recall/(precision+recall):0;
  candidateResults.push({burstPackages,medium,f1,precision,recall});
  if(f1>bestF1+1e-12){bestF1=f1;best=candidateResults.length-1;}
 }
 if(best<0)throw new Error('No tuning candidates');
 const selected=candidateResults[best]!,config=detectionConfigSchema.parse({...configBase,burstPackages:selected.burstPackages,medium:selected.medium,high:Math.max(configBase.high,selected.medium)});
 const frozen={schemaVersion:1,createdAt:new Date().toISOString(),config,configHash:digest(JSON.stringify(config)),trainingHash:training.hash,codeHash:await detectorCodeHash(),stepMinutes:spec.stepMinutes,
  objective:'Maximize incident-A end-window reference F1 only. Fixed candidate order breaks ties (defaults first). Weights/decay/hops remain fixed. No held-out/control inputs are loaded.',candidateResults,selectedIndex:best};
 // A frozen profile is a deliberate boundary. Never silently overwrite it.
 await writeFile(output,JSON.stringify(frozen,null,2)+'\n',{flag:'wx'});
 return frozen;
}
const percent=(v:number|null):string=>v===null?'Not established':`${(v*100).toFixed(2)}%`;
const number=(v:number|null):string=>v===null?'Not established':v.toFixed(2);
export async function runBenchmark(specPath='bench/spec.json',frozenPath='bench/frozen-config.json',outputRoot='bench'):Promise<unknown>{
 const spec=specSchema.parse(JSON.parse(await readFile(specPath,'utf8'))),frozen=frozenSchema.parse(JSON.parse(await readFile(frozenPath,'utf8')));
 if(digest(JSON.stringify(frozen.config))!==frozen.configHash||await detectorCodeHash()!==frozen.codeHash||spec.stepMinutes!==frozen.stepMinutes)throw new Error('Frozen config/code/tick fingerprint mismatch; do not retune against held-out results');
 const training=await loadDataset(spec.training.manifest,spec.training.incident);
 if(training.hash!==frozen.trainingHash)throw new Error('Tuning dataset changed after freeze');
 const heldOut=await loadDataset(spec.heldOut.manifest,spec.heldOut.incident),control=await loadDataset(spec.control.manifest,spec.control.incident);
 if(heldOut.incident.role!=='held-out'||control.incident.role!=='held-out'||control.incident.labels.length!==0)throw new Error('Invalid held-out/control roles');
 const cohortBytes=await readFile(spec.cohort,'utf8'),cohort=z.object({packages:z.array(z.string()).length(2000),source:z.string(),snapshotAt:z.string()}).passthrough().parse(JSON.parse(cohortBytes));
 if([...cohort.packages].sort().join('\n')!==[...control.incident.packages].sort().join('\n'))throw new Error('Control cohort mismatch');
 const rows=[];for(const dataset of [training,heldOut,control])rows.push(evaluateDataset(dataset,frozen.config,spec.stepMinutes));
 const result={schemaVersion:1,generatedAt:new Date().toISOString(),configHash:frozen.configHash,codeHash:frozen.codeHash,cohortHash:digest(cohortBytes),cohortSource:cohort.source,cohortSnapshotAt:cohort.snapshotAt,
  frozenConfig:frozenPath,rows,limitations:[
   'All historical metrics are retrospective and use later-observed metadata. They do not establish real pre-advisory detection.',
   'First public advisory cutoffs remain unverified unless supplied explicitly; those recall/lead metrics are null. OSV publication is a separately named reference cutoff.',
   'Shai-Hulud coverage means the pinned primary IOC union, not proof that every compromised package globally is listed. Missing facts count against all-reference recall.',
   'Reference precision treats unlabelled flags as negatives against the supplied IOC set; it does not independently prove those releases benign.',
   'Quiet-week flags per 1000 publishes assume the selected week is benign. The 2000-package cohort is pre-control download-ranked, not a verified exact August global ranking.',
   'Event-time detection is sampled onto 15-minute replay ticks; equivalence to literal tick replay is tested. No lockfile dependency graph is included in this ecosystem benchmark.',
  ]};
 await writeJSON(`${outputRoot}/results.json`,result);
 const held=rows[1]!,quiet=rows[2]!;
 const lines=[
  '# Patient Zero benchmark results','',
  `Held-out retrospective reference recall at incident end: **${percent(held.recallAtEnd)}**. Quiet-week alert rate: **${number(quiet.controlFlagsPer1000Publishes)} flags per 1,000 known publishes**.`,
  '', '**Prospective/pre-advisory performance is not established.** These are reconstruction metrics, not production gate acceptance.', '',
  '| Dataset | Role | Reference versions | Known time / publisher / script | Recall at end | Reference precision | Recall before OSV publication | Median OSV lead (min) | Known window publishes | Flags |',
  '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows.map(r=>`| ${r.slug} | ${r.role} | ${r.referenceVersions} | ${r.referenceWithKnownPublication} / ${r.referenceWithPublisher} / ${r.referenceWithScriptState} | ${percent(r.recallAtEnd)} | ${percent(r.referencePrecision)} | ${percent(r.recallBeforeOsvPublication)} (${r.osvCutoffVersions} cutoffs) | ${number(r.osvLeadMinutes)} (n=${r.osvLeadCount}) | ${r.knownWindowPublishes} | ${r.flaggedWindowVersions} |`),
  '',`First-public-advisory recall and lead time: ${rows.every(r=>r.recallAtFirstPublicAdvisory===null)?'**Not established**; exact first public disclosure timestamps are unverified.':'See results.json for explicit verified cutoffs.'}`,
  '',`Evidence-time visible versions at historical incident/control end: ${rows.map(r=>`${r.slug}: ${r.evidenceTimeVisibleVersions}`).join('; ')}.`,
  '',`Config SHA-256: \`${frozen.configHash}\`. Detector code SHA-256: \`${frozen.codeHash}\`. Candidate selection used incident A only; the profile was written before held-out/control evaluation. Full tuning records: [frozen-config.json](frozen-config.json).`,
  '',`Control cohort: 2,000 packages from snapshot ${cohort.snapshotAt}; [pinned source](${cohort.source}). Metadata gaps: ${rows.map(r=>`${r.slug}: ${r.unknownPublicationVersions} unknown publication times, ${r.notFoundPackages.length} unavailable packages, ${r.normalizationWarnings} recorded normalization warnings`).join('; ')}.`,
  '', '## Method and limits','',
  ...result.limitations.map(s=>`- ${s}`),
  '', 'All-reference recall includes missing/unassessable reference identities as misses. Known-window precision/alert denominators include only versions with publication timestamps in [start, end). A zero-publication denominator yields null, never a fabricated zero rate. OSV lead is signed and includes late detections; positive values denote earlier reconstructed tick times. Unlabelled flags and first-detection ticks are retained in results.json.',
  '', 'Do not hide non-IOC follow-up releases or use advisory labels as detector inputs. The results are diagnostic evidence for improving coverage and policy; no safe-upgrade claim follows from them.',
 ];
 await writeFile(`${outputRoot}/results.md`,lines.join('\n')+'\n');return result;
}
