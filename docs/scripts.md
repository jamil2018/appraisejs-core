# Scripts

This document lists the npm scripts and what they do.

## Setup and Dev

- `npm run install-dependencies`: Installs dependencies with legacy peer deps.
- `npm run setup-env`: Creates a local `.env` with SQLite `DATABASE_URL`.
- `npm run migrate-db`: Runs Prisma migrations (`prisma migrate dev`).
- `npm run install-playwright`: Installs Playwright browsers and OS deps.
- `npm run setup`: Runs install + env + migrate + Playwright install.
- `npm run dev`: Starts the Next.js dev server.
- `npm run build`: Builds the production app.
- `npm run start`: Starts the production app.

## Linting and Formatting

- `npm run lint`: Runs Next.js lint.

## Database

- `npm run migrate-db`: Applies migrations.
- `npx prisma studio`: Open Prisma Studio (not an npm script).

## Sync

- `npm run sync-all`: Runs all sync scripts in dependency order.
- `npm run sync-features`: Bidirectional feature sync (DB <-> FS).
- `npm run sync-features:dry-run`: Dry run for bidirectional feature sync.
- `npm run sync-modules`: Build module hierarchy from locators/features.
- `npm run sync-environments`: Sync `environments.json` to DB.
- `npm run sync-tags`: Sync tags from feature files.
- `npm run sync-template-step-groups`: Sync step groups from step files.
- `npm run sync-template-steps`: Sync template steps from step files.
- `npm run sync-locator-groups`: Sync locator groups and route mapping.
- `npm run sync-locators`: Sync locators from JSON files.
- `npm run sync-test-suites`: Sync test suites from feature files.
- `npm run sync-test-cases`: Sync test cases from feature files.

## Testing

- `npm test`: Runs Cucumber with repo configuration.
