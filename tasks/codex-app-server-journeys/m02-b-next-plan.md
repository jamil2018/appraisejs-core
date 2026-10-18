# M02-B-P2: next bounded adapter and containment preparation plan

Date: 2026-10-15 (Asia/Dhaka). **Proposed, not approved for implementation or execution.**
Current authority is additive offline planning only. No launches, sockets, probes, authentication,
external/native inference, grants, commits or push. M02-C+ and product dispatch remain unauthorized.

## Accepted baseline and preservation

Read [B0 checkpoint](CURRENT-CHECKPOINT.md), [B0 preparation](m02-b0-preparation.md),
[P1 case matrix](m02-b-plan.md) and its
[machine policy](../../scripts/tests/fixtures/codex-app-server-m02/policy.json).
Independent B0 acceptance binds snapshot
`1eea4b595dd74bfcb1ef0fa1cf771d07273fb76be8508444b015db8334cbd1c2` (3153 files).
The receipt and review history remain unchanged under `.appraisejs/m02-b0-*`.
This additive plan changes the aggregate workspace identity; it does not extend that acceptance
to a new artifact. Rehash every pre-existing file before/after preparation, preserve modes and
historical receipts, and require a fresh exact-artifact review for any new implementation.

M00 stays SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
M02-A and the B0 policy/source/tests/docs/graphs stay byte-identical. GC3 stays REVISE / not passed;
M01 native inference stays exhausted at 3/3. UNKNOWN evidence and ambiguous start reservations
remain immutable. HEAD ac758cea and unrelated dirty work are preserved. Its prior push is recorded
history, not authority for another push.

## Next eligible slice: B1 offline preparation

B1 is a proposed substage of M02-B, not a runtime qualification gate. Its deliverable is a separately
reviewable adapter bundle and containment feasibility record, with execution hard-disabled.
Use new files under `scripts/tests/fixtures/codex-app-server-m02-b1/`, a new focused test file
`scripts/tests/codex-app-server-m02-b1-adapters.test.mjs`, and additive evidence documents in this
task directory. Import the unchanged B0 fixtures and M02-A gateway; do not patch accepted files or
copy product database state. Generated graph updates require their own additive scope decision if
they would overwrite accepted graph bytes. No schema, package dependencies, product hooks, scaffold
sync, production receipt adapter or executable launch command is in B1 scope.

Required adapter contracts and deterministic acceptance tests:

| Component                | Required behavior and offline evidence                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supervisor/stdio         | Injected transport and clock; initialize/initialized and exact thread/turn correlations; bounded JSONL framing, size/deadline checks; reserve before send; duplicate, out-of-order, partial-write, EOF and lost-ack fixtures; no automatic reconnect/resend. Process construction is inert until a separate execution grant. |
| Journal/storage          | Owned no-follow paths and exclusive creation; durable reserve/flush acknowledgement before send; write/fsync/rename/directory-sync failures fence; crash-cut fixtures retain consumed intents and UNKNOWN effects. Mock success is not real durability evidence. Restored journals never replay pending effects.             |
| Scoped MCP transport     | Private stdio envelopes, strict IDs/errors, one immutable case/role/assignment binding and exact role catalog; import M02-A gateway and fixed synthetic canonical handlers. Required-MCP failure aborts P00 before any turn; no ambient discovery or fallback.                                                               |
| Scripted Responses       | Exact standard/Lite request and event schemas, full descriptor/container/namespace hashes before any response; request-size/count/stream limits, no redirects, retries or Authorization header. Socket adapter remains disabled; injected byte streams exercise framing and disconnects.                                     |
| Native/Code Mode mapping | Explicit allowlisted route from each actual descriptor to the scoped MCP operation; prohibit generic evaluator/executor and collaboration fallbacks. Supported captured schemas are read-only inputs. Unknown route yields a blocker, never OFFLINE_SYNTHETIC relabeling.                                                    |
| Evidence/denial/cleanup  | Bounded sanitized correlations and classifications; no raw prompt/provider body/history/credential values. One B14 empty correlated denial then fence. Cleanup uses owned handles/path identities, never saved PIDs or guessed ownership.                                                                                    |

