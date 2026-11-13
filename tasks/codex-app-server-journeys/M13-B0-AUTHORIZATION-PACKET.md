# M13 B0-R1 — Exact offline implementation authorization packet

**REQUEST / NOT APPROVED / NOT EXECUTED.** Prepared 2026-11-13.
This is the first bounded B0 slice, not authorization for the full native product adapter.
[Lane A completion](M13-LANE-A-COMPLETION.md) and [composition decision](m13-lane-a/COMPOSITION-DESIGN.md)
supply the evidence. Approval must name this packet and its
[authorization manifest](m13-lane-a/b0-authorization-manifest.json) and
[content manifest](m13-lane-a/packet-content-manifest.json) at all three final SHA-256 values.
Preparing or independently reviewing these documents grants no implementation or runtime authority.

## Objective and deliberate boundary

Implement an independently testable, **offline-only readiness controller** through semantic fake ports.
Do not alter the turn supervisor or its startup sequence: it currently arms provider state and proceeds to
thread/turn work. The controller accepts an already-owned fake port, acquires no resource and holds no
Prisma client, credential, assignment secret, stream, PID, launcher or arbitrary RPC capability.

This slice supplies sequencing, refusal, cancellation and cleanup-contract behavior. It does not implement
native executable/configuration launch, native status decoding, provider login, recoverable assignment-secret
custody or six-role native transport. Those remain named blockers for the full B0 product adapter.
B1 cannot treat the result as actual native readiness or an executable native composition.

## Closed file scope and slices

| Slice | Canonical source / work                                                                                                                                                                                                         | Acceptance                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1    | New `src/lib/quality-journey/codex-app-server/readiness-contract.ts`; contract assertions in the new controller test                                                                                                            | Strict semantic shapes, immutable capture, bounded IDs/timeouts, fixed fake provenance.                                                          |
| S2    | New `src/lib/quality-journey/codex-app-server/readiness-controller.ts` and `readiness-controller.test.ts`                                                                                                                       | One-shot sequence, before-await cancellation custody, fence-before-stop, bounded outcomes and late-result exclusion.                             |
| S3    | New `src/services/coordinator/quality-journey-readiness.sqlite.integration.test.ts`; update `docs/quality-journey-process-supervision.md`, `M13-RUNTIME-QUALIFICATION-PLAN.md`, task link and a new `M13-B0-R1-VERIFICATION.md` | Fake-port invocation leaves canonical SQLite rows unchanged; production refusals and all limits unchanged; exact implementation/evidence review. |

Source paths are a closed set of four new files. Existing source, RPC allowlist, provider-run service, supervisor,
owned-child launcher, policy, schema/migrations, role registry, public API/CLI/MCP registration, scheduler,
authentication, generated automation and runtime/release flags are excluded from edits.
Generated scaffold copies and affected Graphify outputs may change **only through canonical generators**.
Do not hand-edit them. Documentation scope and input preimages are machine-listed in the manifest.

## Exact internal contract

These are semantic operations, not invented native JSON-RPC methods:

```ts
type ReadinessBinding = Readonly<{
  candidateTree: string // exact 40 lowercase hex Git tree
  executableSha256: string // exact 64 lowercase hex, descriptive only
  configurationDigest: string // sha256:<64 lowercase hex>
  readinessContractDigest: string // semantic contract, never native protocol proof
}>
type OfflineReadinessPort = Readonly<{
  provenance: 'OFFLINE_FAKE_PORT'
  initialize(signal: AbortSignal): Promise<unknown>
  inspectRequiredMcp(signal: AbortSignal): Promise<unknown>
  fence(): void
  stop(): Promise<OwnedChildCleanupReceipt>
}>
type ReadinessOptions = Readonly<{
  binding: ReadinessBinding
  requiredMcpIds: readonly string[]
  initializationTimeoutMs: number
  requiredMcpTimeoutMs: number
  cleanupTimeoutMs: number
}>
createOfflineReadinessController(options, port): Readonly<{
  run(): Promise<OfflineReadinessReceipt>
  cancel(): Promise<OfflineReadinessReceipt>
  snapshot(): OfflineReadinessSnapshot
}>
```

Import `OwnedChildCleanupReceipt` from `owned-child.ts` **as a type only**.
No production launcher or method is exported or enabled. Do not add this controller to a public barrel, route,
command, MCP tool, scheduler or the turn supervisor. Only its explicit tests consume it in B0-R1.

