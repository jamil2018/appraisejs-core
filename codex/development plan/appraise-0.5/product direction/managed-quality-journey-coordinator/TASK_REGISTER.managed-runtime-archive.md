> Historical snapshot preserved on 2026-09-11. Superseded for active work by [PLAN.md](PLAN.md) and [TASK_REGISTER.md](TASK_REGISTER.md). Old gates, next actions and statuses below apply only to the deferred managed-runtime architecture. Evidence is retained, not newly qualified.

# Managed Quality Journey Coordinator — Task Register

Specification: [development plan](PLAN.managed-runtime-archive.md). Status baseline: 2026-09-09; Phase 0 remediation decision: 2026-09-10;
durable provider-boundary decision: 2026-09-11.

## Operating instructions

Read the progression rules in the plan before starting. Work in dependency order within the user's requested scope
and selected provider or deterministic-development track. Independent track eligibility never bypasses production admission.
Mark one bounded task `in_progress`, implement it, verify its acceptance, record evidence, then mark it `verified` and
check its box. A phase gate must pass before its dependent work begins; D15 permits Phase 1 development through G0D while G0 remains the production-provider admission gate. Do not infer implementation authorization from
a request to save these documents.

Allowed task statuses: `pending`, `in_progress`, `blocked`, `in_review`, `verified`. Only `verified` uses `[x]`.
Evidence references start as `—` because no implementation checks have run. Gate status starts as `not_evaluated`.

## Master task register

