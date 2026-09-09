# Managed Quality Journey Coordinator — Task Register

Specification: [development plan](PLAN.md). Status baseline: 2026-09-09. No implementation tasks are complete.

## Operating instructions

Read the progression rules in the plan before starting. Work in dependency order within the user's requested scope.
Mark one bounded task `in_progress`, implement it, verify its acceptance, record evidence, then mark it `verified` and
check its box. A phase gate must pass before the next phase begins. Do not infer implementation authorization from
a request to save these documents.

Allowed task statuses: `pending`, `in_progress`, `blocked`, `in_review`, `verified`. Only `verified` uses `[x]`.
Evidence references start as `—` because no implementation checks have run. Gate status starts as `not_evaluated`.

## Master task register

| Done | ID   | Task                                             | Dependencies     | Status  | Evidence |
| ---- | ---- | ------------------------------------------------ | ---------------- | ------- | -------- |
| [ ]  | P0.1 | Establish protocol and source baseline           | None             | pending | —        |
| [ ]  | P0.2 | Qualify effective worker boundaries              | P0.1             | pending | —        |
| [ ]  | P0.3 | Qualify process and session recovery             | P0.1             | pending | —        |
| [ ]  | P0.4 | Review feasibility and browser enforcement       | P0.2, P0.3       | pending | —        |
| [ ]  | P1.1 | Define runtime contracts and persistence         | Gate G0          | pending | —        |
| [ ]  | P1.2 | Implement Start grant and singleton ownership    | P1.1             | pending | —        |
| [ ]  | P1.3 | Implement outbox/inbox and dispatch protocol     | P1.1, P1.2       | pending | —        |
| [ ]  | P1.4 | Implement renewal and fenced scheduling          | P1.2, P1.3       | pending | —        |
| [ ]  | P1.5 | Add runtime API and CLI entrypoint               | P1.3, P1.4       | pending | —        |
| [ ]  | P2.1 | Implement qualified Codex adapter and login      | Gate G1          | pending | —        |
| [ ]  | P2.2 | Implement scoped artifact/question gateway       | P2.1             | pending | —        |
| [ ]  | P2.3 | Connect managed requirement analysis             | P2.2             | pending | —        |
| [ ]  | P2.4 | Deliver Start and analysis status UI             | P2.3             | pending | —        |
| [ ]  | P3.1 | Version Scout authority and session grants       | Gate G2          | pending | —        |
| [ ]  | P3.2 | Implement isolated browser observation           | P3.1             | pending | —        |
| [ ]  | P3.3 | Implement human target login and expiry          | P3.2             | pending | —        |
| [ ]  | P3.4 | Connect Scout and resource discovery             | P3.2, P3.3       | pending | —        |
| [ ]  | P3.5 | Verify authenticated discovery containment       | P3.4             | pending | —        |
| [ ]  | P4.1 | Connect scenario design and revision gates       | Gate G3          | pending | —        |
| [ ]  | P4.2 | Connect scoped automation preparation            | P4.1             | pending | —        |
| [ ]  | P4.3 | Connect consent-bound managed execution          | P4.2             | pending | —        |
| [ ]  | P4.4 | Connect triage, remediation and closure          | P4.3             | pending | —        |
| [ ]  | P5.1 | Complete restart and uncertain-effect recovery   | Gate G4          | pending | —        |
| [ ]  | P5.2 | Complete cancellation and orphan handling        | P5.1             | pending | —        |
| [ ]  | P5.3 | Persist provider waits and event recovery        | P5.1             | pending | —        |
| [ ]  | P5.4 | Add limits, pause controls and diagnostics       | P5.2, P5.3       | pending | —        |
| [ ]  | P5.5 | Run adversarial and full lifecycle qualification | P5.4             | pending | —        |
| [ ]  | P6.1 | Retire external coordination and legacy adoption | Gate G5          | pending | —        |
| [ ]  | P6.2 | Package the macOS user service                   | P6.1             | pending | —        |
| [ ]  | P6.3 | Define update/downgrade and data preservation    | P6.2             | pending | —        |
| [ ]  | P6.4 | Synchronize docs, contracts and scaffolds        | P6.1, P6.2, P6.3 | pending | —        |
| [ ]  | P6.5 | Verify clean installation and release readiness  | P6.4             | pending | —        |

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