Initialize accepts only `{status:'INITIALIZED', binding:ReadinessBinding}`, with exact binding equality.
The required-MCP port accepts only `{status:'READY'|'UNAVAILABLE'|'UNSUPPORTED', servers:[{id,status:'READY'|'UNAVAILABLE'}]}`.
Reject unknown keys, malformed shapes/statuses, duplicates, extras, missing required servers and unavailable entries.
Required IDs: 1–16 distinct identifiers, each matching `[A-Za-z0-9._-]{1,80}`; use canonical sorted capture.
Reject an empty required set. These are **simulated semantic observations**, not live-connection/cached-catalog proof.
A future native decoder must separately qualify that distinction for its exact build.

All options and original port functions are validated, copied/captured before any await.
Each timeout is an integer 1–60,000 ms and their sum is at most 90,000 ms. They are local fake-controller limits;
do not change existing product/test/global defaults, provider leases or D05 bounds.
Use existing dependencies and language/standard-library APIs only; no new package or native addon.

## State and cleanup rules

1. Construction validates/captures only; it invokes no probe or resource operation.
2. `run()` memoizes its original Promise: initialize once, validate, inspect once, validate, fence, original stop once.
3. `cancel()` synchronously closes admission and aborts probes before awaiting cleanup. Cancellation before run
   invokes neither probe; the already-owned fake port is fenced/stopped once.
4. Repeat/reentrant run/cancel calls join finalization. A late/rejected probe cannot start another operation,
   reopen admission, publish a different receipt or use another resource owner's stop function.
5. Fence occurs before any stop await, including success. A throwing fence/probe/loss observer cannot skip the
   original stop attempt. No retry, executable/provider/model/host/transport fallback or thread/turn is possible.
6. Positive cleanup requires all four consistent facts: stopped, groupExitObserved true, privateRootRemoved true,
   privateRootRetained false. Rejection, timeout, uncertainty or contradiction yields UNKNOWN. Retain bounded
   cleanup facts; never raw thrown messages, stdout, configuration, paths, prompts or transcripts.

Immutable receipt fields: captured binding/required IDs, finite reason codes and phase-completion flags,
sanitized cleanup facts, `provenance:'OFFLINE_FAKE_PORT'`, `runtimeQualified:false`, `observedNativeTuple:null`,
and outcome `OFFLINE_CONTRACT_SATISFIED | REFUSED | UNKNOWN`.
The first outcome needs both valid probes plus positive cleanup. A failed/refused/cancelled probe with known
cleanup is REFUSED; unproved fencing/cleanup makes the synthetic outcome UNKNOWN.
No outcome grants provider NONSTART/termination, canonical slot release, host isolation, account or lifecycle authority.
A fake receipt can never be upgraded/relabelled as native evidence.

Snapshot states are IDLE, INITIALIZING, CHECKING_MCP, FENCING, STOPPING and FINALIZED; snapshots are immutable copies.
The receipt includes initialization/MCP completion flags, fence outcome (NOT_ATTEMPTED, SUCCEEDED or UNKNOWN),
and cleanup facts with null for unobserved values. Reason codes are a closed set: NONE, CANCELLED,
INITIALIZATION_REJECTED, INITIALIZATION_INVALID, BINDING_MISMATCH, INITIALIZATION_TIMEOUT, MCP_REJECTED,
MCP_INVALID, MCP_UNAVAILABLE, MCP_UNSUPPORTED, MCP_TIMEOUT, FENCE_FAILED, CLEANUP_REJECTED, CLEANUP_TIMEOUT,
CLEANUP_UNCERTAIN and CLEANUP_CONTRADICTORY. A synchronous thrown stop is CLEANUP_REJECTED.

Implementation starts from a clean isolated B0-R1 worktree at the final reviewed Lane A delivery commit,
a documentation-only successor of the input commit. Verify the protected preimages first; do not reuse the dirty
main checkout, reset historical worktrees or refresh hashes to conceal source drift.

## Finite acceptance matrix

Use fake ports/timers only; do not launch a child-under-study, socket, MCP server or native executable.
The new unit suite must cover these 18 named groups (parameterizations remain explicitly listed in its receipt):

