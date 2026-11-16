# Project status — November 16, 2026

## Completed in this milestone

- Full pinned September Shai-Hulud reference union: **197 packages / 516 versions**, sourced from the StepSecurity table and Wiz appendix, including hidden rows. Exact OSV MAL labels cover 515 versions; one remains IOC-only. All reference identities are represented, including unavailable metadata. No global exhaustiveness claim is made.
- Normalized Shai-Hulud snapshot: 1,088 version records; 513 reference publication times, zero recovered reference publisher/script states. Three Yoobic packages are unavailable. Unsupported metadata recovery was rejected rather than assumed correct.
- Pre-control 2,000-package cohort from a June 2025 download-ranked list, captured and compacted to 5,006 records. All selected packages completed; 14 malformed historical fields are explicit unknowns. There are 438 known in-week publishes.
- Pure package-lock v2/v3 parser: nested/hoisted resolutions, scopes, aliases, peers, optional dependencies, dev dependencies and declared internal workspaces. Rejects unsupported origins/formats, required resolution gaps, escaping links, unreachable descriptors and archive/version identity mismatches. No filesystem traversal or install is used to resolve a lockfile.
- Read-only offline gate CLI with exact root paths and installation-instance taint. Exit 0 means policy pass within covered fresh metadata; 1 means block; 2 means incomplete/operational failure. Default mode is evidence, fail-on medium and maximum evidence age 168 hours. Missing facts never yield an allow. No safe upgrade is inferred. Projected/unmarked stores and unknown history needed for applicable delta rules cannot authorize an allow.
- Explicit ingest-lockfile and integrity-checked snapshot-to-store build path for current public-registry application metadata. Private/non-registry sources fail before collection; no authentication workaround exists.
- Combined shipped `patient-zero.rl`: **1,574 version identities**, both incident nodes and their source-separated advisory labels. Offline no-clobber rebuild via `data/demo.json`.
- Incident-A-only candidate selection, immutable freeze profile with training/code/config fingerprints, held-out/control evaluation and reproducible Markdown/JSON results. Event-time evaluation is sampled onto 15-minute replay ticks and checked against literal replay.

## Quality result: production acceptance not met

Frozen parameters remained the defaults. Incident-A end-window reference recall is 18/18 and reference precision 18/28. Held-out Shai-Hulud reference recall is **0/516**. The quiet-week proxy alert rate is **289/438 = 659.82 per 1,000 known publishes**. These are retrospective data-pipeline results, not evidence of successful pre-advisory detection.

Removed manifests leave the held-out reference without per-version publisher/script observations. R1 also confuses legitimate coordinated releases with attack fan-out. No advisory-derived script/publisher flags, label-based allowlists or held-out-driven retuning have been added. First-public-advisory recall and lead time remain null because exact first public cutoffs are unverified; OSV-relative results are explicitly separate. Evidence-time visibility at historical cutoffs is zero.

See `bench/results.md`, `bench/results.json`, `bench/frozen-config.json` and `bench/ASSESSMENT.md`. Execution success does not constitute detector acceptance or commissioning. Further classifier work needs independent metadata/signals and a separately identified experiment with fresh held-out acceptance.

## Validation

On Node 22.23.5 and Node 25.9.0 / npm 11.12.1, 54 tests pass, including registry/OSV normalization, checksum/coverage failures, temporal rules, unknown-state handling, path-instance isolation, lockfile variants, gate 0/1/2 exit codes, stale/future coverage rejection, read-only operation, current snapshot builds, freeze guards and event/literal replay equivalence. Native single-file persistence/read-only smoke checks pass.

The full held-out/control benchmark ran with fetch disabled after its profile was frozen. Live collection fetched public metadata only; no incident archives or code were installed/executed. Node 22 also passed a clean-install rebuild, all 54 tests and native persistence/read-only smoke. Windows and byte-for-byte native database serialization have not been separately verified. These checks prove implementation behavior, not detector quality.

## Owner UI integration

The November 16 owner HTML archive is integrated into a Next.js workspace. Replay uses Sigma/Graphology and a d3 timeline; Gate, Lockfile, scoped-package Explain and Benchmark read actual backend contracts. The supplied tokens, typography, light/dark themes and screen layouts are retained, with responsive views and a keyboard-accessible findings drawer. Original static galleries are preserved in `web/design/`; archive builders were not executed.

