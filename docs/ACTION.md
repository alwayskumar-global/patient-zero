# GitHub Action gate

`action.yml` is a composite action. It installs **its own reviewed, pinned dependencies**, explicitly rebuilds the pinned Koffi native binding and builds the CLI. It never runs npm install/ci against the application's submitted lockfile. CLI execution uses an argument array, not shell-interpolated input. Submitted paths must be relative to `GITHUB_WORKSPACE`; realpath checks reject symlink/path escapes. Gate evaluation is offline and read-only.

## Order of operations

1. Publish/review a Patient Zero commit, then pin the action to that **full immutable commit SHA**. The implementation is published on `main`; use the full reviewed commit SHA, not the initial empty repository commit or a mutable branch, for an external caller.
2. Use a normal `pull_request` workflow, `permissions: contents: read`, and `actions/checkout` with `persist-credentials: false`. Do not use `pull_request_target` to execute PR code or give this gate write tokens/secrets.
3. Provide the untrusted PR's lockfile as data. Keep action code, detector config, policy inputs and any custom evidence store on a trusted reviewed revision, independently of the PR. An attacker-controlled store/config is not a trustworthy policy input. Use a second checkout at a protected reviewed commit if supplying a custom store.
4. Leave mode `evidence` and assessment time current for actual policy use. The shipped historical incident store will normally return incomplete for current installs; it is a reproducible demo artifact, not a live universal registry snapshot.
5. Require the gate job through repository rules after reviewing the benchmark limitations. These rules have not been configured automatically. Current detector quality does not support unattended production acceptance.

A caller workflow after a real release SHA exists (replace the placeholder):

```yaml
name: Dependency metadata policy
on: pull_request
permissions:
  contents: read
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262
        with:
          persist-credentials: false
      - uses: alwayskumar-global/patient-zero@REPLACE_WITH_REVIEWED_FULL_COMMIT_SHA
        with:
          lockfile: package-lock.json
          fail-on: medium
          # A fresh reviewed store is required for covered current assessment.
          # store: trusted-evidence/current.rl
```

No `GITHUB_TOKEN`, npm credentials or other secret input is needed. Network access is needed to install the action's pinned dependencies; the gate itself performs no network fetches. Optional native dependencies must remain enabled. The runner requires Bash and Node 22 (installed by the pinned setup-node action); Linux/macOS are the configured CI targets. Windows is not separately verified.

## Inputs, outputs and failures

| Input | Default |
| --- | --- |
| `lockfile` | `package-lock.json`, relative to workspace |
| `store` | action's shipped `patient-zero.rl`; custom relative workspace path must be trusted |
| `config` | built-in frozen defaults; optional trusted config JSON path |
| `mode` | `evidence` |
| `as-of` | current UTC; historical overrides must be explicit |
| `fail-on` | `medium` |
| `max-store-age-hours` | `168`; larger values weaken freshness |

Outputs: `status` (`passed`, `blocked`, `incomplete`), `exit-code` (`0`, `1`, `2`) and `report` (private local runner JSON path). Exit 1 and 2 fail the step. An installation/configuration failure before the runner starts also fails the action and may have no outputs. Missing reports never count as a pass.

The summary includes escaped full evidence paths and gaps. The report is written under `RUNNER_TEMP` with mode 0600 and is not uploaded automatically. Dependency names/paths appear in the workflow summary; use a suitably private repository for private application metadata. Do not enable automatic report upload without reviewing that content.

`.github/workflows/ci.yml` includes backend/native checks, offline frozen benchmarking, production-build Chromium tests and an **intentional historical block** action job. Only that regression fixture uses `continue-on-error`; the following step requires exact blocked/exit-1 outputs. Never copy that exception into a current policy gate.

The action runner's 0/1/2 behavior, path/identity evidence, summary escaping, invalid inputs, symlink escapes and unchanged store bytes are tested locally. The real hosted Action regression also passed: its historical gate returned blocked/exit 1, and the follow-up assertion verified both outputs. [Hosted evidence](CI.md). An intentional exit 1 appears as an error in that regression step's log; the regression job passes only when that exact expected block is observed.
