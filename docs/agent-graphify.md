# Agent Graphify

Graphify provides a repo graph that agents can query before broad source exploration. The Python package is
`graphifyy`, the terminal command is `graphify`, and the default app graph lives in `src/graphify-out/`.

## Prerequisites

- Python 3.10 or newer.
- `uv` for the recommended install path.

Install Graphify once per machine:

```bash
uv tool install graphifyy
```

`npm run setup` runs a best-effort Graphify setup step for development machines. It installs Graphify through `uv` when
`uv` is available and otherwise prints the manual install command without blocking normal app setup.

Fallback install options:

```bash
pipx install graphifyy
pip install graphifyy
```

Do not use the unrelated Node package `@sentropic/graphify`.

The committed AppraiseJS graph scopes are code or schema focused and do not require a separate API key. For
document-heavy semantic extraction, prefer Codex-hosted `$graphify <path>` so the running agent supplies the semantic
pass. If the terminal CLI must process docs, papers, or images directly, set `GEMINI_API_KEY` or `GOOGLE_API_KEY` and
install Graphify with the Gemini extra. Do not ask for Anthropic, OpenAI, Moonshot, or DeepSeek keys for this workflow.

## Project Setup

After the CLI is available, install or refresh the repo-local agent skill:

```bash
npm run graphify:install
```

The project install command verifies the CLI is on `PATH`, then runs `graphify install --project --platform agents`.
In Graphify 0.8.x, `--platform agents` maps to this repo's `.agents/skills/` layout; `--platform codex` maps to
`.codex/skills/`, which is not where AppraiseJS keeps repo-local skills. The install should create or refresh
`.agents/skills/graphify/` without modifying the other AppraiseJS skills.

## Build And Refresh

AppraiseJS defaults Graphify generation to `src/`, because that is the primary app surface agents work in most often.
The `packages/` tree is excluded from default Graphify scans because it includes package and scaffold-template surfaces
that can duplicate root app concepts and make normal source navigation noisy.

Generate the default app graph:

```bash
npm run graphify:build
```

Agents should refresh committed graphs automatically when the changed files are in a known-safe graph scope:

```bash
npm run graphify:auto
```

The auto-update command checks Git changes and runs only the affected committed graph builders for `src/`, `prisma/`,
`scripts/`, and `packages/`. It skips uncertain or document-heavy changes instead of guessing. Use this before
finishing work when source changes touch one of those scopes and Graphify is installed. To intentionally refresh every
committed graph, run:

```bash
npm run graphify:build:all
```

Refresh after meaningful source changes:

```bash
npm run graphify:update
```

To graph another focused area intentionally, call the CLI directly with that path:

```bash
graphify prisma
graphify scripts
```

Good follow-up graph candidates:

- `prisma/` has a schema-aware generator: run `npm run graphify:build:prisma` and commit
  `prisma/graphify-out/graph.json`, `prisma/graphify-out/graph.html`, and `prisma/graphify-out/GRAPH_REPORT.md`.
- `scripts/` can be refreshed with `npm run graphify:build:scripts`; commit `scripts/graphify-out/graph.json`,
  `scripts/graphify-out/graph.html`, and `scripts/graphify-out/GRAPH_REPORT.md`.
- `packages/` can be refreshed with `npm run graphify:build:packages`; the graph excludes
  `packages/create-appraisejs/templates/`, package docs, package `dist/`, package `node_modules/`, and nested graph
  outputs.
- `automation/` is a small code-only scope and can be refreshed without semantic extraction.
- `.agents/`, `codex/`, `appraise/`, and `docs/` are mostly document scopes; use Codex-hosted `$graphify <path>` or a
  configured semantic backend when those need graphing.
- `packages/` should stay out of the default app graph unless package or scaffold behavior is the task.

The automatic refresh policy is intentionally conservative. Agents should treat Graphify generation as safe when all
of these are true:

- Graphify is already installed and `graphify --version` succeeds.
- The changed files are code, config, Prisma schema, or migration files under `src/`, `prisma/`, `scripts/`, or
  non-template `packages/`.
- The run uses `npm run graphify:auto` or the specific scope builder and the generated report looks plausible.

Do not auto-generate graphs for `automation/`, `.agents/`, `docs/`, `codex/`, or `appraise/` unless the task explicitly
asks for that graph. Those areas are generated, document-heavy, or lifecycle-owned enough that agent judgment should be
explicit.

Review `src/graphify-out/GRAPH_REPORT.md` before committing default app graph changes. Open
`src/graphify-out/graph.html` for visual inspection, and commit only reviewed shared artifacts:
`src/graphify-out/graph.json`, `src/graphify-out/graph.html`, and `src/graphify-out/GRAPH_REPORT.md`. Local cache and
machine state under any `graphify-out/` directory stay ignored.

If the existing `src/graphify-out/graph.json` is still valid but the visual HTML needs to be regenerated, run:

```bash
graphify tree --graph src/graphify-out/graph.json --output src/graphify-out/graph.html --root "$PWD/src" --label AppraiseJS
```

## Agent Usage

In Codex prompts, invoke the repo skill with `$graphify src` for the default app graph when the skill is installed. In
the terminal, use the CLI directly:

```bash
graphify query "what are the main AppraiseJS lifecycle services?"
graphify path "plan review service to coordinator lifecycle"
graphify explain src/services/coordinator
```

Prefer `graphify query`, `graphify path`, and `graphify explain` before broad raw-file exploration on unfamiliar
AppraiseJS areas.

## Optional MCP Flow

If Graphify is installed with MCP support, `npm run graphify:serve` starts the Graphify MCP/server flow. Register or
restart the client before expecting Graphify MCP tools to appear.
