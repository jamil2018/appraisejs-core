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

If native Appraise tools are absent, run `appraisejs agent compatibility --json` outside the MCP protocol, repair the
reported installation or registration state, reconnect or start a fresh task, and call `project_diagnostic` again.
The documented manual registered-MCP fallback is setup recovery only; it does not grant Journey authority by itself.
