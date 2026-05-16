# Repository Guidelines

## Project Context

AppraiseJS is a local-first test management and execution platform. Users author modules, suites, cases, steps, locators, environments, tags, and templates in the UI. The app persists data in SQLite through Prisma, generates Gherkin feature files, executes tests with Cucumber and Playwright, parses reports, and displays run metrics in the app.

This repository contains the root AppraiseJS application and the `create-appraisejs` scaffolding package. The scaffold should inherit root app changes only through the expected template sync workflow.

## Project Structure & Module Organization

AppraiseJS uses Next.js 16 App Router, React 19, TypeScript strict mode, Prisma/SQLite, Tailwind CSS, Radix UI, TanStack libraries, React Flow, Cucumber, and Playwright.

Main app code lives in `src/`: routes in `src/app`, CRUD pages in `src/app/(base)`, API routes in `src/app/api`, server actions in `src/actions`, shared UI in `src/components`, orchestration helpers in `src/lib`, domain services in `src/services`, and shared types in `src/types`. Prisma schema and migrations are in `prisma/`. Utility and sync scripts are in `scripts/`. Static assets are in `public/` and `src/assets/`.

Packages live under `packages/`: `create-appraisejs` contains the CLI/scaffold source, `cucumber-runtime` contains reusable Cucumber runtime code, and `locator-picker-companion` contains locator-picker support code. Template copies live in `templates/` and `packages/create-appraisejs/templates/`.

Generated or sync-managed automation output is under `automation/`, including features, locators, reports, and mapping data. Change the source data, generator, or sync script instead of patching generated output directly.

## Build, Test, and Development Commands

- `npm run setup`: install dependencies, create env config, migrate SQLite, install Playwright, and run sync.
- `npm run dev`: start the local Next.js dev server.
- `npm run build`: build packages and the production Next.js app.
- `npm run start`: run the production server with local environment settings.
- `npm run lint`: run ESLint over the repository.
- `npm run validate`: run the configured Vitest suite through `scripts/run-vitest.ts`.
- `npm run test`: run Cucumber tests with `cucumber-js`.
- `npm run sync-all`: sync database-backed test metadata and generated files.
- `npm run sync-features:dry-run`: preview bidirectional feature/database sync.
- `npm run sync-template`: copy root app changes into `templates/`.
- `npm --prefix packages/create-appraisejs run sync-templates`: copy synced templates into the scaffold package.

## Coding Style & Naming Conventions

Use TypeScript for new code and prefer explicit, narrow types over `any`. Prettier uses 2 spaces, single quotes, no semicolons, trailing commas, 120 character lines, and Tailwind class sorting. Use `kebab-case` file names such as `test-case-form.tsx` and `date-utils.ts`. Prefer `@/` imports for `src/*`.

For database work, read `prisma/schema.prisma` first. The core hierarchy is `Module -> TestSuite -> TestCase -> TestCaseStep`, with related template, locator, environment, run, report, and metrics tables. Prisma client setup is centralized in `src/config/db-config.ts`.

## Testing Guidelines

Vitest covers unit and component tests named `*.test.ts` or `*.test.tsx` in `src/app`, `src/actions`, `src/components`, `src/services`, selected `src/lib` paths, and script libraries. Run focused checks with `npx vitest run path/to/file.test.tsx`, then use `npm run validate` for broader verification. Use `npm run test` for Cucumber execution behavior.

React Doctor runs on the root app only (`--project appraisejs`): `npm run quality:react-doctor` for a full scan, `npm run quality:react-doctor:ci` for the same with a non-zero exit on errors (used in CI). Pre-commit runs `npm run quality:react-doctor:commit` (staged files). Configuration lives in `react-doctor.config.json`; dead-code analysis is disabled there because Fallow already covers that surface.

## Commit & Pull Request Guidelines

Recent history uses short, imperative subjects such as `Fix empty flow block selection loop` or `Implement flow-builder node search with template sync`. Keep commits scoped and mention template sync when applicable. PRs should describe the change, list validation commands, link related issues, and include screenshots or clips for visible UI changes.

## Agent-Specific Instructions

Prefer canonical source files over generated artifacts. If changing authored test structure, check `src/lib/feature-file-generator.ts`, `src/lib/bidirectional-sync.ts`, `src/lib/database-sync.ts`, `src/lib/gherkin-parser.ts`, and the relevant `scripts/sync-*.ts` file.

For CRUD/domain work, start with `src/actions/*`, `prisma/schema.prisma`, and the matching page/form/table under `src/app/(base)`. For run execution or logs, start with `src/actions/test-run/test-run-actions.ts`, `src/lib/test-run/test-run-executor.ts`, `src/lib/test-run/process-manager.ts`, `src/app/api/test-runs/[runId]/logs/route.ts`, and `cucumber.mjs`.

For scaffolded-app changes, edit the root/base source first, then run `npm run sync-template` and, when relevant, `npm --prefix packages/create-appraisejs run sync-templates`. Preserve unrelated worktree changes and avoid reverting generated files unless explicitly requested.

### Commits, quality gates, and handoff

- **Commit incrementally**: After completing a substantial slice of work (for example a single scoped code change, one logical feature, or one completed implementation todo), create a **git commit** with a short imperative subject so progress is checkpointed and pre-commit hooks run on a bounded diff.
- **If pre-commit fails** (`npm run quality:pre-commit`, including Fallow and React Doctor): **fix the code or config you introduced** until the hook passes; do not bypass hooks or commit broken static analysis. Re-run `git commit` after fixes.
- **Before finishing a task**: Run **`npm run validate`** (Vitest suite) and **`npm run build`** so tests and the production build both succeed; fix anything that fails before considering the task done.

## graphify

This project has a knowledge graph at `graphify-out/` (gitignored) with god nodes, communities, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

**Do not read** `graphify-out/graph.json` or `graphify-out/graph.html` into context — they are multi-megabyte.

Rules (token-efficient):

- For architecture / flow / dependency questions, run `npm run graphify:query -- "<question>"` when `graphify-out/graph.json` exists (1500-token subgraph cap). Equivalent: `graphify query "<question>" --budget 1500`.
- Use `npm run graphify:path -- "A" "B"` or `npm run graphify:explain -- "Name"` for targeted lookups.
- If `graphify-out/wiki/index.md` exists, start there and open only linked community articles — not broad repo greps.
- Read `graphify-out/GRAPH_REPORT.md` only when query / path / explain / wiki are insufficient.
- After modifying code, run `npm run graphify:update` (AST-only, no LLM cost). Git `post-commit` / `post-checkout` hooks also refresh the graph on code-only changes.
- Rebuild from scratch: `/graphify .` (skill: `.agents/skills/graphify/SKILL.md`). `.graphifyignore` excludes `templates/` and vendored `.agents/skills/`.
- Check `graphify-out/memory/` for saved Q&A before re-deriving the same answer.

**Codex:** `.codex/hooks.json` runs `graphify hook-check` on Bash (PreToolUse) to prefer graph navigation over raw search. Enable `multi_agent = true` under `[features]` in `.codex/config.toml` for parallel `/graphify` extraction.
