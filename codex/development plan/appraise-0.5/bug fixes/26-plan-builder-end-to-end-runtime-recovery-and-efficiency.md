# Plan Builder End-To-End Runtime, Recovery, And Efficiency

## Summary

Make the AppraiseJS plan-builder happy path genuinely executable for a fresh external workspace: natural-language brief
to reviewed plan, validation authoring, valid baseline, implementation, managed final validation, and completion.

This plan is based on a live 2026-07-10 subagent evaluation of a simple motivation-quotes application. Three plans
were reviewed and approved through the real Appraise UI. None could reach implementation because Appraise-generated
baseline execution repeatedly produced invalid evidence, and baseline reconciliation either returned to validation
review only for recognized harness text or trapped the plan in `baseline_review` as an unrelated failure.

This plan complements the broader requirement-fidelity and evidence-integrity work in bug-fix plans 23 and 25. It
adds the exact cross-layer failures proven by this run, orders them into an executable dependency chain, and defines a
release-level end-to-end acceptance test.

## Audit Evidence

### Attempt 1

- Target: `/tmp/appraisejs-motivation-quotes-happy-path`
- Plan: `pln_01kx5z29gjpae9ecpsftd4ftha`
- Plan review: exact revision 1 approved in the Appraise browser UI
- Validation review: approved in the Appraise browser UI after one environment-contract revision
- Baseline runs:
  - `3a954e57-e70b-40c7-bbe9-8be50e1b7f3a`
  - `c51ffd22-35f7-43af-b6b4-d4ba1695174d`
- Both runs: `evidenceHealth: invalid_missing_report`
- Terminal lifecycle: `baseline_review`; no safe route back to validation preparation

### Attempt 2

- Target: `/tmp/appraisejs-motivation-quotes-happy-path-retry`
- Plan: `pln_01kx5zqbjzrxr32m3a056sq8da`
- Added runtime workaround: 171 packages, 88 MB of `node_modules`, 29 seconds, and four reviewed files
- First baseline failure: projected reusable navigation step imported a missing target-local
  `packages/cucumber-runtime/src/index.js`
- Second baseline run: `9520481c-de50-4003-9aeb-afd0dfda2717`
- Second failure: custom step compilation lacked DOM types and produced no report
- Terminal lifecycle: `baseline_review`; invalid evidence again appeared as an unrelated failure

### Attempt 3

- Target: `/tmp/appraisejs-motivation-quotes-happy-path-retry-2`
- Plan: `pln_01kx60ca2c3n15chz5tqamk4c2`
- Added reviewed DOM-enabled `tsconfig.json`; local `tsc --noEmit` passed
- Initial baseline run: `445325f2-9c5e-48c9-b77c-53929d0120ad`
- Initial failure: target Cucumber CLI and hub Cucumber support loaded different physical Cucumber instances
- Single-instance file dependency removed the duplicate-instance failure
- Final baseline run: `1f51c460-7d33-4b0c-baba-722b79e064b1`
- Final run produced a JSON report and exited zero, but executed `0 scenarios` and `0 steps`
- Evidence health: `invalid_empty_run`
- Exact root cause: baseline filtering required `@ts_<suiteId> and @tc_<caseId>`, while generated scenarios contained
  `@appraise_validation_<validationId> @tc_<caseId>` and no suite tag
- Terminal lifecycle: `baseline_review`; implementation remained correctly locked

No invalid baseline was accepted. No product implementation or final validation was fabricated outside Appraise.

## Defects

### P0: Generated Feature Tags Do Not Match Baseline Selection

`src/services/coordinator/validation-runtime-projection-service.ts` defines `testSuiteTag()` and creates projected
suite identifier rows, but `featureTextForPath()` emits only plan, validation, and test-case tags. Baseline execution
creates a partial-suite `TestRun` whose tag expression requires both the projected suite and case identifiers. The
result is a successful Cucumber process with zero selected scenarios and invalid empty-run evidence.

This is the terminal blocker for every Appraise-generated greenfield baseline using the same projection path.

### P0: Invalid Evidence Is Reclassified From Its Text Instead Of Its Health

