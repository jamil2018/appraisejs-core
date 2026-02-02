# Overview

This document explains what AppraiseJS Core is, the problems it solves, and the primary concepts you should know before diving deeper.

## What It Is

AppraiseJS Core is a local-first test management and execution system built on Next.js, Prisma, Cucumber, and Playwright. It lets teams model test assets (modules, suites, cases, steps, locators, environments), run tests with consistent configuration, and store results and metrics in a local SQLite database. The filesystem remains the primary artifact for authored assets, while the database powers the UI, search, and reporting.

## Who It Is For

- QA engineers and automation developers who want a local, version-controlled workflow
- Small teams that prefer SQLite and filesystem-backed assets over hosted services
- Developers who need a UI for test organization and reporting without introducing a new external system

## Key Concepts (Short)

- Module: A hierarchical grouping derived from folder structure for features and locators.
- Locator group: A JSON file that groups UI selectors by route or page.
- Locator: A named selector string used by steps to interact with the UI.
- Template step group: A group of reusable step definitions (ACTION or VALIDATION).
- Template step: A reusable step definition with parameters and metadata.
- Test suite: A feature file and its scenarios, grouped by module.
- Test case: A single scenario with tags and ordered steps.
- Environment: A target system configuration (base URL, API URL, credentials).
- Tag: Cucumber tag used for filtering or identifying cases (for example, `@tc_...`).
- Test run: An execution instance of selected test cases and tags.
- Report: Stored test run output (features, scenarios, steps, hooks) and metrics.

## How It Works (High Level)

- Authored assets live in the filesystem (features, locators, step definitions).
- Sync scripts import those assets into the database for the UI.
- The UI can also generate or update feature files when test suites or cases change.
- Test runs spawn a Cucumber process, write JSON reports to disk, and ingest results into the database.

See also: [Architecture](architecture.md), [Project Structure](project-structure.md), [Syncing](syncing.md).
