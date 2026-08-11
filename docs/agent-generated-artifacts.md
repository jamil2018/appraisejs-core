# Agent Generated Artifacts

Generated and runtime artifacts are derived from canonical source, immutable quality identities, or managed TestRuns. Do not patch them to change product behavior.

| Surface                                                                                            | Status                                   | Agent rule                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `automation/features/*`                                                                            | sync-managed feature output              | Change source data, generators, or database sync behavior.                              |
| `automation/locators/*`, `automation/mapping/locator-map.json`                                     | sync-managed locator output              | Change the source locator data or synchronization code.                                 |
| `automation/config/*`                                                                              | authored plus sync-managed configuration | Follow `docs/automation-sync-rules.md` before direct edits.                             |
| `automation/reports/*`                                                                             | runtime output                           | Do not commit local logs, traces, or reports unless explicitly requested as fixtures.   |
| `.appraise/projects/<project-id>/runtime/*`                                                        | managed runtime capsule projection       | Never hand-edit; manifests and execution artifacts are receipt-owned.                   |
| `automation/appraise/*`                                                                            | transactional repository export          | Resolve conflicts through the export service and never execute it as managed authority. |
| `src/graphify-out/*`, `prisma/graphify-out/*`, `scripts/graphify-out/*`, `packages/graphify-out/*` | committed source graphs                  | Regenerate with the prescribed Graphify command.                                        |
| `packages/create-appraisejs/templates/base`                                                        | prepared scaffold template               | Change canonical root/base source, then prepare the template.                           |
| prepared scaffold databases                                                                        | seeded templates                         | Keep deterministic and free of credentials, machine paths, or personal state.           |
| `.appraisejs/*`                                                                                    | local harness state                      | Do not hand-edit or commit.                                                             |
| `.appraise/*`, `.playwright-cli/*`, `.next`, `dist`, coverage, reports, logs, traces, screenshots  | local runtime output                     | Keep untracked unless a fixture is intentionally approved.                              |

`npm run release:check:artifacts` enforces the tracked-artifact boundary. When a generated diff appears, identify its generating command and update canonical source before including it.
