---
name: appraise-project-from-brief
description: Route natural-language project requests through AppraiseJS project discovery, registration, and plan review.
---

# Appraise Project From Brief

AppraiseJS owns lifecycle and business rules. This skill turns a natural-language project brief into an Appraise-owned
plan without inventing local lifecycle state.

Use this skill when the user asks to use Appraise, create a project using AppraiseJS, build an app with AppraiseJS, or
continue feature work in a project that already has an `.appraisejs/project.json` marker unless the user explicitly
opts out.

1. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
2. If the target project is not registered, call `project_add` for the writable target repo before creating a plan.
3. Treat an existing `.appraisejs/project.json` marker as continuity guidance that future plans go through Appraise.
4. Create the structured plan with `plan_create`; do not invent a name-derived plan id.
5. Call `plan_wait_for_review`, then present the returned `appraise://` plan link, browser link, revision, lifecycle,
   and content hash only after `plan_review_ready`.
6. After review-ready evidence is shown, call one `plan_wait_for_approval` long poll.
7. If approval is still pending after that wait, return the compact resumable state and links so the host can wake or
   resume later without spending tokens while idle.
8. On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
   validation artifact generation.
9. On `changes_requested`, call `plan_review_read`, revise against the returned hash, submit the revision, and repeat
   the review-ready wait.
10. On `cancelled`, acknowledge and stop.

Read pending events before registration, before plan creation, before approval handling, and before any resumed work.
Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
