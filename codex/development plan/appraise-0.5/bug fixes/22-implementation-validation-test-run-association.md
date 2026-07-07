# Rectify Implementation Validation Test-Run Association Gaps

## Summary

Make Appraise-managed `TestRun` evidence the default and enforceable implementation-validation path. Manual evidence
remains possible only as explicit reduced-assurance evidence and must not be indistinguishable from a passed Appraise
run.

## Key Changes

- Extend the implementation validation run contract in `src/lib/plan-contract/schemas.ts` and package parity copies to
  include `evidenceSource`, `assurance`, optional `testRunId`, browser/environment/tag binding metadata, and structured
  report/log evidence.
- Update `implementation_validation_start` to generate plan-bound run intents from each validation node's existing
  `matrix`, `gherkinPaths`, `stepPaths`, and executable metadata, returning exact `test_run` inputs plus the
  implementation validation run ID to bind.
- Extend `test_run` and the internal `test-runs` route so a run can be bound to
  `{ planId, validationId, implementationValidationRunId }`; when present, store `TestRun.planId`, `targetProjectId`,
  and update the matching implementation validation run with `testRunId`, report/log URLs, and `running` status.
- Change `implementation_validation_reconcile` so Appraise-owned runs are reconciled from the real `TestRun`
  row/result, not from agent-supplied passed/failed text. Required runtime validations only satisfy `validation_passed`
  when the latest fresh managed run passed, unless an explicit reduced-assurance override is recorded.
- Keep `implementation_validation_record` for exceptional/manual evidence, but require it to mark
  `evidenceSource: manual` and `assurance: reduced`; completion review must surface it as reduced assurance, not as
  ordinary managed evidence.
- Update completion review and plan UI to distinguish managed passed run, manual reduced-assurance evidence, missing
  run association, stale run, running run, failed run, and infrastructure failure.
- Preserve and surface structured runtime-preflight blocker details through MCP/API errors, including paths and
  recovery guidance.
- Make `baseline_regression_justify` idempotent: if persistence succeeds, return the persisted justification state
  instead of a generic coordinator failure.
- Tighten step metadata semantics so `reusedStepPaths` means registry/template reuse only; target-local or newly
  authored step files must be represented as new/custom paths with justification or as runtime projections with the
  correct source.

## API And Docs

- Update `docs/coordinator-api-mcp.md` and `docs/agent-lifecycle-flow.md` to document:
  `implementation_validation_start -> bound test_run -> implementation_validation_reconcile -> implementation_completion_review`.
- Update `packages/appraisejs/src/mcp.ts` capability guidance and `coordinator-client.ts` types for bound `test_run`
  inputs.
- No Prisma migration is planned unless implementation discovers a need beyond existing `TestRun.planId` and
  `targetProjectId`; the validation-run association can live in the plan validation artifact via `testRunId`.

## Test Plan

- Unit tests for `startImplementationValidation`: returns bound `test_run` inputs with validation ID, implementation
  run ID, target, browser, environment, tag expression, and runtime paths.
- Unit tests for bound `test_run`: creates a real `TestRun`, stores `planId`/target, and updates the implementation
  validation run association.
- Unit tests for `reconcileImplementationValidation`: passed managed run can satisfy readiness; missing, stale,
  running, failed, or manual-only evidence cannot silently satisfy required runtime validation.
- Completion review tests for managed, manual reduced-assurance, missing association, and stale evidence states.
- Regression tests for structured preflight error details, baseline regression justification idempotency, and step
  metadata classification.
- Focused validation commands: coordinator implementation tests, test-run service tests, MCP package tests,
  Prettier/ESLint on touched files, then `npm run build` because this changes shared lifecycle/MCP contracts.

## Assumptions

- The notepad session is the motivating example, but the fix belongs in AppraiseJS lifecycle, MCP, runtime, and UI
  contracts.
- Managed Appraise execution should be the normal path for required runtime validations.
- Manual evidence remains available for emergencies, but it is reduced assurance and must be visibly labeled or
  explicitly overridden.
