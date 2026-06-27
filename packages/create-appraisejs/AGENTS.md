# create-appraisejs Agent Guidance

This package scaffolds new AppraiseJS projects from bundled templates. Follow root `AGENTS.md` first, then this file
for package-specific routing.

## Sources Of Truth

- CLI behavior: `src/cli.ts`, `src/create-project.ts`, `src/copy-template.ts`, `src/config.ts`, and tests beside them.
- Template catalog and overlays: `src/template-catalog.ts`, `templates/base`, and `templates/flavors/*`.
- Preparation flow: `scripts/prepare-template.ts` and `src/prepare-template-utils.ts`.
- Scaffold docs: `docs/agent-scaffold-flow.md` and `docs/scaffold-template-sync.md`.

## Rules

- The scaffold model is bundled-only: one full `templates/base` app plus small `starter` and `blank` flavor overlays.
- Do not add a runtime remote template download path for normal scaffolding.
- Do not duplicate full starter and blank app trees.
- Keep seeded databases free of coordinator credentials, leases, durable events, test runs, reports, and personal
  layout state.
- Prefer changing root/base source, then running `npm --prefix packages/create-appraisejs run prepare-template`, when
  generated apps should inherit root behavior.

## Validation

- Run `npm --prefix packages/create-appraisejs run prepare-template` for template-affecting work.
- Run `npm --prefix packages/create-appraisejs run test` for CLI or package behavior changes.
- Run the package build for release-like work.
