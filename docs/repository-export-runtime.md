# Repository Export Runtime

Repository export distributes reviewed Validation AST publications. It is never an input to Appraise-managed baseline
or implementation execution; those continue to use immutable runtime capsules.

## Current contract

The repository contains bounded projection and filesystem-storage helpers for the `automation/appraise/` distribution
layout. It does not currently expose a `RepositoryExportJob`/`RepositoryExportReceipt` service or coordinator HTTP
endpoints. Treat those names as a future durable-outbox design, not an available API.

Repository collaboration is a separate reviewed exchange under `appraise/collaboration/`; see
[`repository-collaboration.md`](./repository-collaboration.md). It does not make `automation/appraise/` an import
source or managed execution authority.

## Filesystem Safety

Exports are staged completely beside the destination and installed with directory renames. Failed staging or install
leaves the previous successful directory intact. The manifest records every relative path, byte size, and SHA-256
hash. Before replacement, Appraise compares current files with the last manifest. External modifications produce a
bounded conflict list and are never overwritten unless `allowReplaceConflicts: true` is explicitly submitted.

The target project's database identity and canonical path are checked before every run. Destination and file paths
must be contained portable relative paths, symlinked destination parents are rejected, and an export manifest owned
by another target project cannot be reused.

The default destination is `automation/appraise/`. Its deterministic files and `.appraise-export.json` are generated
distribution projections, not canonical authoring state or managed runtime authority.

Exports may include `.appraise-generated.json` to identify the exact reviewed Validation AST publication and reviewed
extension paths. Recipients may consume the distribution layout, but it is never an Appraise authoring or managed
execution input. Replacement and conflict resolution stay within the durable export workflow.
