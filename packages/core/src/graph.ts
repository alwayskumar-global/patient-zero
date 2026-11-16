import { createHash } from 'node:crypto';
import type { Connection, ParamValue } from '@relate/relate';
import { RULES, versionId, versionSchema, type Incident, type VersionRecord } from './model.js';
import { timestamp } from './model.js';
import { z } from 'zod';

export const SCHEMA_VERSION = 1;
export function initializeSchema(conn: Connection): void {
  for (const [label, prop] of [['Package', 'name'], ['Version', 'id'], ['Publisher', 'npmUser'], ['Incident', 'slug'], ['Advisory', 'id'], ['Rule', 'id'], ['Finding', 'id'], ['Lockfile', 'hash'], ['Store', 'id']]) {
    conn.query(`CREATE CONSTRAINT IF NOT EXISTS FOR (n:${label}) REQUIRE n.${prop} IS UNIQUE`);
  }
}

/** Fresh graph only. The caller publishes the store after this transaction commits. */
export function populateGraph(conn: Connection, versions: VersionRecord[], incidents: Incident[], datasetHash: string): void {
  initializeSchema(conn);
  if (Number(conn.query('MATCH (n) RETURN count(n) AS n').single().n) !== 0) throw new Error('Refusing to populate a nonempty graph');
  const records = versions.map(v => versionSchema.parse(v)).sort((a,b) => versionId(a).localeCompare(versionId(b)));
  if (new Set(records.map(versionId)).size !== records.length) throw new Error('Duplicate version identity');
  conn.begin();
  try {
    conn.query('CREATE (:Store {id: $id, schemaVersion: $version, datasetHash: $hash})', { id: 'patient-zero', version: SCHEMA_VERSION, hash: datasetHash });
    for (const rule of RULES) conn.query('CREATE (:Rule {id:$id, description:$description, weight:$weight})', { ...rule });
    for (const v of records) {
      const id = versionId(v);
      conn.query('MERGE (p:Package {name:$pkg}) SET p.scope=$scope', { pkg:v.pkg, scope:v.pkg.startsWith('@') ? v.pkg.split('/')[0]! : '' });
      conn.query(`MATCH (p:Package {name:$pkg}) CREATE (v:Version {id:$id, pkg:$pkg, semver:$semver, publishedAt:$publishedAt,
        hasInstallScript:$script, provenance:$provenance, unpackedSize:$size, metadataJSON:$json}) CREATE (p)-[:HAS_VERSION]->(v)`, {
        pkg:v.pkg, id, semver:v.semver, publishedAt:v.publishedAt, script:v.hasInstallScript, provenance:v.provenance, size:v.unpackedSize, json:JSON.stringify(v),
      });
      if (v.publisher !== null) conn.query(`MERGE (p:Publisher {npmUser:$publisher}) WITH p MATCH (v:Version {id:$id})
        CREATE (v)-[:PUBLISHED_BY {at:$at}]->(p)`, { publisher:v.publisher, id, at:v.publishedAt });
      for (const [pkg, range] of Object.entries(v.dependencies ?? {})) conn.query(`MERGE (p:Package {name:$pkg}) WITH p MATCH (v:Version {id:$id}) CREATE (v)-[:DEPENDS_ON {range:$range}]->(p)`, { pkg, range, id });
    }
    const byPackage = new Map<string, VersionRecord[]>();
    for (const v of records.filter(v => v.publishedAt !== null)) byPackage.set(v.pkg, [...(byPackage.get(v.pkg) ?? []), v]);
    for (const group of byPackage.values()) {
      group.sort((a,b) => a.publishedAt!.localeCompare(b.publishedAt!) || versionId(a).localeCompare(versionId(b)));
      for (let i = 1; i < group.length; i++) conn.query('MATCH (v:Version {id:$id}), (p:Version {id:$prev}) CREATE (v)-[:SUCCEEDS]->(p)', { id:versionId(group[i]!), prev:versionId(group[i-1]!) });
    }
    for (const incident of incidents) {
      conn.query('CREATE (:Incident {slug:$slug, start:$start, end:$end, role:$role, advisoryPublishedAt:$at})', { slug:incident.slug, start:incident.start, end:incident.end, role:incident.role, at:incident.advisoryPublishedAt });
      for (const label of incident.labels) {
        const id = `${incident.slug}:${label.advisoryId}`;
        conn.query(`MERGE (a:Advisory {id:$id}) SET a.source=$source, a.publishedAt=$at WITH a MATCH (i:Incident {slug:$slug}) MERGE (a)-[:PART_OF]->(i)`, { id, source:label.source, at:label.publishedAt, slug:incident.slug });
        conn.query('MATCH (a:Advisory {id:$id}), (v:Version {id:$version}) MERGE (a)-[:FLAGS]->(v)', { id, version:versionId(label) });
      }
    }
    conn.commit();
  } catch (error) { conn.rollback(); throw error; }
}

export function assertSchema(conn: Connection): void {
  const rows = conn.query('MATCH (s:Store {id:$id}) RETURN s.schemaVersion AS version', { id:'patient-zero' }).rows;
  if (rows.length !== 1 || rows[0]!.version !== SCHEMA_VERSION) throw new Error('Missing or incompatible Patient Zero store schema');
}

/** Internal boundary for an already-resolved lockfile. Does not resolve ranges. */
export function attachResolvedDependencies(conn:Connection, input:unknown):void {
  assertSchema(conn);
  const data = z.object({ hash:z.string().regex(/^[a-f0-9]{64}$/),repo:z.string().min(1),builtAt:timestamp,
    versions:z.array(z.string()).min(1),edges:z.array(z.object({ from:z.string(),to:z.string() }).strict()),
  }).strict().parse(input);
  const ids = new Set(data.versions);
  for (const edge of data.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('Dependency endpoints must be resolved by this lockfile');
  for (const id of ids) if (conn.query('MATCH (v:Version {id:$id}) RETURN v.id AS id', { id }).rows.length !== 1) throw new Error(`Resolved version outside store coverage: ${id}`);
  if (conn.query('MATCH (l:Lockfile {hash:$hash}) RETURN l.hash AS hash', { hash:data.hash }).rows.length) throw new Error('Lockfile resolution already exists');
  conn.begin();
  try {
    conn.query('CREATE (:Lockfile {hash:$hash, repo:$repo, builtAt:$builtAt})', { hash:data.hash,repo:data.repo,builtAt:data.builtAt });
    for (const id of ids) conn.query('MATCH (l:Lockfile {hash:$hash}), (v:Version {id:$id}) CREATE (l)-[:RESOLVES]->(v)', { hash:data.hash,id });
    for (const edge of data.edges) conn.query('MATCH (a:Version {id:$from}), (b:Version {id:$to}) MERGE (a)-[:RESOLVED_DEPENDS_ON {lockfileHash:$hash}]->(b)', { ...edge,hash:data.hash });
    conn.commit();
  } catch(error) { conn.rollback(); throw error; }
}

export const digest = (value: string): string => createHash('sha256').update(value).digest('hex');
export function queryRows(conn: Connection, cypher: string, params: Record<string, ParamValue>): Record<string, unknown>[] {
  return conn.query(cypher, params).rows;
}
