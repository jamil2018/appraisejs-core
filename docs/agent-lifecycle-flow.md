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

Before planning, call `project_diagnostic` with the current task's observed tools and resources plus the intended
workspace. Appraise records the resulting four-layer preflight as a content-addressed receipt and exposes it from the
Projects UI. Only a receipt whose application/identity, active transport, current-task capabilities, and target
binding are all ready certifies lifecycle entry; a browser view never fills in observations the MCP client omitted.

## Bounded Objectives And Handoffs

Large work is segmented into objectives, milestones, and independently reviewable plans. A plan may contain at most
12 tasks and an objective at most 24 plans. Each plan retains its own lifecycle and coordinator lease; dependency
relationships do not let one plan approve, complete, or mutate another. Impacted-path scopes select focused regression
plans and include downstream dependants.

Use `plan_lifecycle_snapshot` to create content-addressed Appraise-owned state before a long handoff. Use
`plan_continuation_package_create` to attach a bounded agent narrative and validated references to that snapshot.
Continuation packages never replace lifecycle events or approval receipts. Coordination SLO evidence records active
Appraise time, active agent time, and human-review time separately.

The plan review workspace shows the same lifecycle as a five-stage progress rail and names the next actor and action.
Its project-bound command center also consolidates blocking issues, active baseline identity, the exact review URL,
and the recovery surface, so operators do not need to infer the current gate from raw events.
Its copy-continuation control emits a compact JSON handoff with the target project, plan ID, lifecycle, revision,
current hashes, latest event cursor, scoped review URL, and next action. This clipboard package is a convenience for
agent handoff; durable continuation still uses the snapshot and continuation-package MCP tools.

## Plan Review

Create or update plans through the Appraise plan surface. Wait for `plan_review_ready`, then use the review URL or
`plan_review_read` to inspect current remarks and hashes. A `plan_changes_requested` event requires reading review
remarks, revising against the expected hash, and waiting for the next approval event.
Each submitted revision emits a revision-bound `plan_review_ready` event for the current content hash. Historical or
acknowledged review-ready events from earlier revisions do not satisfy this gate.

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
Preview records a bounded, hash-bound plan event, and the browser review surface shows proposed scenarios, operations,
coverage claims, and semantic warnings before compile. This preview is advisory: the Appraise-owned validation approval
gate remains the persisted post-compile UI review.
That persisted review renders the canonical Gherkin projection, selected action and locator identities, scenarios,
runtime matrix, and the immutable AST, context, preview, receipt, projection, and runtime-input hashes before any
managed execution begins.
Managed execution uses only the exact Appraise-owned immutable runtime capsule; it never writes or executes target
`automation/` files.

Successful compilation returns the exact project-scoped `review=validation` browser link and the Appraise resource
link directly, so the agent can hand off the review gate without another plan read.

Validation authoring is registry-first through the unified Step Definition catalog and locator graph. The actionable
identity is the exact versioned Step Reference. Ready Step Definitions are globally shared; project-specific behavior
remains a reviewed extension and is not silently promoted into the shared library.
Search uses the complete content-addressed ready-definition index, with parameter and plan-aware ranking; no caller
may rely on a partial SQL text filter. Agent-created drafts persist fresh, bounded search evidence and a reuse
receipt. Agent-authored Validation AST submissions likewise bind the exact `stepDefinitionSelections` receipt IDs and
correlations returned by discovery; their sorted evidence hash is retained through check, preview, compile,
publication, and runtime telemetry even if another search occurs for the plan. A human submission without selected
agent evidence uses only the
stable internal `plan:<planId>` correlation and is never relabelled from an agent search receipt.
justification before the human-only review/publish/deprecate boundary.
Use the lower-level `operation_search` and `operation_read` to inspect an exact semantic operation, then the
allowlisted structured locator/page fallback, and only then a justified custom operation for application-specific
behavior or a documented catalog gap. See `docs/reusable-playwright-step-definitions.md`.
Extensions require exact review evidence; target file paths are never managed execution authority.
Reusable-resource ranking gives ordered phrase matches and exact parameter names priority over loose token overlap.
The simple happy-path authoring profile also requires explicit assertions for a clean browser console/page runtime and
for the absence of failed requests or HTTP error responses.

Draft check, publication, and runtime preflight share one locator-binding rule: every locator-bearing parameter must
resolve to exactly one locator in the projected validation resources, and that locator must belong to a declared
locator group. Missing, duplicate, stale, or mismatched ID/name bindings block validation review with the validation,
case, step, requested locator, and a corrective locator lookup action.

