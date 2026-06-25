# 01 - Connection, Setup, and Diagnostics

## Goal

Prove a coordinator can reliably determine whether AppraiseJS is reachable, correctly configured, authenticated, and
bound to the intended project before any plan is created.

## Prerequisites

- Current source, schema, package scripts, and docs have been inspected.
- No AppraiseJS plan lifecycle state is assumed yet.

## Validation Scope

- AppraiseJS not running.
- MCP endpoint or base URL misconfiguration.
- Missing or malformed `.appraisejs/coordinator.json`.
- Wrong token and auth failure.
- Project fingerprint mismatch.
- Unreachable API and transport failure.
- Dirty worktree warning.
- Non-Git reduced-assurance warning.
- No silent MCP-to-CLI fallback.

## Suggested Actions

1. Run `npm run setup:mcp` and confirm the documented endpoint and stdio snippets.
2. Run diagnostic paths through CLI/package client and MCP where available.
3. Force each failure mode with temporary isolated workspaces or mocked fetches.
4. Verify recovery messages identify the exact broken category.
5. Add or update focused tests for any missing diagnostic branch.

## Evidence To Capture

- Diagnostic JSON or MCP response for each failure category.
- Confirmation that stdout remains protocol-clean for MCP.
- Test files that cover auth, project mismatch, transport failure, and fallback behavior.

## Exit Criteria

- Coordinator setup failures fail early with actionable recovery.
- Dirty/non-Git states are visible before plan creation.
- Next pass may create plans through the real coordinator/API/MCP path.
