# Agent Harness

This document is the top-level map for coding agents working in AppraiseJS. Root `AGENTS.md` stays the compact routing
and safety layer; this file points to the detailed agent docs that keep navigation current.

## Repo Topology

- Root app: Next.js app source in `src/`, Prisma schema in `prisma/`, automation assets in `automation/`, sync and
  setup scripts in `scripts/`.
- Scaffold package: `packages/create-appraisejs`, with one bundled `templates/base` app and small flavor overlays.
- CLI and MCP package: `packages/appraisejs`, with CLI entry points, coordinator client code, and
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
- Use `.agents/skills/swarm-orchestrator/SKILL.md` to classify every project-engineering task, including the
  coordinator-only fast path, before routing work among model-specialized agents.

## Model-specialized Swarm

The primary agent owns bounded intake, routing, integration, user communication, and final claims. Every
project-engineering task is classified by epistemic need, consequence, deterministic verifiability, separability, and
estimated effort. Classification is lightweight and does not imply delegation: trivial or localized work with strong
checks selects `coordinator-only` and zero subagents. Project custom agents divide delegated work by epistemic need
rather than implementation phase:

- `investigator` gathers bounded evidence without designing or editing.
- `solver` resolves ambiguous, architectural, or otherwise high-judgment decisions.
- `executor` performs settled implementation and deterministic verification.
- `executor-advanced` uses Terra-high for cross-module but still strongly verifiable implementation.
- `judge` independently evaluates consequential results that retain material uncertainty.

The project registers each role explicitly under `[agents.<role>]` in `.codex/config.toml`, limits spawned concurrency
to three agents, and uses Terra with medium reasoning as the fallback for an unpinned subagent. Sol-high remains
reserved for evidence-backed judgment and independent evaluation; a lower-effort Sol profile is deferred until
metrics establish a distinct need. This is requested configuration, not proof that a particular host actually used
the named role, inherited the intended context, or enforced the requested effective sandbox. Record host receipts for
those facts; where the host cannot provide one, state the limitation and treat it as unverified rather than claiming
isolation.

Meaningful, delegated, anomalous, or consequential work receives a compact routing receipt before work begins. Truly
trivial coordinator-only work does not require one. Later scored runs link to earlier immutable receipts, while the full scorecard and
evolution lifecycle remain proportional to delegation, consequence, and observed routing anomalies. Routing metrics
separate healthy zero-agent handling from under-routing and can propose—but never authorize—profile or threshold
changes. A verified runtime claim must carry the matching `host-effective-<property>:<value>` receipt, never merely a
requested selector. The stable scorecard classes are `localized-fix`, `cross-module-feature`, `architecture-review`,
`release-gate`, and `harness-configuration`; fixture aliases normalize into those classes before recording. If a
routing receipt requires an independent judge, its linked score cannot be recorded as healthy or final unless the
judge has an effective host receipt whose mode exactly matches `none` or bounded inherited context. The local ignored
swarm journal retains the five-path host selector probe matrix for coordinator-only, investigator, executor, solver,
and judge paths. Those selector receipts do not prove the effective role, model, reasoning, inherited context, or
sandbox; every unsupported runtime property remains `unverified`.

This model-specialized swarm governs repository engineering. It does not replace AppraiseJS plan, validation,
baseline, implementation, or completion gates.

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

## Default UI Testing Surface

Use the bundled `Browser` plugin and its `control-in-app-browser` skill for interactive UI verification by default.
This is the harness control surface for navigation, semantic page inspection, clicking, typing, console and request
checks, and selective screenshots. Reuse one Browser binding and its tabs across related checks. Do not create
screenshots, traces, snapshots, or other persisted artifacts unless the requested evidence needs them.

Standalone `playwright-cli` is a fallback, not a peer default. Use it only when the Browser skill is unavailable or
the Browser skill's documented setup and troubleshooting path cannot establish a session. Report the exact fallback
reason and keep its `.playwright-cli/` output local and untracked. Repository Playwright test suites remain the
deterministic validation surface when a checked-in E2E spec or repeatable suite execution is required.

## Drift Checks

Run `npm run check:harness` after editing root or package agent instructions, `docs/agent-*`, repo-local skills,
Cursor/Codex routing, package READMEs, or the PR template. The check intentionally ignores historical plan files.
Passing this check does not replace the documentation-maintenance rule above; it only catches known harness drift
classes.
