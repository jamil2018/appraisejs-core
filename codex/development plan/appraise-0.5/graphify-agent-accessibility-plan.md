# Graphify Integration Plan

## Summary

Integrate the correct Graphify tool from https://graphify.net/: the Python/PyPI package is `graphifyy`, the CLI
command is `graphify`, and shared outputs are written to `graphify-out/`. Use `uv tool install graphifyy` as the
recommended machine setup, commit the repo-local Graphify skill plus reviewed graph artifacts, and document the
refresh/query flow for agents.

## Key Changes

- Add repo scripts that wrap the Python CLI without adding a Node dependency:
  - `setup:graphify`: best-effort machine setup that installs Graphify through `uv` when available.
  - `graphify:install`: verify `graphify` is available, then run `graphify install --project --platform agents`.
  - `graphify:build`: generate the default `src/graphify-out/` graph.
  - `graphify:build:prisma`: generate a schema-aware `prisma/graphify-out/` graph.
  - `graphify:build:scripts`: generate `scripts/graphify-out/`.
  - `graphify:build:packages`: generate `packages/graphify-out/` while skipping the synced scaffold template copy.
  - `graphify:build:all`: intentionally refresh all committed graph scopes.
  - `graphify:auto`: refresh only safe committed graph scopes detected from Git changes.
  - `graphify:update`: run `graphify src --update` for changed default app files.
  - `graphify:query`: document terminal usage such as `graphify query "<question>"`.
  - `graphify:serve`: optional MCP/server flow if installed with Graphify's MCP extra.
- Add `docs/agent-graphify.md` covering:
  - prerequisites: Python 3.10+ and `uv`;
  - recommended install: `uv tool install graphifyy`;
  - fallback installs: `pipx install graphifyy` or `pip install graphifyy`;
  - Codex invocation for document-heavy scopes, while terminal usage remains `graphify`;
  - no separate API key for code/schema graphs;
  - output policy for committed `src/`, `prisma/`, `scripts/`, and `packages/` graph artifacts.
- Add `.graphifyignore` to exclude generated/build/runtime noise such as `node_modules/`, `.next/`, package `dist/`,
  synced package templates, local databases, logs, test reports, `.fallow/`, and `.appraisejs/`.
- Update `.gitignore` so local-only Graphify cache state is ignored while the main `graphify-out/` graph artifacts
  remain commit-eligible.
- Reference Graphify from `AGENTS.md`, `CONTRIBUTING.md`, `docs/agent-harness.md`,
  `docs/agent-generated-artifacts.md`, and `docs/agent-validation-matrix.md`.

## Generation Flow

- One-time developer setup:
  - install Python 3.10+ and `uv`;
  - run `npm run setup` or `npm run setup:graphify`;
  - run `npm run graphify:install`.
- Initial graph generation:
  - run `npm run graphify:build`;
  - run `npm run graphify:build:prisma`, `npm run graphify:build:scripts`, and `npm run graphify:build:packages` for
    the additional committed graph scopes;
  - review each affected `graphify-out/GRAPH_REPORT.md`;
  - open each affected `graphify-out/graph.html` for visual inspection;
  - commit the approved graph outputs.
- Refresh after meaningful repo changes:
  - run `npm run graphify:auto` when changed files are in known-safe graph scopes;
  - run a specific `graphify:build:*` script when intentionally refreshing one scope;
  - review graph/report diffs before committing.
- Agent usage:
  - prefer `graphify query`, `graphify path`, and `graphify explain` before broad raw-file exploration.

## Test Plan

- Run `graphify --version` after install.
- Run `npm run setup:graphify`.
- Run `npm run graphify:install` and confirm `.agents/skills/graphify/` is created or refreshed without damaging
  existing AppraiseJS skills.
- Run `npm run graphify:build`, `npm run graphify:build:prisma`, `npm run graphify:build:scripts`, and
  `npm run graphify:build:packages`.
- Run `npm run graphify:auto -- --dry-run` and confirm it only selects safe changed scopes.
- Run one query, for example `graphify query "what are the main AppraiseJS lifecycle services?"`.
- Run `npm run check:harness`.
- Run Prettier check on touched docs/config files.

## Assumptions

- Commit the shared `graphify-out/` graph artifacts so agents get value immediately after checkout.
- Do not use the unrelated Node package `@sentropic/graphify`.
- `npm run setup` may install Graphify automatically when `uv` is available, but Graphify setup remains non-fatal for
  normal app runtime setup.
- Do not auto-generate graphs for `automation/`, `.agents/`, `docs/`, `codex/`, or `appraise/` unless explicitly
  requested.
- Source references: https://graphify.net/ and https://github.com/safishamsi/graphify.
