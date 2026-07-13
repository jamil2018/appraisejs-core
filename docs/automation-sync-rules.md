# Automation Sync Rules

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
- `automation/steps`: executable step definitions and installed template step files.
- `automation/locators`: locator data used by runtime steps.
- `automation/mapping`: mapping data such as locator maps.
- `automation/config`: runtime configuration, including environments.
- `automation/reports`: run output such as `cucumber.json`, logs, traces, and screenshots.

Treat `automation/reports` as run output. Do not hand-edit reports, logs, screenshots, or traces to satisfy app behavior.

Reviewed managed-validation runs use Appraise-owned capsule projections under
`.appraise/projects/<TargetProject.id>/runtime/<validationHash>/<runId>/`. These are not automation-sync inputs:
database ownership plus the sealed manifest/receipt are authoritative, and agents must not hand-edit or import them.
Legacy runs continue to use `automation/reports`.

Reviewed publications may also be distributed under `automation/appraise/` through the durable workflow in
`docs/repository-export-runtime.md`. This is a generated projection: do not edit it as canonical source or use it for
Appraise-managed execution.

## Sync Commands

Use `package.json` as the command source of truth. Common sync commands are:

- `npm run sync-all`: run the database-backed sync flow.
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
