> Current shipping checkpoint: [M02 scripted qualification accepted](../../tasks/codex-app-server-journeys/M02-SHIPPED-SCRIPTED-QUALIFICATION-01.md). T2 R51 passed24/24 andT3 R55 passed2/2; final exact evidence review accepted within TA02/TA03 limits. `runtimeQualified` remains false; helper lifetime/global inventory and historical cleanup remain unobserved. No M03 or production dispatch authority follows. Older status passages below remain historical.

# ADR-0005: Run Codex app-server behind AppraiseJS Journeys

Status: accepted direction; M00-r3 detailed design contract explicitly approved and byte-frozen; authentication amendment recorded; M00 complete; M01 protocol qualification complete for the pinned tuple; M02-A deterministic gateway implemented; M02 incomplete; M02-B+ not started.
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

## M01 manifest interpretation correction — 2026-10-14

The [subsequent source/offline investigation](../../tasks/codex-app-server-journeys/m01-manifest-investigation.md)
finds that the fixture inspected only top-level tools, omitting Responses Lite additional_tools input
items. The selected model's exact embedded metadata matches the immutable release source and selects
CodeModeOnly; local code_mode=false alone is not an effective tool-surface attestation. Prior whole-request
tool-absence conclusions are superseded while their records remain intact. Parser regressions pass;
no new thread/turn, inference or permission change occurred. M01 remains partial; M02+ unstarted.

## M01 corrected no-model request-variant observation — 2026-10-14

[Latest observations](../../tasks/codex-app-server-journeys/m01-request-variant-results.md) capture
additional_tools from the pinned host and native RPC-path declines for standard form, URL and both
OpenAI-form elicitation modes. No external inference, native exec or permission grant occurred. Never
policy prevented client forwarding under unchanged read-only settings; client roundtrip cancellation
and native permission-request production remain unqualified. M01 stays partial, M02+ unstarted, and
approved M00/auth-amendment bytes plus GC3 REVISE remain preserved.

## M01 final fixture qualification — 2026-10-14

[Final assessment](../../tasks/codex-app-server-journeys/m01-qualification.md) records four actual-binary
RPC cancellation variants and one native-produced permission request answered with empty permissions,
using the explicitly authorized asking-only synthetic fixture exception. Zero new external inference,
permission grants or native exec calls. Previous partial checkpoints above are historical; M01 protocol
acceptance is complete for the pinned tuple, with reviewed mode mapping and historical policy hashes.
M00 approved bytes remain unchanged. Model-driven MCP routing, containment and managed-runtime
qualification remain unverified; M02+ remains unstarted, GC3 REVISE / not passed, local commits only.

## M02-A deterministic checkpoint — 2026-10-15

[M02-A](../../tasks/codex-app-server-journeys/m02-a-qualification.md) adds a disconnected six-role
external-worker gateway and disposable deterministic fixtures. Public/legacy MCP remains unchanged.
Trusted projection, authorization and durable-acceptance adapters are explicit seams; no product
dispatch, runtime probe, containment/auth qualification, schema change or publication is supplied.
M03 mandatory-session re-probes remain required. Frozen M00, native 3/3 exhaustion, historical
UNKNOWN evidence and GC3 REVISE remain unchanged. M02-B+ requires separate authorization.

## M03 host-neutral persistence — 2026-10-19

The separately approved M03 plan implements [durable host-neutral session ownership](../quality-journey-host-sessions.md), explicit internal Journey hosting and transaction-local first-session fencing. [Current implementation evidence](../../tasks/codex-app-server-journeys/M03-CURRENT-WORK-01.md) remains distinct from the frozen M00 design and M02 scripted qualification. No production app-server dispatch, public managed opt-in, native/provider campaign or M04/M05 implementation follows from persistence checks.

## M04 persistence implementation — 2026-10-19

The approved M04 plan adds [provider-run and wake intent persistence](../quality-journey-provider-intents.md), retaining UNKNOWN after an armed crash and excluding occupied/uncertain hub slots from replacement or transfer. Wake hints grant no authority. Production provider dispatch, transport supervision, authentication, real inference and native qualification remain outside this implementation.

## Synthetic custody storage decision — 2026-10-22

The [M06 synthetic custody lane](../quality-journey-source-custody.md) uses one genuine factory-owned Prisma writer for source and canonical state, plus one preowned committed-read resolver from the same loaded native library. Mixed SQLite implementations must not open the canonical file in the owning process. Source persistence becomes asynchronous; original synchronous transport observation remains metadata-only with zero SQL. Fresh release requires a conditional first-SQL source barrier and full bounded verification inside the existing canonical transaction.

Actual client destruction is deferred through protected and unresolved operations. Source key disposal and database/client cleanup have separate lifetimes so exact disposed replay can use the original resolver without reconnecting or reconstructing evidence. Independent installed-runtime exclusion evidence gates implementation; original source/service/crash evidence and exact-artifact review gate completion. This decision establishes no real-provider or TERMINAL qualification and leaves production dispatch blocked.
