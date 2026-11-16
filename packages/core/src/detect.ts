import { z } from 'zod';
import {PriorityQueue} from './queue.js';
import type { Connection } from '@relate/relate';
import { assertSchema, digest } from './graph.js';
import { timestamp, versionId, versionSchema, type VersionRecord, type Evidence } from './model.js';

export const detectionConfigSchema = z.object({
  burstPackages: z.number().int().min(2).default(5), windowMinutes: z.number().positive().default(60),
  dormantDays: z.number().positive().default(180), medium: z.number().positive().default(3),
  high: z.number().positive().default(5), decay: z.number().positive().max(1).default(0.7),
  maxHops: z.number().int().min(1).max(20).default(4),
  weights: z.object({ R1:z.number().positive().default(3), R2:z.number().positive().default(2), R3:z.number().positive().default(1), R4:z.number().positive().default(2) }).default({ R1:3, R2:2, R3:1, R4:2 }),
}).strict().refine(c => c.high >= c.medium, 'High threshold must be at least medium');
export type DetectionConfig = z.infer<typeof detectionConfigSchema>;
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
export interface Reason { rule: RuleId; at: string; detail: string; related: string[] }
export interface PathStep { version: string; rule: RuleId; at: string; detail: string; evidence: Record<string,Evidence> }
export interface Finding {
  id: string; version: string; score: number; severity: 'low'|'medium'|'high'; at: string; scoreAt: string; flaggedAt: string|null;
  reasons: Reason[]; path: PathStep[]; taintedVia: string[];
}
export interface DetectionResult {
  schemaVersion: 1; runId: string; asOf: string; mode: 'retrospective'|'evidence'; config: DetectionConfig;
  coverage: { visibleVersions: number; unknownPublishTime: number; missingPublisher: number; missingScripts: number; missingProvenance: number; reconstructedVersions: number };
  findings: Finding[]; warnings: string[]; events?: {version:string;score:number;at:string}[];
}

