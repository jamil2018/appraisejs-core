# Appraise-Orchestrated Provider Sessions

## Summary

Move AppraiseJS toward an Appraise-first workflow where the user starts in Appraise, Appraise owns durable workflow
state, and external coding providers run as resumable execution backends. MCP remains a first-class integration path,
but the ideal product flow should not require the user to manually start in a coding-agent chat and paste AppraiseJS
operating instructions.

The target architecture is:

```text
Primary UX:
User -> Appraise -> Provider Adapter -> Headless Agent

Compatibility and power-user UX:
User -> Agent Host -> MCP -> Appraise

Internal control plane:
Provider Run -> MCP/API -> Appraise lifecycle events
```

The key correction is that provider sessions are not the source of truth. Appraise owns the plan, target project,
lifecycle gates, canonical artifacts, review state, validation evidence, implementation checkpoints, completion
approval, run history, and audit trail. Provider sessions are replaceable workers attached to an Appraise-owned
workflow run.

Implementation of this plan should use subagents by default. The coordinator agent should keep the whole architecture
coherent, own final integration, and run the release checks, while specialized subagents implement and validate scoped
portions in parallel.

## Goals

- Let users create, review, approve, validate, implement, and complete work from the Appraise UI without first opening
  a coding-agent chat.
- Add a provider execution layer that can launch, stream, pause, resume, cancel, and recover headless provider runs.
- Preserve Appraise-owned lifecycle gates for plan review, validation review, baseline acceptance, implementation
  checkpoints, completion review, and cancellation.
- Keep MCP available for inbound agent workflows, provider-launched lifecycle calls, diagnostics, and clients that do
  not support direct provider orchestration.
- Model provider capabilities honestly instead of pretending Codex, Claude, Cursor, local CLIs, SDKs, and MCP-native
  hosts expose the same control surface.
- Store enough canonical state that Appraise can recover after provider crashes, host restarts, stale sessions, or a
  switch to another provider.
- Keep repo-owned executable artifacts such as `automation/**`, reports, traces, and generated test files usable
  without a running Appraise hub.
- Divide implementation into subagent-consumable slices with explicit ownership, inputs, outputs, validation commands,
  and handoff evidence.

## Non-Goals

- Do not remove MCP or demote existing MCP tools to legacy-only status.
- Do not treat provider memory, chat transcripts, or provider session IDs as canonical workflow state.
- Do not require every provider adapter to support every capability before the first usable slice ships.
- Do not replace Appraise lifecycle approval with chat approval, provider approval, or CLI exit status.
- Do not centralize executable tests so tightly in the Appraise hub that target repos can no longer run them directly.
- Do not implement multi-provider production support before a single-provider vertical slice proves the contract.

## Current Architecture Fit

AppraiseJS already has the main conceptual foundation:

- Appraise-owned lifecycle gates are documented in `docs/agent-lifecycle-flow.md`.
- Durable coordinator events, leases, acknowledgement rules, and MCP/API surfaces are documented in
  `docs/coordinator-api-mcp.md`.
- Agent setup and standby guidance already exist in `docs/agent-mcp-setup.md`.
- The package MCP surface lives in `packages/appraisejs/src/mcp.ts`.
- The hub-plus-target-project direction is captured in
  `codex/development plan/appraise-0.5/product direction/global-appraise-hub-repo-owned-tests.md`.

The missing product layer is provider process ownership. Today Appraise exposes lifecycle state to external agents;
with this feature, Appraise also starts and supervises selected provider runs.

## Subagent Implementation Strategy

Use subagents for implementation, validation, and review. The coordinator should not try to serially implement the
entire feature unless the user explicitly narrows scope to a tiny preparatory slice. Each subagent should receive one
bounded slice, the relevant source docs, expected files, validation commands, and the requirement that Appraise
lifecycle gates remain authoritative.

The coordinator owns:

- preserving the plan's architecture and terminology across slices;
- resolving cross-slice schema, service, UI, MCP, and runtime conflicts;
- deciding final sequencing when parallel changes collide;
- running or delegating integration checks after subagent work lands;
- ensuring generated/template sync rules are followed when touched;
- producing the final evidence bundle and PR-ready summary.

