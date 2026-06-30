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

## Registration

Print current registration details:

```bash
npm run setup:mcp
```

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

For stdio-only clients, the command shape is:

```bash
appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000
```

Tool visibility requires registering the current endpoint or stdio command and restarting or reconnecting the MCP
client. Do not report tools as available until the client has completed that refresh.

After reconnect, verify these expected capabilities:

- Tools: `planning_session_create`, `plan_review_loop`, `validation_publish`, `provider_run_create`
- Resources: `appraise://agent-guide`, `appraise://workflow/planning`, `appraise://workflow/standby`,
  `appraise://provider-runs`

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
long-review or host-limit fallback. No wait call before complete URL handoff. Before entering or continuing standby,
agents must present the complete direct browser URL, `appraise://` URL, plan ID, goal, description, revision,
lifecycle, content hash, `currentAfterSequence`, `nextAfterSequence`, and recommended wait call. Pending review or
pending approval is not completion.

After `validation_preparation_started`, agents must create AppraiseJS-native validation artifacts and call
`validation_publish` before entering validation review standby. The publish response should include the direct
validation review URL, `appraise://` URL, `ValidationArtifact` path, validation count, changed-file count, manifest
paths, reused registry/template step paths, new custom step paths, and the next review action.

## Troubleshooting

- `UNAUTHORIZED`: identity exists but the token is not accepted for the current project.
- `project-mismatch`: the client and server fingerprints point at different projects.
- Malformed identity: rerun `appraisejs doctor --json` and recreate local credentials if instructed.
- Endpoint or transport failure: verify web and MCP processes are running and that local sandbox rules allow the bind.
- Missing tools: rerun setup, update the client registration, restart or reconnect the client, and verify
  `planning_session_create` plus the workflow resources before proceeding.

When reporting validation, distinguish browser/UI approval from backend, service, or MCP approval.
