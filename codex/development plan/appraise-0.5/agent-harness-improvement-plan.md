# Updated Agent Harness Improvement Plan

## Summary

Update the agent harness around the current AppraiseJS flows: full plan lifecycle gates, MCP/event ownership, and the new bundled-only scaffold flow with `templates/base` plus flavor overlays. The main goal is to remove stale routing, make agent entry points obvious, and prevent old template instructions from being followed.

## Key Changes

- Refresh `AGENTS.md` as the canonical routing layer with current task paths:
  - Appraise plan lifecycle: `docs/coordinator-api-mcp.md`, `docs/baseline-execution.md`, `docs/implementation-checkpoints.md`, `.agents/skills/appraise-*`.
  - Scaffold/template work: `docs/scaffold-template-sync.md`, `packages/create-appraisejs/scripts/prepare-template.ts`, `packages/create-appraisejs/templates/base`, `packages/create-appraisejs/templates/flavors/*`.
  - Runtime/test-run/report work: `docs/test-run-runtime.md`, `src/actions/test-run`, `src/services/test-run`, executor/log/report paths.
- Replace stale `.cursor/rules/project-context.mdc` with a short current pointer to `AGENTS.md`; remove obsolete references to `/Users/hasnat/...`, `templates/default`, root `templates/*`, `sync-template`, package `sync-templates`, and `download-repo`.
- Add harness docs that make repeated agent work faster and less error-prone:
  - `docs/agent-harness.md`: the top-level agent map covering repo topology, source-of-truth routing, generated-output boundaries, Appraise lifecycle sequence, scaffold composition flow, MCP setup, validation matrix, and sandbox gotchas.
  - `docs/agent-task-recipes.md`: short recipes for common work such as CRUD/domain changes, Prisma schema changes, plan lifecycle/MCP changes, scaffold template changes, test-run/report runtime changes, and React route/component changes.
  - `docs/agent-validation-matrix.md`: a decision table mapping touched areas to focused validation commands and escalation points, replacing guesswork from the flat command list.
  - `docs/agent-generated-artifacts.md`: a source-vs-generated map for `automation/*`, `appraise/plans/*`, scaffold templates, flavor overlays, registry output, reports, and local runtime artifacts.
  - `docs/agent-lifecycle-flow.md`: an agent-readable Appraise plan lifecycle walkthrough from plan creation through review, validation preparation, validation review, baseline, implementation, final validation, completion, cancellation, and reconnect.
  - `docs/agent-scaffold-flow.md`: a scaffold-specific flow doc that explicitly states the current bundled-only model, package `templates/base`, flavor overlays, and `prepare-template` as the only template preparation path.
- Add focused repo-local skills:
  - `appraise-repo-navigation`: choose files/tests by domain and task type.
  - `appraise-lifecycle-flow`: plan review, validation preparation, validation review, baseline, implementation checkpoints, final validation, completion, cancellation/reconnect.
  - `appraise-scaffold-maintenance`: bundled-only base plus flavor overlays, `prepare-template`, seeded DB rules, and no direct template patching unless template-only.
- Tighten existing Appraise skills so they name current gate transitions and evidence expectations, especially `validations_approved`, `baseline_accepted`, `in_progress`, `validation_passed`, and hash-bound completion sign-off.

## Public Interfaces

- No product runtime APIs should change.
- Agent-facing docs/skills should explicitly describe the current MCP setup:
  - HTTP endpoint from `npm run setup:mcp`: `http://127.0.0.1:3010/mcp`.
  - Stdio fallback: `appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000`.
  - MCP tools only appear after the client registers/restarts against the active server.
- Scaffold guidance should treat `npm --prefix packages/create-appraisejs run prepare-template` as the only current root-to-package template preparation flow.

## Test Plan

- Run `npx prettier --check AGENTS.md docs/agent-*.md .agents/skills/*/SKILL.md .cursor/rules/project-context.mdc`.
- Run `npm run setup:mcp` and verify docs match the printed endpoint and stdio config.
- Run stale-reference checks over active harness docs: `rg "templates/default|sync-template\\b|sync-templates\\b|/Users/hasnat|AGENT\\.md|download-repo" AGENTS.md docs .cursor .agents packages/create-appraisejs/README.md`.
- If only harness docs/skills change, no app build is needed. If package scripts or MCP scripts change, also run `npm --prefix packages/create-appraisejs run test` and the relevant build target.

## Assumptions

- Historical plans under `codex/development plan/*` and `.cursor/plans/*` can remain historical unless they are converted into active agent instructions.
- The current scaffold model is bundled-only: one full `templates/base` plus small `templates/flavors/starter` and `templates/flavors/blank` overlays.
- The harness should make normal AppraiseJS lifecycle work event-driven and Appraise-owned, not chat-approved.
