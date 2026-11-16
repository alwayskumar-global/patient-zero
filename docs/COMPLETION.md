# Development completion audit

Scope: complete the development in `PLAN.md`, excluding the 2-minute video and its storyboard. Audited November 16, 2026 against current source and executable behavior. The original plan remains unchanged; resolved choices and unsupported illustrative claims are explained in `docs/DECISIONS.md`.

## Requirement evidence

| Plan requirement | Current authoritative evidence | Outcome |
| --- | --- | --- |
| §1 End-to-end clone/install/demo, two headline metrics, connected explanations | Root npm scripts, `scripts/demo.mjs`, README, `bench/results.json`, actual gate/replay screenshots in `docs/images/`; demo was started and rendered in Chromium | Implemented and locally verified |
| §2 TypeScript workspaces, embedded Relate, one portable artifact | Root/leaf package manifests, `patient-zero.rl`, `scripts/relate-smoke.mjs`; native persistent/read-only checks passed on Node 22.23.5 and 25.9.0 | Implemented; no database server needed |
| §3 Public packument ingestion, per-version publisher/script/size/provenance, OSV labels, unpublished-version reconstruction | `packages/ingest/src/`, cache manifests and per-field source/observedAt metadata; registry/OSV/integrity tests; source notices | Implemented; missing removed fields stay unknown |
| §3 Cache/stream large metadata and rebuild offline | Stream normalization tests, integrity-checked source caches, `build-store --from-cache`, combined `data/demo.json`, CLI no-clobber/offline reconstruction tests | Implemented; native binary serialization need not be identical |
| §4 Nodes, edges and schema constraints | `packages/core/src/{model,graph}.ts`, `docs/GRAPH.md`, native store/schema queries; finding persistence and exact lock resolution tests | Implemented; advisory labels are separate ground truth |
| §4 Temporal filtering and shared detection path | `detect` asOf/mode contracts and tests; CLI, web and MCP call the same frozen detector | Implemented; later-observed evidence is masked |
| §5 R1 burst, R2 script delta, R3 publisher change/dormancy, R4 provenance drop | Core detector tests for thresholds/windows, predecessors, missing fields and time-order isolation | Implemented |
| §5 R5 publisher/dependency propagation with recorded decay/path | Core propagation/persistence tests and gate physical-instance isolation tests | Implemented; no range guessing |
| §6 A-only tuning, held-out B/control, 15-minute replay, metrics and result artifacts | `bench/spec.json`, immutable `bench/frozen-config.json`, fingerprint guards/equivalence tests, `bench/results.{json,md}`, `bench/ASSESSMENT.md` | Implemented; first-public-advisory metrics explicitly unverified/null |
| §6 2,000-package quiet-week denominator and honest reporting | Pinned pre-control cohort/source/hash, 438 known window publications / 289 flags; Node 22 offline rerun reproduced results | Implemented; assumed benign proxy, not independently labelled clean publishes |
| §7 CLI binary, gate/explain/replay/build-store/MCP, exit 1 block and exact path | Stable install-time `packages/cli/bin/patient-zero.mjs`, CLI source, 0/1/2 tests, encoded identities, no network/mutation checks | Implemented; `npx --no-install patient-zero` verified after clean install/build |
| §7 Replay speed and default explanation | `--step-minutes` sampling, optional `--speed` playback factor, invalid/fast speed tests; Explain defaults to current evidence time and is tested without a freeze argument | Implemented |
| §7 GitHub Action wrapper | `action.yml`, `scripts/action.mjs`, `tests/action.test.mjs`; trusted install/build sequence reproduced from a clean source copy | Implemented; local 0/1/2/path/escape tests and hosted historical Action regression pass (see `docs/CI.md`) |
| §8 Relate built-in raw MCP | Signature/checksum-verified temporary Relate 1.0.1 CLI; `scripts/verify-relate-mcp.mjs` actually reads 1,574 versions, fetches schema, verifies write-tool omission, rejects write statements, compares store bytes | Verified read-only stdio integration |
| §8 Three custom tools and before-upgrade walkthrough | `packages/mcp/src/`, config examples and MCP README; SDK client performs real stdio initialize/list/call/error/recovery against CLI | Implemented; no HTTP listener or raw write query |
| §8 Blast radius and why-blocked paths | Actual publisher overlap and exact reverse installation paths; unknown publishers do not link; rule evidence/source chain returned | Implemented with explicit graph/lock scope |
| §8 Upgrade path | Candidate-policy pass tested on full fresh synthetic lock; stale/unknown/origin/root/not-newer/retrospective cases reject; real incident walkthrough refuses invented safe pins | Implemented as evidence-constrained assessment, not proof of safety |
| §9 Owner UI export and tokens, replay graph/scrubber, gate path, lock exposure, benchmark | Original archive references in `web/design/`, Next App Router components, Sigma/Graphology/d3 dependencies, local IBM fonts, production build and five browser tests | Implemented; real measurements replace mock design metrics |
| §9 Responsive/themes/unknown evidence | Chromium desktop/tablet/mobile bounds, theme/dialog/drawer keyboard focus, masked replay and scoped Explain tests; static screenshots of real application | Verified automated behavior; owner visual acceptance remains a review task |
| §10 Repo layout and artifacts | `packages/{core,ingest,cli,mcp,bench}`, `bench/`, normalized `data/`, `web/`, root `.rl`, Action and README | Present |
| §11 Setup, dependencies, environment, no npm secrets/incident installs | README, `.env.example`, workspace lockfile, web/MCP/Action setup docs; pure metadata fixture use; no required secrets/env file | Documented and locally verified |
| §11 Native package/CLI choice | Node/native package pinned 1.0.1; optional standalone CLI signature verified and actual MCP used | Python fallback unnecessary; global agent skill installation is optional host tooling |
| §11 License, actual project dates and rules corrections | Original MIT LICENSE retained; initial commit is November 16, 2026; official rules allow November 11 onward; data/font/AI notices added | No backdating or silent relicensing |
| §12 Schedule/deliverables | Development artifacts complete ahead of the proposed schedule; no fictional milestone dates | Schedule is planning context |
| §13 Video/storyboard | Excluded explicitly by owner goal | Not created or claimed |
| §14 Risks | Stream limits/checksums, read-only/no-clobber stores, honest missing-data/quality assessment, frozen fingerprints, exact lock instances | Implemented mitigations; poor detector discrimination remains visible |
| §15 Open choices | TypeScript selected; two incidents plus control; owner-selected name; local private bin avoids public npm collision | Resolved in `docs/DECISIONS.md` |

