---
name: appraise-quality-journey
description: Connect to and continue an AppraiseJS Quality Journey through authenticated MCP operations while preserving Appraise-owned lifecycle authority.
---

# Appraise Quality Journey

This plugin supplies workflow guidance only. AppraiseJS services and authenticated MCP operations own every lifecycle
transition, authorization, review, evidence, and completion decision. Plugin recognition, Codex launch, MCP
registration, or visible tools do not mean a Journey is connected, admitted, active, or complete.

1. Call `project_diagnostic` before Journey work. Supply the selected target path when the target is a local workspace,
   and include the current task's observed tool/resource inventory and MCP surface version/contract hash when the host
   makes them available.
2. Stop on blocking hub, identity, target, authentication, permission, transport, tool/resource, or contract checks.
   Do not silently substitute CLI operations for missing MCP lifecycle authority.
3. For a prepared handoff, call `quality_journey_handoff_redeem` once with the exact Journey, target, and one-time
   ticket. Treat `do_not_retry` as terminal. Redemption proves only that the connection was accepted.
4. Immediately read `quality_journey_get` and the stage-specific authoritative operation. Follow returned
   `appraise://` resources and recovery guidance; do not infer state from the prompt or plugin instructions.
5. Read pending events before registration or resumed work. Stop on cancellation, pause, pending approval, or blocking
   feedback. Never request takeover unless the user explicitly approved it.
6. Use only the role/task operations admitted by current durable state. Re-read state after lost replies and reconcile
   idempotently before attempting another mutation.
7. Never treat chat approval as an Appraise requirement, validation, evidence-review, consent, or completion gate.
8. Report exactly which observations came from plugin recognition, MCP calls, Appraise UI/service state, or human
   operation. Keep these evidence classes distinct.

## Scoped discovery and human sign-in

For `DISCOVERY`, keep target access and Scout submission separate.

1. Read `quality_journey_get` and `quality_journey_discovery_get`, then claim and admit only the current Scout
   assignment through the retained `EXTERNAL_V1` work operations.
2. Ask the human to use the Journey's Appraise-owned scoped browser panel when a target route needs observation.
   Password, SSO and MFA entry occur only in the opened target browser. Never request credentials in chat or place
   them in a prompt, MCP argument, observation fact, log, screenshot or fixture.
3. Treat anonymous access, human-confirmed authenticated access and missing access as distinct outcomes. A human
   confirmation does not identify a natural person or attest the identity provider.
4. Use only the exact receipt descriptor and Appraise-derived observation facts displayed by the scoped browser
   panel. Host Browser observations and screenshots are supplemental and cannot replace an
   `APPRAISE_DISCOVERY_BROWSER_V1` receipt.
5. Submit through `quality_journey_external_scout_target_observation_submit_v1`. Appraise rechecks the receipt issuer,
   hash, Journey, target, cycle, discovery revision, work item, snapshot, route, environment and fact inside the
   specialized submission transaction.
6. If access is missing, report the durable Appraise blocker and stop. After access changes, reconnect and reread the
   Journey and discovery revision before retrying; never reuse an expired, logged-out, revoked or replaced browser
   session.

## Analysis and human waits

For `ANALYSIS`, use the retained `EXTERNAL_V1` path; do not create another workflow or use a generic completion call.

1. Claim only the current `REQUIREMENT_ANALYZER` assignment through
   `quality_journey_external_work_claim_v1`. A claim grants scoped work authority; it is not admission, submission,
   publication, or approval.
2. Read the exact immutable requirement named by that assignment through
   `quality_journey_library_list` and `quality_journey_artifact_get`. The assignment descriptor uses
   `kind=JOURNEY_REVISION`; resolve it as library entry
   `REQUIREMENT_REVISION:<assignment.artifactId>`. Verify that the returned entry's `artifactId` equals the assignment
   `artifactId` and its `sourceContentHash` equals the assignment `contentHash`. The library's `revisionId` is a
   human-facing ordinal and must not be compared with the assignment's database revision ID.