Every subagent handoff should include:

- changed files and why they changed;
- data model or contract changes;
- validation commands run and exact failures, if any;
- known follow-up work or risks;
- whether the slice touched Appraise-owned lifecycle gates, MCP, generated artifacts, or scaffold templates.

### Subagent Slice A: Provider Domain and Storage

Owns the durable provider-run model.

- Read first: `prisma/schema.prisma`, `src/config/db-config.ts`, `docs/server-actions-conventions.md`, and existing
  coordinator service tests.
- Implement or prepare:
  - provider adapter registration model;
  - workflow run model;
  - provider session identifiers;
  - provider run event table;
  - permission decision table;
  - artifact snapshot fields;
  - service APIs for create, append event, update status, record permission decision, and bind session ids.
- Must preserve:
  - provider sessions are non-canonical;
  - lifecycle state remains Appraise-owned;
  - API/MCP adapters do not write Prisma directly.
- Validation:
  - schema/migration checks appropriate to the repo;
  - focused service tests;
  - `npx eslint <changed files>`;
  - `npx prettier --check <changed files>`.

### Subagent Slice B: Provider Adapter Runtime

Owns the runtime boundary for launching, streaming, cancelling, and recovering provider runs.

- Read first: `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`,
  `src/lib/executor/local-executor-adapter.ts`, and test-run process-management code.
- Implement or prepare:
  - provider adapter interface;
  - capability snapshot type;
  - mock provider adapter for deterministic tests;
  - Codex adapter spike or first implementation;
  - normalized provider event mapping;
  - cancellation and crash handling contract.
- Must preserve:
  - provider exit does not imply lifecycle approval or completion;
  - provider capability flags are explicit;
  - real provider smoke tests are optional when credentials or binaries are unavailable.
- Validation:
  - unit tests for capability negotiation and event normalization;
  - mock-adapter integration tests for launch, stream, cancel, crash, retry, and resume;
  - focused lint and formatting checks.

### Subagent Slice C: Lifecycle and MCP Compatibility

Owns lifecycle integration and MCP/API surfaces.

- Read first: `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`, `docs/agent-mcp-setup.md`,
  `packages/appraisejs/AGENTS.md`, and `packages/appraisejs/src/mcp.ts`.
- Implement or prepare:
  - provider-run-aware lifecycle service hooks;
  - provider-run resources such as `appraise://provider-runs`;
  - provider run tools for create/read/cancel/resume where appropriate;
  - context propagation so Appraise-launched providers can call Appraise MCP tools;
  - diagnostics that report provider-run capability support without breaking existing MCP clients.
- Must preserve:
  - existing MCP primitives and high-level workflow tools;
  - Appraise-owned approval, validation, baseline, implementation, and completion gates;
  - no MCP or API tool may bypass lifecycle state transitions.
- Validation:
  - MCP/API boundary tests;
  - `npm run setup:mcp` when setup text changes;
  - `npm run setup:agent` when agent guidance changes;
  - `npm run smoke:coordinator`;
  - package MCP E2E tests when the MCP surface changes.

### Subagent Slice D: Appraise UI and Run Console

Owns user-facing Appraise-first entry and provider-run visibility.

- Read first: `docs/component-organization-rules.md`, existing plan review routes under `src/app/(base)/plans`, and
  relevant server action conventions.
- Implement or prepare:
  - provider selection and launch UI;
  - target-project selection or attach affordance;
  - brief entry/import flow;
  - provider run console;
  - permission request panel;
  - cancel, retry, resume, and fork controls;
  - links to plan review, validation review, test runs, and completion evidence.
- Must preserve:
  - operational first screen, not a marketing page;
  - Appraise review UI remains the authority for approval;
  - text and controls fit across supported viewport sizes.
- Validation:
  - focused React tests;
  - affected-file ESLint and Prettier checks;
  - browser or Playwright verification for launch and console flows when routes are runnable.

### Subagent Slice E: Permissions, Repo State, and Artifact Tracking

Owns safety policy, repository drift checks, and evidence capture.

- Read first: `docs/agent-generated-artifacts.md`, `docs/automation-sync-rules.md`,
  `docs/scaffold-template-sync.md`, and test-run runtime docs.
