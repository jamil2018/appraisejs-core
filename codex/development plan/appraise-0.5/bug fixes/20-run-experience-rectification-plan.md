# Run Experience Rectification Plan

## Summary

Fix the AppraiseJS run experience issues observed during the `simple-todo-10` collaboration flow.

AppraiseJS successfully enforced plan and validation review gates, but the workflow became blocked before
implementation because baseline execution was not isolated from unrelated Appraise hub automation. After validation
approval, both the agent and UI could act on the same post-review lifecycle surfaces, which made ownership, cursors,
and recovery ambiguous.

This plan keeps strict Appraise-owned lifecycle gates. The rectification is better execution isolation, draft/publish
preflight parity, explicit phase ownership, durable log access, and concise MCP recovery guidance.

## Current Problem

- Initial generated plans can omit essential implementation choices, such as the tech stack for an empty frontend
  target workspace.
- `validation_draft_check` can report a draft as ready even though `validation_draft_publish` later fails on runtime
  blockers.
- Runtime preflight failures can be returned as a generic `Validation runtime preflight failed` message even when the
  backend has structured blocker details.
- Step reuse is path-shaped, so reused registry/template steps can appear to require target-local step files.
- Validation runtime materialization currently writes generated validation artifacts into both the target root and the
  Appraise hub root, which makes shared `automation/` state surprising.
- Baseline execution goes through ordinary hub test-run execution, where `cucumber.mjs` imports
  `automation/features/**/*.feature` and `automation/steps/**/*.ts`. That lets unrelated hub automation contaminate a
  plan-bound baseline.
- Baseline failure classification treats harness/import/setup failures as validation harness failures, but there is no
  controlled path to acknowledge or reclassify a harness-looking failure when the source is outside the declared
  validation runtime.
- Completed run logs are stored in `TestRunLog`, but the logs API route is streaming-first and rejects completed runs
  instead of returning persisted logs directly.
- Validation approval, baseline start/reconcile, baseline acceptance, and implementation start are exposed from both
  MCP and UI surfaces, so the lifecycle has no phase-scoped single writer after review approval.
- MCP lifecycle responses often include full plan and validation payloads when the agent mainly needs lifecycle,
  blockers, cursor, links, and next action.

## Source Evidence

- `cucumber.mjs` imports all hub `automation/features/**/*.feature` and `automation/steps/**/*.ts`.
- `src/lib/executor/local-executor-adapter.ts` supports `projectRoot`, but baseline submission currently uses the
  ordinary Appraise test-run path through `createTestRunFromValidatedValue`.
- `src/services/coordinator/coordinator-baseline-service.ts` starts baseline runs by creating Appraise test runs,
  records `/api/test-runs/:runId/logs` as evidence, and classifies harness failures during reconcile.
- `src/services/coordinator/coordinator-validation-draft-service.ts` runs a lighter `checkDraft` path than publish-time
  runtime materialization/preflight.
- `src/services/coordinator/validation-runtime-projection-service.ts` owns runtime materialization, projections,
  preflight blockers, projected test cases, and environment readiness checks.
- `src/services/shared/errors.ts` drops `ServiceError.details` from server action responses, while the coordinator HTTP
  contract preserves those details.
- `src/app/api/test-runs/[runId]/logs/route.ts` rejects completed or cancelled runs through an SSE error event instead
  of returning stored logs.
- `src/app/(base)/plans/[planId]/plan-review-workspace.tsx` exposes post-validation actions from the UI:
  start/reconcile/cancel baseline, accept baseline, and unlock implementation.
- `prisma/schema.prisma` has a single `PlanCoordinatorLease` per plan, but no phase-scoped writer/ownership model.

## Public API And Contract Changes

- Add plan-bound runtime execution metadata to test-run execution:
  - `featurePaths`
  - `importPaths`
  - optional `supportPaths`
  - runtime `cwd`
  - plan/target identifiers for evidence and cleanup
- Add phase-scoped lifecycle ownership, preferably with a small `PlanPhaseLease` model rather than overloading the
  existing single `PlanCoordinatorLease`.
- Add optional `phase` metadata to plan events and phase-aware cursors in MCP loop responses.
- Extend validation draft/artifact contracts with canonical reusable step references, while preserving legacy
  `reusedStepPaths` compatibility.
- Extend `ActionResponse` with optional structured `details` so UI blockers can render exact paths, IDs, and recovery
  guidance.
