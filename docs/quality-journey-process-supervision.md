> M06 repository continuation adds [internal Analysis fixture delivery and blocked follow-up observation](quality-journey-analysis-delivery.md). The consumed-slot and physical-reconciliation boundary is unchanged; full M06 remains incomplete. Earlier milestone scope statements below retain their historical meaning.

# Journey local process supervision

M05 implements an internal owned-process supervision core and a local Node fixture adapter. Production app-server dispatch and the real provider launcher refuse unconditionally. No route, CLI, MCP registration, scheduler, role instruction loop or M06 behavior enables this sender. [M05 continuation](../tasks/codex-app-server-journeys/M05-CURRENT-WORK-01.md) records evidence and limitations; [the bounded plan](../tasks/codex-app-server-journeys/m05-supervision-plan-01.md) records acceptance criteria.

## Lifetime and authority

Each reserved turn owns one private child and transport. A persistent child could save initialization/MCP setup cost but would retain cross-intent queues and state without a measured need. Per-turn ownership bounds shutdown and state lifetime; startup cost is unmeasured. Native resume framing captures and checks the same attempt's thread ID, without fallback to a new thread. M04 exposes only the initial intent; M05 does not create a second intent, automatic resume, correction turn or replacement after an ambiguous start.

The trusted internal adapter supplies immutable input, configuration identity, readiness validation and launch code. Its Symbol capability is an in-process boundary, not sandbox attestation. No caller-controlled JSON or provider event can construct it through a public endpoint. The core fixes the frozen D05 model/effort and derives the actual envelope digest. The fixture adapter hashes script bytes, arguments, exact environment policy and frozen policy; its envelope is synthetic. A future provider adapter still requires separately authorized implementation/configuration and exact runtime qualification.

M03 session/generation and assignment lineage remain canonical. M04 prepares, claims and arms one run/intent and reserves the hub slot as UNKNOWN before launch. No replay recreates a permit. The supervisor retains Journey, target, session/generation, attempt, assignment/generation, run, intent, send boundary/claim epoch, namespace, transport UUID, request sequence and captured thread/turn. Transport UUID and sequence are separate from coordinator and assignment generations. Sanitized transport observations bind their UUID in the observation key and complete identity in the evidence digest. No secret, prompt, provider text or transcript is persisted.

Every protocol write rechecks live canonical authority, original intent and deadline inside the M03 ownership CAS transaction. The callback enters its synchronous private write gate before returning; the RPC reply Promise is boxed and awaited outside the database transaction. Pause/transfer and writes therefore contend on the same SQLite write fence. A lost database commit reply after physical I/O remains ambiguous and is never retried. Local cancellation also closes the write gate synchronously. Delayed tasks, aborted requests and backpressure continuations cannot send after that gate closes. Bytes already handed to the OS may have been delivered; fencing does not erase them.

The 40-second authority check does not extend canonical leases or budgets. It rechecks current ownership and fences on expiry/revocation. There is no background scheduler or dispatch guarantee. Canonical pause blocks every later transactional write even before the next local cleanup check; protocol events cannot reopen the gate. Native workers' internal effects are outside this local transport proof.

## State and transport bounds

| State     | Meaning                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------- |
| startup   | Durable intent is being armed; the private child has not completed readiness.                                    |
| readiness | Initialize/initialized and start/resume handshake are in progress under canonical authority.                     |
| active    | Exact thread/turn acknowledgement is durably recorded; no canonical artifact acceptance follows.                 |
| draining  | Write authority is synchronously fenced; owned group shutdown is being observed.                                 |
| stopped   | Owned group drain and private-root removal were observed. Provider termination and slot release remain unproved. |
| uncertain | Startup, drain or cleanup could not be fully observed. Work remains fenced.                                      |

JSONL uses strict UTF-8 decoding, supports fragmented and coalesced frames, and caps each frame at 256 KiB, aggregate input at 8 MiB, aggregate writes at 2 MiB and discarded stderr at 256 KiB. One outstanding RPC and one in-flight write are allowed; there is no queued sender. Replies require exact request IDs, one result/error and bounded object envelopes. Unexpected inbound RPC requests block the transport without granting permissions. Known thread/turn events require exact handles; optional presentation notifications are discarded. No event changes Appraise lifecycle state.

Request/write deadlines never exceed 60 seconds. The turn-start acknowledgement uses the earlier original M04 deadline and any lower fixture turn-acknowledgement timeout. This separate timeout never shortens the initialization/readiness deadline. The 15-minute original turn deadline fences the transport; no timer renews it. Cancellation, stream failure, malformed/oversized input, partial EOF, wrong correlation, child exit, timeout and permission requests close the write gate, reject pending work and begin bounded owned drain. Backpressure waits for callback and drain, without resending bytes.

## Private launch and cleanup

The enabled fixture launcher uses the exact Node executable and selected absolute fixture script, without a shell. It creates a fresh mode-0700 root and separate home, Codex state and temporary directories, and an empty mode-0600 config. The supplied child environment contains only HOME, CODEX_HOME, TMPDIR and LANG; Darwin may inject its runtime encoding metadata key after launch. No ambient credential/config/plugin/skill or target workspace is copied. The fixture verifies actual environment isolation, directory modes and config contents.

Private stdio bypasses the generic spawner's output buffering, process registry and global output/spawn/exit events. The private owned supervisor's live nonce capability controls process-group cleanup. Stored/raw PIDs never authorize signals. Transport closure precedes asynchronous group drain; successful drain removes only that invocation's private root. Failed or unobserved drain retains the root conservatively and reports uncertainty. The cleanup receipt contains bounded observations, not raw output or a claim about global helper lifetime.

M05 never creates a sender-disabled reconciliation proof for a consumed permit and never releases its occupied slot. Completion, cancellation, timeout, exit and group drain are insufficient provider-outcome evidence. Existing historical accepted submission replay and specialized artifact validators remain Appraise-owned. M04 uncertainty and replacement/transfer barriers survive storage reconnect and process restart.

## Verification and qualification boundary

The direct `node --import tsx scripts/m05-owned-process-smoke.ts` path uses disposable migrated SQLite plus an actual owned local Node child. It was established before new tests. Focused suites cover private transport, real owned child and composed canonical services/persistence. Process-group tests need permission to inspect the owned group with `ps`; a sandbox refusal is not a product success or a reason to weaken ownership checks.

Root source is canonical. Scaffold preparation retains runtime core/transport and excludes the repository-only fixture smoke, owned child fixture and tests that need that fixture. Transport unit tests and existing self-contained services remain available.

No fixture, SQLite, configuration or static success qualifies the actual Codex app-server, authentication, effective capabilities, model/spend behavior, containment, global helper lifetime or installed packaging. `runtimeQualified=false`, GC3 REVISE/not passed, exhausted real inference 3/3 and all historical UNKNOWN/cleanup records remain unchanged. Real app-server/provider qualification needs a separately authorized exact disposable campaign; consumed campaigns and runtime roots must not be reused. Production dispatch, M06+ and shipping remain separately gated.
