# M02 startup repair and continuation record 03

Date: 2026-10-16. This is the scoped R8/p5 correction under the user's current instruction to fix startup compatibility using Open Design or t3code and finish M02. It follows the consumed [R7 UNKNOWN attempt](m02-ta-t1-execution-04.md), rather than resending it. No auth, real inference, grants, commits, push or M03+.

## Source-backed finding and settled correction

The pinned `ServerNotification.json` defines optional top-level `emittedAtMs` as an int64 Unix-millisecond integer for all 85 method branches. R7's advisory envelope accepts only jsonrpc/method/params; its own error adapter already allows safe-integer emittedAtMs. In-memory schema-valid remote-disabled, empty skills, warning and required-MCP status fixtures with a timestamp reproduce R7's envelope fence. Open Design routes notifications separately from requests, and t3code separates envelope routing from params decoding; neither requires suppressing unknown authority-bearing events. These pinned sources are retained under `.appraisejs/m02-open-design-reference-20261016-01/` and `.appraisejs/m02-t3code-reference-20261016-01/`.

Actual p4 retained only a null-method-hash envelope failure. It does not prove emittedAtMs was present, identify the method or establish benign state. The correction repairs a deterministic compatibility gap without rewriting that uncertainty.

The read-only solver settled this bounded contract:

- New R8 source/test/policy/canonical variant only, preserving R7/R6 and all earlier accepted bytes. Fresh root `/private/tmp/appraise-m02-ta-descriptors-p5`; no adoption, recreation, replay or deletion of p1–p4.
- One pure inbound ID-less notification-envelope validator before notification-specific handlers, including the 503 adapter. Allow only `jsonrpc`, `method`, `params`, optional `emittedAtMs`. Require own bounded nonempty string method and own params. JSON-RPC is absent or `2.0`; emittedAtMs is absent or a safe integer, including negatives permitted by the schema. It conveys no clock, deadline, identity, readiness or authority and its raw value is discarded.
- Reject any id, including null; result/error mixed fields; unknown top-level key; malformed timestamp; absent method/params. Preserve all method-specific nested schema checks, strict lifecycle/status/correlation, disabled/no-environment remote-control requirement, required-MCP receipts, auth/permission fences, unknown-method fence and existing traffic/quota limits. Requests and responses keep separate correlation handling.
- Safe failure evidence hashes an available method and records only a fixed envelope-failure reason enum and timestamp-presence bit in addition to existing fixed metadata. No raw frame, timestamp, message or payload retention. Persistence uncertainty remains UNKNOWN.
- Offline tests use pinned-schema-valid representative advisory and lifecycle frames with/without the optional timestamp; cover all 85 inventory methods at the envelope layer, negatives for strings/fractions/unsafe integers, extra/id/result/error/missing keys, quota/auth/active-remote regressions, and the R7 rejection versus R8 acceptance. Full inert T1 must include timestamped startup/lifecycle/error metadata.
- Preserve serialized initialize → initialized → single durable thread/start; actual model `gpt-6.1-sol`/medium guard; one scripted request; zero model/tool responses; correlated nonretry 503, actual failed terminal and owned Codex/MCP cleanup. No new helper, signal, EOF policy, retry or resume.

## Exact scope, preservation and limits

R7 explicitly prohibited an automatic p5. This record is the separate scoped corrective decision after a source-backed offline finding, covered by the user's latest full fix/finish authority. It does not reuse the R7 command or pending RPC. Independent exact source/tests/manifest/command review must pass before one p5 attempt. No automatic p6 is authorized; another ambiguity needs a fresh scoped assessment rather than an execution loop.

The R8 baseline `.appraisejs/m02-r8-preservation-baseline.json` binds 3,312 retained files/modes, SHA-256 `338bc07ae9b33a61ad8bb2c12f96f046512e3cf6804593450e9995000380e368`. Current owned p4 journal/identities and archive must match, with p1 lost-root proof and p2/p3 UNKNOWN guards unchanged. Guarded canonical p4→p5 root replacement must reverse-normalize to the accepted p4 hash.

P2/p3/p4 each consumed one native/MCP/listener reservation; p3/p4 each consumed a pending thread start. Including a successful p5 T1 and remaining T2/T3 matrix, cumulative maxima become **30 Codex/MCP/listener starts, 29 thread starts, 26 turn starts and 63 local scripted provider requests**. These are bounds, not claimed successes. Per p5 attempt: one Codex, required MCP and owned loopback listener; one thread, one turn, one local provider request, two canonical startup requests, zero tool/model responses/helpers. Case 60 seconds, phase 180 seconds. No real provider, auth, grants, resend or counter reset.

P1 decision deadline remains `2026-10-22T18:54:08.422Z`, p2 `2026-10-23T13:18:36.648Z`, p3 `2026-10-23T13:58:35.561Z`, p4 `2026-10-23T14:18:50.368Z`. P5 gets an independent clock. UNKNOWN histories are retained; no clock or status is superseded. M00 remains frozen at `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`; real inference remains exhausted at 3/3; GC3 stays REVISE / not passed.

The exact reviewed command needs only its named owned-loopback/pinned-child sandbox exception before first invocation. No preliminary socket probe, reusable shell/network prefix, alternate executable, permission fallback or ambiguous resend. Configuration and offline checks do not establish containment. Actual native descriptors and cleanup must be reviewed before exact T2/T3 implementation and execution under the existing full-M02 authority.
