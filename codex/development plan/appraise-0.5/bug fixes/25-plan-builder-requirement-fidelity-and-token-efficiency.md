# Plan Builder Requirement Fidelity And Token Efficiency

## Summary

Harden the natural-language plan builder so a review-ready plan preserves the user's explicit domain requirements
and the normal MCP happy path stays compact while waiting at Appraise-owned gates.

This plan is based on a real subagent audit on 2026-07-10. A subagent used `planning_session_create` to plan a simple
reminder application in a fresh writable target workspace, entered `plan_review_loop`, received approval through the
Appraise UI, prepared and approved validation artifacts, and attempted managed baseline execution. Planning gates
worked, but the generated plan was not fit for implementation, validation consistency failures appeared only at late
gates, and baseline execution was blocked by invalid runner/config evidence. The initial planning segment alone
returned roughly 90,000 serialized response characters; continuation added several hundred thousand more.

## Audit Evidence

- Plan ID: `pln_01kx5d27n9nj4sm8s7eem1gx03`
- Review URL: `http://127.0.0.1:3000/plans/pln_01kx5d27n9nj4sm8s7eem1gx03`
- Target: `/private/tmp/appraisejs-reminder-happy-path-20260710`
- Initial lifecycle evidence: `plan_review_ready` sequence 2, revision 1, hash
  `sha256:81b69a9efdc4f8475a8e3e1bb90dee7a4cc32897396353345efe460139e3125c`
- Approval evidence: exact revision 1 approved in the Appraise UI; `plan_approved` sequence 3
- Start evidence: `plan_start` succeeded; `validation_preparation_started` sequence 4 was read and acknowledged
- No product implementation or validation artifacts were authored during the audit

Observed response sizes and timings:

| Operation                   | Result                    | Approximate serialized size |        Observed duration |
| --------------------------- | ------------------------- | --------------------------: | -----------------------: |
| `project_diagnostic`        | Healthy                   |           18,968 characters |            3.186 seconds |
| `planning_session_create`   | Review ready              |           28,514 characters |            4.554 seconds |
| `plan_review_loop` pending  | No event or cursor change |       6,667 characters each |       27-38 seconds each |
| Five unchanged review waits | No progress               |     33,335 characters total |  About 155 seconds total |
| `plan_review_loop` approved | Approval sequence 3       |            1,333 characters |           12.662 seconds |
| `plan_start`                | Preparing validations     |            5,799 characters |            4.660 seconds |
| `plan_events_read`          | Sequence 4                |              440 characters |           10.974 seconds |
| Event acknowledgements      | Sequences 3 and 4         |     428-445 characters each | 3.007 and 10.954 seconds |

### End-To-End Continuation Evidence

The audit continued beyond validation preparation. Three plans were needed because the first plan artifact was
cleaned up prematurely and the second plan entered an unrecoverable baseline-review state. The final safe state was:

- plan: `pln_01kx5encxs447v86m6tv69cagz`;
- validation: `p3-01kx5enc-reminder-e2e`;
- baseline run: `09bf7ae7-44bf-4c2e-9861-26e774e02cbc`;
- validation content: one required suite/case, 22 steps, 13 locators, nine reused template steps, zero custom steps;
- test infrastructure: target-local Cucumber, Playwright, TypeScript, package lock, and Appraise Cucumber runtime;
- baseline preflight: incorrectly `ready` with no blockers;
- managed baseline evidence: `infrastructure_failure`, missing Cucumber JSON report;
- baseline classification: `validation_harness_failure`;
- lifecycle recovery: `validation_changes_requested`;
- product implementation: not started;
- baseline evidence: not accepted.

Earlier continuation run `a0134c14-631f-4a88-b19f-c8832ea88360` executed the dependency-confusion `cucumber-js`
placeholder, exited zero, and produced no report. Reconciliation incorrectly labeled it
`pre_existing_unrelated_failure`, moved to `baseline_review`, and exposed acceptance without a safe MCP or UI
transition back to validation changes.

Measured continuation payloads included approximately 26,900 characters for `validation_context_read`, 27,000 to
31,000 characters per shape or node mutation, about 196,000 characters across six file-evidence upserts, 65,000 to
81,000 characters per validation publish, and about 39,000 characters each for baseline start and reconcile.

