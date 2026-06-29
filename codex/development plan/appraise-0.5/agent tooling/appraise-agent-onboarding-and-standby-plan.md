# Appraise Agent Onboarding and Standby Plan

## Summary

Make AppraiseJS usable by ordinary coding agents without requiring users to paste tool-specific operating instructions
into every prompt. AppraiseJS should provide a globally installable agent skill/plugin, a setup script that registers
the MCP surface and skill guidance, self-describing MCP workflow resources, and tests that prove agents enter standby
after plan review readiness instead of terminating at the review gate.

This plan addresses two failures observed in the isolated todo-app planning audit:

- The agent created a review-ready Appraise plan, but exited after `plan_wait_for_approval` returned `pending` instead
  of entering standby for Appraise-owned approval, change-request, or cancellation events.
- The agent needed explicit prompt instructions to understand AppraiseJS discovery, target-project registration,
  planning, review readiness, and approval waiting. Normal users should not need to provide that operator manual.

## Goals

- Give coding agents a default AppraiseJS workflow contract before they touch low-level MCP tools.
- Make setup discoverable through one user-facing command.
- Keep Appraise lifecycle authority inside AppraiseJS, not chat approval or agent-local assumptions.
- Support empty or freshly scaffolded workspaces as planning targets without surprising recovery steps.
- Validate the real agent-like flow from a temporary workspace through review-ready standby.

## Non-Goals

- Do not replace existing primitive MCP tools such as `plan_create`, `plan_wait_for_review`, or
  `plan_wait_for_approval`.
- Do not start implementation after plan review readiness unless Appraise emits approval and the agent successfully
  calls `plan_start`.
- Do not design a full multi-project hub selection UI in this plan.
- Do not make browser visual inspection mandatory when HTTP route evidence is the only available verification path.

## Work

### 1. Global AppraiseJS Agent Skill/Plugin

- Package an AppraiseJS agent skill/plugin that can be installed globally for Codex and similar coding-agent clients.
- Add a planning skill that triggers on natural-language requests such as "use AppraiseJS", "plan this in Appraise",
  "build this project using Appraise", and "generate a plan and show it in Appraise".
- The planning skill must instruct agents to:
  - discover AppraiseJS tool availability;
  - run `project_diagnostic`;
  - detect whether the task is for the hub checkout or an external target workspace;
  - run `project_add` when the target workspace is not registered;
  - create the plan through AppraiseJS;
  - wait for `plan_review_ready`;
  - present the Appraise and browser links;
  - enter standby through `plan_wait_for_approval`;
  - handle `approved`, `changes_requested`, and `cancelled` as Appraise-owned events;
  - call `plan_start` only after approval;
  - avoid implementation until lifecycle state permits it.
- Add companion skills only where they reduce ambiguity:
  - planning and standby;
  - validation preparation after approval;
  - implementation checkpoints after baseline acceptance;
  - completion review and final sign-off.
- Keep the skill concise and route deeper details to repo docs such as `docs/agent-lifecycle-flow.md`,
  `docs/agent-mcp-setup.md`, and `docs/coordinator-api-mcp.md`.

### 2. Agent Setup Command

- Add a setup command that installs or prints everything an agent client needs:
  - preferred command: `appraisejs agent setup`;
  - repo script wrapper: `npm run setup:agent`.
- The setup output should include:
  - HTTP MCP endpoint;
  - stdio fallback command;
  - current bound hub project;
  - global skill/plugin install status or manual install instructions;
  - required client restart/reconnect guidance;
  - a short health check summary;
  - a warning that `plan_review_ready` requires standby, not agent termination.
- Keep `npm run setup:mcp` as the source of truth for MCP endpoint details, and make `setup:agent` compose or call the
  same underlying config helper rather than duplicating endpoint logic.
- If automatic global skill installation is not safe for a client, print exact copyable install instructions and the
  resolved skill path.

### 3. Self-Describing MCP Workflow Resources

- Add MCP resources that agents can read when no global skill is available:
  - `appraise://agent-guide`;
  - `appraise://workflow/planning`;
  - optionally `appraise://workflow/standby`.
- The planning workflow resource should describe the exact phase sequence:
  - diagnostics;
  - target registration;
  - plan creation;
  - review-ready wait;
  - event acknowledgement rules;
  - standby after review readiness;
  - approval, change-request, and cancellation handling.
- Include "next recommended action" guidance in relevant tool responses, especially after:
  - `project_diagnostic`;
  - `project_add`;
  - `plan_create`;
  - `plan_wait_for_review`;
  - `plan_wait_for_approval`.
- Ensure guidance is client-neutral. It should not depend on Codex-only APIs, though Codex-specific setup snippets can
  appear in the setup command when the environment is known.

### 4. High-Level Planning Workflow Tool