## Validation Review

Validation review uses two hash domains. The publish operation protects immutable compiled validation, review, and
projection content. Node decisions, file approvals, and review submission advance a separate current-review-state
receipt. Each node decision returns its refreshed `reviewBinding`, including the current `reviewStateHash`, in the
same response, so normal callers do not perform a separate reconciliation round trip. Validation submission must
present that exact current receipt. A legitimate review decision therefore cannot invalidate compile-time publication
integrity.

Coordinator waits and the review UI report `integrity_blocked` and hide approval controls when either immutable
content or the current receipt disagrees. A staged `prepared`, `artifacts_written`, or `projected` operation resumes
through its exact `validation_ast_compile` receipt. A `review_ready` operation whose immutable content is intact may
use the idempotent `validation_review_reconcile` action to refresh only its current review-state receipt; history and
the original publication receipt remain unchanged.

Publish recovery accepts an artifact that still has the operation's expected pre-write hash or already has the exact
desired hash recorded by that operation. This makes a crash after the plan artifact write replay-safe. Legacy
validation projections that predate `partialAcknowledgement` persistence are repaired only when their immutable
projection matches exactly after removing that field; the acknowledgement is then restored from the signed AST
projection. Other immutable-content mismatches remain blocked.

Validation feedback must be routed by scope. Product-scope or plan-scope feedback reopens plan review. Validation
artifact feedback reopens validation review. `validations_approved` is required before baseline execution proceeds;
older `validation_approved` events may exist in in-flight streams, but new events should use the plural lifecycle name.
The validation review handoff should include the direct validation review URL, `appraise://` URL, lifecycle, revision,
validation artifact path, validation count, changed-file count, manifest paths, reused Step Definition references,
new custom step paths, and the next review action.

Explicit non-deferred requirements must have reviewable coverage mappings. `uncovered` blocks review. `partial`
requires an exact human acknowledgement describing the missing capability. The standard browser catalog includes
keyboard/focus, checked/value/text/absence assertions, viewport changes, and horizontal-overflow checks.

## Baseline

Baseline execution evidence must be visible and accepted before implementation starts. `baseline_accepted` is the gate
that unlocks task implementation. File hash drift or stale validation evidence should block progression until rerun or
explicitly resolved.

Invalid baseline evidence and expected-signature mismatches are repairable without accepting or deleting history.
`baseline_retry` is hash-bound to the current validation artifact, rejects active runs, preserves prior attempts and TestRun links, and returns
`baseline_review` to `validation_changes_requested` for a fresh exact review. The UI exposes the same operation as
"Repair validation and rerun baseline" and disables baseline acceptance while invalid evidence is present.

Normal baseline execution is agent-owned through MCP: after `validations_approved`, the connected agent calls
`baseline_start` and continues with `baseline_reconcile` until baseline review is ready. The Appraise UI should present
read-only guidance for those mechanical transitions rather than competing buttons. Human/Appraise UI ownership remains
with baseline decisions and interrupts: cancelling active baseline runs, acknowledging unrelated failures, justifying
accepted regression-pass evidence, and accepting complete baseline evidence.

Before creating baseline TestRuns, `baseline_start` checks loopback environment reservations and probes the served page
identity. An explicitly configured expected page title must match. A title matching a different registered target is a
conflict even without an explicit title. The diagnostic offers a free replacement local port when available; agents
must update or repropose the environment rather than running against an unrelated application.
The same reservation-aware replacement is returned during validation-resource proposal, so greenfield authoring can
recover with the exact `suggestedBaseUrl` instead of guessing ports before baseline.

When a baseline is intentionally red before implementation, the managed Validation AST must declare `expectedFailures`
for the exact browser/environment matrix entry. Entries preserve legacy baseline semantics: each approved `signature`
is matched as an ordered fragment of the observed failure line, and `lastPassingStepId` names the AST step that must
pass before the expected product failure. Use `null` only
when the expected failure occurs at the first scenario step. Expected red evidence remains review-bound and must not be
converted into an unrelated-failure acknowledgement.

Compilation projects `lastPassingStepId` to the stable executable step identity sealed into the validation artifact.
Baseline reconciliation maps passed Cucumber step names back to that identity before classification. AST step IDs are
therefore globally unique within a validation, including across scenarios; duplicate IDs fail validation instead of
creating an ambiguous expected-red boundary.

