// Explicit metadata-only catalog preparation. Never downloads package archives.
import { mkdir, writeFile } from 'node:fs/promises';
import { fetchMalwareLabels as labelsFor } from '../packages/ingest/dist/index.js';
const iocs = [
 ['backslash','0.2.1'],['chalk-template','1.1.1'],['supports-hyperlinks','4.1.1'],['has-ansi','6.0.1'],
 ['simple-swizzle','0.2.3'],['color-string','2.1.1'],['error-ex','1.3.3'],['color-name','2.0.1'],
 ['is-arrayish','0.3.3'],['slice-ansi','7.1.1'],['color-convert','3.1.1'],['wrap-ansi','9.0.1'],
 ['ansi-regex','6.2.1'],['supports-color','10.2.1'],['strip-ansi','7.1.1'],['chalk','5.6.1'],['debug','4.4.2'],['ansi-styles','6.2.2'],
];
const observedAt = new Date().toISOString();
const source = 'https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised';
const publisherSource = 'https://www.wiz.io/blog/widespread-npm-supply-chain-attack-breaking-down-impact-scope-across-debug-chalk';
const labels = [];
for(const [pkg,version] of iocs) {
 const osv=await labelsFor(pkg,version);
 labels.push(...(osv.length ? osv : [{pkg,semver:version,advisoryId:`IOC:${pkg}@${version}`,source,publishedAt:null}]));
}
const incident={schemaVersion:1,slug:'chalk-debug-2025-09',role:'tuning',start:'2025-09-08T13:00:00.000Z',end:'2025-09-08T16:00:00.000Z',advisoryPublishedAt:null,advisorySource:source,
 notes:'18-version IOC list from Aikido. Publisher qix is reconstructed from campaign-level Qix account attribution reported by Wiz, not recovered per-version _npmUser. Unknown script, dependency, size and provenance fields remain null. Surviving registry time entries supply publication timestamps during merge. OSV publication timestamps are label-specific, not the first public advisory; the incident-wide first public disclosure timestamp remains unverified. Retrospective replay cannot establish pre-advisory detection.',
 packages:iocs.map(([pkg])=>pkg).sort(),reconstructions:iocs.map(([pkg,semver])=>({pkg,semver,publishedAt:null,publisher:'qix',hasInstallScript:null,provenance:null,unpackedSize:null,dependencies:null,evidence:{publisher:{source:publisherSource,observedAt,kind:'report'}}})),labels};
await mkdir('bench/incidents',{recursive:true});
for(const value of [incident]) await writeFile(`bench/incidents/${value.slug}.json`,JSON.stringify(value,null,2)+'\n');
console.log(`Prepared incident-A catalog: ${labels.length} labels. Held-out catalog is untouched.`);
