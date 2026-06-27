---
name: appraise-scaffold-maintenance
description: Maintain scaffold source, package templates, flavor overlays, and seeded databases safely.
---

# Appraise Scaffold Maintenance

Use this skill for `create-appraisejs`, scaffold templates, starter or blank flavors, or prepared database changes.

1. Read `docs/agent-scaffold-flow.md`, `docs/scaffold-template-sync.md`, and `packages/create-appraisejs/AGENTS.md`.
2. Keep the bundled-only model: one full `templates/base` scaffold plus small flavor overlays.
3. Change root/base source first when generated apps should inherit behavior.
4. Run `npm --prefix packages/create-appraisejs run prepare-template` for template-affecting changes.
5. Verify seeded databases do not contain coordinator credentials, leases, durable events, test runs, reports, or
   personal layout state.
6. Run package tests for CLI or package behavior changes.
