# Test Run Runtime

This document helps agents navigate AppraiseJS test execution, logs, reports, and run artifacts.

## Mental Model

Test runs are created through app actions and services, executed locally through a Cucumber/Playwright adapter, and
stored back into database/report models after execution. Runtime artifacts live under `automation/reports/<runId>`.

## Key Locations

- Test run actions: `src/actions/test-run/test-run-actions.ts`
- Test run service: `src/services/test-run/test-run-service.ts`
- Evidence summary/finalizer: `src/services/test-run/run-evidence-summary-service.ts`
- Local execution adapter: `src/lib/executor/local-executor-adapter.ts`
- Process registry and cancellation: `src/lib/test-run/process-manager.ts`
- Log formatting and storage: `src/lib/test-run/log-formatter.ts`, `src/lib/test-run/winston-logger.ts`
- Report parsing: `src/lib/test-run/report-parser.ts`
- Report persistence: `src/services/report/report-service.ts`
- Runtime artifact paths: `src/lib/automation/automation-path-roots.ts`
- Logs API route: `src/app/api/test-runs/[runId]/logs/route.ts`
- Artifact download route: `src/app/api/test-runs/[runId]/download/route.ts`
- Cucumber runtime config: `cucumber.mjs`
- Cucumber runtime package: `packages/cucumber-runtime/src`

## Execution Flow

1. Actions validate user input and call the test run service.
2. The service resolves selected tags or suites into an executable tag expression and linked test cases.
3. `local-executor-adapter.ts` prepares the automation workspace, sets runtime environment variables, and spawns
   `npx cucumber-js`.
4. `process-manager.ts` tracks active processes for status, logs, and cancellation.
5. Cucumber writes JSON reports under `automation/reports/<runId>/cucumber.json`.
6. Logs are persisted and the raw process status is recorded as completed.
7. Report parsing and persistence update report records, metrics, and linked run test cases.
8. The evidence finalizer computes `TestRun.evidenceHealth` and derives the trusted `TestRun.result`. A zero exit code
   is not enough for trusted passing evidence.

## Evidence Health

`TestRun.evidenceHealth` is the durable trust verdict for managed evidence:

- `valid`
- `invalid_empty_run`
- `invalid_missing_test_cases`
- `invalid_missing_report`
- `invalid_placeholder_binary`
- `invalid_unmatched_scenarios`
- `invalid_stale_runtime`
- `infrastructure_failure`

`RunEvidenceSummary` is the bounded service result for UI, coordinator, and MCP callers. It includes stable ids
(`testRunPageId`, `executionRunId`, `planId`, optional `validationId`), evidence links (`reportUrl`, `logsUrl`),
counts, blockers, missing artifacts, log excerpts, `evidenceHealth`, and `nextAllowedAction`.

The stored logs API supports `mode=summary`, `mode=errorsOnly`, `mode=tail`, and `mode=aroundFailure` for bounded
agent recovery. Live `text/event-stream` requests still use SSE streaming.

Baseline and implementation validation gates must consume `evidenceHealth`. `TestRun.result === PASSED` is only
trusted when evidence health is `valid`; invalid or infrastructure evidence stays reduced assurance and blocks normal
lifecycle progression.

## Runtime Environment

The local executor sets these important environment variables for child Cucumber runs:

- `ENVIRONMENT`: selected AppraiseJS environment name.
- `HEADLESS`: browser headless mode.
- `BROWSER`: Playwright browser name.
- `REPORT_PATH`: run-specific report file path.
- `REPORT_FORMAT`: Cucumber JSON format pointing at `REPORT_PATH`.
- `TEST_RUN_ID`: current test run id.
- `APPRAISE_TARGET_ROOT`, `APPRAISE_PLAN_ID`, and `APPRAISE_VALIDATION_ID`: plan-bound execution context when provided
  by lifecycle tools.

## Validation

- For selection/filtering behavior, prefer focused tests around `src/services/test-run/test-run-service.ts` and
  `src/lib/test-run/matching.ts`.
- For report parsing changes, run `npx vitest run src/lib/test-run/report-parser.test.ts`.
- For evidence-health changes, run `npx vitest run src/services/test-run/run-evidence-summary-service.test.ts`.
- For artifact download changes, run the related route test under `src/app/api/test-runs/[runId]/download`.
- Use `npm run test` when Cucumber execution behavior or step runtime behavior changes.

## Never Do

- Do not fake report records by editing `automation/reports` output.
- Do not bypass `process-manager.ts` when adding run cancellation, log streaming, or active-process behavior.
- Do not change Cucumber paths or report formats without checking `cucumber.mjs`, `local-executor-adapter.ts`, and
  `packages/cucumber-runtime/src`.
