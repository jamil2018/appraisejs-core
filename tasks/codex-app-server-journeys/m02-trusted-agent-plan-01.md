# M02 trusted-agent qualification plan 01

Date: 2026-10-15 (Asia/Dhaka). Revision: **M02-TA-P1-r1, proposed exact artifact**.
Planning only. Nothing launches, creates a runtime root/listener or references real auth under this plan.
Requires exact approval of [M00-TA02-r1](m00-trust-amendment-02.md); until then the original M00
requirements remain effective. [ADR-0006](../../docs/decisions/0006-trusted-local-codex-journey-agent.md)
is the additive entrypoint. This is the next proposed M02 direction, not a new passed checkpoint.

## Goal and retained evidence

Qualify the six-role Appraise MCP application interface and its actual Codex native route under a
trusted local-agent policy, using disposable deterministic inputs and a scripted local provider.
The result must be labeled **trusted-agent scripted conformance**, not hostile-agent containment,
real model behavior, authenticated provider support or production dispatch readiness.

The accepted [M02-A](m02-a-qualification.md), [B0](m02-b0-preparation.md),
[B1 offline scope](m02-b1-scope-revision-01.md) and [SDK/collector/mapping source checkpoint](M02-IMPLEMENTATION-CHECKPOINT.md)
retain their bytes and meanings. Existing direct-only mapper/guard behavior remains correct for its
original contract. Do not weaken or delete its assertions; prepare separate versioned policies and
trusted-route adapters after authorization. No existing accepted artifact is retroactively migrated.

The [prior request](M02-AUTHORIZATION-REQUEST-01.md), N2 enforcer options and E0 enforcer prerequisites
remain historical, not executable authority. Their Q0 containment campaign and A0 engine/credential
separation campaign are withdrawn from the proposed trusted-profile acceptance scope, **not passed**.
Full descriptors, exact functional routing and honest evidence remain required. Recorded Open Design
source review is implementation guidance only; upstream tests/runtime have not been run for this change.

## Revised acceptance matrix

| Property                                                    | Evidence required under this plan                                                                             | Explicit limit                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Six role catalogs, frozen reads and specialized submissions | Retained deterministic evidence plus actual scoped MCP registration and six native scripted read/submit cases | Endpoint behavior, not prevention of native bypass                                               |
| Forged authority / stale or revoked bindings                | Strict-schema cases plus distinct current-binding invalidation and canonical I/O counters                     | Parser refusal is not principal substitution; M03 mandatory-session admission remains subsequent |
| Human decisions / broad MCP operations                      | Unregistered role-endpoint calls and zero canonical effects                                                   | Not proof a malicious local agent cannot use other host paths                                    |
| Result role / foreign receipt                               | Registered Designer binding check and Triager frozen-key/owner layers with distinct fixtures                  | Frozen-key miss cannot qualify canonical owner authorization                                     |
| Actual native descriptors / supported routing               | Full contracts, SDK-advertised schemas, tool/server/call/result correlation and functional tests              | Native executor/Code Mode permitted if reviewed; no unknown/invented route or schema stripping   |
| Trusted native effects                                      | Two fixed harmless scratch-workspace command/file cases with expected effects                                 | Demonstrates permitted behavior, not security isolation                                          |
| Unexpected requests / required MCP failure                  | No-turn required-server failure and one empty permission denial, then fence                                   | Dynamic permission grants remain zero                                                            |
| Credential/privacy handling                                 | No-auth scripted provider; deterministic redaction, missing-auth parking and capability revocation tests      | Real login, model behavior and adversarial credential/history isolation unqualified              |
| Interrupted/ambiguous effects                               | Durable counters, owned handles, UNKNOWN/no-resend and canonical acceptance lookup                            | Exit/timeout or a receipt file alone does not prove no effect                                    |

M02 can be accepted against these revised criteria only after the amendment, implementation,
authorized observations and final exact-artifact/evidence review. This explicitly narrows the old
M02 gate. No missing old containment/auth-isolation gate is silently marked passed or hidden in M03.
M03 mandatory-session transaction re-probes remain mandatory; real-provider/auth support requires a
separately named qualification before use, regardless of M02's scripted result.

## T0: next offline implementation proposal

After separate authorization, prepare a versioned trusted-agent policy, launcher/composition and
native route adapter without editing accepted source/fixtures. Reuse the SDK server and bounded
collector through their public contracts. Prepare a disposable canonical validation/acceptance backend
on the trusted supervisor side using synthetic bindings and a fresh SQLite fixture from current
schema. No real DB, migration, production admission or synthetic human decision reaches real state.
If actual services require additional helpers, enumerate them and revise the manifest before execution.

Replace direct-only mapping as a mandatory criterion with two eligible functional routes: exact
native MCP descriptors, or a fully described native/Code Mode wrapper whose supported protocol can
invoke the exact scoped MCP operations. Capture complete wrapper schemas/grammar and actual tool
semantics; bind the underneath SDK-advertised tool catalog separately when not present as individual
native descriptors. A generic executor's name alone establishes nothing. The trusted adapter must
validate constructed calls, bounded results, correlations, registration and canonical acceptance;
it is not a security sandbox and does not intercept arbitrary future agent behavior. No extra model
loop, generic multi-agent registry or automatic collaboration is introduced.

