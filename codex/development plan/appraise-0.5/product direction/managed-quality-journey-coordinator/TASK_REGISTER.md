# Stock Codex Quality Journey — Task Register

Specification: [PLAN.md](PLAN.md). Architecture adopted 2026-09-11. C0.1, C0.2 and C0.3 are verified as bounded
qualification tasks. The user-approved C0.2e retained admission slice and C0.4 feasibility review are verified; GC0
passed after independent exact-artifact review. This gate admits only the recorded C1 implementation order.
Historical work is retained in [TASK_REGISTER.managed-runtime-archive.md](TASK_REGISTER.managed-runtime-archive.md).

## Operating instructions

Work in dependency order within the user's authorized scope. C0.1 and the original C0.2 negative qualification remain
verified. **C0.2e.1–C0.2e.4, C0.3, C0.4, C1.1, C1.2 and C1.3 are verified** under their recorded scopes. GC1
`passed` after live closure of `GC1-B01` and independent exact-artifact review; C2.1 remains `pending`, is eligible,
and is unstarted.
Use `pending`, `in_progress`, `blocked`, `in_review`, `verified`;
only verified tasks use `[x]`. A successful experiment can establish a negative result without passing its gate.
Do not turn a documentation decision into a capability claim. Record exact artifact/version, expected and observed
outcome, direct versus live verification, remaining gaps and owned-resource cleanup in `evidence/<task-id>.md`.
Split large slices into stable suffix IDs before implementation. Old evidence must retain its original meaning.

## Master task register

| Done | ID    | Task                                                       | Dependencies      | Status   | Evidence                   |
| ---- | ----- | ---------------------------------------------------------- | ----------------- | -------- | -------------------------- |
| [x]  | C0.1  | Qualify Appraise-to-Codex handoff                          | None              | verified | [C0.1](evidence/C0.1.md)   |
| [x]  | C0.2  | Qualify graph acceptance and interrupted resume            | C0.1              | verified | [C0.2](evidence/C0.2.md)   |
| [x]  | C0.2e | Retain and qualify external Analyzer admission             | C0.2              | verified | [C0.2e](evidence/C0.2e.md) |
| [x]  | C0.3  | Qualify discovery and evidence feasibility                 | C0.1              | verified | [C0.3](evidence/C0.3.md)   |
| [x]  | C0.4  | Review feasibility and establish exact implementation gaps | C0.2, C0.2e, C0.3 | verified | [C0.4](evidence/C0.4.md)   |
| [x]  | C1.1  | Deliver plugin setup and compatibility diagnostics         | GC0               | verified | [C1.1](evidence/C1.1.md)   |
| [x]  | C1.2  | Deliver prepared Journey launch                            | C1.1              | verified | [C1.2](evidence/C1.2.md)   |
| [x]  | C1.3  | Deliver later-stage reconnect and takeover                 | C1.2              | verified | [C1.3](evidence/C1.3.md)   |
| [x]  | C2.1  | Enforce graph claim and submission contracts               | GC1               | verified | [C2.1](evidence/C2.1.md)   |
| [ ]  | C2.2  | Connect analysis and human question loops                  | C2.1              | pending  | —                          |
| [ ]  | C2.3  | Deliver scoped discovery and human sign-in                 | C2.1, C0.3        | pending  | —                          |
| [ ]  | C2.4  | Connect scenario review and revision                       | C2.2, C2.3        | pending  | —                          |
| [ ]  | C2.5  | Connect automation preparation                             | C2.4              | pending  | —                          |
| [ ]  | C2.6  | Connect consent-bound execution and reconciliation         | C2.5              | pending  | —                          |
| [ ]  | C2.7  | Connect triage, remediation and closure                    | C2.6              | pending  | —                          |
| [ ]  | C3.1  | Harden pause, cancellation and recovery                    | GC2               | pending  | —                          |
| [ ]  | C3.2  | Verify data and version compatibility                      | C3.1              | pending  | —                          |
| [ ]  | C3.3  | Publish operator guidance and release evidence             | C3.2              | pending  | —                          |

## Task specifications