Historical demo and current evidence-time assessment are explicitly distinct. Uploads reset to evidence/current UTC, remain in memory and are bounded by body and installation-count limits. No install, safe-pin, ignore override or mock MCP operation is offered. Unknown publishers are not grouped into fabricated common publishers. Benchmark figures are the measured failed assessment, replacing illustrative design claims.

The server binds loopback, enforces Host/Origin checks, requires a same-origin POST, rejects oversized/malformed requests, and reads its configured store without mutation. Metadata changes require a server restart. No environment or secret is required; optional server-only `PZ_PROJECT_ROOT` and `PZ_WEB_STORE`, dependency setup and execution order are in `web/README.md`. Root scripts cover dev, production build/start, typecheck and Chromium tests. Public deployment/authentication has not been implemented.

Production build on Node 22, web TypeScript, 54 backend/integration tests and native smoke checks pass. The frozen detector code fingerprint is unchanged. All five Chromium end-to-end tests pass against the production server: replay/time/mode switching; actual gate block, exact paths, state navigation and evidence-time upload reset; measured benchmark and encoded scoped-package Explain; theme/store dialog/drawer focus and 1440/1024/390-width layouts; API Host/Origin rejection, malformed/oversized/2,000-location limits, connection recovery and byte-identical store after assessments. Browser requests to external hosts were blocked. Automated responsive checks do not replace owner visual acceptance. MCP and the Action are now implemented and verified locally as described below. The requested video/storyboard is excluded; GitHub publication/CI evidence is recorded in `docs/CI.md`; submission remains an owner action.

## MCP, Action and runnable demo

Three read-only SDK stdio tools are implemented: `blast_radius`, `why_blocked`, and `safe_upgrade_path`. Actual client/server protocol tests cover sourced rule chains, exact paths, masking, invalid-call recovery and store immutability. Full candidate-lock policy qualification has positive fresh synthetic coverage and negative stale/unknown/retrospective/origin/root/version cases. No safe pin is inferred. Config examples and setup are in `packages/mcp/README.md` and `config/mcp*.example.json`.

Relate built-in stdio MCP was actually verified with a signature/checksum-checked temporary 1.0.1 CLI: 1,574 versions, schema, no advertised write tool, rejected write statement and unchanged bytes. Global host configuration was not modified.

`action.yml` and its runner preserve exit 0/1/2, trusted action dependencies, bounded subprocess execution, private local reports, escaped summaries and realpath restrictions. Its installation/build sequence was reproduced in the clean source check. `.github/workflows/ci.yml` configures backend/native/benchmark, UI and intentional historical-action regression jobs with read-only permissions and pinned external action SHAs. The implementation is now published on `main`. Hosted Linux and macOS backend/benchmark, production UI and the real composite Action regression all passed on Node 22.23.4; exact run/commit evidence is recorded in `docs/CI.md`.

`npm run demo` now checks the engine, replays A, demonstrates the historical gate block, prints real benchmark figures, then serves the owner UI on loopback. It was started and rendered in Chromium. Terminal-only/no-server variants are documented. CLI also supports paced replay and defaults Explain to current evidence time. AI/data/font notices and prepared submission copy are present. Full requirement evidence is in `docs/COMPLETION.md`.

## Repository and setup boundaries

The completed development revision is published to GitHub `main`. The original MIT license and actual Git timestamps are retained. No environment variable or secret is required for demo, tests, public npm/OSV metadata collection or benchmark. All dependencies are pinned in workspace manifests/root lockfile, including the MCP SDK 1.32.2, semver 7.8.6, native Relate 1.0.1 and the UI packages. No secrets are required; optional settings are explicitly documented. Snapshot/data refresh changes checksums and can invalidate the frozen experiment; ordinary builds read pinned data only.

## Hackathon corrections retained

[Official rules](https://relate.devpost.com/rules), checked November 16, 2026: work may start November 11. Deadline is December 11 at 18:00 PST / December 12 at 07:30 IST; internal cutoff remains December 10 at 23:00 IST. Required GitHub topic is `relate`, with `relate-neo4j-hackathon` recommended. Topics have not been changed. Team limit is 1–4, with significant AI use and third-party materials disclosed. Registration, individual eligibility and submission remain owner tasks.