1. Valid initialization/required set and positive cleanup.
2. Exact binding mismatch.
3. Malformed/extra-key initialization.
4. Missing required server.
5. Required server unavailable.
6. Unsupported required-MCP observation.
7. Duplicate/extra required server IDs.
8. Malformed/unknown required-MCP result.
9. Initialization rejection.
10. Required-MCP rejection.
11. Initialization timeout with late completion permanently fenced.
12. Required-MCP timeout with late completion permanently fenced.
13. Cancel before run: no probe, original stop once.
14. Cancel during either pending probe.
15. Repeated/reentrant run/cancel: admitted operations and stop at most once.
16. Cleanup rejection/timeout/uncertainty/contradiction and throwing fence: no false positive.
17. Caller mutation of options/port functions cannot change captured behavior.
18. Disposable migrated SQLite integration: successful and cancelled/uncertain fake readiness leaves the exact
    Journey, session/ownership, assignment, authorization/budget, provider-run/intent/observation and HUB rows unchanged.

The SQLite case may prepare fresh synthetic antecedents through existing fixture helpers; the controller gets no
database client. No real credential or historical database is read/reset. Prove no prepare/claim/arm/consume/
reconcile/release operation, thread/turn, gateway call or human transition is caused by the controller.

## Proposed implementation verification commands (only after exact B0-R1 approval)

Run affected ESLint/Prettier first, then one explicit focused batch:

```sh
npm run validate:unit -- src/lib/quality-journey/codex-app-server/readiness-controller.test.ts src/services/coordinator/quality-journey-readiness.sqlite.integration.test.ts src/lib/quality-journey/codex-app-server/rpc-transport.test.ts src/services/coordinator/quality-journey-process-supervisor.test.ts src/services/coordinator/quality-journey-provider-run-service.sqlite.integration.test.ts src/services/coordinator/quality-journey-wake-service.sqlite.integration.test.ts
npx tsc --noEmit
npm --prefix packages/create-appraisejs run prepare-template
npm run graphify:auto
npm run build
npm run check:harness
npm run docs:check-links
npm run release:check:artifacts
npm run release:check:packages
```

Compare the protected source preimages, assert both production refusal bodies and D05 policy remain byte-identical.
Run normal commit hooks; fix introduced findings without suppressions/baseline/timeout/skip/retry changes.
After canonical sync, verify root/scaffold parity for the four new files. Validate actual packed contents and run
the two new suites in a fresh generated app using its own dependencies/Prisma client. Before any installation recipe,
freeze its exact ordinary tooling commands; it may use public dependency/build-asset downloads only, no account or
native/provider endpoint. Do not invoke a legacy native qualification or credential-rotation script as a shortcut.
The listed checks are ordinary Node/Prisma/build tooling, not authority to launch native Codex/Code Mode or a
child-under-study. Missing prerequisites are infrastructure blocks, not permission to install globally or change accounts.

Freeze the final commit/tree, generated/packed hashes and test receipts, then obtain independent exact-artifact
review. A substantive repair renews affected checks/review. Do not claim B1/B2 qualification from this acceptance.

## Explicitly withheld effects

No native launches (including version/schema/account/status/model queries), credential/keychain/private-config
reads or writes, provider access, inference, sign-in/refresh, permission grants, historical campaign replay,
consumed-budget renewal, real protected access, production dispatch, public/default-mode changes, push, merge or
publication. No disk secret escrow, native wire mapping or role transport is included.
Uncertainty, original-owned cleanup, TA02/TA03 trusted-profile limits and immutable history remain unchanged.

## Copy-ready future decision

> Approve implementation of M13 B0-R1 at the packet, authorization-manifest and content-manifest SHA-256 values presented with the final Lane A
> evidence. Authorize only the four new offline source/test files, the listed documentation and canonical generated
> derivatives, with the stated fake-port/disposable-SQLite checks and independent final artifact review.
> Preserve both production refusals, runtimeQualified=false, all frozen contracts, UNKNOWNs and consumed budgets.
> This grants no native launch, credential access, real inference, sign-in, push, publication or B1+ execution.

This is wording for a later explicit decision, **not a decision recorded by this packet**.
There is no unresolved architecture choice inside B0-R1. Native binding/custody/role composition remain excluded
future work; broadening this slice requires another concrete scope decision.
