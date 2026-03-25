# Run Test Suites on Create Test Run

## Summary
Replace the `By Test Cases` path on the create-test-run page with `By Test Suites`, backed by a hierarchical suite picker and suite-scoped execution model.

The implementation should:
- let users browse suites and expand/collapse child test cases
- allow selecting an entire suite or a subset of test cases within a suite
- build cucumber tag expressions from suite identifier tags plus child test-case identifier tags when needed
- track duplicate executions separately when the same test case is selected under multiple suites
- guarantee every test suite has an auto-managed unique identifier tag, similar to test cases

## Key Changes

### 1. Form and picker contract
- Replace the test-run form radio option `By Test Cases` with `By Test Suites`; keep `By Tags` unchanged.
- Change the form payload from `testCases: { testCaseId }[]` to:
  - `testSuites: { testSuiteId: string; runAll: boolean; testCaseIds: string[] }[]`
- Validation rules:
  - `By Tags`: unchanged, at least one filter tag.
  - `By Test Suites`: at least one suite selection.
  - `runAll=false` requires at least one child `testCaseId`.
  - if all children in a suite are selected manually, normalize to `runAll=true` on save.
- Add a dedicated suite-picker row type for the create page:
  - suite fields
  - suite module
  - suite filter tags
  - child test cases with their filter tags and step counts
  - internal identifier tags available in data but hidden from the UI

### 2. Create-test-run UI
- In [src/app/(base)/test-runs/test-run-form.tsx](/Users/hasnat/Projects/appraise/src/app/(base)/test-runs/test-run-form.tsx), replace the current flat `TestCasePicker` with a hierarchical browse dialog for suites.
- Picker behavior:
  - show all suites, default collapsed
  - allow expanding/collapsing each suite to see child test cases
  - suite checkbox selects/deselects all children
  - child checkboxes drive an indeterminate suite state
  - save/cancel semantics should match the existing picker: edits are draft-only until Save
  - empty suites stay visible but their checkbox is disabled
- Search should match suite name, module name, suite tags, test-case title, and test-case tags.
- The saved summary below the field should show suite-scoped selections, for example:
  - full suite selected
  - subset count selected
  - selected child names under each suite

### 3. Execution model and tag-expression generation
- Stop treating suite-based runs as a flat list of identifier tags.
- Build a raw cucumber tag expression in [src/actions/test-run/test-run-actions.ts](/Users/hasnat/Projects/appraise/src/actions/test-run/test-run-actions.ts):
  - full suite: `(@ts_xxx)`
  - subset within one suite: `(@ts_xxx) and ((@tc_a) or (@tc_b))`
  - multiple suites: OR the suite clauses together
- Examples:
  - two full suites: `(@ts_a) or (@ts_b)`
  - one full suite plus one subset: `(@ts_a) or ((@ts_b) and ((@tc_1) or (@tc_2)))`
- If all children under a suite are selected, whether by suite checkbox or manually, use only the suite tag for that suite.
- Change the executor contract so `TestRunExecutionRequest` accepts a final `tagExpression` string instead of deriving it from `tags[]`.
- Keep `By Tags` behavior by building its OR expression in the action layer and passing the same `tagExpression` field into the executor.

### 4. Run tracking, live updates, and report matching
- Add optional `testSuiteId` to `TestRunTestCase` in [prisma/schema.prisma](/Users/hasnat/Projects/appraise/prisma/schema.prisma) so the same `testCaseId` can appear multiple times in one run with different suite context.
- For suite-based runs, create one `TestRunTestCase` row per selected suite/test-case combination:
  - full suite selection expands to all current test cases in that suite
  - subset selection expands only to the selected children
- For tag-based runs, keep `testSuiteId=null`.
- Update run-detail queries and UI to include suite context so duplicate executions are distinguishable.
- Enrich the runtime `scenario::end` event in [packages/cucumber-runtime/src/hooks.ts](/Users/hasnat/Projects/appraise/packages/cucumber-runtime/src/hooks.ts) with enough context to resolve duplicates:
  - feature name
  - scenario tags / identifier tags
- Update live status matching and stored report matching to resolve against:
  - suite identifier tag first
  - then test-case identifier tag
  - then title-only fallback for legacy/tag runs
- Matching must consume one `TestRunTestCase` row per executed scenario so two identical test cases under two suites do not collapse onto the same row.
- Update suite metrics logic to use the matched `testSuiteId` when present; only fall back to “all suites containing this test case” for legacy runs.

### 5. Suite identifier tags and data integrity
- Introduce `generateUniqueTestSuiteIdentifier()` using the pattern `ts_<hex>`, parallel to existing `tc_<hex>`.
- On test-suite create:
  - auto-create and attach one `IDENTIFIER` tag for the suite
  - also connect selected filter tags
- On test-suite update:
  - preserve the existing suite identifier tag
  - only replace filter tags from the form
- On test-suite delete:
  - delete the suite identifier tag if it is no longer referenced
- Backfill existing suites with missing identifier tags before enabling the new run mode.
- Keep suite identifier tags internal:
  - exclude them from suite tag form defaults
  - exclude them from suite tag displays and “most common tag” calculations
  - keep `getAllTagsAction()` filter-only behavior unchanged
- Update sync/classification code so both `tc_` and `ts_` prefixes are treated as `IDENTIFIER` tags; this applies to tag sync, pending counts, and DB sync helpers.

## Public Interfaces / Types
- `testRunSchema`
  - remove `testCases`
  - add `testSuites: { testSuiteId; runAll; testCaseIds[] }[]`
- `TestRunExecutionRequest`
  - replace `tags: Tag[]` with `tagExpression: string | null`
- `TestRunTestCase`
  - add nullable `testSuiteId` relation
- Runtime event payload
  - extend `scenario::end` data with suite-disambiguation context
- Add a new suite-picker data type for the create page; child and suite identifier tags are included for logic, but not rendered as normal tags

## Test Plan
- Create run by tags still works and produces the same cucumber behavior as before.
- Full suite selection runs with only the suite identifier tag.
- Manual selection of every child in a suite normalizes to suite-level execution.
- Mixed selection across suites builds the expected OR-of-suite-clauses expression.
- The same test case selected under two suites creates two suite-scoped run entries and both receive separate live status/report linkage.
- Existing suites without identifier tags are backfilled and can be executed immediately.
- Updating a suite does not drop its identifier tag.
- Suite list pages and suite metrics pages do not show internal `ts_*` tags as user-facing tags.
- Suite metrics update only the suite actually executed when a shared test case is run as a subset under one suite.

## Assumptions
- `By Test Cases` is fully replaced by `By Test Suites`; it is not kept as a third option.
- Suite identifier tags are internal `IDENTIFIER` tags and use `ts_<hex>`.
- Empty suites remain browseable but cannot be selected for execution.
- Implementation scope includes `src`, `prisma`, `scripts`, and `packages/cucumber-runtime`; template/package mirrors are out of scope for this change unless your release process requires a separate sync step.
