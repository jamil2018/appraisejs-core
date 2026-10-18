# M02-TA-P1 T0 offline preparation

## Authority and status

The user approved TA02, M02-TA-P1 and ADR-0006 at design snapshot
`b8912c8360d9a305ae829f84cef8757f0c682cfa1d783dfc501a9c96d3bc7f17` and authorized T0 offline implementation with exact-artifact review. See [the approval record](m00-ta02-approval.md). This document records preparation; independent review is bound separately in the ignored review receipt. M02 has not passed.

No Codex/app-server, scoped MCP child, native tool, listener, runtime probe, authentication, inference, permission grant, commit or push was started. Ordinary offline tests, build tools and disposable SQLite fixtures were used. The original M00 remains frozen at SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`; GC3 remains REVISE/not passed and M01's native inference allowance remains exhausted at 3/3. Existing artifacts and UNKNOWN/history are preserved.

## Implemented artifacts

All implementation files below are new. Existing accepted gateway, mapping, descriptor capture, B0/B1 and historical documents are unchanged.

- `packages/appraisejs/src/mcp/trusted-worker-native-route.ts` and its test: strict SDK-profile and descriptor linkage, explicit direct/wrapper codecs, one outer call per inner operation, correlation and fixed B07 rejection construction. Synthetic and captured provenance remain distinct.
- `packages/appraisejs/src/mcp/trusted-worker-bridge.ts`: bounded capability/case/request-bound canonical IPC and scoped SDK endpoint construction; ambiguous responses fence the client and never retry.
- `scripts/tests/fixtures/codex-app-server-m02-ta/`: policy, durable journal, composition gates, correlated JSONL protocol, inert native OS adapters and launcher, evidence projection, disposable canonical fixture/packets, supervisor bridge, explicit scoped child entry and offline compiler.
- `scripts/tests/codex-app-server-m02-ta-{policy,journal,composition}.test.mjs` and `codex-app-server-m02-ta-{canonical,bridge}.test.ts`: disposable deterministic checks, including fake OS composition and in-memory SDK transport.
- This document and `m00-ta02-approval.md`: additive scope and evidence records.

The scoped child has an explicit entry point and private exclusive bootstrap file. A narrow canonical endpoint shares the supervisor's single owned loopback listener with the scripted provider endpoint. The child uses supervisor-owned canonical persistence rather than receiving a database connection. Single-use durable reservations precede effects; Codex and related MCP starts are reserved together before spawn, with MCP acknowledgement requiring startup evidence. A supervisor can reconcile an exact lost submission against persisted acceptance without replaying the request or clearing the campaign fence. Owned-stop recovery records remain possible under UNKNOWN, without resuming dispatch.

Runtime ports are implemented but inert. Per-effect external authorization, exact pinned bytes and host tuple, case paths, owned non-symlink ancestors, deadlines and descriptor/route prerequisites are checked before future effects. Configuration and these checks do not prove operating-system containment. Under approved TA02 the native agent is trusted as the local user; the scoped MCP interface is an application boundary, and same-user native access can technically bypass it.

## Script and accounting

Policy `M02-TA-P1-T0-v3` fixes six role cases, sixteen fresh B07 selectors, T1 descriptor capture, P00 required-MCP failure, B14 denial and N01/N02 scratch actions. The entire future campaign permits at most 27 thread starts, 26 turns, 63 scripted provider requests, 34 scoped operations, 36 outer calls, two workspace actions and one empty permission denial; zero grants, inference or retries. One Codex child, one scoped MCP child and one listener are allowed per case, plus only the two explicitly allocated helpers. Private canonical IPC has a separate aggregate ceiling of 190 and control writes 108; these do not increase provider requests or process/listener counts.

The durable journal uses exclusive owned paths, bounded hash-linked fsynced records and per-case/global limits. Pending, corrupt, uncertain or unclean evidence fences dispatch. Reopen is inspection/recovery only; there is no resume, reset or ambiguous-start resend. Completion needs exact correlated evidence and, for submissions, canonical persisted acceptance. Parser rejection, native refusal and canonical owner rejection are distinct evidence layers.

## Verification and limits

The 52 focused root tests pass. They exercise all six role gateway submissions through an in-memory SDK/child bridge into independent fresh SQLite persistence, fixed negative selectors, revocation, foreign receipt ownership, dropped replies, exact reconciliation, budgets, path substitution, deadlines and pending intent fencing. The native-route suite contributes 25 of the 288 passing package tests across 28 files. The package offline suite excludes `mcp-transport-revocation.test.ts` deliberately because it opens sockets. Package TypeScript build, affected-file ESLint, Prettier and `git diff --check` passed. All 3,227 pre-existing file hashes and modes match the preservation baseline.

Root command: `node --import tsx --test scripts/tests/codex-app-server-m02-ta-*.test.mjs scripts/tests/codex-app-server-m02-ta-*.test.ts`. Package command (from `packages/appraisejs`): `node node_modules/vitest/vitest.mjs run` with the explicit sorted `src/**/*.test.ts` list excluding the socket file; build: `npm run build`. Plain Node strip-only execution is insufficient for the imported descriptor collector parameter properties; the root checks require `--import tsx`.

The canonical fixture applies current checked-in migrations to a fresh temporary database within the test process, using production shared authentication, acceptance transactions and outcome reads with synthetic artifact effects. It does **not** establish six specialized Journey business transitions, production work admission or real native behavior. Future runtime database paths must be newly created under the exact owned case supervisor directory; retained runtime evidence is never deleted by fixture cleanup.

The offline compiler produced `.appraisejs/m02-t0-build-r3/canonical-bridge.mjs`, SHA-256 `b98095b7da860b88928d1f2f16f4abebe2f2da01eff04b29a4b2aee7890e6809`. Syntax checking, ordinary offline module import and inert bridge construction passed; no transport or child was started. Earlier generated builds remain historical. The generated backend must be repinned if any source/dependency changes. The scoped child entry was not invoked as a process.

Root TypeScript retains the pre-existing `src/components/diagram/flow-diagram.test.tsx:352` Element/HTMLElement error. Graphify dry-run selects the changed script/package scopes; regeneration is deferred because it would overwrite accepted graph artifacts. No graph inference or graph output rewrite was performed.

## Next authorization boundary

T0 completion authorizes no runtime action. T1 needs separately reviewed exact executable/interpreter, schema, policy, compiled supervisor and child entry hashes; commands, environment, cleanup, capture handling and fresh disposable roots; verified macOS/architecture/build tuple; and explicit start/request/time limits. The planned roots remain absent:

- `/private/tmp/appraise-m02-ta-descriptors-p1`
- `/private/tmp/appraise-m02-ta-matrix-p1`
- `/private/tmp/appraise-m02-ta-workspace-p1`

T1 alone may later collect descriptors with no model or tool response under its explicit grant. T2 and T3 remain blocked until the actual captured descriptor containers, SDK profiles and reviewed native codecs are linked and pinned; caller flags or scalar review assertions cannot satisfy those gates. Actual native mapping, provider/auth behavior, role-model support, host cleanup and runtime outcomes remain unqualified. A native outer refusal is not a canonical owner rejection. Any changed pin/tuple/path, unexpected process/request/tool, credential exposure, ambiguous start, lost acknowledgement, deadline, budget overflow or unexpected effect stops dispatch and preserves UNKNOWN evidence. No launch, probe, authentication, inference, grant, commit, push or M02-C+ action is authorized here.
