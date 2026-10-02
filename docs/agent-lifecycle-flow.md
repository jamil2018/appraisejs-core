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

Scenario Designer output is a candidate until Appraise accepts and publishes its exact portfolio revision. Human
scenario decisions bind the current portfolio content, review hash, Journey state, and scenario revision IDs. A
successor may carry a prior decision only for unchanged reviewed scenario content and unchanged discovery, graph, and
coverage inputs. Scenario approve, reject, comment, comment disposition, and revision requests are local Journey UI
actions; the project-credential coordinator and MCP routes cannot submit them. The UI action records `actor=USER` but
does not authenticate a separate natural-person reviewer or prove an independent Codex task. Treat the local action
boundary and exact-version fence as enforced, and reviewer identity or independence as unverified.

After scenario approval, the stock Codex Automator uses an admitted `EXTERNAL_V1` assignment and the specialized
`quality_journey_external_automator_materialize_v1` operation. Appraise resolves the target and Journey, checks the
exact approved scenario and frozen resource authority, and writes target-owned suites, cases, Step Invocations, and
prepared capsule receipts through canonical operation and ready Step Definition bindings. The Automator must reconcile
an uncertain submission before replay. Generated `automation/` output and human Step projections remain derived from
canonical source; they are not Journey authoring inputs or direct agent edit targets. Preparation never grants
execution consent or creates a TestRun. Autonomous product-code repair is outside the Automator assignment.
Prepared Journey steps use a single allowed Gherkin keyword followed by the frozen scenario action. Materialization
derives that keyword from the reviewed Step Invocation and rejects malformed or multiline actions. The frozen
Discovery resource projection retains exact content hashes but supplies only the runtime capsule's `id` and
`contentHash` fields; richer legacy bindings are verified in full before the runtime reader projects them to that
same pair. These projections do not change the reviewed scenario or frozen binding identity.

Discovery freezes ready Step Definitions visible to the target project. A source-owned built-in is also visible when
its ID, version, definition hash, and provenance exactly match the canonical built-in source, even if the legacy
registry has no project ownership row for it. Other definitions still require project resource visibility. This
lets Automator bind a frozen built-in without treating unrelated project definitions as global resources.

During Discovery, anonymous and authenticated target observation use the Appraise-owned scoped browser panel. The
panel launches a headed, non-persistent browser context bound to the active Journey, target, discovery revision,
Scout work item, environment, frozen route and exact target origin. Password, SSO and MFA entry occur only in that
target browser; no Appraise action accepts credentials, cookies, storage state or arbitrary script. Expiry, logout,
revocation and context replacement close the context, while process restart invalidates every process-local session.
External page close/crash, context close, and browser disconnect synchronously fence session authority before
cleanup. Startup loss prevents session exposure; loss before the confirmation commit invalidates its reserved operation.
Receipt persistence checks the operation within its transaction. Loss after the confirmation commit follows an
already-valid confirmation, including while its blocker update is pending. Missing access creates an explicit Journey blocker. A later human access confirmation records only local access and
does not identify a natural person or attest an identity-provider assertion.
Confirmation and receipt capture reserve their in-process operation identity before asynchronous scope or persistence
work and recheck it with the session authority epoch afterward. Confirmation synchronously commits local
`ACCESS_CONFIRMED` before resolving a durable missing-access blocker, so a terminal transition that wins the
precheck prevents any resolution, while a later terminal transition follows a legitimate confirmation. A blocker-write
failure revokes the context. Route denial fences authority before attempting an abort, so a rejected or stalled browser
route operation cannot leave confirmation, capture, or return authority usable.

