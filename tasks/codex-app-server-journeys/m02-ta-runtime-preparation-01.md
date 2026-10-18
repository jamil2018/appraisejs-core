# M02 trusted-agent runtime preparation 01

Date: 2026-10-16 (Asia/Dhaka). Status: offline executable candidate prepared; no runtime authority consumed. Independent exact-artifact review is bound separately.

## Direction and approval boundary

The user requested: “alright, finish the rest of the tasks for M02, I am approving the actions.” This authorizes the remaining preparation and review. The approved M02-TA-P1 exact-next-authorization clause still requires final approval naming the concrete runnable bundle, commands, disposable roots, helpers, native-tool profile and staged gates. It says, “Do not authorize unseen runtime scripts now.” The T0 artifact was inert preparation; the executable T1 command did not yet exist at that approval. No launch is inferred from the broad request.

M00, the approved TA02/ADR-0006/M02-TA-P1 bytes, accepted M02-A/B0/B1/T0 artifacts and all historical/UNKNOWN evidence remain immutable. GC3 is still REVISE/not passed; the native inference budget remains exhausted at 3/3. M02 is incomplete. No product Journey, schema/UI/release work, authentication, inference, grant, commit, push, merge or publication is part of this work.

## Runtime composition findings

The T0 offline tests were truthful for their bounded preparation scope. Preparing an actual supervisor exposed composition prerequisites that those helper tests did not establish:

- The accepted launcher routes normal cleanup into the journal's recovery-only public method; a normal terminal case would fail before stop. Additive runtime composition needs a separate durable normal-stop receipt while preserving fenced recovery semantics.
- `thread/start` does not itself carry full native MCP catalog evidence. The existing scoped child does execute exactly two canonical operations—bootstrap and exact profile binding—before constructing its SDK connection. Supervisor-owned evidence of these successful, correlated operations plus successful required-MCP thread start supports a narrow startup claim. Actual descriptor inventory and functional routing are distinct later observations. No constant-true startup verifier is permitted.
- The supervisor owns the Codex process handle and listener, but not a separate OS handle for the MCP subprocess created by Codex. A nonce-bound shutdown receipt from an additive child wrapper is trusted self-report, not OS process attestation. Missing shutdown/owned-handle closure evidence means UNKNOWN.
- A durable journal must precede the first native-effect reservation, while the accepted native ports expect to create the phase root themselves. The runtime journal exclusively creates that root once. An explicit one-use ownership handoff checks the same captured device/inode/owner/mode both during the port's mkdir and every subsequent root lstat; it never adopts an earlier run's root or blesses a replacement.

These fixes are additive runtime composition; accepted T0 sources are preserved. There is no containment claim and no new process, listener, provider request, tool action or phase-root allowance.

## Read-only identity check

The host still matches macOS 27.0.1 / build 26A434 / arm64. The Codex binary at the approved application path hashes to `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`. Node is v26.11.0 at `/opt/homebrew/Cellar/node/26.11.0/bin/node`. These facts were obtained by reading the public OS plist, executable bytes and the ordinary Node interpreter identity; Codex was not invoked. They are identity prerequisites, not support or runtime evidence.

## Execution boundary

Only an exact reviewed T1 command can be approved at this point. It permits at most one Codex child and one scoped MCP child, one owned 127.0.0.1 listener, one thread, one turn and one provider request; no model/tool response, tool execution, authentication, inference, grant or retry. T1's case limit is 60 seconds and overall phase limit 180 seconds. It uses only the fresh `/private/tmp/appraise-m02-ta-descriptors-p1` tree; the other two proposed roots remain absent.

A stop preserves consumed intents and UNKNOWN, stops only current owned handles, retains evidence and never resends a possibly sent start. Missing/changed pins, tuple, paths, unexpected request/tool/auth/network, deadline, missing receipt or uncertain cleanup stops the sequence. T2/T3 remain blocked until actual captured descriptor containers and native routing are reviewed. New mapping code or changed ceilings requires exact review and revised approval before more starts. There is no automatic M02 pass from descriptor capture.

The executable supervisor must bound the entire orchestration, not only the successful cleanup call: native start, RPC writes, failure cleanup, listener close and canonical disconnect can all await indefinitely. Application deadlines fence the journal and prohibit subsequent actions; the explicit CLI must exit on an unresolved deadline after best-effort owned cleanup. An unresolved child or listener is retained as UNKNOWN, never relabeled a successful stop or retried. These are application stop controls, not authenticated host enforcement.

## Prepared candidate and verification

The additive implementation consists of `scripts/tests/fixtures/codex-app-server-m02-ta-runtime/{journal,t1-scoped-entry,t1-error-adapter,t1-runner}.mjs`, `scripts/tests/codex-app-server-m02-ta-runtime.test.mjs`, this preparation record and [the exact T1 authorization request](m02-ta-t1-runtime-authorization-01.md). The retained T0 files remain unchanged.

The T1-only error adapter is needed because an intentionally rejected provider request can emit an error notification before its failed terminal. It recognizes only one correlated, nonretryable HTTP 503 after actual descriptor capture; unrecognized shape, request ID, foreign correlation, retry, duplicate or premature error fences UNKNOWN. The unchanged T0 peer still validates the terminal. Only sanitized status/IDs and message/frame hashes are retained. The candidate upstream field shape is not qualified against the pinned binary. [Official documentation](https://learn.chatgpt.com/docs/app-server) describes the error-before-failed-terminal ordering; upstream `https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/typescript/v2/ErrorNotification.ts` supplied a candidate shape, not an immutable pinned-binary schema.

The new runtime suite passes 13 deterministic checks, including a fake complete run, hanging stop/start, the stop-authorized-before-signal branch, independently bound child receipts, one-use root identity transfer, retention replay and the real accepted peer behind the narrow error adapter. These are fake-port/pure checks, not native observations or actual crash/reopen evidence. No fixed runtime root was created for testing.

Read-only preparation produced the private r2 manifest with 5,800 exact runtime pins. Its digest is `685c6f8502273a8d86330b765b204c7554b64e3f4b4d2a23bb77a7ee7d3eeadb`; file SHA-256 is `c8fa77e1809dd47889be5c143b1947e5b108b9d08c298a4938c3f5e82947fc16`. Earlier r1 is retained, unapproved history: its source used locale-dependent ordering, corrected to deterministic codepoint ordering in r2. Preparation did not start Codex, MCP, a listener or provider request. Exact command, primary hashes, path/permission profile, retention owner and subsequent gates are in the authorization request. It authorizes nothing until accepted in the host conversation.

Graphify dry-run selects script/package scopes. Actual graph regeneration is deferred to preserve accepted graph bytes; no Graphify inference or output rewrite ran. No product build/template sync is needed for additive repository-only harness files. The pre-existing root TypeScript diagnostic recorded by T0 remains historical; it is not asserted fixed here.

Final producer validation: `node --import tsx --test scripts/tests/codex-app-server-m02-ta-*.test.mjs scripts/tests/codex-app-server-m02-ta-*.test.ts` passed **65/65** (52 retained T0 checks plus 13 additive runtime checks). Affected-file ESLint, Prettier and `git diff --check` passed. Fresh read-only enumeration matches all 5,800 r2 pins and the manifest digest. All 3,253 pre-task file hashes/modes remain unchanged; all three planned runtime roots remain absent. The T0 288-test package result is retained earlier evidence, not a claimed new full-package rerun. No product/schema/React behavior changed.
