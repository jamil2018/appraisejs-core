# Runner and Reports

This document describes how test runs are executed and how reports are produced.

## Execution Flow

1. A test run is created in the UI (or via server actions).
2. The app creates a `TestRun` record and selects environment, tags, browser engine, and parallel workers.
3. The test runner spawns `npx cucumber-js` with tag and parallel options.
4. Environment variables are set for the process (`ENVIRONMENT`, `BROWSER`, `HEADLESS`, `REPORT_PATH`).
5. Cucumber executes feature files and step definitions from `src/tests`.
6. When the process exits, the report JSON is parsed and persisted as `Report`, `ReportFeature`, `ReportScenario`, and `ReportStep` records.

## Report Outputs

- Cucumber JSON report files
  - UI runs: `src/tests/reports/cucumber-<runId>-<timestamp>.json`
  - Default: `src/tests/reports/cucumber.json` (used when `REPORT_PATH` is not set)
- Logs: `src/tests/reports/logs/<runId>.log`
- Traces (failed scenarios only): `src/tests/reports/traces/<uuid>.zip`

Report ingestion is handled by `storeReportFromFile` which parses Cucumber JSON and creates the related database records.

## Metrics

Metrics are updated after report storage:

- Test case metrics (recent failure rate, flaky detection, consecutive failures)
- Test suite metrics (last executed time)
- Dashboard aggregates (failed recent runs, flaky tests, repeatedly failing tests)

Metrics are non-blocking; failures in metric calculation do not fail the test run.

## Log Retention

There is no automatic retention policy. Report files, logs, and traces remain on disk until you delete the test run or remove files manually. Deleting test runs via the UI removes the associated report and trace files.