- Implement or prepare:
  - permission policy model;
  - persisted permission decision records;
  - pre-run and post-run repo metadata capture;
  - dirty status and changed-file summaries;
  - artifact hash capture;
  - drift detection before resume;
  - redaction rules for logs and permission payloads.
- Must preserve:
  - least privilege by phase;
  - no direct edits to generated automation output when source/generator changes are required;
  - repo-owned test artifacts stay runnable without Appraise.
- Validation:
  - service tests for policy decisions and drift detection;
  - tests for redaction and artifact hash behavior;
  - sync/template validation when those surfaces are touched.

### Subagent Slice F: Documentation, Capability Matrix, and Rollout Plan

Owns documentation and implementation sequencing support.

- Read first: `docs/agent-harness.md`, `docs/agent-task-recipes.md`, `docs/agent-validation-matrix.md`, and this plan.
- Implement or prepare:
  - provider adapter contract doc;
  - provider capability matrix;
  - provider-run safety model;
  - Appraise-first workflow guide;
  - migration and rollout notes;
  - operator guidance for unavailable provider binaries or credentials.
- Must preserve:
  - current MCP-first docs remain accurate;
  - docs clearly distinguish direct provider orchestration from MCP compatibility;
  - historical plans remain reference-only unless explicitly named.
- Validation:
  - `npm run check:harness` after active agent docs or skills change;
  - focused Prettier checks for docs;
  - doc links and command snippets verified against `package.json`.

### Subagent Slice G: Independent Validation and Review

Owns verification separate from implementation.

- Read first: changed files from all implementation slices, `docs/agent-validation-matrix.md`, and relevant test docs.
- Validate:
  - schema/service tests;
  - mock-adapter integration tests;
  - MCP/API boundary tests;
  - UI tests;
  - lifecycle E2E tests;
  - existing MCP workflow regressions;
  - real provider smoke tests only when the environment supports them.
- Review for:
  - lifecycle gate bypasses;
  - provider memory becoming canonical;
  - permission or sandbox gaps;
  - stale MCP setup text;
  - generated artifact misuse;
  - missing recovery paths.
- Handoff:
  - findings first, ordered by severity;
  - commands run;
  - residual risk;
  - any blocked checks with exact reason.

### Suggested Parallelization

Use parallel workers in this order:

1. Spike worker: verify provider capabilities and choose first adapter mechanism.
2. Domain worker: schema and service model.
3. Runtime worker: adapter interface and mock provider.
4. MCP/lifecycle worker: provider-run resources/tools and lifecycle integration.
5. UI worker: launch flow and run console against mock data.
6. Safety worker: permissions, repo state, artifact tracking, and drift checks.
7. Docs worker: capability matrix and Appraise-first workflow documentation.
8. Validation worker: independent test and review pass after mergeable slices exist.

The coordinator should merge slices only when the contracts line up. If a slice exposes an interface another slice
needs, the interface should be committed or documented before dependent subagents proceed deeply.

## Product Model

Add a durable Appraise workflow-run concept that connects a plan, a target project, a provider, and a lifecycle phase.
A workflow run should capture:

- Appraise plan id and current lifecycle phase.
- Target project id, canonical workspace path, and repo snapshot metadata.
- Provider kind, adapter version, model or profile, and capability snapshot.
- Provider session, thread, run, or process identifiers when available.
- Launch prompt, approved task scope, and Appraise system instructions used for that run.
- Streamed provider events, stdout/stderr chunks, structured messages, tool calls, and exit status.
- Permission requests, user decisions, policy decisions, and denied operations.
- Artifact writes, generated files, changed-file summary, validation evidence, and hashes.
- Cancellation, timeout, retry, resume, fork, and recovery state.
- Links back to plan review, validation review, run console, logs, and final evidence.

This model should be distinct from the existing coordinator identity. A coordinator can still represent the Appraise
lifecycle actor, while provider runs are execution attempts owned by the coordinator or by the Appraise app itself.

## Provider Capability Model

Create a provider adapter contract with explicit capability negotiation. Capabilities should be stored per workflow
run so later recovery and audit can explain what the adapter claimed at launch time.

