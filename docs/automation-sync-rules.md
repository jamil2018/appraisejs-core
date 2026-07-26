# Automation Sync Rules

Pending-sync inventory is represented as typed family comparisons in `src/lib/sync/pending-comparators.ts`. Each
family owns its mismatch count and reasons; aggregation is generic and must not inspect entity-specific properties.
Environment comparisons use credential reference names and state only, never credential values.

> Phase 5 migration: unmarked legacy automation can be inspected through the non-mutating import preview described in
> `docs/legacy-automation-migration.md`. Direct mutation and bidirectional import of directories containing
> `.appraise-generated.json` are blocked. Reviewed Validation AST state and immutable runtime capsules remain
> authoritative for new managed workflows.

This document helps agents work safely with AppraiseJS automation artifacts. It is routing guidance, not a complete
feature specification.

## Mental Model

The UI and database are the canonical authoring surface for modules, suites, cases, steps, locators, environments,
tags, and templates. Files under `automation/` are runtime and sync-managed artifacts used by Cucumber, Playwright, and
the report pipeline.

Prefer changing the source data, generator, parser, or sync script that owns an artifact. Edit generated output directly
only when the task explicitly targets that output shape and the owning sync path has been checked.

## Key Locations

- Automation roots and path helpers: `src/lib/automation/automation-path-roots.ts`
- Workspace preparation: `src/lib/automation/automation-workspace.ts`
- Feature generation: `src/lib/feature-file-generator.ts`
- Gherkin parsing: `src/lib/gherkin-parser.ts`
- Bidirectional feature/database sync: `src/lib/bidirectional-sync.ts`
- Database-backed sync helpers: `src/lib/database-sync.ts`
- Sync scripts: `scripts/sync-*.ts`
- Cucumber runtime config: `cucumber.mjs`

## Automation Directories

- `automation/features`: generated Gherkin feature files.
- `automation/steps`: generated executable projections for canonical Step Definitions.
- `automation/locators`: locator data used by runtime steps.
- `automation/mapping`: mapping data such as locator maps.
- `automation/config`: runtime configuration, including environments.
- `automation/reports`: run output such as `cucumber.json`, logs, traces, and screenshots.

Treat `automation/reports` as run output. Do not hand-edit reports, logs, screenshots, or traces to satisfy app behavior.

Reviewed managed-validation runs use Appraise-owned capsule projections under
`.appraise/projects/<TargetProject.id>/runtime/<validationHash>/<runId>/`. These are not automation-sync inputs:
database ownership plus the sealed manifest/receipt are authoritative, and agents must not hand-edit or import them.
Legacy runs continue to use `automation/reports`.

The reusable Playwright catalog is projected into `automation/steps/actions/generated` and
`automation/steps/validations/generated` by `npm run operation:projections`. Author built-in behavior in the canonical
operation definitions and handlers. Do not hand-edit generated wrappers. Validation authoring resolves ready Step
Definitions and stores exact Step Invocations; see `docs/reusable-playwright-step-definitions.md` for the shared
definition and stored-variable contract. `npm run operation:projections` lints every projected step after generation;
`npm run lint:step-definitions` is the focused syntax/import gate and includes duplicate-import and redeclaration
checks.

Environment projections contain `passwordEnvironmentVariable`, which is only the name of a process environment
variable. Never place a credential value or a `password` field in database seed data, sync input, generated
configuration, fixtures, or scaffold source. The Cucumber runtime resolves a configured reference only inside the
execution process and fails with a redacted configuration error when it is missing or marked as legacy.

`expectedPageTitle` is Appraise-owned environment identity metadata used by baseline preflight. It is not exported into
the target runtime environment file because it does not configure the application under test.

Reviewed publications may also be distributed under `automation/appraise/` through the durable workflow in
`docs/repository-export-runtime.md`. This is a generated projection: do not edit it as canonical source or use it for
Appraise-managed execution.

## Sync Commands

Use `package.json` as the command source of truth. Common sync commands are:

- `npm run sync-all`: run the database-backed sync flow.
- `npm run sync-step-definitions`: register canonical built-in Step Definitions through the shared registry.
- `npm run sync-features:dry-run`: preview feature/database sync before applying changes.
- `npm run sync-features`: regenerate feature files from synced data.
- `npm run sync-locator-groups`, `npm run sync-locators`, `npm run sync-environments`, `npm run sync-modules`,
  `npm run sync-tags`, `npm run sync-test-suites`, `npm run sync-test-cases`: run focused syncs when the touched domain
  is known.
- `npm --prefix packages/create-appraisejs run prepare-template`: refresh the scaffold base template and flavor overlays.

## Agent Workflow

1. Identify whether the task changes authored test data, runtime execution, generated feature text, or report display.
2. Read the owning source files before editing any file under `automation/`.
3. Prefer a focused sync command when only one domain is affected; use `sync-all` for coordinated metadata changes.
4. Use `sync-features:dry-run` before applying feature/database sync changes when the direction or blast radius is
   uncertain.
5. Review generated diffs before finishing. Generated changes should be explainable from source changes.

## Never Do

- Do not patch generated features, locator maps, or reports as a substitute for changing the owning source or sync
  script.
- Do not rely on legacy `src/tests` paths unless current source code explicitly supports a compatibility path.
- Do not commit report output created only by local validation unless the task explicitly requires fixture updates.
- Do not run broad sync commands without checking the diff they produce.
