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

| Order | Feature                                  | Status      | Impact   | Implementation direction                                                                                                                                                                       |
| ----: | ---------------------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | Unified agent preflight                  | Implemented | Critical | `project_diagnostic` separates all four readiness layers, stores content-addressed project receipts, links their Projects UI presentation, and certifies hub and target paths in live MCP E2E. |
|     2 | Guided expected-red capture              | Implemented | Critical | Baseline cards show the approved ordered signatures and exact evidence hash, and expected regressions require a signature-bound acknowledgement before acceptance.                             |
|     3 | Guided baseline recovery                 | Implemented | Critical | Every current and historical attempt presents its durable state, classified root cause, only safe next action, immutable evidence links, and retry consequences.                               |
|     4 | Lifecycle command center                 | Implemented | High     | The project-bound plan surface now consolidates the current gate, owner, blockers, active attempt, exact next action, scoped review URL, and recovery entry point.                             |
|     5 | Exact validation and execution preview   | Implemented | High     | Validation review renders the canonical Gherkin projection, selected actions and locators, scenarios, runtime matrix, and all immutable publication/execution hashes.                          |
|     6 | Golden lifecycle certification harness   | Implemented | High     | `npm run certify:plan-builder` executes representative greenfield publication and existing-project managed-capsule lifecycles and retains a content-addressed local certification receipt.     |
|     7 | Per-plan timing and efficiency telemetry | Implemented | High     | The coordinator boundary records duration, wait time, retries, tool calls, response size, and recovery cost per phase with local-only storage and bounded per-plan retention.                  |

## P1 - Authoring leverage, observability, and auditability

| Order | Feature                                   | Status      | Impact      | Implementation direction                                                                                                                                                                |
| ----: | ----------------------------------------- | ----------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     8 | Validation coverage explorer              | Implemented | High        | The validation surface maps task intent through validation nodes, scenarios, steps, reviewed actions and locators, and keeps uncovered intent explicit before review.                   |
|     9 | Live agent activity view                  | Implemented | High        | The plan surface projects current phase, latest durable event, human/agent wait state, exact next action, and bounded five-stage progress without private reasoning.                    |
|    10 | Event-driven lifecycle notifications      | Implemented | High        | Event reads and the UI project review readiness, change requests, approvals, blocked attempts, recovery/review readiness, and completion sign-off notifications.                        |
|    11 | Validation AST starter and export         | Implemented | High        | `validation_context_read` returns an editable uncovered starter plus content-addressed canonical JSON importable through `validation_ast_check`; semantic ownership remains agent-held. |
|    12 | Plan-intent context pack                  | Implemented | Medium-high | The bounded authoring resource includes approved intent, constraints, requirement IDs, target metadata, task validation intent, and reusable-resource counts.                           |
|    13 | Reusable validation recipes               | Implemented | Medium-high | The authoring resource packages registry-first navigation, form-outcome, and persistence recipes while requiring exact action and locator review.                                       |
|    14 | Greenfield runtime preparation proposal   | Implemented | Medium-high | Missing project environments produce a review-required Appraise-resource proposal with `targetWorkspaceMutation: none`; ready projects proceed without mutation.                        |
|    15 | Evidence provenance timeline              | Implemented | Medium-high | One immutable timeline correlates revisions/events, validation receipts, baseline and implementation TestRuns, checkpoints, completion evidence, and delegation.                        |
|    16 | Revision-impact analysis                  | Implemented | Medium-high | Revision/base identities identify stale validations, selected resources, approvals, baselines, implementation groups, and remarks.                                                      |
|    17 | Automatic delegated-authorization receipt | Implemented | Medium      | Each durable delegation consumption is automatically content-addressed and attached to its signed authorization and the plan provenance timeline.                                       |

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

Unified preflight is complete in the roadmap implementation branch:

- `project_diagnostic` accepts observed tools, observed resources, and an expected target workspace.
- It reports App/API identity, active MCP transport, current-task capabilities, and target binding as separate layers.
- It returns `needs_observation` rather than claiming client readiness when the immutable task snapshot is unavailable.
- Missing capability sentinels and target mismatches produce bounded recovery guidance.
- Every diagnostic stores an idempotent, project-scoped receipt and returns its direct Projects URL.
- The Projects UI displays the four exact layers, missing capabilities, MCP surface identity, and observation time.
- Live MCP E2E certification covers a hub-bound ready receipt and a registered-target ready receipt rendered by the
  UI.
- Agent setup sentinels, MCP contract fixtures, generated coordinator reference, tests, docs, and Graphify outputs are
  aligned with the new contract.

The baseline recovery epic is also complete:

- Expected-red evidence is displayed beside its approved ordered signatures and signature hash.
- Expected product failures and unrelated existing failures both require an acknowledgement bound to the exact
  attempt and signature hash.
- Each attempt explains its classified root cause, allowed recovery action, and the consequences of retrying.
- Repair clears review/runtime projections while preserving immutable attempt and TestRun history.

The command and preview surfaces are complete:

- The project-bound lifecycle command center projects the current Appraise-owned gate, responsible actor, blockers,
  active managed attempt, exact next action, and scoped review/recovery links.
- The validation review surface reads the immutable publish journal and shows canonical Gherkin, actions, locators,
  scenarios, runtime matrix, and AST/context/preview/receipt/projection/runtime-input hashes before execution.

The lifecycle confidence layer is complete:

- The golden certification command exercises greenfield validation publication and an existing-project managed
  runtime capsule through Appraise-owned gates, then stores an immutable matrix hash, outcome, duration, and commit.
- The plan review surface displays the latest certification receipt and locally retained per-phase efficiency totals.
- Coordinator POST operations record bounded timing, wait, retry, response-size, tool-call, and recovery-cost metrics
  without allowing telemetry failure to alter the lifecycle response.

The first P1 authoring tranche is complete:

- `validation_context_read` now returns a bounded plan-intent context pack, deterministic editable AST starter and
  canonical export, registry-first recipes, a task/requirement coverage explorer, and a review-only runtime proposal.
- Starters label every mapping uncovered and require agent editing plus Appraise check/preview/review, so Appraise
  does not infer validation semantics from plan prose.
- The validation UI maps task intent to validation nodes, scenarios, stimulus/observation steps, selected actions,
  locators, and uncovered intent before review.

The P1 observability and audit tranche is complete:

- The plan surface shows bounded live activity, actionable event-driven notifications, revision impact, and an
  immutable evidence-provenance timeline without exposing private agent reasoning.
- Coordinator event reads include notification projections for review readiness, changes, approvals, blocked and
  recovery-ready attempts, and final completion sign-off.
- Every replay-safe delegated authorization consumption has a deterministic operation receipt hash and is attached
  to the plan provenance timeline beside its signed parent authorization.

## Recommended implementation sequence

1. Finish unified-preflight UI presentation and add it to the golden lifecycle harness.
2. Implement guided expected-red capture and baseline recovery as one recovery epic.
3. Build the lifecycle command center on the resulting preflight and recovery contracts.
4. Add exact validation/execution preview and per-plan timing telemetry.
5. Establish the golden certification matrix before starting P1 authoring accelerators.
6. Deliver P1 in coverage/AST, activity/notifications, then provenance/revision-impact tranches.
7. Keep provider-native P2 work feature-flagged until shared lifecycle certification is consistently green.

## Approval boundary

The current implementation request authorizes P0 and P1 in priority order. Provider-native P2 remains explicitly
deferred and must not be implemented in this branch.
