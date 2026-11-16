# Metadata ingestion

`registry.ts`: bounded streaming packuments; per-version timestamps/publishers, script-presence flags, attestation presence, size and dependency ranges. Malformed historical fields stay unknown with warnings. Current maintainers, script bodies and archive URLs are discarded; no code is fetched/executed.

`osv.ts`: bounded paginated MAL-only exact-version labels, optionally queried per package; withdrawn/range-only records never become fabricated labels. Labels stay outside detector inputs.

`compact.ts`: fixed-window benchmark projection with publisher-history and predecessor context. Projection bounds must cover the frozen configuration.

`snapshot.ts`: explicit local lockfile parsing followed by public metadata collection, content-addressed snapshots and checksum-verified offline loading. No user lockfile body or local project name is written into the snapshot.

`index.ts`: incident loading, conflict-checked reconstruction, combined store builds and no-clobber publication. Tuning-incident builds may materialize retrospective findings; held-out data is not automatically evaluated by builds.

Commands, order of operations, credentials/settings and limits are in the root README. Live captures belong in ignored `data/cache/`. Reviewed incident/control captures are in `data/replay`, `data/shai-hulud` and `data/control`. Benchmark quality and unresolved data gaps are documented rather than hidden.
