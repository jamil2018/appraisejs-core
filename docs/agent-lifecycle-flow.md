# Agent Lifecycle Flow

Quality Journey is AppraiseJS's sole agent-enabled quality authority. A Journey owns requirement intake, analysis,
discovery, scenario approval, materialization, execution consent, sealed evidence, triage, report review, remediation,
reruns, and closure. Only a Journey decision or closure is a quality outcome.

Structured UI intake may create a mutable, project-scoped `QualityJourneyDraft`, but a draft is workspace content,
not lifecycle authority. Draft edits, archive/restore, and review preparation create no Journey work, events, or AI
activity. Confirmation consumes the exact saved draft version and normalized requirement hash in one transaction:
it creates the immutable requirement revision, submits the requirement through the canonical command boundary,
issues the normal Analysis work item, and marks the draft confirmed. A failed or stale confirmation rolls back without
leaving an intake Journey, and an exact retry returns the same Journey.

The guided UI requires a complete brief before confirmation while the canonical requirement API and MCP contract
remain objective-only compatible. Draft ownership is always resolved from the active project; drafts are workspace
records rather than private per-user records. Confirmed drafts are immutable, and archive is recoverable rather than
destructive.

A Codex handoff connects a harness-native coordinator to that Journey; it does not transfer transition authority,
create an alternate Analyzer, claim work, or bypass questions and human review gates. Appraise-prepared deep links
prefill a minimal ticket/identity prompt in a validated local or neutral host context. Opening the URI and user Send
remain distinct from authenticated redemption and authoritative state reads.

## Journey presentation and observation

The default experience groups canonical lifecycle state into six presentation stages: **Your brief**, **Test
approach**, **Test scenarios**, **Test preparation**, **Run tests**, and **Results**. This mapping and the derived next
action are presentation-only; they do not grant permissions or replace canonical stages, revision identities,
commands, or approval gates. IDs, hashes, Runner nodes, attempts, receipts, and internal event names remain available
under technical details.

Journey pages observe a compact project-scoped status snapshot every ten seconds while visible. Observation never
silently replaces editable answers, feedback, scenario choices, or consent inputs. When canonical state advances, the
page reports that a newer version is available and requires an explicit load before any exact-version decision.
Polling stops after closure, prevents overlapping reads, preserves the last known snapshot on failure, and backs off
to at most sixty seconds. The manual **Check for updates** control uses the same observation boundary.

Agents must use the dedicated `quality_journey_*` coordinator operations for lifecycle transitions. Work leases,
artifact hashes, review decisions, execution-cycle identities, and evidence receipts are exact Journey-scoped
authority. Chat approval and generic TestRun completion do not replace these gates.

During Discovery, anonymous and authenticated target observation use the Appraise-owned scoped browser panel. The
panel launches a headed, non-persistent browser context bound to the active Journey, target, discovery revision,
Scout work item, environment, frozen route and exact target origin. Password, SSO and MFA entry occur only in that
target browser; no Appraise action accepts credentials, cookies, storage state or arbitrary script. Expiry, logout,
revocation and context replacement close the context, while process restart invalidates every process-local session.
Missing access creates an explicit Journey blocker. A later human access confirmation records only local access and
does not identify a natural person or attest an identity-provider assertion.

Only an immutable `APPRAISE_DISCOVERY_BROWSER_V1` artifact can back a Scout observation. The specialized Scout
submission transaction resolves every descriptor and verifies its exact hash, issuer, Journey, target, cycle,
discovery revision, work item, snapshot, route, environment, access outcome and Appraise-derived observation fact
before persistence. Host-browser notes and screenshots remain supplemental and cannot satisfy this boundary.

Independent Test Runs remain available for authoring feedback, execution diagnostics, and debugging. They have
`intent=INDEPENDENT`, carry no Journey execution binding, and cannot supply Journey evidence, triage, decisions, or
closure. Journey-created Test Runs have `intent=QUALITY_JOURNEY` and require their exact
`QualityJourneyExecutionTestRun` binding.

The removed Quality Plan and Assessment routes, operations, resources, and aliases are unavailable. Requests receive
ordinary not-found behavior; there are no redirects, compatibility projections, imports, or data-preservation paths.
Development databases that contain the unreleased removed schema must be reset.