All tasks require affected-file formatting and applicable validation from PLAN section 7. Likely source areas are
routing hints, not instructions to edit every listed file. Determine precise ownership before implementation.

### C0.1 — Qualify Appraise-to-Codex handoff

Acceptance: Use a disposable confirmed Journey and installed stock Codex. Verify documented URI prefill, correct workspace, plugin recognition, user Send, authenticated ticket redemption and authoritative read. Record remote/projectless behavior, missing plugin/URI-handler fallback, expiry and duplicate clicks.

Verification: Live desktop/MCP trace plus ticket-negative tests; record versions and clean up only owned fixtures.

Likely scope: handoff service; existing setup UI; disposable evidence.

C0.1 evaluation slices: **C0.1a** baseline/test inventory recorded; **C0.1b** live local copy/paste fallback and separate local URI prefill/Send probe demonstrated; combined URI/redemption and disposable plugin installation/recognition demonstrated; **C0.1c** remote neutral workspace, unsent composer, natural expiry and service concurrency demonstrated; missing-marketplace and protocol-denial outcomes recorded; **C0.1d** independent evidence review accepted; C0.1 verified. See [evidence and unblock criteria](evidence/C0.1.md). These slices do not relax parent acceptance.

### C0.2 — Qualify graph acceptance and interrupted resume

Acceptance: Claim one existing role task through current MCP; submit valid, invalid, wrong-target, stale and duplicate candidates. Lose an acknowledgement, interrupt the host task, reconnect and reconcile before retry. Demonstrate a human gate rejects unauthorized advance and a new session cannot commit with stale ownership. Race two claimants on one Journey and verify only one active assignment; run two distinct Journeys and verify independent target, lease and artifact scope.

Verification: Service negative/concurrency tests plus one bounded live Codex cycle; missing service capabilities become explicit gaps, never mock-only passes.

Likely scope: Journey services; MCP contract; qualification fixtures.

C0.2 evaluation slices: **C0.2a** graph/source and service-contract baseline recorded; **C0.2b** live claim race,
local/remote isolation and rejection probes demonstrated; **C0.2c** current-task expiry/replacement and fresh-session
resume demonstrated; **C0.2d** exact retry, invalid candidate, human-gate and stale-owner behavior verified at the
service boundary, with the then-unavailable live stock-task dispatch/submission bridge retained as historical
C-B02/C-B03 context.
C0.2 is verified as a bounded negative qualification, not as a production graph-execution pass. See
[evidence and gap disposition](evidence/C0.2.md). These slices do not relax parent acceptance or admit GC0.

### C0.2e — Retain and qualify external Analyzer admission

Authority: user, 2026-09-12, approved the narrow C0.2 implementation exception and requested this handoff for Sol.
The code is production-intended and retained; only qualification fixtures and temporary harness pieces are
disposable. This is additional work, not a rewrite of the verified negative C0.2 result or C0.1.

Follow [C0.2e-IMPLEMENTATION.md](C0.2e-IMPLEMENTATION.md) for scope, invariants, validation and stop conditions.
The [blocker investigation](evidence/C0.2-BLOCKER-INVESTIGATION.md) remains the causal evidence; its original
throwaway-prototype proposal is superseded by this authorized retained-code approach.

| Done | Slice   | Deliverable                                                                                     | Dependencies | Status   |
| ---- | ------- | ----------------------------------------------------------------------------------------------- | ------------ | -------- |
| [x]  | C0.2e.1 | Source-backed external admission contract, compatibility and validation design                  | C0.2         | verified |
| [x]  | C0.2e.2 | Retained opt-in Analyzer admission, canonical submission/recovery path and deterministic checks | C0.2e.1      | verified |
| [x]  | C0.2e.3 | Isolated live stock-Codex acceptance, lost-acknowledgement and fresh-task resume proof          | C0.2e.2      | verified |
| [x]  | C0.2e.4 | Independent exact-artifact review and evidence reconciliation                                   | C0.2e.3      | verified |

