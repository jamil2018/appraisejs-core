# Agent Lifecycle Flow

Plans and managed lifecycle operations remain bound to their recorded target project. UI selection, URL scope,
cookies, and caller-supplied IDs cannot rewrite that binding; conflicts are rejected. See
`docs/project-ownership-boundary.md`.

When multiple delivered events have been handled in sequence, coordinators should cumulatively acknowledge through
the highest handled sequence. The cumulative operation is idempotent and avoids one request per historical event;
use single-event acknowledgement when later delivered events must remain pending.

Cumulative acknowledgement is serialized per plan with bounded admission. Completion review returns a receipt whose
hash includes the latest plan-event sequence. Completion approval must present that exact hash; stale approvals return
the current hash and receipt so the coordinator can reread and relay a fresh decision.

Agents must use Appraise-owned lifecycle gates. Chat approval can clarify intent, but it does not replace plan,
validation, baseline, implementation, completion, or cancellation transitions.

## Bounded Objectives And Handoffs

Large work is segmented into objectives, milestones, and independently reviewable plans. A plan may contain at most
12 tasks and an objective at most 24 plans. Each plan retains its own lifecycle and coordinator lease; dependency
relationships do not let one plan approve, complete, or mutate another. Impacted-path scopes select focused regression
plans and include downstream dependants.

Use `plan_lifecycle_snapshot` to create content-addressed Appraise-owned state before a long handoff. Use
`plan_continuation_package_create` to attach a bounded agent narrative and validated references to that snapshot.
Continuation packages never replace lifecycle events or approval receipts. Coordination SLO evidence records active
Appraise time, active agent time, and human-review time separately.

## Plan Review

Create or update plans through the Appraise plan surface. Wait for `plan_review_ready`, then use the review URL or
`plan_review_read` to inspect current remarks and hashes. A `plan_changes_requested` event requires reading review
remarks, revising against the expected hash, and waiting for the next approval event.

Agents should use `plan_review_loop` when it is available, because it keeps review readiness, bounded approval waits,
change requests, and cancellation inside one Appraise-owned loop. Without that tool, agents should actively continue
with bounded `plan_wait_for_review` and `plan_wait_for_approval` waits. Compact continuation state is a fallback for
long reviews or host limits, not the default result after publishing links. No wait call before complete URL handoff:
the initial handoff for each revision must present the direct browser URL, `appraise://` URL, plan ID, goal,
description, revision, lifecycle, `planContentHash`, `planStateHash`, `reviewBindingHash`, `currentAfterSequence`,
`nextAfterSequence`, and recommended wait
call. Later waits with no new events return `pending_unchanged` with only the cursor, timing, and next action; they do
not repeat the brief or handoff. Pending review or pending approval is not completion.

## Approval And Validation Preparation

`plan_approved` permits starting validation preparation. A coordinator should acknowledge the approval only after the
transition it permits succeeds. `validation_preparation_started` permits managed Validation AST authoring. Agents call
`validation_ast_check`, then `validation_ast_preview`, obtain exact human review of the preview receipt, and call
`validation_ast_compile`. Compilation projects canonical entities and creates the durable managed publication operation.
Managed execution uses only the exact Appraise-owned immutable runtime capsule; it never writes or executes target
`automation/` files.

Validation authoring is registry-first through the managed action catalog and locator graph. Extensions require exact
review evidence; target file paths are never managed execution authority.

Draft check, publication, and runtime preflight share one locator-binding rule: every locator-bearing parameter must
resolve to exactly one locator in the projected validation resources, and that locator must belong to a declared
locator group. Missing, duplicate, stale, or mismatched ID/name bindings block validation review with the validation,
case, step, requested locator, and a corrective locator lookup action.

## Validation Review

Validation review readiness is receipt-backed. The plan artifact and projection may enter
`awaiting_validation_review` only when the latest publish journal is `review_ready`, the exact validation/review
artifact hashes match, the canonical validation projection matches, and the operation owns one
`validation_review_ready` event. Coordinator waits and the review UI report `integrity_blocked` and hide approval
controls when any representation disagrees. A staged `prepared`, `artifacts_written`, or `projected` operation may be
resumed only through the exact `validation_ast_compile` receipt; non-repairable conflicts remain blocked with their
historical evidence intact.

