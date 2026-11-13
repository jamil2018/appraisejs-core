# M13 — Bounded runtime qualification plan

Date: 2026-11-13 (Asia/Dhaka). **Planning only; no runtime or implementation grant.**
Based on clean local commit `50091a41e1836276a3ad87b6ff23c708e5417d86`,
tree `1c1928b52dc3cba476f3cb2a13f34863215cee40`.
This plan does not authorize its execution. No real inference, sign-in, push, merge, publication, public managed
opt-in, default-mode change, account switch or credential export is permitted by this request.

## Starting evidence and remaining blockers

[Exact-candidate review](M13-VERIFICATION.md), [six-role follow-up](M13-REPLAY-VERIFICATION.md), and its independent
acceptance retain their separate artifact scopes. The replay/revocation/stale-session/changed-content matrix is
complete for the tested six-role canonical service cases: 84 focused source checks and 23 installed checks passed.
Do not put that closed gap back on the queue or treat it as actual provider transport qualification.
Full native helper inventory and hostile containment are not revived as mandatory gates.

| Remaining issue                             | Current fact                                                                                                                                                          | Evidence needed                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product provider composition                | `startQualityJourneyProductionProvider()` in `quality-journey-process-supervisor.ts` unconditionally refuses. The enabled supervisor adapter is explicitly a fixture. | Separately scoped adapter/composition implementation and exact-artifact review, then authorized observations. Native feasibility alone cannot enable production dispatch. |
| Exact native tuple and required MCP         | M13 observed source/stub/installed-app behavior, not current native Codex initialization or required-MCP failure.                                                     | Exact executable/build/configuration/protocol plus actual native positive readiness and required-MCP refusal, without fallback.                                           |
| Existing-login use and provider eligibility | Direction is existing-login/error-if-missing. M01's one-off auth-file topology and consumed allowances do not apply to a new run.                                     | A newly authorized credential-source topology and bounded native observation; eligibility/support conclusions limited to what is actually evidenced.                      |
| Real model and all-role delivery            | Accepted canonical fixture artifacts do not prove provider-produced role outputs, native transport or actual clarification waits.                                     | Separately authorized native/provider cases tied to canonical artifacts, human decisions and original cleanup.                                                            |
| Native interruption/recovery                | Synthetic children, database replay and browser checks do not establish every actual Codex/provider crash or ambiguous-send outcome.                                  | Original-handle interruption, physical effect reconciliation and owned cleanup observations for each newly authorized native case.                                        |
| Usage, latency and spend                    | Command/suite timings exist; per-accepted-artifact model tokens/cost/dispatch latency and real human-wait samples do not.                                             | Bounded samples with provenance; unavailable values remain UNQUALIFIED. Local attempt/turn caps are not hard monetary enforcement.                                        |
| Distribution/support claims                 | No applicable distribution/auth eligibility or broader host claim was qualified by M13.                                                                               | Dated authoritative-source assessment for the intended local/distribution use and exact observed support scope. No publication follows.                                   |

The policy source `src/lib/quality-journey/provider-intent-contract.ts` retains D05:
explicit `gpt-6.1-sol` / medium, hub capacity 1, lease 120 s, heartbeat 40 s, acknowledgement 60 s,
turn 900 s, maxTurns/maxAttempts 3, unresolved retention 7 days and reconciled terminal retention 24 hours.
These are existing operational limits, not new allowances, entitlement evidence or a hard spend cap.

## Lane A — checks permitted within existing limits

**2026-11-13 follow-up:** [A1–A6 completed offline](M13-LANE-A-COMPLETION.md).
The [B0-R1 packet](M13-B0-AUTHORIZATION-PACKET.md) proposes only a readiness-controller seam;
the full product adapter and all native/account/inference steps remain incomplete and unauthorized.
The original planning-turn statement below is historical.

These are available verification activities under the earlier bounded repository scope. **This planning turn runs
none of the proposed runtime checks.** Existing authorization permits routine offline checks; it does not expand
because an action is called a preflight. New product wiring remains outside this lane.