An authenticated session may cross the target origin only through the selected Environment's immutable
`appraise.discovery-auth-transit/v1` policy. That policy names an exact flow ID, canonical HTTPS IdP origins,
document-origin to destination-origin rules, canonical exact or segment-prefix paths, explicit methods/request kinds,
and an explicit IdP-to-frozen-target return edge. Appraise freezes the canonical policy hash and environment scope
version into the Discovery revision and rejects a changed Environment before start, confirmation, capture, or Scout
admission. IdP origins are not Scout network authority: they exist only in the headed browser policy. The abstract transit policy defines allowed redirect edges and effective methods.
Before a live sign-in attempt, inspect the current login document's public asset URLs and bind each required
stylesheet or script by its exact origin, path, method, and `SUBRESOURCE` kind. IdP asset version changes require an
Environment policy update and a new frozen Discovery revision; an older revision does not inherit the new policy.
An unstyled login page can indicate an asset-path mismatch, but the actual document reference and request outcome
must be checked before changing the allowlist. Keep credential and authorization-code URLs out of diagnostics.
The native Chromium adapter uses an owned process and temporary profile with a private CDP pipe. It binds the exact
paused seed target and installs recursive target admission and request interception before resume. Each request and
redirect follow-up passes the same canonical policy before network contact; response-stage pauses let the service
check redirect authorization and authority freshness before Chromium proceeds. Native requests retain their methods,
bodies and cookies without application-level replay or response-body retrieval. CDP can transiently expose request
headers, cookies and POST fields to the trusted Appraise process during protocol decoding. The runtime synchronously
projects required metadata before asynchronous work, without reading credential fields or copying them into service
objects, logs, receipts or persistence. This is not browser-process-only secrecy; raw protocol tracing and process
inspection are outside the qualified no-retention boundary. Redirect continuations are matched by their exact Fetch
predecessor and scoped target, session, frame, network request ID, URL and method. Independent network requests may
proceed through canonical policy while redirects are pending, including requests for the same URL. Redirect release
requires a stable network request ID; missing predecessor identity on that network request remains terminal. A request
missing both predecessor and network IDs while a redirect is pending in the same target, session and frame fails closed
as ambiguous.
Playwright's context and authentication-state APIs supply browser isolation and normal interactive authentication;
Appraise does not export or reuse `storageState`. The Appraise service supplies frozen authorization, one-shot return,
receipt admission, and lifecycle authority. The custom CDP layer is retained for the narrower proven gap: the current
Playwright fetch/fulfill route does not govern every redirect follow-up, and no qualified high-level replacement
provides recursive paused-target admission before execution. HTTP 304 cache validation has no redirect successor and
must not enter redirect-lineage tracking; actual redirects still require Location and a governed next hop. The test
fixtures, fault-injection controls, and fixed-shape operator projection qualify these boundaries but grant no product
authority. A smaller Playwright-managed launch with a browser-level CDP session remains an unqualified future option,
not a current containment substitute.
Frame identity and committed source URLs do not grant main-frame return authority.
The adapter denies popups and unsupported targets, disables service-worker registration, and denies downloads.
A deny-only WebSocket class is installed before document execution in every admitted target. It retains no native
socket constructor, freezes its prototype and global binding, reports only a fixed attempt signal, and throws.
WebSocketStream is denied when present. Native WebSocket events indicate an invariant breach and cause closure;
post-event revocation and URL blocking alone are not a pre-contact control. Original response headers and bodies
continue natively, without CSP rewriting.
Worker script requests must pass the canonical policy. An explicitly authorized script may be downloaded before its
worker target exists; unsupported worker targets are rejected while paused, before execution or downstream effects.
Registration suppression is defense in depth. Appraise does not collect script bodies. A child with unknown or opaque
source origin cannot begin IdP transit. A child first committed to the frozen target can use its browser-reported
security origin for the selected transit rules. Some iframe-first sign-in widgets therefore fail closed.
Transport loss or invalid protocol/target identity fences the runtime and closes its owned resources. Unsupported
platforms fail closed. Synthetic qualification of these controls does not establish live authentication or
human-authenticated restart. The retained Playwright qualification backend still rejects every HTTP 3xx because its
routing callback does not intercept redirect follow-ups; its limitation and counterexample remain explicit evidence.
Authenticated confirmation and receipt capture require the declared return to the selected target origin and exact
selected route after that return has committed in the main frame. After an approved provider success page, a human
must explicitly authorize one exact return through the local panel. Appraise then arms a 15-second one-shot grant and
immediately navigates the same owned browser page to the frozen, server-derived target. The Server Action accepts only
the scoped session identity and returns a fixed success outcome with the existing sanitized session projection after
the exact main-frame `GET` commit; it accepts no URL, credential, MFA, cookie, or browser data and returns no
authorization or callback URL. Arming requires the committed provider origin to match the selected flow's exact `GET`
return rule. During authenticated transit, the public session projection withholds the current URL and provider
origins; after a committed return it exposes only the frozen target route and origin. Internal routing still uses
the selected flow policy.
A failed navigation, route operation, expiry, or late/mismatched commit
revokes the session. The human separately confirms access to the returned protected page before receipt capture.
For authenticated discovery, the sealed receipt persists bounded `humanReturn` provenance only: its fixed mechanism,
one-shot authorization ID, frozen target URL hash, fixed `GET` method, and commit time. It also retains its
Environment scope version, flow ID, policy hash, and return outcome; it never persists IdP URL, query, response, or
page content.

