# Legacy Automation Migration

Phase 5 migrates repository-owned automation without treating generated files as canonical Appraise state.

## Preview Import

Call `POST /api/internal/coordinator/legacy-automation-imports/preview` or the
`legacy_automation_import_preview` MCP tool from the connected target project. Appraise reads the target's
`automation/features`, `automation/steps`, and `automation/locators` trees and returns a bounded, deterministic
proposal.

The proposal is intentionally non-executable and non-mutating:

- `reviewStatus` is `human-review-required` and `mutationPerformed` is `false`;
- every input file has a project-relative path, SHA-256 hash, and size;
- feature scenarios and step order are retained;
- legacy step definitions and locator files are inventoried;
- action and locator mappings remain `unresolved` until an agent selects exact catalog and locator-graph identities;
- the proposal and complete source inventory have independent hashes.

Import preview never writes Prisma entities, validation artifacts, source files, or runtime files. After human review,
an agent must construct a normal Validation AST submission and pass the existing check, preview, review, and compile
gates. A legacy proposal is not accepted directly by the compiler.

## Compatibility Export

Repository export continues to produce executable feature, binding, extension, support, configuration, and expected
case artifacts from the exact reviewed Validation AST publication. The export also contains
`.appraise-generated.json`, which identifies the project, validation hash, publication, mutation policy, and reviewed
authored-extension paths.

The marker means the directory is a generated compatibility projection. Replace it only through Appraise repository
export. The old bidirectional sync rejects a generated projection instead of importing edited generated files back
into canonical state. External changes are still detected by the export manifest and require explicit conflict
resolution.

Authored custom extensions remain explicit reviewed inputs. Their exported paths are recorded in the ownership marker;
they are not reclassified as freely mutable generated files.

## Deprecation Window

Unmarked legacy `automation/` trees remain readable by the preview importer and existing legacy runtime during the
0.5 transition. New reviewed Validation AST publications use immutable Appraise runtime capsules for managed runs and
may use compatibility export for existing CI. Direct generated-file mutation and filesystem-to-database
bidirectional synchronization are deprecated; import preview plus reviewed AST compilation is the replacement path.
