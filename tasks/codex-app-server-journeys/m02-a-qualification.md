# M02-A: deterministic external-worker gateway

Date: 2026-10-15 (Asia/Dhaka). Status: **M02-A implemented with deterministic fixtures; M02 incomplete.**
M02-B/M02-C, M03–M13 and U00–U10 are not authorized by this slice. No product dispatch is enabled.

## Authorization and preserved authority

The user approved M02-P1's M02-A only in the host conversation:

> Approve M02-P1’s M02-A only. Implement and verify the scoped external-worker gateway with disposable deterministic fixtures. Preserve M00 and all historical evidence. No runtime probes, auth, inference, grants, commits, push or M02-B+.

The later instruction requires verification and exact-artifact review, with those restrictions unchanged.
This document records that authority; it does not independently authenticate approval.
Approved M00 remains SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
M01 protocol qualification remains tuple-specific. Native inference is exhausted at **3/3**, with no reset
or ambiguous-start resend. GC3 stays **REVISE / not passed**. Historical/UNKNOWN evidence is retained.
Commit `ac758cea` was pushed per the user's correction and matching local tracking ref; earlier
not-pushed statements are historical. This slice creates no commit or publication.

## Implementation and trust contract

The additive package module `packages/appraisejs/src/mcp/external-worker-gateway.ts` captures canonical
Zod validators and handlers in process; it neither creates an API client nor registers a transport,
issues a grant, authenticates, launches Codex or claims/admit work. Existing public MCP and legacy
managed/Factory mappings are unchanged. The gateway's explicit registration method registers only
its immutable six-role allowlist and strict object schemas; it registers zero resources.

Reads never invoke broad canonical GET/search/evidence handlers. Trusted preparation supplies frozen
source records, exact artifact IDs, read arguments and input/scope hashes. The gateway filters hub,
project, Journey, work item and attempt; rejects missing/ambiguous records; projects through fixed
field schemas; strips unrelated metadata; binds evidence receipt/kind/offset/limit; and snapshots
content. Canonical nested artifact validators remain in the projection schemas. Caller queries cannot
expand the frozen search or evidence pages. Content hashes describe the projected bytes, not source
provenance or an independently authenticated freeze. Trusted preparation must obtain the input/scope
hashes and selected artifacts from canonical authority; text/evidence sanitization remains its duty.

Writes invoke only one canonical external submission per role: Analyzer Analysis, Scout observations,
Resource Explorer resolutions, Scenario portfolio, Automator materialization or Triager report.
The adapter injects top-level target, Journey, work/attempt, assignment/generation/secret, lease,
input/scope and coordinator fields. Nested result/portfolio/bundle identity remains schema-visible
and is checked against the binding. Worker payloads cannot supply coordinator principals, arbitrary
authority, cross-role tools or human decisions. Canonical handlers/services retain semantic and
transaction-local validation; this gateway does not replace them.

A successful handler is insufficient. The trusted acceptance adapter must independently map the
exact gateway request hash, operation, idempotency key, assignment and attempt to persisted canonical
acceptance/artifact IDs. Raw handler output is not forwarded. Missing or mismatched acceptance stays
UNKNOWN; post-I/O revocation preserves an observed accepted effect. Lost replies never retry within
the gateway; the supervisor owns exact outcome reconciliation. The gateway request hash differs
from the canonical service payload hash: a future adapter must verify that mapping, not echo the
requested hash. The fixture records its independently calculated request hash during commit, before lookup.

The trusted authorization adapter must reread every binding dimension, current lease/authorization,
frozen revisions, session and generations before/after I/O. Gateway expiry checks are additional
checks, not renewal or persistent-session implementation. Session and assignment generations are
distinct. No implementation of M03's mandatory host-neutral transaction fence is supplied here.

## Deterministic verification and exact artifact

The disposable fixture is an in-memory acceptance/artifact store behind the canonical MCP handlers.
It does not access a product database or migrate any schema. Six positive packets pass the canonical
package schemas. Tests cover malformed semantic payloads, forged scope/generations/secrets, every
broader canonical operation for each role, native-tool names, strict registration, immutable profiles,
foreign frozen records, search/page boundaries, secret-bearing projections, revocation/expiry races,
missing or mismatched acceptance, lost replies and exact-versus-changed replay.

Final source SHA-256: `4c746537821b60e44e58a9f2a452cca88cd513fcd3e32aecf59fb456999a874c`.
Final test SHA-256: `0794107148bff67b9ecc7d298522c53839dcbb6c0b8f82a363bcca53a8d5ec16`.
The complete exact artifact is bound by the repository harness snapshot/independent review receipt,
retained under ignored `.appraisejs/`; report the aggregate digest in the host conversation.

- Gateway fixture: 84 deterministic tests passed at the implementation checkpoint.
- Existing legacy gateway, external-submission fences and Analysis service: 14 tests passed.
- Full package run: 212 tests passed; the transport-revocation test failed on sandbox loopback
  `listen EPERM 127.0.0.1` before establishing its fixture. It is not a scoped-gateway regression.
  Do not grant socket permissions or count that test as passing. Offline package rerun excludes it: 212 tests across 24 files passed.
- Package TypeScript build, focused ESLint, formatting and diff whitespace passed.
- Root build compiled the packages but failed fetching Inter/Inter Tight from Google Fonts under
  network restrictions. No build success or root typecheck completion is claimed; no font behavior
  or network permission was changed to bypass this limitation.
- Standalone root TypeScript checking failed in untouched `src/components/diagram/flow-diagram.test.tsx:352`
  (`Element` is not assignable to `HTMLElement`). No source/type assertion was weakened.
- The in-memory fixture stores the request hash and payload at commit, but receipt/artifact IDs
  and operation/assignment fields in its acceptance view are synthetic. This tests the adapter seam
  and mismatch handling; persisted canonical artifact identity verification is still unimplemented.
- Package-only source needs no root scaffold/template synchronization. Graphify package refresh
  is deterministic and separate from host qualification; generator outputs are included in review.

Independent contract assessment required explicit projection allowlists and an independently
calculated request hash stored at fixture commit; both were implemented. Persisted canonical
acceptance/artifact identity verification remains pending. Exact final review is a separate read-only check.
Requested agent roles/context are not proof of effective host role/model/sandbox enforcement.
Route receipt: `e4c23bf3-3dbf-49b2-a227-7c95157edc58`; runtime enforcement remains unverified.

## Limits and next boundary

This proves deterministic gateway behavior with trusted fixture adapters, not production canonical
adapter wiring, model schema selection, Code Mode usability, required-MCP startup on this profile,
OS/native-tool/network containment, credential/history isolation or auth refresh/revocation.
No app-server, native inference, permission grant, production Journey, UI, migration, commit, push,
merge, publication or release was performed. No upstream implementation was copied.

M02 authority observations remain provisional until M03 re-probes missing/stale/valid mandatory
sessions before first takeover and inside transactions. Legacy absent-session admission cannot
qualify the managed host. Existing receipts remain `EXTERNAL_V1`, `PROJECT_CREDENTIAL_ONLY` and
`NOT_ATTESTED`; neither configuration nor this fixture upgrades them.

Stop here. M02-B needs separate exact-artifact authorization for disposable no-model host probes,
including paths, process/socket permissions and start limits. M02-C needs separate auth/inference
approval and a new explicit budget; the exhausted M01 budget never supplies that authority.
