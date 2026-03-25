# AppraiseJS Project Context

## What This Repository Is

AppraiseJS is a local-first test management and execution platform built with Next.js. Users author test structure in the UI, AppraiseJS persists that data in SQLite via Prisma, generates Gherkin feature files, executes them with Cucumber + Playwright, parses the results, and shows run/report data back in the app.

This repository contains two related deliverables:

1. The main AppraiseJS application at the repo root.
2. The `create-appraisejs` scaffolding package in `packages/create-appraisejs`, which ships the default template for new projects.

## Core Stack

- Next.js 16 App Router
- React 19
- TypeScript with `strict: true`
- Prisma + SQLite (`DATABASE_URL="file:./dev.db"` by default, which creates `prisma/dev.db`)
- Cucumber + Playwright for test execution
- Tailwind CSS + Radix UI
- TanStack Table/Form, React Flow, Recharts

## Repository Layout

### Main app

- `src/app/`: App Router pages, layouts, dashboard, and API routes
- `src/app/(base)/`: CRUD-style pages for modules, suites, cases, runs, reports, locators, environments, tags, reviews, template steps, and template test cases
- `src/app/api/test-runs/[runId]/`: run log/download endpoints
- `src/actions/`: server actions grouped by domain
- `src/lib/`: orchestration logic, sync, feature generation, report parsing, metrics, and helpers
- `src/lib/test-run/`: run executor, process manager, log formatting, winston logger, report parser
- `automation/`: starter automation assets, feature files, locators, environments, and reports
- `prisma/`: schema and migrations
- `scripts/`: setup and sync scripts
- `templates/default/`: scaffoldable app template derived from the root app

### Scaffold package

- `packages/create-appraisejs/src/`: CLI source for the `npx create-appraisejs` package
- `packages/create-appraisejs/templates/default/`: packaged copy of the default template

## How The App Works

### Authoring flow

Users create:

- Modules
- Locator groups and locators
- Test suites
- Test cases with ordered steps
- Template step groups, template steps, and template test cases
- Environments and tags

Server actions in `src/actions/` persist these entities through Prisma.

### Execution flow

1. Authored test data is saved in SQLite.
2. Feature files are generated under `automation/features/`.
3. Starting a run creates `TestRun` and `TestRunTestCase` records.
4. `src/lib/test-run/test-run-executor.ts` spawns `npx cucumber-js`.
5. `cucumber.mjs` loads step definitions, hooks, parameter types, and writes JSON reports.
6. Logs are streamed through the Node runtime SSE route at `src/app/api/test-runs/[runId]/logs/route.ts`.
7. JSON reports are parsed and persisted into report tables.
8. Dashboard/report pages render metrics and execution results from the database.

## Important Data Model

The main hierarchy is:

- `Module -> TestSuite -> TestCase -> TestCaseStep`
- `TemplateStepGroup -> TemplateStep`
- `LocatorGroup -> Locator`
- `Environment -> TestRun -> TestRunTestCase`
- `TestRun -> Report -> ReportFeature -> ReportScenario -> ReportStep`

Metrics tables also exist for test cases, test suites, and dashboard summaries.

Read `prisma/schema.prisma` before making data model changes. This schema is central to both UI behavior and run/report ingestion.

## Source Of Truth Vs Generated Files

This repository mixes authored code with generated test artifacts. Be careful not to edit generated output when the real change belongs upstream.

### Usually source of truth

- UI pages/components in `src/app/` and `src/components/`
- server actions in `src/actions/`
- orchestration logic in `src/lib/`
- Prisma schema/migrations in `prisma/`
- reusable automation runtime files in `automation/steps/` and the local runtime package under `packages/cucumber-runtime/`
- sync/setup scripts in `scripts/`

### Usually generated or sync-managed

- `automation/features/**/*.feature`
  These are auto-generated from DB state and also participate in bidirectional sync.
- `automation/reports/**`
  Run output artifacts.
- `automation/locators/**`
  Sync-managed locator files.
- `automation/mapping/locator-map.json`
  Sync-managed mapping data.
