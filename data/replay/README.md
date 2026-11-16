# Reviewed replay metadata

`manifest.json` pins the exact incident-A catalog and the normalized, content-addressed `cache/*.json` files. Current coverage: 18 package histories, 486 version identities. File checksums are verified before a build. No tarballs, executable code, script bodies, tokens or user lockfiles are included.

## Sources and attribution

- npm registry packuments: source URL, response SHA-256 and fetch timestamp are recorded per package. Version evidence uses that observation timestamp; historical publication time comes from surviving `time[version]` entries. `maintainers[]` is discarded. The normalized form retains field values and attribution, not the complete raw HTTP response.
- [Aikido incident report](https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised): the initial 18-package version IOC list.
- [Wiz incident analysis](https://www.wiz.io/blog/widespread-npm-supply-chain-attack-breaking-down-impact-scope-across-debug-chalk): campaign-level Qix account attribution. Applying `qix` to individual missing manifests is a **reported campaign reconstruction**, not an observed per-version publisher. This assumption is visible as `kind: report` in each field's evidence.
- [OSV API](https://google.github.io/osv.dev/api/): exact `MAL-*` version labels and their individual advisory publication timestamps. Only identifiers, affected identities, publication timestamps and source links are retained; advisory prose is not copied. Labels are graph `Advisory/FLAGS` ground truth, never detector inputs.
- [Safety analysis](https://www.getsafety.com/blog-posts/shai-hulud-npm-attack): the original two tinycolor timestamps retained in the expanded Shai-Hulud reference. Full reference coverage and its completed evaluation are documented in data/shai-hulud/README.md and bench/results.md.

No removed manifest's install-script presence, dependency list, size or attestation status is guessed. Null remains unknown. Current registry metadata can change, and the response hash cannot recreate the omitted raw response; the pinned normalized snapshot is the offline build input.

This dataset is curated around known IOCs and uses later report attribution. It validates reconstruction and replay behavior, not blind incident detection. A held-out, coverage-controlled evaluation still needs to be built. Source websites retain their own rights; this snapshot stores attributed metadata facts, not their reports or malware samples.

## Rebuild

After `npm ci` and `npm run build`, from repository root:

```sh
npm run build:store -- --store ./reconstructed.rl
```

Use a new filename. Logical records and findings are reproducible from the same inputs; byte-for-byte native database serialization is not promised. Updating either catalog or normalized data requires a new manifest and review. `data/cache/` is the ignored location for refreshed snapshots.
