# Managed Validation Migration Inventory

This inventory freezes the compatibility boundary for the managed-validation integrity migration. Active product
contracts use `appraise.validation-ast` with numeric `schemaVersion: 1`; architecture-generation labels are not public
identity. Historical plans under `codex/development plan/` may retain migration terminology when clearly historical.

## Active identifiers to replace

| Current identifier                          | Canonical replacement                             | Surfaces                                                               |
| ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `appraise.validation-ast/v2`                | `appraise.validation-ast` plus `schemaVersion: 1` | MCP workflow resource, package tests, docs                             |
| `phase2_review_only`                        | `reviewed_publication`                            | validation projection provenance, runtime guards, fixtures             |
| `phase3_capsule`                            | `runtime_capsule`                                 | capsule authority, baseline/implementation tests, parser compatibility |
| prose describing the surviving flow as `v2` | `managed validation`                              | lifecycle, runtime, coordinator, AST, package, and skill docs          |

## Historical-only identifiers

- `appraise.validation/v1` names the removed file-artifact family and must not be reintroduced.
- Numbered architectural-migration plans may discuss Phase 1, Phase 2, Phase 3, or v2 as historical sequencing.
- Existing migration filenames remain immutable history even after active contracts are normalized.

## Compatibility policy

- Experimental database rows using migration-era provenance are migrated or purged once; active parsers do not keep a
  parallel public alias.
- Root and `packages/appraisejs` contracts change together.
- Scaffold templates inherit canonical root source through `prepare-template`; generated templates are not edited.
- Active absence checks cover source, package source, current docs, UI copy, tests, and agent skills while excluding
  historical plans, immutable migrations, generated package output, and third-party dependencies.
