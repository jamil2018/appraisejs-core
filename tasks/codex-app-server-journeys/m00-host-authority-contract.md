# M00: Local app-server host and authority contract

Date: 2026-10-13. Revision: M00-r3. Status: **proposed; awaiting exact-contract approval**.
Direction is accepted in [ADR-0005](../../docs/decisions/0005-codex-app-server-journeys.md). The user agreed to D01–D04 and the D05 defaults on 2026-10-13 and requested this exact revised contract for approval. Choice agreement authorizes this documentation revision; final M00-r3 artifact acceptance remains pending.
This document specifies future behavior. It does not describe an implemented or qualified host.
M00 documentation/source review is prepared; independent review is recorded separately; M01–M13 and U00–U10 remain unstarted.

## Initial scope and explicit exclusions

Propose `APP_SERVER_LOCAL_V1` as a host-mode label, separate from attempt admission protocol `EXTERNAL_V1`.
The initial candidate is one local Appraise hub, one explicitly selected target, macOS arm64, private stdio JSONL,
and the official bundled `codex-cli 0.162.0-alpha.17.2`. Read-only inventory observed macOS 27.0.1
(build 26A434), arm64, and that CLI version on this date. This is a feasibility candidate, not a supported release.
No binary was installed, upgraded, authenticated, or launched as app-server. No build is presently qualified.
M01 must record resolved executable, binary SHA-256, OS/build/architecture, protocol/schema and effective config
hashes; M02 adds effective tool and containment evidence. Only that exact tuple can enter the allowlist.
Updates, alternate builds and changed security configuration require requalification; version ranges, PATH fallback,
preview thresholds and desktop inventory do not confer support. Linux, Windows, Intel macOS, WSL, remote services,
containers and commercial/hosted provider-auth use are outside this initial candidate scope.

Propose human-initiated local Codex-managed ChatGPT sign-in in isolated Appraise-owned provider state, available only
through an explicit setup action after authorization for a later live slice. Do not copy ambient Codex auth/config,
plugins, MCP registrations, skills, repository instruction files, shell environment or credentials into a worker.
No API-key, external-token, BYOK or subscription-to-paid fallback is included. Account access, model entitlement,
refresh behavior, plan limits and costs remain unverified. Authentication expiry/revocation parks work and fences
capabilities; reconnect does not launch a turn or silently transfer ownership. Provider sign-in and target-site
Discovery/runtime authentication are distinct; Discovery login never supplies run authentication or consent.

The trusted provider runtime needs provider credentials, but the model/tool worker must have no credential-file,
environment or arbitrary process access. This is a required separation, not a claim that the observed build provides
it. M02 must establish it with effective-host evidence; inability to isolate provider state blocks this composition.
Auth/setup metadata exposed to the UI is bounded and sanitized; never persist tokens, callbacks, cookies, MFA data or
raw account payloads in Journey artifacts/logs. Provider-local history must be isolated per attempt, inaccessible to
other workers, bounded and cleaned by the supervisor. The retention policy below is agreed for this proposed revision; implementation and cleanup evidence remain pending.

