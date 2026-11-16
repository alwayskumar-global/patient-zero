# Third-party material and AI assistance

Patient Zero's application source retains the repository's original MIT license. Upstream components retain their own licenses; this project does not relicense them. Exact transitive resolutions and integrity hashes are in `package-lock.json`; dependency license files are distributed in their npm packages.

| Component | Pinned version | License |
| --- | --- | --- |
| Relate Node/native engine | 1.0.1 | Apache-2.0 |
| Koffi | 2.16.4 | MIT |
| MCP TypeScript SDK | 1.32.2 | MIT |
| Next.js | 16.4.6 | MIT |
| React / React DOM | 19.3.1 | MIT |
| Sigma / square node renderer | 3.0.3 / 3.0.0 | MIT |
| Graphology | 0.26.0 | MIT |
| d3-scale | 4.0.3 | ISC |
| Zod | 4.6.7 | MIT |
| semver | 7.8.6 | ISC |
| @streamparser/json | 0.0.26 | MIT |
| IBM Plex Sans / Mono via Fontsource | 5.3.0 | SIL OFL-1.1 |

IBM font copyright and complete OFL notices accompany the bundled font use in [licenses/IBM-Plex-Sans-OFL.txt](licenses/IBM-Plex-Sans-OFL.txt) and [licenses/IBM-Plex-Mono-OFL.txt](licenses/IBM-Plex-Mono-OFL.txt). No modified font names or font binaries are claimed as project-authored work.

The owner supplied the complete UI HTML/tokens archive; originals and archive provenance are in `web/design/`. It was integrated into application code rather than executing its builders. Native libraries, the graph renderer, MCP protocol implementation, web framework and fonts are third-party dependencies, not project inventions.

IOC/reference facts, public registry metadata and the control cohort have separate provenance and notices in [bench/sources/NOTICE.md](bench/sources/NOTICE.md). Reports and malicious package code are not redistributed. Each reconstructed field records its source and observation time.

Substantial AI assistance (OpenAI Codex) was used to implement and revise source code, tests, data tooling, UI integration and documentation. The owner supplied product direction and UI design. AI-assisted changes require the same verification as other implementation work. No claim is made that AI use establishes detector accuracy or replaces owner review. The owner should include any additional contributors/tools in the final submission declaration.
