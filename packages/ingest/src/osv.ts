import { z } from 'zod';
import { packageName, versionName, timestamp, incidentSchema } from '@patient-zero/core';

const advisorySchema = z.object({ id:z.string(),published:timestamp.optional(),withdrawn:z.string().optional(),
  affected:z.array(z.object({ package:z.object({name:z.string(),ecosystem:z.string()}).passthrough(),versions:z.array(z.string()).optional() }).passthrough()).default([]),
}).passthrough();
const responseSchema = z.object({ vulns:z.array(advisorySchema).default([]), next_page_token:z.string().optional() }).passthrough();
type Label = z.infer<typeof incidentSchema>['labels'][number];

/** Exact version labels only. A range-only result is not fabricated into a label. */
export async function fetchMalwareLabels(pkgInput:string, versionInput:string):Promise<Label[]> {
  return fetchLabels(pkgInput,versionInput);
}
export async function fetchPackageMalwareLabels(pkgInput:string):Promise<Label[]> {
  return fetchLabels(pkgInput);
}
async function fetchLabels(pkgInput:string, versionInput?:string):Promise<Label[]> {
  const pkg = packageName.parse(pkgInput), version = versionInput===undefined?undefined:versionName.parse(versionInput);
  const labels = new Map<string,Label>();
  let pageToken:string|undefined;
  const tokens = new Set<string>();
  for (let page=0; page<10; page++) {
    const response = await fetch('https://api.osv.dev/v1/query', { method:'POST',
      headers:{ 'Content-Type':'application/json','User-Agent':'patient-zero/0.0.0 (benchmark labels only)' },
      body:JSON.stringify({package:{name:pkg,ecosystem:'npm'},...(version?{version}:{}),...(pageToken ? {page_token:pageToken} : {})}),
      signal:AbortSignal.timeout(30_000),redirect:'error',
    });
    if (!response.ok || !response.body) throw new Error(`OSV HTTP ${response.status}`);
    let size=0; const chunks:Uint8Array[]=[];
    for await (const chunk of response.body) { size+=chunk.length; if (size>4*1024*1024) throw new Error('OSV response exceeds 4 MiB'); chunks.push(chunk); }
    const data=responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    for (const advisory of data.vulns) {
      if (!advisory.id.startsWith('MAL-') || advisory.withdrawn) continue;
      for(const affected of advisory.affected){
        if(affected.package.ecosystem!=='npm'||affected.package.name!==pkg)continue;
        for(const semver of affected.versions??[]){
          if(version!==undefined&&semver!==version)continue;
          if(!versionName.safeParse(semver).success)continue;
          labels.set(`${advisory.id}:${semver}`,{pkg,semver,advisoryId:advisory.id,source:`https://osv.dev/vulnerability/${encodeURIComponent(advisory.id)}`,publishedAt:advisory.published??null});
        }
      }
    }
    pageToken=data.next_page_token;
    if (!pageToken) return [...labels.values()].sort((a,b)=>a.advisoryId.localeCompare(b.advisoryId));
    if (tokens.has(pageToken)) throw new Error('OSV pagination loop'); tokens.add(pageToken);
  }
  throw new Error('OSV pagination exceeds 10 pages');
}