| ID / bounded task                                                    | Allowed work                                                                                                                                                                                                                                                                                                    | Required result / stop condition                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1: Freeze the candidate and authority ledger (S)                    | Read Git/source/approved records; hash canonical source, configuration, lockfiles, migration inventory and retained actual tarballs. Read metadata/hash bytes at an explicitly resolved executable path without executing it. Resolve accepted amendments from separate approval records, not proposed headers. | A candidate manifest distinguishing historical observations from current file matches, absent evidence and changed tuples. Do not inspect credential files, keychains, account data, provider history or ambient private configuration. Changed bytes do not renew qualification.                                                       |
| A2: Trace composition and blockers (S)                               | Read launcher/configuration/readiness/credential seams and existing tests. Identify exact missing adapter, recoverable-secret custody and post-I/O validation work; compare with host-neutral sessions and six-role gateways.                                                                                   | A small implementation design with owning paths and refusal behavior. Preserve the production guard. Do not invoke a legacy qualification script merely because it is present or an npm script exists.                                                                                                                                  |
| A3: Offline verification of existing behavior (S per selected batch) | Select existing focused SQLite/session/ingress/provider-intent/RPC/owned-synthetic-child tests; fresh disposable databases, local synthetic targets, local browser and controlled synthetic interruptions remain within the earlier scope. Use packaging/scaffold checks only if changed surfaces require them. | Record exact commands, inputs, case count, effect witnesses and cleanup dispositions. No native Codex/Code Mode process, real account/provider, historical campaign, protected target or production dispatch. Current all-role replay results may be reused at their exact artifact; repeat only for changed inputs or a justified gap. |
| A4: Instrumentation and measurement design (S)                       | Define a sanitized receipt schema, clock boundaries and aggregation on synthetic data. Inspect existing event/usage fields without running an actual provider.                                                                                                                                                  | Distinguish queue, initialization/MCP, dispatch, accepted-artifact latency, human wait and cleanup; model tokens/cost/eligibility stay null/UNQUALIFIED when absent. Do not convert synthetic values or elapsed test time into model usage. New instrumentation code requires its own implementation task.                              |
| A5: Eligibility and support evidence desk review (S)                 | Read public authoritative documentation/terms and existing approved local-only contracts, recording retrieval date and source version. Describe unresolved questions rather than inferring rights, account entitlement or vendor approval.                                                                      | A narrow claims register for the intended use. Documentation is not installed-native behavior or actual account eligibility. No account query, subscription action or provider connection.                                                                                                                                              |
| A6: Prepare an exact future authorization packet (S)                 | Draft source/command manifests and failure/cleanup criteria using fresh names; review inert specifications.                                                                                                                                                                                                     | Concrete reviewable artifacts before asking for authorization. Preparing a packet supplies no launch, login, inference, allocation, permission or sign-off. Native runtime roots remain absent until approved.                                                                                                                          |

Dependencies: A1 precedes A2–A6. A2 and A5 inform the implementation/auth design. A3 is evidence-driven, not a blanket
full-suite replay. A4 and the selected native case design feed A6. The output checkpoint is a frozen blocker ledger,
implementation proposal and independently reviewed **non-executable** authorization packet.

Allowed source-reading locations include `quality-journey-process-supervisor.ts`, provider-run/session/recovery
services, `src/lib/quality-journey/codex-app-server/`, and package MCP/composition code.
`scripts/qualify-managed-journey-provider.mjs` is a legacy executable that launches immediately; it is a source
reference, **not an authorized command**. Even `codex --version`, schema-generation commands, a “no-model”
`thread/start`, an account-status query and model-list probing execute or contact a runtime/account boundary:
they belong in a separately approved packet, not A1.

## Lane B — new authorization required; proposed sequence only

No step below is approved by this plan. Each has a separate stop/review boundary. Numbers are proposed upper
bounds to make a future request finite, not allocations, current permission or a promise that existing code
implements them. A failed/ambiguous case does not automatically authorize another attempt.

### B0: Offline product-adapter implementation

**B0-R1 follow-up:** the user approved the exact offline readiness-controller packet at `efddc307`, bound to all
three recorded hashes. [Implementation evidence](M13-B0-R1-VERIFICATION.md) covers that narrow seam only.
The original full-adapter scope below remains incomplete: native acquisition/wire mapping, credential custody and
role composition are excluded from R1. No B1+ authority follows; the full B0 checklist item remains open.

**New scope:** authorize a small implementation slice after A2 identifies its contracts, including exact executable/
configuration/MCP readiness, original-owned launch/cleanup and recoverable assignment credential custody if required.
No real credential access or native provider launch is part of offline implementation.
Keep production entry points refusing until their separately approved activation/qualification conditions exist;
do not temporarily bypass the guard for a “smoke test.”

