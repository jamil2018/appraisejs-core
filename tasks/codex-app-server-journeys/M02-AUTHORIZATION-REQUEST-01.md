# M02 decisions and runtime authorization request 01

Date: 2026-10-15 (Asia/Dhaka). **Proposal only. Nothing may launch from this request.**
Current source acceptance: `b2c1487157a4a0209992791878fec95ff102c51c0863c1b05b7aec4b8d68c390`.
Overall M02 remains BLOCKED. Read [checkpoint](M02-IMPLEMENTATION-CHECKPOINT.md),
[B07 evidence](m02-b-n0-b07.md), [boundary options](m02-b-n2-boundary-options.md) and
[frozen M00](m00-host-authority-contract.md). All prior artifacts and review outcomes stay unchanged.

## Four decisions requested

| Decision                        | Concrete recommendation                                                                                                                                     | Consequence                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1: first enforcement candidate | Prepare a native macOS process-policy harness using `/usr/bin/sandbox-exec`, for the recorded macOS 27.0.1/26A434/arm64 and Codex 0.162.0-alpha.17.2 tuple  | Authorizes candidate preparation, not support or launch. Static inspection found the path exists; no version/help/policy probe ran. A shared engine/tool privilege boundary that cannot satisfy M00 fails this candidate. No guest/install is implied.    |
| D2: incompatible pinned build   | Keep M00 unchanged. If the pinned model/build only provides an unsupported generic executor route, stop and present an exact alternate build/model proposal | Allow evidence-backed alternative research/proposal, not automatic installation, model switch, upgrade or runtime fallback. Approve the exact replacement tuple before testing it.                                                                        |
| D3: B07 matrix amendment        | Replace one Analyzer B07 case with sixteen isolated one-call runs: fourteen Analyzer, one Designer, one Triager                                             | Changes case organization and start ceilings, not role catalogs or allowed effects. Explicit approval is needed; do not edit the frozen P1 policy. Create a new versioned policy.                                                                         |
| D4: credential evidence         | Permit preparation of a narrowly scoped existing-login check, through native Codex on the trusted provider side only, with refresh disabled                 | M01's login amendment was M01-only. No copying/parsing credentials, worker auth-file link, new sign-in, refresh, account switch, logout or API-key fallback is requested. If cached login cannot suffice, stop and report the exact new auth requirement. |

D1 must prove separation between engine-owned writes/provider state and model-callable privileges.
A policy file or executable path is insufficient. If that separation is infeasible, stop rather than
weaken M00. D2 is not approval for a generic Code Mode bridge. These are recommendations awaiting
user choice, not decisions already applied to the host.

## B07 revision: exact scope and arithmetic

Accepted B1 fencing terminates a run after an MCP error. Do not relax that behavior to pack fourteen
negative calls into one run. Each proposed B07 case has one fresh immutable role/assignment context,
one thread, one scripted turn, at most two local provider requests and one attempted tool call:

- B07-A01–A08: Analyzer top-level `target`, `targetProjectId`, `journeyId`, `assignmentGeneration`,
  `coordinatorGeneration`, `assignmentSecret`, `leaseId`, `principal` argument refusals.
- B07-A09–A14: Analyzer attempts at `quality_journey_analysis_answer`,
  `quality_journey_analysis_decide`, `quality_journey_command_submit`,
  `quality_journey_execution_start`, `quality_journey_external_work_claim_v1`, `quality_journey_get`.
  These remain unregistered; never enable their human/lifecycle effects for testing.
- B07-D01: Designer `result.role` binding mismatch, through its registered submission validator.
- B07-T01: Triager foreign receipt, through its registered evidence read. Frozen-key miss and
  canonical owner rejection must be distinguished; neither may be mislabeled as the other.

B07 maximum: **16 threads, 16 turns, 32 local requests, 16 tool calls**. Replacing old B07's
1/1/17 yields a revised P1-family maximum of **30 threads, 29 turns, 70 local requests**;
all other P1 cases stay unchanged. This is a new authorization envelope, not extra slots silently
added to the old policy. Do not pool it with E0 or M01.

These are independent fresh runs, not retries or un-fencing of an old run. A subsequent scheduled
case may start only after an expected planned rejection has an authoritative NO_EFFECT disposition
and owned cleanup is known. Any UNKNOWN, unexpected effect or lost acknowledgement ends the entire
campaign. Never reset an UNKNOWN journal to keep testing.

The eight argument refusals remain parser evidence, not credential/principal substitution proof.
Preparation must also retain/extend deterministic current-binding invalidation and canonical receipt
ownership fixtures outside the worker, with no canonical I/O after failed authorization. A Triager
fixture that only misses a frozen key cannot qualify the deeper owner check. Actual mandatory host
session/principal admission remains M03 and must not be claimed from these provisional M02 fixtures.
If a needed native validator lane cannot be reached within these exact calls, stop; do not add calls,
roles, cases or capabilities. Return an exact additional proposal or retain that claim unqualified.

