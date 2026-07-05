# Validation Artifact Runtime Projection

## Summary

Fix the lifecycle gap observed in plan `pln_01kwq0v80zezht8djgz3ypkdcq`, where Appraise successfully recovered MCP
diagnostics, registered the target workspace, created and revised a plan, accepted validation review, and verified
approval through Appraise events, but baseline execution could not start reliably.

The failure is not that agents omitted AppraiseJS-native validation data. The validation YAML already declares modules,
test suites, test cases, steps, locator groups, locators, executable files, and a browser/environment matrix. The gap is
that validation approval does not project those reviewed artifacts into the runtime database rows that
`startBaselineExecution` later queries.

## Experience Narrative

The successful flow proved several AppraiseJS lifecycle pieces worked as intended:

- MCP diagnostic recovery identified that the Appraise web app/transport needed to be running before coordinator tools
  were usable.
- Target registration bound the external workspace `/Users/jamil/Personal Projects/weather-guy` to the hub plan.
- Plan creation produced `pln_01kwq0v80zezht8djgz3ypkdcq`.
- The first review surfaced useful change requests about stack/version choices and user input expectations.
- The revised plan was approved through Appraise, not chat.
- Validation preparation produced `appraise/plans/validations/pln_01kwq0v80zezht8djgz3ypkdcq.validation.yaml`.
- Validation review standby and approval were observable through Appraise events.
- After approval, the workflow correctly attempted to advance toward baseline rather than implementation.

## Failure Record

- Initial coordinator transport failed until the Appraise web app/MCP endpoint was started.
- Validation artifacts declared target files that were not present in the target workspace at approval time:
  `automation/features/weather-current-location.feature` and `automation/steps/weather-current-location.steps.ts`.
- The first `baseline_start` failed when the `local` environment did not exist.
- After creating `local`, `baseline_start` failed with `One or more baseline test cases were not found.`
- The lifecycle ended in `validation_changes_requested` instead of progressing to baseline.

## Evidence

- Plan: `appraise/plans/pln_01kwq0v80zezht8djgz3ypkdcq.yaml`, currently at lifecycle
  `validation_changes_requested`.
- Review feedback: `appraise/plans/reviews/pln_01kwq0v80zezht8djgz3ypkdcq.review.yaml` records both the missing file
  materialization failure and the later missing baseline test case failure.
- Validation artifact:
  `appraise/plans/validations/pln_01kwq0v80zezht8djgz3ypkdcq.validation.yaml`.
- Declared target files:
  `automation/features/weather-current-location.feature`,
  `automation/steps/weather-current-location.steps.ts`.
- Declared Appraise artifacts:
  module `weather-app`, suite `weather-current-location-suite`, and test cases
  `weather-current-location-success`, `weather-location-denied`, and `weather-api-failure`.
- `src/services/coordinator/coordinator-validation-service.ts` persists validation YAML, updates plan lifecycle to
  `awaiting_validation_review`, syncs plan projection, and emits `validation_review_ready`; it does not materialize
  authored runtime records.
- `src/services/coordinator/coordinator-validation-service.ts` moves to `validations_approved` after review readiness
  passes; this is the right lifecycle boundary for projection.
- `src/services/coordinator/coordinator-baseline-service.ts` checks validation file hashes, then resolves
  `matrix[].environment` from `Environment.name` and `validation.testCaseIds` from `TestCase.id`.
- `src/services/coordinator/coordinator-baseline-service.ts` fails with `One or more baseline test cases were not found`
  when the validation IDs have not been projected.
- `src/lib/automation/projection-service.ts` currently projects existing DB state outward to automation files; it does
  not import validation artifact records into modules, suites, cases, locators, or environments.

## Root Cause

`validation_publish` persists reviewable validation YAML and review state, and `submitValidationReview` records
`validations_approved`. Neither step materializes `validations[].appraiseArtifacts` into runtime database records.

`startBaselineExecution` therefore receives a valid validation artifact but queries an empty or incomplete runtime
database. It can detect missing files and missing environments, but the missing Appraise-authored test cases appear only
as a late baseline error. This makes validation approval look successful while the next lifecycle step is structurally
unable to run.

## Rectification Plan

### 1. Add Appraise-Owned Runtime Projection

Add a service dedicated to projecting reviewed validation artifacts into runtime records. The implementation can live
near `src/lib/automation/projection-service.ts` or under coordinator services, but it should be invoked by Appraise
services, not by agents.

Responsibilities:

- Accept `planId`, the approved `ValidationArtifact`, and the bound target project metadata.
- Upsert `Module`, `LocatorGroup`, `Locator`, `TestSuite`, `TestCase`, `TestCaseStep`, and
  `TestCaseStepParameter` records from every `validations[].appraiseArtifacts` block.
- Preserve validation artifact IDs as runtime IDs when possible.
- Add deterministic identifier tags for suites and cases, using existing test-run expectations:
  `@ts_<artifact-id>` and `@tc_<artifact-id>` or an equivalent deterministic mapping.
- Resolve step `templateStepId` when supplied.
- Resolve `templateStepName` to an existing reusable template step when possible.
- For genuinely custom validation steps, create or resolve a stable validation template step only after the artifact has
  an approved custom-step justification.
- Connect each declared test case to at least one declared suite before baseline start.
- Run in a transaction and make the operation idempotent for repeated approval/retry flows.
- Treat collisions with unrelated existing records as structured projection conflicts rather than silently overwriting
  user-authored records.

### 2. Run Projection After Validation Approval