B07's registered Designer/Triager offline complements do not establish native Analyzer routing.
The native script must demonstrate the intended validation layer without broadening Analyzer's
role or adding turns/threads. If impossible within P1, mark B07 blocked and propose a separately
reviewed matrix revision; do not silently substitute an unregistered-tool rejection.

B1 may use disposable offline filesystem fixtures only under OS-allocated temporary directories
with prefix `appraise-m02-b1-offline-`, test-owned children, 0700/0600 modes and no credentials.
Do not create `/private/tmp/appraise-m02-b-20261015-p1` during B1. Python/Node test interpreters
and injected transport fixtures are allowed only by a future B1 approval; no Codex/MCP runtime
children, listeners, connection attempts, binary/schema-generation subprocesses or probe execution.
Static reads of the recorded executable/schema files may be proposed, but do not refresh host
observations by launching the binary. Existing source pins remain recorded, not newly attested.

## Containment prerequisites: feasibility before execution

Record a concrete candidate enforcement mechanism, supported platform/version, trust boundaries,
and evidence gaps. Do not choose or install it merely to make this plan executable. Independent
security judgment and exact-artifact review are prerequisites to requesting runtime authority.

The trusted supervisor, scripted provider and scoped gateway must be separated from the untrusted
worker. Worker restrictions must prevent direct access to repository/source, SQLite, real home,
auth/config/history, supervisor/evidence files, process environment/other processes and credentials;
deny exec, write, native browser/web/network, ambient plugins/skills/MCP and permission escalation.
Only the exact scoped MCP channel and explicitly reviewed provider transport may cross the boundary.
If the provider is owned by the supervisor, its loopback listener must not become generic worker
network access. Synthetic protected canaries must lie outside the worker's allowed mounts, though
inside the owned disposable root. Symlinks/path traversal must not bypass the boundary.

Required evidence later includes effective process identities, inherited descriptors/environment,
filesystem mounts/rules, child-process rules, network endpoints/rules and their enforcement owner.
Read-only sandbox, approval=never, disabled flags, an empty catalog, handler absence and host
configuration alone are insufficient. M01's observed executor/collaboration surface remains negative
evidence until addressed. A hidden/unroutable tool is unreached, not OS-effect-denied.
Actual provider credential isolation remains unqualified by fake canaries and is outside M02-B.
If the host cannot enforce these boundaries, stop with feasibility BLOCKED; do not weaken M00.

## Separate future execution permission bundle

Only after B1 is accepted and the feasibility prerequisites are resolved may a new exact execution
artifact be submitted. Approval must name its digest, binary/schema/platform tuple, enforcement
mechanism, complete callable manifest, selected cases, paths, ports, counters and ownership rules.
It must explicitly authorize:

- Exclusive creation at `/private/tmp/appraise-m02-b-20261015-p1`, with P1 case paths and modes;
  refuse existing/symlink/unowned components, never replace them or choose an alternate root.
- Reading the pinned binary and reviewed schema files; one owned Codex and one scoped MCP child
  per case, private stdio, no generic shell, daemon, tunnel or process discovery permission.
- Supervisor-owned local scripted Responses listener on 127.0.0.1 with OS-assigned recorded port,
  and only exact reviewed bind/connect paths. B12 requires a separately identified owned trap
  endpoint and listener limit. Unassigned ports or unresolved loopback EPERM block execution.
- Owned-handle timeout interruption and bounded owned-fixture cleanup; no stored-PID signalling,
  deletion of ambiguous evidence or reuse of existing historical directories.
- B14 alone: a fresh asking-only exception and one empty `permissions={}`, `scope=turn` denial;
  **zero grants**. It inherits no M01 exception. If not approved, exclude B14 explicitly and lower
  the aggregate ceilings rather than silently applying the exception.

