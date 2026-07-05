# AppraiseJS Agent Lifecycle Hardening

## Summary

Fix the agent-misuse gaps observed while using AppraiseJS MCP from a separate target project. The goal is to make every post-plan lifecycle gate obvious in MCP and UI, and to correct external-target baseline validation so files are checked against the target workspace rather than the Appraise hub checkout.

Existing plan-review standby is mostly in place. This work extends the same machine-actionable contract to validation review, baseline execution, baseline acceptance, and implementation unlock.

## Key Changes

- Add MCP lifecycle tools for the missing gates: `validation_review_loop`, `baseline_start`, `baseline_reconcile`, `baseline_accept`, and `implementation_start`.
- Add baseline support tools when the matching UI action already exists: `baseline_cancel`, `baseline_failure_acknowledge`, and `baseline_regression_justify`.
- Back the new MCP tools with coordinator API routes instead of UI-only server actions, reusing the existing coordinator baseline service behavior.
- Return machine-actionable lifecycle payloads from wait and transition tools: `terminal`, `mustContinue`, `nextRequiredAgentBehavior`, `recommendedWait`, lifecycle, blocking reasons, browser/appraise URLs, event cursor, and next allowed action.
- Tighten pending responses so plan, validation, and baseline waits are never framed as completion.
- Make `implementation_checkpoint` return a specific recovery payload when called before implementation, such as start/accept baseline and then call `implementation_start`.
- Update validation and baseline UI so the primary action for the current lifecycle is visible in the active review context.
- Fix external-target validation file hashing by resolving approved validation file paths against the bound `TargetProject.canonicalPath` when present, falling back to the hub root only for hub-scoped plans.

## Public Interfaces

- Advance the MCP surface version and include the new lifecycle tools in `workflowCriticalTools`.
- Add coordinator API endpoints under `/api/internal/coordinator/plans/:planId/baseline/...` for baseline start, reconcile, cancel, acknowledge, justify, and accept.
- Add an explicit implementation-start endpoint under the existing implementation namespace or another clearly named lifecycle endpoint.
- Extend validation-file drift errors with structured `details.changedFiles[]` entries containing `path`, `resolvedAbsolutePath`, `expectedHash`, `currentHash`, and target metadata when available.

## UI Behavior

- In validation review, rename the submit CTA to make the transition explicit, such as `Approve validation review and continue`.
- After `validations_approved`, show `Start required baselines` prominently in the validation context, not only in the baseline side panel.
- Keep baseline controls visible as the lifecycle advances: reconcile/cancel while running, accept while in baseline review, and unlock implementation after acceptance.
- Make disabled reasons actionable, for example: `Approve todo-workflow, then submit validation review.`

## Test Plan

- Add MCP unit and e2e coverage proving `plan_review_loop` pending responses include `terminal: false`, `mustContinue: true`, and a ready `recommendedWait`.
- Add MCP tests for `validation_review_loop` across pending, `validations_approved`, `validation_changes_requested`, and cancelled or terminal states.
- Add MCP/API tests for baseline start, reconcile, accept, implementation start, and premature `implementation_checkpoint` recovery guidance.
- Add coordinator baseline tests for a target-bound plan whose validation file lives under an external target workspace.
- Cover hash success, hash drift diagnostics, path-escape rejection, and missing target metadata behavior.
- Add UI tests for the validation-to-baseline path: approve required nodes/files, submit validation review, see baseline CTA in the validation context, accept baseline, and see implementation unlock.

## Assumptions

- AppraiseJS remains MCP-first and lifecycle-owned; chat approval must not replace plan, validation, baseline, implementation, or completion gates.
- External target workspaces are first-class planning targets, while Appraise plan/review/validation artifacts may still live in the hub checkout.
- Baseline acceptance remains required before implementation starts.
- Scaffold/template copies must be synced from canonical source with `npm --prefix packages/create-appraisejs run prepare-template` if scaffolded files are affected.
