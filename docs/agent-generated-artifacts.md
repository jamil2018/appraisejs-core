# Agent Generated Artifacts

## Reviewed Step Definition drafts

User-authored handlers are staged below `.appraise/step-definitions/drafts/<draft-id>/`. `definition.json`,
`contract.ts`, `examples.json`, and `manifest.json` are Appraise-managed; `handler.ts` is user-owned; `handler.mjs` is
the compiled artifact. Source and compiled hashes are stored separately from canonical definition metadata. Do not
patch staged output as registry source: revise the draft and let the extension service regenerate it.

Generated runtime and report artifacts inherit the owning TestRun target project. Artifact routes require matching
project scope and return a scoped not-found response for foreign project IDs. See
`docs/project-ownership-boundary.md`.

Repository compatibility exports contain `.appraise-generated.json`. The marker binds the exact target project,
validation hash, publication, and reviewed custom-extension paths and declares that replacement must occur through
Appraise export. See `docs/legacy-automation-migration.md`.

This map separates canonical source from generated, sync-managed, or runtime-only output.

`npm run release:check:artifacts` enforces the boundary against both tracked files and staged additions. The only
database files allowed in Git are the named, sanitized `blank` and `starter` scaffold databases. Adding another
fixture requires an explicit allowlist entry and a review proving it is deterministic and contains no credentials,
cookies, private payloads, or machine-specific paths.

Committed Graphify output is similarly allowlisted: only `GRAPH_REPORT.md`, `graph.html`, and `graph.json` directly
inside the canonical `src`, `prisma`, `scripts`, and `packages` graph scopes belong in Git. Root graphs, scaffold
copies, nested historical-plan graphs, caches, wikis, manifests, and machine state are local-only.

| Surface                                                                 | Status                                   | Agent rule                                                                                                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `automation/features/*`                                                 | sync-managed feature output              | Prefer feature generation or database sync changes.                                                                                                                      |
| `automation/locators/*`, `automation/mapping/locator-map.json`          | sync-managed locator output              | Prefer source data or sync scripts.                                                                                                                                      |
| `automation/config/*`                                                   | authored plus sync-managed configuration | Check `docs/automation-sync-rules.md` before direct edits.                                                                                                               |
| `automation/reports/*`                                                  | runtime output                           | Do not commit local run logs, traces, or reports unless the task explicitly asks for fixtures.                                                                           |
| `.appraise/projects/<project-id>/runtime/<validation-hash>/<run-id>/*`  | Appraise-owned capsule projection        | Never hand-edit or import as authority; manifests, receipts, runtime files, reports, logs, traces, and screenshots are database/receipt-owned.                           |
| `automation/appraise/*`                                                 | transactional repository export          | Generated distribution projection; resolve external-change conflicts through the export service and never execute it as managed authority.                               |
| `appraise/plans/*.yaml` and sidecars                                    | Appraise-owned plan artifacts            | Use plan lifecycle tools or plan artifact services; preserve hashes and sidecars.                                                                                        |
| `appraise/plans/reviews/*`                                              | review sidecars                          | Treat as Appraise-owned review evidence.                                                                                                                                 |
| `appraise/plans/validations/*`                                          | validation sidecars                      | Treat as Appraise-owned validation evidence.                                                                                                                             |
| `appraise/plans/layouts/*`                                              | layout sidecars                          | Preserve user layout data unless the task targets layout behavior.                                                                                                       |
| `src/graphify-out/*`                                                    | committed source graph                   | Refresh with `npm run graphify:auto` when safe source changes touch `src/`.                                                                                              |
| `prisma/graphify-out/*`                                                 | committed schema graph                   | Refresh with `npm run graphify:auto` or `npm run graphify:build:prisma` after schema or migration changes.                                                               |
| `scripts/graphify-out/*`                                                | committed scripts graph                  | Refresh with `npm run graphify:auto` when safe script source changes land.                                                                                               |
| `packages/graphify-out/*`                                               | committed packages graph                 | Refresh with `npm run graphify:auto`; package templates, docs, dist, and nested graph outputs stay excluded.                                                             |
| `packages/create-appraisejs/templates/base`                             | prepared scaffold template               | Change root/base source first unless the edit is package-only metadata; template preparation excludes all Graphify output.                                               |
| `packages/create-appraisejs/templates/flavors/*`                        | prepared flavor overlays                 | Keep overlays small and intentional.                                                                                                                                     |
| prepared `prisma/dev.db` template databases                             | seeded scaffold data                     | Never include machine-local coordinator credentials, leases, durable events, test runs, reports, or personal layout state.                                               |
| `.appraisejs/*`                                                         | local coordinator identity               | Runtime-private; do not commit.                                                                                                                                          |
| `.appraisejs/swarm-events.jsonl`, quarantine fragments, and its lock    | local swarm-evolution journal            | Git-ignored, append-only process evidence with schema and hash-chain checks; do not hand-edit, commit, or treat it as host-conversation, Appraise, or release authority. |
| `scripts/fixtures/swarm-routing-contracts.json`                         | repository harness fixture               | Commit as deterministic adversarial routing input; keep it and repo-only swarm profiles out of generated scaffolds.                                                      |
| `.appraise/*`, `.playwright-cli/*`                                      | local managed/browser runtime state      | Keep local and untracked; never use a copied real run directory as a fixture.                                                                                            |
| `.next`, companion `dist`, coverage, reports, logs, traces, screenshots | build/runtime output                     | Do not commit; package tarballs are assembled from explicit package `files` allowlists.                                                                                  |

When a generated diff appears unexpectedly, identify the command that produced it and decide whether the source change
requires it before carrying it forward.

Repository secret audits must cover both the current tree and Git history. Findings are classified as sanitized
fixtures, documented false positives, or real exposures. A real exposure blocks release and requires credential
rotation; rewriting shared history is a separate, explicitly approved operation.
