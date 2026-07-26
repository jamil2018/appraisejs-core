# Repository Agent Guidance

## Role of This File

This file is the routing and safety layer for coding agents working in AppraiseJS. Keep detailed product docs,
feature specs, API notes, and implementation plans in dedicated docs or source files. Use this file to decide where
to look, what is authoritative, what not to touch, and how to validate work.

## Mental Model

AppraiseJS is a local-first test management and execution platform. The app stores authored modules, suites, cases,
steps, locators, environments, tags, and templates in SQLite through Prisma. It generates Gherkin feature files, runs
tests with Cucumber and Playwright, parses reports, and displays run metrics.

This repo contains the root app and related packages, including `create-appraisejs`. Scaffold/template changes should
originate in the root/base source and flow through the template sync workflow.

## Instruction Priority

When instructions conflict, follow this order:

1. The user's explicit request and constraints.
2. This `AGENTS.md` file for repo-specific safety and routing.
3. Source code, tests, schemas, and config files.
4. Current docs such as `docs/*`, `README.md`, and `CONTRIBUTING.md`.
5. Historical plans under `codex/development plan/*`, which are reference-only unless the user names one.

## Sources of Truth

- Commands and scripts: `package.json`
- Database model: `prisma/schema.prisma`
- Prisma client setup: `src/config/db-config.ts`
- Agent harness map: `docs/agent-harness.md`
- Agent task recipes: `docs/agent-task-recipes.md`
- Agent validation matrix: `docs/agent-validation-matrix.md`
- Agent swarm routing and evolution: `.agents/skills/swarm-orchestrator/SKILL.md`
- Agent Graphify workflow: `docs/agent-graphify.md`
- Generated artifact map: `docs/agent-generated-artifacts.md`
- Appraise lifecycle flow: `docs/agent-lifecycle-flow.md`
- Scaffold flow: `docs/agent-scaffold-flow.md`
- MCP setup: `docs/agent-mcp-setup.md`
- Automation sync rules: `docs/automation-sync-rules.md`
- Scaffold/template sync rules: `docs/scaffold-template-sync.md`
- Test run runtime map: `docs/test-run-runtime.md`
- Server action/service conventions: `docs/server-actions-conventions.md`
- Component organization rules: `docs/component-organization-rules.md`
- Cucumber runtime config: `cucumber.mjs`
- Formatting and line endings: `.prettierrc`, `.editorconfig`, `.gitattributes`, `.gitconfig.appraise`
- Static analysis config: `.fallowrc.json`, `react-doctor.config.json`

Generated or sync-managed automation output lives under `automation/`. Prefer changing source data, generators, or
sync scripts instead of editing generated output directly.

For major behavior, architecture, workflow, package, schema, scaffold, lifecycle, or toolchain changes, update the
relevant current docs in the same change set. Treat doc drift as part of the bug: if repo inspection shows active docs
no longer match current source, scripts, package layout, or generated-artifact rules, fix those docs before finishing.

## Task Routing

Classify every project-engineering task through `swarm-orchestrator` before deciding whether to delegate. Keep the
classification bounded: assess missing evidence, judgment, consequence, deterministic verifiability, separability,
and estimated effort. `coordinator-only` is the default for trivial or strongly verifiable local work and uses zero
subagents. Route missing facts to `investigator`, irreducible judgment after evidence exists to `solver`, settled
implementation to `executor` or `executor-advanced`, and consequential residual uncertainty to an independent
`judge`. Prefer deterministic verification over model consensus. Do not delegate trivial work, duplicate evidence
lanes, or allow concurrent overlapping writes. This custom engineering swarm does not replace Appraise-owned product
lifecycle gates.

Persist a compact routing receipt only for meaningful project work, delegated work, routing anomalies, or
consequential decisions. Truly trivial coordinator-only work should not create ledger bureaucracy. A receipt records
the requested route and runtime-proof status; it must not claim the host enforced a role, model, context boundary, or
sandbox without host evidence.

Before finishing a swarm run, apply the skill's evolution criteria to performance, resource use, governance, and
harness usability. Record and notify the user about anything non-optimal, wait for their guidance, then update only
the approved routing, prompts, models, tools, context boundaries, concurrency, or harness behavior. Do not silently
change the harness from its own observation.
Close the cycle only after deterministic verification and a fresh independent re-evaluation linked to the originating
run. The local `.appraisejs/swarm-events.jsonl` journal is Git-ignored process evidence; host-conversation user guidance
and Appraise lifecycle approvals remain authoritative. Static agent configuration does not prove the effective named
role or sandbox at runtime: retain host receipts where available and disclose missing proof.
Give `solver` and `judge` no inherited parent transcript, or the smallest deliberate bounded context supported by the
host, so their judgment is not anchored by a producing agent's narrative.

For CRUD/domain work, start with `src/actions/*`, `src/services/*`, `prisma/schema.prisma`, and the matching
page/form/table under `src/app/(base)`.

For database/schema work, read `prisma/schema.prisma` first and check affected services, actions, migrations, sync
scripts, and tests before changing the model.

For authored test structure, feature generation, or sync behavior, follow `docs/automation-sync-rules.md`, then check
`src/lib/feature-file-generator.ts`, `src/lib/bidirectional-sync.ts`, `src/lib/database-sync.ts`,
`src/lib/gherkin-parser.ts`, and the relevant `scripts/sync-*.ts`.

