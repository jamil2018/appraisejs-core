# Automation Authority Rules

The database is the sole authoring authority for modules, suites, cases, Step Invocations, locators, locator groups,
environments, and tags. Ordinary CRUD mutations must never read from or write to `automation/`.

## Runtime execution

Appraise materializes features, bindings, support files, configuration, reports, and diagnostics only inside an
immutable runtime capsule. A target checkout and any `automation/` directory in it are not execution inputs and are
not changed by managed or independent runs. Complete, exact canonical Step Invocations are required before a case can
enter the executable capsule pipeline.

## Derived outputs

Generated human Step projections remain derived catalog assets. Their canonical sources are the operation definitions
and handlers; generate them with `npm run operation:projections`. Do not hand-edit the generated wrappers.

Repository export is an explicit, receipt-backed distribution operation described in
`docs/repository-export-runtime.md`. Its files are never read back into database authoring state or used as managed
execution authority.

## Agent workflow

1. Change database-owned services, actions, and canonical operation definitions.
2. For an execution change, inspect the runtime-capsule materializer and its receipt/provenance tests.
3. For a distribution change, inspect the repository export service and conflict-detection tests.
4. Do not run deleted `sync-*` or feature-regeneration commands, and do not patch target `automation/` files.

## Never do

- Do not introduce a filesystem-to-database import, bidirectional synchronization, or an import preview for
  `automation/`.
- Do not regenerate workspace feature files from CRUD operations or while scheduling a run.
- Do not use repository exports or human Step projections as execution authority.
- Do not commit capsule output, reports, logs, traces, or screenshots except as an explicitly approved fixture.
