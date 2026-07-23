# Routing And Evolution

## Assignment contract

Give each agent only the task-local context it needs:

```yaml
role: investigator | solver | executor | judge
questionOrObjective: string
facts: []
acceptedDecisions: []
scope:
  allowedPaths: []
  prohibitedChanges: []
acceptanceCriteria: []
validation: []
requiredOutput: []
externalActions:
  allowed: []
  approvalEvidence: null
delegationContext:
  inheritedTurns: none | bounded | all | not-applicable
  evidence: string
```

Require returned claims to distinguish facts, inferences, assumptions, decisions, unknowns, and validation evidence.
Do not pass raw logs or full transcripts when a bounded ledger or decision record exists.

Spawn `solver` and `judge` with no inherited parent transcript when the host supports it. Otherwise use the smallest
deliberate bounded context. Their assignment must contain only the contract above, the relevant evidence or artifacts,
and accepted decisions. Do not leak the producing agent's recommendation into an independent judge assignment unless
evaluating that recommendation is the explicit task.

Static configuration cannot prove the runtime context boundary. Record the actual inheritance mode and evidence for
solver and judge delegations. Treat full or unverified context for either role as an evolution trigger.

## Routing

Classify each assignment by judgment, verifiability, and consequence:

| Condition                                                       | Route                              |
| --------------------------------------------------------------- | ---------------------------------- |
| Important facts are missing or disputed                         | `investigator`                     |
| Low judgment with strong deterministic verification             | `executor`                         |
| Medium judgment with strong verification                        | `executor`                         |
| Evidence exists but high judgment or causal arbitration remains | `solver`                           |
| Weak verification with high consequences                        | `judge`                            |
| Security, migration, persistence, or public-contract risk       | `solver`, then independent `judge` |

Use the investigator to establish facts and causal candidates, the solver to arbitrate causes only after evidence
exists, and the executor to reproduce or fix only after the relevant invariants are settled. Use independent
investigators only for distinct evidence lanes. Escalate an executor after two failed attempts, a material scope
expansion, or discovery that an accepted invariant is wrong.

## Run scorecard

Score each dimension from 0 to 2:

| Dimension            | 2                                             | 1                                          | 0                                               |
| -------------------- | --------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Accuracy             | Claims and outcome are fully evidence-backed  | Minor uncertainty is disclosed             | Unsupported material claim or incorrect outcome |
| Requirement coverage | Every acceptance condition has evidence       | Non-critical evidence gap is disclosed     | Material requirement is missed                  |
| Routing quality      | Roles match needs without rerouting           | One avoidable reroute or oversized handoff | Repeated misrouting or wrong authority          |
| Efficiency           | No redundant agent work or repeated discovery | Some duplication with useful net evidence  | Duplication, idle fan-out, or needless Sol      |
| Coordination         | Clean scopes and integration                  | Minor repair or clarification              | Conflict, lost context, or coordinator rework   |

Interpret the total:

- 9-10: healthy.
- 7-8: acceptable; record the weakest dimension.
- 5-6: optimization indicated.
- 0-4: harness failure.

Any critical accuracy, authorization, destructive-action, or evidence-integrity failure overrides the total and marks
the run as a harness failure.

## Evolution triggers

Evaluate the complete operating system, not only task correctness. Look for non-optimal behavior in:

- Outcomes: accuracy, requirement coverage, regressions, and evidence quality.
- Swarm operation: routing, model fit, delegation boundaries, coordination, retries, duplication, and integration.
- Resource efficiency: token consumption, latency, concurrency, idle fan-out, and unnecessary premium-model work.
- Harness usability: clarity, setup friction, command ergonomics, discoverability, diagnostics, recovery, and operator
  effort.
- Governance: authorization, context isolation, ledger integrity, deterministic validation, and policy drift.

Note and notify the user when any condition holds:

