# Validation Execution Seamless Flow

## Summary

Fix the AppraiseJS plan-to-validation-to-implementation flow so approved validation artifacts are guaranteed
executable, custom steps are materialized into the runtime automatically, baseline failures caused by harness wiring
cannot be accepted as unrelated, and implementation completion has a clear MCP path.

Use the existing validation draft, projection, baseline, and implementation coordinator services as the foundation.
The main gap is not a missing lifecycle concept; it is that validation evidence, runtime files, Cucumber importability,
baseline classification, and implementation validation evidence are not yet tied together strongly enough at the
Appraise-owned gates.

## Public API And Contract Changes

- Extend `ValidationArtifact` and `ValidationDraft` schemas in `src/lib/plan-contract/schemas.ts` and
  `packages/appraisejs/src/plan-file.ts` with runtime execution metadata:
  - `runtimeProjections[]`: `{ role, declaredPath, targetPath, runtimePath, materialization, contentHash }`.
  - `runtimePreflight`: latest status plus structured blockers with `code`, `path`, optional `phrase`, `message`, and
    `recovery`.
  - Baseline classification enum value `validation_harness_failure`.
- Add MCP/API tool `validation_step_metadata_upsert` backed by
  `POST /plans/:planId/validations/draft/step-metadata`, accepting `reusedStepPaths`, `newStepPaths`, and
  `customStepJustifications`.
- Add MCP tools for the currently incomplete implementation flow:
  - `implementation_group_approve` for `approvedGroupIds` and runnable task unlocks.
  - `implementation_validation_record` for the existing plan-bound validation evidence route.
  - `implementation_validation_start` and `implementation_validation_reconcile` for Appraise-created, plan-bound
    implementation validation runs.
- Update `implementation_completion_review` so every blocker includes the exact next MCP action and required input
  shape.

## Implementation Changes

- Add a shared runtime materialization and preflight service near
  `src/services/coordinator/validation-runtime-projection-service.ts`.
  - Evidence root is `targetProject.canonicalPath ?? hubRoot`.
  - Runtime root is the hub root used by `cucumber.mjs` for plan-bound validation and baseline execution.
  - Generate declared feature files from `appraiseArtifacts`.
  - Copy existing target step files when a custom step source exists.
  - Reuse existing hub or registry step files when declared as reused.
  - Block custom step paths without explicit source/file plus justification.
  - Record `targetPath` and `runtimePath` for every `gherkinPaths`, `stepPaths`, executable path, and relevant
    manifest/file entry.
- Run runtime preflight before `validation_review_ready`, before `validations_approved`, and again before baseline
  starts.
  - Use Cucumber dry-run or step discovery against the plan tag and declared runtime feature paths.
  - Block on undefined steps, missing step files, failed imports, TypeScript compile errors, missing Cucumber config or
    runtime imports, and missing browser/world setup.
  - Surface the exact phrase, path, or compiler output in MCP responses and the validation review panel.
- Tighten baseline handling in coordinator baseline services.
  - Classify undefined steps, missing step files, failed imports, TypeScript compile errors, missing browser world, and
    missing Cucumber config as `validation_harness_failure`.
  - Never allow `baseline_failure_acknowledge` for harness failures.
  - When a harness failure appears during reconcile, move lifecycle back to `validation_changes_requested` with
    remediation guidance.
- Update validation review and baseline UI to show runtime projection rows, preflight status, and harness-failure
  guidance.
- Sync scaffold templates after root changes with:

```bash
npm --prefix packages/create-appraisejs run prepare-template
```

## Test Plan

- Unit tests for runtime materialization: generated feature, copied custom step, reused registry step, missing custom
  source, missing justification, and missing runtime projection.
- Unit tests for draft metadata mutation without legacy publish fallback.
- Unit tests for Cucumber preflight blockers: undefined step phrase, TypeScript compile error, failed import, and
  missing runtime step path.
- Unit tests for baseline classification and acknowledgement rejection for `validation_harness_failure`.
- Unit tests for implementation group approval, plan-bound validation recording/start/reconcile, and structured
  completion-review next actions.
- Integration tests covering publish to validation approval to baseline with generated custom steps; approval blocked by
  TypeScript compile failure; harness failure rerouting to `validation_changes_requested`; implementation validation
  evidence unlocking completion.
- Run focused Vitest suites, `npm --prefix packages/appraisejs run test`, template preparation, `npm run validate:unit`,
  and `npm run build` because this changes shared contracts, MCP package behavior, runtime execution, and scaffolded
  source.

## Assumptions

- Plan-bound validation and baseline execution remains hub-owned for now; runtime-root resolution must be centralized so
  this can change later without another contract rewrite.
- Target-project files remain review evidence, but they are insufficient unless Appraise also materializes executable
  runtime files.
- Appraise may generate feature files from validation artifacts, but custom step implementation code must come from an
  explicit source file/content or an existing reusable step.
- Legacy `validation_publish` stays available, but it must fail with the same blockers as the draft path.