`loadAppraiseEvidence()` converts non-valid `RunEvidenceSummary.evidenceHealth` into ordinary failure signatures.
`classifyBaselineResult()` then guesses whether those strings are harness failures through `isBlockingFailure()`.
Messages such as a missing JSON report or zero selected scenarios can miss the regex and become
`pre_existing_unrelated_failure` even though the durable health is `invalid_missing_report` or `invalid_empty_run`.

Evidence health is already the authoritative trust verdict. Turning it back into text and re-parsing it discards the
strongest signal in the system.

### P0: Baseline Review Has No Safe Invalid-Evidence Recovery

Once invalid evidence is mislabeled and reconciliation moves to `baseline_review`:

- `baseline_cancel` rejects the request because the plan is no longer running baselines;
- validation feedback rejects the request because the plan is no longer awaiting validation feedback;
- the remaining UI/MCP actions encourage acknowledgement and acceptance of evidence that must not be trusted.

Every invalid, infrastructure, or harness result must have a supported route back to validation preparation and a
fresh managed run.

### P0: Greenfield Runtime Projection Is Not Self-Contained

Managed baselines hardcode `prepareWorkspace: false` while fresh targets have no reliable local runner. The audit
encountered all of the following:

- dependency-confusion placeholder resolution through `npx cucumber-js`;
- missing target-local Appraise Cucumber runtime imports;
- TypeScript compilation without DOM libs;
- duplicate Cucumber installations between target CLI and hub support code.

An agent should not need to install 171 packages or know Appraise's internal absolute path to make a reviewed baseline
executable.

### P0: Runtime Preflight Does Not Exercise The Exact Managed Command

Draft check and runtime preflight reported `passed` before missing environments, missing imports, TypeScript errors,
duplicate Cucumber instances, and zero-scenario selection surfaced at later gates. Preflight currently validates
pieces of the projection, not the exact binary, config, loader/import graph, tag expression, expected test-case match,
and report path used by the managed run.

### P1: Environment Input Accepts IDs But Approval Requires Names

`validation_context_read` returns environments with both `id` and `name`. Validation draft schemas accepted the UUID
used by the agent, and runtime preflight passed, but `assertValidationEnvironmentsReady()` queries by name and blocked
final review submission. The UI simultaneously said runtime preflight passed and validation evidence was ready.

The contract must expose one canonical environment identity or normalize accepted IDs before any ready signal.

### P1: Low-Confidence Step Matching Silently Rewrites Intent

`scoreIntent()` counts any shared token and `findTemplateStep()` picks the highest score whenever it is greater than
zero. An accessibility/responsive custom intent was silently rewritten to an unrelated random-address template.
There is no minimum score, margin over the next result, semantic capability check, or explicit confirmation.

### P1: Draft Mutation Has No Delete Or Replace Recovery

The wrong intent-shaped proposal created an unwanted required validation node. MCP exposes node upsert but no node
delete, replace-by-proposal, rollback, or draft reset operation. Although `resetValidationDraft()` exists in service
code, it is not exposed through the normal tool surface. The first audit attempt therefore carried a duplicate node
through review.

### P1: Draft Responses And Resource Reads Are Excessively Large

Every node/file/metadata mutation, check, and publish returns the full draft through `toMutationResult()`. Publish
returns the full draft again plus the rendered validation artifact. Search helpers fetch the complete validation
context before filtering it in the MCP process. Server traces also showed four materially redundant context reads
around one draft creation.

The workaround multiplied this cost across repeated file upserts and re-review cycles. A tiny one-scenario app should
not require full-artifact serialization after every field-level mutation.

### P1: Natural-Language Requirement Extraction Confuses Lifecycle With Domain Behavior

`packages/appraisejs/src/plan-requirements.ts` treats any occurrence of `complete`, `completed`, or `completion` as
the domain requirement `Complete and reactivate records`. The phrase "run final validation and complete the flow"
therefore triggered a nonexistent CRUD capability and returned `coverage_review_required`.

The candidate plan was also generic and omitted quote display, deterministic rotation, copy feedback,
accessibility, responsive behavior, and tests. A structured `plan_create` fallback was required.

### P1: Diagnosis Does Not Lead With The Executable Root Cause

