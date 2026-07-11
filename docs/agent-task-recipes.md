# Agent Task Recipes

Use these short recipes to choose the first files and focused validation for common AppraiseJS work.

## CRUD And Domain Changes

Start with the matching `src/actions/*`, `src/services/*`, `prisma/schema.prisma`, and route-specific UI under
`src/app/(base)`. Actions should parse input and map responses; services own business rules; persistence goes through
Prisma or dedicated helpers.

Validation: affected unit tests, `npx eslint <files>`, `npx prettier --check <files>`, and broader checks when schema
or shared services change.

For any major behavior or workflow change, update the matching current docs before finishing. Treat stale active docs
found during repo inspection as part of the task scope.

## Prisma Schema And Migrations

Read `prisma/schema.prisma`, affected services/actions, migrations, sync scripts, and tests before changing models.
Check generated or prepared artifacts only after the canonical model and migration behavior are correct.

Validation: migration validation, affected tests, and `npm run build` for broad schema or package impacts.

Update schema, sync, scaffold, or runtime docs when the model change affects how agents or maintainers should navigate,
prepare, or validate the repo.

## Appraise Lifecycle And MCP

Read `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`, `packages/appraisejs/AGENTS.md`,
`packages/appraisejs/src/mcp.ts`, and affected coordinator services. Keep approval and sign-off transitions
Appraise-owned.

Validation: focused service/package tests, `npm run setup:mcp` when setup text changes, `npm run smoke:coordinator`
when lifecycle API behavior changes, and `npm --prefix packages/appraisejs run test:mcp:e2e` when MCP transport or
tools change.

Update `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`, `docs/agent-mcp-setup.md`, or package guidance
when lifecycle states, MCP tools, handoff URLs, setup commands, or ownership boundaries change.

## Scaffold And Template Changes

Read `docs/agent-scaffold-flow.md`, `docs/scaffold-template-sync.md`, `packages/create-appraisejs/AGENTS.md`, and
`packages/create-appraisejs/scripts/prepare-template.ts`. Change root/base source first when scaffold behavior should
flow into generated apps.

Validation: `npm --prefix packages/create-appraisejs run prepare-template`, package tests when CLI behavior changes,
and careful review of template diffs.

Update scaffold docs and generated-artifact guidance when the bundled template model, preparation command, preserved
template files, or seeded-data rules change.

## Test Run, Reports, And Logs

Read `docs/test-run-runtime.md`, then inspect `src/actions/test-run/test-run-actions.ts`,
`src/services/test-run/test-run-service.ts`, `src/lib/executor/local-executor-adapter.ts`,
`src/lib/test-run/process-manager.ts`, `src/app/api/test-runs/[runId]/logs/route.ts`, and `cucumber.mjs`.

Validation: focused unit tests, Cucumber or Playwright checks when runtime behavior changes, and `npm run build` for
shared runtime changes.

Update runtime docs when execution commands, report locations, log streaming, adapters, or run-state behavior change.

## React Routes And Components

Read `docs/component-organization-rules.md` and keep route-specific UI local unless reuse or separation clearly
justifies moving it into `src/components`.

Validation: affected tests, `npx eslint <files>`, `npx prettier --check <files>`, and browser checks for user-facing
interaction changes.

Update component or route organization docs when a UI change establishes a new shared pattern or moves ownership
between route-local and reusable components.

## Automation Sync

Read `docs/automation-sync-rules.md`, then inspect the relevant generator, parser, database sync, and `scripts/sync-*`
entry point. Prefer source data, generators, or sync logic over direct generated-output edits.

Validation: dry-run sync when available, affected sync tests, and review of generated diffs.

Update automation sync or generated-artifact docs when canonical sources, sync commands, or generated output ownership
changes.

For reviewed runtime capsules, start with `prisma/schema.prisma`, `src/lib/runtime-capsule/`,
`src/services/test-run/runtime-capsule-test-run-service.ts`, the capsule executor, diagnostics service/routes, and
`test-run-artifact-access-service.ts`. Validate receipt/materializer/preflight contracts, real-SQLite attempt and
containment behavior, artifact routes, and package CLI/MCP response modes. Capsule execution must not write or import
target-repository automation as authority.

## E2E And Playwright

Read `docs/test-run-runtime.md`, the target spec, and shared helpers before changing assertions or setup. Keep tests
aligned with normal user flows rather than backend shortcuts.

Validation: the smallest matching Playwright command first, then broader E2E only when shared helpers or app-wide
behavior changed.