For test execution, reports, or logs, follow `docs/test-run-runtime.md`, then start with
`src/actions/test-run/test-run-actions.ts`, `src/services/test-run/test-run-service.ts`,
`src/lib/executor/local-executor-adapter.ts`, `src/lib/test-run/process-manager.ts`,
`src/app/api/test-runs/[runId]/logs/route.ts`, and `cucumber.mjs`.

For UI organization, follow `docs/component-organization-rules.md`. Keep route-specific UI local unless reuse or
separation clearly justifies moving it into `src/components`.

For server actions, follow `docs/server-actions-conventions.md`: actions parse input and map responses; services own
business rules; persistence uses Prisma or dedicated helpers.

For scaffolded-app changes, follow `docs/scaffold-template-sync.md`. Edit root/base source first, then run
`npm --prefix packages/create-appraisejs run prepare-template`.

For Appraise lifecycle or MCP work, follow `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`, and
`docs/agent-mcp-setup.md`. Keep lifecycle transitions Appraise-owned; do not replace plan, validation, baseline, or
completion gates with chat approval.

For shared abstractions, require evidence from multiple real consumers, an independently testable responsibility, or
repeated state/error behavior. Do not introduce catch-all CRUD frameworks or pass-through layers. Test service
boundaries and any Server Action behavior that parses, scopes, invalidates caches, or maps error envelopes.

For Graphify setup or repo graph work, follow `docs/agent-graphify.md`. Use the Python package `graphifyy` and CLI
`graphify`; do not add the unrelated Node package `@sentropic/graphify`. When safe source changes touch committed
graph scopes, run `npm run graphify:auto` before finishing. When changing Graphify behavior or graph-update logic,
load and follow the `graphify` skill for any required `graphify-out/` output updates instead of hand-editing those
outputs. For existing-graph navigation, use `npm run graphify:query -- "<question>"`,
`npm run graphify:path -- "<source>" "<target>"`, or `npm run graphify:explain -- "<node>"`; these wrappers select
the canonical `src/graphify-out/graph.json`. Do not run bare root-level `graphify query`, `path`, or `explain` commands.

For E2E or Playwright changes, follow `docs/test-run-runtime.md` for runtime behavior and
`docs/agent-task-recipes.md` for focused validation routing.

For interactive UI verification, use the bundled `Browser` plugin and its `control-in-app-browser` skill as the
default harness surface. Keep the Browser binding and tab alive across related checks, inspect semantic page state,
console errors, and failed requests in place, and create screenshots or other persisted artifacts only when they are
required as evidence. Use standalone `playwright-cli` only as a fallback when the Browser skill is unavailable or its
documented setup and troubleshooting path cannot establish a browser session. Record the fallback reason; do not
silently substitute Playwright CLI for Browser.

## Unified Operation Authority

Do not add built-in browser behavior directly to generated `automation/steps` wrappers, the deprecated action
projection, or capsule bindings. Add or change the canonical operation definition and shared handler, regenerate human
projections with `npm run operation:projections`, then update generic conformance coverage. Project-owned custom
template steps remain manual-only until explicitly reviewed and migrated.

For package work, read the package `AGENTS.md` first when present, then the package README, `package.json`, and tests.
Package instructions may narrow validation but do not override root safety rules.

## Never Do

- Do not patch generated automation output when a source, generator, or sync script should change instead.
- Do not edit scaffold templates directly when the root/base source should sync.
- Do not revert unrelated worktree changes.
- Do not bypass pre-commit hooks or ignore hook failures.
- Do not apply broad formatting churn unrelated to the task.
- Do not treat historical development plans as authoritative without checking current source.
- Do not hand-edit `graphify-out/` outputs when a Graphify skill-driven update or rebuild should produce them.
- Do not leave active docs stale after a major source, schema, workflow, toolchain, package, scaffold, or lifecycle
  change.
- Do not guess on broad behavior, schema, runtime, or template-sync changes when repo inspection leaves important
  questions unanswered.
- Do not claim MCP tools are available until the client has been registered or restarted with the current setup.

## Validation

Use focused checks first. Prefer affected-file ESLint and Prettier checks before full-repo commands unless the change
is broad. `package.json` is the full source of truth for scripts.

Common validation commands:

- `npm run lint`
- `npx eslint <files>`
- `npx prettier --check <files>`
- `npx prettier --write <files>`
- `npm run validate`
- `npx vitest run <test-file>`
- `npm run test`
- `npm run quality:fallow:commit`
- `npm run quality:react-doctor:commit`
- `npm run check:harness`
- `npm run release:check:artifacts`
- `npm run release:check:packages`
- `npm run build`

Run related tests when tests exist or are added. Run `npm run build` for broad changes, package/config/schema changes,
runtime execution changes, or release-like work.

## Completion Criteria

Before finishing, make sure:

- The change is made in canonical source files.
- Generated/template sync has run when applicable.
- Current docs were updated for major behavior, workflow, package, schema, scaffold, lifecycle, or toolchain changes,
  and any active-doc deviations found during repo inspection are corrected.
- Focused linting and formatting have passed, or failures are explained.
- Relevant tests, static analysis, and build checks have run based on risk.
- Hook failures introduced by the change are fixed.
- The final response summarizes changed areas and validation performed.
