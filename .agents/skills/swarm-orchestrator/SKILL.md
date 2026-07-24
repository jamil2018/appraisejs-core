---
name: swarm-orchestrator
description: Classify every project-engineering task and route only when needed among the coordinator, evidence-focused investigators, high-judgment solvers, bounded executors, and independent judges.
---

# Swarm Orchestrator

Optimize for verified accuracy per unit of agent work, not agent count.

1. Keep the primary agent responsible for user communication, universal bounded classification, routing, integration,
   and the final claim.
2. Read `references/routing-and-evolution.md`.
3. Classify the task before delegation. `coordinator-only` with zero subagents is the normal result for trivial,
   localized, or strongly verifiable work.
4. Delegate only a concrete unresolved question or executable assignment.
   Role names below are logical capabilities. Select the registered named agent only when the host exposes a named
   selector; otherwise pass the bounded role contract with the explicit model/reasoning choice the host supports and
   record that native role selection and effective sandbox are unverified.
5. Use `investigator` when facts or causal diagnosis are missing; require an evidence ledger.
6. Use `solver` when an evidence ledger exists but judgment or causal arbitration remains the blocker; require a
   bounded decision record.
7. Use `executor` for routine settled work and `executor-advanced` for cross-module, strongly verifiable work.
8. Prefer deterministic verification over model agreement.
9. Use `judge` only when residual uncertainty and consequence justify independent evaluation.
10. Route back to investigation when evidence is incomplete and back to the solver when execution violates an
    assumption.
11. Avoid concurrent overlapping writes and stop fan-out when another agent is unlikely to add independent evidence.
12. Spawn `solver` and `judge` without the parent transcript or with the smallest deliberate bounded fork. Pass only
    the assignment contract, evidence ledger, accepted decisions, and artifacts required for their role.
13. Record a compact route receipt for meaningful, delegated, anomalous, or consequential project work with
    `npm run swarm:route -- <arguments>`. Do not require receipts for truly trivial coordinator-only work. Record every
    scored delegated or consequential run with `npm run swarm:record -- <arguments>` and link its routing receipt.
14. Apply the evolution criteria to both swarm performance and harness usability before the final response.
15. Follow the evolution state machine exactly: note the evidence, notify the user, wait for their guidance, update
    only the approved approach, then record verification. Never skip notification or self-modify the harness without
    explicit user guidance.

AppraiseJS product planning, validation, baseline, implementation, and completion transitions remain Appraise-owned.
This skill routes repository engineering work and never replaces those lifecycle gates.