Call the projection service from `submitValidationReview` after validation readiness passes and before emitting
`validations_approved`.

Ordering:

1. Re-read the latest plan, review, and validation artifacts.
2. Recheck validation approval readiness.
3. Validate target files and environments, described below.
4. Project `appraiseArtifacts` into runtime DB records.
5. Re-read projected test cases and suite membership.
6. Persist `reviewSubmittedAt`, move lifecycle to `validations_approved`, sync plan projection, and emit
   `validations_approved`.

If projection fails, keep the lifecycle at `awaiting_validation_review` or move it to
`validation_changes_requested` with a structured event, depending on whether user action is required.

### 3. Make File Materialization a Validation-Publish Concern

`validation_publish` should not accept declared files that are absent from the target workspace.

Implement a target-root file materialization check:

- Resolve `validation.files[].path`, `gherkinPaths`, `stepPaths`, `manifestPaths`, and `executable.path` against the
  bound `TargetProject.canonicalPath` when present, falling back to hub root only for hub-scoped plans.
- Reject publish when a declared file is missing and no materialization payload exists.
- Compute `contentHash` from actual file contents when a file exists.
- If future `validation_publish` supports writing declared files, require explicit file contents and write them before
  review, then compute hashes from disk.
- Keep gitless/reduced-assurance snapshots, but reduced assurance must not skip real file/hash checks.

This moves missing-file failure from baseline time to the validation review boundary.

### 4. Add Environment Readiness Before Approval

Before `validations_approved`, validate every `validations[].matrix[].environment` against the runtime `Environment`
table.

Behavior:

- If an environment is missing, block validation approval with a structured `missing_environment` blocker.
- Return MCP/UI guidance that names the missing environments and offers the next Appraise action to create or confirm
  them.
- Optionally allow validation artifacts to declare intended environment defaults, but still require Appraise to create
  or confirm them before approval.

This prevents `baseline_start` from being the first place the operator learns that `local` does not exist.

### 5. Improve Baseline Preflight and Events

Add a baseline preflight helper used by `startBaselineExecution`, `acceptBaseline`, and `startImplementation`.

Structured blockers:

- `missing_environment`: one or more matrix environments are absent.
- `missing_validation_files`: declared files are missing or hash mismatched.
- `missing_projected_test_cases`: validation `testCaseIds` are not present in DB.
- `test_case_without_suite`: projected test cases exist but are not connected to a suite.
- `projection_conflict`: artifact IDs collide with unrelated runtime records.

MCP/API responses should include `blockerType`, affected IDs/paths, target project metadata, and a recommended next
action. Baseline errors should also append durable plan events so review loops can resume from the latest cursor.

### 6. Fix Stale Approval Handling in Review Loops

Update validation standby/read-loop behavior so later `validation_changes_requested` events supersede older
`validations_approved` events.

Rules:

- Event ordering is sequence-based.
- A loop must not report an old approval as actionable if a later blocking validation-feedback event exists.
- Pending/standby responses should carry the latest event cursor and recommended wait call.

### 7. Sync Scaffold Templates if Root Source Changes Affect Scaffolds

If this work touches root source copied into `packages/create-appraisejs/templates/base`, update root/base source first
and run:

```bash
npm --prefix packages/create-appraisejs run prepare-template
```

## Implementation Notes

- Do not write directly to SQLite from agents. Projection is an Appraise service concern.
- Prefer one transaction for projection so partial suites/cases do not leak into baseline.
- Idempotency should be keyed by plan ID plus artifact IDs or deterministic identifier tags.
- Existing DB-to-file projection should still generate feature/locator files from projected records after import, but
  should not replace the validation artifact as the review source of truth.
- The projection service should preserve user-authored data. If an existing record has the same ID/tag but is not owned
  by the validation projection, fail with `projection_conflict`.

## Test Plan

- Unit test validation artifact projection creates modules, locator groups, locators, test suites, test cases, steps,
  parameters, suite memberships, and identifier tags from declared `appraiseArtifacts`.
- Unit test projection idempotency across repeated validation approval attempts.
- Unit test collision handling for pre-existing unrelated module/suite/case/locator IDs.
- Coordinator validation service test: validation review approval projects artifacts, then emits
  `validations_approved`.
- Coordinator baseline service test: `baseline_start` succeeds after validation approval when files, environments, and
  projected artifacts exist.
- Baseline preflight tests for `missing_environment`, `missing_validation_files`, `missing_projected_test_cases`,
  `test_case_without_suite`, and `projection_conflict`.
- Validation publish tests proving missing declared files are rejected before review, and disk hashes replace or verify
  declared hashes.
- Gitless target test proving reduced-assurance snapshot support still requires file/hash checks.
- Validation review loop test proving a later `validation_changes_requested` event invalidates stale approval and
  standby resumes from the latest event cursor.
- MCP contract tests proving structured blockers and recovery guidance are surfaced for `validation_publish`,
  `validation_review_submit`, and `baseline_start`.

## Acceptance Criteria

- A validation artifact like `pln_01kwq0v80zezht8djgz3ypkdcq` can be approved and then baselined without manually
  creating Appraise DB rows.
- Missing target files are rejected during validation publish or approval, not discovered during baseline.
- Missing environments are surfaced before approval with a guided recovery path.
- Baseline start either creates test runs from projected suites/cases or returns structured blockers.
- Review standby never treats stale approvals as actionable after later changes-requested events.
- The lifecycle advances through `validations_approved` to `baseline_running` only after projection and readiness checks
  pass.
