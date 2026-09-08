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

## Universal intake and routing

Perform a bounded classification for every project-engineering task. Consider:

- epistemic need: whether facts, causes, or invariants are missing;
- consequence: local, cross-module, or security/persistence/migration/public-contract risk;
- verifiability: strong deterministic checks versus weak or observational evidence;
- separability: whether a bounded evidence or execution lane can proceed independently;
- estimated effort: localized, extended mechanical, or cross-module work.

Classification does not imply delegation. Trivial, localized, low-consequence work with strong deterministic
verification selects `coordinator-only`, `coordinator`, and zero subagents. Long but mechanical work may use an
executor; small but high-consequence work may require Sol judgment. Product lifecycle transitions are outside this
engineering router and remain Appraise-owned.

Classify each assignment by judgment, verifiability, and consequence:

| Condition                                                       | Route                              |
| --------------------------------------------------------------- | ---------------------------------- |
| Trivial/local and strongly deterministically verifiable         | `coordinator-only`                 |
| Important facts are missing or disputed                         | `investigator`                     |
| Low judgment with strong deterministic verification             | `executor`                         |
| Cross-module, medium judgment with strong verification          | `executor-advanced`                |
| Evidence exists but high judgment or causal arbitration remains | `solver`                           |
| Weak verification with high consequences                        | `judge`                            |
| Security, migration, persistence, or public-contract risk       | `solver`, then independent `judge` |

Use the investigator to establish facts and causal candidates, the solver to arbitrate causes only after evidence
exists, and an executor to reproduce or fix only after the relevant invariants are settled. Use independent
investigators only for distinct evidence lanes. Escalate after two executor failures, a material scope expansion,
contradictory evidence, weak verification at high consequence, or discovery that an accepted invariant is wrong.
Security, persistence, migration, and public-contract risk require Sol-level judgment and conditional independent
evaluation. Do not route routine discovery or mechanical execution directly to Sol.

## Profile matrix

| Profile             | Role         | Model / effort          | Authority       | Stop or escalate when                                      |
| ------------------- | ------------ | ----------------------- | --------------- | ---------------------------------------------------------- |
| `coordinator`       | coordinator  | host coordinator        | current task    | evidence or consequence exceeds the coordinator fast path  |
| `investigator`      | investigator | Luna / medium           | read-only       | facts are established or judgment is required              |
| `executor`          | executor     | Terra / medium          | workspace-write | an invariant fails or scope becomes ambiguous              |
| `executor-advanced` | executor     | Terra / high            | workspace-write | irreducible judgment or weak verification remains          |
| `solver`            | solver       | Sol / high              | read-only       | evidence is missing or user authority is required          |
| `judge`             | judge        | Sol / high, independent | read-only       | result is accepted, revision is required, or proof is weak |

Static registration requests these properties but does not prove host enforcement. Record each runtime property as
verified only when a host receipt supports it; otherwise use `unverified`.

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

## Advisory learning and approved updates

Use the versioned repository learning system documented in `docs/development-harness.md` for new observations,
lessons, and improvement proposals. Capture and consolidate useful evidence automatically. Retrieve bounded relevant
lessons at intake, record costs and recoveries at completion, and preserve proposal IDs at handoff. Matching evidence
is idempotent; contradictory findings and ambiguous matches remain visible. Mark stale lessons, suppress rejected or
unchanged suggestions, and resurface only when context or materially new evidence warrants reconsideration.

Proposed and deferred improvements do not block unrelated feature completion. Deferral records a reason and revisit
conditions. Acceptance, implementation, and evaluation require the corresponding evidence and actual host-conversation
user direction before policy changes. Advisory content cannot alter roles, models, permissions, mandatory guidance,
selection policy, concurrency, or quality gates. Do not change the harness automatically.

The existing `swarm:evolve` state machine remains available for historical local runs: note, notify, guide, ready,
independent re-evaluation, complete. Pending observations can be imported idempotently into the advisory backlog with
provenance and existing guidance preserved. Import does not fabricate approval or mark the original run verified.
Use new proposal records to pick up approved improvements across task boundaries without forcing an immediate pause.
Metadata is audit provenance, not authenticated authority; only the host conversation grants permission.

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
cluttering the result. For an optimization trigger, capture a proposal and report its ID when useful. Unrelated work
may finish with the proposal backlogged. Ask for guidance only when picking up an unapproved policy change.
Do not change the harness automatically.

