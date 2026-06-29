# Mitigate AppraiseJS Review And Validation Gate Regressions

## Summary

Fix two connected gaps in the current AppraiseJS lifecycle experience:

- Planning agents can enter standby correctly but still fail the user-facing handoff if they do not surface the plan URL, short description, revision, lifecycle, hash, and continuation cursor before waiting.
- Validation review has backend/MCP support, but the plan UI does not expose validation artifacts, validation decisions, file approvals, or a clear path from validation review into baseline execution. Implementation should remain blocked until `baseline_accepted`, not directly from validation approval.

## Findings

- `planning_session_create`, `plan_wait_for_review`, `plan_review_loop`, and `plan_wait_for_approval` already return links/meta in their payloads, but the agent-facing guidance should make "display these before/while waiting" mandatory, not merely recommended.
- The plan page renders `Graph`, `Accessible list`, and `Revisions`; it does not render a dedicated validations tab. The only validation-aware UI is an inspector card focused on baseline execution, and it only appears when `detail.validation` exists.
- `validation_publish` returns `/plans/{planId}?review=validation`, but the page currently has no `review=validation` behavior.
- Validation service transitions the lifecycle to `validations_approved`, while the emitted event is currently `validation_approved` singular. Align this naming or explicitly support both to avoid event-driven agent confusion.
- There should not be a direct "validation approval -> implementation" transition. The correct path is `awaiting_validation_review -> validations_approved -> baseline_running/baseline_review -> baseline_accepted -> in_progress`.

## Key Changes

- Strengthen MCP/agent guidance so every pending standby response includes and instructs agents to present: browser URL, `appraise://` URL, goal/description, revision, lifecycle, content hash, `currentAfterSequence`, `nextAfterSequence`, and recommended wait call.
- Add a first-class validation review surface on the plan page:
  - Open `?review=validation` directly into a `Validations` tab.
  - Show validation nodes, required/optional status, linked task IDs, matrix, executable path, expected failures, and current decision state.
  - Show changed-file evidence with classification, declared/manifest status, hashes, and approval requirement.
  - Add user actions for approve/reject/defer validation nodes, approve flagged files, submit validation review, and submit validation feedback.
- Keep baseline controls separate and only unlock them after `validations_approved`; keep implementation unlock gated by `baseline_accepted`.
- Normalize validation approval events: prefer emitting `validations_approved` to match lifecycle/docs, while accepting legacy `validation_approved` in readers/tests if needed for compatibility.
- Mirror root changes into `packages/create-appraisejs/templates/base` through the scaffold template sync workflow.

## Test Plan

- Unit test MCP standby payloads and guidance for plan creation, review-ready pending, approval pending, and timeout continuation.
- Add UI tests for the `Validations` tab, direct `?review=validation` routing, node decisions, file approvals, validation feedback, and disabled/enabled submit states.
- Add coordinator tests for the corrected validation approval event name and compatibility behavior.
- Add lifecycle/UI tests proving implementation cannot start from `validations_approved` and only unlocks after accepted baseline evidence.
- Run focused validation first: validation service tests, plan review workspace tests, MCP tests, ESLint/Prettier on touched files, then `npm --prefix packages/create-appraisejs run prepare-template`; run `npm run build` if the touched surface stays broad.

## Assumptions

- The mitigation should preserve Appraise-owned lifecycle gates rather than letting chat approval or agent self-reporting replace UI/MCP approval.
- The plan page remains the primary human review surface for both plan and validation review.
- Backward compatibility for existing `validation_approved` events is useful, but new docs and emitted events should converge on `validations_approved`.