## Defects

### P0: Explicit Reminder Requirements Were Replaced By An Editor Template

The generated tasks were `editor-state`, `document-management`, `Persist editor content`, and
`Validate the editor workflow`. They omitted or weakened:

- reminder title, optional notes, and due date/time;
- complete/active state transitions;
- active/completed filtering;
- reminder-specific edit and delete behavior;
- focus management and screen-reader announcements;
- responsive acceptance criteria;
- the requested CRUD, persistence, accessibility, and responsive test coverage.

The immediate cause is in `packages/appraisejs/src/mcp.ts`: the word `notes` makes `isEditorBrief` true, and the editor
branch runs before the generic CRUD branch. A field in a domain entity is therefore mistaken for the primary product
domain. The existing tests cover todo, editor, dashboard, API, and generic CRUD examples, but not mixed-intent briefs
where one domain contains vocabulary associated with another template.

### P1: Review-Ready Plans Have No Requirement Coverage Gate

The builder can emit `plan_review_ready` even when explicit brief requirements are absent from every task,
acceptance criterion, and validation intent. The review UI shows the original description and the generated graph,
but does not summarize covered and uncovered requirements or warn about a low-confidence classification.

### P1: Normal MCP Responses Repeat Large Payloads

- `project_diagnostic` returns every registered target and repeats capability lists under capability and recovery
  structures.
- `planning_session_create` embeds the full diagnostic, target registration result, created plan, review-ready plan,
  scalar handoff fields, `handoffMarkdown`, and an identical `requiredUserFacingMessage`.
- `standbyPresentation` returns the same handoff as structured fields and two rendered strings.
- Every unchanged review wait repeats the brief, full handoff, and standby instructions.
- `plan_start` repeats the full plan even when the caller already holds the exact hash and revision.

### P1: Idle Standby Is Expensive

Five unchanged bounded waits returned about 33,000 characters. The cursor did not move, so nearly all content was
already known to the caller. The client needs a delta contract after the first complete URL handoff and an adaptive
wait strategy that does not spend tokens restating unchanged state.

### P2: Event Reads And Acknowledgements Have Unexplained Tail Latency

No-work `plan_events_read` and one acknowledgement each took about 11 seconds. The run did not capture enough tracing
to assign a root cause, so latency must be instrumented before changing polling, persistence, or transport behavior.

### P0: Generated Cucumber Config Uses A Broken Absolute CLI Path

`src/lib/executor/local-executor-adapter.ts` writes the generated run config under the target, then passes its absolute
path to Cucumber while spawning with `cwd: projectRoot`. Cucumber resolves it under the working directory and attempts
`/target/target/.../cucumber.<run>.mjs`, causing `ERR_MODULE_NOT_FOUND` before any scenario executes. The executor unit
test currently codifies the broken absolute argument.

`test_run_preflight` returned ready because it did not load the exact generated config with the exact binary, cwd,
imports, and report path used by execution.

### P0: Invalid Baseline Evidence Can Expose An Unsafe Acceptance Dead End

The placeholder-run attempt had `invalid_missing_report`, zero features/scenarios/steps, and clear infrastructure
logs, but reconciliation labeled it `pre_existing_unrelated_failure`. The plan entered `baseline_review`, where
validation feedback and baseline cancel were rejected while UI and MCP offered acknowledgement and acceptance. No
exposed action returned safely to validation preparation.

Missing reports, placeholder binaries, zero scenarios, undefined steps, and config-load failures must always classify
as harness or infrastructure failures and retain a safe validation-recovery transition.

### P1: Validation Draft Checks Do Not Match Projection And Runtime Gates

The audit found three late failures that draft check and publish accepted:

- two nodes reused one suite ID while each suite instance contained only its own case, leaving a projected case
  unassigned;
- reused locator references produced incomplete or conflicting projections;
- global locator IDs collided with artifacts from an earlier plan and failed only during validation review submit.

Draft check, publish, review submit, baseline start, and preflight must share one consistency and projection pipeline.

### P1: Projection IDs Are Global But Generation Does Not Namespace Them

The final validation had to prefix module, suite, case, locator-group, locator, and validation IDs manually with a
plan token. Appraise should generate collision-resistant plan/revision-scoped IDs or explicitly reuse a compatible
canonical entity.