Acceptance: All four slices verified, including a real accepted Analysis artifact through authenticated MCP,
no-write invalid/unauthorized attempts, principal/target/ownership enforcement, exact retry semantics, concurrent
admission isolation, fresh-task resume and human-gate rejection. Record results in `evidence/C0.2e.md`; do not create
passing evidence before observation. C0.4 cannot admit GC0 from negative graph evidence alone.

### C0.3 — Qualify discovery and evidence feasibility

Acceptance: Demonstrate anonymous observation and human login in an Appraise-owned session, origin/target binding, expiry/restart and cross-Journey denial. Establish which receipts can satisfy discovery and execution gates. If unavailable, identify and test a bounded browser prototype before GC0; supplemental host observations are labelled.

Verification: Owned browser fixture with login/restart and secret-canary checks; evidence acceptance negatives.

Likely scope: browser/runtime capsule services; discovery contracts; fixtures.

C0.3 result: **verified bounded feasibility with a production blocker retained** after exact-artifact review. A disposable controlled
browser prototype demonstrated anonymous access, controller-only synthetic login/MFA, Journey/target/origin binding,
redirect/request containment, per-use cross-Journey worker-view denial and fresh sign-in after context replacement, injected expiry,
logout or revocation. Exact canaries were absent from the prototype's bounded in-memory projections, but real human/
IdP authentication, service/process restart and all production secret sinks remain untested. Current discovery
contracts reject malformed/mismatched structure yet accept structurally valid submitter-provided receipt descriptors;
host Browser observations therefore remain supplemental and cannot satisfy trusted discovery evidence. Execution
receipts have independently stronger cycle/TestRun/runtime-byte lineage. See [evidence and exact limitations](evidence/C0.3.md).
Production closure remains C2.3/`C-B04`; no C0.4 or GC0 decision is implied.

### C0.4 — Review feasibility and establish exact implementation gaps

Acceptance: Map all six role contracts and target modes to current operations; enumerate reusable code and missing enforcement. Independently review C0 evidence and the path matrix. Admit GC0 only with a concrete qualified path; bound remaining implementation work and update this register.

Verification: Evidence/source identity review, actual versus proposed behavior table and explicit gate verdict.

Likely scope: C0 evidence; PLAN.md; TASK_REGISTER.md.

### C1.1 — Deliver plugin setup and compatibility diagnostics

Acceptance: Package canonical MCP configuration and workflow skills with a documented local distribution/install path. Diagnose hub, target, authentication and contract version; cover missing/stale plugin, permissions, unavailable marketplace, manual MCP fallback and uninstall. Hooks are optional.

Verification: Package/config tests and fresh install/reconnect smoke; regenerate setup contracts and sync scaffold if affected.

Likely scope: plugin package; MCP setup; diagnostic UI.

### C1.2 — Deliver prepared Journey launch

Acceptance: Extend existing launch to validated encoded deep links and a minimal plugin handoff prompt; preserve one-time ticket scope and redaction. Support local and qualified remote-target host context. Show launch requested until authenticated redemption; offer copy fallback without broad credentials.

Verification: URI encoding/injection, launch failure, expiry/race tests and live Appraise-to-Codex smoke.

Likely scope: handoff service/actions; Journey launch UI.

### C1.3 — Deliver later-stage reconnect and takeover

Acceptance: Extend early-stage-only handoff to explicit resume where lifecycle permits. Reopen a known task or prepare a fresh handoff; reconcile active effects and fence old ownership before takeover. Handle archived/missing tasks, reload and target changes without reusing old approvals.

Verification: Restart/lost-reply/concurrent-redeem tests and live old/new task resume; evaluate GC1 with C1.1–C1.3 evidence.

Likely scope: handoff service; Journey state UI; assignment services.

### C2.1 — Enforce graph claim and submission contracts

Acceptance: Reuse the retained C0.2e admission path; integrate and harden it across eligible roles and normal product flows without rebuilding it as a separate engine. Close remaining C0 gaps in target/principal scope, assignment leases, immutable inputs, full validation, idempotency and atomic commit. Return bounded context and structured recovery instructions from specialized operations. All native MCP/CLI paths enforce equivalent rules.

Verification: Service concurrency, stale/invalid/replay and alternate-client tests; contract checks.