No real account/provider, auth refresh/file linkage, native/external inference, secrets, production
database/source access or Journey transition is included. Such work needs separate authority and
a new explicit budget; exhausted M01 3/3 is never reset or reused. A permission bundle is necessary
but does not prove containment.

## Start and resource limits

**This plan and proposed B1: zero Codex/MCP launches, zero threads/turns/provider requests, zero sockets.**
The later P1 maximum remains 15 thread/start sends, 14 turn/start sends and 55 local scripted
provider requests. P00: one thread, zero turns/requests. B01–B06: each one thread/turn, four requests;
B07: one thread/turn, 17 requests; B08–B14: each one thread/turn, two requests.
At most one case active, one Codex and one scoped MCP child per selected case; no replacement
launches or restarts. Across the full matrix, at most 15 of each child-launch attempt, including
failed/ambiguous attempts. P00 intentionally failing MCP setup consumes its case attempt.
Transport/helper processes or additional listeners need explicit revised ceilings before approval.

60-second acknowledgement/case bounds and 1800-second overall ceiling; zero retries, correction
turns, fallback providers or automatic recovery. Persist a reservation before each possibly sent
start/request/launch; failures and ambiguity consume the reserved slot. Any uncertainty fences the
whole run, not merely a case followed by a fresh case. No resend, budget reset or reallocation.
Partial execution reports only reached cases; unused maxima confer no further authority.

## Evidence, stop conditions and completion

Before any later turn, verify the actual pins, enforcement boundary, effective config/environment,
required scoped MCP inventory, complete standard/Lite descriptors and exact native mapping.
Keep request/thread/turn/item IDs, durable counter transitions, sanitized receipt hashes,
pre/post canary hashes, enforcement-denial observations and owned cleanup outcomes.
Classify unregistered, invocation-rejected, OS-effect-denied, effect-occurred, unreached and UNKNOWN
separately. A successful scripted turn or synthetic receipt is not accepted production Journey work.

Stop before any send on missing authority, changed accepted bytes/pins/policy, unsupported route,
broader tool, unverifiable boundary, existing/unowned root, unsafe path, credential/auth inheritance,
unexpected endpoint/header, missing durable acknowledgement or exhausted counter/deadline.
Stop after an ambiguous send/ack, EOF/partial stream, unexpected auth/permission/tool request,
forbidden disclosure/effect, additional provider request, drift, lost ownership or uncertain cleanup.
Forbid restart/resend; retain consumed intent and UNKNOWN evidence. B14's reviewed empty denial
is the sole permission-request exception and ends the case. Denial is not authority to continue.

B1 completion requires deterministic adapter/failure tests, focused lint/format/link checks,
preservation hashes and independent exact-artifact review. It must state unresolved live OS,
native routing, real durability and credential properties explicitly. Review is preparation
acceptance only; runtime approval is a separate final step after the concrete artifact exists.

## Exact next authorization requested, not assumed

> Approve M02-B-P2 B1 offline adapter preparation and containment feasibility review only, as
> scoped in m02-b-next-plan.md. Implement new additive adapter contracts and disposable offline
> tests, keep execution hard-disabled, and obtain independent exact-artifact review. Preserve M00,
> M02-A, B0 and historical evidence byte-for-byte. Allow only test-owned temporary filesystem
> fixtures and offline test interpreters. No Codex/MCP launches, sockets, probes, auth, external or
> native inference, permission grants, commits, push, M02-C+ or production dispatch. Escalate any
> required change to accepted artifacts or containment policy before implementation.

Routing for this planning-only document: coordinator-only, zero subagents; receipt
`6aff00dd-178f-4a79-a29e-19bdc4727fe6`. No host role/model/sandbox or runtime gate is claimed.
Future enforcement decisions require solver judgment and independent judge review under repository
routing guidance. No new harness policy or learning-system change is proposed by this document.
