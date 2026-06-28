# Global Appraise Hub With Repo-Owned Tests

## Summary

Make AppraiseJS a once-installed local hub that can attach existing application repos as target projects. Appraise owns
planning, review, validation, orchestration history, and UI state in the hub. The user repo owns generated executable
tests, so those tests can be committed and run locally or in CI without the Appraise hub running.

## Key Changes

- Add a first-class `TargetProject` model with canonical path, display name, package metadata, fingerprint, and
  timestamps.
- Link `PlanProjection` and `TestRun` to `TargetProject`; keep `TestRun.planId` optional.
- Store Appraise-native artifacts under the hub, scoped by target project: plans, reviews, validations, lifecycle
  events, and orchestration metadata.
- Generate or update repo-owned test artifacts in the attached target repo: `automation/**`, Cucumber/Playwright
  config, runtime imports, package scripts, and CI-ready documentation.
- Ensure generated tests run with normal repo commands, without requiring the Appraise hub process.
- Add CLI commands:
  - `appraisejs project add <path>` registers a repo without writing to it.
  - `appraisejs project list` shows attached repos.
  - `appraisejs plan create --target <project> --file <plan-file>` creates a plan for a target repo.
  - `appraisejs test run --target <project> ...` runs existing repo-owned tests without requiring a plan.
- Update MCP/API diagnostics to report both hub identity and selected/available target project context.

## User Workflows

- **Planning workflow:** attach repo, create a plan, review/approve in Appraise, then generate validation/test artifacts
  into the target repo when approved.
- **Test-only workflow:** attach repo with existing Appraise-compatible automation artifacts, run tests from Appraise,
  and view logs/reports/history in the hub.
- **Independent execution workflow:** run generated tests directly in the repo with commands like `npm run test:e2e`
  locally or in CI.

## Test Plan

- Unit tests for target project registration, duplicate attach, invalid paths, and no attach-time writes.
- Service tests for hub-stored plan artifacts linked to target projects.
- Executor tests proving test runs execute with the target repo as cwd and write reports/traces under that repo.
- Tests proving standalone `TestRun` records can exist with `planId: null`.
- CLI/MCP tests for attach, plan creation, standalone test run, and diagnostics.
- UI tests for target-project filtering and labeling across plans and test runs.

## Assumptions

- First test-only slice runs existing Appraise-compatible Cucumber/Playwright artifacts.
- Attach is read-only; repo writes happen only when generating or running test artifacts.
- Plans are optional for test orchestration.
- Arbitrary commands like `npm test` are future work unless explicitly added to scope.
