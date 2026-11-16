# September Shai-Hulud snapshot

The reference is the full deduplicated union of the pinned [StepSecurity September table](https://www.stepsecurity.io/blog/ctrl-tinycolor-and-40-npm-packages-compromised) and [Wiz appendix](https://www.wiz.io/blog/shai-hulud-npm-supply-chain-attack): **197 packages / 516 versions**. Hidden table rows are included. `bench/sources/shai-hulud-reference.json` records all reference identities, their source memberships, response hashes and observation times. This is full coverage of those lists, not a claim of exhaustive global campaign coverage.

`manifest.json` pins content-addressed normalized registry snapshots and the incident catalog. There are **1,088 version records**, retaining exact reference identities, temporal context, preceding publications and last-known publisher history. Known reference publication times: **513**. Recovered malicious-version publisher/script fields: **0 / 0**. Missing facts remain null. The unavailable packages are `@yoobic/design-system`, `@yoobic/jpeg-camera-es6` and `@yoobic/yobi`; their metadata gaps remain represented. For 404 captures the source fingerprint records the explicit HTTP-status marker, not a raw packument body.

Exact [OSV](https://google.github.io/osv.dev/api/) MAL labels match 515 reference versions; one remains IOC-only. Only identifiers, exact affected versions, source links and OSV publication times are retained. No advisory prose is imported as detector input. The first public disclosure time remains unverified.

A checked mirror returned the removed tinycolor version pointing at an older version's archive. Its fields were rejected and were never merged into this snapshot. Neither current maintainers nor a previous publisher is used to infer the publisher of a removed version. General campaign descriptions do not become per-version script flags.

The observation date is November 2026. Retrospective replay uses surviving publication times; it cannot establish evidence that was available during September 2025. All-reference recall includes missing facts as misses. The current held-out result is zero recall; see `bench/ASSESSMENT.md`.

A combined offline rebuild uses `npm run build:store -- --catalog data/demo.json --store ./new-combined.rl`. Standalone build: `npm run build:store -- --manifest data/shai-hulud/manifest.json --incident bench/incidents/shai-hulud-2025-09.json --store ./new-shai.rl`. Both require installed dependencies and a new output filename, and neither fetches network data.
