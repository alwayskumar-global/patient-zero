# Graph and detection contract

## Schema version 1

`Store {id: patient-zero, schemaVersion: 1, datasetHash}` identifies compatible stores. Unique constraints cover Package.name, Version.id, Publisher.npmUser, Incident.slug, Advisory.id, Rule.id, Finding.id and Lockfile.hash. Schema creation is idempotent. Population requires an empty graph and commits as a single transaction.

| Node | Key fields |
| --- | --- |
| Package | name, scope |
| Version | id (`pkg@semver`), pkg, semver, publishedAt, hasInstallScript, provenance, unpackedSize, metadataJSON |
| Publisher | npmUser |
| Incident | slug, start, end, role, advisoryPublishedAt |
| Advisory | id (incident-qualified), source, publishedAt |
| Rule | id, description, weight |
| Finding | id, runId, score, at, resultJSON |
| Lockfile | hash, repo, builtAt |

Edges follow the plan: HAS_VERSION, PUBLISHED_BY {at}, DEPENDS_ON {range}, SUCCEEDS (new publication → preceding publication), RESOLVES, FLAGS, PART_OF, ON, TRIGGERED, TAINTED_VIA. **RESOLVED_DEPENDS_ON {lockfileHash}** is an additional Version → Version edge that records a caller-supplied exact lockfile resolution. DEPENDS_ON ranges are never treated as version resolutions.

Publication order determines SUCCEEDS; equal timestamps use a deterministic identity tie-break but are not used as a strict predecessor for delta rules. A missing manifest can still have a Version node with a known time and otherwise unknown fields. Advisory edges are stored separately and are never queried by the detector.

`metadataJSON` contains normalized field values and an evidence map. Each non-null field requires a source URL, observedAt timestamp and kind (`registry`, `report`, `synthetic`). Synthetic is test-only. Null script/provenance values differ from observed absence. Generic npm OIDC `GitHub Actions` publishers use an explicit approver name when present; otherwise publisher stays unknown to avoid grouping unrelated accounts under one identity.

## Temporal behavior

Every detector read of versions/edges is bounded by `publishedAt <= asOf`. Previous findings never seed a new detector run. The detector recomputes from visible metadata, so querying a later tick cannot contaminate an earlier tick.

- `retrospective`: use reconstructed facts at their publication times; explicitly unsuitable for pre-advisory claims.
- `evidence`: also exclude fields with observedAt > asOf; timestamp each rule no earlier than the latest required observation. Require lockfile evidence to exist by asOf for exact dependency taint.

Detection computes rules over graph-backed publisher, publication-predecessor and lockfile relationships. Arithmetic and bounded propagation run in TypeScript, with parameterized Cypher for graph access. Missing/invalid/incompatible stores fail operationally. Coverage counts report unknown publishers, scripts, provenance and publication times; they are not a complete ecosystem coverage guarantee.

## Untuned defaults

| Config key | Default | Meaning |
| --- | --- | --- |
| burstPackages | 5 | R1 counts distinct packages, not versions |
| windowMinutes | 60 | Inclusive publisher burst/taint window |
| dormantDays | 180 | R3 last-known publisher gap must exceed this |
| weights.R1 / R2 / R3 / R4 | 3 / 2 / 1 / 2 | Direct-signal weights |
| medium / high | 3 / 5 | Severity thresholds |
| decay | 0.7 | Multiply score per R5 hop |
| maxHops | 4 | Maximum R5 hops |

R2 requires true install-script presence and an immediately preceding observed false value. It covers preinstall/install/postinstall plus the registry's explicit gypfile flag, not every possible package execution mechanism. R4 compares attestation metadata presence; it does not verify an attestation. R3 requires nonempty, fully known publisher history before asserting new/dormant status, and always qualifies the judgment as within the supplied history.

Direct signals sum once per rule. R5 starts only from a version reaching `medium`; publisher taint requires publication after that seed's threshold crossing and within the window. Exact dependency taint travels from a dependency to its consumer. Propagation takes the strongest decayed path rather than adding repeated paths, rejects cycles and respects maxHops. Stronger scores from later rules are available only at the later time. Weights and thresholds have not been tuned or validated against a control week.

## Finding JSON

`detect` and `explain --json` return one object. `replay --json` returns one compact JSON object per tick (NDJSON), with only new/changed incident-window findings plus totalFindings. Findings include:

