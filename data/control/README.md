# Quiet-week control snapshot

The cohort is fixed in `bench/control/cohort.json`: first 2,000 entries of the download-ranked list at [commit c626768](https://github.com/wooorm/npm-high-impact/blob/c62676810a600382f74b391ef1d0d4db72ebfa44/lib/top-download.js), committed June 5, 2025, before the August 1–8 control week. It is not a verified exact global ranking for August. Upstream source rights/attribution are recorded in `bench/sources/NOTICE.md`.

All 2,000 package metadata captures completed. `manifest.json` pins them and the control catalog. The projected snapshot contains **5,006 version records** and **438 known publications in [2025-08-01T00:00:00Z, 2025-08-08T00:00:00Z)**. Fourteen malformed historical publisher/script/dependency-map fields are recorded as unknown, not silently corrected. Legacy mixed-case package names are retained.

Compaction retains every publication in the week and five-hour context, the last known publication for each historical publisher, a sentinel for unknown publisher history and the latest publication predecessor. This preserves the current no-lockfile, 60-minute / four-hop rule context. Projection bounds are recorded per cache and checked against the frozen rule configuration; arbitrary larger windows/hops require recollection. The source response hashes refer to the streamed full packuments, while normalized file hashes pin the projected metadata. Unknown publication times, if any, cannot be assigned to a week.

The observed rate is **289 / 438 = 659.82 alerts per 1,000 known publishes**. The week is an assumed benign control, not an independently proven clean corpus. `bench/results.json` retains flagged identities and replay ticks; `bench/ASSESSMENT.md` explains why the detector is not accepted for production gating.

This capture was observed in November 2026. Evidence-time visibility at the historical cutoff is zero; these are retrospective control observations. No package code was downloaded or installed. Ordinary benchmarks read these pinned files offline; they do not refresh them or change cohort membership.
