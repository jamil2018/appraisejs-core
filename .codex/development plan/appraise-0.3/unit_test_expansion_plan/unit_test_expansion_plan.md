# Core Runtime Test Expansion Plan

## Summary
Expand the test suite from “service helper coverage” to “core runtime coverage” by adding tests for the execution/reporting/sync paths and selected Node API routes, while broadening a small set of essential CRUD service tests. Keep the current mocked-unit style as the default, widen Vitest discovery so new route and selected action tests run by default, and do not introduce a full database integration harness in this pass.

## Implementation Changes
- Update the root Vitest config to include:
  - `src/app/api/**/*.test.ts`
  - `src/actions/**/*.test.ts` for selected high-risk actions only
  - keep existing `src/services/**/*.test.ts` and `scripts/lib/**/*.test.ts`
- Add high-value tests for the `test-run` service covering:
  - successful run creation with environment lookup, suite/tag resolution, executor invocation, logger setup, persisted `testRun`/`testRunTestCase` records, and returned ids
  - validation failures for missing environment, empty selection, missing suite identifier tag, missing suite ids, and duplicate run name
  - status update flow for matched scenario, unmatched scenario, and missing run
  - log storage and retrieval formatting
  - cancellation outcomes for missing run, already finished run, running run, and process-not-found cases
  - trace-viewer status and spawn outcomes
- Add real behavioral tests for the `report` service covering:
  - `storeReportFromFileService` happy path with a fixture cucumber report
  - missing report file and missing test run
  - scenario-to-test-run-test-case matching
  - persisted feature/scenario/step/hook/report-test-case creation calls
  - test-suite metrics update path after successful storage
  - `getReportByIdOrThrow` and `getReportByTestRunIdOrThrow` not-found branches
- Add tests for sync orchestration:
  - `runRequestedSync` success across ordered script execution
  - first failing script stops the chain and reports `failedScriptId`, `exitCode`, and parsed `cause`
  - thrown process error path
  - `runSyncAction` invalid id and happy path
- Add route tests for the runtime-critical Node handlers:
  - test-run download route: run-not-found, no artifacts, run-folder artifacts present, legacy log/report/trace fallback, duplicate-path avoidance
  - trace route: GET missing run/test case, POST missing trace path, trace file missing, successful spawn
  - screenshot route: missing step, missing screenshot path, missing file, successful stream response
- Add selected action tests only where the action adds meaningful behavior beyond “call service and map error”:
  - `settings/sync-actions`
  - `locator-picker-actions` revalidation and error-recovery path
  - skip thin CRUD wrappers that only parse Zod, call one service, and map `ServiceError`
- Broaden existing shallow service tests in the domains the app depends on for authoring/setup:
  - `environment`: list/delete/update plus projection-sync side effects and payload normalization
  - `module`: create/update/delete plus path-dependent artifact regeneration
  - `test-case` and `test-suite`: create/update paths and feature projection side effects
  - `locator-group` and `locator`: file-content/sync/regeneration paths that are part of authoring workflow
- Keep existing low-signal tests until richer replacements land. After replacement, delete only exact duplicates that add no unique branch coverage.

## Test Cases And Scenarios
- Runtime execution:
  - creating a run from suite selection
  - creating a run from tag selection
  - rejecting invalid selections or missing environment
  - updating scenario status for match, no match, and missing run
  - cancelling active vs completed runs
- Reporting:
  - ingesting a valid cucumber report fixture
  - handling missing file, bad linkage, and storage failure
  - updating suite metrics only after executed suites are identified
- Artifact serving:
  - returning 404 when entities or files are missing
  - returning streaming/binary responses with correct status and headers
  - avoiding duplicate files in downloads
- Sync:
  - ordered execution for compound sync requests
  - short-circuiting on first failure
  - preserving a useful failure message from stderr/stdout/error objects
- Authoring CRUD side effects:
  - environment/module/test-case/test-suite changes trigger the expected projection or regeneration helpers

## Public APIs / Interfaces / Types
- No product-facing API changes.
- Test-only changes:
  - widen Vitest discovery patterns in the root config
  - add shared test fixtures/helpers for mocked Prisma results, filesystem access, and route params where that reduces duplication

## Assumptions And Defaults
- Coverage level is `Balanced`: prioritize execution, reporting, sync, routes, and essential authoring services; do not try to exhaustively test every thin CRUD action.
- Harness change is allowed: Vitest should discover route tests and selected action tests by default.
- This pass stays in mocked/unit-style Vitest tests; it does not add a temporary SQLite or migration-backed integration environment.
- Existing passing tests stay unless directly superseded by broader tests in the same file/domain.
- Fixture-based report tests should use stable local JSON fixtures checked into the repo rather than generating reports at test time.
