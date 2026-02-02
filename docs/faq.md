# FAQ

## Where are tests stored?

Feature files live in `src/tests/features/`. Locators and step definitions live under `src/tests/locators/` and `src/tests/steps/`.

## Do I have to use the UI to create tests?

No. You can edit feature files, locators, and step definitions directly. Run the appropriate sync scripts to update the database.

## Why did my feature file change?

When you create or update test suites or cases in the UI, the system regenerates the feature file for that suite. Auto-generated files include a header warning that manual edits will be overwritten.

## How do I add a new environment?

Use the Environments UI, or edit `src/tests/config/environments/environments.json` and run `npm run sync-environments`.

## How do I run only a subset of tests?

Use tags and run Cucumber with `-t`, for example: `npx cucumber-js -t "@smoke"`.

## Where do reports and logs go?

Reports and logs are stored under `src/tests/reports/`.

## Is there authentication?

No. The current codebase does not include authentication or authorization.
