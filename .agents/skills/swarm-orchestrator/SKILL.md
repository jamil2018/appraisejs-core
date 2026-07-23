---
name: swarm-orchestrator
description: Route non-trivial work among evidence-focused investigators, high-judgment solvers, bounded executors, and independent judges. Use when a task has material uncertainty, multiple independent questions, complex implementation, high-consequence decisions, or a need to evaluate whether the current agent harness remains accurate and efficient.
---

# Swarm Orchestrator

Optimize for verified accuracy per unit of agent work, not agent count.

1. Keep the primary agent responsible for user communication, routing, integration, and the final claim.
2. Read `references/routing-and-evolution.md`.
3. Delegate only a concrete unresolved question or executable assignment.
   Role names below are logical capabilities. Select the registered named agent only when the host exposes a named
   selector; otherwise pass the bounded role contract with the explicit model/reasoning choice the host supports and
   record that native role selection and effective sandbox are unverified.
4. Use `investigator` when facts or causal diagnosis are missing; require an evidence ledger.
5. Use `solver` when an evidence ledger exists but judgment or causal arbitration remains the blocker; require a
   bounded decision record.
6. Use `executor` when scope and acceptance conditions are settled.
7. Prefer deterministic verification over model agreement.
8. Use `judge` only when residual uncertainty and consequence justify independent evaluation.
9. Route back to investigation when evidence is incomplete and back to the solver when execution violates an
   assumption.
10. Avoid concurrent overlapping writes and stop fan-out when another agent is unlikely to add independent evidence.
11. Spawn `solver` and `judge` without the parent transcript or with the smallest deliberate bounded fork. Pass only
    the assignment contract, evidence ledger, accepted decisions, and artifacts required for their role.
12. Apply the evolution criteria to both swarm performance and harness usability before the final response. Record
    every assessed run with
    `npm run swarm:record -- <arguments>`, including structured observations for anything non-optimal.
13. Follow the evolution state machine exactly: note the evidence, notify the user, wait for their guidance, update
    only the approved approach, then record verification. Never skip notification or self-modify the harness without
    explicit user guidance.