## Proposed runtime envelope, after implementation and exact review

All phases need new reviewed executable scripts/policies and explicit execution approval. They do
not exist as a reviewed runnable bundle today. The following ceilings make that future request
reviewable; they are not a grant to launch. One final approval of the completed digest may cover
all four gated phases; no repeated confirmation is needed within that approved envelope.

| Phase         | Purpose                                                                          | Maximum native processes / listeners                                                                                                                 | Start and request ceilings                                                                                                                           | Deadline                                |
| ------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Q0            | Effective boundary qualification with owned synthetic canaries, no Codex         | One supervisor; twelve isolated probe-child attempts; one owned loopback trap listener                                                               | Twelve fixed probe cases; zero Codex/MCP/thread/turn/provider starts; one trusted trap control connection and two untrusted trap connection attempts | 30 seconds/case, 480 seconds overall    |
| E0            | Capture full native descriptors without tool execution                           | One supervisor/collector with one provider listener; one Codex and one scoped MCP child                                                              | One thread, at most one scripted capture turn, one local request, zero model/tool responses or tool calls                                            | 60 seconds capture, 180 seconds overall |
| M02-B revised | Six-role scripted native conformance plus isolated adversarial matrix            | One supervisor; at most thirty Codex and thirty scoped MCP child-launch attempts; up to thirty provider-listener attempts plus one B12 trap listener | Thirty threads, twenty-nine scripted turns, seventy local requests; one active case; revised B07 limit above                                         | 60 seconds/case, 3600 seconds overall   |
| A0            | Native existing-login metadata and disposable-access revocation checks, no model | One trusted supervisor; at most two isolated Codex child attempts; no MCP child/listener                                                             | At most two `account/read` checks with `refreshToken:false`; zero threads, turns or inference/provider requests                                      | 60 seconds/check, 180 seconds overall   |

Q0's twelve case subjects are protected synthetic source, database, credential, supervisor evidence,
forbidden write, symlink escape, shell/exec, child spawn, network access, loopback access, ambient
plugin/skill/config access, and cross-attempt history/environment/FD access. Use only owned fake
canaries and harmless fixed probe payloads. No real repository/database/credential value is an escape
target. Network tests target only owned loopback traps, never external Internet/DNS. The final artifact
must distinguish observed denial of these probes from independently assessed general enforcement;
a loopback denial alone is not proof of all egress rules.

M02-B needs a real disposable canonical validation/acceptance backend, not a fake echoed receipt.
The proposed process ceiling requires it to run on the trusted supervisor side without an additional
service child or HTTP listener. It may use a new disposable SQLite fixture initialized from the
current schema, never the user's database or a production migration. Model workers cannot access
that DB or direct coordinator HTTP. If actual service composition requires another process/listener,
revise the exact manifest and budget before approval; none is implicitly allowed. Fixture approvals,
assignments and receipts are synthetic/provisional, never production human decisions or host admission.

At most two listeners may be active during a B12 case (provider plus trap); otherwise one. Extra
helpers/guest processes, browser, tunnel, daemon, API server or native tool are excluded. A launcher
which replaces itself through exec counts as the same child attempt; an additional process does not.
Any failed/ambiguous launch consumes its reserved slot. No retry, restart, resume, replacement or
port fallback. Provider/tool/schema retries are zero; no correction turns.

Q0 qualifies synthetic policy behavior only; it does not establish Codex engine/tool separation.
Q0 must pass independent effective-boundary review before E0. E0 supplies no model/tool response
and cannot authorize broad tool execution. Complete E0 descriptors must support an exact direct
scoped mapping. Before any M02-B scripted turn, independent review must additionally establish the
actual Codex process/FD/network/provider/tool privilege topology and its exact enforcer composition.
If engine/tool separation remains unproven, stop before B08–B12 or any other B turn. Later negative
probe outcomes cannot substitute for this safety prerequisite. If establishing that topology needs
additional runtime observations or starts outside E0, return a separately bounded authorization
request; none is reserved here. If only an unsupported generic executor is exposed,
stop the campaign; permission cannot fix incompatible routing. A0 additionally needs a reviewed
trusted-provider/worker credential separation. It may not borrow credentials into the worker merely
to complete the test. No native/external inference is requested: scripted native protocol tests can
exercise six roles if supported. M01's 3/3 remains exhausted. Any actual model run needs a separate
explicit turn budget and review; do not guess that six real inference turns are necessary.

## Exact filesystem, process and socket permissions

Proposed exclusive roots (all remain absent now):

- `/private/tmp/appraise-m02-q0-p1`
- `/private/tmp/appraise-m02-e0-descriptors-p1`
- `/private/tmp/appraise-m02-native-matrix-p2`
- `/private/tmp/appraise-m02-auth-isolation-p1`