## Executed validation

- **54/54 tests pass**, including ingestion, graph/detection, lockfile/gate, frozen benchmark guards, actual custom MCP stdio and Action runner checks.
- **Clean installation verified:** copied only repository source/reviewed artifacts, installed with lifecycle scripts disabled, explicitly rebuilt Koffi, removed generated compiler output, then ran full build/tests/native smoke on **Node 22.23.5**. Stable local npx bin also works. Root development runtime Node 25.9.0 also passed the 54 tests.
- **Production Next build and web typecheck pass**; **5/5 Chromium tests pass against the Node 22 production server**. The one-command dev demo was separately started and rendered/tested.
- **Raw Relate MCP verification passes** with the pinned signature-checked CLI; no global host settings or skills were modified.
- **Frozen experiment rerun offline on Node 22 passes its integrity/fingerprint gates** and reproduces A 18/18 recall, B 0/516 recall, and control 289/438 flags (659.82/1,000). Detector hash remains `0edfba0bb4a38e139d6502a61dd46336b4866767e3d4201e8df5bcab9566b7ce`. No held-out-driven retuning occurred.
- Both Action/workflow YAML files parse; official checkout/setup-node versions are pinned to resolved commit SHAs. Hosted Linux and macOS backend/benchmark, production UI and Action execution all passed; exact run, commit and per-job evidence are in `docs/CI.md`.

## Development completion versus acceptance/release

The software deliverables above are implemented and locally verified. This audit does not claim detector quality acceptance: held-out recall is zero, proxy alert rate is high, and true pre-advisory performance is unestablished. No safe pin, public service, production commissioning or unattended install assurance is provided.

GitHub publication and hosted CI evidence are recorded in `docs/CI.md`. npm/Action releases, GitHub topics/account configuration, eligibility/registration and Devpost submission remain owner release actions. Prepared copy is in `docs/SUBMISSION.md`. Original Git timestamps and licensing remain intact. The requested video/storyboard is excluded.