Initial capability flags should include:

- `launch`: can start a new run from a prompt and cwd.
- `streamEvents`: can stream structured events or parseable output.
- `resumeSession`: can resume by provider-owned session or thread id.
- `continueRun`: can send a follow-up instruction into an existing run.
- `cancelRun`: can terminate the active provider process or remote run.
- `structuredOutput`: can request machine-readable final or intermediate output.
- `permissionCallbacks`: can surface file, command, network, or browser approval requests.
- `mcpInjection`: can connect the provider run to the Appraise MCP endpoint.
- `workspaceSandbox`: can run in a bounded cwd or worktree with controlled writes.
- `backgroundRun`: can continue after the UI request that launched it returns.
- `logReplay`: can replay or reconstruct events after reconnect.

The adapter interface should support partial implementations. For example, a CLI adapter may support launch, stream,
cancel, and MCP injection, while an SDK adapter may additionally support thread resume and structured event replay.

## Architecture Slices

### 1. Provider Run Domain Model

- Add Prisma models for provider adapter registrations, workflow runs, provider sessions, run events, permission
  decisions, and artifact snapshots.
- Link workflow runs to `TargetProject`, plan projection, lifecycle phase, and optional test-run records.
- Store provider capability snapshots on each run instead of resolving current adapter capability during historical
  review.
- Add service-layer APIs for creating runs, appending events, updating run status, recording permission decisions, and
  binding provider session identifiers.
- Keep persistence behind services; API, MCP, and adapter layers should not write Prisma records directly.

### 2. Provider Adapter Runtime

- Add a provider runtime package or module boundary for launching child processes and SDK-backed sessions.
- Start with one Codex adapter because it should validate the deepest expected shape: launch, stream, resume or
  continue when available, cancel, structured event parsing, and Appraise MCP injection.
- Add a mock provider adapter for deterministic tests before relying on real provider binaries.
- Normalize provider output into Appraise run events such as `provider_run_started`, `provider_event_streamed`,
  `provider_permission_requested`, `provider_artifact_changed`, `provider_run_paused`, `provider_run_failed`, and
  `provider_run_completed`.
- Treat provider exit as run status only. It must not imply plan approval, validation approval, baseline acceptance,
  implementation completion, or final sign-off.

### 3. Appraise UI Entry Point

- Add an Appraise UI flow for starting work from the hub:
  - choose or attach a target project;
  - enter or import a brief;
  - choose provider and model/profile;
  - show capability warnings and workspace permissions;
  - launch a planning run.
- Show a run console with streamed events, lifecycle phase, current provider status, permission requests, links to
  review surfaces, and recovery actions.
- Keep the first-viewport experience operational, not a marketing surface: target selection, brief input, provider
  selection, run status, and review actions should be immediately reachable.
- Add explicit controls for cancel, retry, resume, fork to a new provider run, and open target workspace details.

### 4. Lifecycle Integration

- Planning runs may create or revise plans, but review readiness must still be represented by durable Appraise plan
  events before the UI offers review.
- Approval from the Appraise review UI should enqueue or continue the next provider run only after the permitted
  lifecycle transition succeeds.
- Change requests should feed review remarks and expected hashes into the provider continuation prompt, then return to
  review standby.
- Validation preparation should require AppraiseJS-native validation artifacts and `validation_publish` before
  validation review standby.
- Implementation should remain blocked until baseline evidence is accepted.
- Completion should require final validation evidence and explicit Appraise completion approval.

### 5. MCP Compatibility

- Keep existing MCP primitives and high-level workflow tools available.
- Add MCP resources that describe provider-run state when the server supports it:
  - `appraise://provider-runs`;
  - `appraise://provider-runs/{runId}`;
  - optionally `appraise://providers`.
- Add MCP tools only where they help external agents cooperate with Appraise-owned provider runs:
  - `provider_run_create` for advanced or automation clients;
  - `provider_run_read`;
  - `provider_run_cancel`;
  - `provider_run_resume` when supported;
  - `provider_permission_decide` if permissions are not handled only in the UI.
- Keep the existing Appraise lifecycle tools authoritative. Provider-run tools should not bypass plan, validation,
  baseline, implementation, or completion gates.
