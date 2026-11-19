# C1 acquisition diagnostics

This internal task trace locates failures between original operation boundaries. It does not prove native launch,
wire delivery, provider termination, process cleanup, accepted lifecycle transitions or qualification. Missing rows
and incomplete traces remain UNKNOWN. Historical cases have no reconstructed trace and retain their consumed budgets.

The original task parent creates one exclusive `0600` file, `c1-acquisition-diagnostics.jsonl`, in its existing private
evidence directory outside the native root. It writes synchronously through the original descriptor with file and
directory identity checks. The trace permits at most 128 rows and 32 KiB, reserving space for terminal observations.
There is no append-to-old-case, overwrite, global logger or public production registration.

Each row contains only version, sequence and fixed stage/status/reason codes. It never contains raw errors, stack
traces, paths, PIDs, provider handles, credential bytes or credential hashes, RPC payloads, stderr, configuration or
provider output. A fulfilled request row means its original Promise fulfilled; separate validation rows record whether
existing protocol/readiness checks accepted the result. An entered request row does not establish wire delivery.

The stages cover setup, original acquisition, private stream capture, original-child registration and claim, owner
matching, permit binding, initialize/config/thread/MCP/turn operations and validation, failure, cleanup and trace close.
An acquisition refusal may remain classified only as `OWNED_STARTUP_REFUSED`; the underlying supervisor error is not
exported. Diagnostic completeness never grants physical or lifecycle authority.

Trace I/O failure, identity drift or overflow latches failure and fences existing authority before any subsequent
effect. Only original live handles may request existing cleanup. A failing disk may leave only an incomplete prefix;
it cannot certify success or absence of effects. Existing deadlines, request budgets, native command/environment,
protocol checks, UNKNOWN retention and no-replay rules remain unchanged.

Verification includes an unmocked local fixture chain through the task spawner, owned supervisor, private stdio,
`launchNativeQualificationChild`, original child claim and bounded synthetic RPC exchange. This fixture uses an inert
Node executable and synthetic credentials. It does not invoke the installed native CLI, read provider credentials,
contact a provider or qualify native authentication or inference. Run it through the repository's focused Vitest route:

```sh
npx vitest run src/lib/quality-journey/codex-app-server/native-qualification-child.owned.integration.test.ts
```

A future native case requires a fresh database/root/evidence directory, exact frozen source/artifact/configuration
and prerequisite identities, finite newly recorded allowance, original parent custody and independent CASE_PACKET
review. Prior source reviews do not cover successor edits. Start once, preserve the trace and original cleanup
observations, then obtain separate actual-outcome review and canonical reconciliation. On failure or lost continuity,
retain UNKNOWN and spent allocations; do not replay, refund, reconstruct proof or signal stored PIDs.

The passive-refusal successor distinguishes protocol replies/frames and closed notification classes from source
predicate refusals and residual stream/parse/I/O failures. It records literal class/predicate codes only. Protocol
internal predicates remain opaque; an unclassified frame remains UNKNOWN. No raw method, payload, exception or frame
bytes are exported. Classification does not change which notification is accepted and does not identify an earlier
unrecorded offending frame. The historical generic passive-capture trace is preserved unchanged.

An otherwise opaque outcome observer refusal may include a one-based branch number from the digest-verified
`ServerNotification.json` schema. Only notifications that pass the existing protocol checks can reach this
projection. The diagnostic retains neither method strings nor payloads. The number is scoped to that source
artifact's pinned schema and changes no admission or outcome rule.
