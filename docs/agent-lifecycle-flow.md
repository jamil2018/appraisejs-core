# Agent Lifecycle Flow

Agents must use Appraise-owned lifecycle gates. Chat approval can clarify intent, but it does not replace plan,
validation, baseline, implementation, completion, or cancellation transitions.

## Plan Review

Create or update plans through the Appraise plan surface. Wait for `plan_review_ready`, then use the review URL or
`plan_review_read` to inspect current remarks and hashes. A `plan_changes_requested` event requires reading review
remarks, revising against the expected hash, and waiting for the next approval event.

Agents should use `plan_review_loop` when it is available, because it keeps review readiness, bounded approval waits,
change requests, and cancellation inside one Appraise-owned loop. Without that tool, agents should actively continue
with bounded `plan_wait_for_review` and `plan_wait_for_approval` waits. Compact continuation state is a fallback for
long reviews or host limits, not the default result after publishing links. Every standby handoff should present the
browser URL, `appraise://` URL, goal, description, revision, lifecycle, content hash, `currentAfterSequence`,
`nextAfterSequence`, and recommended wait call before the agent waits again. Pending review or pending approval is not
completion.

## Approval And Validation Preparation

`plan_approved` permits starting validation preparation. A coordinator should acknowledge the approval only after the
transition it permits succeeds. `validation_preparation_started` marks the validation file generation phase.

## Validation Review

Validation feedback must be routed by scope. Product-scope or plan-scope feedback reopens plan review. Validation
artifact feedback reopens validation review. `validations_approved` is required before baseline execution proceeds;
older `validation_approved` events may exist in in-flight streams, but new events should use the plural lifecycle name.

## Baseline

Baseline execution evidence must be visible and accepted before implementation starts. `baseline_accepted` is the gate
that unlocks task implementation. File hash drift or stale validation evidence should block progression until rerun or
explicitly resolved.

## Implementation

Tasks move through `pending`, `in_progress`, `implemented`, and `verified`. Dependencies must be verified before a
dependent task starts. Poll before and after task groups, before validation, and before completion. Blocking feedback
pauses affected tasks and dependents until impact is confirmed and applied.

Pause, resume, and cancellation are lifecycle transitions. Cancellation is terminal after acknowledgement.

## Final Validation And Completion

Completion requires fresh passing required validations, required tasks verified, protected evidence, and a completion
review. A passing validation matrix emits `validation_passed`; it does not complete the plan. Only explicit final user
approval writes final sign-off, emits `completed`, and releases evidence protection.

## Reporting Evidence

Reports should distinguish backend/service approval from browser/UI approval. If a run used API or service calls only,
say that plainly and do not imply a human used the browser flow.
