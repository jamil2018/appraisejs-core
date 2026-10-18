# M02 implementation checkpoint — 2026-10-15

**Source work implemented and verified; overall M02 qualification remains BLOCKED, not passed.**
User instruction: “complete m02 implementation. don't stop till all is done.” This authorizes the
source work below. It does not change frozen M00, provide a new native inference budget, waive
containment evidence or authorize M03+ product dispatch. Earlier byte-bound approvals, REVISE
outcomes and UNKNOWN records remain intact. This is the latest additive source checkpoint.

## Concrete implementation

- [External worker SDK server](../../packages/appraisejs/src/mcp/external-worker-server.ts): builds
  a real MCP SDK server through the unchanged external gateway, exposing only the bound external
  role profile. No public coordinator factory, managed/Factory profile, resources, human decisions,
  claim/admission tools or ambient registry is substituted. It opens no transport itself. Its
  immutable advertisedProfile binds the exact SDK input-schema conversion and gateway profile;
  accepted gateway schema bytes remain unchanged.
- [Trusted descriptor collector](../../packages/appraisejs/src/mcp/native-descriptor-capture.ts):
  one bounded already-received request; full standard and observed Lite descriptor containers,
  namespaces, function schemas/custom grammar, immutable projection and exact hashes. Invalid,
  incomplete, duplicate, oversized or second attempts fail closed. Provenance is supplied, not
  attested; request prompts and header values are not retained in descriptor evidence.
- [Exact native mapping preparation](../../packages/appraisejs/src/mcp/external-worker-native-mapping.ts):
  requires the complete role catalog, profile/worker-schema hashes, direct MCP names and exact
  descriptor/schema correspondence against the SDK-advertised profile. Rejects generic evaluator/collaboration aliases, extra tools,
  duplicate/missing/cross-role routes and drift. Every successful result is explicitly
  PREPARED_NOT_RUNTIME_QUALIFIED with dispatchAllowed=false. No actual native route is invented.

Tests use actual linked SDK in-memory transports and synthetic canonical adapters. The six roles
exercise frozen reads/specialized submissions, schema/authority-field denial, prohibited human and
broader/native operations, expiry/revocation, canonical acceptance identity and lost-reply no-retry.
Mapping tests compose with all six actual accepted gateway profiles; six end-to-end SDK listing →
collector → mapper cases also bind the SDK-advertised schemas. Collector tests cover both
standard and saved-M01 Lite representations, full metadata/schema/grammar drift, malformed and
ambiguous JSON, namespaces, bounded evidence and supplied provenance. None is an OS escape probe.

The [boundary comparison](m02-b-n2-boundary-options.md), [composition](m02-b-n2-composition.md)
and [E0 prerequisites](m02-b-e0-prerequisites.md) record remaining enforcement/runtime seams.
No existing source, policy, docs, graphs or tests were edited; all six package files and four task
records in this slice are additive. No CLI flag, native launcher, socket/provider server, schema,
UI, scaffold, M03 session or M05 production supervisor is introduced.

## Verification evidence

- Package suite excluding the known socket fixture: **263 tests passed in 27 files**. Includes
  51 new tests (31 SDK server, 8 collector, 12 mapping) and the unchanged 84 M02-A tests.
- Existing B0/B1/M01 synthetic and saved-evidence checks: **106 passed**; no new live observation.
- Package TypeScript build, focused ESLint and Prettier passed. Local document links, diff whitespace
  and full pre-existing hash/mode preservation are checked before exact-artifact review.
- Two earlier full-package attempts included the pre-existing transport-revocation fixture; each
  attempted a loopback bind and received sandbox `EPERM`. No listener was established. These are
  retained failed environment checks, not zero-attempt claims or successful live transport proof.
  Final offline coverage excludes that one file; no transport assertion was weakened.
- Graphify auto dry-run selected scripts/packages. Rebuilding would overwrite accepted graph bytes;
  the explicit preservation constraint takes precedence. Graphs are neither refreshed nor hand-edited.
  Package-only source changes require package compilation; no root app build or scaffold sync applies.

The first exact review found a schema mismatch: the gateway profile uses draft 2020-12 while the
SDK advertises its own input-schema conversion. The repair captures that exact conversion at tool
registration, binds its digest separately, and verifies all six SDK-to-mapper paths without stripping
dialect fields or changing frozen gateway bytes. The earlier REVISE remains review history.

Exact final snapshot and independent review outcome will be recorded after review under new ignored
`.appraisejs/m02-completion-review-*` records. No review acceptance is claimed by this pending record.
Prior full-root font/typecheck and transport restrictions remain historical, not silently repaired.

## Gate ledger: what source tests cannot establish

| Required M02 property                                                  | Present evidence                                                                             | Status                                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Six-role scoped MCP schemas/reads/submissions                          | Accepted gateway plus actual SDK in-memory conformance                                       | Deterministic evidence; provisional only                                  |
| Forged target/generation/secret and prohibited decisions/broader tools | Accepted gateway tests and SDK denial coverage                                               | Deterministic evidence; actual native path unverified                     |
| Complete actual native descriptors and supported MCP routing           | Name-only retained M01 records; source collector/mapping prepared                            | BLOCKED_MISSING_DESCRIPTORS / UNSUPPORTED_SCOPED_ROUTE for generic bridge |
| B07 Analyzer route to intended role/receipt validators                 | Designer/Triager offline complements; strict-schema/registry lanes distinguished             | BLOCKED_ROLE_ROUTE; not canonical receipt-owner or Analyzer-native proof  |
| Effective OS/process/filesystem/native-tool/network containment        | No independently qualified enforcer; observed broad native surface remains negative evidence | BLOCKED_FEASIBILITY                                                       |
| Provider credential isolation/revocation without ambient state         | No real host qualification; fake canaries cannot supply it                                   | UNQUALIFIED                                                               |
| M03 mandatory-session authority                                        | Not implemented in M02                                                                       | Deferred M03; no managed dispatch                                         |

Frozen M00 explicitly requires live effective-host escape evidence and says to stop if a boundary
cannot be established. Source tests cannot fulfill that requirement. No safe native execution bundle
exists to review or launch at this checkpoint; no speculative enforcer is selected to continue.
M02 is therefore **not complete** despite passing source checks. This is an evidence blocker, not
an optional test omitted for convenience. M02-C+/M03+ must not start or inherit a fabricated PASS.

## Preservation and exact next dependency

M00 hash stays `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
M02-A/B0/B1/N0 and prior review/history are unchanged; the pre-turn map covers 3187 file identities.
GC3 stays REVISE / not passed; native inference stays exhausted at 3/3; consumed/UNKNOWN starts are
never reset or resent. Branch remains codex/journey-app-server-migration at ac758cea; that commit's
prior push remains historical fact. No commits/push, auth, native/external inference or grants occur.
The P1 and E0 runtime roots remain absent; no Codex/app-server child or native capture ran.

The next external decision requires an exact supported build/enforcer composition that can satisfy
M00, with separately bounded implementation/enforcement qualification and fresh E0 process/listener/
thread/turn/request authority. The present evidence supports no concrete safe runtime permission
bundle. If the pinned CodeModeOnly build cannot supply the frozen boundary, return for a build/scope
decision; never weaken M00 or grant a generic executor in order to call M02 done.

Route receipt `2d3635c2-8c56-47a0-898e-4a548edb06ad`: solver, bounded source executors and independent
judge. Requested no-parent-transcript selectors do not attest effective host role/model/context/
sandbox. The denied loopback test attempts are a harness-routing lesson: offline suites need explicit
file selection. No automatic routing, permission or quality-gate change is made from that lesson.
