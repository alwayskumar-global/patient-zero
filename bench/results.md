# Patient Zero benchmark results

Held-out retrospective reference recall at incident end: **0.00%**. Quiet-week alert rate: **659.82 flags per 1,000 known publishes**.

**Prospective/pre-advisory performance is not established.** These are reconstruction metrics, not production gate acceptance.

| Dataset | Role | Reference versions | Known time / publisher / script | Recall at end | Reference precision | Recall before OSV publication | Median OSV lead (min) | Known window publishes | Flags |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| chalk-debug-2025-09 | tuning | 18 | 18 / 18 / 0 | 100.00% | 64.29% | 100.00% (18 cutoffs) | 231.46 (n=18) | 28 | 28 |
| shai-hulud-2025-09 | held-out | 516 | 513 / 0 / 0 | 0.00% | 0.00% | 0.00% (515 cutoffs) | Not established (n=0) | 696 | 100 |
| quiet-week-2025-08 | held-out | 0 | 0 / 0 / 0 | Not established | 0.00% | Not established (0 cutoffs) | Not established (n=0) | 438 | 289 |

First-public-advisory recall and lead time: **Not established**; exact first public disclosure timestamps are unverified.

Evidence-time visible versions at historical incident/control end: chalk-debug-2025-09: 0; shai-hulud-2025-09: 0; quiet-week-2025-08: 0.

Config SHA-256: `fd8fca19302cd275389b6b03d97e8b700dbdb28e2fa1e98403da228fcc72ccd8`. Detector code SHA-256: `0edfba0bb4a38e139d6502a61dd46336b4866767e3d4201e8df5bcab9566b7ce`. Candidate selection used incident A only; the profile was written before held-out/control evaluation. Full tuning records: [frozen-config.json](frozen-config.json).

Control cohort: 2,000 packages from snapshot 2025-06-05T06:32:03.000Z; [pinned source](https://github.com/wooorm/npm-high-impact/blob/c62676810a600382f74b391ef1d0d4db72ebfa44/lib/top-download.js). Metadata gaps: chalk-debug-2025-09: 0 unknown publication times, 0 unavailable packages, 0 recorded normalization warnings; shai-hulud-2025-09: 3 unknown publication times, 3 unavailable packages, 0 recorded normalization warnings; quiet-week-2025-08: 0 unknown publication times, 0 unavailable packages, 14 recorded normalization warnings.

## Method and limits

- All historical metrics are retrospective and use later-observed metadata. They do not establish real pre-advisory detection.
- First public advisory cutoffs remain unverified unless supplied explicitly; those recall/lead metrics are null. OSV publication is a separately named reference cutoff.
- Shai-Hulud coverage means the pinned primary IOC union, not proof that every compromised package globally is listed. Missing facts count against all-reference recall.
- Reference precision treats unlabelled flags as negatives against the supplied IOC set; it does not independently prove those releases benign.
- Quiet-week flags per 1000 publishes assume the selected week is benign. The 2000-package cohort is pre-control download-ranked, not a verified exact August global ranking.
- Event-time detection is sampled onto 15-minute replay ticks; equivalence to literal tick replay is tested. No lockfile dependency graph is included in this ecosystem benchmark.

All-reference recall includes missing/unassessable reference identities as misses. Known-window precision/alert denominators include only versions with publication timestamps in [start, end). A zero-publication denominator yields null, never a fabricated zero rate. OSV lead is signed and includes late detections; positive values denote earlier reconstructed tick times. Unlabelled flags and first-detection ticks are retained in results.json.

Do not hide non-IOC follow-up releases or use advisory labels as detector inputs. The results are diagnostic evidence for improving coverage and policy; no safe-upgrade claim follows from them.