Acceptance: focused fake-port/disposable-SQLite tests work before any native observation; no fallback, reconstructed
send permit, human-decision shortcut or automatic mode change. Freeze the implementation, regenerate scaffold/graphs
where affected, run applicable lint/tests/build/package checks and obtain independent exact-artifact acceptance.
An offline implementation pass still does not set `runtimeQualified=true`.

### B1: Actual native, unauthenticated readiness

Prerequisites: A6 packet, reviewed B0 adapter or a separately reviewed fresh disposable feasibility harness.
The latter qualifies only its own composition and does not count as product-adapter qualification.
Require new exact authorization even though inference/sign-in remain zero.

Proposed finite slice: at most **two cases, one native launch per case**, no retries: one positive initialize/
required-MCP-ready path and one deliberately unavailable required-MCP refusal. No `turn/start`, account query,
model-list query, real authentication, provider request, permission grant, external protected access or lifecycle
mutation. Freeze exact supported protocol methods and their counts before approval; permit `thread/start` only
if the reviewed no-auth composition proves it is necessary and cannot create a real provider effect.
If that separation cannot be established, do not run it under a no-auth/no-inference grant.

Proposed wall-clock ceiling: 90 s per case / 180 s total, partitioned in the reviewed command into startup,
readiness and original-owned cleanup allowances. This changes no global/product/test timeout. If unsupported,
revise the proposal before approval; do not raise a deadline after a failed attempt. Declare known Codex/MCP/
Code Mode host ownership and source-derived helper expectations separately from actual lifetime inventory;
TA03 does not require a complete observed helper inventory.

Pass: exact tuple/configuration observed, positive readiness or actionable required-MCP failure as appropriate,
no fallback/new effects, owned resources accounted for with original handles and a truthful cleanup disposition.
Missing cleanup identity or ambiguous effects stop the slice and retain UNKNOWN; they cannot produce a readiness pass.

### B2: Existing-login check without inference

Prerequisites: reviewed supported native route and a **new named credential-source topology**, exact supported
command/method and explicit authority for any native credential read/refresh side effects.
M01's old auth-file link is not reused. Appraise must not copy, parse or export credentials.

Proposed slice: at most one native launch and one supported authentication-status observation, zero thread/turn
starts and zero inference; proposed ceiling 60 s observation plus 30 s original-owned cleanup.
Capture bounded categories only. If the native API cannot perform that check under those limits, stop and redesign
the request. Missing/expired authentication parks with AUTHENTICATION_REQUIRED; no sign-in, refresh authorization
by implication, account change, API key, provider/model fallback or entitlement inference.
Sign-in is outside this plan, including this future slice.

Pass: evidence of the exact chosen login path's status with sanitized output and known side effects. Presence of a
login or model listing does not prove entitlement, actual model operation, billing coverage or distribution rights.

### B3: First provider-backed Analysis loop — deferred beyond current limits

Requires a new explicit real-inference grant. This plan neither requests nor supplies that grant.
Prerequisites include accepted B0/B1/B2 observations for the exact composition, an eligibility decision for the
intended use, a concrete spend-risk/enforcement decision and an exact command/case manifest.
If a promised hard monetary ceiling cannot be enforced, do not claim it; return for a contract decision before launch.

A possible first finite proposal is **one disposable Analysis loop, at most two expressly approved turn starts total**:
initial structured questions and one eligible answer-bound successor. Freeze exact request, model/configuration,
input/output bounds, new cumulative allowances and cleanup before asking. Zero automatic correction/retry turns.
Human answers and approvals occur through exact-version Appraise controls; waiting must cause no further turn.
Earlier inference 3/3 and every historical reservation remain consumed; any additional allowance must be explicit
and additive, never a refund or reset.

Pass: actual provider output accepted canonically, exact Q&A lineage, no dispatch during human wait, requested and
returned model identity, measured sanitized usage/latency and original-owned cleanup.
Completed prose/turn/process exit do not establish any of these outcomes.

### B4: Remaining five roles, human decisions and recovery — separately gated slices

After B3 review, a proposed baseline continuation may allow at most **five initial role turn starts**, one each for
Scout, Resource Explorer, Designer, Automator and Triager, on the exact approved disposable Journey lineage.
Serialize provider turns under hub capacity 1; independent Discovery authority does not imply provider concurrency.
Proposed execution scope is at most one anonymous local scenario, one execution cycle and one TestRun.
No extra turns/executions for sampling, corrections, failed schema repair or retries are implied.

