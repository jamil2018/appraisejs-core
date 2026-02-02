# Database

This document describes the database schema, migrations, and local setup.

## Overview

Appraise uses Prisma with SQLite for a local-first, single-tenant data store. The database supports the UI, search, reporting, and metrics, while most authored assets still live in the filesystem and are synced into the database as needed.

The database connection is configured via `DATABASE_URL` in `.env` (local default: `file:./prisma/dev.db`).

## Schema

The schema is organized into these major groups:

- Authoring structure:
  - `Module` (hierarchical module tree)
  - `LocatorGroup`, `Locator` (selectors grouped by route/page)
- Test authoring:
  - `TemplateStepGroup`, `TemplateStep`
  - `TemplateTestCase`, `TemplateTestCaseStep`
  - `TestSuite`, `TestCase`, `TestCaseStep`
- Organization:
  - `Tag` (filter tags and `@tc_...` identifier tags)
  - `Environment`
- Execution and reporting:
  - `TestRun`, `TestRunTestCase`, `TestRunLog`
  - `Report`, `ReportFeature`, `ReportScenario`, `ReportStep`, `ReportHook`, `ReportTestCase`
- Metrics and review:
  - `TestCaseMetrics`, `TestSuiteMetrics`, `DashboardMetrics`
  - `Review`
- Conflict tracking:
  - `ConflictResolution` (used for locator conflicts)

Key relationships:

- `Module` is a tree (parent/child). Locators and test suites are scoped to modules.
- `TestSuite` has many `TestCase`s, and test cases can belong to multiple suites.
- `TestRun` belongs to an `Environment` and has many test cases (via `TestRunTestCase`).
- `Report` records are created after a test run finishes and link back to the run.

See `prisma/schema.prisma` for the full schema.

## Migrations

- Run migrations locally:

```bash
npm run migrate-db
```

- Create a new migration during development:

```bash
npx prisma migrate dev --name <migration-name>
```

Migrations live under `prisma/migrations/`. The local SQLite file (`prisma/dev.db`) is updated when migrations run.

## Prisma Studio

You can inspect data with Prisma Studio:

```bash
npx prisma studio
```

Caution: Editing data directly in the database can desync it from the filesystem. If you make manual DB changes, re-run the appropriate sync scripts (see [Syncing](syncing.md)).
