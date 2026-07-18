# Plan Builder Feature Implementation Roadmap

## Purpose

This document consolidates feature suggestions from AppraiseJS plan-builder happy-path audits and prior design
discussions. It separates already-delivered capabilities from remaining implementation work and orders the remaining
features by user impact and lifecycle risk.

## Prioritization rules

- **P0:** Prevents lifecycle failure, false readiness, incomplete validation, or expensive recovery.
- **P1:** Materially improves authoring speed, visibility, auditability, or change safety after the core path is reliable.
- **P2:** Expands provider-native operation and advanced recovery after the shared lifecycle is mature.

## P0 - Reliability, recovery, and completion confidence

| Order | Feature                                  | Status                               | Impact   | Implementation direction                                                                                                                                                                        |
| ----: | ---------------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Unified agent preflight                  | In progress: first slice implemented | Critical | Extend `project_diagnostic` across App/API identity, active MCP transport, current-task capability visibility, and target-project binding. Add UI presentation and certification coverage next. |
|     2 | Guided expected-red capture              | Planned                              | Critical | Turn baseline failures into a guided classification flow with exact evidence, expected regression acknowledgement, and safe retry actions.                                                      |
|     3 | Guided baseline recovery                 | Planned                              | Critical | Present durable attempt state, root cause, allowed recovery action, and retry consequences without requiring raw log or database inspection.                                                    |
|     4 | Lifecycle command center                 | Planned                              | High     | Provide one project-scoped surface for current gate, owner, blockers, active attempt, exact next action, review URLs, and recovery controls.                                                    |
|     5 | Exact validation and execution preview   | Planned                              | High     | Show the canonical AST projection, selected actions and locators, scenarios, runtime inputs, and immutable execution identity before publication or execution.                                  |
|     6 | Golden lifecycle certification harness   | Planned                              | High     | Continuously execute representative greenfield and existing-project lifecycles through every Appraise-owned gate and retain durable certification evidence.                                     |
|     7 | Per-plan timing and efficiency telemetry | Planned                              | High     | Record duration, wait time, retries, tool calls, response size, and recovery cost per phase while keeping local-first privacy and bounded retention.                                            |

## P1 - Authoring leverage, observability, and auditability

| Order | Feature                                   | Status  | Impact      | Implementation direction                                                                                                                                               |
| ----: | ----------------------------------------- | ------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     8 | Validation coverage explorer              | Planned | High        | Map plan requirements and tasks to scenarios, steps, actions, locators, and uncovered intent before validation review.                                                 |
|     9 | Live agent activity view                  | Planned | High        | Display the agent's current phase, latest durable operation, wait state, and bounded progress without exposing private reasoning.                                      |
|    10 | Event-driven lifecycle notifications      | Planned | High        | Notify on review readiness, requested changes, approvals, blocked attempts, recovery readiness, and completion-signoff requirements.                                   |
|    11 | Validation AST starter and export         | Planned | High        | Generate an editable starter from plan intent and registered resources, then support deterministic import/export without shifting semantic ownership back to Appraise. |
|    12 | Plan-intent context pack                  | Planned | Medium-high | Provide a bounded agent resource containing approved intent, constraints, requirement IDs, target metadata, and relevant reusable actions/resources.                   |
|    13 | Reusable validation recipes               | Planned | Medium-high | Package common, registry-first validation patterns that agents can adapt while preserving explicit review of selected actions and locators.                            |
|    14 | Greenfield runtime preparation proposal   | Planned | Medium-high | Detect missing runtime prerequisites and propose reviewable setup changes before baseline instead of mutating the target workspace silently.                           |
|    15 | Evidence provenance timeline              | Planned | Medium-high | Correlate plan revisions, validation receipts, runtime capsules, attempts, TestRuns, checkpoints, and completion evidence in one immutable timeline.                   |
|    16 | Revision-impact analysis                  | Planned | Medium-high | Identify which validations, resources, baselines, approvals, and implementation groups become stale after a plan or validation revision.                               |
|    17 | Automatic delegated-authorization receipt | Planned | Medium      | Generate and attach a bounded receipt whenever an authorized worker or subagent performs lifecycle work on behalf of the coordinator.                                  |

## P2 - Provider-native operations

| Order | Feature                                           | Status  | Impact | Implementation direction                                                                                                                        |
| ----: | ------------------------------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
|    18 | Provider session console                          | Planned | Medium | Provide a project-scoped view of registered providers, active sessions, capability snapshots, run state, costs, and durable outputs.            |
|    19 | Provider permissions, recovery, and fork controls | Planned | Medium | Add explicit permission decisions, resumable recovery, cancellation, and controlled fork-from-checkpoint behavior with Appraise-owned receipts. |

## Already delivered and excluded from remaining scope

The following earlier happy-path suggestions are implemented or substantially covered and should not be reopened as
new roadmap items unless a regression is found:

- Five-stage lifecycle progress rail.
- Copyable compact continuation state.
- Baseline-to-final evidence comparison.
- Structured blocker and recovery responses.
- Compact, bounded lifecycle responses.
- Project-scoped direct review links and search.
- Self-describing Validation AST contracts.
- Immutable managed runtime capsules.
- Agent-authored planning with Appraise-owned validation and gates.

## Current implementation checkpoint

The first P0 slice is implemented in the current worktree:

- `project_diagnostic` accepts observed tools, observed resources, and an expected target workspace.
- It reports App/API identity, active MCP transport, current-task capabilities, and target binding as separate layers.
- It returns `needs_observation` rather than claiming client readiness when the immutable task snapshot is unavailable.
- Missing capability sentinels and target mismatches produce bounded recovery guidance.
- Agent setup sentinels, MCP contract fixtures, generated coordinator reference, tests, docs, and Graphify outputs are
  aligned with the new contract.

## Recommended implementation sequence

1. Finish unified-preflight UI presentation and add it to the golden lifecycle harness.
2. Implement guided expected-red capture and baseline recovery as one recovery epic.
3. Build the lifecycle command center on the resulting preflight and recovery contracts.
4. Add exact validation/execution preview and per-plan timing telemetry.
5. Establish the golden certification matrix before starting P1 authoring accelerators.
6. Deliver P1 in coverage/AST, activity/notifications, then provenance/revision-impact tranches.
7. Keep provider-native P2 work feature-flagged until shared lifecycle certification is consistently green.

## Approval boundary

Prioritization and the unified-preflight first slice are approved by the request to begin implementation. Remaining
features in this document are proposals and should be implemented in priority order only when the user authorizes the
next implementation tranche.