Use an anonymous synthetic local target first, Appraise-issued browser evidence, exact scenario approval, frozen
materialization, separate canonical execution consent when required, sealed runtime output, scoped Triager/report
lineage and exact human closure/revision controls. No product-code repair or protected login follows from a role grant.
A human revision/remediation/rerun branch needs its own frozen case list, consent and finite additional allowance;
do not infer its required roles or budget from prose or automatically keep dispatching until green.

Actual native interruption, lost acknowledgement and fresh-process reconstruction require separately enumerated
cases and budgets as well. Original live handles alone authorize cleanup. Retain the sender-exclusion/UNKNOWN,
occupied HUB, immutable session/attempt/budget, paused terminal publication and transfer/rollback boundaries.
Neither a fresh process nor an accepted replay reconstructs credentials, a consumed send permit or signaling authority.
An ambiguous start is spent and unreplayed. A no-model native cleanup observation is not physical provider reconciliation.

### B5: Additional target/auth/host/distribution claims — optional, separate scope

If an intended support claim needs live protected access, another host/build or distribution channel, prepare a
new exact qualification slice and explicit authorization. Discovery login, runtime target authentication, provider
login and execution consent are separate authorities. No cookie/session transfer or general sign-in grant is implied.
Do not make these optional broader claims a blocker for a narrower explicitly approved anonymous/local claim;
conversely, do not advertise the broader claim from narrower evidence. Push/publication/default rollout stay outside.

## Evidence, measurement and stop rules

Each future packet must bind commit/tree, actual packed hashes, resolved executable/OS/architecture, dependency/
protocol/configuration hashes, target/Journey/session/attempt identity, method/effect allowlist and finite cumulative
budgets. Name fresh roots, original resource owners, permitted network destinations, success/refusal predicates,
abort deadlines, cleanup observation and reviewer evidence. No historical campaign root, consumed command or
missing original handle may be reconstructed. Changed source/configuration/tuple needs affected requalification.

Record for every actual sample: cold/warm definition, sample size, attempted/accepted artifacts, failed/correction
attempts, queue/startup/dispatch/acceptance time, human-wait interval, cleanup and terminal/UNKNOWN disposition.
“Warm” may mean warm dependency/filesystem caches with a fresh per-turn owned child; it must not silently change
M05's child lifetime policy. Do not clear shared caches to manufacture “cold” results.
One sample per role is a functional observation, not a performance distribution. Extra samples require their own
allowance. Missing model tokens, cost, eligibility and hard spend enforcement remain UNQUALIFIED, not zero.

Failure classification: infrastructure refusal is not product success; fixture drift requires fixture diagnosis;
a demonstrated product defect requires a bounded repair and affected rechecks; unobserved host/provider behavior
remains UNKNOWN/UNQUALIFIED. Preserve failed evidence, no automatic resend after ambiguous sends, no added skips/
retries, baseline weakening or global deadline increases. Historical cleanup uncertainty is not retried away.
Read-only inventory may describe retained records, but historical physical cleanup requires its original authority.

## Checklist and completion boundary

- [x] A1–A6 artifacts prepared and verified under existing scope; no native execution. See the linked completion record.
- [ ] B0 separately authorized, implemented and independently accepted if product wiring is required.
- [ ] B1 exact native no-auth packet separately authorized and observed.
- [ ] B2 exact existing-login topology/check separately authorized and observed.
- [ ] B3 real-inference/spend packet separately authorized and observed.
- [ ] B4 role/human-loop/recovery slices individually authorized and observed.
- [ ] Applicable B5 claims either qualified or explicitly excluded from the intended support scope.
- [ ] Exact final composition independently reviewed; all required findings resolved; usage/latency limits published.

This checklist is a proposed work queue, not evidence of completion or a request to approve unseen artifacts now.
Leave M13 unchecked while required runtime acceptance is blocked/unqualified. Keep
`hostIsolation=NOT_ATTESTED`, same-user native trust risk and
`UNKNOWN_NOT_INDEPENDENTLY_OBSERVED` helper lifetime explicit. TA02/TA03 withdraw stronger containment criteria,
not pass them. Preserve known original-owned Codex/Code Mode cleanup obligations, M06 custody/HALTs and spent budgets.

A completed planning deliverable or a native case pass does not activate production dispatch, amend frozen
contracts, approve an Appraise Journey transition or grant release/default-mode/public opt-in authority.
