# appraisejs Package Agent Guidance

This package provides the public AppraiseJS CLI, registry installer, coordinator client, and MCP server. Follow root
`AGENTS.md` first, then this file for package-specific routing.

## Sources Of Truth

- CLI entry point: `src/cli.ts`.
- MCP server: `src/mcp.ts`.
- Coordinator client and project binding: `src/coordinator-client.ts`, `src/project.ts`, `src/project-identity.ts`,
  and `src/diagnostics.ts`.
- Plan file safety: `src/plan-file.ts` and `src/plan-source.ts`.
- Package contract: `docs/coordinator-api-mcp.md` and `docs/agent-mcp-setup.md`.

## Rules

- MCP supports stdio and Streamable HTTP; stdout is reserved for stdio protocol traffic.
- Diagnostics and recovery guidance should go to stderr when stdio MCP is active.
- A coordinator is bound to one canonical project fingerprint.
- MCP failures must be returned to the MCP client; do not automatically fall back to a CLI path.
- Keep `npm run setup:mcp` and docs aligned when endpoint, transport, or registration behavior changes.

## Validation

- Run `npm --prefix packages/appraisejs run test` for package behavior changes.
- Run `npm --prefix packages/appraisejs run test:mcp:e2e` for MCP transport or tool changes when a live check is
  needed.
- Run `npm run build:appraisejs` for release-like CLI/MCP changes.