`test_run_diagnose` repeated missing-report or empty-run blockers but did not reliably return the bounded stderr line
that explained the placeholder binary, missing import, TypeScript failure, duplicate Cucumber instance, or zero
scenario count. The agent had to inspect server logs and source to recover.

## Goals

1. A fresh writable external workspace completes the entire Appraise lifecycle without manual artifact patching.
2. Every required baseline combination selects at least one expected test case before a run is trusted.
3. Invalid evidence can never be acknowledged or accepted as an unrelated product failure.
4. Every failed baseline has a safe, explicit recovery transition.
5. Managed runtime resolution is deterministic and uses one Cucumber installation.
6. Draft check, preflight, review submit, baseline start, and execution enforce the same contracts.
7. Natural-language planning preserves domain behavior while ignoring lifecycle-control prose.
8. Normal-agent response volume is proportional to changed state, not total draft size.

## Non-Goals

- Weakening Appraise-owned plan, validation, baseline, implementation, or completion gates.
- Accepting reduced-assurance manual evidence for required managed validation.
- Teaching agents to patch generated Gherkin, SQLite rows, or validation YAML.
- Making target applications depend on Appraise's repository checkout path.
- Treating retries as the primary recovery model; the normal first attempt must work.

## Public Contract Changes

### Evidence-Preserving Baseline Classification

Carry evidence health into classification directly:

```ts
type BaselineEvidence = {
  status: 'running' | 'completed'
  result: 'passed' | 'failed' | 'cancelled' | 'interrupted'
  evidenceHealth: RunEvidenceHealth
  blockers: RunEvidenceBlocker[]
  failureSignatures: string[]
  completedStepIds: string[]
}
```

Any health other than `valid` deterministically maps to `validation_harness_failure` or a new explicit
`infrastructure_failure` classification. It never maps to `pre_existing_unrelated_failure`.

### Baseline Repair And Retry

Add one Appraise-owned repair transition, for example:

```ts
baseline_retry({ planId, reason, expectedValidationHash })
```

It must:

- reject while attempts are still actively running;
- preserve prior attempts as audit evidence;
- move `baseline_review` with invalid evidence to `validation_changes_requested`;
- invalidate only affected validation decisions and runtime projections;
- require a new exact review before another run;
- never rewrite or delete historical TestRuns.

The UI should expose the same operation as "Repair validation and rerun baseline."

### Compact Draft Responses

Add a consistent response mode:

```ts
responseMode: 'summary' | 'delta' | 'full'
```

Default mutation response:

```ts
type ValidationDraftMutationSummary = {
  accepted: boolean
  planId: string
  draftId: string
  draftHash: string
  changedPaths: string[]
  counts: { validations: number; files: number; blockers: number; warnings: number }
  blockers: ValidationDraftBlocker[]
  warnings: string[]
  nextRecommendedAction: string
}
```

The full draft remains available through `validation_draft_read({ responseMode: 'full' })`.

### Explicit Draft Repair Tools

Expose:

- `validation_node_delete({ planId, nodeId, expectedDraftHash })`;
- `validation_file_delete({ planId, path, expectedDraftHash })`;
- `validation_draft_reset({ planId, expectedDraftHash })`;
- optional atomic `validation_draft_patch` for multiple hash-bound mutations.

## Implementation Plan

### Phase 1: Restore Evidence Integrity

#### Task 1: Align Generated Scenario Tags With Runtime Selection

**Description:** Make runtime projection and TestRun selection share one identifier-tag builder. Generated scenarios
must carry the exact suite and case tags used by the baseline tag expression, or the baseline selector must use the
tags already emitted by projection.

**Acceptance criteria:**

- Every projected case contains its plan, validation, suite, and case identifiers.
- Partial-suite baseline selection matches the intended scenario in a generated feature.
- Projection rejects duplicate or unassigned suite/case relationships before review.

**Verification:**

- Add focused tests in `src/services/coordinator/validation-runtime-projection-service.test.ts`.
- Add baseline-service coverage that runs the actual generated tag expression against generated feature text.
- Assert selected scenario count is exactly one for the audit-sized fixture.

**Dependencies:** None.

#### Task 2: Classify Durable Evidence Health Directly