Likely scope: Journey claim/artifact services; canonical schemas; MCP mapping.

Inspection split (2026-09-13): the retained path and the existing role-specific ingress services expose three stable,
independently verifiable responsibilities. Parent C2.1 was verified only after every slice and its exact-artifact
review completed.

| Done | ID     | Task                                                                                                  | Depends on | Status   |
| ---- | ------ | ----------------------------------------------------------------------------------------------------- | ---------- | -------- |
| [x]  | C2.1.1 | Make claim and admission acknowledgement durable, replayable and fenced by exact principal/assignment | GC1        | verified |
| [x]  | C2.1.2 | Enforce shared authority and atomic acceptance through every existing specialized role ingress        | C2.1.1     | verified |
| [x]  | C2.1.3 | Prove canonical MCP/CLI parity, bounded recovery diagnostics and exact-artifact acceptance            | C2.1.2     | verified |

C2.1.1 must preserve the same graph-derived eligibility, authorization, attempt ceiling and transactional active
assignment slot used by managed claims. C2.1.2 must adapt the retained admission authority to the existing Analysis,
discovery, scenario, automation and triage validators rather than introducing a generic artifact mutation or second
workflow engine. C2.1.3 owns generated contract updates through their source workflow, alternate-client/lost-reply
evidence and the independent review. None of these slices evaluates GC2 or authorizes C2.2-C2.7.

### C2.2 — Connect analysis and human question loops

Acceptance: Drive analysis from immutable requirements; persist questions and answers through Appraise, pause at gates and continue only after re-reading decisions. Render truthful activity and accepted artifact status.

Verification: Analysis vertical slice including rejection/revision and stopped Codex task; UI/service tests.

Likely scope: analysis operations; Journey questions UI; plugin workflow skill.

### C2.3 — Deliver scoped discovery and human sign-in

Acceptance: Implement only the qualified browser path; support anonymous and authenticated target discovery, ephemeral scoped sessions, human MFA, revocation and explicit missing-access blockers. Preserve provenance and supplemental-evidence distinction.

Verification: Browser containment, secret redaction and discovery receipt tests plus human-login smoke.

Likely scope: Scout/browser services; discovery UI; scoped session contracts.

### C2.4 — Connect scenario review and revision

Acceptance: Submit exact-version scenario artifacts; support human approve/reject/revise loops. Prevent approval reuse across changed input; describe actual reviewer independence without relying on role names.

Verification: Scenario revision/approval lineage tests and Journey UI smoke.

Likely scope: scenario services; review UI; plugin role guidance.

### C2.5 — Connect automation preparation

Acceptance: Prepare automation through canonical operations/definitions and target-scoped authorization. Preserve generated artifact ownership and distinguish supported automation work from out-of-scope autonomous product-code repair.

Verification: Preparation and target-scope tests; operation conformance and scaffold checks when affected.

Likely scope: preparation services; operation bindings; plugin guidance.

### C2.6 — Connect consent-bound execution and reconciliation

Acceptance: Use existing Appraise runtime capsule reserve/launch/reconcile path. Bind consent to exact inputs; prevent duplicate effects after lost replies; accept only sealed Journey evidence.

Verification: Consent revocation, uncertain launch, duplicate retry and independent-TestRun rejection tests; real bounded runtime.

Likely scope: Journey runtime service; runtime capsule; execution UI.

### C2.7 — Connect triage, remediation and closure

Acceptance: Support failed-run triage, approved remediation, rerun with fresh consent where required, report review, risk acceptance and final closure. Preserve lineage and human decisions; agent final prose has no transition authority.

Verification: Complete anonymous and authenticated Journey demonstrations including revision/rerun; evaluate GC2.

Likely scope: triage/report services; decision UI; plugin workflow.

### C3.1 — Harden pause, cancellation and recovery

Acceptance: Exercise Codex stop/offline/quota, hub restart, MCP lost reply, lease expiry and takeover. Pause admissions and fence results; record observed stop of Appraise-owned processes separately from external Codex activity. Preserve work across human waits.

Verification: Fault injection matrix, late submission and uncertain execution reconciliation; owned process cleanup receipts.

