# M00 trust amendment 02 — trusted local agent

Date: 2026-10-15 (Asia/Dhaka). Revision: **M00-TA02-r1, proposed exact artifact**.
User selected the trusted-agent direction and requested this amendment; exact-byte approval is
pending. This document authorizes no implementation, launch, socket, probe, authentication,
inference, permission grant, commit, push or M03+ work.

## Base, precedence and effective scope

Base: [M00-r3](m00-host-authority-contract.md), approved at `f506fccb2f910641d7a943bec440088512f0d714`,
SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`, with
[approval](m00-r3-approval.md) and [auth amendment 01](m00-auth-amendment-01.md).
All three remain unchanged. [ADR-0006](../../docs/decisions/0006-trusted-local-codex-journey-agent.md)
records this proposed direction. [Revised M02](m02-trusted-agent-plan-01.md) is its qualification plan.

After explicit approval of this exact artifact, the replacement clauses below prevail over conflicting
M00-r3 containment statements and their repetitions in ADR-0005, plan/todo, reference adaptation
rules, docs/agent-lifecycle-flow.md and docs/agent-mcp-setup.md, for this proposed host profile only.
They do not rewrite those records, override unrelated requirements or change current external/legacy
product behavior. The old documents preserve the
scope at which they were accepted. Approval must name this amendment's revision and SHA-256, plus
the plan's revision and SHA-256; record it separately, never edit these approval-status bytes in place.
Until that approval, M00-r3 remains the effective approved contract.

## TA01: replacement D04 trust and native access clause

For the initial local `APP_SERVER_LOCAL_V1` profile, Codex and its native tool loop are trusted to
act for the local user. Use one explicit target/workspace, one active turn, pinned executable/model
configuration and deliberately selected MCP registrations/instructions/environment. Native command
execution, file reads/writes and supported native/Code Mode tooling may be used when the exact task
and future runtime manifest authorize them. Workspace-write is a permitted configuration choice,
not a promise of confinement. Do not import the whole ambient Codex home or silently enable other
MCP servers/plugins/skills. Required configuration and any inherited inputs must be inventoried.

Appraise role catalogs remain scoped at their MCP endpoint: no human decisions, execution start,
claim/admit or unrelated mutations are registered for workers. Frozen inputs and specialized
submissions remain the application workflow. Do not describe endpoint scoping as denying all other
host paths. A native shell/evaluator is permitted as an explicitly reviewed trusted tool; its mere
presence is no longer a containment failure. Unknown schemas/routes or undeclared capability changes
still block the planned run until understood and approved.

There is **no security guarantee that this trusted same-user agent cannot access source, SQLite,
credentials, other history or network via available native privileges**. No separate engine/tool OS
boundary, credential broker, synthetic escape campaign or containment candidate is required for this
profile. Native sandbox/approval settings are recorded operational limits, not host isolation proof.
Do not claim that configuration, prompts, canaries or a scoped MCP catalog establish effective isolation.

This is not a blanket task grant. Product-source repair, real DB mutation, arbitrary external network,
reading credentials, target browsing/authentication, test execution, grants and human decisions still
need their specific task/consent authority. Qualification uses only disposable synthetic inputs and
owned workspace effects. The trusted agent is expected to honor these rules; available native access
may technically bypass them. Honest reporting must retain that residual trust risk.

## TA02: replacement credential and provider-state assurance

Retain existing-login/error-if-missing as the chosen local auth direction from amendment 01. Codex
owns its native credentials. Appraise never places token values in prompts, tool arguments, results,
logs or UI; no copying/parsing/exporting credentials, account switching, sign-out or API-key/BYOK
fallback is authorized by this amendment. Use distinct per-attempt configuration/workspace/history
and bounded sanitized auth categories. Do not claim those paths are inaccessible to a malicious
same-user native tool. Cross-attempt confidentiality is an operational practice, not hostile-agent isolation.

Remove D02's requirement to prove provider credentials inaccessible to the model-callable tool loop,
and remove provider-account revocation/isolation probes as mandatory M02 containment gates. Retain
canonical capability/lease revocation and expiry checks, owned interruption, auth-failure parking and
no silent account/provider/model fallback. The M01 auth-file link/native-refresh authorization was
M01-only; it supplies no M02 login reference, refresh or account-read permission. Any future real-login
check/use needs its own named credential-source topology, exact commands and runtime authority.

M02's initial revised result is scripted, unauthenticated protocol/gateway qualification. Real auth,
provider eligibility, spend and model behavior remain UNQUALIFIED and must be explicitly resolved
before a real-provider/support claim; none is labeled passed or silently inherited from M01.

## TA03: workflow authority retained, with the trust limitation explicit

Retain `APP_SERVER_LOCAL_V1`, `EXTERNAL_V1`, `PROJECT_CREDENTIAL_ONLY`, immutable
`hostIsolation=NOT_ATTESTED` receipts and all M03 mandatory first-session/transaction checks.
Do not add a schema enum or alter receipts merely to label the trust policy. New qualification
metadata may say `trustProfile=TRUSTED_LOCAL_AGENT_TA02`; it is descriptive, not host attestation.

Appraise services continue to require exact role/assignment/target/generation/lease/input revisions,
validated artifact acceptance, sealed evidence and explicit human approvals/answers/consent/closure.
Native output, file edits, provider prose, a clean exit or completed turn never substitutes for a
canonical accepted submission. Agent tasks may not author human decisions or manufacture acceptance.
Appraise UI retains typed forms and no direct user-agent chat. Scout evidence still requires Appraise
browser receipts; a native web result is not an admitted Discovery fact. Automator writes are still
canonical materialization; source repair or test execution is not implicitly granted by native capability.

These service and behavioral requirements remain testable at the application interface. They do not
establish that a trusted agent with direct local DB/source access is technically unable to falsify or
bypass them. Any adversarial guarantee would require a separate stronger trust contract. M03 re-probes
must state this same trust assumption and cannot turn endpoint checks into host-containment proof.

## TA04: exact clause and acceptance substitutions

| Frozen location / repeated requirement                                                                                             | Replacement under this amendment                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial scope: M02 effective tool and containment evidence for the tuple                                                           | Actual tool/config inventory and functional scoped-route evidence for the trusted profile; no OS isolation support claim                                                                                                                                    |
| Initial scope: model/tool worker must have no credential/file/environment/process access; other-worker history inaccessible        | TA01–TA02 trusted native access and operational hygiene; no adversarial credential/history separation claim                                                                                                                                                 |
| D04 and Host containment section: deny all native tools, repository reads/writes, arbitrary process/network, direct DB/credentials | TA01 task-scoped native permissions and explicit trust risk; real access is not granted by this document                                                                                                                                                    |
| Six-role table: SCOUT no native browser/network and AUTOMATOR no filesystem writes                                                 | Native capability prohibition is replaced by TA01 task permissions; admitted Scout facts still require sealed browser receipts and Automation still requires canonical materialization. Native edits/results grant neither acceptance nor execution consent |
| D02: prove provider-versus-worker isolation/revocation                                                                             | TA02 credential handling, auth-failure parking and canonical capability revocation; real auth qualification remains separate                                                                                                                                |
| Mode selection: M02/M12 containment as opt-in prerequisite                                                                         | Revised trusted-profile M02 plus applicable install/configuration/recovery checks; no adversarial containment claim                                                                                                                                         |
| Source evidence / M02 escape and auth-isolation obligations                                                                        | Revised M02 acceptance matrix; old obligations withdrawn for the new profile, never recorded as passed                                                                                                                                                      |
| D04: return for a build/scope decision on confinement infeasibility                                                                | Confinement is no longer a feasibility criterion; unsupported functional routing/configuration still stops                                                                                                                                                  |
| Reference rules/direct-only mapping: no generic Code Mode/native executor                                                          | A reviewed supported native/Code Mode route is eligible for functional qualification; no invented bridge/schema or automatic fallback                                                                                                                       |

The final Source evidence / qualification paragraph and D01/D02/D04 agreement rows in frozen
M00-r3 are amended only to the extent mapped above for this approved trusted profile. Native
escape-proof and provider/tool credential-isolation obligations are replaced; actual-binary protocol,
required-MCP failure, scoped role validation, human-decision rejection, absent-artifact handling and
M03 mandatory-session tests remain. No new M01 starts or retroactive M01 qualification is implied.

D01's exact host/build feasibility candidate and private stdio, D03's admissions/session/transfer
rules and D05's numerical concurrency/lease/turn/attempt/retention limits otherwise remain. History
retention/deletion and owned cleanup are operational obligations; privacy against a hostile agent is
not promised. Future native helper subprocesses must be enumerated and budgeted; no unbounded spawn,
automatic collaboration or nested model use is implied. Provider interruption is not proof billing stopped.

No existing implementation or exact review is changed: M02-A/B0/B1 and strict mapping retain their
accepted offline scope, old full-scope REVISE and blocked findings stay visible, GC3 remains REVISE /
not passed, M01 stays 3/3 exhausted and every UNKNOWN remains unresolved unless reconciled on its own merits.

## Exact approval requested

> Approve M00-TA02-r1 at its reported SHA-256 and M02-TA-P1-r1 at its reported SHA-256, together
> with ADR-0006's proposed trusted-local-agent direction. Accept the stated same-user native-access
> trust risk and withdraw the specified adversarial containment/credential-isolation requirements
> for this profile only. Preserve frozen M00 and all historical evidence. This accepts the design
> and revised plan only; no implementation, launches, sockets, probes, auth, inference, dynamic
> grants, commits, push, merge, release or M03+ work is authorized.

This approval would change the contract, not qualify a runtime. Subsequent offline implementation
and exact reviewed runtime commands/budgets require their own bounded instruction.