- Add a completed-run log retrieval mode for `GET /api/test-runs/:runId/logs`, keeping SSE behavior for active runs.
- Add `includeDetails?: boolean` to MCP lifecycle tools so concise responses are the default and full artifacts remain
  opt-in.

## Implementation Changes

### 1. Isolate Plan-Bound Baseline Execution

Replace baseline execution's ordinary hub test-run path with a plan-bound baseline runner.

- Create one isolated runtime workspace per baseline attempt or `testRunId`.
- Generate an exact Cucumber config for only the approved validation feature paths and import paths.
- Include shared runtime support files explicitly, rather than globbing the hub `automation/` tree.
- Execute from the isolated runtime workspace or the target root, not the mutable Appraise hub automation namespace.
- Record `planId`, `targetProjectId`, runtime paths, report path, and log path on the test run.
- Keep ordinary manual Appraise test runs on the existing `cucumber.mjs` behavior unless explicitly migrated.

Acceptance behavior:

- A `simple-todo` baseline must never compile an unrelated hub file such as
  `automation/steps/weather-current-location.step.ts`.
- Calling `baseline_start` twice while baselines are already running returns the active attempts and next action instead
  of a generic not-ready conflict.

### 2. Make Runtime Materialization Target-First And Ephemeral

Stop treating the Appraise hub `automation/` tree as the shared execution staging area for target validation evidence.

- Keep reviewed validation files in the target workspace when a `TargetProject` is bound.
- Generate Gherkin from `appraiseArtifacts` for review and execution, but stage execution files in an ephemeral
  plan/run workspace.
- Copy declared custom step files only from approved target evidence or explicit validation draft content.
- Resolve registry/template step references from Appraise resources, not from target-local paths.
- Persist runtime projection metadata so review and baseline evidence can explain what was generated, copied, reused,
  or declared.

### 3. Align Draft Check With Publish-Time Preflight

Make `validation_draft_check` call the same validation/preflight path that `validation_draft_publish` will enforce.

Checks must include:

- missing validation nodes
- missing or stale physical files
- missing environments
- custom step paths without justifications
- unresolved registry/template step references
- missing runtime step paths
- generated feature/importability problems
- TypeScript or Cucumber config/import failures
- projection conflicts or missing projected test-case readiness where applicable

`validation_draft_publish` must never fail for a blocker that `validation_draft_check` did not already report, unless
the filesystem or database changed after the check. In that case the publish response must identify the drift.

### 4. Separate Reused Step Refs From Runtime Step Files

Keep registry-first authoring, but avoid path-shaped reuse semantics for reusable Appraise steps.

- Add `reusedTemplateStepRefs` or equivalent canonical refs to the draft/artifact contract.
- Preserve `reusedStepPaths` as legacy compatibility input and normalize it into canonical refs when possible.
- Treat `stepPaths` as runtime import files only when the validation truly needs custom executable code.
- Require `newStepPaths` plus `customStepJustifications` only for new target/custom step files.
- Update MCP workflow guidance and validation review copy to distinguish reusable Appraise steps from target-local step
  implementation files.

### 5. Add Phase-Scoped Lifecycle Ownership

Keep user review authority, but make post-approval mechanics single-writer.

Ownership rules:

- UI/user owns review decisions: plan approve/request changes/cancel, validation evidence decisions, final sign-off.
- Coordinator/agent owns mechanical transitions after approval when a lease is active: baseline start/reconcile,
  implementation start, implementation checkpoints, and validation evidence recording.
- UI may take over an agent-owned phase only through an explicit takeover action that records the actor, phase, and
  reason.

Implementation:

- Add `PlanPhaseLease` keyed by plan and phase, for example `plan_review`, `validation_review`, `baseline`,
  `implementation`, and `completion`.
- Guard lifecycle-mutating service calls or coordinator API routes with phase ownership metadata.
- Disable or replace UI write buttons during coordinator-owned phases with clear read-only status and takeover affordance.
- MCP tools should return ownership blockers with exact recovery instructions when another surface owns the phase.

### 6. Make Events And Cursors Phase-Aware

Reduce stale/current event ambiguity.

- Tag lifecycle events with phase metadata.
- Let event reads and loop tools request a phase.
- Return `activeEvent`, `historyEvents`, `currentAfterSequence`, and `nextAfterSequence` separately.
- Ensure a later phase event such as `validation_changes_requested` supersedes older `validations_approved` when
  deciding the current validation state.
