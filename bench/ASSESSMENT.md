# Current detector assessment: not accepted for production gating

The requested evaluation has run. Tool execution succeeded; detector quality failed to support production acceptance.

- Training-only parameter selection kept the original defaults. Incident A reference recall at end is 18/18; reference precision is 18/28. These are retrospective reconstruction results.
- Held-out Shai-Hulud all-reference recall is **0/516**. The primary-list union contains 197 package names. Registry timestamps survive for 513 affected versions, but none has a recovered per-version publisher or script state. Three Yoobic packages are unavailable. There are also 100 non-reference flagged releases in the incident window. The evaluation does not fill missing script/publisher fields from advisory labels.
- The preselected 2,000-package control cohort has **438 known in-week publishes; 289 are flagged**, giving **659.82 alerts per 1,000 publishes**. The week is an assumed benign control, not an independently labelled corpus.
- Evidence-time visibility at the historical cutoffs is zero because the snapshots were observed in November 2026. True pre-advisory detection, first-public-advisory recall and lead time are not established. OSV-relative reconstruction metrics are separately named.

These are material findings about data availability and rule discrimination. A burst of related publishes is common legitimate activity. The available metadata does not distinguish those releases from attack fan-out well enough for accepted automatic install decisions. The implemented gate correctly enforces its policy and fails closed on missing/stale data, but a completed policy assessment cannot establish dependency safety.

Do not tune on the held-out or control outcomes and present the rerun as held out. Preserve the frozen profile, code hash, input manifests and these results. Further research needs independently sourced version metadata or additional non-label signals, an explicitly identified new experiment, and fresh held-out/control acceptance. No allowlist derived from benchmark labels is authorized as a detector fix.

UI work may integrate the stable contracts, but must show unknown facts, non-reference alerts and the failed assessment. No safe-version recommendation, production commissioning or unattended approval follows from this milestone.