| Gate | Required tasks | Exit criterion                                                                                                                                                 | Status        | Evidence |
| ---- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- |
| G0   | P0.1–P0.4      | Every required role boundary has a viable proven enforcement path; process ambiguity has safe outcomes; independent feasibility review accepts the exact proof | not_evaluated | —        |
| G1   | P1.1–P1.5      | Fake-provider runtime survives restart with fenced ownership, idempotent effects and no unauthorized scheduling                                                | not_evaluated | —        |
| G2   | P2.1–P2.4      | Real Codex analysis works wholly through AppraiseJS with questions/reviews and truthful status                                                                 | not_evaluated | —        |
| G3   | P3.1–P3.5      | Anonymous/authenticated discovery is operational, scope-enforced and independently reviewed                                                                    | not_evaluated | —        |
| G4   | P4.1–P4.4      | Complete Journey, revision, remediation/rerun and closure paths preserve all existing gates                                                                    | not_evaluated | —        |
| G5   | P5.1–P5.5      | Fault/adversarial matrices and exact-artifact review establish release-level recovery and containment                                                          | not_evaluated | —        |
| G6   | P6.1–P6.5      | Clean macOS installation and full workflow pass; external coordination retired; docs/scaffolds/checks match final artifact                                     | not_evaluated | —        |

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

No implementation blockers have been observed because implementation has not begun. Phase 0 feasibility is unproven,
not passed. Add actual blockers here rather than treating anticipated risks as test results.

| ID  | Task/gate | Observed failure and reproduction | Impact | Required unblock evidence | Status |
| --- | --------- | --------------------------------- | ------ | ------------------------- | ------ |

## Decision/change register

| ID  | Decision                                                        | Authority/date                                              | Effect                                           |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| D01 | Quality Journey first; complete lifecycle                       | User, 2026-09-09                                            | General coding coordination excluded             |
| D02 | Codex first; local service; macOS first                         | User, 2026-09-09                                            | Other providers/platforms deferred               |
| D03 | Deterministic workflow engine                                   | User, 2026-09-09                                            | Models cannot select lifecycle transitions       |
| D04 | Full replacement; no active external migration                  | User, 2026-09-09                                            | Preserve history but no dual ownership           |
| D05 | Explicit Start and local provider login                         | User, 2026-09-09                                            | No work on confirmation or billing fallback      |
| D06 | Authenticated Scout with human sign-in                          | User, 2026-09-09                                            | Add broker/grants; no automated password login   |
| D07 | One AI slot, existing attempt limits, 30-minute active deadline | Planning defaults recorded in the proposed plan, 2026-09-09 | Show limits before Start; no automatic increases |
| D08 | Required-boundary failure blocks release                        | Existing authority contract and feasibility recommendation  | No invented attestations or weakened gates       |

Record later approved changes with their exact user direction, affected tasks/contracts, invalidated evidence and
replacement acceptance criteria. Distinguish explicit user choices from planning defaults.

## Active handoff

- Current phase: Phase 0, not started.
- Current task: none.
- Next eligible task: P0.1, when implementation is requested.
- Completed implementation tasks: 0 of 32.
- Latest gate: none evaluated.
- Runtime/processes started by this plan: none.
- Known unrelated worktree change at plan creation: `package-lock.json`; preserve it.
- Next action: reverify the current repository/provider baseline and begin P0.1 within an implementation request.

### Handoff update checklist

Before stopping an implementation session, record the active task/status, branch and exact diff identity, completed
checks, failing checks/blockers, owned runtime identities, gate state, and the next executable action. A successor
must inspect current files/processes before resuming; this record is a handoff aid, not live execution proof.