### P1: Validation Review Hides Server-Action Conflicts

`submitValidationReviewAction` returned a structured 409 `projection_conflict`, but the UI stayed on awaiting review
without showing the error. The cause was visible only by capturing the React server-action response. Review actions
need visible structured errors and recovery guidance.

### P1: Empty-Workspace Baseline Has No Deterministic Runtime Bootstrap

The first baseline used the dependency-confusion placeholder because the fresh target had no local runner. The agent
had to author and install Cucumber, Playwright, TypeScript, a lockfile, and a target-local Appraise runtime as reviewed
test infrastructure. Appraise should provide a deterministic bootstrap packet and never allow `npx` package
resolution for managed evidence.

## Goals

1. Preserve every explicit functional and quality requirement in review-ready plan evidence.
2. Detect ambiguous or conflicting domain signals instead of silently choosing the first matching template.
3. Make the initial normal-agent response concise and make unchanged standby responses delta-only.
4. Preserve Appraise-owned review, approval, and start gates without requiring agents to reconstruct state.
5. Give users a visible recovery path when generated coverage is incomplete.
6. Measure response bytes, wait count, and event-operation latency as product quality signals.
7. Ensure validation approval proves the exact projected graph and runnable command are valid.
8. Guarantee every invalid baseline classification has a safe recovery transition and cannot be accepted as valid
   evidence.

## Non-Goals

- Replacing Appraise-owned plan approval with chat approval.
- Using an LLM-only classifier without deterministic coverage checks and regression fixtures.
- Removing the complete browser URL, `appraise://` URL, revision, lifecycle, content hash, or cursor from the initial
  reviewer handoff.
- Implementing the reminder application used by the audit.
- Redesigning unrelated implementation or completion behavior beyond the recovery, evidence, and response contracts
  required to complete this audited flow safely.

## Public Contract Changes

### Requirement Traceability

Add a bounded plan-generation assessment:

```ts
type PlanRequirementAssessment = {
  domainCandidates: Array<{ domain: string; confidence: number; evidence: string[] }>
  selectedDomain?: string
  requirements: Array<{
    id: string
    text: string
    kind: 'functional' | 'data' | 'quality' | 'validation' | 'constraint'
    coveredBy: Array<{ taskId: string; surface: 'description' | 'acceptanceCriteria' | 'validationIntent' }>
  }>
  uncoveredRequirementIds: string[]
  warnings: Array<{ code: string; message: string }>
}
```

`planning_session_create` must not return durable review-ready success when explicit requirements are uncovered.
Prefer a compact `status: "coverage_review_required"` result with the candidate plan, missing requirements, and an
exact next action. Low-confidence classification without uncovered requirements may proceed with a visible warning.

### Compact And Delta Responses

Add or consistently honor:

```ts
responseMode: 'summary' | 'delta' | 'full'
```

- `summary` is the default for normal agents.
- `delta` is the default after the first complete handoff has been presented.
- `full` is opt-in for debugging and compatibility.
- An unchanged wait returns only `status`, `planId`, cursor fields, elapsed/timeout data, and `nextAction`.
- A changed wait returns the new event plus fields changed since the caller's cursor.
- The initial handoff returns one structured handoff object. Rendered Markdown is optional and never duplicated under
  two keys.
- `plan_start` returns transition evidence by default; the full plan is available only in `full` mode.

Add a short-lived diagnostic receipt so `planning_session_create` can reuse a compatible successful preflight rather
than recomputing and embedding the full diagnostic:

```ts
type DiagnosticReceipt = {
  id: string
  projectFingerprint: string
  capabilityFingerprint: string
  issuedAt: string
  expiresAt: string
}
```

Receipts are advisory cache keys, not authority to bypass current authentication, project identity, or blocking
health checks.

## Implementation Plan

### 1. Extract Requirements Before Selecting A Template

- Replace independent early-return keyword checks with a two-stage pipeline: extract requirements and domain
  candidates, then select or compose task shapes.
- Distinguish entity fields from dominant domain nouns. `optional notes` on a reminder must not make the product a
  note editor.
