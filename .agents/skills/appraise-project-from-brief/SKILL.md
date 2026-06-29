---
name: appraise-project-from-brief
description: Route natural-language project requests through AppraiseJS project discovery, registration, and plan review.
---

# Appraise Project From Brief

AppraiseJS owns lifecycle and business rules. This skill turns a natural-language project brief into an Appraise-owned
plan without inventing local lifecycle state.

Use this skill when the user asks to use Appraise, create a project using AppraiseJS, build an app with AppraiseJS, or
generate a plan and show it in Appraise. Also use it when continuing feature work in a project that already has an
`.appraisejs/project.json` marker unless the user explicitly opts out.

1. If MCP guidance is not loaded, read `appraise://agent-guide` or ask the user to run `appraisejs agent setup` /
   `npm run setup:agent`, then restart or reconnect the client.
2. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
3. If the target project is not registered, call `project_add` for the writable target workspace before creating a
   plan. Empty writable directories are valid planning targets.
4. Treat an existing `.appraisejs/project.json` marker as continuity guidance that future plans go through Appraise.
5. Prefer `planning_session_create` when available; otherwise create the structured plan with `plan_create`. Do not
   invent a name-derived plan id.
6. Call `plan_wait_for_review`, then present the returned `appraise://` plan link, browser link, revision, lifecycle,
   and content hash only after `plan_review_ready`.
7. After review-ready evidence is shown, call `plan_wait_for_approval` with the latest handled event sequence.
8. If approval is still pending after that wait, use the returned `nextAfterSequence` for any follow-up wait. Return the
   compact resumable state and links only when the host cannot keep the turn active without spending tokens while idle.
9. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
   validation artifact generation.
10. On `changes_requested`, call `plan_review_read`, revise against the returned hash, submit the revision, and repeat
    the review-ready wait.
11. On `cancelled`, acknowledge and stop.

Read pending events before registration, before plan creation, before approval handling, and before any resumed work.
Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