- Add a high-level MCP tool for normal agent entry, for example `planning_session_create`.
- Inputs should include:
  - project brief;
  - target workspace path when available;
  - optional display name;
  - mode such as `plan_only` or `plan_then_wait`;
  - optional source files or plan context.
- The tool should orchestrate the common setup path:
  - diagnose current Appraise connection;
  - register or reuse the target project;
  - create a structured plan;
  - wait for `plan_review_ready`;
  - return links, content hash, event sequence, target metadata, and standby instructions.
- The tool must not hide lifecycle gates:
  - it may wait for review readiness;
  - it must not treat chat approval as Appraise approval;
  - it must return `nextRequiredAgentBehavior: "standby_for_appraise_review"` when review readiness is reached.
- Keep primitive tools available for advanced agents, tests, and recovery.

### 5. Standby and Continuation Contract

- Define the expected standby behavior in active docs and skills:
  - after showing the Appraise review URL, the agent should remain in a resumable waiting state;
  - while active, it should use one long-polling `plan_wait_for_approval` call;
  - on timeout or host standby, it should report compact resumable state rather than declaring the task complete;
  - on `changes_requested`, it should read review remarks, revise against the expected hash, and return to standby;
  - on `cancelled`, it should acknowledge and stop;
  - on `approved`, it should call `plan_start`, wait for `validation_preparation_started`, acknowledge only after the
    permitted transition succeeds, and continue to validation preparation.
- Update wording in active agent docs and skills that says or implies "stop at the review gate".
- Where the host supports thread wakeups or resumable waits, document the preferred integration point. Where it does
  not, return a clear continuation token and exact next command/tool call.

### 6. Empty Workspace and Target Registration Recovery

- Improve `project_add` recovery for empty target workspaces.
- Preferred behavior:
  - accept generic writable directories as valid planning targets; or
  - return a precise structured recovery that says a minimal `package.json` or project metadata file is required.
- Ensure successful target registration writes `.appraisejs/project.json` when the target is writable, and make that
  marker explain future Appraise routing.
- Update diagnostics so agents can tell the difference between:
  - the Appraise hub project;
  - the target application workspace;
  - a stale or mismatched sidecar binding.

### 7. Agent-Like E2E Harness

- Add an agent-like E2E test that creates a temporary workspace and runs the planning flow without hand-authored
  Appraise operating instructions in the task prompt.
- The harness should verify:
  - setup/skill guidance is discoverable;
  - the target project is registered or recovered;
  - a plan is created with the requested todo-app constraints;
  - `plan_review_ready` is emitted;
  - the browser route returns `200 OK` and includes the plan id and goal;
  - the agent enters standby instead of exiting after `pending`;
  - approval resumes through `plan_start`;
  - change request resumes through `plan_review_read` and `plan_revise`;
  - cancellation stops cleanly.
- Keep this harness separate from app implementation. The audit target is the agent lifecycle flow, not whether a todo
  app can be built.

### 8. Real Subagent Workflow Audits

- Add a repeatable manual-or-semi-automated audit protocol that uses actual coding subagents, not only deterministic
  harness scripts.
- The audit should mirror a normal user workflow:
  - create a fresh temporary target workspace;
  - start from a natural-language product brief with no AppraiseJS operator manual in the prompt;
  - ask the subagent to use AppraiseJS as the planning and E2E testing surface;
  - require the subagent to report tool discovery, setup, plan publication, lifecycle events, and standby behavior;
  - have the coordinator independently verify the Appraise route, plan content, target registration marker, and
    lifecycle state;
  - approve, request changes, and cancel from AppraiseJS in separate runs to observe continuation behavior;
  - record whether the subagent stayed alive, entered standby, returned resumable state, or incorrectly completed.
- Run this audit against at least two prompt shapes:
  - a simple todo-app brief using React, Vite, Tailwind, shadcn, and TanStack Forms;
  - a different small app brief so the test does not overfit to the todo wording.
- Capture evidence for each run:
  - target workspace path;
  - Appraise plan id and links;
  - target project id and marker status;
  - observed MCP route, whether native tools or HTTP MCP were used, and any recovery steps;
  - `plan_review_ready`, `plan_wait_for_approval`, `plan_approved`, `plan_changes_requested`, or `plan_cancelled`
    results;
  - whether implementation was correctly blocked before approval;
  - whether browser verification, HTTP-rendered verification, or both were available.
- Treat subagent audit failures as product feedback, not just prompt failures. If the subagent needs hidden
  coordinator instructions to succeed, the skill/plugin, setup script, MCP resources, or workflow tool is incomplete.

## Public Interfaces

- New or updated package command:
  - `appraisejs agent setup`
  - `npm run setup:agent`
- New global agent/plugin artifact:
  - AppraiseJS planning and standby skill.
