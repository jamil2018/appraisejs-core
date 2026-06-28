# Robust Agent Harness Improvement Plan

## Summary

Build a repo-local agent harness that makes AppraiseJS easier, safer, and faster for coding agents to work in. The
harness should centralize routing in `AGENTS.md`, add focused agent docs and skills, remove stale cross-agent
instructions, expose the current MCP setup clearly, and add guardrails that catch harness drift before it misleads an
agent.

This is a harness-only plan. It should not change AppraiseJS product behavior, plan lifecycle semantics, scaffold
runtime behavior, or public package APIs unless a change is explicitly needed to support agent setup or validation.

## Key Changes

### Canonical Agent Routing

- Refresh `AGENTS.md` as the compact entry point for all agents:
  - Keep instruction priority, never-do rules, canonical source files, and completion criteria.
  - Add a task router for CRUD/domain work, Prisma schema work, automation sync, test execution/reporting, Appraise
    lifecycle/MCP work, scaffold/template work, UI work, E2E work, and package work.
  - Point to detailed `docs/agent-*.md` docs instead of growing `AGENTS.md` into a long handbook.
- Replace stale `.cursor/rules/project-context.mdc` with a short current rule that defers to root `AGENTS.md` and
  current `docs/agent-harness.md`.
- Review `.codex/config.toml` and remove or correct stale absolute project trust entries such as old checkout paths.
- Add package-scoped instructions:
  - `packages/create-appraisejs/AGENTS.md`: bundled-only scaffold model, `templates/base`, flavor overlays,
    `prepare-template`, seeded DB invariants, and package validation.
  - `packages/appraisejs/AGENTS.md`: CLI/MCP boundaries, stdio stdout discipline, project binding, diagnostics, and
    no automatic CLI fallback from MCP failures.

### Agent Docs

- Add `docs/agent-harness.md` as the top-level agent map: repo topology, source-of-truth routing, major workflows,
  generated-output boundaries, MCP setup, validation strategy, sandbox gotchas, and stale-instruction traps.
- Add `docs/agent-task-recipes.md` with short recipes for common work:
  - CRUD/domain changes.
  - Prisma schema and migration changes.
  - Appraise lifecycle/MCP changes.
  - Scaffold/template changes.
  - Test-run/report/log changes.
  - React route/component changes.
  - Automation sync changes.
  - E2E/Playwright changes.
- Add `docs/agent-validation-matrix.md`, a decision table mapping touched areas to focused checks, broader checks, and
  when `npm run build`, package tests, `prepare-template`, E2E, Fallow, or React Doctor are appropriate.
- Add `docs/agent-generated-artifacts.md`, a source-vs-generated map for `automation/*`, `automation/reports`,
  `appraise/plans/*`, plan review/validation sidecars, scaffold templates, flavor overlays, registry output, prepared
  databases, `.appraisejs/*`, `.next`, and test artifacts.
- Add `docs/agent-lifecycle-flow.md`, an agent-readable walkthrough of the Appraise workflow:
  - Plan creation and review readiness.
  - Plan approval and change requests.
  - Validation preparation and file approval.
  - Validation review and feedback routing.
  - Baseline execution, acknowledgement, and acceptance.
  - Implementation checkpoints, blocking feedback, pause/resume/cancel.
  - Final validation, completion review, hash-bound sign-off, and reconnect.
- Add `docs/agent-scaffold-flow.md`, focused on the current scaffold model:
  - No root `templates/` source tree.
  - No remote template download path.
  - One package-owned `packages/create-appraisejs/templates/base`.
  - Flavor overlays under `packages/create-appraisejs/templates/flavors/{starter,blank}`.
  - `npm --prefix packages/create-appraisejs run prepare-template` as the only root-to-package preparation flow.
- Add `docs/agent-mcp-setup.md` or fold equivalent content into `docs/agent-harness.md`:
  - `npm run dev` starts web plus MCP.
  - `npm run dev:mcp` starts only the MCP sidecar.
  - `npm run setup:mcp` prints the current HTTP endpoint and stdio fallback.
  - Default HTTP MCP endpoint is `http://127.0.0.1:3010/mcp`.
  - Stdio fallback is `appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000`.
  - Tool visibility requires registering/restarting the MCP client after setup changes.
- Add `docs/agent-harness-guardrails.md` for drift rules, stale-reference patterns, and what the harness integrity
  check enforces.

### Repo-Local Skills

- Add focused skills under `.agents/skills`:
  - `appraise-repo-navigation`: choose source files, tests, docs, and validation commands by task type.
  - `appraise-lifecycle-flow`: use Appraise-owned lifecycle gates correctly and never substitute chat approval for
    plan, validation, baseline, or completion gates.
  - `appraise-scaffold-maintenance`: maintain scaffold source, base template, flavor overlays, seeded DBs, and
    `prepare-template` safely.
  - `appraise-sync-artifacts`: work with automation sync outputs, dry-run sync, generated features, locators,
    environments, tags, suites, cases, and template steps without patching generated artifacts incorrectly.
  - `appraise-runtime-validation`: work on test-run execution, logs, reports, Cucumber runtime, Playwright runtime, and
    validation/report evidence.