Only supervisor-owned directories/files under those roots may be created, at 0700/0600. Refuse
existing roots, symlinks, unowned components or uncertain cleanup; never replace or silently select
an alternative. Case roots separate supervisor/evidence/DB and provider state from worker-visible
frozen data. Preserve all historical roots and UNKNOWN effects. Only owned handles/path identities
may be interrupted or cleaned; no stored-PID signalling or delete-and-retry recovery.

Runtime approval must name the final hashes of scripts/policy, `/usr/bin/sandbox-exec`, the exact
Node/Python probe executable and Codex executable. Recorded Codex path is
`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`,
SHA-256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`.
Recheck the actual tuple before starts; drift blocks rather than authorizes an upgrade.
Required system-library/config reads and owned private stdio channels must be enumerated by the
reviewed enforcer manifest; no general repository/home/process/network access is implied.

Allow trusted bind/connect only on named owned 127.0.0.1 listeners, OS-assigned recorded ports, with
the attempt ceilings above. The trusted supervisor may perform its fixed control connection. Worker
trap attempts are deliberate expected-denial probes, not permission to communicate arbitrarily.
The two earlier EPERM loopback failures do not justify bypassing the sandbox without a new approved
exact runtime command. If execution needs a host sandbox exception, its request must name that
command and reason; user approval of these ceilings alone does not grant a generic shell/network rule.

## A0 auth and revocation boundary

A0 requests fresh M02 authority to reference the selected existing native login through the trusted
Codex provider path only, erroring if absent/expired. No login UI, native refresh, account switch,
logout, token export/parsing/copy or API-key/paid-provider fallback. Before approval the exact native
credential-source reference and its access topology must be identified without reading its values.
No worker auth-file link is permitted. Historical M01 linking/refresh permission is not inherited.

The revocation target is a disposable M02 capability/provider-state access reference, not the user's
real account. Never log out or revoke their working login to test it. The exact two-check sequence
and owned revocation action must be implemented/reviewed first; if native caching, Keychain fallback
or an unsupported broker prevents an honest isolation/revocation result, stop and retain UNQUALIFIED.
Simulated expiry/denial, capability revocation and actual provider-account revocation are distinct
claims. Do not present one as another. If full M02 evidence needs additional real-auth behavior,
present that exact action and separate authorization rather than mark the remaining claim passed.

## Evidence and completion conditions

Record effective identities/mounts/environment/FD/rules and denied effects; exact native containers,
schemas/grammars and hashes; SDK-advertised profile binding; request/thread/turn/call correlations;
canonical fixture acceptance/rejection identities; canary hashes; current-binding/owner validation
layers; durable consumed counters; auth-state categories only; and ownership/cleanup results.
No raw prompts/transcripts/provider bodies, real source/DB/credential values or account payloads.
E0 request/descriptor bounds remain 1 MiB, metadata 64 KiB; semantic redaction/truncation is incomplete.
B14 alone needs explicit asking-only configuration and exactly one correlated empty denial
`permissions:{}, scope:turn`, then fence. **Zero grants** in every phase.

Missing evidence, unsafe ownership, wrong tuple, unsupported route, auth/ambient inheritance,
unexpected requests, forbidden effects, uncertain send/flush/cleanup, exhausted counter or deadline
stops the entire applicable campaign without resend. Planned no-effect denials are not positive
containment until the responsible layer is proved. M02 can pass only its recorded exact tuple and
provisional authority scope; M03 mandatory-session re-probes, product dispatch, release, commit,
push and merge remain excluded. Independent final review must assess the complete evidence, not
just green fixture checks. Approval authorizes attempts; it cannot guarantee the candidate works.

## Copy-ready approval needed now

> Approve decisions D1–D4 in M02-AUTHORIZATION-REQUEST-01.md and offline implementation of the
> native macOS policy/probe harness, E0 launcher/collector composition, revised sixteen-case B07
> harness, disposable canonical validation fixtures and A0 check-only auth/revocation harness.
> Preserve M00, accepted source/evidence and all history. Keep real inference, native permission
> grants, account changes, commits/push and M03+ excluded. Implement and verify the exact scripts,
> process/path manifest and new policies, obtain independent exact-artifact review, then present
> one final digest-bound runtime approval request within the phase ceilings above. Do not launch,
> bind sockets, read credential values, reference the real login or run any host probes yet.

This is an implementation-preparation decision, not runtime approval. The runtime request cannot
honestly name executable policy/script hashes today because those artifacts do not yet exist.
After they do, a final approval must explicitly say: execute the named reviewed bundle digest,
Q0 → E0 → revised M02-B → A0, within these exact limits, gated on each phase's evidence and mapping
review. Any required helper, build/model, path, auth behavior, budget or code change outside that
bundle stops for a concrete revised request. No unseen artifact or placeholder command is approved
by this document. Accepted artifacts, M00 hash, GC3 REVISE, exhausted M01 3/3 and UNKNOWN history
remain unchanged. Current runtime authority is **zero**.
