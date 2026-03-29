# Align run artifact download with run-scoped reports

## Summary
- Make the test run download endpoint treat `automation/reports/<runId>/` as the canonical artifact bundle for a run.
- The ZIP should include every file under that directory recursively, preserving relative paths inside the archive such as `cucumber.json`, `logs/run.log`, `traces/*.zip`, and `screenshots/*.png`.
- Keep the button and client flow unchanged; this is a server-side behavior change.
- Implement in the root app first, then sync the template copies so new scaffolds inherit the same behavior.

## Key Changes
- In the root download route, build the archive from the run folder recursively and only fall back to legacy DB-backed `logPath` and `tracePath` values when the run folder is missing or empty.
- Keep the archive root as the contents of `reports/<runId>`, not an extra enclosing `<runId>/` directory.
- If reproduction shows traces or screenshots are still being written outside the run folder, align the artifact writers to the same run-scoped base before relying on the ZIP endpoint; the download route should not special-case artifact types.
- After the root app change is finalized, run the existing template sync flow so the root route remains the source of truth and the bundled template copies stay identical.

## Public Interfaces
- No UI prop or button changes.
- No endpoint shape change: `GET /api/test-runs/[runId]/download` still returns a `.zip`, but its contents expand to all files under the run’s reports folder.

## Test Plan
- Manual regression: execute a run that produces `cucumber.json`, `logs/run.log`, at least one trace, and at least one screenshot under `automation/reports/<runId>/`; download artifacts and confirm the ZIP contains all of them with the expected relative paths.
- Backward-compatibility regression: validate an older run with no run folder but persisted `logPath` or `tracePath` still downloads a ZIP with those legacy files.
- Empty-run regression: validate a run with neither run-folder artifacts nor legacy paths still returns `404 No run artifacts available for this test run`.
- Template parity check: after syncing templates, confirm the generated template download route matches the root app behavior.

## Assumptions
- Root app code is the source of truth; template copies should be updated through the existing sync scripts rather than maintained separately.
- The desired ZIP shape is “contents of `reports/<runId>` at archive root”.
- In this checkout, the root download route already appears to recurse through the run folder, so implementation should begin by reproducing the bug and confirming whether the remaining gap is stale synced output or artifact generation outside the run folder.
