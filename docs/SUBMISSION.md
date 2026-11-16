# Submission copy and owner handoff

This is prepared copy, not a submitted entry. The 2-minute video/storyboard is excluded by the current development request. Verify registration, eligibility, team details and the final repository revision before submitting; no account attestations or external messages were sent.

## Title and short description

**Patient Zero** — a local replayable graph of npm supply-chain incidents, exact lockfile exposure paths and a measured metadata gate, built on a single Relate file.

## What it does

Patient Zero reconstructs sourced npm incident metadata, connects versions to publishers and publication predecessors, freezes what is visible at an assessment time, and records every rule/taint explanation as a path. A package-lock v2/v3 parser preserves physical installation instances so duplicate versions in separate subtrees cannot invent exposure paths.

A read-only CLI and GitHub Action return policy pass, block or incomplete. A Next.js UI replays incidents and explores exact lockfile/evidence paths. Local stdio MCP exposes blast-radius context, why a version was flagged and assessment of a complete resolved upgrade candidate. Raw graph/schema exploration uses Relate's separate built-in read-only MCP.

## Measured result and challenge

Parameters were selected on chalk/debug only and frozen before Shai-Hulud/control evaluation. Held-out end-window reference recall is **0/516 (0.00%)**; the quiet-week proxy alert rate is **289/438 publishes (659.82 per 1,000)**. Removed manifests leave affected versions without publisher/script evidence, and coordinated legitimate releases trigger burst alerts. First-public-advisory recall/lead time remain unverified; the UI displays these limitations.

The development demonstrates provenance, temporal isolation, instance-level graph paths, fail-closed policy handling and reproducible evaluation. It does **not** demonstrate successful prospective malware detection or production-grade dependency safety assurance. No labels, invented publishers/scripts, benchmark-derived allowlists or post-holdout retuning are used to manufacture a better result.

## How to try

Repository: https://github.com/alwayskumar-global/patient-zero (publish the completed reviewed revision before sharing this as the working implementation).

Node 22+, npm and optional native dependencies are required. `npm ci`, then `npm run demo` demonstrates the native engine, terminal replay, fixture block and benchmark, then opens a loopback UI at `http://127.0.0.1:3000`. No secrets/env file/database server is required. Dependency installation needs registry access; the demo runs offline afterward. Never install the historical incident fixture. Detailed setup, MCP and Action instructions are linked from the README.

## Built with and disclosure

TypeScript, Relate 1.0.1, Next.js/React, Sigma/Graphology, d3 and the official MCP SDK. UI design/export supplied by the owner. Substantial implementation/test/documentation assistance from OpenAI Codex. Public IOC/registry/OSV source facts and the MIT control cohort are attributed separately. Full notices: `THIRD_PARTY_NOTICES.md` and `bench/sources/NOTICE.md`.

## Owner-only release tasks

- Review the local implementation and select/publish a real release commit. Pin any external Action caller to that full SHA. Hosted CI is configured but has not run on this unpublished revision.
- Confirm the public repo and required `relate` topic, team/eligibility, AI/third-party disclosure and current official submission requirements.
- Submit through the owner's Devpost account. Do not claim an excluded video exists or claim detector acceptance from green implementation tests.
