# Syncing

This document explains the sync model, scripts, and common workflows.

## Source of Truth

- Filesystem-first: modules, locators, environments, tags, template steps, feature files.
- Database-first: test runs, reports, metrics, logs, and run state.

The UI can write to both the database and filesystem for some assets (notably test suites and test cases). If you edit files directly, re-run the relevant sync scripts to update the DB.

## Sync Scripts

The full sync pipeline runs filesystem -> database in this order:

1. `sync-modules`
2. `sync-environments`
3. `sync-tags`
4. `sync-template-step-groups`
5. `sync-template-steps`
6. `sync-locator-groups`
7. `sync-locators`
8. `sync-test-suites`
9. `sync-test-cases`

Run all in order:

```bash
npm run sync-all
```

Notes:

- Each sync script treats the filesystem as authoritative and can delete DB rows not present in files.
- `sync-test-cases` requires scenarios to include an `@tc_...` identifier tag.
- `sync-template-step-groups` and `sync-template-steps` read JSDoc metadata from step files under `src/tests/steps/**`.
- `sync-locator-groups` reads `src/tests/mapping/locator-map.json` when present to map groups to routes.

## When To Run Sync

- After pulling or merging changes that modify feature files, locators, or step definitions.
- After editing `src/tests/config/environments/environments.json` directly.
- After adding or renaming locator groups or locator files.

If you use the UI to create or modify test suites or test cases, feature files are regenerated automatically and you usually do not need to run a full sync unless other assets changed on disk.

## Dry Run

The bidirectional feature sync script supports a dry run:

```bash
npm run sync-features:dry-run
```

This reports which feature files and DB records would be created or updated without making changes.

## Conflict Resolution

- Locator sync can detect conflicts within a locator group:
  - Duplicate names
  - Duplicate values with different names
- Conflicts are stored in `ConflictResolution` and surfaced in the Locators UI for review.

For other entities, the sync scripts log errors and warnings but do not automatically resolve conflicts. The general rule is: fix the file or the DB, then re-run the appropriate sync.