- Score all matching domains and record evidence rather than relying on branch order.
- Compose capabilities when a brief crosses templates; do not discard CRUD, completion, filtering, accessibility,
  responsive, or validation requirements because an editor keyword matched.
- Keep deterministic behavior and stable IDs for identical normalized briefs.

Primary source: `packages/appraisejs/src/mcp.ts`. Extract classification and traceability into focused modules if the
MCP file would otherwise continue accumulating product logic.

### 2. Add A Coverage Validator

- Map every extracted requirement to at least one task surface.
- Require functional and data requirements to appear in a task description or acceptance criterion.
- Require quality constraints such as accessibility and responsiveness to appear in acceptance criteria and
  validation intent when the brief explicitly requests them.
- Return bounded uncovered-requirement evidence before review-ready publication.
- Persist the assessment with the plan revision or in review metadata so the UI and revision flow use the exact same
  evidence.

### 3. Make Domain Ambiguity Reviewable

- Add a plan review coverage panel with covered/uncovered counts, domain candidates, warnings, and links to affected
  tasks.
- Add a low-confidence/domain-mismatch banner before approval.
- Add one-click `Regenerate from uncovered requirements`, which creates a higher revision and preserves Appraise's
  hash-bound review semantics.
- Keep manual blocking remarks and ordinary change requests available; regeneration is a convenience, not a new
  approval path.

Likely UI source starts under the plan review route and its inspector/approval components. Confirm exact component
ownership through `docs/component-organization-rules.md` before implementation.

### 4. Introduce Shared Response Projection

- Centralize MCP projections instead of spreading duplicate response assembly through tool handlers.
- Return stable IDs, gate status, cursor, links, blockers, and exact next action in `summary` mode.
- Paginate or cap target-project summaries in diagnostics; expose a separate full list/read path.
- Return capability fingerprints and missing/stale deltas rather than repeating the entire expected capability list.
- Remove identical `handoffMarkdown` and `requiredUserFacingMessage` values. Preserve a compatibility alias for one
  release if external consumers require it, but do not serialize both by default.
- Add serialized-byte assertions to MCP unit and E2E tests.

### 5. Make Standby Cursor-Aware

- Track whether the caller has already received the complete handoff for the current plan revision/hash.
- Return a minimal `pending_unchanged` projection when no new event or state change exists.
- Use adaptive server-recommended waits with bounded jitter and backoff while preserving cancellation responsiveness.
- Evaluate SSE or a subscription transport only after the delta contract is in place; transport changes should not be
  used to hide oversized response payloads.
- Document host-limit fallback behavior without requiring repeated user-facing handoffs.

### 6. Reuse Healthy Diagnostics Safely

- Issue a bounded diagnostic receipt with project and capability fingerprints.
- Accept the receipt in `planning_session_create` and recheck cheap security/identity invariants.
- Recompute only expired, changed, or blocking checks.
- Do not embed the full diagnostic in a successful planning response. Return receipt, health summary, warnings, and
  recovery only when needed.

### 7. Instrument Latency And Token Proxies

- Record operation name, response bytes, response mode, plan ID, event cursor movement, wait duration, and database or
  filesystem spans.
- Add percentiles for event read, long-poll completion, acknowledgement, diagnostic, plan generation, and plan start.
- Diagnose the observed roughly 11-second reads/acknowledgements before setting hard SLOs.
- Add development-only audit summaries that report total response bytes and unchanged wait count without logging
  sensitive plan content.

### 8. Fix Cucumber Config Path Generation

- Pass the generated config path relative to `projectRoot` when spawning Cucumber.
- Use the existing path-normalization helper consistently on POSIX and Windows.
- Update the executor unit test to expect `automation/reports/<run>/cucumber.<run>.mjs`, not an absolute path.
- Add an integration test that invokes the installed Cucumber binary from target cwd and loads the generated config.

### 9. Make Preflight Execute The Real Runtime Contract

- Resolve the exact local binary without an `npx` download fallback.
- Generate and load the exact config under the exact target cwd.
- Verify support imports, shared runtime imports, feature paths, tag selection, environment, browser availability, and
  writable report output.
- Treat placeholder packages, zero selected cases, undefined reusable steps, and config-load failures as blockers.
- Return the exact checked command and bounded failure evidence.