3. Admit that exact assignment through `quality_journey_external_work_admit_v1`, then submit through
   `quality_journey_external_analyzer_analysis_submit_v1`. A successful specialized submission means Appraise
   accepted and recorded the immutable artifact; it does not publish the artifact or approve it.
4. Reconcile a lost submission reply with `quality_journey_external_work_outcome_get_v1` before any exact replay.
   Never change the idempotency key to guess past an uncertain outcome.
5. After submission, call `quality_journey_get` and `quality_journey_analysis_get`. If required questions exist,
   report that Appraise is awaiting the human and stop the task. Do not renew a hidden lease, answer for the user,
   publish, or infer approval.
6. Human answers and corrections are recorded through Appraise-owned UI or `quality_journey_analysis_answer` with
   `actor=USER` enforced by Appraise. Publication, revision requests, and approval are separate exact-version facts.
7. After a human wait, rejection, requested revision, or stopped Codex task, reconnect as instructed by current
   handoff state. Read pending events, then reread `quality_journey_get` and `quality_journey_analysis_get` before
   claiming or continuing work. Use `quality_journey_resume` only when the authoritative recovery projection permits
   it; it reconstructs Appraise work and never proves that the old Codex task resumed.
8. A revision request requires a fresh Analyzer assignment whose immutable inputs include the predecessor charter,
   Q&A, and durable feedback. An approval is usable only when the reread Analysis decision binds the current revision,
   content hash, and review hash.
9. Keep these statuses distinct in every report: handoff prepared, connection accepted, takeover effective,
   assignment claimed/admitted, specialized submission accepted, published for review, and approval recorded in
   Appraise. An Appraise `actor=USER` decision does not independently attest that the project credential belongs to a
   particular person. Appraise can fence its own authority; it cannot claim to have stopped arbitrary external Codex
   activity.

## Scenario review and revision

Submit a Scenario Portfolio only through the specialized Designer ingress for the exact assignment, immutable
Analysis and Discovery inputs, cycle, and target. Submission is a candidate, not a human approval. After Appraise
publishes it, reread the current portfolio and review hash. Leave approve, reject, comments, and revision requests
to the local Appraise Journey UI; coordinator/MCP credentials cannot submit these review mutations. Feedback and a
revision request produce a fresh Designer assignment. A prior
decision may carry only when the reviewed scenario content and its discovery, graph, and coverage inputs are
unchanged. Do not infer an independent human reviewer from `actor=USER`, a role name, or a separate Codex task;
the current project-scoped UI decision path does not establish that identity.

## Automation preparation

At `AUTOMATION`, reread `quality_journey_get` and `quality_journey_automation_context_get` for the selected target.
Claim and admit only the current `AUTOMATOR` assignment through the retained `EXTERNAL_V1` operations. Use the
assignment's exact approved Scenario Portfolio and approved scenario revisions, completed Resource Resolution Bundle,
input hash, scope hash, and target. Search or read canonical operations, ready Step Definitions, and target-owned
locators before proposing one mapping for every approved source step. Select only operations and definitions in the
frozen compatible resource authority; preserve each operation's handler ID, version, and content hash. A missing
compatible resource is a blocker to report through Appraise, not permission to invent a handler or edit generated
wrappers.

Submit the complete packet through `quality_journey_external_automator_materialize_v1` with the admitted assignment,
lease, and one stable idempotency key. Reconcile an uncertain reply through
`quality_journey_external_work_outcome_get_v1` before any exact replay. Read the resulting preparation context and
verify every approved scenario has a target-owned suite, case, canonical Step Invocation, and prepared capsule receipt.
Preparation does not start a TestRun or grant execution consent. Appraise owns authored records and capsule creation;
generated `automation/` files and human Step projections remain derived artifacts and must not be patched as Journey
outputs. This Automator scope supports test automation preparation only. Autonomous repair of the target product's
application code is outside this assignment and requires a separate user request and authority.

If native Appraise tools are absent, run `appraisejs agent compatibility --json` outside the MCP protocol, repair the
reported installation or registration state, reconnect or start a fresh task, and call `project_diagnostic` again.
The documented manual registered-MCP fallback is setup recovery only; it does not grant Journey authority by itself.
