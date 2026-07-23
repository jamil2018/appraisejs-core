# Agent Harness Guardrails

Use this file when editing active agent-facing instructions, docs, skills, package READMEs, Cursor/Codex routing, or
the PR template.

## Drift Rules

- Root `AGENTS.md` is the compact entry point; detailed workflow guidance belongs in `docs/agent-*`.
- Package-specific instructions belong in package `AGENTS.md` files.
- Repo-local skills should be concise and orchestration-focused.
- Project custom-agent files should keep role authority, model choice, sandbox, and stopping conditions explicit.
- Static Codex configuration requests a role, context boundary, and sandbox; it is not evidence that the host used the
  named role or enforced the requested effective sandbox. Preserve the host receipt when available and disclose the
  limitation when it is not.
- Do not add checkout-specific absolute trust entries or enable plugins merely because they are locally available.
  Each expanded authority needs an explicit, reviewed purpose and a validation contract.
- Swarm observations cover performance, model fit, resources, governance, and harness usability. They must be noted
  and presented to the user before any guided update; the harness must not mutate agent roles or routing autonomously.
- Historical plans are not active instructions unless the user names one as the task.
- MCP setup text must mirror `npm run setup:mcp`.
- Scaffold docs must describe the current bundled base-plus-flavors model.
- Major behavior, architecture, workflow, package, schema, scaffold, lifecycle, or toolchain changes must update the
  matching current docs in the same change set.
- If active docs already deviate from current source, scripts, package layout, setup commands, or generated-artifact
  ownership, correct that drift before finishing the task.
- The complete evolution closure is note → notify → host-conversation guidance → update → verification → independent
  re-evaluation → recorded linkage. `.appraisejs/swarm-events.jsonl` is a local, Git-ignored process journal, not an
  authority for user guidance, Appraise lifecycle decisions, or final acceptance.

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