- version, score, severity;
- at (first signal on the reported explanation), scoreAt (when that reported score became available), flaggedAt (threshold crossing, null below medium);
- reasons with rule, at, detail and related version identities;
- ordered path steps with source evidence and taintedVia finding IDs;
- runId derived from dataset hash, freeze time, mode, configuration and optional lockfile hash.

The internal `persistFindings` API writes ON/TRIGGERED/TAINTED_VIA edges idempotently for a run. The offline builder materializes default retrospective findings at the tuning incident's end. CLI detect/explain/replay are read-only and recompute rather than trusting persisted findings. No risk signal means no safety conclusion; no safe pin is inferred. The MCP upgrade tool evaluates a complete candidate lockfile with the same gate; policy pass remains distinct from proof of safety. The gate policy contract is below.

## Internal resolved-lockfile API

`attachResolvedDependencies(connection, {hash, repo, builtAt, versions, edges:[{from,to}]})` accepts already resolved version identities. It validates endpoint coverage, requires a SHA-256-shaped hash and refuses to replace an existing resolution. The aggregate API accepts caller-resolved identities; the implemented gate uses installation instances instead, as described below. The present API does not parse or authenticate a lockfile, build root paths or authorize an install.

## Lockfile parser and gate contract

`parseLockfile` / `readLockfile` now parse package-lock versions 2 and 3 using the `packages` location map. The v2 legacy `dependencies` object is ignored as npm does. Each registry installation has a physical path, canonical package name and exact version ID. Aliases keep the installed slot and canonical identity separate. Declared local workspaces are represented without inventing registry Version records. Resolution uses the nearest eligible node_modules location; peers must resolve outside their own package. Optional maps override ordinary dependency declarations. All installed locations must be reachable.

Origins are deliberately constrained: credential-free HTTPS public npm archive URLs matching canonical name and exact locked archive version, plus declared internal workspace links. Private registries, git/local archives, external file links, bundled artifacts and unsupported formats fail operationally. Required dependency/peer gaps and range/identity mismatches fail. Missing optional registry dependencies are recorded rather than fetched or installed. No node_modules tree, real filesystem link or package archive is traversed.

The gate does not persist resolved edges into the shipped graph. `propagateLockfileTaint` retains installation-instance keys through dependency traversal to prevent duplicate-version paths in different subtrees from being merged. The older internal `attachResolvedDependencies` API remains available for caller-supplied aggregate graph inspection; gate verdict paths use the instance graph instead.

`evaluateGate` returns status (`passed`, `blocked`, `incomplete`), exitCode (0/1/2), lockfile hash, asOf, temporal mode, failOn, assessed count, blocks, gaps, instance impacts and warnings. Blocks include location, canonical version, score/severity, exact root dependencyPath, source evidencePath and resolvedDependencyChain. No implicit safe-upgrade field exists.

Default current mode is evidence, policy medium and freshness 168 hours. A pass requires all installed registry identities and required detector input fields to be covered by nonfuture, fresh observations. Decisive block evidence is retained even when auxiliary fields are unknown on that same version. Other missing/stale identities cause incomplete/exit 2, including mixed results with blocks. Historical retrospective mode is explicitly a simulation, not current install assurance. Gate assessment never writes the store or installs/fetches anything.

## Benchmark event contract and acceptance

`detect(..., {collectEvents:true})` additionally returns every threshold-reaching version/score/time event, before strongest-path summarization. A chronological heap and publisher/dependency indexes avoid rescanning unrelated versions for every propagation event. Benchmark evaluation samples these events onto the same 15-minute ticks as literal replay; equivalence is tested on synthetic and sourced incident-A data. The strongest final finding alone is insufficient to recover all earlier threshold times.

`bench/frozen-config.json` pins the incident-A-only selection, training hash and hashes of the detector/graph/model/queue code. No held-out/control dataset is loaded by the tuning entry point. The run entry point refuses mismatches. A frozen file cannot be silently replaced. The selected defaults have limited incident-A calibration; they are still not accepted production policy.

The current held-out/control outcome fails quality acceptance: 0/516 reference recall and 289/438 quiet-week alerts. First-public metrics are unestablished. UI/consumer code must preserve that assessment and unknown coverage rather than infer safety from successful command execution. See `bench/results.md` and `bench/ASSESSMENT.md` for denominators and limitations.

Gate-capable builders now write `Store.gateCoverageJSON`, listing full-history and projected package coverage. An unmarked or projected history cannot authorize an allow, and required unknown/future/stale predecessor facts prevent a pass. This additive store metadata is not a detector input and does not alter the frozen ecosystem benchmark.