- Keep global event ordering by sequence, but make the active gate state explicit in MCP responses.

### 7. Improve Baseline Failure Recovery

Keep `validation_harness_failure` strict by default, but add a controlled evidence-bound recovery for contamination or
outside-scope harness failures.

- Continue routing true harness failures back to `validation_changes_requested`.
- Allow reclassification or acknowledgement only when evidence proves the failure source is outside the declared
  plan-bound runtime surface.
- Bind acknowledgement/reclassification to attempt ID, signature hash, actor, source classification, and rationale.
- Add UI and MCP guidance that distinguishes:
  - declared validation harness failure
  - outside-scope hub/runtime contamination
  - pre-existing unrelated product failure
  - expected behavioral failure

### 8. Return Stored Logs For Completed Runs

Keep the existing SSE path for active runs, but add durable retrieval for completed evidence.

- If the request accepts `text/event-stream` and the run is active, stream as today.
- If the run is completed/cancelled or the request asks for JSON/text, read `TestRunLog` through
  `getTestRunLogsService`.
- Return structured JSON logs by default, with a plain-text mode if useful for direct browser viewing.
- Update baseline evidence links so completed run logs are directly accessible without needing a live process.

### 9. Make MCP Responses Concise By Default

Default lifecycle tool responses should include:

- `planId`
- `phase`
- `lifecycle`
- relevant links
- active blockers
- attempt summaries
- `currentAfterSequence`
- `nextAfterSequence`
- `nextAllowedAction`
- `nextRequiredAgentBehavior`
- `nextRecommendedAction`

Full plan/validation artifacts should be omitted unless `includeDetails: true` is passed. Error responses must surface
structured `details` prominently instead of burying blockers inside serialized payloads.

### 10. Improve Empty-Target Planning Defaults

When the target workspace is empty and the brief requests a web/frontend app without naming a stack, make stack
assumptions explicit in the first review-ready plan.

Default for this appraise-0.5 flow:

- React 19
- TypeScript
- Vite
- local browser validation
- explicit persistence behavior if the brief implies saved state

The plan should state that these are chosen defaults and remain reviewable through Appraise feedback.

## Test Plan

- Add `src/lib/executor/local-executor-adapter.test.ts` coverage for exact feature/import path execution and generated
  per-run Cucumber config.
- Add coordinator baseline tests proving unrelated hub automation is not imported during target-bound baseline
  execution.
- Add baseline tests for idempotent `baseline_start`, structured ownership blockers, and evidence-bound reclassification.
- Add validation draft tests proving `validation_draft_check` and `validation_draft_publish` report the same blockers for
  missing files, stale hashes, missing environments, unresolved steps, and import/compile failures.
- Add validation contract tests for canonical reusable step refs and legacy `reusedStepPaths` normalization.
- Add plan-review workspace tests proving post-approval UI actions are read-only during coordinator-owned phases and
  require explicit takeover.
- Add coordinator event/MCP tests for phase-scoped cursors, concise response mode, and structured error details.
- Add logs route tests for active SSE streaming and completed JSON stored-log retrieval.
- Add MCP planning tests proving empty frontend targets get explicit stack assumptions in the first plan.

Focused validation:

```bash
npx vitest run src/services/coordinator/coordinator-baseline-service.test.ts
npx vitest run src/services/coordinator/coordinator-validation-service.test.ts
npx vitest run src/services/coordinator/coordinator-validation-draft-service.test.ts
npx vitest run src/lib/executor/local-executor-adapter.test.ts
npx vitest run src/app/api/test-runs/[runId]/logs
npm --prefix packages/appraisejs run test
```

Broad validation:

```bash
npm --prefix packages/create-appraisejs run prepare-template
npm run graphify:auto
npm run build
```

Run `npm run validate` if the implementation touches broad runtime behavior, UI review flow, or scaffold-copied source.

## Assumptions

- Appraise should keep strict lifecycle gates; do not replace Appraise approval with chat approval.
- UI should remain readable during agent-owned phases, but write actions must be explicit overrides.
- Greenfield expected-fail baselines are valid when they prove the harness works before product implementation.
- Target-specific validation artifacts belong to the target repo; Appraise runtime bundles are generated execution
  staging artifacts.
- Reusable Appraise steps belong to the registry/hub resource model and should not leak unrelated project automation
  into target execution.