- Ensure a provider process launched by Appraise can still call Appraise MCP tools with the correct target project and
  workflow-run context.

### 6. Permissions and Safety

- Define a workspace permission policy before allowing provider writes:
  - read-only plan generation;
  - write validation artifacts only;
  - write implementation files in target workspace;
  - run commands;
  - network access;
  - browser automation;
  - destructive command denial or explicit approval.
- Surface permission requests in Appraise with provider identity, cwd, command or file path, reason, and risk tier.
- Persist every decision with timestamp, user, provider run id, and exact request payload.
- Default to least privilege. A planning-only run should not receive implementation write permissions.
- Add cancellation behavior that terminates child processes and records whether termination was graceful or forced.

### 7. Repository State and Artifact Tracking

- Capture pre-run and post-run repo metadata:
  - git branch and head;
  - dirty status summary;
  - changed files;
  - generated artifact paths;
  - plan, validation, and report hashes.
- Detect drift before resuming a provider session. If the target repo changed outside the run, Appraise should surface a
  recovery choice instead of blindly trusting provider memory.
- Preserve repo-owned tests and reports. Appraise may index and display them, but target repos should still be able to
  run generated tests independently.
- For scaffold/template-affecting work, keep the existing root-first and template-sync rules.

### 8. Provider Run Console and Recovery

- Add a run detail page with:
  - current run status and lifecycle phase;
  - provider event stream;
  - recent file changes and artifacts;
  - pending permission requests;
  - failure reason and retry options;
  - session/thread identifiers when safe to show;
  - links to plan review, validation review, test runs, and completion evidence.
- Support recovery paths:
  - resume same provider session when supported;
  - continue with a compact Appraise-authored prompt when session resume is unavailable;
  - fork to another provider;
  - abandon provider run while preserving canonical Appraise state.

## Phased Delivery

### Phase 0: Architecture Spike

- Use at least one spike subagent focused only on provider capability verification and adapter mechanism selection.
- Verify real Codex and at least one second provider capability surface:
  - launch command or SDK path;
  - event streaming shape;
  - session or thread resume behavior;
  - cancellation behavior;
  - auth assumptions;
  - MCP endpoint injection;
  - cwd and sandbox behavior;
  - structured output support.
- Produce a capability matrix and adapter risk notes.
- Decide whether the first production adapter should use CLI, SDK, app-server, or a layered approach.

### Phase 1: Durable Provider Run Skeleton

- Use Subagent Slice A for domain/storage, Subagent Slice B for mock runtime, and Subagent Slice D for a mock-backed
  console shell when UI work can proceed independently.
- Add provider-run schema, service APIs, mock adapter, and event append/read behavior.
- Add a provider-run console backed by mock events.
- Add permission-decision persistence without wiring real command execution yet.
- Add unit tests and service tests for state transitions, event ordering, and cancellation.

### Phase 2: Single-Provider Planning Slice

- Use Subagent Slice B for the first provider adapter and Subagent Slice C for MCP/API lifecycle wiring.
- Implement the first Codex adapter against the chosen launch mechanism.
- Launch a planning-only provider run from Appraise for an attached target project.
- Stream provider output into the run console.
- Allow the provider run to create or revise an Appraise plan through MCP/API.
- Stop at `plan_review_ready` with Appraise review links and pending approval state.
- Prove provider exit does not mark the plan complete.

### Phase 3: Review Loop and Validation Preparation

- Use Subagent Slice C for lifecycle continuation, Subagent Slice E for artifact evidence, and Subagent Slice G for an
  independent review of gate correctness.
- Continue or relaunch the provider run after Appraise plan approval.
- Route change requests back into provider continuation with review remarks and expected hashes.
- Require validation artifacts and `validation_publish` before validation review standby.
- Capture validation artifact paths, changed-file evidence, and generated test metadata.
- Add deterministic tests for approval, change request, cancellation, and stale-hash recovery.

### Phase 4: Baseline, Implementation, and Completion

- Use separate implementation and validation subagents so checkpoint behavior and final evidence are reviewed by a
  worker that did not write the runtime code.
