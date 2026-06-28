# Session 11: Plan Review Change Request Loop

## Goal

Close the plan-review feedback loop so remarks entered in AppraiseJS can be submitted as actionable change requests,
delivered to the coding agent, read through MCP, and revised without relying on chat-only instructions.

## Current Deficiencies

- Plan-review remarks are persisted in the review artifact, but adding a remark does not notify the coordinator agent.
- The plan-review UI has exact-revision approval controls, but no explicit request-changes or submit-review control.
- `plan_wait_for_approval` can recognize `plan_changes_requested`, but plan-review remarks do not currently emit that
  event.
- `plan_read` exposes the plan artifact and content hash, not the review artifact threads, so an agent cannot retrieve
  remarks after the user says remarks were added.
- The review artifact and plan lifecycle can drift from the agent-visible contract: the human sees remarks, while the
  agent sees only an unchanged awaiting-review plan.

## Work

1. Add a plan-review service action that submits open remarks as a change-request decision for the current displayed
   plan revision.
2. Require at least one open blocking remark before requesting changes; keep non-blocking remarks visible but
   insufficient to force a revision by themselves.
3. On request changes, transition the plan lifecycle to `changes_requested`, invalidate any unstarted approval for the
   current revision, sync projections, and append a durable `plan_changes_requested` event with revision and remark
   summary metadata.
4. Add a visible request-changes control to `/plans/[planId]` near exact-revision approval, with disabled states for
   stale projections, graph/list readiness failures, missing blocking remarks, already approved plans, cancelled plans,
   and completed plans.
5. Add an agent-readable review surface through MCP and the coordinator API. Prefer a dedicated `plan_review_read`
   tool and `/plans/:planId/review` endpoint; include review hashes so agents can revise against exact review state.
6. Include enough structured remark data for revision work: thread ID, target, blocking flag, current status, latest
   event body, full event history, actor, created time, and whether the thread is orphaned.
7. Update `plan_wait_for_approval` recovery output so `changes_requested` responses point the agent to read review
   remarks before calling `plan_revise`.
8. Update `plan_revise` guidance and tests so a submitted revision can return the plan from `changes_requested` to
   `awaiting_plan_review` while preserving unresolved remark history for human confirmation.
9. Document the end-to-end contract in coordinator API/MCP docs and the AppraiseJS planning/recovery skills.
10. Sync canonical changes into scaffold templates when route, service, MCP, or docs changes affect generated projects.

## Required Rules

- Adding or editing a remark remains a draft review action; only explicit request changes emits
  `plan_changes_requested`.
- Request changes is a human review decision, not an agent-owned mutation.
- Reading review remarks never acknowledges events and never changes lifecycle.
- `plan_wait_for_approval` remains read-only.
- `plan_changes_requested` must be delivered at least once and acknowledged only after the agent has captured the review
  decision and either revised the plan or intentionally stopped with evidence.
- Exact-revision safety applies to request changes just like approval: the displayed revision and current content hash
  must match.
- Blocking remarks survive revision until the human resolves, dismisses, downgrades, or approves with an explicit
  resolution path.
- Non-blocking remarks may carry forward into later phases and final completion review.
- The plan artifact remains canonical for implementation structure; review remarks stay in the review artifact and are
  exposed through an explicit review contract instead of being embedded into plan tasks.

## Public Contracts

- Add UI action: `Request changes`.
- Add service/action contract for submitting plan-review change requests.
- Add coordinator event payload for `plan_changes_requested`, including `revision`, `reviewHash`, and a compact list of
  blocking remark thread IDs.
- Add coordinator API route `GET /plans/:planId/review` returning the current review artifact summary and hash.
- Add MCP tool `plan_review_read` returning `planId`, current plan revision/lifecycle/content hash, review hash,
  blocking threads, non-blocking threads, orphaned thread IDs, links, and recovery guidance.
- Keep existing `plan_read` behavior compatible; do not silently overload it with a large review payload unless a
  compact review summary is explicitly needed for compatibility.

## Acceptance Criteria

- A user can add a blocking remark, click request changes, and the plan moves to `changes_requested`.
- The coordinator event stream emits `plan_changes_requested` after the lifecycle transition succeeds.
- `plan_wait_for_approval` returns `status: "changes_requested"` for that event and includes the event sequence.
- The agent can call `plan_review_read` and see the exact remark text, target node or plan-wide target, blocking state,
  and review hash.
- `plan_revise` can submit a corrected revision from `changes_requested` back to `awaiting_plan_review` without losing
  remark history.
- The revised plan remains blocked from approval until blocking remarks are resolved, dismissed, downgraded, or handled
  through an explicit approval-time resolution flow.
- Stale displayed revision, stale plan hash, cancelled plans, completed plans, missing blocking remarks, and conflicted
  projections produce actionable errors.
- Existing approval, validation feedback, baseline, implementation, and completion flows continue to pass.

## Validation

- Focused Vitest coverage for plan-review service request-changes behavior, approval invalidation, lifecycle
  transitions, review-thread preservation, and stale hash rejection.
- API-route tests for `/plans/:planId/review` and request-changes mutation errors.
- MCP tests for `plan_review_read`, `plan_wait_for_approval` returning `changes_requested`, event acknowledgement, and
  subsequent `plan_revise`.
- React tests for request-changes button visibility, disabled reasons, keyboard reachability, and graph/list parity.
- Update the MCP E2E smoke to cover create -> review-ready -> add/request changes -> wait returns changes requested ->
  read review -> revise -> review-ready.
- Focused ESLint and Prettier checks for changed files.
- Root build for route/service/MCP changes.
- Template sync and template tests if generated scaffold files are affected.

## Handoff

Provide the review-read schema, request-changes service contract, event payload shape, UI screenshots or browser QA
notes, and an MCP transcript showing the agent receiving `plan_changes_requested`, reading remarks, revising the plan,
and returning to review. Do not broaden this session into validation artifact review or implementation feedback flows.