**Description:** Stop converting invalid evidence into ordinary text signatures. Preserve `evidenceHealth` and
structured blockers from `summarizeRunEvidence()` through baseline reconciliation.

**Acceptance criteria:**

- `invalid_empty_run`, `invalid_missing_report`, `invalid_placeholder_binary`, unmatched scenarios, and
  `infrastructure_failure` always become harness/infrastructure classifications.
- Only valid report evidence can enter expected, regression-pass, or unrelated-product classification.
- Invalid evidence automatically moves the lifecycle to `validation_changes_requested`.

**Verification:**

- Extend `src/lib/baseline-execution/baseline.test.ts` with every evidence-health value.
- Extend `src/services/coordinator/coordinator-baseline-service.test.ts` with missing-report and zero-scenario runs.
- Assert that no invalid-health fixture emits `baseline_review_ready`.

**Dependencies:** Task 1.

#### Task 3: Add Hash-Bound Baseline Repair

**Description:** Add the MCP, service, UI, and event transition that safely reopens validation after invalid baseline
evidence.

**Acceptance criteria:**

- Invalid `baseline_review` can return to `validation_changes_requested` without acknowledging or accepting evidence.
- Historical attempts and TestRun links remain visible.
- Valid baseline acceptance behavior remains unchanged.

**Verification:**

- Coordinator lifecycle tests for retry, stale hash, active-run rejection, and idempotency.
- MCP E2E test for `baseline_retry` and exact next action.
- UI test for visible repair guidance and disabled unsafe acceptance.

**Dependencies:** Task 2.

### Checkpoint: Evidence Integrity

- [ ] Generated features match baseline selectors.
- [ ] Invalid evidence cannot reach an acceptance-ready state.
- [ ] A failed baseline can be repaired without creating a new plan.

### Phase 2: Make Runtime Preparation Deterministic

#### Task 4: Choose One Runtime Ownership Model

**Description:** Use either a fully hub-owned runtime packet or a fully target-local runtime packet. Do not mix a
target Cucumber CLI with support code that imports the hub's Cucumber instance.

**Preferred direction:** Appraise-owned execution packet with a deterministic Appraise binary/runtime cache, target
cwd, target feature/step paths, and no target dependency on the Appraise source checkout.

**Acceptance criteria:**

- Fresh external targets need no manual Cucumber installation.
- One physical Cucumber instance owns CLI and support-code registration.
- Reused template-step projection uses portable imports or bundled runtime modules.
- Managed execution never falls back to the dependency-confusion placeholder.

**Verification:**

- Executor tests assert binary realpath and single-instance module resolution.
- External empty-workspace fixture runs one Cucumber scenario and writes a JSON report.
- Scaffold-template copies are regenerated and tested when root runtime source changes.

**Dependencies:** Task 1.

#### Task 5: Run Exact-Command Preflight

**Description:** Preflight the same binary, cwd, generated config, support imports, TypeScript loader, environment,
tag expression, report path, and expected TestRun rows used by managed execution.

**Acceptance criteria:**

- Missing environment, import, DOM lib, duplicate Cucumber, placeholder binary, zero selected scenarios, and unwritable
  report path block validation review before user approval.
- Preflight and review submit use the same environment and projection validator.
- Preflight returns a bounded executable packet and structured recovery.

**Verification:**

- Table-driven preflight tests for every failure observed in this audit.
- One full dry-run fixture proves at least one selected scenario and report creation.
- UI never displays "ready" while the submit action would reject unchanged state.

**Dependencies:** Task 4.

### Checkpoint: Deterministic Runtime

- [ ] A fresh target reaches a valid expected-failure baseline without installing dependencies manually.
- [ ] Reusable and custom-only step paths both execute.
- [ ] Review submit cannot discover a blocker that unchanged preflight missed.

### Phase 3: Harden Plan And Validation Authoring

#### Task 6: Separate Lifecycle Language From Domain Requirements

**Description:** Make completion/reactivation extraction domain-aware. Lifecycle phrases such as "complete the run,"
"completion review," and "final completion" must not create record-level CRUD requirements.

**Acceptance criteria:**

- The exact motivation-quotes brief produces quote-specific tasks without `coverage_review_required`.
- Todo/reminder briefs that explicitly describe completing or reactivating records still extract the capability.
- Coverage warnings identify their source phrase and domain evidence.