Likely scope: assignment recovery; runtime stop; operational UI.

### C3.2 — Verify data and version compatibility

Acceptance: Test stored pre-change Journeys, active assignments, upgrades, stale MCP schemas, unsupported Codex versions and safe downgrade refusal. Disconnect/uninstall revokes access and preserves data. Exclude experimental provider launch paths from defaults.

Verification: Migration/compatibility fixtures, reinstall and reconnect smoke, package/build checks.

Likely scope: persistence migrations if needed; setup/version diagnostics; packaging.

### C3.3 — Publish operator guidance and release evidence

Acceptance: Synchronize current docs, generated contracts and scaffold where applicable. Verify every path in PLAN sections 3–4 on clean supported installation; document last-activity semantics and manual recovery. Independently review GC3; leave unresolved findings open.

Verification: Focused checks, full relevant build/package checks and final evidence review; no release claim without GC3.

Likely scope: current docs; release fixtures; generated output through source workflows.

## Phase gate register

| Gate | Depends on                | Status        | Acceptance/evidence                                                                                                                                              |
| ---- | ------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GC0  | C0.1–C0.4 including C0.2e | passed        | Feasible live handoff, graph boundary, resume and discovery path; independent verdict; only the user-authorized C0.2e retained slice was implemented before pass |
| GC1  | C1.1–C1.3                 | passed        | [Current-product remote `DISCOVERY` launch, Send, redemption/read, Appraise UI takeover and non-mutating predecessor rejection](evidence/GC1.md)                 |
| GC2  | C2.1–C2.7                 | not_evaluated | Complete anonymous/authenticated lifecycle, revisions, human gates and sealed execution                                                                          |
| GC3  | C3.1–C3.3                 | not_evaluated | Recovery, stored-data/version compatibility, clean install and independent release review                                                                        |

## Qualification gaps and blocker disposition

C-B01 is closed by the combined C0.1 and C1.1–C1.3 installed-host evidence: local and neutral remote contexts, URI
prefill, plugin recognition, prepared launch, authenticated redemption, adverse fallback observations, later-stage
reconnect and explicit takeover. GC0 and GC1 are passed; the stricter end-to-end qualification `GC1-B01` is closed
by the current-product remote `DISCOVERY` trace. C2.1 is verified, C-B02 is closed, and C2.2 is the next eligible
task.

| ID    | Open requirement                                                 | Owner and closure evidence                                                                                            |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| C-B01 | Installed Codex handoff/plugin/local and remote context behavior | Closed by C0.1 / C1.1–C1.3 launch, Send, redemption, fallback and later-stage takeover evidence                       |
| C-B02 | Full Appraise claim/commit enforcement and safe retries          | Closed by C0.2e / C2.1 retained admission, atomic acceptance, negative/concurrent/replay tests and independent review |
| C-B03 | Durable resume, takeover and honest cancellation                 | C1.3 reconnect/takeover closed; C3.1 retains provider/process recovery and owned-stop coverage                        |
| C-B04 | Authenticated discovery and trusted evidence                     | C0.3 / C2.3: login/restart/revocation/cross-Journey and provenance proof                                              |
| C-B05 | Complete lifecycle and release integration                       | C2.2–C3.3: full Journey, compatibility, installation and quality review evidence                                      |

| Historical blocker                  | Disposition in this architecture                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| B0-001 exact provider boundary      | Deferred with managed runtime; no exact host tool/context isolation claim. C-B02 covers Appraise operation authority             |
| B0-002 provider process recovery    | Deferred provider-specific matrix; application recovery remains mandatory as C-B03                                               |
| B0-003 checker false acceptance     | Historical repair remains closed; does not qualify new integration                                                               |
| B0-004 authenticated browser        | Still relevant, re-scoped as C-B04; no claim that plugin fixes it                                                                |
| B0-005 model-visible schema loss    | Preserved finding; exact model schema is no longer the admission invariant. Full server validation remains mandatory in C-B02    |
| B0-006 custom auth/replay interlock | Deferred with interlock; stock Codex owns provider auth/retries. Appraise operation idempotency remains mandatory in C-B02/C-B03 |