- Some files under `src/tests/steps/**/*.step.ts`
  ESLint explicitly ignores these generated step files.

If a change affects authored test structure, check whether `generateFeatureFile`, the bidirectional sync layer, or one of the `scripts/sync-*.ts` files should be updated instead of patching generated files directly.

## Sync And Setup Conventions

Key scripts from the root `package.json`:

- `npm run setup`: install deps, create `.env`, run Prisma migrations, install Playwright, then `sync-all`
- `npm run dev`: start the root app in development mode
- `npm run build`: production build
- `npm run lint`: ESLint
- `npm run test`: `cucumber-js`
- `npm run sync-all`: run sync scripts in dependency order
- `npm run sync-features`: bidirectional database/filesystem feature sync for `automation/features`
- `npm run sync-template`: copy the root app into `templates/default/`

`scripts/sync-all.ts` is the main orchestrator. It runs sync steps in dependency order: modules/environments/tags/template-step-groups/template-steps/locator-groups/locators/test-suites/test-cases.

`scripts/regenerate-features.ts` performs bidirectional sync between `automation/features` and the database. Use `--dry-run` when you want to inspect impact first.

## Template And Scaffold Relationship

There are two template sync layers:

1. `npm run sync-template`
   Copies the root app into `templates/default/`, preserves starter automation assets, strips report artifacts, and preserves template-only files like its README.
2. `packages/create-appraisejs/scripts/sync-templates.ts`
   Copies `templates/default/` into `packages/create-appraisejs/templates/default/`.

When changing the scaffolded app experience, verify whether the change belongs in:

- the root app only,
- `templates/default/`,
- or the published `create-appraisejs` package flow.

If the default scaffold should inherit the root app change, the template sync path matters.

## Development Conventions

- Use `@/` imports for `src/*`.
- TypeScript strict mode is enabled.
- Prisma client is a singleton in `src/config/db-config.ts`.
- SSE and test-process state rely on Node runtime behavior and the in-memory process manager.
- The root app uses App Router server components heavily; many pages call server actions directly.
- The dashboard lives at `src/app/page.tsx`, not under a separate `/dashboard` route.

## Files Worth Reading First For Common Tasks

### If working on CRUD/domain logic

- `src/actions/*`
- `prisma/schema.prisma`
- matching page/form/table files in `src/app/(base)/`

### If working on run execution or logs

- `src/actions/test-run/test-run-actions.ts`
- `src/lib/test-run/test-run-executor.ts`
- `src/lib/test-run/process-manager.ts`
- `src/app/api/test-runs/[runId]/logs/route.ts`
- `cucumber.mjs`

### If working on feature or sync behavior

- `src/lib/feature-file-generator.ts`
- `src/lib/bidirectional-sync.ts`
- `src/lib/database-sync.ts`
- `src/lib/gherkin-parser.ts`
- `scripts/sync-all.ts`
- `scripts/regenerate-features.ts`

### If working on scaffold/create-appraisejs

- `packages/create-appraisejs/src/cli.ts`
- `packages/create-appraisejs/src/download-repo.ts`
- `packages/create-appraisejs/src/copy-template.ts`
- `packages/create-appraisejs/src/install.ts`
- `packages/create-appraisejs/README.md`

## Practical Guidance For Future Edits

- Prefer changing canonical source files, not generated `src/tests` outputs.
- When deleting or creating test cases/suites, remember feature file regeneration is part of the behavior.
- When changing schema or run/report behavior, check dashboard metrics and report ingestion paths.
- When changing the root app in a way that should affect new scaffolds, consider whether `templates/default/` and `packages/create-appraisejs/templates/default/` also need syncing.
- Avoid assuming authentication exists; several routes/actions note that auth is still TODO.

## Current Project Identity

- Package name: `appraise`
- Current root app version: `0.1.9-alpha`
- Scaffold package version: `create-appraisejs@0.1.9`
- Node requirement in scaffold package: `>=18`

## Primary Docs

- `README.md`: product overview, architecture, and onboarding
- `CONTRIBUTING.md`: development workflow and repo structure
- `packages/create-appraisejs/README.md`: scaffold package behavior
