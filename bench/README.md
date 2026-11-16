# Benchmark

The frozen experiment has run: see [results.md](results.md), [results.json](results.json) and [ASSESSMENT.md](ASSESSMENT.md). It does not establish production acceptance.

Incident A is tuning-only. The complete pinned Shai-Hulud primary IOC union and the 2,000-package quiet-week cohort are held out from parameter selection. `frozen-config.json` records the candidate grid, objective, selected profile, training input hash and detector code hash, written before their first evaluation.

Run `npm run bench` from repository root after `npm ci` / `npm run build`. It uses local metadata only and rewrites result artifacts for the same frozen experiment. `npm run bench:tune` refuses to overwrite an existing freeze. No ordinary build should regenerate input catalogs or retune parameters.

Historical metrics are retrospective. First-public disclosure times remain unverified; those metrics are null. OSV publication is a separately named reference cutoff. Control rate counts distinct flagged in-week versions per 1,000 known in-week publishes and assumes that week is benign. Synthetic fixtures are software validation, never incident accuracy evidence. Unlabelled flagged identities and first-detection ticks remain in results.json.
