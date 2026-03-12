# Failed-Step Screenshots and Per-Run Report Artifact Folders

## Summary
- Save this plan at `/Users/hasnat/Projects/appraise/development plan/report_artifact_enhancements/PLAN.md`.
- Move every test run’s report artifacts under a dedicated folder: `automation/reports/<runId>/`.
- Capture a PNG when a scenario step fails, store it under that run folder, and persist the screenshot path on the matching `ReportStep`.
- Show the screenshot in the report modal as an inline thumbnail placed after the error trace, with an expand action that opens a larger in-app dialog.
- Do not backfill old reports; they continue to render without screenshots.

## Key Changes
- Standardize artifact layout per run:
  - `automation/reports/<runId>/cucumber.json`
  - `automation/reports/<runId>/logs/run.log`
  - `automation/reports/<runId>/traces/<uuid>.zip`
  - `automation/reports/<runId>/screenshots/<uuid>.png`
- Update report/log/trace path helpers and run setup so new runs create and use the per-run folder, and cleanup deletes the whole run folder instead of unlinking individual artifacts.
- Keep backward compatibility in readers by resolving both relative and absolute stored paths, but have all new writes store project-relative paths under `automation/reports/<runId>/...`.
- Extend the runtime `AfterStep` hook to:
  - capture a screenshot only when a non-hook scenario step fails,
  - write the PNG to the run’s `screenshots/` folder,
  - attach screenshot metadata to the failed step via a custom Cucumber attachment payload embedded in the JSON report.
- Extend report parsing/storage so `ReportStep` gains nullable `screenshotPath`, sourced from the step attachment metadata during `storeReportFromFile`.
- Add a report screenshot endpoint for the UI:
  - `GET /api/reports/steps/[stepId]/screenshot`
  - validate the step exists, validate the file exists, then stream the PNG.
- Update the report modal so failed steps render:
  - error message,
  - error trace,
  - screenshot thumbnail,
  - expand button opening a larger dialog/lightbox view.
- Update artifact download behavior to include screenshots from the run folder along with the existing run artifacts.
- Update template/bootstrap flows so `automation/reports/` starts empty and new scaffold/template prep logic expects per-run subfolders rather than pre-created top-level `logs/` and `traces/` folders.

## Public Interfaces / Data Changes
- Prisma:
  - add `ReportStep.screenshotPath String?`
- Parser types:
  - include step `embeddings` support so screenshot metadata can be decoded from Cucumber JSON
- API:
  - add `GET /api/reports/steps/[stepId]/screenshot`
- Runtime artifact helpers:
  - add run-scoped report path helpers, including screenshots

## Test Plan
- Parser test: a failed step with the custom screenshot attachment produces `screenshotPath`; passed/skipped steps do not.
- Path/helper test: run artifact paths resolve to `automation/reports/<runId>/...` and support legacy absolute-path reads.
- Cleanup test: deleting a test run removes its entire `automation/reports/<runId>/` folder.
- Download test: the generated zip includes screenshots from the run folder.
- UI test: failed-step modal shows no screenshot section when `screenshotPath` is null, and shows thumbnail + expand control when present.
- Manual acceptance:
  - execute a failing run,
  - confirm screenshot file exists under `automation/reports/<runId>/screenshots/`,
  - confirm the report page shows the thumbnail after the stack trace,
  - confirm expand view loads the same image.

## Assumptions
- Per-run folder name is the test run `runId`.
- Screenshot capture applies to failed scenario steps only, not `Before`/`After` hook failures.
- Expanded screenshot view stays inside the app as a dialog, not a new tab/window.
- Existing reports are left untouched and simply render without screenshots.
