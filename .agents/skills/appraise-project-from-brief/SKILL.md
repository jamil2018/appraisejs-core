---
name: appraise-project-from-brief
description: Route natural-language project requests through AppraiseJS project discovery, registration, and plan review.
---

# Appraise Project From Brief

This skill owns only project discovery and registration. It hands a bound target and the unchanged user brief to the
planning skill; it does not author tasks or run lifecycle transitions.
AppraiseJS owns lifecycle and business rules. Read pending events before registration so discovery never conflicts
with an in-flight plan.

Use this skill when the user asks to use Appraise, create a project using AppraiseJS, build an app with AppraiseJS, or
generate a plan and show it in Appraise. Also use it when continuing feature work in a project that already has an
`.appraisejs/project.json` marker unless the user explicitly opts out.

1. If MCP guidance is not loaded, read `appraise://agent-guide` or ask the user to run `appraisejs agent setup` /
   `npm run setup:agent`, then restart or reconnect the client.
2. If setup text is visible but native MCP tools are missing, inspect `appraisejs agent setup --json`, verify endpoint
   reachability, reconnect, and read `appraise://agent-guide`. If `planning_session_create` or workflow resources are
   still missing, stop and ask the user to reconnect instead of using raw JSON-RPC as the normal path.
3. Call MCP `project_diagnostic` first and stop on blocking checks. Never silently fall back to CLI.
4. Choose the target explicitly before plan creation. Pass `targetWorkspacePath` for the writable target workspace.
   If the user omitted the project name, ask for one or infer a concise name from the brief. Never create an unbound
   or hub-scoped plan.
5. If the target project is not registered, call `project_add` for the writable target workspace before creating a
   plan. Empty writable directories are valid planning targets.
6. Treat an existing `.appraisejs/project.json` marker as continuity guidance that future plans go through Appraise.
7. Hand off `{ targetProjectId, targetWorkspacePath, brief }` to
   `.agents/skills/appraise-planning/SKILL.md`. Appraise does not infer the task graph. Do not add fallback tasks.
   Do not invent a name-derived plan ID, create a plan, or enter review standby in this discovery skill.

Never write project markers or SQLite directly.
