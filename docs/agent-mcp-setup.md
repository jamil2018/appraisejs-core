# Agent MCP Setup

`npm run setup:mcp` is the source of truth for local MCP registration text. Keep this document aligned with that
script instead of hand-maintaining alternate snippets.

## Development Servers

Start the web app plus Streamable HTTP MCP sidecar:

```bash
npm run dev
```

Start only the MCP sidecar:

```bash
npm run dev:mcp
```

Default HTTP endpoint:

```bash
http://127.0.0.1:3010/mcp
```

AppraiseJS 0.5 supports loopback access only. The web server and HTTP MCP sidecar reject non-loopback bind hosts;
remote forwarding and multi-user exposure are unsupported. HTTP MCP also requires the project coordinator bearer
identity, validates the peer, `Host`, and optional `Origin` before routing, and applies fixed body and concurrency
bounds. Health checks are local-only but do not require bearer authentication.

## Registration

Print current registration details:

```bash
npm run setup:mcp
```

For Codex, that command now prints the exact inspect and refresh commands for the resolved endpoint. The supported
user flow is:

1. Start AppraiseJS with `npm run dev` (or only the sidecar with `npm run dev:mcp`).
   Both commands deploy pending Prisma migrations before starting services and stop immediately if database readiness
   fails. Use these entry points instead of starting the web and MCP processes separately.
2. Run `npm run setup:mcp`.
3. Inspect the active entry with `codex mcp get appraisejs`.
4. If its URL or transport differs from the printed configuration, run the printed `codex mcp remove appraisejs`
   and `codex mcp add appraisejs --url <resolved-endpoint>` commands.
5. Restart or reconnect Codex, then start a new task. MCP capabilities are discovered when a task connects and an
   already-running task keeps its original tool snapshot.
6. Verify `codex mcp get appraisejs`, endpoint reachability, `project_diagnostic`, and the expected resources/tools.

Do not repeatedly edit `~/.codex/config.toml` by hand. Use `codex mcp get/add/remove` so Codex owns the config shape.
Re-register only when the endpoint or transport changes; a server-side tool change normally requires restarting the
Appraise sidecar and reconnecting Codex, not rewriting an already-correct entry.

Print agent-oriented setup, skill, restart, and standby guidance:

```bash
npm run setup:agent
```

The package-level equivalent is:

```bash
appraisejs agent setup
```

For machine-readable recovery details, use:

```bash
appraisejs agent setup --json
```

The JSON output includes the HTTP endpoint and required `Authorization: Bearer ...` header for machine registration.
Normal human-readable setup output deliberately hides the token. Treat the JSON output as local credential material:
do not paste it into logs, issues, or committed configuration.

For stdio-only clients, the command shape is:

```bash
appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000
```

Tool visibility requires registering the current endpoint or stdio command and restarting or reconnecting the MCP
client. Do not report tools as available until the client has completed that refresh.

After reconnect, verify these expected capabilities:

- Tools: `planning_session_create`, `plan_review_loop`, `validation_ast_check`, `validation_ast_preview`,
  `validation_ast_compile`, `test_run_preflight`,
  `test_run_read`, `test_run_diagnose`
- Resources: `appraise://agent-guide`, `appraise://workflow/planning`,
  `appraise://workflow/validation-preparation`, `appraise://workflow/standby`

Provider-native runs are experimental and disabled by default. If `APPRAISE_EXPERIMENTAL_PROVIDER_RUNS=true` is set
before starting AppraiseJS, the MCP server also exposes provider resources and tools such as
`appraise://provider-runs` and `provider_run_create`.

If `project_diagnostic`, `tools/list`, or `resources/list` shows older capabilities, treat the MCP server or client
registration as stale. Restart or reconnect the MCP client, restart the Appraise MCP sidecar, rerun
`npm run setup:mcp` and `npm run setup:agent`, then call `project_diagnostic` again.

Setup text can be visible in the repository even when native MCP tools are not loaded in the host session. In that
case, do not claim the native tools are available and do not continue as if Appraise approval can be observed. Recover
with this sequence:

1. Register the Streamable HTTP endpoint or stdio command printed by setup.
2. Restart or reconnect the MCP client.
3. Run `appraisejs agent setup --json` and inspect `httpMcpEndpoint`, `stdioFallback`, and `expectedCapabilities`.
4. Verify HTTP endpoint reachability.
5. After reconnect, read `appraise://agent-guide`.
6. If native tools remain unavailable, stop and ask the user to reconnect or restart the client.

Raw JSON-RPC calls are for advanced troubleshooting only. They are not the ordinary agent path and should not replace
native MCP registration.

Agents should prefer `plan_review_loop` when it is available. Otherwise, after `plan_review_ready`, agents must call
`plan_wait_for_approval` and keep an active bounded wait or poll loop by default. Compact continuation state is only a
long-review or host-limit fallback. No wait call before the complete URL handoff for the current revision. Before
entering initial standby, agents must present the complete direct browser URL, `appraise://` URL, plan ID, goal,
description, revision, lifecycle, content hash, `currentAfterSequence`, `nextAfterSequence`, and recommended wait
call. Later unchanged waits use the compact `pending_unchanged` cursor, timing, and next-action delta without
repeating the brief or rendered handoff. Pending review or pending approval is not completion.

After `validation_preparation_started`, agents must create AppraiseJS-native validation artifacts and call
`validation_ast_compile` after exact check and preview receipt review before entering validation review standby. The compile response should include the direct
validation review URL, `appraise://` URL, `ValidationArtifact` path, validation count, changed-file count, manifest
paths, reused registry/template step paths, new custom step paths, and the next review action.
Set `APPRAISE_BROWSER_ORIGIN` to the canonical loopback browser origin when the app uses a non-default local port. Returned
review URLs include the target project. If validation review reports a stale current-state receipt while immutable
publication content remains valid, call `validation_review_reconcile` once and reread the review before submitting
the exact refreshed `reviewStateHash`.
Agents should read `appraise://workflow/validation-preparation` and the managed Validation AST contract for the
required validation artifact shape instead of inspecting AppraiseJS source files.
The artifact shape must include AppraiseJS-native modules, test suites, test cases, ordered test steps, locator groups,
and locators so users can review real tests in AppraiseJS and execute them later. Runtime Gherkin, step-definition, and
Playwright files are supporting evidence, not the primary review artifact.

## Troubleshooting

- `UNAUTHORIZED`: identity exists but the token is not accepted for the current project.
- `project-mismatch`: the client and server fingerprints point at different projects.
- Malformed identity: rerun `appraisejs doctor --json` and recreate local credentials if instructed.
- Endpoint or transport failure: verify web and MCP processes are running and that local sandbox rules allow the bind.
- Missing tools: rerun setup, update the client registration, restart or reconnect the client, and verify
  `planning_session_create` plus the workflow resources before proceeding.

When reporting validation, distinguish browser/UI approval from backend, service, or MCP approval.