| Done | ID     | Task                                                        | Dependencies                                 | Status   | Evidence                                                                             |
| ---- | ------ | ----------------------------------------------------------- | -------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| [x]  | P0.1   | Establish protocol and source baseline                      | None                                         | verified | [evidence/P0.1.md](evidence/P0.1.md)                                                 |
| [x]  | P0.2   | Qualify effective worker boundaries                         | P0.1                                         | verified | [evidence/P0.2.md](evidence/P0.2.md)                                                 |
| [ ]  | P0.3   | Qualify process and session recovery                        | P0.1                                         | blocked  | [evidence/P0.3.md](evidence/P0.3.md)                                                 |
| [x]  | P0.4   | Review feasibility and browser enforcement                  | P0.2, P0.3                                   | verified | [evidence/P0.4.md](evidence/P0.4.md)                                                 |
| [x]  | P0.R0a | Harden qualification acceptance                             | P0.4                                         | verified | [evidence/P0.R0a.md](evidence/P0.R0a.md)                                             |
| [x]  | P0.R0b | Isolate no-model qualification launch                       | P0.R0a                                       | verified | [evidence/P0.R0b.md](evidence/P0.R0b.md)                                             |
| [x]  | P0.R1  | Prototype the full-MCP and worker-gateway split             | P0.R0b                                       | verified | [evidence/P0.R1.md](evidence/P0.R1.md)                                               |
| [x]  | P0.R2a | Stress-test mandatory wire-gateway feasibility              | P0.R1                                        | verified | [evidence/P0.R2a.md](evidence/P0.R2a.md)                                             |
| [x]  | P0.R2b | Stress-test role-local Codex configuration                  | P0.R2a                                       | verified | [evidence/P0.R2b.md](evidence/P0.R2b.md)                                             |
| [x]  | P0.R2c | Stress-test zero-MCP dynamic tools                          | P0.R2b                                       | verified | [evidence/P0.R2c.md](evidence/P0.R2c.md)                                             |
| [ ]  | P0.R2d | Test canonical dynamic tools through mandatory interlock    | P0.R2c, D14                                  | blocked  | [evidence/P0.R2d.md](evidence/P0.R2d.md)                                             |
| [ ]  | P0.R2e | Establish provider-native authentication compatibility      | P0.R2d                                       | pending  | —                                                                                    |
| [x]  | P0.R2f | Investigate lossless canonical schema transport             | P0.R2c, D14, B0-005 evidence                 | verified | [P0.R2f research-only completion](evidence/P0.R2f.md#independent-review)             |
| [ ]  | P0.R2g | Prove a bounded lossless provider canary and retry contract | P0.R2f                                       | pending  | —                                                                                    |
| [ ]  | P0.R2  | Qualify an exact-tool provider build                        | P0.R1                                        | blocked  | [evidence/P0.R2.md](evidence/P0.R2.md); [0.154.0 refresh](evidence/P0.R2-0.154.0.md) |
| [ ]  | P0.R3  | Re-run all role-boundary probes                             | P0.R2                                        | pending  | —                                                                                    |
| [ ]  | P0.R4  | Execute the real App Server recovery matrix                 | P0.R2                                        | pending  | —                                                                                    |
| [ ]  | P0.R3b | Close browser feasibility evidence                          | P0.R3                                        | pending  | —                                                                                    |
| [ ]  | P0.R5  | Review the combined remediation artifact                    | P0.R3, P0.R4, P0.R3b                         | pending  | —                                                                                    |
| [ ]  | P1.1   | Define runtime contracts and persistence                    | Gate G0D; user provider-path sequencing hold | blocked  | [Active handoff](#active-handoff)                                                    |
| [ ]  | P1.2   | Implement Start grant and singleton ownership               | P1.1                                         | pending  | —                                                                                    |
| [ ]  | P1.3   | Implement outbox/inbox and dispatch protocol                | P1.1, P1.2                                   | pending  | —                                                                                    |
| [ ]  | P1.4   | Implement renewal and fenced scheduling                     | P1.2, P1.3                                   | pending  | —                                                                                    |
| [ ]  | P1.5   | Add runtime API and CLI entrypoint                          | P1.3, P1.4                                   | pending  | —                                                                                    |
| [ ]  | P2.1   | Implement qualified Codex adapter and login                 | Gates G1 and G0                              | pending  | —                                                                                    |
| [ ]  | P2.2   | Implement scoped artifact/question gateway                  | P2.1                                         | pending  | —                                                                                    |
| [ ]  | P2.3   | Connect managed requirement analysis                        | P2.2                                         | pending  | —                                                                                    |
| [ ]  | P2.4   | Deliver Start and analysis status UI                        | P2.3                                         | pending  | —                                                                                    |
| [ ]  | P3.1   | Version Scout authority and session grants                  | Gate G2                                      | pending  | —                                                                                    |
| [ ]  | P3.2   | Implement isolated browser observation                      | P3.1                                         | pending  | —                                                                                    |
| [ ]  | P3.3   | Implement human target login and expiry                     | P3.2                                         | pending  | —                                                                                    |
| [ ]  | P3.4   | Connect Scout and resource discovery                        | P3.2, P3.3                                   | pending  | —                                                                                    |
| [ ]  | P3.5   | Verify authenticated discovery containment                  | P3.4                                         | pending  | —                                                                                    |
| [ ]  | P4.1   | Connect scenario design and revision gates                  | Gate G3                                      | pending  | —                                                                                    |
| [ ]  | P4.2   | Connect scoped automation preparation                       | P4.1                                         | pending  | —                                                                                    |
| [ ]  | P4.3   | Connect consent-bound managed execution                     | P4.2                                         | pending  | —                                                                                    |
| [ ]  | P4.4   | Connect triage, remediation and closure                     | P4.3                                         | pending  | —                                                                                    |
| [ ]  | P5.1   | Complete restart and uncertain-effect recovery              | Gate G4                                      | pending  | —                                                                                    |
| [ ]  | P5.2   | Complete cancellation and orphan handling                   | P5.1                                         | pending  | —                                                                                    |
| [ ]  | P5.3   | Persist provider waits and event recovery                   | P5.1                                         | pending  | —                                                                                    |
| [ ]  | P5.4   | Add limits, pause controls and diagnostics                  | P5.2, P5.3                                   | pending  | —                                                                                    |
| [ ]  | P5.5   | Run adversarial and full lifecycle qualification            | P5.4                                         | pending  | —                                                                                    |
| [ ]  | P6.1   | Retire external coordination and legacy adoption            | Gate G5                                      | pending  | —                                                                                    |
| [ ]  | P6.2   | Package the macOS user service                              | P6.1                                         | pending  | —                                                                                    |
| [ ]  | P6.3   | Define update/downgrade and data preservation               | P6.2                                         | pending  | —                                                                                    |
| [ ]  | P6.4   | Synchronize docs, contracts and scaffolds                   | P6.1, P6.2, P6.3                             | pending  | —                                                                                    |
| [ ]  | P6.5   | Verify clean installation and release readiness             | P6.4                                         | pending  | —                                                                                    |

## Task specifications

Each task below supplies its scope, acceptance and verification. Dependencies and status live only in the master
register. Split oversized tasks into stable suffix IDs before implementation rather than accumulating broad edits.
All tasks also require the applicable lint, formatting and review checks from the plan.

### Phase 0 — Feasibility proof

#### P0.1 — Establish protocol and source baseline

Scope: inspect current Journey contracts, package/runtime entrypoints and the selected installed Codex build.

Acceptance:

- Record exact repository revision, relevant dirty files, Codex executable/version, protocol schema and documentation
  provenance; distinguish observed settings from host-enforced behavior.
- Map each role's abstract tools and required boundaries to candidate provider/broker mechanisms.
- Define controlled qualification fixtures and the expected outcome of each probe before running live workers.

Verification: source/contract comparison and schema compatibility checks. No provider capability is marked supported
merely because a config field exists. Store the sanitized baseline and capability matrix.

#### P0.2 — Qualify effective worker boundaries

Scope: a disposable bounded provider harness; no product cutover.

Acceptance:

- Fresh thread/process exposes exactly the approved concrete tool mapping and required MCP; missing MCP refuses start.
- Effective context/filesystem/network/credential/lifecycle evidence is bound to executable and launch configuration.
- Forbidden tool calls, ambient memory/instructions, file access, process escape and cross-attempt sentinels are
  rejected or documented as unsupported before claiming `STARTED`.

Verification: effective host inventory/config receipts plus negative probes. A model's refusal or a passing sentinel
test alone cannot prove confinement. Record full failure conditions and the trusted computing base.

#### P0.3 — Qualify process and session recovery

Scope: disposable process-supervision and protocol faults.

Acceptance:

- Determine behavior when supervisor/stdin transport dies and how surviving processes are identified safely.
- Establish which thread/turn creation operations can be reconciled after lost acknowledgements; identify any
  unresolvable states and forbid automatic duplicate dispatch there.
- Prove whether exact same-attempt resume preserves qualified configuration/context boundaries.

Verification: terminate each component around spawn, handshake, thread/turn creation and acknowledgement; test PID
reuse and late events. Document supported outcomes without claiming external exactly-once execution.

#### P0.4 — Review feasibility and browser enforcement

Scope: integrate proof results and establish the first-release enforcement design.

Acceptance:

- Review every role, including Scout/browser and Automator filesystem requirements, against the qualification matrix.
- Demonstrate a browser enforcement prototype can contain controlled redirects/background traffic and isolate a
  human-authenticated session; do not represent a design document alone as runtime proof.
- Obtain independent boundary/recovery review; issue a conditional pass with exact supported build or a no-go record.

Verification: independent review bound to proof artifacts and executable/config identities. Any unsupported required
boundary blocks G0 and downstream implementation; a different confinement architecture requires an updated plan.

### Phase 0 remediation — Resolve the no-go without weakening the role contract

#### P0.R0a — Harden qualification acceptance

Scope: `scripts/lib/managed-journey-provider-qualification.mjs` and its focused test file; no provider launch.

Acceptance:

- Add a regression for the reproduced empty-tool/null-receipt success in the investigation record. Reject absent,
  null or semantically invalid boundary evidence, empty/missing/extra/duplicate tools, schema/origin mismatches and
  unhealthy or incomplete MCP readiness.
- Replace caller-supplied native-inventory Boolean acceptance with validated effective-manifest evidence and a
  trusted provenance-verification boundary. Bind exact ordered tool names, origins, canonical schema hashes and
  launch identity; a schema-valid object or adapter-authored digest alone is insufficient proof.
- Preserve missing/ambient/native-inventory rejection. Include a complete synthetic success fixture and tampering
  cases, explicitly labeled checker tests; no synthetic fixture can qualify a real provider.

Verification: focused Node tests, ESLint and Prettier; independent evidence-integrity review of the exact checker
artifact. Close B0-003 only with the regression rejecting and provenance/semantic validation covered.

#### P0.R0b — Isolate no-model qualification launch

Scope: disposable launch harness and synthetic MCP fixture; split into suffix tasks if implementation exceeds a
focused change. No real credentials or model turns.

Acceptance:

- Launch with dedicated Codex state, controlled working directory/configuration and an allowlisted child environment;
  never inherit all of `process.env` or copy normal account state. Bind security-relevant resolved config sources,
  environment, executable/protocol identities and launch nonce without recording raw secrets.
- Register a synthetic required MCP explicitly. Inspect resolved configuration and actual inventory; exercise healthy,
  absent, unhealthy and ambient-server cases. Empty-map configuration is not accepted as proof of removing inherited
  entries. Native manifest remains unsupported unless the provider supplies verifiable evidence.
- Use only owned processes, capture process identity and confirm cleanup. No-model success validates launch isolation
  only; it cannot close B0-001 or authorize `turn/start`.

Verification: deterministic launch fixtures and a bounded account-free App Server run where permitted; sanitized
receipts and confirmed cleanup. Do not repeat the earlier normal-account probe or bypass an approval rejection.

#### P0.R1 — Prototype the full-MCP and worker-gateway split

Scope: implement a disposable, test-only attempt-scoped MCP registration profile by reusing the existing package
schemas, coordinator client and Journey domain services. This qualifies the boundary without durable runtime cutover
and does not create a parallel business API.

Acceptance:

- Preserve the existing full `appraisejs` MCP for trusted coordinator clients and prohibit attaching it to a managed
  worker.
- Define an exact tool subset for each of the six roles, derived from canonical MCP definitions and mapped to the
  existing abstract Factory capabilities.
- Define a sealed runtime grant whose trusted principal supplies target, Journey, role, attempt, generation, lease and
  authorization. Workers receive neither the broad project bearer nor owner tokens and cannot select an actor.
- Require pre-I/O and post-I/O grant validation, canonical argument/result hashes and broker receipts while retaining
  the existing specialized Journey ingress as the sole state-transition authority.

Verification: contract tests prove exact per-role registration, full-MCP separation, principal-derived scope,
forbidden lifecycle tools and schema parity with canonical source. Obtain independent security/authority review.

#### P0.R2a — Stress-test mandatory wire-gateway feasibility

Scope: account-free experiment against the exact stock Codex build using a non-forwarding local Responses listener,
synthetic credential, synthetic MCP and process-scoped OS confinement. This task tests a compatibility architecture;
it does not qualify a provider or authorize production implementation.

Acceptance:

- Prove resolved custom-provider routing, one exact loopback egress and denial of an alternate live loopback port,
  external DNS and external network access for the owned App Server process tree.
- Capture and hash the exact raw request before parsing; retain only authorization presence/scheme and compare the
  complete ordered tool objects rather than configured names.
- Exercise deterministic HTTP failures, connection interruption and an interrupted stream with zero observed replay;
  use a synthetic Responses stream to prove an allowed MCP call can traverse the stock parser.
- Falsify or retain the candidate explicitly. A passive proxy fails if the captured stock request contains any tool
  outside the exact role profile.

Verification: sanitized live receipts, focused negative tests and exact-artifact review. A pass establishes only a
compatibility candidate. It does not change P0.R2, B0-001, Gate G0 or provider/model authorization.

#### P0.R2b — Stress-test role-local Codex configuration

Scope: account-free A/B experiment against the exact P0.R2a Codex build. Compare an isolated control with a complete
role-local configuration, then inject calls to every unavoidable residual helper. This tests a configuration-based
architectural route; it does not qualify a provider or relax the exact-tool contract.

Acceptance:

- Capture and compare exact final wire manifests for control, explicit capability disables, and the strongest
  accepted direct-user-input disable; bind results to executable and configuration hashes.
- Determine from current stock source and strict-config probes whether every residual tool has a supported disable.
- Inject each residual non-role helper against a tool-only worker MCP and record whether its handler executes, what
  server it can reach, whether it returns data or causes an external effect, and whether cleanup leaves a survivor.
- Distinguish custom-agent configuration-layer behavior from the security boundary. Prefer a fresh root process with
  a complete non-inheriting role config if native role selection or parent inheritance is not independently bound.

Verification: sanitized account-free receipts, exact request hashes, all residual helper dispatch probes, current
Codex source comparison and independent architecture review. Verification records the experimental conclusion; only
P0.R2 can qualify the provider and close B0-001.

#### P0.R2c — Stress-test zero-MCP dynamic tools

Scope: run stock Codex in a fresh root App Server process with no MCP servers, a complete non-inheriting role config
and experimental client-owned dynamic tools. Compare empty and one-strict-tool arms through a non-forwarding local
Responses fixture. This tests exact model-surface feasibility and client dispatch; it does not implement D10 or
qualify production provider/authentication/recovery behavior.

Acceptance:

- Capture the complete serialized request for `dynamicTools: []` and require an empty tool array.
- Supply one strict dynamic function and require every request in its allowed round trip to contain exactly that
  function with stable definition and schema hashes.
- Configure no MCP server and prove the MCP resource helpers and all disabled native tools are absent from the wire.
- Exercise one allowed `item/tool/call` through the Appraise-owned client handler.
- Deterministically reject missing/empty call identity, unknown tool, malformed arguments, replay, cross-thread and
  stale-turn calls before effects; disclose which negative cases lack live App Server coverage.
- Use only fake authentication and a non-forwarding exact-loopback provider fixture; retain no secret or raw thread
  identity and terminate the owned process group with zero survivors.

Verification: [sanitized receipts](evidence/P0.R2c.receipts.json), focused Node tests, ESLint, Prettier, independent
architecture review and final exact-artifact review. Verification closes only the dynamic exact-surface feasibility
question; P0.R2, B0-001 and G0 remain blocked pending trusted pre-turn preparation/bound dispatch and the downstream
role/recovery/browser matrices.

#### P0.R2d — Test canonical dynamic tools through mandatory interlock

Scope: an account-free, local-only experiment combining the canonical Requirement Analyzer profile with zero-MCP
Codex dynamic tools, an unchanged-byte request release gate and bounded complete-response validation. No production
adapter registration, real account credential, external provider connection or Journey lifecycle mutation.

Acceptance:

- Derive the role functions from the canonical registry and P0.R1 worker profile; do not copy schemas by hand.
- Confine Codex network access to the gate. Only the gate can reach the second local synthetic upstream.
- Capture raw ingress bytes before parsing. Check the ordered complete tool definitions and request policy, then
  release those exact bytes without mutation or parse/re-serialization. For every accepted request, including
  follow-ups, retain ingress and upstream-received byte lengths and SHA-256 hashes and require equality. Test buffer
  mutation/re-encoding rejection. Bind release to the trusted attempt/profile/runtime identity; reject stale
  identity, drift and replay. Bind the digest to executable/configuration identities, process birth/group, attempt,
  profile, thread, turn and a single-use release ID.
- Buffer a bounded synthetic response until complete; deny forbidden/malformed calls before Codex dispatch and
  route accepted calls through the sealed-grant gateway with a synthetic effect handler.
- Demonstrate an allowed canonical call, a denied request with zero upstream requests, and a denied response with
  zero worker effect dispatches. Distinguish direct negative tests from live App Server paths.
- Retain recomputable sanitized receipts, exact executable and source identities, and zero-survivor cleanup.

Verification: direct fault tests cover extra/missing/reordered/duplicate tools, changed schemas and headers,
expired or mismatched attempt/thread/turn identity, repeated release/retries, buffer mutation, incomplete/fragmented
SSE, unknown event/item variants and forbidden/malformed tool calls. Invalid requests must fail before upstream
egress; invalid responses/callbacks must fail before effect invocation. Record which cases traversed the live Codex
path and which exercised the interlock directly. Include exact-build local fixtures, formatting/lint and independent
review. Passing resolves this composition experiment only; it cannot close all of B0-001, P0.R2 or G0.

#### P0.R2e — Establish provider-native authentication compatibility

Scope: determine how provider-managed login, refresh and the fixed upstream work through the adopted interlock.
Begin with exact-build source/configuration inspection and account-free auth/transport fixtures. Record any need for
an interactive test account before account-dependent work; do not read ambient account secrets or silently use API keys.

Acceptance:

- Identify the supported login/token-refresh path, credential owner, fixed provider endpoint and required headers.
- Prove workers cannot receive credentials or bypass the gate; reject redirect/upstream substitution and leaks.
- Exercise refresh, expiry, revocation and reconnect semantics with fixtures; distinguish fixture proof from native
  authenticated end-to-end evidence and explicitly retain any remaining account-dependent check.
- Decide whether unchanged body forwarding works or a separately reviewed transformation is required. Do not
  infer production compatibility from synthetic success.

Verification: exact-artifact review and bounded authentication/transport evidence. Required real-account checks
remain explicit prerequisites to P0.R2 production qualification; no automatic billing fallback.

#### P0.R2f — Investigate lossless canonical schema transport

Scope: exact-provider source/protocol inspection and account-free encoding fixtures for B0-005. Determine whether
all canonical schema constraints can reach the final request unchanged in meaning. This research task is eligible
from the retained P0.R2d no-go; it does not depend on falsely marking that experiment verified.

Acceptance:

- Reproduce the 79 missing constraint occurrences from the P0.R2d receipt and identify the exact serialization path.
- Test a supported lossless encoding if one exists; preserve canonical names, types, required fields, string and
  array constraints, role/handler provenance and unchanged request-body forwarding.
- If the candidate cannot support it, retain the no-go and compare an upstream lossless-schema change with a
  separately adopted transforming interlock. Do not remove constraints or substitute prose for validation rules.
- Return exact evidence and an eligible next task. A lossy projection or request transformation requires a new
  explicit decision and replacement evidence contract before implementation.

Verification: source-bound reasoning, canonical-equivalence tests and independent review. A successful supported
encoding permits rerunning P0.R2d; it does not itself pass P0.R2 or G0.

#### P0.R2g — Prove a bounded lossless provider canary and retry contract

Scope: follow the compiled schema-only repair target from P0.R2f into a disposable exact-source App Server build,
and define the authentication-retry state contract before modifying the interlock. This is a provider feasibility
experiment, not Phase 1, maintained-fork adoption, distribution, installation over the user's Codex, or permission
for real-account traffic. A transforming gateway remains a separate decision changing D14.

Acceptance:

- Review the dynamic-tool-only lossless schema path and explicit size refusal; preserve all six canonical role
  schemas and descriptions. Do not adopt the demonstrator's arbitrary keyword map/64 KiB limit without review.
- Build and identify the disposable executable; run all-role exact wire comparisons with zero unapproved egress.
- Define logical request identity and a bounded authenticated retry transition, distinguishing a definite 401
  rejection from ambiguous delivery. Cover identical and reserialized requests, stale/failed refresh, duplicates,
  and replay; retain hashes of each actual released body. Do not remove replay checks.
- Rerun P0.R2d's complete allowed and denied composition on the exact candidate. Keep its status blocked until its
  original acceptance passes; P0.R2g does not replace or lower that acceptance.
- Stop if the repair needs unrelated runtime changes, loses canonical meaning, or changes the adopted egress
  boundary. Return that concrete decision before product work. Native managed login and endpoint schema acceptance
  remain P0.R2e, followed by full boundary/recovery/browser qualification.

Verification: exact-build source/receipt identities, focused regressions and independent review of the candidate
and retry contract. A source-only serializer pass is insufficient. No production provider qualifies from this task.

#### P0.R2 — Qualify an exact-tool provider build

Scope: qualify the exact Codex-plus-boundary artifact through either upstream D10 or the adopted D14 interlock,
using the canonical P0.R1 role profile. D14 permits confined request construction after `turn/start`, but requires
validation and binding before any external provider/model I/O. The original upstream no-model checker remains
fail-closed; it must not be relabeled as an interlock qualifier.

Acceptance:

- Disable native, ambient MCP, app, skill, memory and inherited instruction tools; project canonical role functions
  as dynamic tools with no MCP for the D14 route.
- Verify ordered complete function definitions and schema hashes at the final request boundary. D10 records
  provider-internal contributor origins; D14 instead records canonical registry-to-function-to-handler provenance
  and actual outbound bytes. These are distinct evidence contracts, not interchangeable attestations.
- Bind executable, protocol, code signature, sealed configuration/environment, process birth/group, sandbox,
  filesystem/network boundaries, attempt/grant/profile, thread/turn and unique request release identity.
- For D10 refuse before `turn/start`; for D14 deny egress before releasing any invalid request and enforce every
  follow-up request and tool-bearing response. Independently verify sole egress and handler authorization.
- Complete P0.R2e native authentication evidence, production transport/streaming limits and cancellation/retry
  behavior. A local fixture does not establish provider compatibility or complete recovery qualification.

Verification: independent inspection of the exact request construction/release and dispatch paths, trusted receipts,
canonical role proof and the applicable authentication evidence. Configuration alone is not proof. P0.R3/P0.R4 must
use the same qualified artifact; all-role and recovery completion remain required for G0.

#### P0.R3 — Re-run all role-boundary probes

Scope: execute `QB-01` through `QB-11` for Requirement Analyzer, Scout, Resource Explorer, Scenario Designer,
Automator and Triager using the P0.R2 artifact.

Acceptance:

- Every role exposes only its approved worker-gateway subset; the existing full coordinator MCP and all native or
  ambient tools are absent.
- Context, instruction, memory, credential, filesystem, network, process, cross-attempt, approval and lifecycle
  canaries fail closed without leaking their values.
- Actual effective evidence and all negative-probe results bind to the same executable/configuration/attestation
  artifact. Negative probes supplement rather than replace the effective manifest.

Verification: complete boundary matrix, exact receipts and independent review. Close `B0-001` only when every role
passes against one exact artifact.

#### P0.R4 — Execute the real App Server recovery matrix

Scope: run `QR-01` through `QR-10` through the exact P0.R2 App Server/build using a recording fault proxy and owned
process group.

Acceptance:

- Exercise spawn, handshake, lost thread/turn acknowledgements, exact-thread resume, transport death during active
  work, revocation during I/O, PID reuse, descendant survival and duplicate/out-of-order/conflicting events.
- Persist request hashes, proxy sequence, executable/configuration digest, PID plus OS birth marker, process group,
  thread/turn IDs, gateway generation and fault point.
- Resolve each ambiguity only by inspecting the exact persisted identity, retrying after positive proof of non-start
  or predecessor absence, or retaining a fenced `UNKNOWN`. Never start a replacement while a predecessor may run.
- Turn-dependent evidence must traverse the exact production App Server/build using an account-safe real turn or a
  demonstrably equivalent deterministic backend. Simulated policy decisions alone do not qualify recovery.

Verification: real-protocol fault receipts for every applicable matrix row and process-survivor inspection. Close
`B0-002` only when all outcomes satisfy the conservative recovery contract. Update P0.3's evidence and status after
its original acceptance is verified by these receipts. Define deterministic-backend equivalence before executing
turn-dependent fixtures; simulated policy checks remain insufficient.

#### P0.R3b — Close browser feasibility evidence

Scope: disposable browser/Scout gateway proof completing QBR-03 and QBR-04; preserve the existing QBR-01, QBR-02 and
QBR-05 containment fixtures. This does not implement the Phase 3 product browser or production session persistence.

Acceptance:

- Demonstrate controlled human login and synthetic MFA through the trusted browser surface. A qualified Scout gets
  only an opaque grant and authorized observations; secrets and login-page captures never enter worker payloads.
- Restart the owning service/browser process and prove the session/grant is unusable and login is visibly required
  again. Context replacement alone is insufficient. Bind sanitized receipts to canonical full-URL hashes.
- Exercise hostile observation text with the qualified Scout, real gateway capability checks and cross-Journey secret
  canaries. Assert forbidden effects and scope crossings are rejected by the gateway regardless of model behavior.
  Use a controlled target and an authorized bounded provider turn; no general prompt-injection immunity claim.

Verification: complete QBR matrix with effect-side assertions, secret-canary checks, process/restart receipts and
independent boundary review bound to the same provider/gateway artifact. Close B0-004 only when omitted feasibility
checks pass; retain broader product acceptance in P3.5.

#### P0.R5 — Review the combined remediation artifact

Scope: independent review of the complete gateway, provider, boundary and recovery evidence before reevaluating G0.

Acceptance:

- Review binds the exact source, provider executable/protocol/configuration, worker-gateway contract hashes,
  attestation provenance and complete QB/QR/QBR evidence, including P0.R3b.
- Confirm the existing full MCP remains trusted-client-only and the worker gateway introduces no parallel lifecycle
  authority.
- Issue a pass or no-go without waiving unsupported boundaries or untested recovery paths.

Verification: independent exact-artifact security/recovery review. G0 passes only on an accepted artifact with all
four blockers closed.

### Phase 1 — Durable runtime foundation

#### P1.1 — Define runtime contracts and persistence

Scope: additive Prisma migrations, typed command/event/effect schemas and runtime adapter contract.

Acceptance:

- Persist Start grants, runtime fencing, provider dispatch identity, outbox/inbox state and attestation provenance
  while reusing existing immutable work/authorization lineage.
- Define unique effect/delivery identities and payload-conflict behavior; identical retries return the same result,
  while reusing an identity for different content is rejected.
- Separate dispatch state, logical work state, physical stop state and operational pause state.

Verification: migration tests on representative existing data, uniqueness/CAS fixtures, schema rejection tests and
protocol compatibility checks. No database reset and no fabricated migration-time worker receipts.

#### P1.2 — Implement Start grant and singleton ownership

Scope: domain Start operation, revocation, runtime owner lease and deterministic admission.

Acceptance:

- Explicit Start is durable and retry-safe; confirmation alone creates no AI activity.
- One global AI slot is owned through database fencing; stale runtime generations cannot claim or dispatch.
- Start cannot satisfy any human review/consent; revocation closes new-work admission immediately.

Verification: duplicate Start, two competing supervisors, owner expiry, stale generation, revoked grant and invalid
requirement identity. Include server-action parsing/authentication coverage when adding UI ingress.

#### P1.3 — Implement outbox/inbox and dispatch protocol

Scope: durable effect reservation, provider identity binding and normalized event ingestion using a fake adapter.

Acceptance:

- Persist intent before spawn and verified session/receipt before model turn; external I/O stays outside database
  transactions.
- Lost acknowledgement becomes explicit uncertainty with no blind retry; durable delivery deduplication protects
  specialized domain mutations.
- Process birth identity and thread/turn IDs are linked to the correct attempt/configuration and runtime generation.

Verification: inject failure at each commit and external-effect boundary; replay duplicate/out-of-order deliveries
and conflicting effect payloads. Confirm transaction rollback never leaves a falsely acknowledged effect.

#### P1.4 — Implement renewal and fenced scheduling

Scope: existing role eligibility plus renewal and the plan's state/action table.

Acceptance:

- Default 120-second leases renew every 40 seconds only under current authorization/ownership; immutable assignment
  hashes remain unchanged and renewal evidence is separately durable.
- Unknown launches/stops reconcile only; user waits do not trigger repeated claims or spend attempts.
- Revocation/expiry rejects stale calls, and safe replacement waits for predecessor stop/absence proof.

Verification: fake-clock renewal/expiry tests, renewal-versus-revocation races and a table-driven test for every
persisted condition. Include revision and consent states, not just the happy path.

#### P1.5 — Add runtime API and CLI entrypoint

Scope: runtime principal, narrow service endpoints, CLI bootstrap/shutdown and adapter registration.

Acceptance:

- The CLI can claim, observe and reconcile through authenticated APIs without owning a second domain database.
- Server authentication establishes actor authority; caller-selected role/actor strings cannot escalate privileges.
- Runtime restarts reconstruct work; health checks do not silently create paid model sessions or initiate login.

Verification: API authentication/scope tests, CLI lifecycle tests with fake provider and restart integration. Build
root and package surfaces; retain loopback/Host/Origin protections.

### Phase 2 — Managed analysis vertical slice

#### P2.1 — Implement qualified Codex adapter and login

Scope: production adapter using the Phase 0 qualified stdio protocol and process policy.

Acceptance:

- Create a fresh process/config/thread per attempt; register the adapter in the operational bootstrap.
- Use provider-owned account login in a managed profile without copying tokens into AppraiseJS records or prompts.
- Reject incompatible builds, missing required tools and unexpected privilege requests; no automatic billing fallback.

Verification: adapter conformance against fake transports and bounded real Codex runs; login cancellation/expiry,
missing executable/MCP, protocol mismatch and configuration drift. Store startup attestation provenance.

#### P2.2 — Implement scoped artifact/question gateway

Scope: role-permitted artifact read/propose and typed question operations with broker receipts.

Acceptance:

- Workers never receive broad coordinator/owner credentials; the gateway resolves their sealed attempt capability.
- Validate scope before/after I/O, cap payloads, and bind broker receipts to canonical arguments/results and input.
- Only allowlisted resources and artifact kinds are accessible; forged references and actor escalation are rejected.

Verification: cross-Journey/role replay, stale input, revoked/expired lease, oversized output, receipt forgery and
revocation during I/O. Inspect prompt/log/projection canaries for secret exposure.

#### P2.3 — Connect managed requirement analysis

Scope: Analyzer scheduling, specialized analysis ingress and persisted questions/revision feedback.

Acceptance:

- Start produces a validated analysis charter or typed unresolved questions using existing immutable requirement lineage.
- Answers and review feedback issue only authorized follow-up work; review remains a user decision.
- Turn completion without a valid artifact leaves a visible failure/incomplete state, never a successful analysis.

Verification: analysis happy path, unresolved questions, rejected/revised charter, stale publication and duplicate
submission. Demonstrate the path with the real qualified adapter after fake-provider tests pass.

#### P2.4 — Deliver Start and analysis status UI

Scope: existing Journey UI, status projection and actionable failure/wait states.

Acceptance:

- Display confirmation and Start as distinct actions; show selected provider, active-work limit and account state.
- Status distinguishes queued/starting/running/waiting/reconciling/failure from artifact review status.
- Reopening the UI reconstructs state without initiating work; browser closure does not stop the running service.

Verification: browser interaction, console/failed requests, keyboard navigation, duplicate clicks and refresh during
every analysis state. Record evidence only as required by the UI verification workflow.

### Phase 3 — Authenticated discovery

#### P3.1 — Version Scout authority and session grants

Scope: new immutable role/profile registry version, credential boundary and scoped grant persistence.

Acceptance:

- Preserve historical role registries and issue new Scout assignments with required verified credential boundaries.
- Grants bind Journey/target/environment and authorized login/observation scope; raw session secrets are not persisted.
- Execution credentials, provider account login and Scout session authorization remain separate.

Verification: registry compatibility, forbidden grant/profile combinations, wrong target/environment, revoked grants
and old-registry handling. Obtain independent contract/security review before integration.

#### P3.2 — Implement isolated browser observation

Scope: Playwright broker implementing target observations and evidence capture.

Acceptance:

- Each session is isolated and scoped; concrete browser operations map to role permissions and produce receipts.
- Enforce page/resource origins, redirects, frames, service workers, WebSockets and downloads or explicitly refuse
  unsupported traffic. No unrestricted evaluation API is exposed to workers.
- Capture sanitized observations/evidence; allowed navigation never implies blanket permission to mutate the target.

Verification: controlled local/remote fixtures exercising background traffic, route escape, mutating actions and
cross-session access. Include malicious page content attempting to issue instructions or steal gateway capabilities.

#### P3.3 — Implement human target login and expiry

Scope: AppraiseJS-owned interactive sign-in, opaque session attachment and reauthentication UI.

Acceptance:

- Human can complete login/SSO/MFA in an isolated browser after explicit authorization of its origins/effects.
- Scout receives no passwords/cookies/headers/login captures; session storage remains in memory.
- Expiry, browser loss or service restart requests sign-in again without pretending the prior session is usable.

Verification: controlled login and MFA fixtures, allowed IdP redirect, rejected unapproved redirect, timeout,
cancellation/revocation during login and secret canary checks. No MFA bypass or automated password login.

#### P3.4 — Connect Scout and resource discovery

Scope: canonical discovery authorization, browser observations, resource lookup and specialized output ingress.

Acceptance:

- Anonymous and authenticated targets produce scope-bound observations using broker receipts.
- Resource Explorer cannot acquire Scout target/browser access; both roles preserve exact input lineage.
- Valid discovery outputs make scenario design eligible; invalid/expired observations require existing retry policy.

Verification: mode-aware local and remote fixtures, missing resources, partial observations, out-of-scope receipt,
expired target snapshot and duplicate publication. Run a bounded live-provider discovery demonstration.

#### P3.5 — Verify authenticated discovery containment

Scope: adversarial integration and independent review of the exact discovery artifact.

Acceptance:

- Revoked session grants stop new actions immediately; delayed observations cannot become accepted fresh evidence.
- Cross-role/cross-Journey session replay and secret extraction attempts are rejected.
- All browser/credential boundaries have actual supporting evidence, not only adapter-reported strings.

Verification: replay/revocation/secret-leak matrix plus independent security review tied to source and runtime hashes.
Any containment failure blocks G3.

### Phase 4 — Complete Journey behavior

#### P4.1 — Connect scenario design and revision gates

Scope: Designer assignment, approved discovery/analysis inputs and existing scenario review flow.

Acceptance:

- Designer consumes only permitted immutable inputs and publishes through specialized scenario validation.
- Rejection/revision preserves lineage and stops preparation until the exact scenario revision is approved.
- No provider completion event or Start grant substitutes for scenario approval.

Verification: design/review/revision/stale-input loops and forbidden target access. Compare semantic artifact quality
against deterministic fixtures separately from transport success.

#### P4.2 — Connect scoped automation preparation

Scope: Automator gateway tools, catalog resolution, authorized artifact writes and capsule publication.

Acceptance:

- Writes stay inside the approved artifact scope; root/canonical generators remain authoritative.
- Automation cannot change scenario intent, product source or lifecycle approvals.
- Published capsules bind approved scenarios, target/environment and preparation receipts.

Verification: path/symlink escape, forbidden writes, invalid catalog mapping, stale scenario and partial publication;
run existing capsule/conformance tests and required projection/template sync.

#### P4.3 — Connect consent-bound managed execution

Scope: scheduling the existing execution reserve/launch/reconcile services.

Acceptance:

- Execution starts only with exact persisted consent and frozen capsule/environment identities.
- Execution process exit and validated artifacts precede terminal evidence sealing.
- Duplicate scheduler deliveries cannot create duplicate accepted execution cycles.

Verification: consent denial/revocation, changed environment, repeated launch, process failure and report corruption.
Use controlled execution fixtures and the existing runtime test suite; run the build.

#### P4.4 — Connect triage, remediation and closure

Scope: independent Triager context, sealed evidence, report review, approved remediation/rerun and final closure.

Acceptance:

- Triager receives the allowed sealed evidence projection without predecessor transcript or live target mutation access.
- Remediation/rerun requires existing exact proposal approvals; review/risk acceptance/closure remain human-gated.
- Full Journey reaches normal or authorized risk-accepted closure with no unfinished work or unresolved required gates.

Verification: all six role paths, false/forged evidence, report revision, failed execution, remediation/rerun and both
closure modes. Produce anonymous and authenticated end-to-end evidence with the qualified real provider.

### Phase 5 — Recovery and operational hardening

#### P5.1 — Complete restart and uncertain-effect recovery

Scope: startup sweep, reconciliation outcomes and durable recovery cursors across all roles/execution.

Acceptance:

- Every nonterminal dispatch is resumed exactly, proven absent or left visibly unresolved after restart.
- Lost acknowledgements never cause unconditional repeated thread/turn creation or artifact effects.
- Recovery cannot synthesize new authority from expired/revoked assignments.

Verification: crash matrix at every persisted/effect boundary, database unavailability, truncated events, old cursor
replay and two-runtime takeover. Test every role rather than just Analyzer.

#### P5.2 — Complete cancellation and orphan handling

Scope: logical revocation, process/descendant stopping and termination reconciliation.

Acceptance:

- Access ends immediately on revocation; UI separately reports that a worker is still stopping if necessary.
- PID birth identity protects unrelated processes; hung descendants and failed kills stay actionable.
- No replacement starts before predecessor stop/absence confirmation, including after supervisor restart.

Verification: PID reuse, hung child, stop failure, supervisor death during termination and late stdout/tools/results.
Independently review process-control behavior and authority races.

#### P5.3 — Persist provider waits and event recovery

Scope: blocking questions, async questions, pending decisions, event order/deduplication and UI reconnection.

Acceptance:

- Unanswered questions survive UI reconnect and supported runtime restart without being mistaken for completion.
- Persisted question identity maps to the correct provider response mechanism; duplicate answers are idempotent.
- Unsupported/expired provider requests become explicit waits or failures, never synthetic approvals.

Verification: turn-ending question, out-of-order request resolution, answer delivery crash, duplicate response and
stale request after replacement. Test provider-specific normalization in adapter fixtures.

#### P5.4 — Add limits, pause controls and diagnostics

Scope: rate-limit handling, active-work deadlines, operator pause/resume and bounded status/log retention.

Acceptance:

- One AI worker, existing attempt ceilings and displayed 30-minute default active deadline are enforced.
- Human waits stop the active clock; limit exhaustion pauses admission/work safely without automatic billing changes.
- Usage/state diagnostics distinguish observed values from unavailable data and include actionable recovery steps.

Verification: fake-clock deadlines, stalled transport versus idle worker, rate limits, unavailable usage, pause during
I/O and resume with changed authorization. Verify no automatic reset-credit use or provider fallback.

#### P5.5 — Run adversarial and full lifecycle qualification

Scope: integrated fault suite, real-provider demonstrations and independent acceptance review.

Acceptance:

- Complete the plan's isolation, launch, cancellation, authentication, evidence and lifecycle matrices.
- No unresolved unauthorized effect, duplicate accepted transition or stale-authority acceptance remains.
- Record quality, interventions, runtime, resource use and supported configuration separately from correctness gates.

Verification: focused suites plus build, affected static analysis, package checks and exact-artifact independent
review. Existing green schema/Factory tests alone cannot pass this task.

### Phase 6 — Cutover and release readiness

#### P6.1 — Retire external coordination and legacy adoption

Scope: handoff/ticket/launch/UI/setup removal and ownership enforcement for retained APIs.

Acceptance:

- New Journeys use only managed coordination; no residual external entrypoint can claim coordinator authority.
- Old active external attempts cannot be automatically resumed/adopted; historical records remain readable.
- Unrelated catalog/testing APIs, targets and authored artifacts remain intact; no reset or approval transfer.

Verification: forbidden-symbol/route checks, API authorization tests, legacy-data fixture and fresh Journey test.
Inspect current onboarding/docs for companion-only instructions and update affected material.

#### P6.2 — Package the macOS user service

Scope: explicit CLI install/status/stop/uninstall commands and launchd supervision.

Acceptance:

- Service owns the local application/runtime, starts in the correct installation and survives browser/terminal closure.
- Status distinguishes service running, provider ready and Journey actively working.
- Sleep/wake/logout behavior is truthful; uninstall stops owned processes and preserves data.

Verification: clean macOS profile, service install/restart/status/uninstall, browser close, sleep/wake and permission
failure diagnostics. Do not add broad filesystem permissions as an automatic recovery step.

#### P6.3 — Define update/downgrade and data preservation

Scope: version qualification, draining, executable switch and persisted-state compatibility.

Acceptance:

- Updating drains/stops owned work before switching binaries; running processes retain their qualified executable.
- Unsupported provider versions refuse admission with clear repair steps.
- Incompatible downgrade fails before opening/mutating newer storage; existing records and auth boundaries survive update.

Verification: update during work, interrupted update, protocol mismatch, schema downgrade attempt and retained data
fixtures. Record rollback limits; do not promise binary rollback across incompatible migrations.

#### P6.4 — Synchronize docs, contracts and scaffolds

Scope: active product/runtime/setup docs, API references, package docs and canonical template synchronization.

Acceptance:

- Docs describe managed ownership, Start semantics, login, human gates, limits, recovery and supported platform/provider.
- Generated API/package references match runtime authority; templates are regenerated from canonical root source.
- Affected Graphify/generated artifacts follow their source workflows; no hand-edited generated receipts.

Verification: documentation links, template drift, generated-artifact and package-content checks, affected graph
review and formatting. Fix active-doc drift found in touched workflows.

#### P6.5 — Verify clean installation and release readiness

Scope: final qualified artifact, clean installation and complete acceptance evidence.

Acceptance:

- Fresh install completes anonymous and human-authenticated Journeys through all required gates without external coordination.
- Every task/gate is verified against the final artifact; no stale review or blocking findings remain.
- Record release readiness and limitations. Publication occurs only if the user separately includes it in delivery scope.

Verification: full relevant CI/build/package/scaffold/harness checks, macOS acceptance run and independent final
review. If publishing is requested, append scoped publication tasks with terminal CI/merge/release evidence.

## Phase gate register

| Gate | Required tasks                                                                                          | Exit criterion                                                                                                                                                 | Status        | Evidence                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0D  | D14, D15 and independent review of the revised plan                                                     | Reviewed Phase 1 scope requires deterministic adapters, preserves all task acceptance and forbids production provider admission                                | passed        | [P0.R2d independent review](evidence/P0.R2d.md#independent-review)                                                                                                                                         |
| G0   | P0.1–P0.4, P0.R0a–P0.R0b, P0.R1–P0.R5 including P0.R2a/P0.R2b/P0.R2c/P0.R2d/P0.R2e/P0.R2f/P0.R2g/P0.R3b | Every required role boundary has a viable proven enforcement path; process ambiguity has safe outcomes; independent feasibility review accepts the exact proof | blocked       | [evidence/P0.4.md](evidence/P0.4.md); [evidence/P0.R2.md](evidence/P0.R2.md); [evidence/P0.R2a.md](evidence/P0.R2a.md); [evidence/P0.R2b.md](evidence/P0.R2b.md); [evidence/P0.R2c.md](evidence/P0.R2c.md) |
| G1   | P1.1–P1.5                                                                                               | Fake-provider runtime survives restart with fenced ownership, idempotent effects and no unauthorized scheduling                                                | not_evaluated | —                                                                                                                                                                                                          |
| G2   | P2.1–P2.4                                                                                               | Real Codex analysis works wholly through AppraiseJS with questions/reviews and truthful status                                                                 | not_evaluated | —                                                                                                                                                                                                          |
| G3   | P3.1–P3.5                                                                                               | Anonymous/authenticated discovery is operational, scope-enforced and independently reviewed                                                                    | not_evaluated | —                                                                                                                                                                                                          |
| G4   | P4.1–P4.4                                                                                               | Complete Journey, revision, remediation/rerun and closure paths preserve all existing gates                                                                    | not_evaluated | —                                                                                                                                                                                                          |
| G5   | P5.1–P5.5                                                                                               | Fault/adversarial matrices and exact-artifact review establish release-level recovery and containment                                                          | not_evaluated | —                                                                                                                                                                                                          |
| G6   | P6.1–P6.5                                                                                               | Clean macOS installation and full workflow pass; external coordination retired; docs/scaffolds/checks match final artifact                                     | not_evaluated | —                                                                                                                                                                                                          |

Gate statuses: `not_evaluated`, `in_review`, `blocked`, `passed`. A known blocking finding cannot be waived into
`passed`. Reopen dependent gates if a later source or provider configuration change invalidates their evidence.

## Evidence record template

Create one record per task when work actually begins, either below or in a linked sanitized `evidence/<ID>.md` file.
Replace placeholders with observed facts; do not copy a template as evidence of work performed.

```markdown
### <task ID> — <title>

- Status: <in_progress|blocked|in_review|verified>
- Source identity: <branch, base SHA, current SHA or complete working-tree artifact digest>
- Changed surfaces: <canonical paths and generated/synced outputs>
- Acceptance evidence: <each criterion -> observation/test/artifact>
- Commands and outcomes: <exact command, passed/failed, pertinent result>
- Real-provider qualification: <executable/protocol/config identity or not applicable>
- Independent review: <reviewed identity, findings and disposition, or why not applicable>
- Limitations/blockers: <IDs or none>
- Next action: <one concrete action>
```

## Blocker register

Phase 0 observed the following implementation blockers and concluded with a no-go. Keep them open until the linked
remediation evidence satisfies G0; do not treat the remediation design itself as proof that any blocker is closed. Investigation details and reproduction are recorded in
[evidence/PHASE0-BLOCKER-INVESTIGATION.md](evidence/PHASE0-BLOCKER-INVESTIGATION.md).

| ID     | Task/gate              | Observed failure and reproduction                                                                                                                                                                                                                                                                                                                                                                                        | Impact                                                                                                                                                                                                                                                                                                      | Required unblock evidence                                                                                                                                                                                                                                                                                                            | Status |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| B0-001 | P0.2/P0.R1–P0.R3/G0    | The P0.R2 no-model run had no trusted final-manifest/request binding. P0.R2a captured ten top-level tools with one synthetic MCP role tool, and P0.R2b reduced that to the intended namespace plus three executable MCP resource helpers. P0.R2c removed MCP entirely: an empty dynamic-tool arm emitted zero tools and a one-tool arm emitted exactly its strict function across an allowed client-dispatch round trip. | P0.R2c closes the narrow exact-surface feasibility gap and shows the MCP helpers are avoidable. It still observes the final request only after `turn/start` and provides no D10 prepare/sealed dispatch binding, canonical all-role proof, live negative/recovery matrix or provider-native authentication. | D14 resolves the architecture choice; first resolve B0-005 and B0-006 via P0.R2g and rerun P0.R2d, then complete P0.R2e native authentication and production request/response qualification, then all-role P0.R3 and recovery P0.R4. D10 remains an alternative durable route. The local experiment alone cannot close this blocker. | open   |
| B0-002 | P0.3/P0.R4/G0          | Only `QR-06` exercised a spawned process; remaining recovery checks validated conservative policy decisions without App Server handshake, lost-acknowledgement, resume, descendant-stop or late-event faults.                                                                                                                                                                                                            | Real-provider process/session recovery feasibility is not empirically established.                                                                                                                                                                                                                          | P0.R4 must execute the complete real App Server fault matrix against the exact qualified build, including account-safe real or demonstrably equivalent turn-level paths, and bind results to process/thread/turn identities.                                                                                                         | open   |
| B0-003 | P0.R0a/G0              | Checker accepted required-server name with empty tools, null boundary fields and a true inventory Boolean; reproduced without a provider.                                                                                                                                                                                                                                                                                | Future qualification could falsely pass; no observed production escape occurred.                                                                                                                                                                                                                            | P0.R0a now rejects the reproduction and caller-selected authority, validates exact launch-bound manifests and semantic readiness/boundaries, and has accepted independent review bound to the checker artifact.                                                                                                                      | closed |
| B0-004 | P0.R3b/P0.R5/G0        | P0.4 explicitly lacks human-login/MFA, owning-process restart and qualified Scout/gateway cross-Journey containment evidence.                                                                                                                                                                                                                                                                                            | Controlled browser routing alone does not complete the declared authenticated-browser feasibility proof.                                                                                                                                                                                                    | Complete QBR-03/QBR-04 via P0.R3b and preserve all QBR regressions against the reviewed artifact.                                                                                                                                                                                                                                    | open   |
| B0-005 | P0.R2d/P0.R2/G0        | Codex 0.154.0 removes 79 canonical submit-schema constraint occurrences; every live R2d arm returned tools_rejected with zero upstream requests/effects and confirmed cleanup.                                                                                                                                                                                                                                           | Exact role names alone do not preserve the canonical model-visible schema; local argument validation cannot restore omitted model constraints.                                                                                                                                                              | P0.R2f has falsified the tested stock path; P0.R2g must prove the lossless full-build canary, then rerun P0.R2d. Any lossy projection or transforming gate requires a separately reviewed decision; do not green by deleting constraints.                                                                                            | open   |
| B0-006 | P0.R2g/P0.R2e/P0.R2/G0 | Live external-token refresh retries semantically equal JSON with different raw bytes; direct R2d tests reject byte-identical 401 retries but accept reserialized copies as new releases.                                                                                                                                                                                                                                 | Byte hashes alone do not define logical retry identity; auth refresh and replay prevention have no qualified combined contract.                                                                                                                                                                             | Review and test a bounded 401/refresh/retry state contract with stable logical identity, actual-body binding and ambiguous-delivery fencing; then test it with the full qualified candidate.                                                                                                                                         | open   |

Candidate refresh, 2026-09-11: official Codex `0.154.0` preserved the P0.R2c exact empty/one-tool dynamic wire
behavior but added no D10 prepare, effective-manifest or sealed bound-dispatch method. Its empty-input
`attestation/generate` request obtains an opaque token for an upstream header and is not request/tool attestation.
The no-model qualifier remained fail-closed. See [evidence/P0.R2-0.154.0.md](evidence/P0.R2-0.154.0.md); B0-001 and
P0.R2 remain open.

### B0-001 resolution components after D14/D15

| Component                                    | Disposition                           | Remaining acceptance                                                                |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Unresolved architecture direction            | resolved by user decision D14         | Appraise interlock is the selected temporary path; no further adoption question     |
| Global development stop                      | resolved by D15 and passed G0D review | Admit only deterministic Phase 1 after G0D; production adapter still requires G0    |
| Canonical dynamic-tool/interlock composition | blocked by B0-005                     | All six profiles lose constraints; pursue P0.R2g lossless build and retry contract  |
| Production provider admission                | unresolved                            | Native authentication, production transport, all-role confinement and real recovery |

B0-001 remains open until its full acceptance is satisfied. B0-002 (recovery) and B0-004 (authenticated browser)
remain open; B0-003's previously verified checker repair remains closed. Decision resolution is not runtime proof.

## Decision/change register

| ID  | Decision                                                                               | Authority/date                                                                                                                  | Effect                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Quality Journey first; complete lifecycle                                              | User, 2026-09-09                                                                                                                | General coding coordination excluded                                                                                                                                                                                                                                         |
| D02 | Codex first; local service; macOS first                                                | User, 2026-09-09                                                                                                                | Other providers/platforms deferred                                                                                                                                                                                                                                           |
| D03 | Deterministic workflow engine                                                          | User, 2026-09-09                                                                                                                | Models cannot select lifecycle transitions                                                                                                                                                                                                                                   |
| D04 | Full replacement; no active external migration                                         | User, 2026-09-09                                                                                                                | Preserve history but no dual ownership                                                                                                                                                                                                                                       |
| D05 | Explicit Start and local provider login                                                | User, 2026-09-09                                                                                                                | No work on confirmation or billing fallback                                                                                                                                                                                                                                  |
| D06 | Authenticated Scout with human sign-in                                                 | User, 2026-09-09                                                                                                                | Add broker/grants; no automated password login                                                                                                                                                                                                                               |
| D07 | One AI slot, existing attempt limits, 30-minute active deadline                        | Planning defaults recorded in the proposed plan, 2026-09-09                                                                     | Show limits before Start; no automatic increases                                                                                                                                                                                                                             |
| D08 | Required-boundary failure blocks release                                               | Existing authority contract and feasibility recommendation                                                                      | No invented attestations or weakened gates                                                                                                                                                                                                                                   |
| D09 | Reuse the existing MCP foundation through separate trust profiles                      | User direction, 2026-09-10                                                                                                      | Keep the full MCP for trusted coordinator clients; derive a role- and attempt-scoped worker gateway from the same canonical schemas, coordinator client and Journey services                                                                                                 |
| D10 | Use upstream two-phase provider attestation as the durable B0-001 solution             | User direction, 2026-09-11                                                                                                      | Require no-model preparation through the production request-construction path plus sealed bound dispatch; keep any provider patch temporary and adapter-contained                                                                                                            |
| D11 | Retain the mandatory Appraise wire interlock as a verified compatibility candidate     | User-requested stress test, 2026-09-11                                                                                          | The stock request path is interceptable and locally containable, but a passive proxy is rejected; original candidate decision; temporary boundary adoption is now recorded by D14, with production qualification still required                                              |
| D12 | Retain isolated role config as a defense-in-depth compatibility envelope               | User-requested experiment, 2026-09-11                                                                                           | Launch a fresh root App Server process per attempt with a complete non-inheriting config and one tool-only role MCP; do not treat native custom-agent selection or the three residual resource helpers as exact-tool qualification                                           |
| D13 | Retain zero-MCP dynamic tools as the preferred stock compatibility candidate           | User-requested experiment, 2026-09-11                                                                                           | Keep the logical Journey work graph and Agent Factory; project worker tools as client-owned dynamic functions and route calls internally through the scoped gateway. D14 subsequently adopts the combined interlock route; this experiment alone does not qualify production |
| D14 | Adopt D13 plus mandatory Appraise request/response interlock as the temporary boundary | User, 2026-09-11: "let's go with your direction. can you test it out and update plan accordingly with the blocker resolutions." | Authorizes P0.R2d and adopts Appraise ownership of request release, response enforcement and compatibility maintenance; D10 remains the durable target. Production qualification is still required; no fork or billing/provider fallback.                                    |
| D15 | Separate deterministic development admission from production-provider admission        | Same user direction, 2026-09-11                                                                                                 | G0D admits only Phase 1 under a deterministic adapter; P2.1 requires both G1 and G0. Browser/UI/recovery development beyond Phase 1 must be split into explicit dependency-bounded tasks first. No human lifecycle gate changes.                                             |

Adoption update, 2026-09-11: D14/D15 supersede the earlier unresolved direction and blanket Phase 1 stop.
P0.R2d tests the composition; G0D permits provider-independent development only after independent review of this
scope. G0 remains blocked on B0-001/B0-002/B0-004/B0-005/B0-006. Native authentication, complete production transport, all-role
containment and recovery are still required. Earlier no-go records remain historical evidence.

Planning update, 2026-09-10: the user requested findings and a proposed progression path. Added P0.R0a, P0.R0b,
P0.R3b and blockers B0-003/B0-004. This authorizes document updates, not implementation, model turns, provider patch
maintenance or altered product/harness policy. No task or gate was marked complete by this update.

Decision update, 2026-09-11: the user selected upstream two-phase prepare-and-bound-dispatch attestation as the
durable resolution for B0-001. This records the target contract but does not claim upstream implementation, authorize
a maintained provider fork, close B0-001, qualify P0.R2 or permit provider model turns.

Compatibility-candidate update, 2026-09-11: the user requested a stress test of the mandatory local wire-gateway
theory and a plan update after verification. P0.R2a recorded exact-port confinement, exact stock request capture,
zero observed retry across the account-free failure matrix and synthetic MCP response compatibility. It also
falsified passive forwarding because the real request retained nine top-level surfaces outside the single synthetic
role capability. D11 retains only the stronger request/response interlock candidate. It does not adopt its production
maintenance boundary or authorize real credentials, provider/model I/O, P0.R3/P0.R4 or Phase 1.

Role-config experiment update, 2026-09-11: P0.R2b reduced the exact stock wire manifest from ten entries to four.
Shell/session, image, multi-agent, web search and direct user input were removed. The three remaining Codex MCP
resource helpers were all executable, reached only the configured tool-only worker MCP, failed with `-32601`, and
caused no observed external effect. D12 records the useful launch envelope without weakening the accepted exact-tool
contract. A weaker four-entry effect-constrained contract requires an explicit user security decision.

Dynamic-tool experiment update, 2026-09-11: P0.R2c verified that stock Codex with no MCP can emit an empty tool
manifest or exactly one strict client-owned dynamic function, and that an allowed call reaches the Appraise client
through `item/tool/call`. D13 retains this as the preferred stock compatibility candidate and keeps the P0.R1 gateway
as the internal authority/dispatch boundary. It does not provide D10 pre-turn attestation, sealed bound dispatch,
canonical all-role coverage, live negative/recovery proof or provider-native login; P0.R2 and B0-001 remain blocked.

Record later approved changes with their exact user direction, affected tasks/contracts, invalidated evidence and
replacement acceptance criteria. Distinguish explicit user choices from planning defaults.

## Active handoff

- Current phase: Phase 0 compatibility no-go retained; deterministic Phase 1 admission passed under D15/G0D.
- Current task: P0.R2f verified as research-only completion after independent review; stock-path no-go and source-level repair canary retained. P0.R2d and P0.R2 remain `blocked` on provider qualification.
- Selected next task: P0.R2g, the bounded full-provider canary and retry-contract experiment. The user directed
  provider-blocker testing before product implementation; P1.1–P1.5 are on a sequencing hold despite G0D's historical
  pass. Do not start Phase 1 or offer it as a substitute for a demonstrated provider path.
- Verified tasks: 10 of 47; no product implementation task is complete. P0.3 remains blocked and is not counted as
  verified.
- Latest gates: G0 `blocked`; G0D `passed` for deterministic development admission.
- Runtime/processes started by this plan: the original `QB-01`, refreshed P0.R0b matrix and successful P0.R2
  Requirement Analyzer probe were terminated with zero surviving owned processes. They sent no `turn/start`;
  ephemeral thread identifiers are retained only as SHA-256 digests in evidence. Two P0.R2 fixture-start diagnostics
  also sent no turn; an exact-PGID survivor check found zero after the first cleanup refusal.
- Known unrelated worktree change at plan creation: `package-lock.json`; it was not present when P0.1 began.
- Active branch/base: `codex/managed-quality-journey-coordinator-p0` from `86cd587ce74c6354ce7532dcd5a4a6145d4941de`;
  this findings/progression update started from `74cd7d1f14aa32ad3cf6eb3f5f67338776d95aa2`.
- Planning direction received: preserve the existing full MCP for trusted clients and add a separately registered,
  role- and attempt-scoped worker gateway over the same canonical definitions and Journey services. This records the
  design; it does not authorize implementation beyond the next thread's explicit scope.
- Durable blocker direction received: target an upstream two-phase no-model prepare and sealed bound-dispatch
  contract. Treat a provider-specific patch only as a separately authorized temporary adapter bridge.
- Post-decision P0.R2 verification, 2026-09-11: the installed executable and protocol were byte-identical to the
  failed candidate. The no-model probe again qualified launch isolation but returned
  `native_tool_inventory_unavailable`, `providerQualified: false` and `mayStartTurn: false`; no turn was sent and
  cleanup found zero survivors. Selecting D10 did not itself implement the upstream capability, so B0-001 remains
  open.
- P0.R2a wire-gateway stress test, 2026-09-11: disposable `turn/start` calls were confined to a non-forwarding
  loopback fixture using only a fake environment credential. The exact stock request was observable but contained
  ten top-level tool entries rather than the single fixture role surface. HTTP/error/reconnect fixtures produced one
  request each; a synthetic allowed MCP call produced a second request with `function_call_output`. No external
  provider/model endpoint or real account credential was reachable. See [evidence/P0.R2a.md](evidence/P0.R2a.md).
- P0.R2b role-config stress test, 2026-09-11: a complete isolated role config reduced the exact request to the
  intended MCP namespace plus three Codex MCP resource helpers. Disabling the structured direct-user-input tool
  worked. All three resource helpers executed but failed closed against the only configured tool-only worker MCP;
  each produced a second local fixture request and no observed external effect. See
  [evidence/P0.R2b.md](evidence/P0.R2b.md).
- P0.R2c dynamic-tool stress test, 2026-09-11: a no-MCP empty arm emitted zero tools and a one-tool arm emitted only
  `appraise_dynamic_probe` across its allowed client-dispatch round trip. Focused dispatcher tests reject missing or
  invalid call identity, unknown tools, malformed arguments, replay, cross-thread and stale-turn calls; live negative
  protocol and resume/restart behavior remain unverified. See [evidence/P0.R2c.md](evidence/P0.R2c.md).
- P0.R2 stable-candidate refresh, 2026-09-11: official Codex `0.154.0` preserved the exact empty/one-tool dynamic
  wire surfaces but its generated protocol still exposed no D10 prepare, effective-manifest or sealed bound-dispatch
  method. `attestation/generate` is an empty-input opaque token request for an upstream header, not model-request
  attestation. The no-model qualifier remained fail-closed, no real provider/model traffic occurred, and all owned
  processes were cleaned up. The initial independent review required a candidate-specific machine-readable receipt;
  the repaired receipt then passed exact digest, source-hash, semantic-verdict and gate-preservation review. See
  [evidence/P0.R2-0.154.0.md](evidence/P0.R2-0.154.0.md).
- P0.R2d final run: all three arms failed at tools_rejected because canonical semantic schema constraints were
  missing. Each recorded zero upstream requests, zero effects, explicit forbidden-port denial and confirmed zero
  survivors. [evidence/P0.R2d.md](evidence/P0.R2d.md) contains the exact no-go receipt and direct/live distinction.
- P0.R2f evidence: 12 live schema arms establish stock schema loss; the compiled serializer canary matches
  20 stock wire schemas and preserves 20 candidate inputs. It is not a full Codex build. Synthetic external-auth
  success/error routing passes, with raw retry inequality and canonical equality retained. B0-006 records the
  newly reproduced retry-contract gap. See [evidence/P0.R2f.md](evidence/P0.R2f.md).
- Next action: P0.R2g, the disposable full-provider canary and reviewed retry contract. Preserve D14 unchanged-byte forwarding and all G0 criteria;
  maintaining/distributing a provider fork or adopting request transformation remains outside this experiment.
- Current-slice validation: final live schema/auth receipts, compiled serializer comparisons, focused tests,
  formatting/lint and documentation links. Independent exact-artifact review accepted the research-only result; no provider or gate qualified. No product build or Phase 1 ran.
- Planning validation: see the investigation record and P0.R0a–P0.R2 evidence. P0.R0a's checker defect is repaired,
  P0.R0b is verified, and P0.R1 passed independent authority review. P0.R2's exact candidate remains unqualified; no
  provider model turn is authorized. P0.R2's independent no-go review passed against its recorded exact source/run
  identities. The final optional Fallow audit has no dead-code or duplication findings but retains 27 unsuppressed
  complexity/estimated-coverage findings, which must be addressed before any merge decision.

### Handoff update checklist

Before stopping an implementation session, record the active task/status, branch and exact diff identity, completed
checks, failing checks/blockers, owned runtime identities, gate state, and the next executable action. A successor
must inspect current files/processes before resuming; this record is a handoff aid, not live execution proof.