- Tighten existing Appraise skills so they name current gate transitions and evidence expectations, especially
  `changes_requested`, `validations_approved`, `baseline_accepted`, `in_progress`, `validation_passed`, `completed`,
  terminal cancellation, event acknowledgement, and hash-bound completion sign-off.
- Keep each skill concise and orchestration-focused; detailed routing belongs in `docs/agent-*.md`.

### MCP And Tooling Harness

- Keep `npm run setup:mcp` as the source of truth for MCP registration snippets and ensure docs mirror its output.
- Consider extending `scripts/print-mcp-config.mjs` to print a Codex-oriented snippet in addition to generic stdio
  config if the target client has a stable format.
- Add MCP troubleshooting guidance for:
  - Tools not visible because the client has not been restarted.
  - `UNAUTHORIZED`, `project-mismatch`, malformed identity, endpoint, and transport failures.
  - Managed-sandbox `tsx` or localhost binding failures.
  - Distinguishing backend/service approval from browser/UI approval in reports.
- Add a small smoke recipe for `npm run smoke:coordinator` and the MCP E2E package test path, without making every
  harness change run the full lifecycle suite.

### Harness Guardrails

- Add `scripts/check-agent-harness.mjs` and `npm run check:harness`.
- The check should validate active harness surfaces only: `AGENTS.md`, `docs/agent-*.md`, `.agents/skills/**`,
  `.cursor/rules/project-context.mdc`, `.codex/config.toml`, package `AGENTS.md` files, package READMEs, and the PR
  template. Historical plans under `codex/development plan/*` and `.cursor/plans/*` should be excluded unless they are
  promoted into active instructions.
- The check should fail when active harness surfaces contain stale or dangerous references:
  - `templates/default`, root `templates/starter`, root `templates/blank`.
  - `npm run sync-template`, package `sync-templates`, or retired root-to-package sync flows.
  - Old absolute paths such as `/Users/hasnat/...` or `/Users/mdhasnat/...`.
  - `download-repo` as a current scaffold path.
  - `AGENT.md` when `AGENTS.md` is the current instruction file.
  - Active docs claiming MCP tools are available without registration/restart.
- The check should also verify referenced `docs/agent-*.md` files and new `.agents/skills/*/SKILL.md` files exist.
- Add `npm run check:harness` to the validation matrix and optionally CI after the first implementation pass is stable.

### Cross-Agent And Review Surfaces

- Update `.github/PULL_REQUEST_TEMPLATE.md` with harness-aware checklist items:
  - Agent instructions/docs updated when routing changes.
  - `prepare-template` run for scaffold-relevant root changes.
  - Generated artifacts reviewed and explained.
  - MCP docs/setup updated when tool or transport behavior changes.
  - Harness integrity check run for docs/skills/routing changes.
- Update `CONTRIBUTING.md` only where it conflicts with current setup, validation, scaffold, or generated-artifact
  rules. Avoid duplicating the full agent handbook there.
- Keep package READMEs user-facing, but remove or clarify wording that could be mistaken for old harness routing.
- Leave historical plans in place, but make active routing docs clear that historical plans are reference-only unless
  the user names one as the task source.

## Public Interfaces

- No AppraiseJS product runtime APIs should change.
- No Appraise plan lifecycle state names or MCP tool semantics should change as part of this harness work.
- New public developer-facing surfaces:
  - `docs/agent-*.md` files.
  - `.agents/skills/appraise-*` harness skills.
  - `packages/create-appraisejs/AGENTS.md`.
  - `packages/appraisejs/AGENTS.md`.
  - `npm run check:harness`.
- MCP setup documentation must stay aligned with `npm run setup:mcp`, not hand-maintained guesses.

## Test Plan

- Run formatting checks:
  - `npx prettier --check AGENTS.md docs/agent-*.md .agents/skills/*/SKILL.md .cursor/rules/project-context.mdc packages/*/AGENTS.md .github/PULL_REQUEST_TEMPLATE.md`
- Run MCP setup verification:
  - `npm run setup:mcp`
  - Confirm `docs/agent-mcp-setup.md` or `docs/agent-harness.md` matches the printed endpoint and stdio fallback.
- Run stale-reference and existence checks:
  - `npm run check:harness`
  - `rg "templates/default|sync-template\\b|sync-templates\\b|/Users/hasnat|/Users/mdhasnat|AGENT\\.md|download-repo" AGENTS.md docs/agent-*.md .agents .cursor .codex packages/*/AGENTS.md packages/*/README.md .github/PULL_REQUEST_TEMPLATE.md`
- For docs/skills-only changes, no app build is required.
- If package scripts, MCP scripts, package `AGENTS.md`, or scaffold docs change, also run:
  - `npm --prefix packages/create-appraisejs run test`
  - `npm run build:appraisejs` when MCP/CLI docs or examples rely on built package behavior.
- If CI or PR template changes are included, verify the modified YAML/Markdown with Prettier where applicable.

## Assumptions

- Current scaffold behavior is bundled-only: one full `packages/create-appraisejs/templates/base` plus small
  `templates/flavors/starter` and `templates/flavors/blank` overlays.
- Historical planning docs remain historical unless the user explicitly names them as executable specs.
- Agent harness work should optimize for correct first navigation, fewer stale-path mistakes, and narrower validation,
  not for replacing the existing product documentation site.
- The harness should make normal AppraiseJS work event-driven and Appraise-owned, not chat-approved.