**Verification:**

- Add plan-requirement fixtures for lifecycle prose, quotes, todos, reminders, and ambiguous mixed text.
- Extend `packages/appraisejs` MCP tests for the exact audited brief.

**Dependencies:** None.

#### Task 7: Make Reuse Matching Confidence-Bound

**Description:** Require a minimum score, a safe margin, and capability-compatible terms before auto-rewriting a
custom intent to a template step or step block.

**Acceptance criteria:**

- Accessibility/responsive intent never matches random-address generation.
- Low-confidence candidates are returned as suggestions, not mutations.
- Auto-rewrites include match score, matched terms, and original intent in a compact warning.

**Verification:**

- Unit tests for exact, high-confidence, tied, and unrelated matches.
- Validation-shape E2E test preserving a custom proposal when no reusable capability qualifies.

**Dependencies:** None.

#### Task 8: Add Draft Delete, Reset, And Atomic Patch

**Description:** Expose the existing reset capability and add hash-bound node/file deletion plus bounded atomic patch
support.

**Acceptance criteria:**

- An erroneous intent-shaped proposal can be removed without recreating the plan.
- Stale draft hashes are rejected with current hash and recovery guidance.
- One atomic patch can add a node, metadata, and its files with one response.

**Verification:**

- Service and MCP tests for delete/reset/patch, stale hashes, idempotency, and blocker recomputation.

**Dependencies:** Task 7.

#### Task 9: Normalize Environment Identity Early

**Description:** Make the validation matrix contract explicitly name-based or accept a structured environment ref and
normalize it at mutation time.

**Acceptance criteria:**

- Known UUID and name inputs resolve to one canonical environment name when compatibility requires both.
- Unknown environments block draft check, preflight, and publication consistently.
- UI readiness and submit action cannot disagree for unchanged state.

**Verification:**

- Draft, projection, review-submit, and baseline tests share the same environment fixtures.

**Dependencies:** Task 5.

### Phase 4: Reduce Calls, Tokens, And Recovery Time

#### Task 10: Return Draft Deltas By Default

**Description:** Replace full-draft mutation responses with hashes, changed paths, counts, blockers, warnings, and the
next action. Keep full reads explicit.

**Acceptance criteria:**

- Node/file/metadata upsert and check responses remain bounded as the draft grows.
- Publish returns one compact review handoff, not the full draft plus the full artifact.
- Serialized-size regression tests enforce budgets for one-node and twenty-node drafts.

**Verification:**

- MCP unit and E2E byte-size assertions for `summary`, `delta`, and `full` modes.
- Confirm compatibility behavior for one release if external consumers depend on the old full response.

**Dependencies:** Task 8.

#### Task 11: Filter Resources Server-Side And Cache Context Receipts

**Description:** Add scoped context reads and server-side search rather than fetching every resource before local
filtering.

**Acceptance criteria:**

- `validation_context_read` supports resource types, query, pagination, and `sinceHash`.
- Template-step, step-block, and locator search return bounded matches directly from the service/database.
- Unchanged context can return `not_modified` with a receipt instead of the full payload.

**Verification:**

- Query-count and serialized-size tests.
- Audit fixture completes validation authoring with one initial context read and no redundant full reads.

**Dependencies:** Task 10.

#### Task 12: Improve Managed Diagnosis

**Description:** Make `test_run_diagnose` return the health verdict, first actionable root cause, bounded stderr excerpt,
exact command identity, selected-scenario count, and next allowed recovery action.

**Acceptance criteria:**

- Every failure from this audit is diagnosable without source or raw-log inspection.
- Missing report is contextualized by the upstream compiler/import/runtime cause when logs contain one.
- Zero-scenario diagnosis includes the tag expression and emitted scenario tags.

**Verification:**

- Golden diagnosis tests for placeholder binary, missing import, missing DOM lib, duplicate Cucumber, and zero scenarios.

**Dependencies:** Tasks 2, 5, and 11.

### Phase 5: End-User Robustness Features

#### Task 13: Add Appraise-Owned Runtime Preparation Proposal