The [official app-server documentation](https://learn.chatgpt.com/docs/app-server) describes the protocol and
required-MCP startup failure; its current auth guidance restricts app-server authentication to local/open-source use
and recommends Sign in with ChatGPT. This review chooses a local feasibility scope only; a distribution/commercial
auth route must be separately decided before packaging. Documentation is not exact-build observation.

## Mode selection, compatibility and transfer

Default behavior remains existing external/legacy behavior. Managed hosting is explicit opt-in for newly created,
mode-selected disposable/internal Journeys after M00 approval and subsequent authorized feasibility work. M06–M07
are internal proof; user-facing opt-in requires M11 core crash/recovery and applicable M02/M12 containment/install
checks. UI removal of desktop setup cannot manufacture readiness. Existing mode and effective owner bindings remain
unchanged. Never blanket-backfill old `MANAGED` or `EXTERNAL_V1` attempts from their names; these are admission paths,
not evidence of current host ownership. Mixed/missing ownership needs explicit recovery.

Selection of a hosting mode is not permission to spend, sign in, claim work or execute tests. Canonical requirement
confirmation/explicit start and existing stage eligibility create work; the trusted supervisor may dispatch only
currently eligible, authorized work. Human waits create zero model turns. Availability never switches mode.
Transfer requires an explicit human decision at a quiescent, reconciled boundary, atomic predecessor fencing,
retained attempt budgets and immutable lineage. Unknown dispatch/tool/cleanup effects block transfer and rollback.
No dual writers, automatic desktop fallback, reset of approvals, new attempts merely to evade ceilings, or deletion of
historical Journeys, consents, interruptions, sealed evidence or provider records. GC3 remains **REVISE / not passed**.

## Authority chain and external admission mapping

1. Appraise services determine Journey/target, exact frozen inputs, eligible role, current authorization and budget.
2. A trusted supervisor obtains a current host-neutral coordinator session and generation before any managed claim.
   It claims one eligible WorkAttempt through the existing role-neutral external claim service, using one durable
   idempotency identity and privately retained assignment secret; it then admits that same assignment via the
   external admission service. This composes existing services, not a parallel lifecycle graph.
3. Keep `executionMode=EXTERNAL_V1`, `PROJECT_CREDENTIAL_ONLY` principal assurance and
   `hostIsolation=NOT_ATTESTED` in existing admission receipts. They do not attest host, named role, reviewer identity
   or sandbox. Separate exact-build qualification records can describe observed containment; do not rewrite receipts.
4. Only after admission and durable dispatch intent may the supervisor start a bound provider thread/turn. Provider
   handles are correlation, never authority. Child lifetime (per-turn resume versus persistent) remains M05 scope.
5. The worker receives frozen role inputs and one role/attempt-scoped MCP capability. The gateway supplies trusted
   target/Journey/principal, session, assignment, lease and secret fields; model-supplied overrides are rejected.
   Broad project bearer, assignment secret and coordinator credentials stay outside model-visible arguments/prompts.
6. Role-specialized external submissions invoke the existing canonical validators and acceptance transactions.
   Agent output schemas and `COMPLETED` envelopes are proposals; only persisted accepted artifacts and service-owned
   state changes determine completion. Human decisions still bind exact artifacts/revisions through Appraise forms.

The current `managed-worker-gateway.ts` is useful schema/principal-binding machinery, but its role map points at
legacy managed operations. Those reject external attempts; neither changing names mechanically nor bypassing Factory
validation qualifies it. M02 must build/test a distinct external registration profile from canonical MCP schemas,
including required fields, hidden trusted bindings, deterministic schema hashes and missing/extra tool rejection.
The full public MCP is a trusted coordinator surface and must never be given to a worker.

M02 disposable protocol/gateway/containment observations are provisional, not complete authority qualification.
They must not enable product managed dispatch or rely on the legacy no-session allowance as a passing result.
M03 must re-probe claim, admission and all six specialized submissions with missing, stale and valid host sessions,
including pre-first-takeover and concurrent pause/takeover cases, before M04+ product dispatch can be eligible.
M02 probes may exercise legacy services only as explicitly labeled provisional fixtures, never as host admission.

## Session generation, stale calls and unknown outcomes

Require a non-null current host-session ID and coordinator generation even before first takeover. Today
`assertCurrentCoordinatorSession` returns when no effective takeover exists and recovery permits absent session
credentials. These legacy allowances must not admit a managed host; M03 supplies a mandatory host-neutral fence
without changing historical records in M00. Do not fabricate a desktop handoff ticket to represent a local supervisor.

Keep coordinator/session generation, assignment generation and transport generation separate. Bind every gateway
capability/read/new write to hub, project/target, Journey, role, WorkItem, WorkAttempt, assignment generation, current
session generation, authorization, lease, input/scope hash and expiry. Gateway checks cannot replace rechecks inside
claim/admission/submission transactions. Recheck after asynchronous artifact/evidence I/O; concurrent pause/takeover
must win against any later effect. Fenced generations and late provider events cannot revive authority.

On pause/revoke fence new effects first, then interrupt the owned turn and reconcile canonical acceptance. A stopped
turn, exited child, sealed evidence and accepted output are distinct observations. Lost start acknowledgement stays
unknown unless non-start is proved; no automatic resend. Lost submission reply uses the exact external outcome
lookup/operation identity before replay. Historical committed-outcome disclosure may authenticate the original
assignment without granting fresh write authority, as existing services do; the supervisor owns this reconciliation
path after capability revocation. A worker cannot use a stale binding to read another attempt or write anew.
Never kill a persisted PID; process cleanup requires a live owned handle. Unknown ownership/effects block replacement.

## Six-role payload and MCP boundary review

All submissions retain canonical strict schemas and frozen assignment/input/scope checks. Common external fields
include Journey/target, work/attempt, assignment ID/generation, lease, secret and idempotency identity; trusted fields
are injected by the gateway. Role-specific payloads below remain model proposals. Read projections must strip secrets
and restrict artifacts to the frozen assignment; broad `*_get` or `operation_search` results need scoped adapters.
Outcome lookup is supervisor-owned and assignment-authenticated, not a generic worker read surface.

| Role                   | Frozen readable scope and proposed worker tools                                                                                                       | External write operation and canonical payload                                                                                          | Acceptance and retained human boundary                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQUIREMENT_ANALYZER   | Requirement snapshot, prior charter, exact Q&A/feedback; scoped `quality_journey_analysis_get`                                                        | `quality_journey_external_analyzer_analysis_submit_v1`: `charter`, optional predecessor Analysis revision                               | Strict charter/questions and requirement traceability; unresolved required questions block publication/approval. Answers and exact Analysis approval are human forms.                                                           |
| SCOUT                  | Approved Analysis and Discovery scope; scoped `quality_journey_discovery_get`; Appraise-issued browser receipts only                                  | `quality_journey_external_scout_target_observation_submit_v1`: Discovery revision, expected input/scope hashes, observation `bundle`    | Each fact binds sealed `APPRAISE_DISCOVERY_BROWSER_V1` receipt, target/snapshot/environment/route. No worker browser/native network; missing access parks work for the human panel.                                             |
| RESOURCE_EXPLORER      | Approved Analysis and frozen catalog/resource IDs/hashes; scoped Discovery read and `operation_search`                                                | `quality_journey_external_resource_explorer_resolution_submit_v1`: Discovery revision, expected input/scope hashes, resolution `bundle` | Stable visible resource IDs, explicit compatibility gaps, no target browsing or catalog mutation. Discovery lanes remain independent.                                                                                           |
| TEST_SCENARIO_DESIGNER | Approved Analysis plus exact paired Discovery lanes; scoped `quality_journey_scenarios_get`                                                           | `quality_journey_external_scenarios_submit_v1`: expected input/scope hashes, `portfolio`, worker `result`                               | Canonical portfolio/graph/coverage validation; exact human scenario decisions and limited unchanged-content carry-forward remain required. No materialization or approvals.                                                     |
| AUTOMATOR              | Exact approved scenario revisions and frozen resources; scoped `operation_search`, supplied assignment inputs                                         | `quality_journey_external_automator_materialize_v1`: expected input/scope hashes, `scenarios`, worker `result`                          | Canonical suites/cases/Step Invocations/prepared capsule receipts only; frozen operation/ready Step Definition binding. No source/generated-wrapper writes, product repair, execution or implicit consent.                      |
| TRIAGER                | Exact sealed Journey cycle/TestRun binding, approved intent and scoped evidence; `quality_journey_triage_get`, `quality_journey_triage_evidence_read` | `quality_journey_external_triage_submit_v1`: canonical report submission with frozen evidence/revision bindings                         | Findings and coverage bind sealed receipts; independent TestRuns are ineligible. Human report revision, scoped correction approval, fresh rerun consent where canonically required and closure/risk acceptance remain separate. |

No worker receives claim/admit, handoff/redemption, generic command/complete-work, pause/resume, authorization,
review/consent/closure, execution start, repository collaboration/export, general locator/catalog mutation, or
cross-role tools. Abstract role permission `automation.write` means the specialized Appraise materialization service,
never filesystem permission. A role contract or prompt alone cannot enforce this boundary.

## Host containment and no-chat contract

Explicitly deny worker repository writes for every role: target/product source, `.git`, generated `automation/`,
scaffold templates and service/schema/config files. Also deny direct repository/DB/credential reads, arbitrary shell,
file editing, native browsing/web search, ambient MCPs/plugins/skills and direct coordinator HTTP. Give workers only
Appraise-supplied frozen data and the scoped MCP endpoint. Provider transport may reach its authorized provider and
that endpoint; this is not worker arbitrary network permission. Temporary provider state is owned by the supervisor,
never an editable target workspace. OS/process/native-tool containment must be proved independently in M02.
Read-only sandbox config, `approvalPolicy=never`, required MCP or empty `mcp_servers` alone is insufficient.
Unexpected approval, user-input or MCP elicitation requests are denied/cancelled using the qualified protocol and
become typed blockers; inability to deny safely stops/fences the run. Never grant permissions automatically.

No direct user-agent chat: questions are accepted structured Analysis artifacts rendered in Appraise answer forms;
committed exact-version answers/revision feedback create eligible follow-up work. Reviews, protected access, execution
scope/permission/start, report/correction/closure and recovery use existing typed controls. Provider text, reasoning,
stdout, diffs, turn-completion and prototype navigation cannot grant authority or advance the active task.
Sanitized activity may update operational status only; the single task projection must reread coherent canonical
state, preserve pinned reviews/drafts, reject stale/out-of-order observations and disable revoked actions immediately.
Polling is the initial UI observation mechanism. No UI implementation or U00 fixtures are included in M00.

## D05: Agreed initial operating and retention defaults

These limits apply to future `APP_SERVER_LOCAL_V1` work in the initial scope, not the repository-development harness,
existing historical attempts, provider account defaults or test-execution runtime. They are agreed design defaults;
none is implemented, measured or qualified by M00. M04–M05 must persist and enforce them; M11 must verify failure,
recovery and cleanup behavior. Changing them requires explicit scoped guidance and a versioned configuration record.

| Setting                                    | Initial default                                                                                                                                                 | Required boundary behavior                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model/configuration                        | Explicit `gpt-6.1-sol`, medium reasoning, for all six roles in the initial feasibility baseline                                                                 | Record requested and returned model identity, reasoning, executable/protocol/config digests; no automatic model/provider substitution or entitlement inference. Changed model/configuration needs requalification of affected capabilities.                                                          |
| Provider concurrency                       | One active provider turn per hub                                                                                                                                | Queue other eligible work durably; serialize starts across supervisors. Do not issue speculative parallel starts. Each attempt has its own isolated thread/history; never reuse another role's context.                                                                                              |
| Lease / heartbeat                          | 120-second lease; renew every 40 seconds                                                                                                                        | Use canonical lease/current-generation checks. Renewal cannot revive expired/revoked authority; fence on expiry and reconcile before replacement.                                                                                                                                                    |
| Initialization/start acknowledgement       | 60-second maximum per request                                                                                                                                   | Initialization failure blocks startup. Lost start acknowledgement after send remains unknown until non-start or the original run is proved; correlation IDs/timeouts do not authorize resend.                                                                                                        |
| Turn duration                              | 15-minute maximum per turn, measured from the supervisor's durable start/send boundary                                                                          | Fence new effects, request interruption through the owned handle and reconcile acceptance/outcome; restarting transport does not reset this limit. Timeout alone does not prove physical stop or permit a replacement.                                                                               |
| Turns per attempt                          | At most three provider turns, including the initial turn and corrections                                                                                        | Corrections require confirmed rejection without acceptance, current assignment/session/lease authority and remaining budget. Reconcile unknown submissions first. An accepted artifact or human wait ends this worker activity; no extra continuation to spend unused turns.                         |
| Attempts                                   | At most three for the initial work authorization, or a lower canonical ceiling/remaining budget                                                                 | Enforce the stricter local and canonical remaining ceilings; preserve consumed budgets and takeover lineage. Do not rewrite historical authorizations, create duplicate attempts or reset limits to obtain more turns.                                                                               |
| Human waits                                | Zero provider turns                                                                                                                                             | Park after accepted structured questions/blockers; only committed canonical answers/decisions and eligible authorized work can trigger later dispatch.                                                                                                                                               |
| Authentication/quota failure               | Park with actionable setup/retry status                                                                                                                         | No repeated model-call retry loop, automatic billing/model fallback or silent account switch. Any later retry rechecks authority and resolves uncertain prior effects first.                                                                                                                         |
| Reconciled terminal provider-local history | Delete within 24 hours after terminal outcome and owned effects are reconciled                                                                                  | Isolate provider-local transcripts/rollouts per attempt; supervisor-only access. Persist bounded sanitized acceptance/cleanup receipts, not raw history, in Appraise.                                                                                                                                |
| Unresolved provider-local history          | Retain for at most seven days from the earliest durable provider intent that may have created this attempt's history before a human retention/recovery decision | At the deadline stop automatic retention/continuation and require an explicit scoped retention or safe cleanup decision. Restart/new observations cannot reset the deadline. Without a decision, keep work fenced and surface overdue cleanup; do not claim successful deletion or resolved effects. |
| Canonical artifacts/history                | Existing lifecycle retention and immutability rules                                                                                                             | Provider cleanup never deletes or resets Journey history, approvals, consents, interruptions, sealed evidence, attempts or outcome/provider-run records, and never resolves an unknown outcome.                                                                                                      |

For unresolved history, use the earliest durable provider launch/thread/turn intent that could have created this
attempt's history, or an earlier trusted creation timestamp. Discovery of uncertainty, later outcome recording,
restart or another turn cannot move that clock forward. Recovery must check the original deadline before any resume;
if elapsed, immediately require the retention/recovery decision. If no trustworthy conservative timestamp can be
established, treat retention as overdue and keep work fenced pending that decision.

The seven-day rule is an escalation deadline, not a promise that raw history is automatically erased despite unknown
process ownership. A human retention decision must name the exact attempt, reason and bounded extension; safe cleanup
requires owned-effect/cleanup reconciliation. Unresolved access or deletion failure remains a visible blocker, never
an indefinite automatic extension or permission to relaunch. Provider authentication state is separate from per-attempt
history: cleanup must not copy/expose credentials, and sign-out/revocation remains an explicit controlled path.

A provider turn can contain multiple model/tool requests. Turn, attempt, concurrency and duration caps do not establish
a hard token or monetary ceiling, nor prove that interruption immediately stops provider billing. Collect usage per
accepted artifact and expose actual limits; quota exhaustion parks work. Model-list presence is not entitlement proof.
Exact-build feasibility and live enforcement evidence are still required before any supported-runtime claim.

## Source evidence and qualification obligations

Reviewed base: `8d4be5c83597bb17ac756f98502738db8a69d344` on the shared migration branch.

- `src/lib/quality-journey/role-definitions.ts`, `contracts.ts`, and role-specific Analysis/Discovery/Scenario/
  Automation/Triage contracts: six role definitions, output authority and schema boundaries.
- `src/services/coordinator/quality-journey-service.ts`: external claim/admit, exact assignment authentication,
  accepted-submission replay, completion and attempt ceilings; coordinator session/handoff/recovery services:
  existing takeover and transaction fences, historical replay versus new-effect distinction.
- `src/services/coordinator/quality-journey-{analysis,discovery,scenario,automation,triage}-service.ts`,
  triage-evidence, execution, execution-consent and closure services: specialized external payloads, frozen inputs,
  browser receipts, exact decisions, sealed run evidence and closure remain Appraise-owned.
- `src/lib/quality-journey/managed-worker-gateway.ts` and
  `packages/appraisejs/src/mcp/{contract.ts,domains/quality-journey.ts,domains/quality-journey-triage.ts}`:
  legacy gateway mismatch and canonical external operation inventory. Public MCP breadth is not a worker boundary.
- [Pinned Open Design map](open-design-reference.md), revision `014bffbf775f4514020cef8bbffdc0eb5a0009ce`:
  architecture, agent-adapters and Codex definition read directly. Useful daemon ownership/version selection;
  upstream workspace-write/network and permissive fallback defaults are excluded. No upstream code copied or tests run.
- [UI plan](../quality-journey-transition-ui/plan.md) and [wireframe guide](../quality-journey-transition-ui/wireframes/README.md):
  one canonical task and structured forms; illustrative screens are guidance, never qualification.

M01–M02 must test actual-binary protocol/required-MCP failures, usable six-role schemas and scoped reads/submissions,
forged scope/generation/secret, missing session before takeover, human-decision denial, native tool/filesystem/network
escapes, auth isolation/revocation and absent artifacts. M03–M04 must prove concurrent fencing, retained history,
claims and durable dispatch. M11 must prove unknown/restart/pause/lost-ack reconciliation; M12 must prove clean install,
mode transfer and rollback. This contract alone satisfies none of those gates.

## D01–D05 agreement and exact-contract approval boundary

The user agreed to these choices and requested M00-r3 documentation, independent review and local commits only.
That agreement does not accept unseen final bytes, authorize M01 or qualify any host property.

| ID  | Agreed choice recorded in this revision                                                                                                                      | Remaining implementation/qualification obligation                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | One local hub/target; macOS arm64; macOS 27.0.1 build 26A434 / CLI 0.162.0-alpha.17.2 as the first feasibility candidate; private stdio                      | M01 pins actual binary/protocol/config; M02 and M03 establish effective boundaries. No build is currently supported.                                                                  |
| D02 | Explicit human local Codex ChatGPT sign-in; isolated Appraise-owned provider state; no ambient credential copy or API/BYOK/external-token fallback           | Prove provider-versus-worker credential isolation and revocation. Local personal feasibility only; distribution eligibility/auth route requires separate resolution before packaging. |
| D03 | `APP_SERVER_LOCAL_V1` host label; retained `EXTERNAL_V1` admissions and immutable NOT_ATTESTED receipts; mandatory current session before first claim        | M03 implements host-neutral binding and missing/stale/valid transaction re-probes, preserving legacy ownership/history.                                                               |
| D04 | Frozen inputs and scoped role MCP only; denied worker repository writes/direct repository/DB/credential reads/native tools/arbitrary network/human decisions | M02 must demonstrate containment and usable schemas. If infeasible, return for a scope/build decision; never weaken the boundary silently.                                            |
| D05 | The numerical model/config, concurrency, lease, acknowledgement, duration, turn/attempt, quota and history defaults above                                    | Persist/enforce limits in later authorized slices; demonstrate recovery/privacy/cleanup. No hard spend guarantee.                                                                     |

M00's approval checkbox stays open until the user explicitly accepts the exact reviewed M00-r3 artifact.
Independent engineering review and a local commit do not supply approval. Approval settles this design only and does
not authorize M01 or live work; each next slice still needs bounded user instruction. Historical lifecycle authority
and GC3 REVISE / not passed remain unchanged. See [continuation](CONTINUE-HERE.md) and [review evidence](m00-review-evidence.md).
