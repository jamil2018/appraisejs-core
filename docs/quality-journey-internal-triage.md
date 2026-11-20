# Internal Triager and lifecycle (M10)

The local Triager uses the sealed, cycle-bound input described below. The server owner enables the local worker with `APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED=true`. See the [operator guide](quality-journey-operator-guide.md).

Local submission retains the strictly validated native report proposal and its content hash after verified sender
cleanup, before canonical submission. If that handoff fails, the Journey offers one canonical-only recovery bound to
the exact retained candidate, original attempt and submission identity, current coordinator session, and current
Journey state. Recovery never sends another native request or changes the proposed report. The original proposal and
diagnostics remain on the attempt after recovery; an accepted recovery is distinguished from unresolved failure.
An older consumed attempt without a retained proposal cannot be reconstructed or restarted.

The runtime callback that first seals terminal execution evidence can wake eligible managed Triage after commit,
even when the browser tab is closed. Reconciliation of already sealed evidence does not repeat that wake. These
in-process callbacks are opportunistic; persisted work and consumed dispatch markers remain authoritative, and
reconnect or an explicit resume can inspect eligible continuation without replaying a native attempt.
The Next Node instrumentation hook registers this callback when the server boots; managed actions also register it.
The process-global registration replaces an older callback during hot reload instead of accumulating listeners.
Standalone runtime callers that do not initialize that application hook rely on explicit reconciliation or the
Journey observer to request eligible continuation.

Disposable `APP_SERVER_LOCAL_V1` Journeys can use the repository-only, attempt-scoped Triager MCP gateway after
Appraise has sealed every run in the exact terminal execution cycle. This follows the M09 versioned admission
composition. The current coordinator claims and admits one specialized assignment; Appraise binds its lease,
principal, session generation, immutable input and scope. Admission records `hostIsolation: NOT_ATTESTED`.
This internal composition does not enable public managed opt-in or production provider dispatch.

The shared read-only assignment check runs before fresh claim/admission, on scoped reads, and inside fresh canonical
report acceptance. It requires the active Journey, target, cycle and work item, exact approved scenario revisions,
sealed evidence hashes, input-artifact lineage and, for revisions, the preceding report and human feedback.
Missing readiness registration fails closed. Worker reads do not advance coordinator ownership versions.
Appraise derives a report revision identity from the Journey and admitted attempt. The specialized service enforces
that identity transactionally, including direct versioned ingress; a gateway check alone is insufficient.

The worker profile exposes only `quality_journey_triage_get`, `quality_journey_triage_evidence_read` and
`quality_journey_triage_submit`. Context contains only the assigned frozen inputs. Evidence selectors are limited to
a receipt ID, report or log kind, and a bounded page. The service authenticates the live admitted attempt and verifies
the assigned receipt, runtime identity and artifact bytes, then rechecks authority after I/O. It accepts no artifact
paths. Credentials and coordinator bindings are injected by the trusted composition. A worker cannot certify a run,
request or approve consent, start a rerun, revise a human decision, or close a Journey.

Verified terminal runtime publication uses a fixed in-process child for disposable internal cycles. It validates the
complete terminal run and sealed receipt set in the same transaction and contends on the current ownership CAS.
Persisted session lineage selects that fence; it never supplies coordinator credentials. The staged E2 guard remains
closed. The executable supervisor resolves from the installed application scripts directory, independently of capsule
output storage.

The canonical specialized submission validates the complete report and atomically commits its artifact links, work
completion, publication and external acceptance outcome. Worker text, agent exit and turn completion never establish
test success. Exact authenticated submission/outcome replay retains the existing durable recovery semantics after
completion or expiry; a changed payload cannot reuse its idempotency key. A completed gateway need not be reopened
to read that outcome.

Human report revision, selective rerun approval, fresh exact-scope execution consent and closure use the existing
Appraise controls. Revision issues successor Triager work with the preceding report and feedback. A rerun reserves a
new immutable cycle from the approved predecessor and needs its own consent when its effects require it. Only actual
RuntimeCapsule outcomes and sealed evidence can support the next report. Closure binds the exact active report hash,
revision and state and rechecks approved Analysis, execution, blockers and unresolved items in its transaction.

The M08 browser-evidence and access-parking rules, staged E2 invalidation fence, M07 polling/project isolation/exact
forms, and M09 approval/resource/consent boundaries remain applicable. Runtime and provider
qualification beyond the disposable guest checkout, live protected access and public managed opt-in remain open. The [operator guide](quality-journey-operator-guide.md) records the local checkout result and remaining human decision. [M11](../tasks/codex-app-server-journeys/M11-VERIFICATION.md) verifies deferred internal publication through pause and fresh-client resume; its synthetic terminal-state fixture does not qualify physical runtime execution. The M06 STOP
and spent-attempt evidence retain their original meaning.

A completed manual preparation successor also permits operator review inside Appraise. The operator previews the assigned cycle’s sealed Cucumber steps without claiming a worker lease. Appraise verifies the report bytes against the frozen receipt and checks current ownership after reading. Saving the operator’s findings acquires the scoped assignment, reads the sealed evidence through the worker gateway, and submits against the reviewed input hash. A target defect attribution requires complete evidence of a failed test. Appraise derives the run, scenario, and requirement links and publishes the report through canonical triage submission. An unresolved native worker remains fenced throughout review.
