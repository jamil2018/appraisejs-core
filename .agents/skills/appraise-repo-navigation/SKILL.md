---
name: appraise-repo-navigation
description: Choose source files, tests, docs, and validation commands for AppraiseJS tasks.
---

# Appraise Repo Navigation

Use this skill when deciding where an AppraiseJS code task should start.

1. Read root `AGENTS.md`, then the relevant `docs/agent-*` file for the task type.
2. Prefer source-of-truth files over generated artifacts or historical plans.
3. For CRUD/domain work, start with actions, services, Prisma schema, and matching route UI.
4. For runtime execution, start with `docs/test-run-runtime.md` and the test-run service/action/runtime files.
5. For packages, read the package `AGENTS.md`, package README, package scripts, and nearby tests.
6. Pick focused validation from `docs/agent-validation-matrix.md` before running broad checks.
7. For major behavior, workflow, package, schema, scaffold, lifecycle, or toolchain changes, update the matching
   current docs and correct any active-doc drift found during repo inspection before finishing.
