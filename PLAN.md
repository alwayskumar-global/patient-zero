# Patient Zero — Build Plan

**Hackathon:** Relate by Neo4j Hackathon (relate.devpost.com) · Nov 11 – Dec 11, 2026 (end time/zone unconfirmed → treat as **Dec 10, 23:00 IST** internal cutoff)
**Judging:** Creativity · Usefulness · Completeness · Clarity · Effective use of connected context (equal weight)
**One-liner:** A local, replayable graph of how an npm supply-chain compromise spreads through publishers and packages, with a pre-install gate for your own lockfile and a held-out benchmark against real 2025 incidents.

---

## 1. Why this wins (and what each judging criterion gets)

| Criterion | What we show |
|---|---|
| Connected context | Taint propagates over `PUBLISHED_BY` → `Publisher` → other packages, and over `DEPENDS_ON` into the user's lockfile. Every verdict is a path, never a score. |
| Usefulness | `npx patient-zero gate` blocks a bad install in CI and explains the path. Works offline from a shipped `.rl` store. |
| Creativity | Replay: scrub a timeline and watch Shai-Hulud spread through the publisher graph hour by hour. Nobody ships an incident replayer. |
| Completeness | Judges clone → `npm i` → `npm run demo` → see the graph, the gate blocking, the benchmark numbers. No network required for the demo path. |
| Clarity | README leads with two numbers: recall on held-out incidents and false-positive rate on a quiet week. |

**Anchor incidents (verified):**
- **Sept 8, 2025 — chalk/debug.** Maintainer Qix phished via `npmjs.help`; 18–25 packages (chalk, debug, ansi-styles, strip-ansi, supports-color…) with ~2B weekly downloads got malicious versions within ~16 minutes of the phishing email. Signature: one publisher, many packages, minutes apart.
- **Sept 14–16, 2025 — Shai-Hulud.** Self-replicating worm starting at `rxnt-authentication` / `@ctrl/tinycolor`; stole npm tokens, enumerated every package the token could publish, republished them with a `postinstall` hook. 180+ packages in 48h, 500+ total, including CrowdStrike's scope. Signature: publisher-overlap spread + new install script.
- **Third incident (to confirm):** a later Shai-Hulud wave (Nov 2025) if the OSV data is clean; otherwise `tj-actions` is out of scope (GitHub Actions, not npm). Decide in Week 1.

---

## 2. Architecture

```
┌──────────────┐   packuments, OSV MAL-*     ┌──────────────────┐
│  ingest/     │ ──────────────────────────▶ │  Relate store    │
│  (fetch+cache)│                             │  patient-zero.rl │
└──────────────┘                             └────────┬─────────┘
        ▲                                             │ Cypher (embedded, Node)
        │ package-lock.json                           ▼
┌──────────────┐                             ┌──────────────────┐     ┌─────────────┐
│  gate CLI    │ ◀───── verdict + path ───── │  detect/ (rules) │ ──▶ │ bench/      │
│  npx patient-zero                          │  taint propagation│     │ replay+score│
└──────────────┘                             └────────┬─────────┘     └─────────────┘
                                                      │
                               ┌──────────────────────┴───────────────┐
                               ▼                                      ▼
                     ┌──────────────────┐                   ┌──────────────────┐
                     │ MCP server       │                   │ web/ (Next.js)   │
                     │ blast_radius()   │                   │ timeline replay  │
                     │ why_blocked()    │                   │ path explorer    │
                     │ safe_upgrade()   │                   │ (Claude Design)  │
                     └──────────────────┘                   └──────────────────┘
```

**Stack decision:** TypeScript end to end. npm tooling, `package-lock` parsing, the MCP SDK and the UI are all JS-native, and Relate ships a Node.js package. Python only if the Node binding turns out immature in Week 1 (fallback: Python ingest writing the same `.rl` file).

**Storage mode:** single file `patient-zero.rl`, committed to the repo. Reason (goes in README verbatim): one artifact per repo that CI can cache, diff and ship; judges open it with the Relate CLI without running anything.

---

## 3. Data sources and the one thing that will bite

