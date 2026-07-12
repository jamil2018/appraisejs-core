# Repository Export Runtime

Repository export distributes reviewed Validation AST publications. It is never an input to Appraise-managed baseline
or implementation execution; those continue to use immutable runtime capsules.

## Contract

- `RepositoryExportJob` is the durable outbox record. Its idempotency key binds target project, exact validation hash,
  and destination.
- `RepositoryExportReceipt` is project-bound proof that the exact manifest was published successfully.
- Policies are `disabled` (the safe default), `optional`, and `required`. Only `required` affects completion, and it
  blocks only when the exact validation hash lacks a successful receipt.
- Create jobs with `POST /api/internal/coordinator/repository-exports`; run or resolve one with
  `POST /api/internal/coordinator/repository-exports/<job-id>`.

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
