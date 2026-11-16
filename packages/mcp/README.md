# Patient Zero MCP

A local, read-only stdio MCP server using the pinned official `@modelcontextprotocol/sdk@1.32.2`. The same frozen detector and gate power CLI, UI and MCP. No HTTP listener, arbitrary Cypher tool, registry fetch, install, filesystem-path tool argument or graph write is exposed.

## Setup order

1. Install Node 22+ and npm, with optional native dependencies enabled.
2. From the repository root, run `npm ci`, then `npm run build`.
3. Copy the relevant entries from `config/mcp.example.json` into your MCP host's server configuration. Replace **every** `/absolute/path/to/patient-zero` placeholder, and use the absolute path to your Node executable if the host does not inherit your shell PATH. The server command is `node`, with `packages/cli/dist/index.js`, `mcp`, `--store` and the absolute `.rl` path as arguments. Do not use `npm run` as the host command: its banners corrupt stdio protocol output.
4. Restart/reconnect the host. The custom server advertises exactly `blast_radius`, `why_blocked` and `safe_upgrade_path`.

No environment variables, API tokens or secrets are required. Optional `PZ_AS_OF` sets a default freeze; explicit `--as-of` and per-call `asOf` override it. Defaults: current UTC, evidence mode, fail-on medium, maximum evidence age 168 hours. CLI options also accept `--config`, `--fail-on`, `--max-store-age-hours` and an optional owner-selected `--lockfile` for startup context. Paths are selected only at startup; tool calls accept lockfile **JSON text**, not paths. Raw lockfiles are kept in memory, but tool responses disclose package names and evidence to your selected MCP host/model.

Use `config/mcp-demo.example.json` for the explicit historical demo (later-observed facts, September 8 cutoff). Never use retrospective mode as current install assurance. The shipped incident store is historical and incomplete for arbitrary current applications; incomplete is the expected result when freshness/coverage is missing. Refresh public metadata and build a new reviewed store using the CLI's documented workflow before current use. Restart all readers after a store replacement; a detected change fails closed.

## Tools

All accept `package`, optional ISO `asOf`, optional `mode`, and optional `lockfile` JSON text overriding startup lock context. Input schemas reject extra fields. Lock input is limited to 1.8 MB and 2,000 installation locations; stdio transport caps a message at 4 MiB. Errors are MCP `isError` results with incomplete/exit 2 data. Results are returned as both JSON text and `structuredContent`.

- `blast_radius({package, version?})`: visible versions, recorded shared-publisher context, and exact reverse dependency chains in the configured/submitted lockfile. Unknown publishers never link together. Physical install locations are preserved. No ecosystem dependents estimate or assertion that every publisher-linked version is compromised. Large result lists are explicitly truncated at 200, with total counts.
- `why_blocked({package, version})`: sourced visible version fields, actual rule/path chain and matching gate blocks/gaps. An absent finding is explicitly not a safety verdict.
- `safe_upgrade_path({package, fromVersion, candidateLockfile?})`: observed newer versions, plus a full candidate-lock assessment when supplied. No pin is invented from absence of findings. `candidate_policy_pass` requires a visible original version in the original lock, matching project root, removal of that exact old version, a newer requested version and a fully covered fresh **evidence-mode** gate pass for the entire candidate. Every response has `safe: false`: a policy pass does not prove safety. Review the candidate diff and regenerate the resolved lock with lifecycle scripts disabled before supplying it. The tool never edits a lockfile.

The upgrade API intentionally does not reproduce the plan's illustrative `safe: pin tinycolor@4.1.0` output: removed manifests cannot support that assurance. A synthetic test demonstrates the positive policy-pass branch; the historical incident data is not relabelled safe to make the demo pass.

## Reproducible historical walkthrough

With the demo configuration connected:

1. Ask `blast_radius` for `package: "chalk", version: "5.6.1"`. It shows qix publisher overlap and the fixture's exact root/installation paths.
2. Ask `why_blocked` with the same identity. The sourced R1/R3 chain explains the historical fixture's exit 1.
3. Ask `safe_upgrade_path` with `fromVersion: "5.6.1"`. Without a complete candidate lock, the answer is `no_verified_upgrade`.
4. Repeat `why_blocked` with `mode: "evidence"`. Later-observed historical facts are masked and the result is incomplete, not an invented pre-advisory detection.
5. For Shai-Hulud, query `@ctrl/tinycolor@4.1.1` at `2025-09-20T00:00:00Z` in retrospective mode: unknown publisher/script data remains unknown.

`npm run test` exercises this over actual stdio with an SDK client and network fetch disabled, plus fresh synthetic candidate-policy passes and stale/unknown rejection.

## Relate built-in MCP layer

Install the official Relate CLI separately when you want raw graph/schema exploration. The application itself needs only its npm native package. Follow the [official installation guide](https://relatedb.ai/docs/get-started/install/): inspect the installer first and retain its pinned-key signature, release-version and checksum verification. `curl`, `ssh-keygen` and a supported OS/architecture are required for that CLI installation. Do not skip verification or install a different unverified binary as a workaround.

The second server entry runs:

```sh
relate serve --mcp stdio --database /absolute/path/to/patient-zero/patient-zero.rl --read-only
```

This is the [official read-only stdio configuration](https://relatedb.ai/docs/guides/agents/connect-over-mcp/). On verified Relate 1.0.1, only `read_cypher` and `get_schema` are advertised; write statements fail. Keep `--read-only`, and do not add network transport flags. Raw queries are exploratory; enforce temporal/evidence filters yourself, and use the custom tools for policy verdicts. Do not trust persisted advisory labels or findings as detector inputs.

Verification after installing the CLI:

```sh
npm run test:relate-mcp
# Or select a verified binary without changing your PATH:
PZ_RELATE_BIN=/absolute/path/to/relate npm run test:relate-mcp
```

`PZ_RELATE_BIN` is optional and only used by this verification script. It confirms 1,574 versions, schema access, omitted write tool, rejected write statement and unchanged store bytes. Verified locally with a signature-checked temporary Relate 1.0.1 binary; no MCP host settings or global agent skills were modified.