- The run scores below 10 or any assessed surface is non-optimal.
- A critical override occurs.
- Two executor attempts fail for the same reason.
- More than one avoidable reroute occurs.
- Concurrent agents duplicate the same evidence or create overlapping-write conflict.
- The coordinator must materially redo an agent's work.
- Sol performs routine discovery or mechanical execution that Luna or Terra could have completed.
- A judge finds a material issue after the executor and deterministic checks reported completion.
- In the durable ledger's last five runs with the same `taskClass`, two or more score 6 or lower or repeat the same
  weakest dimension.

## Note, notify, update

Evolution is a user-governed state machine:

1. **Note:** preserve a structured observation with domain, severity, evidence, impact, and proposed options.
2. **Notify:** tell the user what is non-optimal and why it matters. Mark the run as `awaiting_user_guidance`.
3. **Guidance:** do not alter roles, models, prompts, tools, thresholds, concurrency, or harness behavior until the
   user's direction is recorded.
4. **Update:** implement only the guided change, verify it deterministically, and attach the update and verification
   evidence to the originating run with the `ready` transition.
5. **Re-evaluate:** score the changed harness again. A remaining issue starts a new note-notify cycle.

Use `npm run swarm:evolve -- --run-id <id> --action notify --delivery-receipt "<host delivery evidence>"` after
presenting the notification. When guidance arrives, preserve host provenance with
`--action guide --guidance "<user direction>" --authority-source host-conversation --thread-id "<id>" --message-id "<id>"`.
These fields are audit metadata, not authentication: only the actual host conversation grants authority. Then use
`--action ready --update "<change>" --verification "<evidence>"` after deterministic checks. Only then record a fresh
independent re-evaluation and use `--action complete --reevaluation-run-id "<id>"`. Completion rejects older or
already-linked evaluations and closes both sides of the cycle.

## Observation format

Include this compact note only when useful:

```yaml
swarmHarness:
  score: 0-10
  status: healthy | acceptable | optimization_indicated | failed
  weakestDimension: string
  evidence:
    - string
  proposedOptimization:
    - string
  userDecisionRequired: true | false
```

For a healthy run, a one-line score is sufficient when the user asked to evaluate the harness. Otherwise avoid
cluttering the result. For an optimization trigger, always show the note and ask whether the user wants the proposed
configuration or instruction change. Do not change the harness automatically.

## Durable ledger

Record every scored swarm run:

```bash
npm run swarm:record -- \
  --task-class "<stable comparable class>" \
  --accuracy <0-2> \
  --coverage <0-2> \
  --routing <0-2> \
  --efficiency <0-2> \
  --coordination <0-2> \
  --solver-context <none|bounded|all|not-used> \
  --solver-context-evidence "<receipt:fork_turns:none|receipt:fork_turns:bounded:N|not-used>" \
  --judge-context <none|bounded|all|not-used> \
  --judge-context-evidence "<receipt:fork_turns:none|receipt:fork_turns:bounded:N|not-used>" \
  --evidence "<concise evidence>" \
  --optimization "<proposed change or none>" \
  [--observation "<domain>|<minor|material|critical>|<summary>|<evidence>|<impact>|<proposed-options>"] \
  [--trigger "<allowed trigger code>"] \
  [--critical-override "<accuracy, authority, destructive-action, or evidence-integrity failure>"]
```

The command appends a versioned, hash-chained event to `.appraisejs/swarm-events.jsonl`, which is local and Git-ignored.
The journal validates complete run schemas and detects accidental edits, but it is not authenticated authority because
workspace writers can replace local files. Use `npm run swarm:ledger -- <list|show|status|recover>` for inspection and
malformed-tail recovery. The recorder
derives the total, weakest dimensions, and status from the five dimension scores plus any critical override. It
reports immediate event triggers separately from the comparable five-run longitudinal trigger. A past one-off event
does not repeatedly trigger later clean runs. Use stable task classes such as
`localized-fix`, `cross-module-feature`, `architecture-review`, or `release-gate`; do not invent a unique class per run.
Allowed trigger codes are `executor-retry`, `avoidable-reroute`, `duplicate-work`, `coordinator-rework`,
`oversized-sol`, `judge-material-finding`, and `context-boundary-unverified`.
