import { z } from 'zod';

export const timestamp = z.iso.datetime({ offset: true }).transform(v => new Date(v).toISOString());
// The registry still contains legacy mixed-case names (for example JSONStream).
export const packageName = z.string().regex(/^(?:@[a-zA-Z0-9][a-zA-Z0-9._-]*\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/).max(214);
export const versionName = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
export const evidenceSchema = z.object({
  source: z.string().url(), observedAt: timestamp, kind: z.enum(['registry', 'report', 'synthetic']),
}).strict();
export const versionSchema = z.object({
  pkg: packageName, semver: versionName, publishedAt: timestamp.nullable(),
  publisher: z.string().min(1).max(256).nullable(),
  hasInstallScript: z.boolean().nullable(), provenance: z.boolean().nullable(),
  unpackedSize: z.number().int().nonnegative().nullable(),
  dependencies: z.record(packageName, z.string()).nullable(),
  evidence: z.record(z.string(), evidenceSchema),
}).strict().superRefine((v, ctx) => {
  for (const key of ['publishedAt', 'publisher', 'hasInstallScript', 'provenance', 'unpackedSize', 'dependencies'] as const) {
    if (v[key] !== null && !v.evidence[key]) ctx.addIssue({ code: 'custom', message: `Missing evidence for ${key}` });
  }
});
export const incidentSchema = z.object({
  schemaVersion: z.literal(1), slug: z.string().regex(/^[a-z0-9-]+$/),
  role: z.enum(['tuning', 'held-out']), start: timestamp, end: timestamp,
  advisoryPublishedAt: timestamp.nullable(), advisorySource: z.string().url(),
  notes: z.string(), packages: z.array(packageName).min(1),
  reconstructions: z.array(versionSchema),
  labels: z.array(z.object({ pkg: packageName, semver: versionName, advisoryId: z.string(), source: z.string().url(), publishedAt: timestamp.nullable() }).strict()),
}).strict().superRefine((v, ctx) => {
  if (v.start > v.end) ctx.addIssue({ code: 'custom', message: 'Incident start is after end' });
  if (new Set(v.packages).size !== v.packages.length) ctx.addIssue({ code:'custom',message:'Duplicate incident package' });
  const ids = new Set<string>();
  for (const record of v.reconstructions) {
    const id = `${record.pkg}@${record.semver}`;
    if (ids.has(id) || !v.packages.includes(record.pkg)) ctx.addIssue({code:'custom',message:'Duplicate or out-of-coverage reconstruction'});
    ids.add(id);
  }
  for (const label of v.labels) if (!v.packages.includes(label.pkg)) ctx.addIssue({code:'custom',message:'Label outside incident package coverage'});
});
export const cacheSchema = z.object({
  schemaVersion: z.literal(1), pkg: packageName, source: z.string().url(), fetchedAt: timestamp,
  availability: z.enum(['available','not-found']).optional(),
  projection: z.object({start:timestamp,end:timestamp,lookbackMinutes:z.number().positive(),originalVersionCount:z.number().int().nonnegative()}).strict().optional(),
  normalizationWarnings: z.array(z.object({version:z.string(),field:z.string(),reason:z.string()}).strict()).optional(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), versions: z.array(versionSchema),
}).strict().superRefine((c, ctx) => {
  const seen = new Set<string>();
  for (const v of c.versions) {
    if (v.pkg !== c.pkg || seen.has(v.semver)) ctx.addIssue({ code: 'custom', message: 'Wrong package or duplicate cached version' });
    seen.add(v.semver);
  }
});
export type VersionRecord = z.infer<typeof versionSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type CacheRecord = z.infer<typeof cacheSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export const versionId = (v: Pick<VersionRecord, 'pkg' | 'semver'>): string => `${v.pkg}@${v.semver}`;
export const RULES = [
  { id: 'R1', description: 'Publisher burst across distinct packages', weight: 3 },
  { id: 'R2', description: 'Install script appears in publication chain', weight: 2 },
  { id: 'R3', description: 'New or dormant publisher within known history', weight: 1 },
  { id: 'R4', description: 'Provenance attestation disappears', weight: 2 },
  { id: 'R5', description: 'Taint through publisher or exact lockfile resolution', weight: 0 },
] as const;
