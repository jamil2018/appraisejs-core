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

For stdio-only clients, the command shape is:

```bash
appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000
```

Tool visibility requires registering the current endpoint or stdio command and restarting or reconnecting the MCP
client. Do not report tools as available until the client has completed that refresh.

After `plan_review_ready`, agents must call `plan_wait_for_approval` and enter standby or return a compact
continuation state. Pending approval is not completion.

## Troubleshooting

- `UNAUTHORIZED`: identity exists but the token is not accepted for the current project.
- `project-mismatch`: the client and server fingerprints point at different projects.
- Malformed identity: rerun `appraisejs doctor --json` and recreate local credentials if instructed.
- Endpoint or transport failure: verify web and MCP processes are running and that local sandbox rules allow the bind.
- Missing tools: rerun setup, update the client registration, then restart or reconnect the client.

When reporting validation, distinguish browser/UI approval from backend, service, or MCP approval.
