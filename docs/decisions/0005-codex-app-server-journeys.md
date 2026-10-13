# ADR-0005: Run Codex app-server behind AppraiseJS Journeys

Status: accepted direction; M00-r3 detailed design contract explicitly approved and byte-frozen; authentication amendment recorded; M00 complete; M01 partial with native smoke observed and request variants outstanding; M02+ not started.
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

This selects the direction, not a qualified runtime implementation. Approved M00-r3 selects the exact host/build feasibility candidate and authentication, containment and authority contract; support requires later exact-binary and effective-boundary qualification. Existing external-mode product behavior remains until an explicitly implemented and qualified migration replaces it. No code, live Journey, authentication or database change is authorized by this documentation update. Implementation continues in a separate session.

## M00 detailed contract approval — 2026-10-13

The [M00 contract](../../tasks/codex-app-server-journeys/m00-host-authority-contract.md) defines the approved local-only exact-build feasibility candidate, opt-in host/admission mapping, mandatory first-session fencing, six-role external MCP boundaries and denied worker repository writes. [Evidence and independent review](../../tasks/codex-app-server-journeys/m00-review-evidence.md) are separate from approval and runtime qualification. The user agreed to D01–D04 and D05 defaults; M00-r3 records them with numerical operating/retention limits. The user explicitly approved M00-r3 at f506fccb and its exact SHA-256; [approval record](../../tasks/codex-app-server-journeys/m00-r3-approval.md). The approved contract remains byte-frozen with its submission-time status header; the approval record supplies current acceptance status. Runtime qualification remains outstanding. M01 and later work require another bounded instruction.

## M01 preparation checkpoint — 2026-10-13

A separate bounded instruction authorized synthetic fixtures and disposable no-model observations.
[M01 evidence](../../tasks/codex-app-server-journeys/m01-evidence.md) pins the executable/OS/schema/config
and distinguishes synthetic tests, actual-binary local-SSE observations and unverified native-provider properties.
M01 remains partial; [remaining native-provider probe](../../tasks/codex-app-server-journeys/m01-remaining-probe.md)
requires separate explicit sign-in/inference approval. The approved M00 contract stays byte-frozen; no product
mode, schema, UI, historical lifecycle record, GC3 verdict or later gate changed.

## Authentication amendment and native observation — 2026-10-14

The user authorized [authentication amendment 01](../../tasks/codex-app-server-journeys/m00-auth-amendment-01.md):
reuse the existing Codex login and error if absent, without Appraise-managed sign-in. Codex owns
credentials and native refresh. This supersedes the new-isolated-login choice, while preserving the
approved M00-r3 bytes and all other authority/containment requirements. The M01 fixture references only
the existing file login; its configuration/workspace/history remain disposable. Product integration and
worker credential isolation remain unimplemented/unqualified, not inferred from cached authentication.

[Native evidence](../../tasks/codex-app-server-journeys/m01-native-results.md) records exactly three
authorized starts: completion/persistence, active interruption and withheld-ack UNKNOWN reconciliation
without resend. The grant is exhausted. M01 remains partial for actual elicitation/permission request
variants; a no-model MCP tool-catalog/provider-manifest mismatch is retained as negative evidence.
No M02+, UI, schema, release, push or merge occurred. GC3 remains REVISE / not passed.