- Gate implementation behind baseline acceptance.
- Run implementation tasks through provider runs with checkpoint updates.
- Capture changed files, validation evidence, and test run records.
- Require final validation evidence plus explicit Appraise completion approval.
- Add resume, retry, fork, and cancellation behavior for long implementation runs.

### Phase 5: Multi-Provider Productionization

- Use one subagent per provider adapter plus a separate compatibility-review subagent.
- Add a second provider adapter after the Codex slice proves the contract.
- Add capability-aware UI warnings and adapter-specific recovery guidance.
- Harden auth, logging, redaction, permission handling, and crash recovery.
- Add provider compatibility docs and user-facing setup diagnostics.
- Add migration and upgrade behavior for historical runs.

## Public Interfaces

- New UI surfaces:
  - provider selection and launch flow;
  - provider run console;
  - permission review panel;
  - run recovery controls.
- New service/domain concepts:
  - provider adapter;
  - provider capability snapshot;
  - workflow run;
  - provider run event;
  - permission decision;
  - artifact snapshot.
- New or extended MCP/API surfaces:
  - provider run resources;
  - provider run create/read/cancel/resume tools where appropriate;
  - lifecycle tools annotated with current provider-run context when applicable.
- New docs:
  - provider adapter contract;
  - provider capability matrix;
  - provider-run safety model;
  - Appraise-first workflow guide.

## Acceptance Criteria

- A user can start a planning-only run from Appraise for an attached target repo without manually opening a coding
  agent chat.
- The run console streams provider activity and records durable provider-run events.
- The provider can publish a review-ready plan, but Appraise plan review remains the authority for approval.
- Pending approval, requested changes, cancellation, validation review, baseline acceptance, implementation, and final
  completion remain Appraise-owned lifecycle states.
- MCP-first workflows still work after provider-run support lands.
- A provider crash or app restart does not lose the canonical plan, review state, validation state, run history, or
  artifact hashes.
- If provider resume is unavailable or fails, Appraise can continue from canonical workflow state with a new provider
  prompt or a new provider run.
- Permission decisions are visible, persisted, and enforced by adapter runtime policy.
- Repo-owned tests and generated artifacts remain runnable from the target repo without the Appraise hub.
- Implementation evidence shows work was divided into subagent-consumable slices, with separate handoffs and at least
  one independent validation/review pass for broad rollout phases.

## Validation

- Schema and service tests for provider runs, provider events, permission decisions, capability snapshots, and artifact
  snapshots.
- Mock-adapter integration tests for launch, stream, permission request, cancellation, crash, retry, and resume paths.
- MCP/API boundary tests proving provider-run tools do not bypass lifecycle gates.
- UI tests for provider launch, run console updates, permission decisions, cancellation, and recovery controls.
- Lifecycle E2E tests covering:
  - Appraise-started planning run to `plan_review_ready`;
  - plan approval to validation preparation;
  - change request to provider revision;
  - cancellation during pending review;
  - provider failure and recovery from canonical Appraise state.
- Real provider smoke tests gated behind local availability checks so CI can run deterministic mock coverage without
  provider credentials.
- Regression checks for existing MCP workflows:
  - `npm run setup:mcp`;
  - `npm run setup:agent`;
  - `npm run smoke:coordinator`;
  - package MCP E2E tests when the MCP surface changes.
- Subagent process validation:
  - each implementation subagent reports changed files, contracts, validation commands, and risks;
  - the coordinator verifies cross-slice contracts before final integration;
  - an independent validation subagent reviews lifecycle authority, permission safety, MCP compatibility, and recovery
    behavior before release.

## Open Questions

- Should the first adapter use Codex CLI, Codex SDK, app-server, or a layered adapter that can switch per environment?
- Should provider runs be tied to a plan from the start, or should a pre-plan brief run create the plan record only
  after Appraise receives enough structured content?
- How much provider auth setup should Appraise manage versus detecting an already-authenticated local provider CLI?
- Should permission prompts be handled only in Appraise UI, or can MCP clients also approve provider-run permissions?
- What is the minimum repo snapshot needed for safe resume without making every run expensive?
- Should long-running provider orchestration live in the Next.js process, a sidecar worker, or a separate local daemon?
