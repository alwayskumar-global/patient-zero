// Test-only data. Never use these fixtures for incident performance claims.
export function version(pkg, semver, publishedAt, changes = {}, observedAt = publishedAt) {
  const value = { pkg,semver,publishedAt,publisher:'alice',hasInstallScript:false,provenance:true,unpackedSize:100,dependencies:{},...changes };
  value.evidence = {};
  for (const field of ['publishedAt','publisher','hasInstallScript','provenance','unpackedSize','dependencies']) {
    if (value[field] !== null) value.evidence[field] = { source:'https://example.invalid/synthetic',kind:'synthetic',observedAt };
  }
  return value;
}
export const at = minute => `2025-09-08T13:${String(minute).padStart(2,'0')}:00.000Z`;
export const old = '2025-01-01T00:00:00.000Z';
