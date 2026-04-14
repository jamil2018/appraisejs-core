# Appraise Starter Template

This is a production-first Appraise starter project. Copy this folder into a new directory to start a new project.

## Prerequisites

- Node.js 18+
- npm, pnpm, yarn, or bun

## Quick start

```bash
# 1. Install dependencies, create .env, and build the production app
npm run setup

# 2. Optional: install Playwright browsers when you need test execution
npm run install-playwright -- chromium

# 3. Optional: install an extra published template step
npx appraisejs@latest add step <group-slug>/<step-slug>

# 4. Start the local production server
npm run start
```

## What you get

- **URL**: Open [http://localhost:3000](http://localhost:3000) in your browser.
- **Runtime**: A seeded local SQLite database at `prisma/dev.db`.
- **Automation**: Starter automation assets under `automation/`, including features, locators, environments, and reusable steps.
- **UI**: The full Appraise dashboard and UI, ready to run from a production build.

## Scripts

| Script | Description |
| --- | --- |
| `npm run setup` | Install deps, create `.env`, and build the cucumber runtime plus the local production app |
| `npm run build:local` | Build the cucumber runtime and the local production app |
| `npm run start` | Start the local production server |
| `npm run dev` | Start the Next.js development server |
| `npm run install-playwright -- <browser...>` | Install selected Playwright browsers |
| `npm run setup:db` | Recreate the local SQLite database from migrations and rerun `sync-all` |
| `npm run setup:full` | Reinstall dependencies, rebuild the DB, rerun `sync-all`, and rebuild the production app |
| `npm run sync-all` | Sync all starter entities from the bundled automation workspace into the database |
| `npm run appraisejs:sync` | Alias for `sync-all` |
| `npm run appraisejs:install-step -- --payload-file <path>` | Internal script used by `npx appraisejs@latest add step ...` |

## Configuration

- Copy `.env.example` to `.env` before running, or let `npm run setup` create it.
- Default local database URL: `DATABASE_URL="file:./dev.db"`.
- The database file is created at `prisma/dev.db`.

## Notes

- `npm run setup` does not install Playwright browsers automatically. Install them only when you need browser-based test execution.
- `npm run dev` is still available for development workflows, but `npm run start` is the primary path for day-to-day local usage.
