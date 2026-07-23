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
- Project Codex agents: `.codex/agents`, defining the investigator, solver, executor, and judge model roles.

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
- Use `docs/agent-graphify.md` for Graphify setup, repo graph generation, and graph query workflows.
- Use `docs/agent-harness-guardrails.md` when editing agent instructions, docs, skills, or setup surfaces.
- Use `docs/agent-real-subagent-audit-protocol.md` when auditing delegated-agent behavior against the real Appraise
  lifecycle.
- Use `.agents/skills/swarm-orchestrator/SKILL.md` when routing non-trivial work among model-specialized agents or
  evaluating whether the swarm remains accurate and efficient.

## Model-specialized Swarm

The primary agent owns routing, integration, user communication, and final claims. Project custom agents divide work
by epistemic need rather than implementation phase:

- `investigator` gathers bounded evidence without designing or editing.
- `solver` resolves ambiguous, architectural, or otherwise high-judgment decisions.
- `executor` performs settled implementation and deterministic verification.
- `judge` independently evaluates consequential results that retain material uncertainty.

The project registers each role explicitly under `[agents.<role>]` in `.codex/config.toml`, limits spawned concurrency
to three agents, and uses Terra with medium reasoning as the fallback for an unpinned subagent. This is a requested
configuration, not proof that a particular host actually used the named role, inherited the intended context, or
enforced the requested effective sandbox. Record host receipts for those facts; where the host cannot provide one,
state the limitation and treat it as unverified rather than claiming isolation.

The swarm skill defines assignment contracts, escalation, scorecard dimensions, and evolution triggers across task
outcomes, routing, model fit, resource use, coordination, governance, and harness usability. Any non-optimal finding
follows a durable note → notify → user guidance → update → verification lifecycle; it never authorizes the harness to
rewrite its own roles, models, or thresholds.

The complete resolution path is note → notify → host-conversation guidance → update → deterministic verification →
fresh independent re-evaluation → explicit linkage of that re-evaluation to the original run. The local swarm ledger
records process evidence only. It is Git-ignored, is not an approval channel, and cannot replace the user decision in
the host conversation or Appraise-owned lifecycle approval.

## Documentation Maintenance

Major behavior, architecture, workflow, package, schema, scaffold, lifecycle, or toolchain changes must include matching
updates to current docs in the same change set. Start from the source-of-truth routing above, then update the smallest
set of active docs that would otherwise mislead the next agent or maintainer. If repo inspection finds active docs that
already deviate from current source, scripts, package layout, or generated-artifact rules, fix those deviations before
finishing.

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
Passing this check does not replace the documentation-maintenance rule above; it only catches known harness drift
classes.
