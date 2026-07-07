# AppraiseJS Agent Robustness And Evidence Integrity Tightening Plan

## Summary

Create a roll-up hardening track that turns the Invatore integration findings plus the existing 19-22 bug-fix family
into one implementation effort. The goal is to make AppraiseJS harder to misuse, make "passed" evidence trustworthy,
and make the MCP path efficient enough that agents do not need to inspect source, SQLite rows, or huge logs to recover.

This plan supersedes the remaining robustness gaps in plans 19-22 while preserving their already-landed fixes. MCP
remains the canonical general-release agent path; provider-native runs remain experimental and must consume the same
evidence-health and lifecycle contracts when enabled.

## Public Contract Changes

- Add durable `TestRun.evidenceHealth` with values:
  - `valid`
  - `invalid_empty_run`
  - `invalid_missing_test_cases`
  - `invalid_missing_report`
  - `invalid_placeholder_binary`
  - `invalid_unmatched_scenarios`
  - `invalid_stale_runtime`
  - `infrastructure_failure`
- Add a shared `RunEvidenceSummary` service result used by baseline, implementation validation, completion review, UI,
  and MCP responses. A run is valid only after process exit, report parse, expected case matching, logs, and artifact
  links are reconciled.
- Add MCP tools:
  - `test_run_preflight`: read-only blocker check before run creation.
  - `test_run_diagnose`: concise root cause, health grade, log excerpt, missing artifacts, and next action.
  - `test_run_read`: bounded run status/evidence summary for agents.
- Extend `test_run` with a preferred plan-bound shape: `planId`, `validationId`, optional matrix selector, optional
  `implementationValidationRunId`, and `responseMode`.
- Standardize response IDs everywhere: `testRunPageId`, `executionRunId`, `planId`, `validationId`, `reportUrl`,
  `logsUrl`, `evidenceHealth`, and `nextAllowedAction`.
- Add `responseMode: "summary" | "evidenceOnly" | "blockersOnly" | "linksOnly" | "full"` to large MCP lifecycle and
  run tools.
- Add phase-aware ownership metadata to lifecycle responses and events: `phase`, `owner`, `takeoverRequired`,
  `currentAfterSequence`, `nextAfterSequence`, and `activeGate`.

## Implementation Changes

### 1. Evidence Health Layer

- Move pass/fail finalization out of raw exit-code handling and into a shared post-run finalizer.
- Parse Cucumber JSON before marking a run passed; reject zero-feature, zero-scenario, zero-step, missing-report,
  malformed-report, and placeholder-package runs.
- Require expected `TestRunTestCase` rows for plan-bound and validation-bound runs; unmatched scenarios and unexecuted
  expected cases produce invalid or incomplete evidence.
- Persist evidence-health details and make baseline, implementation, and completion consume that verdict instead of
  re-deriving partial status from `TestRun.result`.
- Treat `TestRun.result === PASSED` as a derived consequence of valid evidence, not a direct synonym for process exit
  code `0`.

### 2. Plan-Bound Execution

- Make Appraise resolve `targetRoot`, `cwd`, `BASE_URL`, environment variables, feature paths, import paths, support
  imports, binary path, tag expression, report path, and expected test cases from the approved validation artifact.
- For validation-bound `test_run`, create `TestRunTestCase` rows from `appraiseArtifacts.testCases` before execution,
  then update them from report and scenario data.
- Keep explicit path inputs as advanced escape hatches, but mark them reduced-assurance unless they match the approved
  runtime projection.
- Return an `agentExecutionPacket` from `baseline_start`, `implementation_validation_start`, and plan-bound
  `test_run_preflight` with ready-to-call inputs and stable evidence links.

### 3. Runtime Preflight

- Verify local Cucumber binary, Playwright browsers, target reachability, `BASE_URL`, environment row, generated config
  importability, selected case count, expected runtime rows, and artifact hash/fingerprint freshness.
- Run the same preflight before `validation_draft_publish`, validation approval, baseline start, implementation
  validation start, and plan-bound `test_run`.
- Block stale target-project fingerprints, changed validation files, missing environments, stale runtime projections,
  and target-root mismatches with structured recovery.
- Prefer blocking early with precise preflight evidence over recording a suspicious run and asking agents to diagnose
  it afterward.

### 4. Cucumber And Runtime Contract

- Stop relying on `npx cucumber-js` fallback for managed runs; resolve the local binary deterministically.
- Pass `BASE_URL`, `APPRAISE_TARGET_ROOT`, `APPRAISE_PLAN_ID`, `APPRAISE_VALIDATION_ID`, and `TEST_RUN_ID` into the
  Cucumber world.
- Treat scenario events as advisory live updates; report parsing is the authority for final evidence.
- Replace brittle mixed-output JSON parsing with a structured event channel or robust line protocol where feasible.
- Classify Playwright install/cache/browser failures as infrastructure failures rather than product validation
  failures.