| Need | Source | Auth | Notes |
|---|---|---|---|
| Package versions, publish timestamps, per-version publisher | npm registry packument `https://registry.npmjs.org/<pkg>` | none | `time{}` gives timestamps; each `versions[v]._npmUser` gives **who published that version** — this is how we reconstruct publisher history. `maintainers[]` is current-only, don't rely on it. |
| Install scripts, bundled size | packument `versions[v].scripts`, `dist.unpackedSize` | none | `postinstall`/`preinstall` presence + size delta are signals. |
| Known-malicious versions (ground truth) | OSV API `https://api.osv.dev/v1/query` (`MAL-*` advisories) + GitHub Advisory DB | none (GH GraphQL needs `GITHUB_TOKEN`, optional) | Benchmark labels only. Never used as a detection input. |
| Transitive closure of user's deps | the user's own `package-lock.json` (v2/v3) | none | No dependents API needed for the gate. |
| Ecosystem blast radius (optional, UI only) | deps.dev API (`api.deps.dev`) | none | Verify it exposes dependents for npm; if not, scope blast radius to "within this lockfile". |

**Critical: compromised versions were unpublished.** The malicious `chalk@5.6.1`, `debug@4.4.2`, Shai-Hulud versions etc. are **gone from packuments**. The replay graph therefore = surviving packument versions **+ incident versions injected from OSV `MAL-*` advisories and the published IOC lists** (StepSecurity, Wiz, Socket, Unit 42), with their publish timestamps from those reports. State this in the README under "How the replay data was reconstructed". If you skip this, the replay finds nothing and the benchmark is meaningless.

**Caching:** every fetched packument goes to `data/cache/<pkg>.json`. The shipped store is built from cache, so `npm run build:store` is reproducible offline. Large packuments (`@types/*`, `typescript`) can be 10–50 MB — stream-parse, keep only `time`, `versions[v].{_npmUser,scripts,dist,dependencies}`.

---

## 4. Graph schema (Relate, Cypher 25)

```cypher
(:Package {name, scope})
(:Version {pkg, semver, publishedAt, hasInstallScript, unpackedSize, provenance})
(:Publisher {npmUser, email?})          // from versions[v]._npmUser
(:Advisory {id, source, publishedAt})   // OSV MAL-*, benchmark labels only
(:Incident {slug, start, end})          // chalk-debug-2025-09, shai-hulud-2025-09
(:Lockfile {repo, hash, builtAt})
(:Rule {id, description, weight})
(:Finding {score, at})

(:Package)-[:HAS_VERSION]->(:Version)
(:Version)-[:PUBLISHED_BY {at}]->(:Publisher)
(:Version)-[:DEPENDS_ON {range}]->(:Package)
(:Version)-[:SUCCEEDS]->(:Version)               // prev version, for deltas
(:Lockfile)-[:RESOLVES]->(:Version)
(:Advisory)-[:FLAGS]->(:Version)                 // ground truth
(:Advisory)-[:PART_OF]->(:Incident)
(:Finding)-[:ON]->(:Version)
(:Finding)-[:TRIGGERED]->(:Rule)
(:Finding)-[:TAINTED_VIA]->(:Finding)            // propagation chain = the explanation path
```

**Temporal freezing** is a filter, not a copy: every detection query takes `$asOf` and matches only `Version.publishedAt <= $asOf`. That makes replay, benchmark and live mode the same code path.

---

## 5. Detection rules (graph signals, not package scores)

| Rule | Signal | Why it's a graph rule |
|---|---|---|
| R1 Burst | Same `Publisher` publishes ≥ N packages within W minutes (default N=5, W=60) | Needs the publisher → packages fan-out. Catches chalk/debug (18 pkgs in ~16 min) and Shai-Hulud waves. |
| R2 Script appears | `Version.hasInstallScript = true` and `SUCCEEDS` prev had `false` | Delta over the version chain. Catches Shai-Hulud postinstall. |
| R3 New publisher | `PUBLISHED_BY` user has never published this `Package` before, or not in > 180 days | Catches token-theft republishes; chalk/debug was the real maintainer so R3 alone misses it — R1 catches it. |
| R4 Provenance drop | Package previously had `provenance` attestations, new version has none | Delta over the chain. |
| R5 Taint propagation | Any version by a Publisher already carrying a Finding within W, or any `Version` depending on a flagged version resolved in the lockfile | This is the worm model. Score decays per hop; path is recorded as `TAINTED_VIA`. |

