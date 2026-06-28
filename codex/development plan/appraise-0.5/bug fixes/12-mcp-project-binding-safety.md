# Session 12: MCP Project Binding Safety

## Goal

Make AppraiseJS MCP HTTP sidecar project binding explicit, visible in every workflow, and guarded before mutations so a
server launched for one project cannot be mistaken for a current-workspace connection from another Codex project.

## Current Deficiencies

- The HTTP MCP endpoint is reachable from any local workspace through `http://127.0.0.1:3010/mcp`.
- The sidecar remains bound to the project it was launched with, but a caller from another workspace can still
  initialize the MCP session, list tools, and call diagnostics.
- `project_diagnostic` reports server project identity, but the response does not make the launch-project binding
  prominent enough to prevent current-workspace assumptions.
- Tool responses do not consistently repeat the bound project context before project-scoped mutations.
- Mutating tools trust the MCP server's launch context and do not require the caller to confirm or prove the intended
  project context.
- `npm run setup:mcp` and local setup docs do not clearly distinguish a launch-project sidecar from a dynamic
  caller-workspace sidecar.

## Work

1. Add a bound-project block to MCP diagnostics, resources, and setup output containing canonical project path,
   fingerprint, package name when available, launch command mode, base URL, and MCP endpoint.
2. Add a clear diagnostic warning when the MCP client does not provide caller workspace context, explaining that the
   sidecar is bound to the launch project and does not infer the caller's current workspace.
3. Add optional caller-context headers or initialization metadata for HTTP MCP clients that can provide current
   workspace path and expected project fingerprint.
4. Compare caller context to the bound project during diagnostics. Return `ok: false` or a blocking check when the
   caller explicitly identifies a different workspace, unless an explicit cross-project allowance is configured.
5. Require mutating MCP tools to pass a project-binding guard before calling coordinator APIs. The guard should reject
   mismatched caller context with a structured `project-binding-mismatch` error and recovery guidance.
6. Keep read-only diagnostic and project-resource calls available across projects, but make their output unmistakably
   identify the bound target project.
7. Add an escape hatch for intentional cross-project use, such as an environment variable or explicit MCP option, and
   ensure every mutating response includes `crossProjectAllowed: true` when that mode is active.
8. Update `plan_create`, `plan_revise`, `plan_start`, task updates, event acknowledgement, validation tools, baseline
   tools, and implementation tools so successful mutation responses include compact target project metadata.
9. Update `npm run setup:mcp`, `docs/coordinator-api-mcp.md`, and agent skills to instruct users to start one sidecar
   per intended project or use stdio `appraisejs mcp --cwd <project>` for project-specific registration.
10. Add stale-sidecar recovery guidance: if diagnostics show a different bound project than expected, stop the old
    sidecar and restart it from the desired project.

## Required Rules

- A Streamable HTTP MCP sidecar is bound to exactly one canonical project unless a future explicit project-selection
  protocol is implemented.
- The default behavior is safe: cross-project mutation is rejected when caller context is known to mismatch.
- Read-only diagnostics remain useful from any workspace, but must plainly report the bound target project.
- Mutating tools must not rely on the caller's current directory; they must operate only on the bound project after the
  binding guard passes.
- No token, credential, or secret is returned in diagnostics, setup output, tool results, or error payloads.
- Existing stdio MCP behavior remains compatible and continues to bind to the supplied `--cwd`.
- The implementation must not require Codex-specific APIs; caller-context support should degrade gracefully for MCP
  clients that cannot provide workspace metadata.
- Cross-project override must be explicit, visible in diagnostics, and visible in mutating tool responses.

## Public Contracts

- Extend `project_diagnostic` with `boundProject`, `callerProject`, `bindingStatus`, `crossProjectAllowed`,
  `checks`, `warnings`, and `recoveryActions`.
- Extend `appraise://project` with the same bound-project metadata.
- Add a structured error code `project-binding-mismatch` for mutating tools and coordinator client calls.
- Add optional HTTP context fields, such as `X-Appraise-Caller-Project` and `X-Appraise-Caller-Fingerprint`, when the
  client or sidecar can supply them.
- Add an explicit configuration switch for intentional cross-project mutation, for example
  `APPRAISE_MCP_ALLOW_CROSS_PROJECT=1`.
- Add compact `targetProject` metadata to successful mutating tool results.

## Acceptance Criteria

- From repo B, connecting to a sidecar launched in repo A makes diagnostics prominently report repo A as the bound
  project and warns that repo B is not automatically selected.
- If repo B caller context is available, diagnostics report a binding mismatch with actionable recovery.
- Mutating tools reject a known repo B to repo A mismatch by default before touching plans, reviews, validations,
  baselines, or implementation state.
- Successful mutating tool calls include enough target project context to identify repo A before the user trusts the
  result.
- Intentional cross-project mode can be enabled explicitly and is visible in diagnostics and mutation responses.
- `npm run setup:mcp` output makes it clear that the printed HTTP endpoint is tied to the project that launches it.
- Documentation tells users how to stop a stale sidecar, restart from the desired project, or use stdio `--cwd` for a
  project-specific connection.
- Existing single-project MCP E2E tests continue to pass.

## Validation

- Unit tests for project-binding comparison, unknown caller context, matching context, mismatched context, and explicit
  cross-project allowance.
- Diagnostics tests covering bound project metadata, warnings, structured mismatch checks, and secret redaction.
- MCP tests proving read-only diagnostics work cross-project while mutating tools reject a known mismatch.
- HTTP MCP E2E test with two temporary projects: launch sidecar for project A, connect from project B context, verify
  mismatch diagnostics and mutation rejection, then verify explicit allowance behavior.
- Setup script snapshot or focused assertion tests for the new project-binding copy.
- Focused ESLint and Prettier checks for changed files.
- Package build and root build for MCP, diagnostics, and setup-script changes.

## Handoff

Provide the binding-status schema, mismatch error payload, setup output example, docs update, and an MCP transcript
showing repo A sidecar access from repo B with read-only diagnostics, mutation rejection, and explicit cross-project
override behavior. Do not broaden this session into multi-project selection unless the project-selection flow is
explicitly approved as a separate feature.
