## Fix `/settings` Sync Badge False Positives

### Summary
Investigate the six failing badge types by tracing how `/settings` computes pending counts in [sync-pending-counts.ts](/Users/hasnat/Projects/appraise/src/lib/sync/sync-pending-counts.ts) versus how UI-created data is projected back into `automation/*` from [feature-file-generator.ts](/Users/hasnat/Projects/appraise/src/lib/feature-file-generator.ts) and the sync scripts, especially [sync-test-suites.ts](/Users/hasnat/Projects/appraise/scripts/sync-test-suites.ts) and [sync-test-cases.ts](/Users/hasnat/Projects/appraise/scripts/sync-test-cases.ts).

The fix should use the confirmed rule: `/settings` badges count only filesystem-to-database work. DB-only rows that the app already created should not produce badge counts. For filesystem-backed entities, generated files must round-trip through the parsers without producing false mismatches.

### Key Changes
- Add a short-lived investigation pass that reproduces each failing entity type and records the exact mismatch reason from `getSyncPendingCounts()` for:
  - `modules`
  - `tags`
  - `template step groups`
  - `template steps`
  - `test suites`
  - `test cases`
- Update pending-count matching to be one-way:
  - Count filesystem entities that are missing or outdated in DB.
  - Stop counting DB-only entities in the reverse pass for the affected helpers.
- Make DB matching resilient to duplicates:
  - Group DB rows by identity key and treat a filesystem entity as satisfied if any DB row matches the expected state.
  - Do not rely on `Map(...first row wins)` for tags, step groups, steps, suites, or cases.
- Introduce shared normalization helpers for projected feature identity:
  - A canonical “suite file key” derived from the generated filename format so UI-created suite names with spaces/case still match the feature file that was generated from them.
  - Use the same helper in pending counts and in `sync-test-suites` / `sync-test-cases` so counts and actual sync behavior stay aligned.
- Align test-case comparison with projected feature output:
  - Compare against the normalized feature-file representation that the app generates, not against raw DB step strings that are intentionally rewritten during feature generation.
  - This is required because generated scenarios and Gherkin keywords do not currently round-trip 1:1 from stored `gherkinStep` values.
- Validate template-step group and template-step round-tripping:
  - Ensure the generated step-group file and generated step definitions parse back to the same metadata the count logic expects.
  - Reuse the same function-definition normalization already used during step creation/update.
- Mirror the final fix into template copies under `templates/default` and `packages/create-appraisejs/templates/default` if those sources are still maintained in parallel.

### Interfaces / Helpers
- Add internal shared helpers for sync identity/normalization, for example:
  - `getTestSuiteFilesystemKey(name: string): string`
  - `findMatchingDbRecord(...)` for “any row matches” semantics
  - `normalizeProjectedTestCase(...)` or equivalent helper for comparing generated feature steps
- No user-facing API changes are required.

### Test Plan
- Add targeted tests around pending-count computation covering:
  - UI-created module with no feature/locator representation does not increment `sync-modules`.
  - UI-created standalone filter tag does not increment `sync-tags`.
  - UI-created template step group with placeholder file does not increment `sync-template-step-groups`.
  - UI-created template step with formatted function definition does not increment `sync-template-steps`.
  - UI-created test suite whose DB name differs from the slugged feature filename does not increment `sync-test-suites`.
  - UI-created test case regenerated into a feature file does not increment `sync-test-cases`.
  - Duplicate/stale DB rows do not cause a false positive when one matching row exists.
- Manual validation:
  1. Run the app in dev mode.
  2. Create one of each affected entity from the UI.
  3. Open `/settings`.
  4. Confirm those six badges are zero/hidden after refresh.
  5. Trigger the corresponding sync action and confirm it reports no work for already-projected entities.

### Assumptions
- `/settings` badge counts should reflect only filesystem-to-database work, not DB-orphan cleanup.
- The current app behavior of projecting DB changes into `automation/*` remains the source of truth for validating badge accuracy.
- If module and standalone-tag rows are intentionally DB-only concepts with no filesystem representation, the badge logic should ignore them rather than invent placeholder filesystem artifacts.
