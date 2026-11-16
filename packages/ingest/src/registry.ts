import { createHash } from 'node:crypto';
import { JSONParser } from '@streamparser/json';
import { z } from 'zod';
import { cacheSchema, packageName, timestamp, versionName, type CacheRecord, type Evidence, type VersionRecord } from '@patient-zero/core';

const object = (v:unknown):Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
const manifestSchema = z.object({
  name:z.string().optional(), version:z.string().optional(),
  _npmUser:z.object({ name:z.string().optional(), trustedPublisher:z.unknown().optional(), approver:z.object({ name:z.string() }).optional() }).passthrough().optional(),
  scripts:z.unknown().optional(), dependencies:z.unknown().optional(),
  dist:z.object({ unpackedSize:z.number().int().nonnegative().optional(), attestations:z.unknown().optional() }).passthrough().optional(),
  gypfile:z.boolean().optional(),
}).passthrough();

/** Consumes a bounded stream. Only one full version manifest is retained at a time. */
export async function normalizePackument(pkgInput:string, chunks:AsyncIterable<Uint8Array>, fetchedAtInput:string, maxBytes = 64*1024*1024):Promise<CacheRecord> {
  const pkg = packageName.parse(pkgInput), fetchedAt = timestamp.parse(fetchedAtInput);
  const source = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const evidence:Evidence = { source, observedAt:fetchedAt, kind:'registry' };
  const manifests = new Map<string, Omit<VersionRecord,'publishedAt'>>(), times = new Map<string,string>();
  const warnings:{version:string;field:string;reason:string}[]=[];
  let name:unknown, total = 0;
  const hash = createHash('sha256');
  const parser = new JSONParser({ paths:['$.name','$.versions.*','$.time.*'], keepStack:false, stringBufferSize:65536 });
  parser.onValue = ({ value, key, stack }) => {
    if (stack.length === 1 && key === 'name') { name = value; return; }
    const parentKey = stack.at(-1)?.key;
    if (typeof key !== 'string' || !versionName.safeParse(key).success) return;
    if (parentKey === 'time') {
      if (times.has(key)) throw new Error(`Duplicate publication timestamp: ${key}`);
      times.set(key, timestamp.parse(value)); return;
    }
    if (parentKey !== 'versions') return;
    if (manifests.has(key)) throw new Error(`Duplicate version manifest: ${key}`);
    const manifest = manifestSchema.parse(value);
    if ((manifest.name && manifest.name !== pkg) || (manifest.version && manifest.version !== key)) throw new Error('Registry version identity mismatch');
    // OIDC's generic "GitHub Actions" identity is not a unique npm publisher.
    const rawPublisher = manifest._npmUser?.trustedPublisher ? manifest._npmUser.approver?.name ?? null : manifest._npmUser?.name ?? null;
    const publisher = rawPublisher && rawPublisher.trim() && rawPublisher.length<=256 && !/[\x00-\x1f\x7f]/.test(rawPublisher) ? rawPublisher : null;
    if(rawPublisher!==null && publisher===null)warnings.push({version:key,field:'publisher',reason:'Invalid historical publisher preserved as unknown'});
    const scripts = z.record(z.string(),z.string()).safeParse(manifest.scripts ?? {});
    const dependencies = z.record(packageName,z.string()).safeParse(manifest.dependencies ?? {});
    if(!scripts.success)warnings.push({version:key,field:'hasInstallScript',reason:'Malformed historical scripts preserved as unknown'});
    if(!dependencies.success)warnings.push({version:key,field:'dependencies',reason:'Malformed historical dependency map preserved as unknown'});
    const install = scripts.success ? ['preinstall','install','postinstall'].some(k => Object.hasOwn(scripts.data,k)) : null;
    const attestation = object(object(manifest.dist?.attestations).provenance);
    const provenance = typeof attestation.predicateType === 'string';
    manifests.set(key, {
      pkg, semver:key, publisher, hasInstallScript:manifest.gypfile === true ? true : install,
      provenance, unpackedSize:manifest.dist?.unpackedSize ?? null, dependencies:dependencies.success?dependencies.data:null,
      evidence:{ ...(publisher ? {publisher:evidence} : {}), ...(install!==null||manifest.gypfile===true?{hasInstallScript:evidence}:{}), provenance:evidence, ...(dependencies.success?{dependencies:evidence}:{}), ...(manifest.dist?.unpackedSize !== undefined ? {unpackedSize:evidence} : {}) },
    });
  };
  for await (const chunk of chunks) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new Error(`Packument exceeds ${maxBytes} byte limit`);
    hash.update(chunk); parser.write(chunk);
  }
  if (!parser.isEnded) parser.end();
  if (!parser.isEnded || name !== pkg || times.size === 0) throw new Error('Incomplete packument or wrong package identity');
  const versions:VersionRecord[] = [];
  for (const semver of new Set([...times.keys(), ...manifests.keys()])) {
    const manifest = manifests.get(semver), publishedAt = times.get(semver) ?? null;
    versions.push({ ...(manifest ?? { pkg,semver,publisher:null,hasInstallScript:null,provenance:null,unpackedSize:null,dependencies:null,evidence:{} }),
      publishedAt, evidence:{ ...manifest?.evidence, ...(publishedAt ? {publishedAt:evidence} : {}) } });
  }
  versions.sort((a,b) => a.semver.localeCompare(b.semver));
  return cacheSchema.parse({ schemaVersion:1,pkg,source,fetchedAt,sourceSha256:hash.digest('hex'),versions,...(warnings.length?{normalizationWarnings:warnings}:{}) });
}

export async function fetchPackument(pkg:string, options:{allowMissing?:boolean} = {}):Promise<CacheRecord> {
  packageName.parse(pkg);
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
    headers:{ Accept:'application/json', 'User-Agent':'patient-zero/0.0.0 (metadata-only)' }, redirect:'error', signal:AbortSignal.timeout(60_000),
  });
  if (response.status === 404 && options.allowMissing) {
    await response.body?.cancel();
    return cacheSchema.parse({schemaVersion:1,pkg,source:`https://registry.npmjs.org/${encodeURIComponent(pkg)}`,fetchedAt:new Date().toISOString(),
      sourceSha256:createHash('sha256').update('HTTP 404').digest('hex'),availability:'not-found',versions:[]});
  }
  if (!response.ok || !response.body) throw new Error(`Registry HTTP ${response.status} for ${pkg}`);
  return normalizePackument(pkg, response.body, new Date().toISOString());
}
