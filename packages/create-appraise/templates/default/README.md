# Appraise Starter Template

This is a standalone Appraise starter project. Copy this folder into a new directory to start a new project.

## Prerequisites

- Node.js 18+
- npm, pnpm, or yarn

## Quick start

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Setup: create .env, run migrations, install Playwright
npm run setup

# 3. Sync entities from filesystem to database
npm run sync-all

# 4. Start the dev server
npm run dev
```

## What you get

- **URL**: Open [http://localhost:3000](http://localhost:3000) in your browser.
- **UI**: The full Appraise dashboard and UI — same as the main Appraise app. You can manage test suites, test cases, template steps, locators, environments, tags, and run tests.

## Scripts

| Script                   | Description                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Start Next.js dev server                                                                                        |
| `npm run build`          | Build for production                                                                                            |
| `npm run start`          | Start production server                                                                                         |
| `npm run setup`          | Install deps, create .env, migrate DB, install Playwright                                                       |
| `npm run appraise:setup` | Alias for `setup`                                                                                               |
| `npm run sync-all`       | Sync all entities (modules, environments, tags, steps, locators, test suites, test cases) from filesystem to DB |
| `npm run appraise:sync`  | Alias for `sync-all`                                                                                            |
| `npm run test`           | Run Cucumber tests                                                                                              |

## Configuration

- Copy `.env.example` to `.env` before running (or let `npm run setup` create it). Required: `DATABASE_URL="file:./prisma/dev.db"` for SQLite.
- `appraise.config.json` — minimal starter config for future CLI/tooling.

## Note

`npm run setup` runs `install-playwright`, which may require network access and a few minutes. The first `sync-all` run will sync entities from the included `src/tests` structure (locators, steps, environments) into the database.