### 10. Unify Draft, Projection, And Baseline Consistency

- Move suite/case membership, resource reference resolution, global-ID compatibility, and runtime projection into one
  shared validator.
- Run that validator from draft check, publish, review submit, baseline start, and implementation validation start.
- Make `validation_test_shape_propose` resolve reusable locator refs into canonical projected locators or return a
  precise blocker.
- Add a projection preview showing final module/suite/case/group/locator IDs and relationships before approval.

### 11. Namespace Or Reuse Projected Resource IDs Safely

- Generate plan/revision-scoped IDs by default for new projected resources.
- Reuse an existing global resource only when type, owner, parent, and semantic content are compatible.
- Return an early collision blocker with the existing owner and incompatible fields.
- Add repeated-plan and cross-target collision fixtures.

### 12. Guarantee Baseline Failure Recovery

- Classify missing reports, placeholder binaries, zero scenarios, config-load errors, undefined steps, and unmatched
  cases as validation harness or infrastructure failures.
- Never advertise baseline acceptance for invalid evidence health.
- Expose an Appraise-owned `baseline_request_changes` or equivalent transition from `baseline_review` to
  `validation_changes_requested`.
- Keep cancellation for active processes separate from evidence rejection.
- Make UI and MCP show the same recovery actions and blockers.

### 13. Surface Review Action Errors

- Render `ActionResponse.error` and structured blocker details on validation and baseline review surfaces.
- Preserve errors across revalidation instead of leaving the lifecycle visually unchanged with no explanation.
- Add UI tests for projection conflicts, stale hashes, runtime-preflight failures, and rejected lifecycle transitions.

### 14. Add Empty-Workspace Validation Bootstrap

- Return a reviewed bootstrap packet for required Cucumber, Playwright, TypeScript, config, and Appraise runtime files.
- Pin compatible versions and write a reproducible lockfile without executing arbitrary registry placeholders.
- Classify bootstrap files as `test_infrastructure` and include them in validation review evidence.
- Verify the local binary and shared step imports before allowing validation submission.

### 15. Update Current Guidance And Package Contracts

Update:

- `docs/coordinator-api-mcp.md`
- `docs/agent-lifecycle-flow.md`
- `docs/agent-mcp-setup.md`
- `docs/agent-real-subagent-audit-protocol.md`
- packaged planning skills and policy tests if wait/handoff instructions change

Document that the complete URL/hash handoff is required once per revision, while subsequent unchanged standby calls
must use the compact delta response.

## Regression And Validation Plan

### Requirement Fidelity Fixtures

Add table-driven tests for:

- reminder with optional notes, due date/time, completion, filters, persistence, accessibility, and responsive tests;
- note editor with documents and Markdown;
- todo item with a notes field;
- recipe organizer with notes plus tags/search/favorites;
- dashboard with editable notes;
- API lookup with saved searches;
- ambiguous brief that should return domain candidates or a clarification warning;
- explicit constraints that must not be invented when absent.

For each fixture, assert exact extracted requirements, selected/composed domains, stable task IDs, zero uncovered
explicit requirements, and expected validation-intent coverage.

### MCP Contract Tests

- `planning_session_create` summary response stays under 10,000 serialized characters for the reminder fixture.
- A healthy diagnostic summary stays under 5,000 serialized characters and does not embed the full target list.
- An unchanged `plan_review_loop` delta stays under 1,000 serialized characters.
- No response contains identical `handoffMarkdown` and `requiredUserFacingMessage` payloads.
- `plan_start` summary does not repeat the full plan.
- Full mode preserves complete evidence for troubleshooting.
- Diagnostic receipts invalidate on project or capability fingerprint changes.
- Batch file-evidence upserts return one compact receipt instead of echoing the full draft for every file.
- Validation publish summary stays bounded and does not duplicate the full draft, artifact, and projections.

### Runtime And Projection Tests

- Generated Cucumber config is passed project-relative and loads from target cwd on POSIX and Windows.
- Preflight fails on placeholder binary, missing binary, config-load failure, missing imports, undefined shared steps,
  zero selected cases, and unwritable report output.
- Draft check rejects orphan suite cases, missing locator projections, incompatible global IDs, and cross-plan
  collisions before review.
