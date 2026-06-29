---
name: appraise-planning-standby
description: Plan projects through AppraiseJS, publish review-ready links, and remain in standby for Appraise-owned approval events.
---

# Appraise Planning Standby

AppraiseJS owns lifecycle and business rules. Use this skill when a user asks to use AppraiseJS, plan this in
Appraise, build this project using Appraise, or generate a plan and show it in Appraise.

1. Discover MCP tools or read `appraise://agent-guide`. If setup is missing, ask the user to run
   `appraisejs agent setup` or `npm run setup:agent`, then restart or reconnect the client.
2. Call `project_diagnostic` first. Stop on blocking diagnostics; do not silently fall back to local files or direct
   database edits.
3. Decide whether the target is the Appraise hub checkout or an external target workspace.
4. For an external target that is not registered, call `project_add`. Empty writable directories are valid planning
   targets; use the returned marker status as routing evidence.
5. Create the plan with `planning_session_create` when available, or with `plan_create` followed by
   `plan_wait_for_review`.
6. Present Appraise and browser links only after durable `plan_review_ready` evidence.
7. After review readiness, call `plan_wait_for_approval` and enter standby. Pending approval is not completion.
8. On `approved`, call `plan_start`; acknowledge only after `validation_preparation_started`.
9. On `changes_requested`, call `plan_review_read`, revise against the expected hash, and return to standby.
10. On `cancelled`, acknowledge the cancellation event and stop.

Never treat chat approval as Appraise approval. Do not implement while approval is pending.
