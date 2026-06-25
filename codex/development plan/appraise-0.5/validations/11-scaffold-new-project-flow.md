# 11 - Scaffold and New-Project Flow

## Goal

Prove a newly scaffolded AppraiseJS project supports the same planning lifecycle and excludes local-only coordinator
artifacts from scaffolded source.

## Builds On

- Passes 01 through 10 proved the root app lifecycle.

## Validation Scope

- Newly scaffolded app creation.
- Start and setup in a clean project.
- Plan creation, review, approval, validation review, baseline acceptance, implementation, and completion where feasible.
- Template parity for coordinator/API/MCP services.
- Exclusions for local tokens, leases, personal layouts, events, locks, reports, traces, and machine-local files.

## Suggested Actions

1. Run the scaffold command into a temporary writable project.
2. Start the scaffolded app and run diagnostics.
3. Create and approve a minimal plan through the scaffolded app path.
4. Continue at least through validation review; run deeper lifecycle stages when scaffold fixtures permit.
5. Run documented template sync checks and inspect generated diffs.

## Evidence To Capture

- Scaffold command, project path, and startup result.
- Diagnostic and plan lifecycle evidence from the scaffolded app.
- Template sync output and artifact exclusion checks.

## Exit Criteria

- Scaffolded projects can enter the same AppraiseJS planning workflow.
- Local-only state is not committed or shipped in templates.
- Final pass may run negative gates and release confidence checks.