- Review submit surfaces the same blockers as draft check and cannot introduce a new deterministic projection error.
- Every invalid evidence-health value returns to validation changes and never enables baseline acceptance.
- Baseline review exposes an explicit reject/request-changes action for a late infrastructure failure.

### UI Tests

- Coverage panel shows all extracted reminder requirements.
- Uncovered requirements block exact-revision approval or require an explicit reviewed regeneration/revision path.
- Domain mismatch warnings are keyboard and screen-reader accessible.
- Regeneration creates a higher revision and preserves remarks/history.
- Approval remains bound to the exact revised hash.

### Real Subagent Audit

Repeat the 2026-07-10 reminder fixture from a fresh target and record the protocol evidence. Pass requires:

- reminder-specific tasks and acceptance criteria;
- zero uncovered explicit requirements;
- review-ready, UI approval, `plan_start`, and `validation_preparation_started` lifecycle evidence;
- no implementation before approval;
- at least 70% fewer serialized response characters than the approximately 90,000-character baseline through the
  same lifecycle point;
- no unchanged standby response larger than 1,000 characters;
- no repeated complete handoff after the initial review-ready presentation.
- the empty target receives deterministic reviewed validation infrastructure before baseline;
- the managed baseline emits a real Cucumber report and never executes a placeholder package;
- implementation creates and runs the reminder app only after accepted baseline evidence;
- managed implementation validation reaches `validation_passed` with fresh valid evidence;
- exact completion approval writes `completed`.

Run focused validation first:

```bash
npx vitest run packages/appraisejs/src/mcp.test.ts
npm --prefix packages/appraisejs run test
npm --prefix packages/appraisejs run test:mcp:e2e
npx eslint packages/appraisejs/src/mcp.ts packages/appraisejs/src/mcp.test.ts
npx prettier --check packages/appraisejs/src/mcp.ts packages/appraisejs/src/mcp.test.ts docs/coordinator-api-mcp.md
npm run check:harness
npm run build:appraisejs
```

Run root build and scaffold/template synchronization only when the implemented source or guidance falls within those
scopes.

## Acceptance Criteria

- The reminder audit produces a reminder plan rather than an editor plan.
- Every explicit brief requirement has durable task and validation traceability before review-ready publication.
- Ambiguous classification is visible and recoverable instead of silently resolved by keyword branch order.
- The initial review handoff remains complete and hash/cursor bound.
- Unchanged waits are delta-only and do not repeat the description or handoff.
- The full happy path uses at least 70% fewer serialized response characters than the audit baseline.
- Event read and acknowledgement latency is instrumented, with root cause and an agreed SLO recorded before release.
- Current MCP, lifecycle, setup, audit, and packaged skill guidance matches the implemented response contract.
- Draft check, publish, review submit, preflight, and baseline start agree on suite membership, resource IDs, imports,
  binary selection, and config loading.
- Invalid baseline evidence cannot enter an acceptance-only dead end.
- Validation and baseline UI surfaces show structured action failures and recovery guidance.
- A fresh empty workspace can bootstrap a real pinned runner without `npx` placeholder resolution.
- Focused package tests, MCP E2E, harness checks, formatting, linting, and package build pass.

## Delivery Order

1. Add requirement extraction, classification fixtures, and the coverage validator.
2. Fix reminder/mixed-intent generation and expose bounded assessment evidence.
3. Fix config-path invocation and make preflight execute the real runner contract.
4. Unify draft, projection, review-submit, and baseline-start consistency checks.
5. Add plan-scoped resource IDs, collision previews, and visible review-action errors.
6. Add safe invalid-baseline recovery and block acceptance for invalid evidence health.
7. Add deterministic empty-workspace validation bootstrap.
8. Add shared response projection, batch mutations, and summary/delta/full modes.
9. Make review standby cursor-aware and add diagnostic receipts.
10. Add review UI coverage, warnings, and regeneration.
11. Add response-byte and latency instrumentation.
12. Update current docs, packaged skills, and audit protocol.
13. Run focused tests, live MCP E2E, and the real subagent reminder audit through managed implementation validation
    and completion.

The requirement-fidelity fix should land before response optimization so a cheaper workflow cannot make an incorrect
plan look successful faster.