An observed expected-product failure is not accepted implicitly. The reviewer acknowledges the exact attempt and
signature hash after comparing its evidence with the ordered approved signatures. Changed evidence invalidates that
acknowledgement. The review UI also states the classified root cause, only allowed next action, and retry consequences;
repair keeps prior attempts and TestRuns immutable while reopening validation approval and runtime projection.

Baseline TestRun display names include the durable attempt ordinal. Replaying an active content-bound preparation
reuses its existing TestRun, while a repaired and reapproved validation advances the ordinal and receives a distinct
name without deleting or renaming historical evidence.

Baseline start responses report whether execution was newly created or idempotently reused, list active attempt and
canonical TestRun IDs, state whether reconciliation is legal, and provide the exact next allowed action. Legacy name
conflicts may reuse only a TestRun already bound to the same plan and target project. Unsafe legacy collisions return
the existing run identity and an Appraise-owned repair action instead of a generic name-validation error.

Lifecycle health includes both baseline and implementation managed-run counts. A baseline attempt that remains active
after its TestRun becomes terminal is unhealthy with a baseline-reconciliation recovery action; missing baseline rows
are reported as orphaned instead of being omitted from an otherwise healthy response.

## Implementation

Execution edges are directional: `A blocks B` means A must be verified before B can start, while `A depends-on B`
means B must be verified before A can start. `relates-to` never affects task eligibility.

Managed implementation validation starts its runtime capsules automatically. Replaying the start operation reuses
content-bound active runs; agents reconcile the returned implementation run IDs and do not invoke `test_run` again.
The reconcile tool accepts either each returned implementation run `id` or its public `testRunId`. Evidence reads for
target-bound runs include `planId` so the client derives the authoritative target scope rather than the hub scope.
Reconciliation treats queued and running TestRuns as non-terminal and does not read or parse their final report
artifacts until evidence finalization has completed.

Tasks move through `pending`, `in_progress`, `implemented`, and `verified`. Dependencies must be verified before a
dependent task starts. Poll before and after task groups, before validation, and before completion. Blocking feedback
pauses affected tasks and dependents until impact is confirmed and applied.

Group approval returns runnable task IDs and points directly to `implementation_task_update`; it satisfies the group
entry checkpoint and does not require a second `before_group` call. Task conflicts include structured blocker records
with stable codes, the blocked task or predecessor/group, required and actual status, and one exact recovery action.

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
`implementation_start` through MCP. Required implementation validations follow
`implementation_validation_start -> test_run_read or test_run_diagnose -> implementation_validation_reconcile ->
implementation_completion_review`; start creates and launches the managed capsules, so agents do not issue a second
`test_run` call. Before `implementation_validation_start`, call `implementation_validation_readiness` with
`action: "check"` to verify the reviewed origins without consuming a TestRun. If an approved loopback environment is
unavailable, `action: "launch"` may start the registered target through its known `dev` or `start` package script
without a shell and recheck it on macOS or Linux. Appraise owns the launched process group, stops it during normal hub
process exit on a best-effort basis, and exposes `action: "stop"` for required explicit cleanup after validation.
Forced hub termination or restart can lose in-memory ownership, in which case the operator must stop the target
manually. Windows, unsupported package scripts, and remote targets require a manual launch; remote reviewed
environments remain not ready until their exact environment IDs are supplied as `confirmedRemoteEnvironmentIds` after
an external reachability check. Managed validation should not be used as the first check that the implementation
server was never started.
`implementation_validation_record` is only for exceptional manual evidence and is reduced assurance; required runtime
validations need fresh managed Appraise `TestRun` evidence with `evidenceHealth: valid` before completion can pass.

`implementation_validation_reconcile` may receive `verifyTaskIds` with an `idempotencyKey`. In that combined mode,
Appraise reconciles managed runs and verifies only implemented tasks whose required validations have fresh, passing,
full-assurance evidence in one artifact compare-and-write. Replaying the key does not duplicate state or events.
If later task verification makes the preserved evidence completion-ready, replaying that reconciliation key repairs
the lifecycle to `validation_passed` and emits the gate event exactly once; the idempotency receipt remains unchanged.
Reconciling passing managed evidence without task verification does not classify the plan as `failed_validation`;
the plan remains in its current implementation/validation lifecycle with task-verification blockers until an atomic
or later verification step satisfies completion readiness. `failed_validation` is reserved for evidence failures.

