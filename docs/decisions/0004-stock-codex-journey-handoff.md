# ADR-0004: Continue Appraise Journeys through stock Codex and an MCP plugin

Status: accepted architecture; implementation and qualification pending.
Date: 2026-09-11. Authority: user selected this architecture and requested the plan update.

## Context

Managed-provider experiments found exact model-visible schema loss and an unresolved custom authentication/retry
interlock contract. Maintaining a custom provider runtime adds integration and distribution complexity. The user
wants to keep the Journey graph and Appraise-first experience while simplifying the initial release.

## Decision

Appraise prepares the Journey and opens stock Codex with a prefilled plugin handoff. The user sends the prompt.
Authenticated MCP redemption connects the task, which requests eligible work and submits candidates. Appraise alone
validates and commits lifecycle transitions and retains human decisions, execution consent and evidence authority.

MCP and skills are complementary: tools expose enforced operations; skills explain the workflow. They do not isolate
Codex's other tools or guarantee automatic wake. Full canonical validation stays server-side; exact model-visible
schema preservation is no longer an admission requirement. Local hub integrity still relies on the trusted host:
an agent with direct database/code/credential access is outside the MCP-only enforcement guarantee.

Preserve existing handoff and lifecycle contracts; extend setup, deep-link prefill and later-stage resume only after
bounded qualification. Retain authenticated discovery as a separately qualified browser/evidence boundary. Do not
replace required receipts with arbitrary external agent observations.

## Consequences and alternatives

The user can start in Appraise but must send the prepared prompt in Codex. Explicit resume is supported; background
AI continuation and control of total host spend are not promised. Provider authentication remains in stock Codex.
Appraise-owned runtime effects still require idempotency, reconciliation and cancellation evidence.

A custom Codex build/interlock is deferred. A skills-only workflow lacks server enforcement. Dropping the Journey
graph would discard useful lifecycle authority. A future managed orchestrator may use API access and a paid service
model, subject to a separate provider, billing, privacy and operations design; this is not a launch requirement.

## Delivery and verification

The authoritative [plan](<../../codex/development plan/appraise-0.5/product direction/managed-quality-journey-coordinator/PLAN.md>)
and [task register](<../../codex/development plan/appraise-0.5/product direction/managed-quality-journey-coordinator/TASK_REGISTER.md>)
use new C tasks and GC gates. Historical managed-runtime snapshots/evidence remain intact and do not qualify this path.
C0 tests handoff, server enforcement, interrupted resume and discovery feasibility before feature implementation.

[Official deep-link documentation](https://learn.chatgpt.com/docs/reference/commands#deep-links), checked 2026-09-11,
documents workspace/prompt/plugin prefill and explicitly requires user submission. Installed-version behavior is not
yet tested for this architecture.