## Durable ledger

Record meaningful, delegated, anomalous, or consequential routing decisions before the full scorecard:

```bash
npm run swarm:route -- \
  --task-class "<stable class>" \
  --route-input '{"requiresExecution":true,"crossModule":true,"verificationStrength":"strong"}' \
  --rationale "<concise selection rationale>" \
  --classification-latency-ms <milliseconds>
```

The immutable route receipt is recorded before delegation or execution. Every later scored run links back with
`--routing-decision-id`; a route never points forward to a run. Runtime proof defaults to unverified, including the
role, model, reasoning effort, inherited context, and sandbox claims. Verify each property separately only with an
effective-host receipt that matches the selected profile: `host-effective-role:<role>`,
`host-effective-model:<model>`, `host-effective-reasoning:<effort>`,
`host-effective-context:fork_turns:none|bounded:<N>`, or `host-effective-sandbox:<sandbox>`. A requested selector or
`fork_turns` setting is not evidence and must remain unverified.
Inspect proportional aggregates with `npm run swarm:ledger -- metrics --task-class "<stable comparable class>"`; zero-agent rate is an efficiency measure, not
an automatic under-routing failure. Repeated under-routing or oversized Sol observations require user guidance and
never authorize automatic harness changes.

Record every scored swarm run:

```bash
npm run swarm:record -- \
  --task-class "<stable comparable class>" \
  --routing-decision-id "<earlier routing decision id>" \
  --accuracy <0-2> \
  --coverage <0-2> \
  --routing <0-2> \
  --efficiency <0-2> \
  --coordination <0-2> \
  --solver-context <none|bounded|all|not-used> \
  --solver-context-evidence "<host-effective-context:fork_turns:none|host-effective-context:fork_turns:bounded:N|not-used>" \
  --judge-context <none|bounded|all|not-used> \
  --judge-context-evidence "<host-effective-context:fork_turns:none|host-effective-context:fork_turns:bounded:N|not-used>" \
  --evidence "<concise evidence>" \
  --optimization "<proposed change or none>" \
  [--observation "<domain>|<minor|material|critical>|<summary>|<evidence>|<impact>|<proposed-options>"] \
  [--trigger "<allowed trigger code>"] \
  [--critical-override "<accuracy, authority, destructive-action, or evidence-integrity failure>"]
```

The command appends a versioned, hash-chained event to `.appraisejs/swarm-events.jsonl`, which is local and Git-ignored.
The journal validates complete run schemas and detects accidental edits, but it is not authenticated authority because
workspace writers can replace local files. Use
`npm run swarm:ledger -- <list|show|routes|metrics|status|recover>` for inspection and
malformed-tail recovery. The recorder
derives the total, weakest dimensions, and status from the five dimension scores plus any critical override. It
reports immediate event triggers separately from the comparable five-run longitudinal trigger. A past one-off event
does not repeatedly trigger later clean runs. Use stable task classes such as
`localized-fix`, `cross-module-feature`, `architecture-review`, `release-gate`, or `harness-configuration`; do not
invent a unique class per run. Routing fixtures may use these intake aliases, which normalize before recording:
`mechanical-refactor` and `runtime-debugging` → `localized-fix`; `architecture-decision` → `architecture-review`;
`public-contract-change` and `security-change` → `cross-module-feature`.
When the linked routing decision requires an independent judge, the scored run is rejected unless `judgeContext` is
`none` or `bounded` and `judgeContextEvidence` is the matching effective-host context receipt. `not-used`, `all`, and
requested-selector receipts cannot produce a healthy or final scored run for that route.
Allowed trigger codes are `executor-retry`, `avoidable-reroute`, `duplicate-work`, `coordinator-rework`,
`oversized-sol`, `judge-material-finding`, and `context-boundary-unverified`.