Historical G0 remains a no-go for managed-provider admission; G0D was a limited historical development gate. Neither
is a plugin-release gate. Do not resume P0.R2g, create a Codex fork or retrofit old P1–P6 checkboxes to this roadmap.

## Decision/change register

| ID  | Date/authority                  | Decision                                                                                                                                                                                              |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D16 | User, 2026-09-11                | Adopt Appraise-first stock Codex handoff, MCP enforcement and plugin guidance; defer custom managed runtime                                                                                           |
| D17 | D16 implementation planning     | Replace exact provider/tool-schema admission with Appraise-mediated authorization and full canonical validation; explicitly retain external-host trust limits                                         |
| D18 | User, 2026-09-11; future option | Reserve a separately qualified potentially paid/API-backed managed orchestrator; no API necessity, billing model or service delivery assumed                                                          |
| D19 | D16 implementation planning     | Preserve historical documents/evidence; use new C task IDs and GC gates; test feasibility before product implementation                                                                               |
| D20 | User, 2026-09-12                | Authorize retained production-intended external Analyzer admission under C0.2e before GC0; disposable qualification data, explicit opt-in, no normal-flow enablement or C1 work; C2.1 reuses the code |

## Active handoff

- Completed scope: C0.1, the original C0.2 negative qualification, and C0.2e.1–C0.2e.4. Independent exact-artifact re-review accepted C0.2e.
- 28 focused tests passed across four suites, including real POST authentication rejection with subsequent valid redemption.
- Human observations cover local/remote handoffs, URI encoding/workspace, installed skill recognition, missing plugin/marketplace, protocol denial, unsent composer and natural expiry.
- Exact artifacts, limitations and resource disposition: [C0.1 evidence](evidence/C0.1.md).
- C0.2 remains verified as bounded negative qualification. C0.2e has now demonstrated retained external Analyzer
  admission, live canonical submission, lost-acknowledgement readback/replay, invalid/cross-target/stale-owner
  rejection, required-question publication rejection, and fresh-task replacement after restart. Later cross-role,
  default-flow and claim-acknowledgement hardening remains under C2.1/C-B02.
- C0.2 interruption fixtures are retained at `REPLACEMENT_REQUESTED`, attempt 2, without accepted Analysis artifacts.
  The fresh session diagnosed, read and resumed both elapsed replacements before retry; no third claim was made and
  owner tokens remain unrecorded.
- C0.3 is verified as a bounded feasibility/negative-production result after exact-artifact review. It does not qualify a
  production human-authenticated browser or trusted discovery receipt; `C-B04` remains open for C2.3.
- Completed task: **C0.4**, verified after exact-artifact review. Its evidence supports GC0 without closing any C1–C3
  implementation blocker.
- GC0 and GC1 passed. **C1.1, C1.2 and C1.3 are verified after independent exact-artifact review**. GC1's first
  [usable-handoff evaluation](evidence/GC1.md) returned `REVISE`; the current-product remote `DISCOVERY` launch,
  Send, redemption/read, takeover approval and predecessor rejection trace closed `GC1-B01`. C2.1 is eligible and
  `pending` and unstarted. C-B01 and the C1.3 portion of C-B03 remain closed within their recorded
  implementation scope.
- Preexisting dirty experiments remain preserved; no commit or release is claimed.

### C0.1 findings carried forward

- C1.2 delivered explicit local/neutral-remote host context, preserved normalized URL target identity, removed
  requirement content from URI prompts, and made authenticated redemption the connection-display boundary.
- C1.1: disposable skill-only plugin recognition does not qualify production plugin/MCP provisioning.
- C0.2/C2.1: handoff redemption is connection-only evidence, never a role claim or authority to commit. Fresh authoritative state and independently enforced principal/revision/lease checks remain required before work admission. Existing redemption does not revalidate requirement revision; the passing characterization test records this gap.
- C1.2 corrected incorrect-project-fingerprint rejection to the bounded `409 CONFLICT` project-identity envelope and
  retained proof that rejection does not consume the ticket.
