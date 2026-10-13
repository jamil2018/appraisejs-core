# ADR-0005: Run Codex app-server behind AppraiseJS Journeys

Status: accepted direction; M00-r3 records agreed detailed choices; exact artifact approval pending; runtime qualification and later implementation not started.
Date: 2026-10-13. Authority: user explicitly retired the old plan in favor of the Codex CLI-driven mechanism.
Supersedes: [ADR-0004](0004-stock-codex-journey-handoff.md).

## Decision

Use Codex CLI's `codex app-server` as a supervised backend behind AppraiseJS, with role-scoped MCP tools. Keep human interaction inside AppraiseJS through state-driven forms, reviews, consent, recovery and results. The normal flow has no direct user-agent chat, manual prompt sending or Codex desktop switching. Provider sign-in and target-site authentication remain separately controlled.

Appraise remains the authority for state changes: validated, transactionally accepted artifacts and explicit human decisions advance the Journey. Agent prose, streamed progress and turn completion do not establish lifecycle success. Preserve ownership fencing, exact-revision decisions, idempotency, lost-reply reconciliation and existing evidence.

## Authoritative implementation references

- [Migration plan](../../tasks/codex-app-server-journeys/plan.md) and [ordered tasks](../../tasks/codex-app-server-journeys/todo.md).
- [State-driven UI plan](../../tasks/quality-journey-transition-ui/plan.md) and [ordered tasks](../../tasks/quality-journey-transition-ui/todo.md).
- [Wireframe guide and state-to-task map](../../tasks/quality-journey-transition-ui/wireframes/README.md).

## Supersession and limits

The old stock-desktop/plugin plan and task register are retired historical references. Their remaining work is not an active queue and must not be resumed automatically. Preserve past evidence and gate verdicts, including GC3 REVISE / not passed; supersession does not convert an unfinished qualification into success or erase known risks.

This selects the direction, not a qualified runtime implementation. M00 proposes the exact host/build feasibility candidate and authentication, containment and authority contract; support requires later exact-binary and effective-boundary qualification. Existing external-mode product behavior remains until an explicitly implemented and qualified migration replaces it. No code, live Journey, authentication or database change is authorized by this documentation update. Implementation continues in a separate session.

## M00 detailed contract proposal — 2026-10-13

The [M00 contract](../../tasks/codex-app-server-journeys/m00-host-authority-contract.md) defines the proposed local-only exact-build candidate, opt-in host/admission mapping, mandatory first-session fencing, six-role external MCP boundaries and denied worker repository writes. [Evidence and independent review](../../tasks/codex-app-server-journeys/m00-review-evidence.md) are separate from approval and runtime qualification. The user agreed to D01–D04 and D05 defaults; M00-r3 records them with numerical operating/retention limits. Exact M00-r3 approval remains pending; this ADR accepts the direction only. M01 and later work require another bounded instruction.