The Discovery browser receipt is evidence of scoped observation, not a reusable login grant. Managed RuntimeCapsule
TestRuns create a fresh headless browser context; Discovery cookies and storage state are neither recorded in the
receipt nor transferred to that context. A managed run against a protected route therefore needs its own authorized
authentication path. A protected Discovery return alone must not be reported as authenticated managed execution.

Only an immutable `APPRAISE_DISCOVERY_BROWSER_V1` artifact can back a Scout observation. The specialized Scout
submission transaction resolves every descriptor and verifies its exact hash, issuer, Journey, target, cycle,
discovery revision, work item, snapshot, route, environment, access outcome and Appraise-derived observation fact
before persistence. Host-browser notes and screenshots remain supplemental and cannot satisfy this boundary.

Independent Test Runs remain available for authoring feedback, execution diagnostics, and debugging. They have
`intent=INDEPENDENT`, carry no Journey execution binding, and cannot supply Journey evidence, triage, decisions, or
closure. Journey-created Test Runs have `intent=QUALITY_JOURNEY` and require their exact
`QualityJourneyExecutionTestRun` binding.

## Results, corrections, and terminal review

After an execution cycle is terminal, Appraise prepares a Triager assignment from its sealed Journey TestRun and
evidence receipts. The Triager reads only that frozen assignment and the permitted sealed artifacts, then submits a
complete revisioned Test Report Analysis through the specialized operation. Each material failed or unverified run
requires one finding linked to the exact TestRun, scenario revision, and evidence receipt; requirement coverage must
account for every accepted requirement. A generic work completion or agent final message cannot publish a report.

The local Journey UI reviews the active report and current state hash. A full-report revision records feedback and
issues a successor Triager assignment with the preceding report attached. Approval of a bounded automation
correction records the reviewed report and creates a successor remediation cycle; the Automator can prepare only the
approved scenario revisions. A selective rerun needs a proposal naming the complete predecessor receipt set and a
local UI approval. Its execution reservation binds the predecessor cycle and frozen prepared capsules. Operations
that require execution consent request a fresh, exact-scope local UI grant; a previous grant does not carry into a
changed or successor run. Reconcile and seal the successor's actual runtime evidence before the next triage review.

Terminal closure is a local UI decision over the exact current report revision, hash, and Journey state. Appraise
rechecks the published and approved Analysis revision, report source and evidence lineage, active work, execution,
blockers, and required questions in the closure transaction. Ordinary closure requires no unresolved report items.
Risk acceptance requires a rationale and an exact set of every unresolved finding, coverage limitation, and residual
risk ID; the sealed closure receipt retains their artifact provenance. Exact replay is read-only, while a changed or
stale decision is rejected. The UI records local user possession as `USER`; it does not establish natural-person
identity or an independent reviewer.

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

## Operational pause and owned cleanup

See [Quality Journey pause and recovery](quality-journey-recovery.md) for operational admission fences, durable lost-reply recovery, deferred terminal publication, and observed owned-process cleanup. Cancellation requests alone are nonterminal; external Codex activity remains outside Appraise process ownership.
