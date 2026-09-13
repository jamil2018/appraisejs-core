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

If native Appraise tools are absent, run `appraisejs agent compatibility --json` outside the MCP protocol, repair the
reported installation or registration state, reconnect or start a fresh task, and call `project_diagnostic` again.
The documented manual registered-MCP fallback is setup recovery only; it does not grant Journey authority by itself.
