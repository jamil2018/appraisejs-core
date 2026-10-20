# M05 bounded implementation plan

Date: 2026-10-20 (Asia/Dhaka). Authorized by the current host conversation for all M05 repository slices, offline checks and owned fixture-process smoke. No real provider/app-server launches, authentication, inference, production dispatch, M06+, shipping or harness policy changes.

## Verified base and continuation

Fresh fetch of origin/appraise-0.5 succeeded. Isolated branch `codex/m05-supervise-local-process` starts at `9011b6b43f8bd45cf1e486cb363e890ec6c66d41` (PR #304 cleanup lesson), containing shipped M04 (PR #303). Original migration checkout and unrelated worktrees are preserved. This additive document supersedes preparation-only M04 checkpoint headers for current continuation; approved M00/M03/M04 plans and historical evidence remain unchanged. M02 remains scripted functional conformance with unobserved helper lifetime, runtimeQualified=false, real inference consumed 3/3, historical UNKNOWN and cleanup unchanged.

## Evidence and decision

Canonical sources: M00 authority contract; M02 shipped scripted qualification; M03 host-session service and docs; M04 provider-run service/permit contract and provider-intent docs; private owned-process-stop supervisor; M01 protocol fixture. Canonical Graphify query returned process ownership neighbors; direct source establishes the contracts. Upstream pinned Open Design reference describes per-turn child/resume; remote source retrieval failed, so no upstream implementation is copied or claimed inspected this run.

Choose one child per reserved turn, with a captured thread handle for explicitly authorized resume, rather than an indefinitely persistent child. This bounds private state, transport ownership and cleanup per intent and prevents a stale child silently receiving successor work. It repeats startup/MCP setup; startup cost is unmeasured. A persistent child amortizes setup but introduces cross-intent queues and takeover ownership with no current requirement or qualification. M04 currently exposes only initial intent: resume support must not create a correction loop, second intent, replay or new budget. Same-attempt context only; mismatched resume fails without fallback. Real provider configuration/qualification remains gated.

## Invariants and acceptance

1. One durable run/intent/slot and original ephemeral permit precede process I/O. No reconstructed permits, resend, replacement, turn/attempt reset, changed model/policy or authority inferred from events. M03 canonical session/assignment/authorization checks remain authoritative.
2. Private owned stdio and fresh 0700 configuration roots, exact executable/argv, no shell, ambient auth/config/environment or target workspace. Live owned group capability only; never signal a restored PID. Explicit startup, readiness, active, draining, stopped and uncertain/fenced state. No production entry point can launch.
3. Correlation retains Journey, target, session/generation, assignment/generation, run, intent, boundary/epoch, namespace, transport identity, request IDs, thread and turn. Validate replies and known events. Unexpected RPC blocks; no permission approval or capability expansion.
4. JSONL is UTF-8 byte bounded; fragmented/coalesced data supported. Malformed, oversized, partial EOF, invalid reply/handle, stream errors, backpressure and deadlines fail closed. Bounded pending work and queues. No raw provider payload persistence/logging.
5. Revocation synchronously closes the only write gate and destroys writable transport before asynchronous drain. Every delayed sender rechecks that gate immediately at I/O. No raw streams or child handles escape. In-flight bytes may already have been delivered and remain uncertain.
6. Cancel, timeout, logical completion, child/group exit and successful transport drain are separate observations. Transport disabled/owned cleanup does not establish provider termination, canonical acceptance or release a consumed occupied slot. Restart observes durable UNKNOWN and refuses replacement. Shutdown is idempotent, bounded and cleans owned ephemeral resources after observed drain; failed drain retains recovery evidence.

## Sequential slices and verification

- S1: Implement bounded private transport and owned child; integrate M03/M04 service into one real local Node fixture plus disposable migrated SQLite path. First run a direct smoke script before authoring new regression tests. Observe initialization, thread and turn correlation, acknowledgement persistence, fence/drain and occupied slot after reconnect.
- S2: Regression tests for framing/UTF-8 fragmentation, malformed/oversize/EOF, invalid events and correlation, unexpected RPC, partial/error writes, backpressure, acknowledgement/turn deadlines, crash/restart, stale sessions, cancellation/draining, delayed sender and owned cleanup. Include composed service + SQLite + real child paths.
- S3: Update current continuation and runtime docs additively; canonical scaffold preparation, generated graph refresh, migration integrity, focused and related service/package suites, lint/format, harness and root build. No schema change anticipated.
- S4: Freeze exact final artifact and independent review with bounded context; fix blocking findings and renew review after tracked changes. Record reviewed manifest identity, observed fixture behavior and qualification limits. No push/merge/release.

Working fixture success is local process evidence only. It cannot qualify the real provider, authentication, containment, helper lifetime, model behavior, budgets/spend, M11 recovery or installed hosting. Future real qualification needs new exact authority and separately reviewed disposable configuration and campaign; consumed historical commands are never reused.
