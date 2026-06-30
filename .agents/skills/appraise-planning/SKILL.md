---
name: appraise-planning
description: Create and revise an AppraiseJS plan through MCP while preserving human review gates.
---

# Appraise Planning

AppraiseJS owns lifecycle and business rules. This skill only orchestrates MCP calls and user communication.

1. If MCP guidance is not loaded, read `appraise://agent-guide` or ask the user to run `appraisejs agent setup` /
   `npm run setup:agent`, then restart or reconnect the client.
2. If setup text is visible but native MCP tools are missing, inspect `appraisejs agent setup --json`, verify endpoint
   reachability, reconnect, and read `appraise://agent-guide`. If `planning_session_create` or workflow resources are
   still missing, stop and ask the user to reconnect instead of using raw JSON-RPC as the normal path.
3. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
4. Before creating a plan for a new app, choose the target explicitly: pass `targetWorkspacePath` for the writable
   target workspace, or pass `targetMode: "hub"` only when the user knowingly wants a hub-scoped plan.
5. Prefer `planning_session_create` for normal project briefs when available; otherwise create the structured plan with
   `plan_create`.
6. Read pending events at every mandatory checkpoint and capture the returned event sequence.
7. Acknowledge each handled event, then reread pending events before continuing.
8. Prefer `plan_review_loop` when the tool is available; it should keep the agent in an active bounded wait across
   review readiness, approval, change requests, and cancellation. If it is not available, call `plan_wait_for_review`.
9. No wait call before complete URL handoff. Present the returned complete direct browser URL, `appraise://` plan
   link, plan ID, revision, lifecycle, content hash, `currentAfterSequence`, `nextAfterSequence`, and recommended wait
   call only after `plan_review_ready`.
   If `plan_create` returns links but `plan_wait_for_review` is still pending or fails, show the returned plan links
   immediately and clearly label that durable review-ready evidence has not arrived yet.
   Pending review is not completion.
10. Revise only against the current returned hash.
11. After review-ready evidence is shown, call `plan_wait_for_approval` with the latest handled event sequence. Use an
    active bounded wait or poll loop by default.
12. If approval is still pending after a bounded wait, use the returned `nextAfterSequence` for the next bounded wait.
    Return the compact continuation state and links only as a long-review or host-limit fallback when the host cannot
    keep the turn active without spending tokens while idle. Pending approval is not completion.
13. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
    validation artifact generation.
14. On `changes_requested` or `plan_changes_requested`, call `plan_review_read`, revise against the returned hash,
    submit the revision, and repeat the review-ready wait.
15. On `cancelled`, acknowledge and stop.
16. Do not implement while review or approval is pending.
17. Keep historical plan docs as references unless the user names one as the executable task source.

Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
