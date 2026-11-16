import {cacheSchema,timestamp,type CacheRecord,versionId} from '@patient-zero/core';

/** Preserve full publisher history summaries and immediate predecessor, plus all
 * events in the context window. Intended for fixed-window, no-lockfile benchmarks. */
export function compactForWindow(cache:CacheRecord, startInput:string, endInput:string, lookbackMinutes=300):CacheRecord {
  const start=timestamp.parse(startInput),end=timestamp.parse(endInput);
  if(start>=end || !Number.isFinite(lookbackMinutes) || lookbackMinutes<300) throw new Error('Invalid compact window or insufficient default-rule lookback');
  const context=new Date(Date.parse(start)-lookbackMinutes*60_000).toISOString();
  const kept=new Map<string,CacheRecord['versions'][number]>(), lastPublisher=new Map<string,CacheRecord['versions'][number]>();
  for(const v of [...cache.versions].sort((a,b)=>(a.publishedAt??'').localeCompare(b.publishedAt??'') || versionId(a).localeCompare(versionId(b)))) {
    if(v.publishedAt===null || (v.publishedAt>=context && v.publishedAt<end)) kept.set(versionId(v),v);
    else if(v.publishedAt<context) lastPublisher.set(v.publisher??'\0unknown',v);
  }
  for(const v of lastPublisher.values()) kept.set(versionId(v),v);
  return cacheSchema.parse({...cache,projection:{start,end,lookbackMinutes,originalVersionCount:cache.versions.length},versions:[...kept.values()].sort((a,b)=>versionId(a).localeCompare(versionId(b)))});
}
