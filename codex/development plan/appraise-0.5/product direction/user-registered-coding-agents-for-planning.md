# User-Registered Coding Agents For Planning

## Summary

Add a Settings-based "Coding Agents" registration surface so users can enable built-in agent providers for Appraise
planning. V1 uses built-in provider types, stores no secrets, makes Codex the first fully launchable provider, and keeps
provider runs read-only and planning-only by default. A successful provider planning run must create or revise a durable
Appraise plan through Appraise MCP/coordinator APIs, then stop at Appraise-owned plan review.

## Key Changes

- Extend the existing provider registration model instead of replacing it:
  - Add persisted probe/config fields to `ProviderAdapterRegistration`: executable path override, detected version,
    probe status/message, last probed time, default profile/model, launch enabled, and settings JSON.
  - Keep auth external: no API keys or secrets are stored in SQLite. Providers use the user's existing CLI login/env.
- Add built-in provider definitions:
  - `codex`: fully launchable in v1.
  - `claude` and `cursor`: visible built-in provider cards with probe/setup state; only launchable once their adapter
    probe confirms the required local agent command exists.
  - `mock-planning`: remains available for deterministic tests/dev.
- Add Settings UI for agent registration:
  - New "Coding Agents" panel under `/settings`.
  - Cards for Codex, Claude, Cursor, and Mock showing installed/missing, executable, version, capabilities, enabled
    state, and setup guidance.
  - Actions: probe, enable/disable, set executable override, set default profile/model where supported.
  - `/provider-runs` consumes only enabled and launchable providers, and links back to Settings when none are ready.
- Add provider registration services/actions/API:
  - Service methods for listing built-ins, probing a provider, updating registration settings, enabling/disabling
    providers, and resolving a launchable adapter.
  - Coordinator API endpoints for provider list/probe/update so MCP/CLI clients can inspect the same state.
  - AppraiseJS client/MCP additions: `provider_list`, `provider_probe`, and a resource like `appraise://providers`.
- Implement Codex planning adapter:
  - Probe with configured executable or PATH `codex --version`.
  - Launch with `codex exec --json --cd <targetProjectPath> --sandbox read-only --ask-for-approval never -`.
  - Pass Appraise MCP config through Codex `-c` overrides using the existing stdio shape:
    `appraisejs mcp --cwd <hubProject> --base-url <baseUrl>`.
  - Prompt Codex to call Appraise planning tools, create/revise the target-bound plan, and stop at `plan_review_ready`.
  - Normalize JSONL/stdout/stderr/process exit into provider events; cancellation terminates the child process and
    records provider-run cancellation only.
- Tighten planning success semantics:
  - Provider run service records pre/post plan state for the selected target project.
  - A run is `completed` only when a new or revised Appraise plan is detected for the target; otherwise it becomes
    `recovery_required` with event output and guidance.
  - Provider run status must never approve plan review, publish validations, accept baselines, or advance implementation
    gates.

## Test Plan

- Unit tests:
  - Provider registry/probe service for installed, missing, disabled, executable override, and no-secret persistence.
  - Codex command builder verifies read-only sandbox, MCP config overrides, target cwd, stdin prompt, and no global config
    mutation.
  - Provider run success/failure detection around pre/post plan projection snapshots.
  - Coordinator API and server action validation for provider list/probe/update.
- UI tests:
  - Settings renders provider cards and probe/enable states.
  - Provider Runs hides unavailable providers and shows a Settings CTA when no launchable provider exists.
  - Codex enabled state appears as selectable for planning runs.
- Integration/E2E:
  - Fake Codex executable fixture emits JSONL and simulates MCP plan creation; verify provider run completes with a
    detected plan id.
  - Existing MCP E2E updated to include provider list/probe resources/tools.
  - Existing full validation remains required: focused Vitest, package MCP tests, `npm run validate`, `npm run build`,
    Fallow, React Doctor, and manual UI smoke through Settings and Provider Runs.

## Assumptions

- V1 is built-in providers only, not arbitrary custom command registration.
- Codex is the first fully functional provider; Claude/Cursor are represented in the registration UI but do not pretend
  to launch until their probes prove a safe local agent command.
- Secrets stay outside Appraise; users authenticate with provider CLIs separately.
- Default execution is read-only planning. Workspace-write implementation runs are a later feature.
- Appraise remains the lifecycle authority; provider output is evidence, not approval.