Inventory native tools rather than rejecting their presence. Require an explicit future manifest for
which native tools are used in each case and any helper processes they can start. Configure only the
scoped MCP endpoint and reviewed instructions/environment; inventory accidental ambient configuration
and stop on unreviewed drift. Requested workspace-write/never-approval settings are operational choices,
not denial/containment evidence. No `sandbox-exec` implementation or privilege broker is required.

Offline fixtures must cover complete descriptor schemas, malformed/duplicate/unknown routes,
SDK-schema binding, positive read/submit correlations, expected rejection layers, current binding
revocation before/after I/O, independently checked acceptance, foreign receipt ownership, lost
acknowledgement, durable reservations and shared UNKNOWN fencing. Use in-memory/temp-file fixtures;
no native runtime, sockets, real login or model calls. Obtain independent exact-artifact review.

## T1–T3: proposed later runtime matrix and ceilings

These are proposed ceilings only. Executable commands, helper/FD/environment manifests, policy and
script hashes, terminal-response handling and runtime approval must exist first. One final approval
may cover the reviewed gated sequence without repeated confirmation inside that envelope. No build,
model, route, helper, case or path fallback; new code/unknown mapping requires review before more starts.

| Phase / case                      | Native thread / turn maxima | Local provider requests | Tool actions                                                        |
| --------------------------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------- |
| T1 descriptor capture             | 1 / 1                       | 1                       | Zero model/tool responses or tool calls                             |
| T2 B01–B06 six role positives     | 6 / 6                       | 24                      | At most 18 scoped MCP operations total                              |
| T2 B07-A01–A14, D01, T01          | 16 / 16                     | 32                      | One attempted scoped operation per case, 16 total                   |
| T2 P00 required MCP unavailable   | 1 / 0                       | 0                       | Zero                                                                |
| T2 B14 permission denial          | 1 / 1                       | 2                       | One permission request; one empty denial; zero grants               |
| T3 N01 command/scratch read-write | 1 / 1                       | 2                       | One reviewed native command, fixed harmless payload                 |
| T3 N02 scratch file edit          | 1 / 1                       | 2                       | One reviewed native file-edit action, fixed harmless payload        |
| Total, all phases                 | **27 / 26**                 | **63**                  | 34 scoped operations; two workspace actions; one permission request |

T2 alone: **24 threads, 23 turns, 58 local requests**. T3: **2/2/4**. T1: **1/1/1**.
Native wrappers may add outer protocol calls around inner scoped operations. T0 must enumerate
that exact expansion per case and set a separate outer-call ceiling in the reviewed manifest; it
cannot add provider requests, turns or inner operations to these limits. If the supported wrapper
needs more requests/actions/helpers than reserved here, return a revised bounded plan before runtime
approval. A tool surface which cannot perform N01/N02 is unsupported for these cases, not a reason
to invent aliases or count unreached attempts as successful native effects.

One active case. Maximum one supervisor, one Codex child and one scoped MCP child per case, one
owned provider listener per active case, 27 Codex child attempts and at most 27 MCP child/listener
attempts over the sequence. N01 may additionally launch exactly one pinned command child and N02
one pinned edit helper if required: both must be named/hash-bound before approval, no nested child,
daemon, browser, tunnel, collaboration worker or external service. In-process canonical fixture is
included in the supervisor; extra service children/listeners are not silently permitted. Count an
exec replacement as the same child identity, a forked process as another. No trap listeners or Q0
probe children are reserved. 60 seconds/case; T1 180 seconds overall; T2 2,400 seconds; T3 180 seconds.
Retries, resumes, replacement/correction turns, real provider/inference requests and grants: **zero**.
M01's exhausted 3/3 is a separate untouched counter. Every failed/possibly sent start consumes a slot.

### B07 exact revised organization

Do not modify the frozen P1 one-Analyzer-case policy. A new versioned policy splits its selectors:

- A01–A08: Analyzer top-level `target`, `targetProjectId`, `journeyId`, `assignmentGeneration`,
  `coordinatorGeneration`, `assignmentSecret`, `leaseId`, `principal` extras refused by schema.
- A09–A14: Analyzer absent operations `quality_journey_analysis_answer`,
  `quality_journey_analysis_decide`, `quality_journey_command_submit`,
  `quality_journey_execution_start`, `quality_journey_external_work_claim_v1`, `quality_journey_get`.
- D01: Designer registered scenarios submission with mismatched `result.role`.
- T01: Triager registered evidence read with a foreign receipt; record actual first layer.

These are sixteen independent fresh role contexts, not retries or an Analyzer route to another role.
Keep all accepted shared-run error fencing. Next scheduled case may start only after an authoritative
expected NO_EFFECT disposition and known owned cleanup. Any UNKNOWN ends the entire campaign;
never reset the old journal or relabel uncertainty. Current-binding/principal and canonical receipt
ownership fixtures are separate deterministic evidence; if the native T01 hits only frozen-key
lookup, report that narrower result. No canonical-owner claim from that miss.