Validation feedback must be routed by scope. Product-scope or plan-scope feedback reopens plan review. Validation
artifact feedback reopens validation review. `validations_approved` is required before baseline execution proceeds;
older `validation_approved` events may exist in in-flight streams, but new events should use the plural lifecycle name.
The validation review handoff should include the direct validation review URL, `appraise://` URL, lifecycle, revision,
validation artifact path, validation count, changed-file count, manifest paths, reused registry/template step paths,
new custom step paths, and the next review action.

## Baseline

Baseline execution evidence must be visible and accepted before implementation starts. `baseline_accepted` is the gate
that unlocks task implementation. File hash drift or stale validation evidence should block progression until rerun or
explicitly resolved.

Invalid baseline evidence is repairable without accepting or deleting history. `baseline_retry` is hash-bound to the
current validation artifact, rejects active runs, preserves prior attempts and TestRun links, and returns
`baseline_review` to `validation_changes_requested` for a fresh exact review. The UI exposes the same operation as
"Repair validation and rerun baseline" and disables baseline acceptance while invalid evidence is present.

Normal baseline execution is agent-owned through MCP: after `validations_approved`, the connected agent calls
`baseline_start` and continues with `baseline_reconcile` until baseline review is ready. The Appraise UI should present
read-only guidance for those mechanical transitions rather than competing buttons. Human/Appraise UI ownership remains
with baseline decisions and interrupts: cancelling active baseline runs, acknowledging unrelated failures, justifying
accepted regression-pass evidence, and accepting complete baseline evidence.

When a baseline is intentionally red before implementation, the managed Validation AST must declare `expectedFailures`
for the exact browser/environment matrix entry. Entries preserve legacy baseline semantics: `signature` is matched in
`order`, and `lastPassingStepId` names the AST step that must pass before the expected product failure. Use `null` only
when the expected failure occurs at the first scenario step. Expected red evidence remains review-bound and must not be
converted into an unrelated-failure acknowledgement.

Baseline TestRun display names include the durable attempt ordinal. Replaying an active content-bound preparation
reuses its existing TestRun, while a repaired and reapproved validation advances the ordinal and receives a distinct
name without deleting or renaming historical evidence.

Baseline start responses report whether execution was newly created or idempotently reused, list active attempt and
canonical TestRun IDs, state whether reconciliation is legal, and provide the exact next allowed action. Legacy name
conflicts may reuse only a TestRun already bound to the same plan and target project. Unsafe legacy collisions return
the existing run identity and an Appraise-owned repair action instead of a generic name-validation error.

## Implementation

Tasks move through `pending`, `in_progress`, `implemented`, and `verified`. Dependencies must be verified before a
dependent task starts. Poll before and after task groups, before validation, and before completion. Blocking feedback
pauses affected tasks and dependents until impact is confirmed and applied.

Pause, resume, and cancellation are lifecycle transitions. Cancellation is terminal after acknowledgement.

Reviewed managed validation nodes execute baseline and implementation from the exact Appraise-owned runtime capsule bound
to their publish operation. Mixed validation artifacts keep legacy nodes on legacy runtime inputs without copying them
into capsule requests. Capsule preparation is idempotent by its durable preparation key; concurrent/crash replay reuses
the queued or running TestRun, while an explicit retry receives the next ordinal. Passing lifecycle evidence requires
valid managed evidence.

Capsule attempts move through prepared/start/running to a terminal state under owner-token guards. Cancellation before
or during spawn prevents late registration; cancellation of a running attempt terminates the registered process when
present and reconciles durable attempt/TestRun state. Missing process registration, blocked preflight, and corrupt
evidence are recovered through bounded `test_run_diagnose` actions rather than raw process or filesystem inspection.

