# M02-B-P2 B1 offline adapter preparation

Date: 2026-10-15 (Asia/Dhaka). B1 is partial preparation; positive native mapping remains unmet.
Implementation and deterministic verification only;
independent exact-artifact review outcome is recorded separately in the host conversation and ignored
`.appraisejs/m02-b1-review-*` receipts. This document does not confer runtime authority.

## Authority and preservation

> Approve M02-B-P2 B1 offline preparation only. Implement adapters and disposable tests, then
> obtain exact-artifact review. Preserve M00, M02-A, B0 and history. No runtime launches, sockets,
> probes, auth, inference, grants, commits or push.

The subsequent user instruction requested completion of verification and review within the same
limits. The [P2 plan](m02-b-next-plan.md) remains unchanged as the proposal at which that approval
was given. [B0 checkpoint](CURRENT-CHECKPOINT.md), [B0 evidence](m02-b0-preparation.md),
[P1 matrix](m02-b-plan.md), M02-A and all earlier documents/history retain their original bytes.
B1 is additive. Previous aggregate acceptance remains historical, not acceptance of B1.

M00 remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`;
GC3 remains REVISE / not passed; M01 native inference remains exhausted at 3/3. No ambiguous start
is resent. HEAD remains ac758cea, whose prior push is recorded history. No commit or push occurred.
The pre-B1 preservation map includes all 3154 pre-existing workspace files plus six prior local
review records (3160 identities), checking hashes and modes. New ignored B1 process evidence
is not authenticated authority. All earlier review receipts are preserved.

## Additive implementation

All adapter source is under
[`scripts/tests/fixtures/codex-app-server-m02-b1/`](../../scripts/tests/fixtures/codex-app-server-m02-b1/).

- `framing.mjs`: bounded fragmented UTF-8 JSONL, fatal malformed data/EOF handling and unconditional
  runtime refusal. No process, descriptor, socket, network or launch factory exists.
- `supervisor.mjs`: injected byte writer/clock/shared journal; initialize/initialized and strict
  thread/turn correlations; durable reserve before simulated start sends; deadline, partial-write,
  duplicate, foreign response, required-MCP failure and EOF fencing. This synthetic protocol subset
  is not an actual pinned-binary schema implementation or runnable supervisor.
- `storage.mjs`: exclusive OS temporary roots, 0700/0600, no-follow file opens, inode ownership,
  private journal state, budget ceilings, file-sync/rename/directory-sync acknowledgement, injected
  crash cuts, overlapping-operation fence and bounded validated restore. Every recovered journal
  is read-only/fenced without cleanup authority; old disk state cannot authorize budget reset.
- `mcp.mjs`: in-memory byte framing around the unchanged B0 fixture and M02-A gateway, immutable
  synthetic case/role/assignment, strict handshake/envelopes, exact role catalog and no ambient
  resource discovery/fallback; shared-journal fencing. One-shot empty-denial contract for B14 is
  synthetic only and never enables its asking exception or grants permission.
- `responses.mjs`: synthetic standard/Lite request subset, complete descriptor/namespace hash gating,
  injected request processing, durable request reservation, bounded SSE byte serialization/parser,
  strict event ordering/identity, and request/stream/auth-header/drift failure fencing. Request
  acknowledgement means simulated processing, not socket delivery. Unknown native mapping stays
  UNQUALIFIED and cannot authorize execution. No normal provider or HTTP server is implemented.
- `native-evidence.mjs`: exact hash-bound read of retained M01 negative evidence. It records the
  observed broader executor/collaboration names and missing full descriptors; it never constructs
  schemas or relabels them as scoped MCP routes. The positive native-mapping acceptance criterion
  in P2 remains unmet, distinct from unqualified runtime behavior.
- `evidence.mjs`: bounded allowlisted hashes/counters/correlations and sanitized classifications.
  Offline evidence cannot attest OS denial/effect occurrence, containment or M02 completion.

Disposable tests use only OS-allocated `appraise-m02-b1-offline-*` directories and owned file handles.
The fixed future runtime root `/private/tmp/appraise-m02-b-20261015-p1` is not created. The interpreter
processes running these unit tests are distinct from prohibited Codex/MCP runtime children.
No canary outside these disposable directories or real credentials/database/source is accessed
by an untrusted worker; no worker exists in B1.

## Verification and exact-review boundary

[Adapter tests](../../scripts/tests/codex-app-server-m02-b1-adapters.test.mjs) and
[storage tests](../../scripts/tests/codex-app-server-m02-b1-storage.test.mjs) cover wire fragmentation,
ordering/correlation, six synthetic role packets, forged/broader-tool rejection, no send on sync loss,
shared UNKNOWN fencing, duplicate requests, simulated EOF/timeouts, four storage crash cuts, clean
and malformed recovery, concurrent storage operations, ownership replacement and denied cleanup.
They also cover standard/Lite descriptor drift, auth/endpoint/request-size refusal, SSE ordering and
truncation, no native mapping promotion, empty-denial fencing and sanitized evidence.

Final repair verification: 56 B1 tests (46 adapter, 10 storage), 30 unchanged B0 tests and
20 M01 synthetic/saved-observation audits passed (106 total). The 84 unchanged M02-A tests passed. Historical observation test names refer
to saved M01 records, not new live observations. Focused ESLint/Prettier, links, diff whitespace and
full pre-existing-file identity preservation are required before review. Final counts/repair history
and snapshot are recorded in the review receipt and host report.

No product/package/schema/runtime deployment change requires build or scaffold sync. Historical
root font-fetch/typecheck and loopback EPERM failures remain unchanged in M02-A evidence.
Existing graphs are accepted bytes: rebuilding them would violate explicit preservation authority.
Graph regeneration is therefore deferred; no graph output is hand-edited or claimed refreshed.
B1's new modules can be navigated directly from these links.

## Containment feasibility record and remaining blockers

Read-only solver decision: preparation may proceed, runtime feasibility remains **BLOCKED**.
A candidate for a future independently assessed mechanism is a separate restricted worker process
in a dedicated guest/OS-enforced compartment, with deny-by-default mounts/network and brokered
scoped MCP/provider channels; supervisor, provider and gateway stay outside it. A native macOS
process sandbox profile is only a comparison candidate. Neither is selected, installed or tested.
Support on recorded macOS 27.0.1/26A434/arm64 and compatibility with Codex 0.162.0-alpha.17.2 are
UNKNOWN. No platform-support assertion is made from a configuration file.

Still unqualified: effective FDs/environment, mounts/symlinks, other-process and child-process access,
network rules, native tools, ambient plugins/skills/MCP, real credential separation and actual
provider transport. M01's broader executor/collaboration observation remains negative evidence.
A generic Code Mode executor/collaboration bridge is not an acceptable mapping. The B07 Analyzer
native validation-layer route for Designer/Triager complements remains blocked; changing the matrix
or capabilities needs separate approval. The native schema tuple was not refreshed by a binary launch.

Offline fsync/rename success verifies those calls and failure handling on disposable files, not
power-loss durability. Node path/inode checks are not hostile same-UID TOCTOU containment proof.
The adapters are disconnected contracts, not a production aggregate dispatcher: active-case/run
ownership, aggregate launch counters, actual native schema mapping, process/socket construction,
OS enforcement, real HTTP wire compatibility and production canonical acceptance remain unavailable.
No constructor, permission object or mapping can unlock their hard-disabled runtime methods.

The P2 requirement to map each actual native descriptor cannot be fulfilled by retained name-only
evidence. Full B1 acceptance remains REVISE/BLOCKED unless complete previously captured descriptors
are supplied or the user explicitly narrows that acceptance criterion to fail-closed mapping
preparation. No such scope revision is assumed. All other adapter findings are repaired and
submitted for exact-artifact re-review. Any narrower adapter acceptance is preparation only. Any future runnable artifact requires separately
reviewed enforcement/storage/transport composition and explicit path/process/loopback authority;
B14 needs a fresh asking-only exception and zero grants. External/native inference needs a separate
new budget, never M01's exhausted allocation. M02 remains incomplete; M02-C+ and M03 sessions/product
dispatch remain unauthorized. Unreached/unregistered is not OS-effect-denied.

Route receipt: `c2bd5d7a-f2c1-41c9-b553-2a99b0317da0`. Solver/judge use no inherited parent transcript;
requested routing is not effective host role/model/context/sandbox proof. No scored harness success
or lifecycle gate is inferred. Useful review lessons are recorded locally; no routing, permission,
quality gate or harness policy is changed by B1.
