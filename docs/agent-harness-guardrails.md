# Agent Harness Guardrails

Use this file when editing active agent-facing instructions, docs, skills, package READMEs, Cursor/Codex routing, or
the PR template.

## Drift Rules

- Root `AGENTS.md` is the compact entry point; detailed workflow guidance belongs in `docs/agent-*`.
- Package-specific instructions belong in package `AGENTS.md` files.
- Repo-local skills should be concise and orchestration-focused.
- Historical plans are not active instructions unless the user names one as the task.
- MCP setup text must mirror `npm run setup:mcp`.
- Scaffold docs must describe the current bundled base-plus-flavors model.

## Stale Reference Classes

The harness check rejects active surfaces that point agents to retired scaffold template directories, retired template
sync commands, old personal checkout paths, remote-template download paths for current scaffolding, singular agent
instruction filenames, or MCP tool claims that omit registration and restart requirements.

## Integrity Check

Run:

```bash
npm run check:harness
```

The check validates active harness surfaces only. It intentionally excludes historical planning directories so old
plans can remain as reference material without weakening current instructions.
