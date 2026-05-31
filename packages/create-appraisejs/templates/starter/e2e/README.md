# AppraiseJS E2E tests

Playwright UI tests run against a local Next.js server with an isolated SQLite database. Data is reset and seeded before each test via Prisma helpers in `e2e/helpers/test-data.ts`.

## Commands

- `npm run validate:e2e` — full suite (used in CI)
- `npm run validate:e2e:smoke` — smoke gate only (`@smoke` tag)
- `E2E_GREP=@crud npx playwright test` — run a tagged subset locally

## CI and parallelism

GitHub Actions runs `npm run validate:e2e` after `npm run build` with `DATABASE_URL=file:./e2e.db`
and `CI=true`. The Playwright web server starts via `e2e/start-server.mjs`, which recreates the
E2E database and applies migrations before serving the production build.

Keep `workers: 1` and `fullyParallel: false` in `playwright.config.ts` until each worker gets an
isolated database. Spec files reset and seed the same SQLite file in `beforeEach`, so parallel
workers cause unique-constraint and foreign-key failures in CI and locally.

## Layout

| File | Purpose |
| --- | --- |
| `appraise-smoke.spec.ts` | Fast regression gate |
| `navigation.spec.ts` | Route matrix and dashboard attention links |
| `crud-configuration.spec.ts` | Configuration entity CRUD |
| `crud-tests.spec.ts` | Suites, cases, template-based create |
| `authoring.spec.ts` | Inline dialogs, flow panel, authoring |
| `runs-and-reports.spec.ts` | Seeded runs, reports, create form (no execution) |
| `settings-sync.spec.ts` | Per-script sync buttons |

Helpers live under `e2e/helpers/` (`ui`, `navigation`, `table`, `forms`, `test-data`).

## Seed model

`seedCoreData()` provisions modules, environments, tags, locators, template steps, a test case and suite, a completed run with report, and dashboard metric variants (failed, queued, running runs; attention metrics for drawer links).

Seeded IDs are exported as `seededIds` for deep-link tests.

## Scope boundaries

**In scope:** UI flows with deterministic Prisma seed data.

**Out of scope (covered elsewhere):**

- Live `cucumber-js` execution and report JSON ingestion during E2E
- Locator picker companion / external browser extension flows
- Bidirectional feature sync CLI unless exposed in Settings UI

## Debugging

- Traces: `trace: 'on-first-retry'` in `playwright.config.ts`
- Videos/screenshots retained on failure
- Run a single file: `npx playwright test e2e/navigation.spec.ts`
- UI mode: `npx playwright test --ui`