Score = weighted sum, threshold tuned on incident A only, then **held out** on incident B and the control week. Report both.

---

## 6. Benchmark harness (`bench/`)

1. `bench/incidents/*.json`: for each incident, the OSV/IOC version list with publish timestamps, plus `advisoryPublishedAt` (first public advisory).
2. For each incident: build the store with `$asOf = incident.start - 1h`, then step `$asOf` forward in 15-min ticks to `incident.end`, running detection each tick.
3. Metrics:
   - **Recall@advisory:** share of labelled versions flagged *before* `advisoryPublishedAt`.
   - **Lead time:** median minutes between our first Finding and the public advisory.
   - **Precision:** flagged versions that are in the label set.
   - **Control FP rate:** same pipeline on a quiet week (e.g. first week of Aug 2025) over the top-2,000 packages; report flags per 1,000 publishes.
4. Output `bench/results.md` with a table + the numbers for the README and video.

Threshold tuned on incident A; B and control are held out. Say this explicitly in the README — it's the Offleak lesson.

---

## 7. Gate CLI (`npx patient-zero`)

```
patient-zero gate [--lockfile package-lock.json] [--store patient-zero.rl] [--fail-on medium|high]
patient-zero explain <pkg>@<version>
patient-zero replay <incident-slug> [--speed 60]      # prints the timeline in the terminal
patient-zero build-store [--from-cache]
patient-zero mcp                                       # starts the MCP server
```

Exit code 1 on block. Output is the path:

```
BLOCKED  @ctrl/tinycolor@4.1.1
  your-app → ngx-bootstrap@20.0.1 → @ctrl/tinycolor@4.1.1
  R1  publisher "ctrl" republished 18 packages in 41 min   (2025-09-15T17:58Z)
  R2  postinstall added (none in 4.1.0)
  R5  tainted via rxnt-authentication@… (same publisher burst)
  safe: pin @ctrl/tinycolor@4.1.0 (published 2025-07-02, no findings)
```

**GitHub Action wrapper** (`action.yml`) that runs the gate on PRs — cheap to add, big on Usefulness.

---

## 8. MCP server

Two layers:
- **Relate's built-in MCP server** for raw Cypher (judges will appreciate seeing it used as-is).
- **`patient-zero mcp`** (TypeScript, `@modelcontextprotocol/sdk`) with three tools: `blast_radius(package, asOf?)`, `why_blocked(package, version)`, `safe_upgrade_path(package, fromVersion)`. Demo: Claude Code asks before bumping a dependency.

---

## 9. UI — Claude Design → code

The UI is built with the **Design artifact type in Claude** (list types → Design) when we reach Week 3, then exported and dropped into `web/` (Next.js, app router). Screens to design:

1. **Timeline replay** — horizontal scrubber over the incident window; publisher-centred graph; nodes light up as findings fire; side panel shows the rule chain for the selected node.
2. **Gate result** — terminal-style verdict card + path tree, used both in the web UI and as the README hero.
3. **Lockfile exposure** — your lockfile's packages, with flagged ones and their paths to root.
4. **Benchmark page** — the two headline numbers, per-incident recall/lead-time table, control FP rate.
5. **Video storyboard frames** — five frames for the 2-minute video, designed once and reused.

**Export path:** Design → React/HTML export → tokens (colour, type, spacing) and static layouts into `web/`. The animated graph itself is code, not export: **Sigma.js (WebGL)** for the publisher graph with the Design tokens applied; d3 for the scrubber. Don't try to export the animation from Design.

Design rule: the path is always visible. No verdict without its chain.

---

## 10. Repo layout

```
patient-zero/
  package.json                # workspaces
  packages/
    core/                     # Relate access, schema, detection rules, taint propagation
    ingest/                   # registry fetch + cache + OSV labels + incident injection
    cli/                      # patient-zero binary (gate/explain/replay/build-store/mcp)
    mcp/                      # MCP tools
  bench/
    incidents/*.json
    control/quiet-week.json
    results.md
  data/
    cache/                    # packuments (gitignored except the ~300 needed for replay)
  patient-zero.rl             # shipped store (committed)
  web/                        # Next.js UI
  action.yml                  # GitHub Action
  README.md
```

