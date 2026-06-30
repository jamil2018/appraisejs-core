---
name: appraise-planning-standby
description: Plan projects through AppraiseJS, publish review-ready links, and remain in standby for Appraise-owned approval events.
---

# Appraise Planning Standby

AppraiseJS owns lifecycle and business rules. Use this skill when a user asks to use AppraiseJS, plan this in
Appraise, build this project using Appraise, or generate a plan and show it in Appraise.

1. Discover MCP tools or read `appraise://agent-guide`. If setup is missing, ask the user to run
   `appraisejs agent setup` or `npm run setup:agent`, then restart or reconnect the client.
2. If setup text is visible but native MCP tools are missing, inspect `appraisejs agent setup --json`, verify endpoint
   reachability, reconnect, and read `appraise://agent-guide`. If `planning_session_create` or workflow resources are
   still missing, stop and ask the user to reconnect instead of using raw JSON-RPC as the normal path.
3. Call `project_diagnostic` first. Stop on blocking diagnostics; do not silently fall back to local files or direct
   database edits.
4. Decide whether the target is the Appraise hub checkout or an external target workspace. For a brand-new app brief,
   pass `targetWorkspacePath` for the writable target workspace, or pass `targetMode: "hub"` only when the user
   knowingly wants a hub-scoped plan.
5. For an external target that is not registered, call `project_add`. Empty writable directories are valid planning
   targets; use the returned marker status as routing evidence.
6. Create the plan with `planning_session_create` when available, or with `plan_create`.
7. Prefer `plan_review_loop` when the tool is available. Otherwise call `plan_wait_for_review`, then present Appraise
   and browser links only after durable `plan_review_ready` evidence. Pending review is not completion.
8. After review readiness, call `plan_wait_for_approval` with an active bounded wait or poll loop by default, then
   enter standby. Pending approval is not completion.
9. If approval is still pending after a bounded wait, use the returned `nextAfterSequence` for the next bounded wait.
   Return compact continuation state only as a long-review or host-limit fallback. No wait call before complete URL
   handoff: before entering or continuing standby, present the complete direct browser URL, `appraise://` URL, plan ID,
   goal, description, revision, lifecycle, content hash, `currentAfterSequence`, `nextAfterSequence`, and recommended
   wait call so a later turn can resume the same wait.
10. On `approved`, call `plan_start`; acknowledge only after `validation_preparation_started`.
11. On `changes_requested`, call `plan_review_read`, revise against the expected hash, and return to standby.
12. On `cancelled`, acknowledge the cancellation event and stop.

Never treat chat approval as Appraise approval. Do not implement while review or approval is pending.
