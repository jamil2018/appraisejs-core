---
name: appraise-planning
description: Create and revise an AppraiseJS plan through MCP while preserving human review gates.
---

# Appraise Planning

AppraiseJS owns lifecycle and business rules. This skill only orchestrates MCP calls and user communication.

1. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
2. Create the structured plan with `plan_create`, then call `plan_wait_for_review`.
3. Read pending events at every mandatory checkpoint and capture the returned event sequence.
4. Acknowledge each handled event, then reread pending events before continuing.
5. Present the returned `appraise://` plan link, browser link, revision, lifecycle, and content hash only after
   `plan_review_ready`.
   If `plan_create` returns links but `plan_wait_for_review` is still pending or fails, show the returned plan links
   immediately and clearly label that durable review-ready evidence has not arrived yet.
6. Revise only against the current returned hash.
7. After review-ready evidence is shown, call `plan_wait_for_approval` with the latest handled event sequence.
8. If approval is still pending after that wait, use the returned `nextAfterSequence` for any follow-up wait. Return the
   compact resumable state and links only when the host cannot keep the turn active without spending tokens while idle.
9. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
   validation artifact generation.
10. On `changes_requested` or `plan_changes_requested`, call `plan_review_read`, revise against the returned hash,
    submit the revision, and repeat the review-ready wait.
11. On `cancelled`, acknowledge and stop.
12. Do not implement while approval is pending.
13. Keep historical plan docs as references unless the user names one as the executable task source.

Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