Offer a reviewable "Prepare executable validation runtime" proposal for fresh targets. It should show the runtime
owner, binary/version, projected files, cache reuse, install/download size, and whether any product file changes.

#### Task 14: Show The Exact Execution Packet In Review

Validation review should display the resolved target root, environment name, browser, feature paths, support/import
paths, tag expression, expected case/scenario count, and report destination in a compact expandable panel.

#### Task 15: Add One-Click Repair And Rerun

When evidence health is invalid, show the concrete cause and a single safe action that reopens only affected
validation evidence, preserves unaffected decisions, and schedules a fresh managed run after review.

**Dependencies:** Tasks 3, 5, and 12.

### Final Checkpoint: Release Acceptance

Run a fresh-machine E2E fixture with a new empty target and the exact audited brief:

1. `planning_session_create` returns a quote-specific review-ready plan on the first attempt.
2. The UI approves the exact plan revision.
3. One compact validation authoring flow creates a custom or reusable executable case.
4. Preflight proves the exact managed command selects one scenario.
5. Baseline creates valid expected-failure evidence and is accepted through the UI.
6. Appraise unlocks implementation; the agent creates the quotes app and verifies every task.
7. Managed implementation validation returns `evidenceHealth: valid` with a passing report.
8. Completion review shows fresh evidence and exact hash; explicit UI sign-off emits `completed`.
9. No generated artifact, SQLite row, or lifecycle gate is manually patched.
10. Record total MCP calls, serialized bytes, context reads, wait calls, runtime setup bytes, and elapsed time.

## Validation Commands

```bash
npx vitest run src/services/coordinator/validation-runtime-projection-service.test.ts
npx vitest run src/lib/baseline-execution/baseline.test.ts
npx vitest run src/services/coordinator/coordinator-baseline-service.test.ts
npx vitest run src/services/coordinator/coordinator-validation-draft-service.test.ts
npx vitest run src/services/test-run/run-evidence-summary-service.test.ts
npm --prefix packages/appraisejs run test
npm run check:harness
npm --prefix packages/create-appraisejs run prepare-template
npm run validate:unit
npm run build
```

Run affected-file ESLint and Prettier checks first. Because runtime, lifecycle, MCP, and scaffold behavior all change,
update `docs/test-run-runtime.md`, `docs/coordinator-api-mcp.md`, `docs/agent-lifecycle-flow.md`, validation/scaffold
guidance, and synchronized template copies in the same change set.

## Risks And Mitigations

| Risk                                         | Impact | Mitigation                                                                                  |
| -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Tag fixes change existing selection behavior | High   | Centralize tag generation and add old/new fixture coverage before changing the expression.  |
| Runtime ownership breaks scaffolded apps     | High   | Test root, scaffold template, and external empty workspace with the same execution packet.  |
| Recovery weakens human gates                 | High   | Require exact validation hashes and a fresh review; preserve all historical attempts.       |
| Compact responses break external clients     | Medium | Add explicit `full` mode and a one-release compatibility projection.                        |
| Matching threshold reduces reuse             | Medium | Return suggestions with evidence; prefer safe custom intent over incorrect automatic reuse. |
| Hub runtime path leaks into target artifacts | High   | Use a packaged/cache-owned runtime identity, never an absolute source-checkout dependency.  |

## Success Metrics

- First-attempt lifecycle completion rate for fresh external targets.
- Zero invalid-health baselines exposed as unrelated or acceptance-ready.
- Zero selected-scenario count mismatches after review approval.
- Median and p95 MCP response bytes by tool and response mode.
- Full validation-context reads per plan; target is one or fewer on the normal path.
- Validation draft mutation calls and bytes per validation node.
- Runtime bootstrap bytes and time; eliminate the audit's 88 MB per-target workaround.
- Time from runtime failure to actionable diagnosis and safe retry.
- Number of user approvals repeated because an earlier preflight missed unchanged-state blockers.

## Assumptions

- MCP remains the canonical general-release orchestration path.
- Appraise-owned managed `TestRun` evidence is required for baseline and final validation.
- The user/Appraise UI retains plan, validation, baseline, and completion decision authority.
- Generated/sync-managed artifacts remain outputs of canonical services and are never hand-edited.
