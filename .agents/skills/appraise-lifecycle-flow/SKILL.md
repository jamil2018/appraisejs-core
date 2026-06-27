---
name: appraise-lifecycle-flow
description: Use Appraise-owned lifecycle gates and evidence expectations correctly.
---

# Appraise Lifecycle Flow

Use this skill for plan, validation, baseline, implementation, completion, pause, resume, or cancellation work.

1. Read `docs/agent-lifecycle-flow.md` and `docs/coordinator-api-mcp.md`.
2. Treat `plan_approved`, `validations_approved`, `baseline_accepted`, `validation_passed`, and `completed` as
   Appraise-owned gates.
3. Do not substitute chat approval for plan review, validation approval, baseline acceptance, or final sign-off.
4. Read review or validation remarks before revising after `changes_requested`.
5. Poll events before and after tasks, before validation, and before completion.
6. Report whether evidence came from browser/UI approval, service/API approval, MCP tools, or backend tests.
