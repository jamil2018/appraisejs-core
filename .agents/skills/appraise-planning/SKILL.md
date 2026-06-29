---
name: appraise-planning
description: Create and revise an AppraiseJS plan through MCP while preserving human review gates.
---

# Appraise Planning

AppraiseJS owns lifecycle and business rules. This skill only orchestrates MCP calls and user communication.

1. If MCP guidance is not loaded, read `appraise://agent-guide` or ask the user to run `appraisejs agent setup` /
   `npm run setup:agent`, then restart or reconnect the client.
2. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
3. Prefer `planning_session_create` for normal project briefs when available; otherwise create the structured plan with
   `plan_create`, then call `plan_wait_for_review`.
4. Read pending events at every mandatory checkpoint and capture the returned event sequence.
5. Acknowledge each handled event, then reread pending events before continuing.
6. Present the returned `appraise://` plan link, browser link, revision, lifecycle, and content hash only after
   `plan_review_ready`.
   If `plan_create` returns links but `plan_wait_for_review` is still pending or fails, show the returned plan links
   immediately and clearly label that durable review-ready evidence has not arrived yet.
7. Revise only against the current returned hash.
8. After review-ready evidence is shown, call `plan_wait_for_approval` with the latest handled event sequence.
9. If approval is still pending after that wait, use the returned `nextAfterSequence` for any follow-up wait. Return the
   compact resumable state and links only when the host cannot keep the turn active without spending tokens while idle.
10. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
    validation artifact generation.
11. On `changes_requested` or `plan_changes_requested`, call `plan_review_read`, revise against the returned hash,
    submit the revision, and repeat the review-ready wait.
12. On `cancelled`, acknowledge and stop.
13. Do not implement while approval is pending.
14. Keep historical plan docs as references unless the user names one as the executable task source.

Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