Historical B08–B13 hostile escape cases are **withdrawn from the new gate, not passed**. N01/N02
are new positive workspace demonstrations, not renamed denial successes. No synthetic credential read,
source/DB escape, symlink escape, external network/browser or actual credential test is requested.
Do not delete the original cases or their historical records. Discovery receipts and test execution
still follow Appraise's independent application workflow rules.

## Paths and exact future permissions

Proposed roots, created only by a separately approved runtime command:

- `/private/tmp/appraise-m02-ta-descriptors-p1`
- `/private/tmp/appraise-m02-ta-matrix-p1`
- `/private/tmp/appraise-m02-ta-workspace-p1`

Refuse existing roots, symlinks or unowned components; exclusive directories 0700/files 0600.
Each root contains supervisor/evidence and separate case home/config/history/workspace/tmp paths.
These separate paths aid ownership and cleanup; they do not attest same-user confidentiality.
The qualification runtime is trusted to honor the fixed scripts and paths. It has no task authority
to touch the real repository, user DB, real credential values or historical roots. Technical inability
to do so is not an acceptance claim. Do not copy ambient home/auth/plugins/MCP/skills or source inputs.
Only synthetic source/files/SQLite canaries enter disposable workspace; no production data.

Future authority must name the exact supervisor/interpreter/scripts/config and scoped MCP child,
Codex path/hash, schemas, host tuple, helper executables, environment/FD handling, listener URLs and
retention/cleanup behavior. Recorded candidate remains macOS 27.0.1/26A434/arm64, Codex
0.162.0-alpha.17.2 at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`,
SHA-256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`, stable schema manifest
`a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c`.
These are recorded pins, not fresh support claims. Verify actual identity before any start; drift stops.

Provider transport uses one fixed local scripted endpoint per case at an OS-assigned recorded
127.0.0.1 port, with no external provider, redirects, real Authorization header, API-key/account link,
DNS target, general network request or retry. Loopback bind/connect and private stdio/owned-handle
interruption need explicit runtime authority; historical EPERM does not authorize bypass. N01/N02
future native workspace-write permission must be explicit in that manifest. B14 alone may use an
asking-only configuration to emit one correlated permission request, answer `permissions:{},scope:turn`,
then fence. Configuring approved workspace access is separate from dynamically granting that request.
No generic host shell/network exception is requested; any required sandbox escalation names the
exact reviewed command and reason. Such approval cannot establish adversarial isolation.

## Evidence, stops and completion

Capture full native descriptor contracts (standard/Lite containers, namespaces, schemas/grammar),
actual inventory/config/pins and selected route, inner/outer call IDs and budgets, canonical fixture
acceptance/rejection identities, layer-specific errors, hashes of synthetic pre/post workspace effects,
consumed durable intents, owned cleanup and unresolved outcomes. Descriptor evidence bounds remain
1 MiB/request and 64 KiB sanitized metadata; semantic truncation/redaction marks mapping incomplete.
Never retain raw prompt/history/provider bodies, account payloads or real credential values. New
provider history follows M00's operational retention deadlines; never reset the earliest intent clock.

Missing/incomplete contracts, unknown route, unreviewed extra MCP/config/helper, wrong tuple/schema,
unexpected effect/request/auth/network, expired/revoked binding, lost start/submission acknowledgement,
uncertain flush/cleanup/ownership, exhausted counter or deadline stops the sequence without resend.
Planned expected denials require authoritative NO_EFFECT disposition; a timeout/exit is insufficient.
On failure fence new actions, interrupt only owned handles and retain UNKNOWN history. No stored-PID
signals, unsafe deletion or port/root replacement. Unexpected native capability presence is inventory
for review; actual use outside the reviewed script is an unplanned effect and stops the campaign.

Final independent review must bind exact implementation and resulting evidence, distinguish retained
offline fixtures from new native observations and withdrawn containment requirements from passed
application checks. Until then M02 is incomplete. Even after scripted M02 acceptance, actual model
behavior/auth/eligibility/spend and production support remain unqualified; real-provider work needs
a new bounded plan and budget. M03 mandatory sessions and M04+ dispatch/recovery/install gates remain.
No schema/UI/release, production Journey, commit, push, merge or publish is part of this plan.

## Exact next authorization

First approve the amendment and this plan by their reported SHA-256 hashes (design only). A later
instruction may authorize **T0 offline implementation and disposable tests only**, preserving all prior
accepted artifacts and obtaining independent exact-artifact review. Do not authorize unseen runtime
scripts now. After T0, request one final approval naming the runnable bundle digest, exact commands,
roots, helpers, operational sandbox/native-tool profile and T1 → mapping review → T2 → T3 gates.
If T1 mapping requires new code or different ceilings, stop for exact review/revised approval before T2.
No new OS containment candidate or real-login probe is required to reach the revised scripted M02 gate.
