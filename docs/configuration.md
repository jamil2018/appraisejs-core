# Configuration

This document explains configuration options and environment management.

## Environment Variables

Appraise uses a `.env` file at the repo root for runtime configuration. The test runner also sets/reads a few
environment variables at runtime (see \"Test Runner Environment Variables\" below).

### Required

- `DATABASE_URL`
  - Used by Prisma (`prisma/schema.prisma`) to connect to the database.
  - For local development the setup script creates a SQLite database file.
  - Example (created by `npm run setup-env`):
    - `DATABASE_URL="file:./prisma/dev.db"`

### Optional / Runtime

- `NODE_ENV`
  - Standard Node/Next.js environment flag (used for Prisma client caching in `src/config/db-config.ts`).

### Test Runner Environment Variables

These are set by the CLI runner or test-run executor and read by the Cucumber/Playwright test harness.

- `ENVIRONMENT`
  - Name of the environment to run against (key in `src/tests/config/environments/environments.json`).
- `HEADLESS`
  - `true` or `false`. Used by Playwright launch options.
- `BROWSER`
  - Browser engine: `chromium`, `firefox`, or `webkit`.
- `REPORT_PATH`
  - Optional. When set, Cucumber JSON output is written to this path (used by the app-driven test runner).
- `REPORT_FORMAT`
  - Optional. Overrides the Cucumber formatter string (see `cucumber.mjs`).
- `LOCATOR_LOCATION`
  - Optional. Overrides the base directory for locator JSON files.
  - Default: `src/tests/locators`
- `LOCATOR_MAP_LOCATION`
  - Optional. Overrides the locator map file path.
  - Default: `src/tests/mapping/locator-map.json`

## Environments (App)

Environments represent the target systems you run tests against (for example: “Staging”, “Prod”, “DemoQA”).
They are stored in the database in the `Environment` table and exposed in the UI under `/environments`.

### Environment fields

The environment editor enforces the following schema:

- `name` (required, unique)
- `baseUrl` (required, URL)
- `apiBaseUrl` (optional, URL)
- `username` (optional)
- `password` (optional)

### How the UI keeps test configuration in sync

When environments are created/updated/deleted in the UI, the app updates a shared JSON file used by the
CLI test runner:

- File: `src/tests/config/environments/environments.json`
- Source of truth: database table `Environment`
- Sync behavior:
  - `getAllEnvironmentsAction` refreshes the JSON file on read.
  - `createEnvironmentAction`, `updateEnvironmentAction`, and `deleteEnvironmentAction` update the JSON file after changes.
  - The JSON keys are derived from the environment name (lowercased, spaces converted to underscores).

If you need to synchronize the other direction (filesystem to database), run:

- `npm run sync-environments`

This script reads `src/tests/config/environments/environments.json` and creates/updates/deletes DB records
to match.

## Test Config

Configuration for the automated test runner lives under `src/tests/config`:

- `src/tests/config/environments/environments.json`
  - Map of environment keys to runtime config for tests.
  - Shape:
    - `baseUrl` (required)
    - `apiBaseUrl` (optional)
    - `email` (optional; mapped to DB `username`)
    - `password` (optional)
  - Example (from the repo):
    - `demoqa.baseUrl = "https://demoqa.com/"`
- `src/tests/config/executor/world.ts`
  - Cucumber `World` implementation (shared scenario state).
  - Not user-editable config, but a central place for test runtime defaults (timeouts, shared vars).

### Locator config (test runtime)

The Playwright locator system is configured via:

- Locator JSON files in `src/tests/locators/**`
  - Path can be overridden with `LOCATOR_LOCATION`.
- Locator map in `src/tests/mapping/locator-map.json`
  - Path can be overridden with `LOCATOR_MAP_LOCATION`.

## Local Settings

Local/developer-specific settings:

- `.env` is expected to be local-only (do not commit secrets).
- `DATABASE_URL` points to a local SQLite database by default (`prisma/dev.db`).
- Test report output is written under `src/tests/reports/` (reports/logs/traces).

If you are missing a `.env`, run:

- `npm run setup-env`