Project-scoped review URLs use `review=validation`, `review=baseline`, and `review=implementation` to open the exact
validation, baseline, and final-completion review panels respectively. Agents should hand off those returned deep
links instead of requiring users to locate the gate manually. The UI also accepts `review=completion` as a defensive
alias for completion handoffs, while coordinator responses should continue returning the canonical
`review=implementation` form.

Once final implementation evidence exists, the baseline panel shows a per-validation delta from the latest baseline
attempt to the final managed run, including baseline classification, final status, and assurance. This comparison is
review guidance only; canonical attempts and implementation runs remain the evidence authority.

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

The completion review receipt exports a bounded efficiency snapshot grouped by lifecycle phase. Each phase reports
duration, wait time, retries, tool calls, response bytes, and recovery cost, with the event sequence at capture time.
This diagnostic snapshot is intentionally outside the approval evidence hash so recording or reading telemetry cannot
make an otherwise unchanged completion approval stale.

If the UI records final sign-off before a connected agent relays `implementation_complete`, replaying the exact signed
completion evidence hash is idempotent and returns the existing terminal artifacts without duplicating events or
changing the original approver. A different hash fails with the already-completed sign-off identity and hash.

Repository export is independently policy-controlled. Disabled and optional exports never block completion. Required
export blocks only until a project-bound receipt exists for the exact reviewed validation hash; managed TestRun
evidence never depends on repository export files.

Final approval first records a durable private completion transaction beside the plan artifacts. Its
validation, review, projection-sync, completion-event, and terminal-plan writes are replay-safe, and completion reads
or repeated approval resume interrupted work. The terminal `completed` plan write happens only after the exact final
sign-off and `plan_completed` event exist. Evidence protection may then be released: immutable managed TestRun
identities, evidence URLs, artifact hashes, and sign-off hashes remain the signed-off completion proof.
The completion event keeps the prior event hash in `previousStateHash` and binds `stateHash` to the resulting
`completed` plan state, even though the crash-safe journal event is written before the terminal plan artifact.

## Reporting Evidence

Reports should distinguish backend/service approval from browser/UI approval. If a run used API or service calls only,
say that plainly and do not imply a human used the browser flow.

## Certification and local efficiency evidence

Run `npm run certify:plan-builder` to execute the representative greenfield-publication and existing-project managed
runtime-capsule lifecycle cases. The command writes a content-addressed `LifecycleCertificationReceipt` containing
the matrix, outcome, duration, and current Git commit. Both passing and failing runs are retained so the latest state
does not erase earlier certification evidence.

The coordinator POST boundary records plan-scoped operation metrics after producing the lifecycle response. Metrics
include phase, duration, wait time, retry count, tool-call count, request and response size, and recovery cost. Storage
is local-only and bounded to the latest 500 operations per plan; telemetry errors are logged but never replace the
Appraise-owned operation response. The plan review command center presents the latest certification and aggregated
per-phase metrics.

## Activity, notifications, provenance, and revision impact

The plan surface derives live activity only from durable lifecycle state: current phase, latest event sequence and
type, bounded five-stage progress, wait owner, and exact next action. It never displays or persists private agent
reasoning. Coordinator event reads also include notification projections for review readiness, requested changes,
approvals, blocked attempts, recovery/review readiness, and required completion sign-off. Notifications retain their
source event sequence, so clients acknowledge the event rather than a parallel notification state.

The evidence timeline correlates plan revisions and events, Validation AST publication receipts, baseline attempts,
implementation TestRuns, checkpoints, completion evidence, and delegated operation receipts. Revision-impact analysis
compares the current plan revision/source identity with validation revision/base identity and marks validations,
selected resources, approvals, baseline evidence, implementation groups, or orphaned remarks stale as appropriate.

Delegated coordinator verification writes a replay-safe `DelegatedCoordinatorConsumption` for every bounded
operation. The plan surface deterministically content-addresses each consumption with its signed parent authorization,
recipient, permission, operation key, and consumption time; this is the attached delegated operation receipt.

## Project-scoped authored resources

Agent-authored project resources inherit the plan projection's `targetProjectId`. Context discovery returns only
modules, suites, cases, locator groups, locators, and environments owned by that project, together with
the global shared Step Definition library. Resource proposals and canonical publication write the project ID onto
created project roots, may reference shared Step Definition groups, and reject cross-project references or ID
collisions for project-owned entities. Project-owned names, including locator-group names, are unique within a target
project rather than across the Appraise hub. Coordinator callers must not use global lookup as a fallback for scoped
entity types.
