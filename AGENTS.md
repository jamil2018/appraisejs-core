# Repository Agent Guidance

## Role of This File

This file is the routing and safety layer for coding agents working in AppraiseJS. Keep detailed product docs,
feature specs, API notes, and implementation plans in dedicated docs or source files. Use this file to decide where
to look, what is authoritative, what not to touch, and how to validate work.

## Mental Model

AppraiseJS is a local-first test management and execution platform. The app stores authored modules, suites, cases,
steps, locators, environments, tags, and templates in SQLite through Prisma. It generates Gherkin feature files, runs
tests with Cucumber and Playwright, parses reports, and displays run metrics.

This repo contains the root app and related packages, including `create-appraisejs`. Scaffold/template changes should
originate in the root/base source and flow through the template sync workflow.

## Instruction Priority

When instructions conflict, follow this order:

1. The user's explicit request and constraints.
2. This `AGENTS.md` file for repo-specific safety and routing.
3. Source code, tests, schemas, and config files.
4. Current docs such as `docs/*`, `README.md`, and `CONTRIBUTING.md`.
5. Historical plans under `codex/development plan/*`, which are reference-only unless the user names one.

## Sources of Truth

- Commands and scripts: `package.json`
- Database model: `prisma/schema.prisma`
- Prisma client setup: `src/config/db-config.ts`
- Automation sync rules: `docs/automation-sync-rules.md`
- Scaffold/template sync rules: `docs/scaffold-template-sync.md`
- Test run runtime map: `docs/test-run-runtime.md`
- Server action/service conventions: `docs/server-actions-conventions.md`
- Component organization rules: `docs/component-organization-rules.md`
- Cucumber runtime config: `cucumber.mjs`
- Formatting and line endings: `.prettierrc`, `.editorconfig`, `.gitattributes`, `.gitconfig.appraise`
- Static analysis config: `.fallowrc.json`, `react-doctor.config.json`

Generated or sync-managed automation output lives under `automation/`. Prefer changing source data, generators, or
sync scripts instead of editing generated output directly.

## Task Routing

For CRUD/domain work, start with `src/actions/*`, `src/services/*`, `prisma/schema.prisma`, and the matching
page/form/table under `src/app/(base)`.

For database/schema work, read `prisma/schema.prisma` first and check affected services, actions, migrations, sync
scripts, and tests before changing the model.

For authored test structure, feature generation, or sync behavior, follow `docs/automation-sync-rules.md`, then check
`src/lib/feature-file-generator.ts`, `src/lib/bidirectional-sync.ts`, `src/lib/database-sync.ts`,
`src/lib/gherkin-parser.ts`, and the relevant `scripts/sync-*.ts`.

For test execution, reports, or logs, follow `docs/test-run-runtime.md`, then start with
`src/actions/test-run/test-run-actions.ts`, `src/services/test-run/test-run-service.ts`,
`src/lib/executor/local-executor-adapter.ts`, `src/lib/test-run/process-manager.ts`,
`src/app/api/test-runs/[runId]/logs/route.ts`, and `cucumber.mjs`.

For UI organization, follow `docs/component-organization-rules.md`. Keep route-specific UI local unless reuse or
separation clearly justifies moving it into `src/components`.

For server actions, follow `docs/server-actions-conventions.md`: actions parse input and map responses; services own
business rules; persistence uses Prisma or dedicated helpers.

For scaffolded-app changes, follow `docs/scaffold-template-sync.md`. Edit root/base source first, then run
`npm run sync-template` and, when relevant, `npm --prefix packages/create-appraisejs run sync-templates`.

## Never Do

- Do not patch generated automation output when a source, generator, or sync script should change instead.
- Do not edit scaffold templates directly when the root/base source should sync.
- Do not revert unrelated worktree changes.
- Do not bypass pre-commit hooks or ignore hook failures.
- Do not apply broad formatting churn unrelated to the task.
- Do not treat historical development plans as authoritative without checking current source.
- Do not guess on broad behavior, schema, runtime, or template-sync changes when repo inspection leaves important
  questions unanswered.

## Validation

Use focused checks first. Prefer affected-file ESLint and Prettier checks before full-repo commands unless the change
is broad. `package.json` is the full source of truth for scripts.

Common validation commands:

- `npm run lint`
- `npx eslint <files>`
- `npx prettier --check <files>`
- `npx prettier --write <files>`
- `npm run validate`
- `npx vitest run <test-file>`
- `npm run test`
- `npm run quality:fallow:commit`
- `npm run quality:react-doctor:commit`
- `npm run build`

Run related tests when tests exist or are added. Run `npm run build` for broad changes, package/config/schema changes,
runtime execution changes, or release-like work.

## Completion Criteria

Before finishing, make sure:

- The change is made in canonical source files.
- Generated/template sync has run when applicable.
- Focused linting and formatting have passed, or failures are explained.
- Relevant tests, static analysis, and build checks have run based on risk.
- Hook failures introduced by the change are fixed.
- The final response summarizes changed areas and validation performed.