---

## 11. Setup checklist (don't skip)

- **Relate CLI:** `curl -sSfL https://relatedb.ai/install.sh | bash` (verifies signatures) — then `relate skill install --agent claude-code` so Claude Code uses it natively.
- **Relate Node package:** name to confirm from the repo README in Week 1 (`@relate/relate-wasm` is the browser build; the Node build is a separate npm package). Pin the version in `package.json` — the product is 5 days old and will move.
- **Python fallback:** `pip install relate-db` → `relate.connect("./patient-zero.rl")`.
- **Env vars:** none required for the demo path. Optional: `GITHUB_TOKEN` (GH Advisory GraphQL, higher rate limits), `PZ_CACHE_DIR` (default `./data/cache`), `PZ_AS_OF` (freeze timestamp for replay).
- **Secrets:** no npm tokens anywhere. Read-only registry access only. Never run `npm install` on incident packages inside the dev machine — ingest reads packuments, it never installs them.
- **Node ≥ 22**, pnpm or npm workspaces.
- **Repo:** public on GitHub from day one, Apache-2.0, Devpost topic tag (confirm the required tag with the hackathon manager; also confirm deadline time/zone and India eligibility — same email).
- **Rules compliance:** project started after Nov 11 — first commit dated ≥ Nov 17. Any reused code (none expected) disclosed in README.

---

## 12. Schedule (25 days)

| Week | Dates | Ship |
|---|---|---|
| 1 | Nov 17–23 | Ingest + cache; schema; `build-store`; incident A (chalk/debug) injected and replayable in the terminal; R1–R4 working; decision on third incident; Node package verified |
| 2 | Nov 24–30 | R5 taint propagation; benchmark harness; incident B + control week; **numbers in `bench/results.md`**; gate CLI with exit codes |
| 3 | Dec 1–7 | Claude Design screens → `web/`; Sigma.js replay; MCP server + Claude Code demo; GitHub Action |
| 4 | Dec 8–10 | README (numbers first), 2-minute video, Devpost submission by **Dec 10 23:00 IST** |

**Cut lines, in order:** GitHub Action → benchmark page in web UI (keep it in README) → third incident → MCP custom tools (keep Relate's built-in MCP) → Lockfile exposure screen.

---

## 13. 2-minute video

| Time | Beat |
|---|---|
| 0:00–0:15 | Sept 8 2025: one phished maintainer, 2B weekly downloads, 16 minutes. Attacks spread along edges; scanners score nodes. |
| 0:15–0:45 | Replay: Shai-Hulud spreading through the publisher graph, findings lighting up ahead of the advisory timestamp. |
| 0:45–1:15 | `npx patient-zero gate` blocks an install; the path explanation; safe pin suggested. |
| 1:15–1:35 | Claude Code asks `blast_radius` over MCP before a dependency bump. |
| 1:35–2:00 | The numbers: held-out recall, lead time vs advisory, control FP rate. Single-file Relate store, no server, runs in CI. |

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| Relate Node binding immature / API churn | Verify in day 1–2; Python ingest fallback writes the same `.rl` |
| Replay finds nothing because versions were unpublished | Inject from OSV + IOC lists (section 3); document it |
| Rules overfit incident A | Tune on A only; hold out B + control; publish both |
| Judges see "another vuln scanner" | Lead with replay + paths + held-out numbers; name Socket/Snyk and state the difference (local, path-level, replayable) |
| Packument size / rate limits | Stream-parse, cache, only ~300 packages needed for replay; lockfile mode fetches on demand |
| Deadline time unknown | Submit Dec 10 IST |

---

## 15. Open decisions (confirm before Week 1)

1. TypeScript end to end (recommended) vs Python ingest + TS CLI.
2. Third incident: later Shai-Hulud wave vs drop to two incidents + control.
3. Name: "Patient Zero" (clear, memorable, ties to the ReversingLabs phrasing on Shai-Hulud) — check npm/GitHub availability.