/** No Advisory/FLAGS/Incident query is allowed here. Labels never enter the detector. */
export function detect(conn: Connection, options: { asOf:string; mode?:'retrospective'|'evidence'; config?:unknown; lockfileHash?:string; collectEvents?:boolean }): DetectionResult {
  assertSchema(conn);
  const asOf = timestamp.parse(options.asOf);
  const mode = options.mode ?? 'retrospective';
  if (!['retrospective', 'evidence'].includes(mode)) throw new Error('Invalid detection mode');
  const config = detectionConfigSchema.parse(options.config ?? {});
  const windowMs = config.windowMinutes * 60_000;
  const datasetHash = conn.query('MATCH (s:Store {id:$id}) RETURN s.datasetHash AS hash', { id:'patient-zero' }).single().hash;
  const runId = digest(JSON.stringify({ datasetHash, asOf, mode, config, lockfileHash:options.lockfileHash ?? null }));
  if (options.lockfileHash && conn.query('MATCH (l:Lockfile {hash:$hash}) RETURN l.hash AS hash', { hash:options.lockfileHash }).rows.length !== 1) throw new Error('Lockfile outside store coverage');
  if (options.lockfileHash && mode === 'evidence') {
    const builtAt = conn.query('MATCH (l:Lockfile {hash:$hash}) RETURN l.builtAt AS at', { hash:options.lockfileHash }).single().at;
    if (typeof builtAt !== 'string' || builtAt > asOf) throw new Error('Lockfile evidence is not available at asOf');
  }
  const raw = conn.query('MATCH (v:Version) WHERE v.publishedAt <= $asOf RETURN v.metadataJSON AS json', { asOf }).rows.map(row => versionSchema.parse(JSON.parse(String(row.json))));
  const unknownPublishTime = Number(conn.query('MATCH (v:Version) WHERE v.publishedAt IS NULL RETURN count(v) AS n').single().n);
  const versions = raw.filter(v => mode !== 'evidence' || v.evidence.publishedAt!.observedAt <= asOf).map(v => {
    const visible = structuredClone(v);
    if (mode === 'evidence') for (const key of ['publisher','hasInstallScript','provenance','unpackedSize','dependencies'] as const) {
      if (visible.evidence[key] && visible.evidence[key]!.observedAt > asOf) { visible[key] = null; delete visible.evidence[key]; }
    }
    return visible;
  }).sort((a,b) => a.publishedAt!.localeCompare(b.publishedAt!) || versionId(a).localeCompare(versionId(b)));
  const byId = new Map(versions.map(v => [versionId(v), v]));
  const predecessors = new Map(conn.query('MATCH (v:Version)-[:SUCCEEDS]->(p:Version) WHERE v.publishedAt <= $asOf AND p.publishedAt <= $asOf RETURN v.id AS id, p.id AS prev', { asOf }).rows.map(row => [String(row.id), String(row.prev)]));
  const publishers = new Map(conn.query('MATCH (v:Version)-[:PUBLISHED_BY]->(p:Publisher) WHERE v.publishedAt <= $asOf RETURN v.id AS id, p.npmUser AS publisher', { asOf }).rows.map(row => [String(row.id), String(row.publisher)]));
  const signals = new Map<string, Reason[]>();
  const knownAt = (at:string, records:VersionRecord[], fields:string[]):string => mode === 'retrospective' ? at :
    records.reduce((latest,v) => fields.reduce((time,field) => v.evidence[field] && v.evidence[field]!.observedAt > time ? v.evidence[field]!.observedAt : time,latest),at);
  const add = (v:VersionRecord, reason:Reason):void => {
    const id = versionId(v), current = signals.get(id) ?? [];
    const existing = current.findIndex(r=>r.rule === reason.rule);
    if (existing < 0) current.push(reason);
    else if (reason.at < current[existing]!.at) current[existing] = reason;
    signals.set(id, current);
  };
  const history = new Map<string, VersionRecord[]>();
  const publisherWindow = new Map<string, VersionRecord[]>();
  for (const v of versions) {
    const id = versionId(v), at = v.publishedAt!, prior = history.get(v.pkg) ?? [];
    const prev = byId.get(predecessors.get(id) ?? '');
    if (prev && prev.publishedAt! < at) {
      if (v.hasInstallScript === true && prev.hasInstallScript === false) add(v, { rule:'R2', at:knownAt(at,[v,prev],['publishedAt','hasInstallScript']), detail:`Install lifecycle script appeared after ${versionId(prev)}`, related:[versionId(prev)] });
      if (v.provenance === false && prev.provenance === true) add(v, { rule:'R4', at:knownAt(at,[v,prev],['publishedAt','provenance']), detail:`Provenance attestation absent after ${versionId(prev)}`, related:[versionId(prev)] });
    }
    if (v.publisher !== null && publishers.get(id) === v.publisher) {
      // Unknown publisher history cannot prove either absence or dormancy.
      if (prior.length > 0 && prior.every(p => p.publisher !== null && p.publishedAt! < at)) {
        const same = prior.filter(p => p.publisher === v.publisher).at(-1);
        if (!same || Date.parse(at) - Date.parse(same.publishedAt!) > config.dormantDays * 86_400_000) add(v, { rule:'R3', at:knownAt(at,[v,...prior],['publishedAt','publisher']), detail:same ? `Publisher ${v.publisher} dormant for more than ${config.dormantDays} days in known history` : `Publisher ${v.publisher} is new within known package history`, related:same ? [versionId(same)] : prior.map(versionId) });
      }
      const recent = (publisherWindow.get(v.publisher) ?? []).filter(p => Date.parse(p.publishedAt!) >= Date.parse(at) - windowMs);
      recent.push(v);
      publisherWindow.set(v.publisher, recent);
      const packages = new Set(recent.map(p => p.pkg));
      if (packages.size >= config.burstPackages) for (const member of recent) add(member, { rule:'R1', at:knownAt(at,recent,['publishedAt','publisher']), detail:`Publisher ${v.publisher} published ${packages.size} distinct packages within ${config.windowMinutes} minutes`, related:recent.map(versionId).sort() });
    }
    history.set(v.pkg, [...prior, v]);
  }
  const severity = (score:number):Finding['severity'] => score >= config.high ? 'high' : score >= config.medium ? 'medium' : 'low';
  const findings = new Map<string, Finding>();
  for (const [id, reasons] of signals) {
    reasons.sort((a,b) => a.at.localeCompare(b.at) || a.rule.localeCompare(b.rule));
    const score = reasons.reduce((s,r) => s + config.weights[r.rule as keyof typeof config.weights], 0);
    let accumulated = 0; let flaggedAt:string|null = null;
    for (const reason of reasons) { accumulated += config.weights[reason.rule as keyof typeof config.weights]; if (flaggedAt === null && accumulated >= config.medium) flaggedAt = reason.at; }
    findings.set(id, { id:digest(`${runId}:${id}`), version:id, score, severity:severity(score), at:reasons[0]!.at, scoreAt:reasons.at(-1)!.at, flaggedAt, reasons,
      path:reasons.map(r => ({ version:id, rule:r.rule, at:r.at, detail:r.detail, evidence:byId.get(id)!.evidence })), taintedVia:[] });
  }
  const exactEdges = options.lockfileHash ? conn.query(`MATCH (l:Lockfile {hash:$hash})-[:RESOLVES]->(consumer:Version)-[r:RESOLVED_DEPENDS_ON]->(dependency:Version)
    WHERE r.lockfileHash=$hash AND consumer.publishedAt <= $asOf AND dependency.publishedAt <= $asOf RETURN consumer.id AS consumer, dependency.id AS dependency`, { hash:options.lockfileHash, asOf }).rows : [];
  // Evaluate every strength change at its own evidence time. A later rule must
  // never give an earlier publisher/dependency finding a stronger score.
  const events=new Map<string,{version:string;score:number;at:string}>();
  const event=(f:Finding,at:string):void=>{if(options.collectEvents&&f.score>=config.medium)events.set(`${f.version}:${f.score}:${at}`,{version:f.version,score:f.score,at});};
  const queue=new PriorityQueue<Finding>((a,b)=>a.scoreAt.localeCompare(b.scoreAt)||b.score-a.score||a.version.localeCompare(b.version));
  const publisherVersions=new Map<string,VersionRecord[]>();
  for(const v of versions)if(v.publisher!==null)publisherVersions.set(v.publisher,[...(publisherVersions.get(v.publisher)??[]),v]);
  const consumers=new Map<string,Set<string>>();
  for(const edge of exactEdges) {const key=String(edge.dependency);const set=consumers.get(key)??new Set<string>();set.add(String(edge.consumer));consumers.set(key,set);}
  for (const f of findings.values()) {
    let score = 0;
    for (let i=0; i<f.reasons.length; i++) {
      const reason = f.reasons[i]!;
      score += config.weights[reason.rule as keyof typeof config.weights];
      if (score < config.medium) continue;
      const state={ ...f, score, severity:severity(score), scoreAt:reason.at,reasons:f.reasons.slice(0,i+1),path:f.path.slice(0,i+1) };
      event(state,reason.at);queue.push(state);
    }
  }
  const processed = new Map<string, {score:number; at:string; hops:number}[]>();
  while (queue.length) {
    const seed = queue.pop()!;
    const hops = seed.path.filter(s=>s.rule==='R5').length;
    if (hops >= config.maxHops) continue;
    const previous = processed.get(seed.version) ?? [];
    if (previous.some(p=>p.score >= seed.score && p.at <= seed.scoreAt && p.hops <= hops)) continue;
    processed.set(seed.version,[...previous,{score:seed.score,at:seed.scoreAt,hops}]);
    const source = byId.get(seed.version)!;
    const candidates=new Set<string>([...(source.publisher!==null?publisherVersions.get(source.publisher)??[]:[]).filter(v=>Date.parse(v.publishedAt!)>=Date.parse(seed.flaggedAt!)&&Date.parse(v.publishedAt!)-Date.parse(seed.flaggedAt!)<=windowMs).map(versionId),...(consumers.get(seed.version)??[])]);
    for (const id of candidates) {
      const v=byId.get(id);if(!v)continue;
      if (id === seed.version || seed.path.some(s=>s.version === id)) continue;
      const samePublisher = source.publisher !== null && v.publisher === source.publisher &&
        Date.parse(v.publishedAt!) >= Date.parse(seed.flaggedAt!) && Date.parse(v.publishedAt!) - Date.parse(seed.flaggedAt!) <= windowMs;
      const dependency = consumers.get(seed.version)?.has(id)??false;
      if (!samePublisher && !dependency) continue;
      const score = Math.round(seed.score * config.decay * 1000) / 1000;
      const at = v.publishedAt! > seed.scoreAt ? v.publishedAt! : seed.scoreAt;
      const reason:Reason = { rule:'R5',at,detail:dependency ? `Exact lockfile dependency on ${seed.version}` : `Publisher ${source.publisher} carried a finding on ${seed.version}`,related:[seed.version] };
      const candidate:Finding = { id:digest(`${runId}:${id}`),version:id,score,severity:severity(score),at,scoreAt:at,
        flaggedAt:score >= config.medium ? at : null,reasons:[reason],
        path:[...seed.path,{version:id,rule:'R5',at,detail:reason.detail,evidence:v.evidence}],taintedVia:[seed.id] };
      event(candidate,at);
      const existing = findings.get(id);
      if (!existing || score > existing.score || (score === existing.score && at < existing.scoreAt)) findings.set(id,candidate);
      if (score >= config.medium) queue.push(candidate);
    }
  }
  return { schemaVersion:1, runId, asOf, mode, config, coverage:{ visibleVersions:versions.length, unknownPublishTime,
    missingPublisher:versions.filter(v => v.publisher === null).length, missingScripts:versions.filter(v => v.hasInstallScript === null).length,
    missingProvenance:versions.filter(v => v.provenance === null).length, reconstructedVersions:versions.filter(v => Object.values(v.evidence).some(e => e.kind === 'report')).length },
    ...(options.collectEvents?{events:[...events.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.version.localeCompare(b.version)||a.score-b.score)}:{}),
    findings:[...findings.values()].sort((a,b) => a.at.localeCompare(b.at) || a.version.localeCompare(b.version)),
    warnings:['Rule weights and thresholds are untuned. Findings are signals, not proof of malware or safety.', mode === 'retrospective' ? 'Retrospective reconstruction uses later-observed metadata; it cannot establish pre-advisory detection.' : 'Evidence-time mode excludes fields first observed after asOf.', 'History and graph coverage are limited to the supplied cache. Dependency taint requires explicit exact lockfile edges.'] };
}

export function persistFindings(conn: Connection, result: DetectionResult): void {
  assertSchema(conn);
  conn.begin();
  try {
    conn.query('MATCH (f:Finding {runId:$runId}) DETACH DELETE f', { runId:result.runId });
    for (const f of result.findings) {
      conn.query(`MATCH (v:Version {id:$version}) CREATE (f:Finding {id:$id, runId:$runId, score:$score, at:$at, resultJSON:$json}) CREATE (f)-[:ON]->(v)`, {
        version:f.version, id:f.id, runId:result.runId, score:f.score, at:f.at, json:JSON.stringify(f),
      });
      for (const r of f.reasons) conn.query('MATCH (f:Finding {id:$id}), (r:Rule {id:$rule}) CREATE (f)-[:TRIGGERED]->(r)', { id:f.id, rule:r.rule });
    }
    for (const f of result.findings) for (const parent of f.taintedVia) conn.query('MATCH (f:Finding {id:$id}), (p:Finding {id:$parent}) CREATE (f)-[:TAINTED_VIA]->(p)', { id:f.id, parent });
    conn.commit();
  } catch (error) { conn.rollback(); throw error; }
}