- New MCP resources:
  - `appraise://agent-guide`
  - `appraise://workflow/planning`
  - optionally `appraise://workflow/standby`
- New high-level MCP tool:
  - `planning_session_create`
- Extended tool responses:
  - compact `nextRecommendedAction`;
  - `nextRequiredAgentBehavior`;
  - target project metadata;
  - standby or continuation guidance.

## Acceptance Criteria

- A coding agent with the AppraiseJS skill/plugin installed can receive a normal user prompt like "build this app using
  AppraiseJS" without extra MCP operating instructions and still reach a review-ready plan.
- After `plan_review_ready`, the agent does not report the planning task as complete while approval is pending. It
  enters standby or returns explicit resumable wait state.
- The Appraise review URL is shown only after durable `plan_review_ready` evidence exists.
- `changes_requested`, `approved`, and `cancelled` are handled through Appraise events, not chat-only approval.
- An empty temporary workspace either registers successfully or fails with exact structured recovery instructions.
- Setup output tells users whether MCP tools require registration/restart and where the AppraiseJS agent skill/plugin
  is installed.
- MCP workflow resources let a less-prepared agent discover the correct flow even when the global skill is absent.
- Existing primitive MCP tools remain compatible.

## Validation

- Standard deterministic validation remains required:
  - unit tests for skill policy, setup output, MCP resources, workflow tools, and target registration;
  - integration and MCP E2E tests for plan creation, review readiness, approval, change-request, and cancellation;
  - formatting, linting, harness checks, and package builds appropriate to the touched files.
- Skill policy tests verify:
  - the planning skill exists and triggers for natural-language Appraise project requests;
  - the skill requires diagnostics before mutation;
  - the skill requires standby after review readiness;
  - old "stop at review gate" behavior is not present in active instructions.
- Setup script tests verify:
  - `npm run setup:mcp` and `npm run setup:agent` agree on endpoint and stdio command;
  - setup output includes restart/reconnect and standby guidance.
- MCP/resource tests verify:
  - `appraise://agent-guide` and `appraise://workflow/planning` are readable;
  - tool/resource responses do not expose tokens;
  - next-action guidance is present at key phases.
- Workflow tests verify:
  - `planning_session_create` can create a review-ready plan for a temporary target workspace;
  - pending approval returns standby state;
  - approval calls `plan_start` and reaches validation preparation;
  - change requests revise and return to standby;
  - cancellation is terminal.
- Agent-like E2E verifies the isolated todo-app brief from a temp workspace without custom AppraiseJS prompt details.
- Real subagent workflow audits verify the behavior with actual coding-agent delegation:
  - spawn a subagent with a temporary workspace and only a normal product brief;
  - confirm it discovers AppraiseJS through installed skill/plugin/setup guidance, not coordinator-supplied tool
    instructions;
  - confirm it creates and shows an Appraise plan;
  - confirm it enters standby or returns explicit resumable wait state instead of completing when approval is pending;
  - confirm approval, change-request, and cancellation continuations behave correctly in separate runs;
  - record failures as actionable issues with the exact missing guidance or lifecycle weakness.
- The final validation report should include both machine-check results and subagent audit evidence. The subagent
  evidence should say plainly whether verification was browser/UI-backed, HTTP-rendered only, or MCP/API-only.
- Focused formatting and linting:
  - `npx prettier --check` for changed docs, skills, package scripts, and tests;
  - `npx eslint` for changed TypeScript/JavaScript files;
  - `npm --prefix packages/appraisejs run test:mcp:e2e` for MCP flow changes;
  - `npm run check:harness` for agent instruction changes.

## Implementation Notes

- Coordinate with `codex/development plan/appraise-0.5/bug fixes/natural-language-project-flow-continuation-and-plan-identity.md`
  for opaque plan identity, target markers, and long-poll continuation behavior.
- Coordinate with `codex/development plan/appraise-0.5/bug fixes/12-mcp-project-binding-safety.md` for hub-vs-target
  diagnostics and cross-project safety.
- Coordinate with `codex/development plan/appraise-0.5/core workflow/10-mcp-planning-experience.md` for diagnostic
  contracts, canonical links, and review-ready evidence.
- Prefer adding one high-level workflow tool after the skill/setup/resource path is available, so primitive MCP
  behavior remains stable while the new agent contract is introduced.

## Open Questions

- Should the global skill/plugin be distributed from the `appraisejs` package, a Codex plugin bundle, or both?
- Should `planning_session_create` generate the structured plan itself, or should the agent produce the plan artifact
  and pass it to a workflow tool for lifecycle publication?
- What is the best standby integration for hosts that cannot keep a subagent alive across a long review window?
- Should empty directories be first-class Appraise target projects, or should Appraise require minimal project
  metadata before registration?
