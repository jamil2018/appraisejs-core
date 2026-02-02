# Troubleshooting

This document lists common issues and fixes.

## Setup Issues

- `.env` missing or `DATABASE_URL` not set
  - Run: `npm run setup-env`
- Prisma migration errors
  - Run: `npm run migrate-db`
  - Ensure `prisma/dev.db` is writable
- Playwright browsers missing
  - Run: `npm run install-playwright`

## Sync Issues

- Sync scripts fail due to invalid JSON
  - Validate `src/tests/config/environments/environments.json`, locator JSON, or `locator-map.json`.
- `sync-test-cases` skips scenarios
  - Ensure each scenario has an `@tc_...` identifier tag.
- `sync-template-step-*` reports missing JSDoc
  - Confirm group JSDoc at top of step files and step JSDoc above each definition.

## Test Failures

- Locators not found
  - Confirm locator group is mapped in `src/tests/mapping/locator-map.json`.
  - Verify locator name exists in the current group file.
- Browser not launching or stuck
  - Try `HEADLESS=false` and `--parallel 1`.
  - Reinstall Playwright browsers.

## Database Issues

- UI shows stale data after file changes
  - Run the appropriate sync script or `npm run sync-all`.
- Manual DB edits get overwritten
  - Filesystem is the source of truth for authored assets; re-run sync after changes.
