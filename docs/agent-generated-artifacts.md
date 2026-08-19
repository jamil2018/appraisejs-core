# Agent Generated Artifacts

Generated and runtime artifacts are derived from canonical source, immutable quality identities, or managed TestRuns. Do not patch them to change product behavior.

| Surface                                                                                            | Status                             | Agent rule                                                                    |
| -------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `automation/*` outside `automation/appraise/*`                                                     | legacy target-local files          | Never import, regenerate, or execute them as Appraise authority.              |
| `automation/reports/*`                                                                             | legacy target-local output         | Do not commit or use it as Appraise runtime evidence.                         |
| `.appraise/projects/<project-id>/runtime/*`                                                        | managed runtime capsule projection | Never hand-edit; manifests and execution artifacts are receipt-owned.         |
| `automation/appraise/*`                                                                            | transactional repository export    | Resolve conflicts through the export service; it is distribution-only.        |
| `src/graphify-out/*`, `prisma/graphify-out/*`, `scripts/graphify-out/*`, `packages/graphify-out/*` | committed source graphs            | Regenerate with the prescribed Graphify command.                              |
| `packages/create-appraisejs/templates/base`                                                        | prepared scaffold template         | Change canonical root/base source, then prepare the template.                 |
| prepared scaffold databases                                                                        | seeded templates                   | Keep deterministic and free of credentials, machine paths, or personal state. |
| `.appraisejs/*`                                                                                    | local harness state                | Do not hand-edit or commit.                                                   |
| `.appraise/*`, `.playwright-cli/*`, `.next`, `dist`, coverage, reports, logs, traces, screenshots  | local runtime output               | Keep untracked unless a fixture is intentionally approved.                    |

`npm run release:check:artifacts` enforces the tracked-artifact boundary. When a generated diff appears, identify its generating command and update canonical source before including it.