### 5. Baseline And Implementation Gates

- Baseline reconciliation must classify invalid evidence health as harness or infrastructure failure, never as accepted
  product evidence.
- Implementation validation reconciliation only sets full assurance when the bound `TestRun` has
  `evidenceHealth: valid`.
- Completion readiness must require fresh valid managed evidence for required runtime validations.
- Manual evidence remains reduced assurance and cannot silently satisfy ordinary runtime proof.
- `baseline_start` and `implementation_validation_start` should return the exact next MCP call and required inputs.

### 6. Agent Ergonomics

- Use `test_run_diagnose` as the recovery path for suspicious or failed runs, replacing agent spelunking through huge
  logs, SQLite rows, and source files.
- Add logs API modes: `summary`, `errorsOnly`, `tail`, and `aroundFailure`, while preserving SSE for live UI streaming.
- Elevate structured MCP error `details`, blockers, and exact recovery steps instead of burying them in serialized
  payloads.
- Every lifecycle tool should return the next exact MCP call and required inputs.
- Keep concise lifecycle responses as the default; full artifacts should be opt-in through `responseMode: "full"`.

### 7. Lifecycle Ownership And Recovery

- Keep user-owned decisions in UI/Appraise review surfaces; keep mechanical execution in agent/MCP by default.
- Add an explicit takeover flow for UI-driven baseline or implementation mechanics when no agent is active or the user
  intentionally takes over.
- Make events phase-aware so older approvals cannot be mistaken for the active gate after a later change request or
  cancellation.
- Add stale-server and capability checks so agents know when native MCP tools are missing or the sidecar needs
  reconnect.

### 8. Validation Authoring Parity

- Ensure `validation_draft_check` and `validation_draft_publish` share blocker logic. Publish should only fail after
  check if filesystem or database state changed; in that case, return a drift-specific blocker.
- Keep legacy `validation_publish`, but make it run the same runtime, materialization, and preflight rules as the draft
  path.
- Separate reusable Appraise/template step references from runtime step files so agents do not invent target-local step
  files for registry reuse.
- Preserve legacy `reusedStepPaths` compatibility by normalizing it into canonical reusable references when possible.

### 9. UI And Docs

- Show evidence-health badges and blockers on test-run detail, validation review, baseline review, implementation
  completion, and run tables.
- Update current docs:
  - `docs/test-run-runtime.md`
  - `docs/coordinator-api-mcp.md`
  - `docs/agent-lifecycle-flow.md`
  - `docs/agent-mcp-setup.md`
  - `docs/scaffold-template-sync.md` if scaffold behavior changes
- Update `docs/coordinator-api-mcp.md` so the MCP tool list matches the current implementation-validation and draft
  tool surface.
- Sync scaffold templates after root changes with:

```bash
npm --prefix packages/create-appraisejs run prepare-template
```

## Test Plan

- Unit tests for evidence health: zero scenarios, missing report, malformed report, placeholder binary, unmatched
  scenario, missing expected test-case rows, stale runtime artifact, and valid report.
- Test-run service tests proving plan-bound runs create expected `TestRunTestCase` rows and only finalize after report,
  log, and evidence reconciliation.
- Executor tests for local binary resolution, generated exact config, `BASE_URL` env propagation, target-root cwd, and
  no `npx` placeholder fallback.
- Coordinator tests for baseline and implementation validation consuming `RunEvidenceSummary` and blocking invalid
  evidence.
- MCP tests for `test_run_preflight`, `test_run_diagnose`, `test_run_read`, response modes, stable IDs, and next-action
  payloads.
- UI tests for evidence-health warnings and blocked completion or baseline states.
- E2E lifecycle tests covering planning, validation draft, approval, baseline, implementation validation, completion,
  cancellation, stale evidence, and takeover recovery.
- Validation commands:

```bash
npx vitest run src/services/test-run/test-run-service.test.ts
npx vitest run src/services/report/report-service.test.ts src/lib/test-run/report-parser.test.ts
npx vitest run src/services/coordinator/coordinator-baseline-service.test.ts
npx vitest run src/services/coordinator/coordinator-implementation-service.test.ts
npm --prefix packages/appraisejs run test
npm run check:harness
npm --prefix packages/create-appraisejs run prepare-template
npm run validate:unit
npm run build
```

Run focused ESLint and Prettier checks on touched files before broader validation.

## Assumptions

- This plan is an AppraiseJS-side robustness track, not a target-app-specific fix.
- MCP remains the clean general-release path for coding agents; provider-native and AG-UI style integrations should
  consume these contracts rather than bypass them.
- Suspicious evidence should block lifecycle progression until Appraise can classify it clearly.
- The normal path should require less agent source inspection, not better agent guesswork.
