# Agent Generated Artifacts

This map separates canonical source from generated, sync-managed, or runtime-only output.

| Surface                                                        | Status                                   | Agent rule                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `automation/features/*`                                        | sync-managed feature output              | Prefer feature generation or database sync changes.                                                                        |
| `automation/locators/*`, `automation/mapping/locator-map.json` | sync-managed locator output              | Prefer source data or sync scripts.                                                                                        |
| `automation/config/*`                                          | authored plus sync-managed configuration | Check `docs/automation-sync-rules.md` before direct edits.                                                                 |
| `automation/reports/*`                                         | runtime output                           | Do not commit local run logs, traces, or reports unless the task explicitly asks for fixtures.                             |
| `appraise/plans/*.yaml` and sidecars                           | Appraise-owned plan artifacts            | Use plan lifecycle tools or plan artifact services; preserve hashes and sidecars.                                          |
| `appraise/plans/reviews/*`                                     | review sidecars                          | Treat as Appraise-owned review evidence.                                                                                   |
| `appraise/plans/validations/*`                                 | validation sidecars                      | Treat as Appraise-owned validation evidence.                                                                               |
| `appraise/plans/layouts/*`                                     | layout sidecars                          | Preserve user layout data unless the task targets layout behavior.                                                         |
| `src/graphify-out/*`                                           | committed source graph                   | Refresh with `npm run graphify:auto` when safe source changes touch `src/`.                                                |
| `prisma/graphify-out/*`                                        | committed schema graph                   | Refresh with `npm run graphify:auto` or `npm run graphify:build:prisma` after schema or migration changes.                 |
| `scripts/graphify-out/*`                                       | committed scripts graph                  | Refresh with `npm run graphify:auto` when safe script source changes land.                                                 |
| `packages/graphify-out/*`                                      | committed packages graph                 | Refresh with `npm run graphify:auto`; package templates, docs, dist, and nested graph outputs stay excluded.               |
| `packages/create-appraisejs/templates/base`                    | prepared scaffold template               | Change root/base source first unless the edit is package-only metadata.                                                    |
| `packages/create-appraisejs/templates/flavors/*`               | prepared flavor overlays                 | Keep overlays small and intentional.                                                                                       |
| `packages/appraisejs/registry/template-steps/*`                | built registry output                    | Prefer registry source or build scripts when behavior changes.                                                             |
| prepared `prisma/dev.db` template databases                    | seeded scaffold data                     | Never include machine-local coordinator credentials, leases, durable events, test runs, reports, or personal layout state. |
| `.appraisejs/*`                                                | local coordinator identity               | Runtime-private; do not commit.                                                                                            |
| `.next`, `dist`, coverage, traces                              | build/runtime output                     | Do not commit unless package publication rules explicitly include the artifact.                                            |

When a generated diff appears unexpectedly, identify the command that produced it and decide whether the source change
requires it before carrying it forward.