The opt-in `EXTERNAL_V1` admission contract is an Appraise operation boundary, not an assertion about an external
host. It uses a route-derived `PROJECT_CREDENTIAL_ONLY` principal plus a caller-held assignment secret and applies to
the eligible Requirement Analyzer, Scout, Resource Explorer, Test Scenario Designer, Automator, and Triager
assignments. Claim and admission bind the exact Journey, target, role, immutable input hash, authorization, ownership
generation, lease, and principal; admission records `hostIsolation: NOT_ATTESTED`. Each role still enters through its
own canonical validator and artifact service—there is no generic artifact-mutation endpoint. A specialized submission
atomically stores its accepted artifact/graph advancement and a principal-and-assignment-scoped durable outcome. An
authenticated exact replay returns that outcome after expiry, revocation, or a lost acknowledgement; a changed payload
or binding is rejected without a new effect. New effects recheck current graph eligibility, authorization, lease,
generation, target, Journey, principal, and coordinator session in the same transaction. Managed Factory claims
remain the default; all publication, review, decision, and closure gates are unchanged.

`quality_journey_external_work_outcome_get_v1` is the bounded recovery read for an uncertain external submission.
It accepts the same authenticated immutable assignment binding plus the role-specific operation and idempotency key,
and cannot mutate state. Rejected attempts currently return the bounded coordinator error envelope and are not persisted
as accepted artifacts or outcome receipts; this is diagnostic context only, not a semantic-quality determination.

During Analysis, the assignment's `JOURNEY_REVISION` descriptor identifies the immutable authoritative requirement.
Resolve it as library entry `REQUIREMENT_REVISION:<assignment.artifactId>`: its `artifactId` must equal the assignment
artifact ID and its `sourceContentHash` must equal the assignment content hash. The library `revisionId` is a display
ordinal, not the assignment's database revision ID. The Analyzer then submits only through the specialized Analysis
ingress. Accepted submission, publication for review, and approval recorded in Appraise are separate durable facts.
Required questions pause external progress: answers and corrections are
append-only Appraise records, and neither the plugin nor a connected coordinator may answer on the user's behalf.
After an answer, revision request, approval, lost reply, or stopped Codex task, the coordinator rereads the Journey,
Analysis, and pending-event state before it claims or continues work. `quality_journey_resume` reconstructs Appraise
work state; it does not prove that an external Codex process is alive or resumed.

## Stock Codex handoff architecture

The accepted [architecture decision](decisions/0004-stock-codex-journey-handoff.md) keeps Appraise as Journey authority
and uses stock Codex with a skills-only plugin plus independently registered MCP. Package-shipped plugin setup and
compatibility diagnostics carry no lifecycle authority. Prepared deep-link prompt prefill and qualified remote-target
neutral-host handoff are available for every mutable Journey stage. Later-stage reconnect stores an exact Journey,
revision, work/lease-generation, dispatch adapter/start/receipt, terminal effect, pending-event, and target snapshot;
launch, redemption, and UI takeover fail closed when any snapshot is stale. Redemption only connects a coordinator
session. Approval is short-lived and request-identity-bound. A separate local-UI approval atomically fences
predecessor attempts, reissues their logical work items as `REPLACEMENT_REQUESTED` with bounded successor
authorization, then fences connected predecessor sessions and makes a successor effective; ambiguous dispatches and
expired leases block takeover with a read-only recovery projection. Every coordinator-facing Journey mutation then
requires the effective handoff ID and monotonic generation, including specialized ingress. The same binding is
rechecked inside each specialized mutation transaction, so a generation superseded after route admission cannot
commit. Replacement authorization carries forward only its remaining immutable attempt budget across the full lineage;
Journey-scoped locator authoring follows this same admission and transaction-local recheck, while non-Journey locator
operations do not gain coordinator-session authority. Stale sessions make no mutation. A durable accepted replay remains readable after later fencing but truthfully reports that it is no longer
current. The reconnect protocol never claims a work item or grants role execution authority. Stock Codex cannot safely reopen a known task, so Appraise truthfully prepares a fresh
scoped handoff when that recovery is needed.
Opening Codex does not establish a connection or start work: the documented prefill flow requires the user to send,
then authenticated handoff redemption and authoritative state reads. The plugin supplies workflow guidance while
Appraise services enforce lifecycle transitions. No managed provider/fork or background-wake guarantee is introduced.
