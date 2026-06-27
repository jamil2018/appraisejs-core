# Agent Harness

This document is the top-level map for coding agents working in AppraiseJS. Root `AGENTS.md` stays the compact routing
and safety layer; this file points to the detailed agent docs that keep navigation current.

## Repo Topology

- Root app: Next.js app source in `src/`, Prisma schema in `prisma/`, automation assets in `automation/`, sync and
  setup scripts in `scripts/`.
- Scaffold package: `packages/create-appraisejs`, with one bundled `templates/base` app and small flavor overlays.
- CLI and MCP package: `packages/appraisejs`, with CLI entry points, coordinator client code, registry content, and
  MCP tests.
- Repo-local skills: `.agents/skills`, intended to route agents to source files, docs, and validation commands.

## Source Of Truth Routing

- Commands and script names come from `package.json` or the relevant package `package.json`.
- Database behavior starts with `prisma/schema.prisma` and affected services/actions.
- Automation sync behavior starts with `docs/automation-sync-rules.md`.
- Test execution behavior starts with `docs/test-run-runtime.md`.
- Server action shape starts with `docs/server-actions-conventions.md`.
- Component placement starts with `docs/component-organization-rules.md`.
- Scaffold behavior starts with `docs/agent-scaffold-flow.md` and `docs/scaffold-template-sync.md`.
- MCP behavior starts with `docs/agent-mcp-setup.md` and `docs/coordinator-api-mcp.md`.
- Historical plans under `codex/development plan/*` are reference material unless the user names one as the task.

## Major Workflows

- Use `docs/agent-task-recipes.md` for common task entry points.
- Use `docs/agent-validation-matrix.md` to choose checks by touched area.
- Use `docs/agent-generated-artifacts.md` before editing generated or sync-managed output.
- Use `docs/agent-lifecycle-flow.md` for Appraise-owned plan, validation, baseline, implementation, and completion
  gates.
- Use `docs/agent-harness-guardrails.md` when editing agent instructions, docs, skills, or setup surfaces.

## MCP Setup

`npm run dev` starts both the web app and Streamable HTTP MCP sidecar. `npm run dev:mcp` starts only the sidecar.
`npm run setup:mcp` prints the current endpoint and stdio registration snippet. After registration changes, restart or
reconnect the MCP client before expecting tools to appear.

Default local endpoint:

```bash
http://127.0.0.1:3010/mcp
```

## Sandbox Gotchas

Managed sandboxes can block `tsx` process startup, localhost binding, browser launches, package installs, or networked
registry access. If a command fails with a sandbox-shaped transport, DNS, permission, or bind error, report that
separately from product behavior and rerun only when the task needs live validation.

## Drift Checks

Run `npm run check:harness` after editing root or package agent instructions, `docs/agent-*`, repo-local skills,
Cursor/Codex routing, package READMEs, or the PR template. The check intentionally ignores historical plan files.
