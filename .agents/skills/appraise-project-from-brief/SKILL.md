---
name: appraise-project-from-brief
description: Route natural-language project requests through AppraiseJS project discovery, registration, and plan review.
---

# Appraise Project From Brief

AppraiseJS owns lifecycle and business rules. The connected agent turns a natural-language project brief into a
structured plan, then submits it to Appraise without inventing local lifecycle state.

Use this skill when the user asks to use Appraise, create a project using AppraiseJS, build an app with AppraiseJS, or
generate a plan and show it in Appraise. Also use it when continuing feature work in a project that already has an
`.appraisejs/project.json` marker unless the user explicitly opts out.

1. If MCP guidance is not loaded, read `appraise://agent-guide` or ask the user to run `appraisejs agent setup` /
   `npm run setup:agent`, then restart or reconnect the client.
2. If setup text is visible but native MCP tools are missing, inspect `appraisejs agent setup --json`, verify endpoint
   reachability, reconnect, and read `appraise://agent-guide`. If `planning_session_create` or workflow resources are
   still missing, stop and ask the user to reconnect instead of using raw JSON-RPC as the normal path.
3. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
4. For a brand-new app brief, choose the target explicitly before plan creation: pass `targetWorkspacePath` for the
   writable target workspace, or use `targetMode: "hub"` only when the user knowingly wants a hub-scoped plan.
5. If the target project is not registered, call `project_add` for the writable target workspace before creating a
   plan. Empty writable directories are valid planning targets.
6. Treat an existing `.appraisejs/project.json` marker as continuity guidance that future plans go through Appraise.
7. Hand the bound target and brief to `.agents/skills/appraise-planning/SKILL.md`. That canonical planning skill owns
   authoring and review orchestration. Appraise does not infer the task graph. Do not invent a name-derived plan id or
   add fallback tasks in this discovery skill.
8. Prefer `plan_review_loop` when the tool is available; otherwise call `plan_wait_for_review`, then present the
   returned `appraise://` plan link, browser link, revision, lifecycle, and content hash only after
   `plan_review_ready`. Pending review is not completion.
9. After review-ready evidence is shown, call `plan_wait_for_approval` with the latest handled event sequence. Use an
   active bounded wait or poll loop by default.
10. If approval is still pending after a bounded wait, use the returned `nextAfterSequence` for the next bounded wait.
    Return the compact continuation state and links only as a long-review or host-limit fallback when the host cannot
    keep the turn active without spending tokens while idle. Pending approval is not completion.
11. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
    validation artifact generation.
12. On `changes_requested`, call `plan_review_read`, revise against the returned hash, submit the revision, and repeat
    the review-ready wait.
13. On `cancelled`, acknowledge and stop.

Read pending events before registration, before plan creation, before approval handling, and before any resumed work.
Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