Implementation start is also agent-owned: once baseline evidence is accepted, the connected agent calls
`implementation_start` through MCP. Required implementation validations should follow
`implementation_validation_start -> test_run_preflight -> bound test_run -> test_run_read or test_run_diagnose ->
implementation_validation_reconcile -> implementation_completion_review`.
`implementation_validation_record` is only for exceptional manual evidence and is reduced assurance; required runtime
validations need fresh managed Appraise `TestRun` evidence with `evidenceHealth: valid` before completion can pass.

`implementation_validation_reconcile` may receive `verifyTaskIds` with an `idempotencyKey`. In that combined mode,
Appraise reconciles managed runs and verifies only implemented tasks whose required validations have fresh, passing,
full-assurance evidence in one artifact compare-and-write. Replaying the key does not duplicate state or events.
If later task verification makes the preserved evidence completion-ready, replaying that reconciliation key repairs
the lifecycle to `validation_passed` and emits the gate event exactly once; the idempotency receipt remains unchanged.

## Ownership Matrix

## Bounded delegation

An isolated coordinator may create a target-bound plan without inheriting the parent transcript when Appraise issues
a durable delegation receipt. The receipt binds parent and recipient coordinator IDs, target and canonical-path
fingerprints, purpose, explicit permissions and prohibitions, optional plan hash, expiry, and nonce. Each operation is
consumed durably; replay, expiry, revocation, recipient mismatch, and target mismatch fail closed. A planning receipt
with `plan_create` does not authorize validation preparation, baseline execution, or implementation. Those phases
still require explicit delegated permissions and the ordinary Appraise-owned review events.

## Ownership Matrix

Baseline reconciliation derives `nextAllowedAction` after persisting the final lifecycle transition. A harness failure
that moves the plan to `validation_changes_requested` directs the agent to read, repair, and republish the validation
draft; it must never recommend another `baseline_reconcile` call after that transition.

| Surface                                                                        | Normal owner     | Notes                                                           |
| ------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| Plan approval and change requests                                              | User/Appraise UI | MCP decision tools only relay explicit Appraise/user decisions. |
| Validation evidence decisions, file approvals, feedback, and review submission | User/Appraise UI | Review authority stays human-owned.                             |
| Validation preparation and publish                                             | Agent/MCP        | Mechanical preparation after plan approval.                     |
| Baseline start and reconcile                                                   | Agent/MCP        | Invalid evidence health is harness or infrastructure evidence.  |
| Baseline acceptance, failure acknowledgement, and regression justification     | User/Appraise UI | MCP tools relay explicit user decisions when used.              |
| Implementation start, checkpoints, task state, and validation reconciliation   | Agent/MCP        | Implementation validation reconciles from real `TestRun` rows.  |
| Final completion approval                                                      | User/Appraise UI | MCP completion approval must relay explicit final sign-off.     |

## Final Validation And Completion

Completion requires fresh passing required validations with `evidenceHealth: valid`, required tasks verified,
protected evidence, and a completion review. A passing validation matrix emits `validation_passed`; it does not
complete the plan. Only explicit final user approval writes final sign-off, emits `completed`, and releases evidence
protection.

The plan review Approval tab renders **Approve final completion** only while lifecycle is `validation_passed` and the
current completion receipt is ready. The user must explicitly confirm intent, and the server action submits the exact
displayed evidence hash. A concurrent event or artifact change rejects the stale hash and leaves the plan incomplete
until the refreshed receipt is reviewed and confirmed again.

Repository export is independently policy-controlled. Disabled and optional exports never block completion. Required
export blocks only until a project-bound receipt exists for the exact reviewed validation hash; managed TestRun
evidence never depends on repository export files.

## Reporting Evidence

Reports should distinguish backend/service approval from browser/UI approval. If a run used API or service calls only,
say that plainly and do not imply a human used the browser flow.

## Project-scoped authored resources

Agent-authored project resources inherit the plan projection's `targetProjectId`. Context discovery returns only
modules, suites, cases, Step Blocks, locator groups, locators, and environments owned by that project, together with
the global shared Template Step library. Resource proposals and canonical publication write the project ID onto
created project roots, may reference shared Template Step Groups, and reject cross-project references or ID
collisions for project-owned entities. Coordinator callers must not use global lookup as a fallback for scoped entity
types.
