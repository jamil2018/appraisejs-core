# Appraise 0.5 Release Readiness Evidence

## Validation identity

- Validation date: 2026-07-16
- Validated implementation commit: `9a457b30f9176ae99eae17801a44b07a78be713a`
- Target branch: `appraise-0.5`
- Feature branch: `codex/release-readiness-mitigation`
- Node.js: `v26.5.0`
- npm: `11.17.0`
- Gitleaks: `8.30.1`

The tracked checkout was clean during final validation. User-owned untracked Appraise plan artifacts and the local
Graphify vocabulary cache were left untouched and did not participate in the checks.

## Automated release matrix

| Command                                                        | Result | Evidence summary                                                                               |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `npm run check:harness`                                        | Passed | Harness sources, recipes, and generated references agreed.                                     |
| `npm run lint`                                                 | Passed | No lint errors; warnings were limited to existing/local generated runtime paths.               |
| `npm run validate`                                             | Passed | 205 Vitest files with 892 tests, followed by 38 Playwright tests.                              |
| `npm run build`                                                | Passed | Production build completed; existing broad dynamic-path Turbopack warnings remained non-fatal. |
| `npm run quality:fallow:commit`                                | Passed | No new dead code, dependency, cycle, duplication, complexity, or boundary regression.          |
| `npm run quality:react-doctor:commit`                          | Passed | Staged React Doctor score was 100/100.                                                         |
| `npm run quality:fallow:release`                               | Passed | Root and both public-package baselines passed without configuration relaxation.                |
| `npm run quality:react-doctor:ci`                              | Passed | Full scan completed with no errors and an 82/100 repository score.                             |
| `npm --prefix packages/appraisejs run test`                    | Passed | 15 files and 117 tests passed.                                                                 |
| `npm --prefix packages/appraisejs run test:mcp:e2e`            | Passed | Migrated temporary database exposed 73 tools, 12 resources, and 4 templates.                   |
| `npm --prefix packages/appraisejs run test:mcp:http:e2e`       | Passed | Seven authenticated, bounded, local-only HTTP cases passed.                                    |
| `npm run build:appraisejs`                                     | Passed | Public MCP package compiled successfully.                                                      |
| `npm --prefix packages/create-appraisejs run prepare-template` | Passed | Scaffold regenerated from canonical root source.                                               |
| `npm --prefix packages/create-appraisejs run test`             | Passed | 11 files and 65 tests passed.                                                                  |
| `npm --prefix packages/create-appraisejs run build`            | Passed | Scaffold package compiled successfully.                                                        |
| `npm run graphify:auto`                                        | Passed | Committed graph scopes were rebuilt by the canonical workflow.                                 |
| `npm run release:check`                                        | Passed | A-01 through A-13 and all named aggregate commands passed.                                     |

## Live security and publication evidence

- `npm audit --omit=dev`: zero production vulnerabilities.
- `npm --prefix packages/appraisejs audit --omit=dev`: zero production vulnerabilities.
- `npm --prefix packages/create-appraisejs audit --omit=dev`: zero production vulnerabilities.
- `gitleaks git --log-opts='appraise-0.5..HEAD' --no-banner --redact --exit-code 1 .`: 20 commits and
  approximately 29.20 MB scanned with no leaks found.
- The generated-artifact check passed after removing tracked runtime logs, reports, screenshots, archives, caches,
  package build output, and test-result state.
- Root publication is refused. Package-content checks confirmed that `appraisejs` and `create-appraisejs` tarballs
  contain only their declared public runtime, documentation, skills, and scaffold assets.

## Boundary, lifecycle, and resilience evidence

- Loopback startup and request-boundary tests cover IPv4, IPv6, mapped loopback peers, invalid hosts, cross-origin
  traffic, and non-loopback rejection.
- HTTP MCP tests cover missing/invalid authentication, replay, cross-origin access, oversized bodies, and bounded
  error responses while preserving stdio contract parity.
- The managed capsule lifecycle integration test uses a migrated temporary database, fresh target workspace, live
  loopback application fixture, Appraise-owned test run, report/log evidence, and project-bound reconciliation.
- Completion tests require fresh managed validation evidence and the current completion evidence hash before exact
  final sign-off; crash-injection cases prove recovery remains idempotent across every persistence phase.
- Repository query benchmarks verify the new indexes with repeatable query plans. List services enforce default and
  maximum page sizes, and log reads use a bounded tail reader.

## Final scope review

- All A-01 through A-13 ledger entries are `verified`; no waiver is present.
- No project archetype or domain-keyword planning route remains in production code or canonical skills.
- No alternate test-run terminalization owner, plaintext environment password projection, or unauthenticated HTTP MCP
  path remains.
- No new TODO, temporary release flag, complexity suppression, quality exclusion, raised threshold, circular
  dependency, or unresolved high/critical vulnerability remains.
- `git diff --check appraise-0.5...9a457b30f9176ae99eae17801a44b07a78be713a` passed.
