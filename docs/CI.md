# Hosted CI evidence

The completed implementation was pushed to `main` on November 16, 2026. This records actual hosted execution, separate from the local verification in `COMPLETION.md`. Video/storyboard work remains excluded.

Implementation commit: [`e0ffdd8418f1bb7bf5d021929aff28f25a8bec2f`](https://github.com/alwayskumar-global/patient-zero/commit/e0ffdd8418f1bb7bf5d021929aff28f25a8bec2f).

**Overall conclusion: success — all four jobs passed.** No implementation failure was found and no test, detector or policy was weakened. The macOS job waited for a hosted runner, then completed successfully.

Hosted run: [Verify Patient Zero #1](https://github.com/alwayskumar-global/patient-zero/actions/runs/43872584925).

| Job | Hosted evidence |
| --- | --- |
| [Linux backend](https://github.com/alwayskumar-global/patient-zero/actions/runs/43872584925/job/133317301702) | Passed: Ubuntu 26.04, Node 22.23.4, 54/54 tests, native single-file persistence/read-only smoke, frozen experiment rerun offline. |
| [Production UI](https://github.com/alwayskumar-global/patient-zero/actions/runs/43872584925/job/133317301616) | Passed: production build, typecheck and 5/5 Chromium end-to-end tests. |
| [GitHub Action regression](https://github.com/alwayskumar-global/patient-zero/actions/runs/43872584925/job/133317302242) | Passed: real composite action installed/built its trusted dependencies, returned historical blocked/exit 1, then the following step asserted those exact outputs. |
| [macOS backend](https://github.com/alwayskumar-global/patient-zero/actions/runs/43872584925/job/133317301607) | Passed: macOS 26 arm64, Node 22.23.4, 54/54 tests, native single-file persistence/read-only smoke, frozen experiment rerun offline. |

The historical Action step deliberately returns exit 1. Its log therefore includes GitHub's “Process completed with exit code 1”; the regression job uses `continue-on-error` for that expected block and passes only after an explicit assertion. Current policy callers must not copy that exception into a required gate.

Hosted success proves execution of these checks, not malware-detection acceptance. The frozen held-out recall remains 0/516, and the quiet-week proxy alert rate remains 659.82/1,000 known publishes. No detector retuning, label-derived allowlist or invented safe pin was introduced for CI.

Secrets/configuration: no npm token, database password, new repository secret or public service was needed. CI uses read-only repository permissions, checkout credentials are not persisted, and external actions are pinned to immutable SHAs. npm publication, public hosting, GitHub topics/branch protection, registration and submission are separate owner-controlled actions.
