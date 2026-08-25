# Implementation Plan: Appraise-owned lifecycle sessions

## Goal

Introduce a resumable, Appraise-owned lifecycle session that lets human and agent callers advance the existing
requirements-to-decision workflow without reconstructing Appraise's internal packets. Preserve every current
approval, credential, execution, evidence, and decision gate. Existing domain records remain authoritative.

## Integrated baseline (2026-08-26)

The Quality Operating System work recovered from `codex/quality-operating-system` at `8bb197b2` is now the retained
domain foundation for this plan. It adds methodology-bound requirement analysis, validation-design revisions,
execution consent, evidence-backed findings, attribution rules, deterministic critique, and Quality OS certification.
The current branch additionally owns remote target scope, frozen environment partitions, canonical preflight,
validation generation/publication, credential authorization, and managed execution hardening.

This baseline is substantial but does **not** implement lifecycle sessions or a product-level multi-agent role
runtime. In particular, it has no canonical session projection/head hash, compare-and-swap session command,
session-safe reconnect surface, role work item, lease, or role-scoped capability contract. Quality OS services remain
authoritative domain transitions that the session and role layers will orchestrate rather than replace.

Current coverage against this plan:

- Phase 0 is partial: analysis/design fixtures exist, but the complete local, remote, partitioned, credential,
  blocked, successor, and decided session corpus does not.
- Phases 1 and 2 are unimplemented.
- Phases 3 through 5 have strong underlying domain authorities but no session transition layer.
- Phase 6 and clean-room session cutover are unimplemented.

## Success criteria

- A zero-context agent can select and resume a target-scoped session from Appraise data alone.
- Reads return the latest safe head; every mutation uses the exact observed `expectedStateHash`.
- Concurrent stale mutations fail as `SESSION_STATE_ADVANCED` before domain mutation.
- Interrupted commands resume from durable Appraise command receipts without duplicating domain artifacts.
- Requirements, design, execution authorization, and final decision remain bound to their exact existing hashes.
- Session projections and hashes contain no credential value, secret-derived digest, environment snapshot, or raw
  realization/publication packet.
- Existing UI and low-level MCP workflows remain compatible until an explicit deprecation milestone.
- Root and scaffold implementations, generated contracts, docs, and seeded databases remain synchronized.

## Architecture boundaries

### Existing authorities retained

- Methodology, requirements, and design: `quality-operating-system-service.ts`, `quality-design-service.ts`,
  `RequirementAnalysisRevision`, `ValidationDesignRevision`, `QualityPlanRevision`, and `ValidationVersion`.
- Realization and preparation: `assessment-preparation-service.ts`.
- Remote identity and partitions: `remote-evaluation-scope-service.ts`.
- Publication authority: `QualityValidationGeneration` and `QualityValidationPublication`.
- Credential authority: `credential-execution-authorization-service.ts`.
- Authorization, execution, and evidence: `ExecutionConsent`, `assessment-execution-service.ts`, `AssessmentRun`,
  `EvidenceReceipt`, and `AssessmentFinding`.
- Decision: `decideQualityAssessment` and `AssessmentDecision`.

### New session responsibilities

- Target-scoped discovery and explicit resume selection.
- A canonical safe projection of the current authoritative lifecycle state.
- Append-only state revisions and a compare-and-swap head hash.
- Typed allowed actions, blockers, and recovery guidance.
- Durable transition reservations that reconcile exact idempotent domain outcomes after interruption.
- Appraise-owned role work items that expose only the safe inputs and admissible outputs for the current phase.

### Multi-agent role model

Distinct agents are execution workers, never lifecycle authorities. The session coordinator derives a bounded work
item from its current authoritative head and assigns one role at a time unless two tasks are proven independent. A
role submission is an immutable proposal or observation bound to the work-item input hash; Appraise validates it and
performs the domain transition. Agents do not share mutable conversational state and a replacement worker resumes
from the latest Appraise projection.

Initial roles are:

- `requirement_analyst`: produces facts, inferences, assumptions, queries, and obligation proposals against exact
  requirement snapshots and methodology.
- `target_explorer`: records bounded target capabilities and observations; credentials/selectors remain runtime
  realization inputs and are not promoted to requirement truth.
- `validation_designer`: proposes strategy, scenario portfolio, coverage, and failure meaning against an approved
  analysis and obligation-set hash.
- `validation_implementer`: realizes approved scenarios using the operation catalog and returns compiler-verifiable
  artifacts; it cannot approve its own design or authorize execution.
- `validation_executor`: requests or continues managed execution only after Appraise-owned preflight, consent, and
  credential gates.
- `evidence_analyst`: proposes per-obligation findings and failure attribution from sealed evidence.
- `independent_reviewer`: evaluates stabilized analysis, design, findings, or release evidence without inheriting the
  producing worker narrative; Appraise or an explicit human records the binding decision.

Each role contract defines input schema, output schema, allowed tools/actions, lease/retry semantics, artifact hash,
and prohibited authority. Role assignment and completion are projected into the session state hash, but transient
agent identity, prompts, model metadata, and narration are excluded.

### Explicit non-responsibilities

- Sessions do not store duplicate requirements, validation ASTs, realizations, publications, credentials, evidence, or
  decisions.
- Sessions do not infer approvals from chat messages.
- Sessions do not select a global "latest" evaluation across targets.
- Sessions do not bypass environment partition, credential authorization, managed execution, or evidence review.

## State and hashing model

Add append-only `EvaluationLifecycleSession`, `EvaluationLifecycleSessionRevision`, and
`EvaluationLifecycleSessionCommand` records.

The session head points to one immutable revision. A revision stores an allowlisted canonical projection containing:

- schema and hash algorithm versions;
- session and target project identity;
- current lifecycle phase;
- Quality Plan/revision and approved requirements/design hashes when present;
- remote manifest/subject, Assessment, AssessmentRun, evidence-set, and decision references when present;
- blocker codes and permitted action identifiers;
- the previous revision hash.

The state hash excludes timestamps, display labels, response modes, idempotency keys, caller ordering, arbitrary
metadata, credentials, secret-derived values, raw environment snapshots, and transient diagnostic text.

A command reservation binds `(sessionId, expectedStateHash, actionKind, canonicalActionHash, idempotencyKey)`. The
domain operation runs with its own existing idempotency authority. Finalization rereads the authoritative records,
derives the next projection, and advances the session head. If interrupted, `evaluation_session_read` or replay of
the same command reconciles the reserved command from the domain receipt. A changed payload with the same key
conflicts.

## Delivery phases

### Phase 0: Contract fixtures and lifecycle corpus

Quality OS supplies focused methodology, analysis, design, consent, and finding fixtures. Task 0.1 remains open until
those fixtures are extended into the representative end-to-end session corpus below.

#### Task 0.1 — Freeze representative lifecycle fixtures

**Description:** Capture deterministic local, single-environment remote, partitioned remote, credential-required,
blocked, successor, and decided lifecycle fixtures using existing services.

**Acceptance criteria:**

- Fixtures cover every current approval and terminal boundary.
- Expected authoritative IDs and hashes are asserted without storing secrets.
- Existing direct-operation behavior remains unchanged.

**Verification:** Focused coordinator service and real-SQLite fixture tests.

**Dependencies:** None.

**Likely files:** New tests under `src/services/coordinator/`; matching scaffold copies.

### Phase 1: Read-only session projection

#### Task 1.1 — Define the canonical session projection and hash

**Description:** Add a strict versioned projection schema, canonicalizer, domain separation, and secret/non-portable
value guard.

**Acceptance criteria:**

- Equivalent authoritative state produces identical bytes regardless of query/discovery order.
- Incidental inputs and credential rotation do not change the state hash.
- Any unsupported or secret-bearing field fails closed.

**Verification:** Canonicalization, mutation, reordering, and secret-canary unit tests.

**Dependencies:** Task 0.1.

**Likely files:** `src/lib/quality-design/evaluation-session-contract.ts` and tests.

#### Task 1.2 — Persist immutable sessions and revisions

**Description:** Add target-scoped session, revision, and head relations with insert-only revision protection and
restrictive foreign keys to authoritative lifecycle records.

**Acceptance criteria:**

- One session head references one immutable revision.
- Cross-target references and revision rewrites are rejected by database constraints.
- Migration upgrades populated and empty databases and preserves all current records.

**Verification:** Prisma validation plus migration upgrade, constraint, and rollback-fixture tests.

**Dependencies:** Task 1.1.

**Likely files:** `prisma/schema.prisma`, one migration, migration tests, scaffold mirrors.

#### Task 1.3 — Implement target-scoped create, list, and read

**Description:** Build a read model that derives phase, blockers, allowed actions, and links exclusively from current
authoritative records.

**Acceptance criteria:**

- A caller must select a target and session explicitly.
- Reads return the latest head and safe next action without raw internal packets.
- Drift between a stored projection and authoritative records is reported, not silently normalized.

**Verification:** Service tests for every Phase 0 fixture and foreign-target/non-enumeration tests.

**Dependencies:** Tasks 1.1–1.2.

**Likely files:** Session read-model/service, coordinator registry, tests.

### Checkpoint A — Read-only authority

- Existing lifecycle tests remain green.
- New sessions can describe every fixture without changing domain state.
- Independent review confirms the session is a projection, not a second authority.

### Phase 2: Compare-and-swap command protocol

#### Task 2.1 — Add durable transition reservations

**Description:** Persist exact command identity and expected head before invoking a domain transition, then finalize or
reconcile it from the domain's existing idempotency receipt.

**Acceptance criteria:**

- Two clients using one observed head cannot both advance it with different commands.
- Exact replay returns the committed transition; changed replay conflicts.
- A crash at reservation, domain commit, or head-finalization boundaries is recoverable.

**Verification:** Two-process SQLite races and injected interruption tests at all three boundaries.

**Dependencies:** Checkpoint A.

**Likely files:** Session command service, schema/migration extension if needed, tests.

#### Task 2.2 — Expose typed session operations through MCP

**Description:** Register `evaluation_session_create`, `evaluation_session_list`, `evaluation_session_read`, and a
versioned discriminated `evaluation_session_transition` contract.

**Acceptance criteria:**

- Tool schemas expose only actions legal for the current contract version.
- Default projections include `sessionId`, phase, `stateHash`, blockers, allowed actions, and next action.
- Malformed receipts name the session operation and provide safe same-key recovery.

**Verification:** Registry, contract-fixture, annotations, response-projector, stale-client, and malformed-receipt tests.

**Dependencies:** Task 2.1.

**Likely files:** `packages/appraisejs/src/mcp/`, coordinator registry/routes, generated reference.

#### Task 2.3 — Add role work-item assignment and submission

**Description:** Project phase-specific role work items from the session head and accept immutable, hash-bound role
outputs without granting workers direct lifecycle mutation authority.

**Acceptance criteria:**

- Every role receives only its allowlisted safe projection, input hash, allowed actions, and output schema.
- Lease expiry, replacement workers, exact replay, and stale submissions are deterministic and resumable.
- No role may approve its own artifact, bypass consent, mutate evidence, or advance the session directly.

**Verification:** Role capability negative tests, lease/reconnect races, producer/reviewer separation, secret canaries,
and zero-context worker replacement tests.

**Dependencies:** Tasks 2.1–2.2.

**Likely files:** Session role contract/service, coordinator registry, MCP domain, tests, scaffold mirrors.

### Phase 3: Planning gates through the session

#### Task 3.1 — Route requirements submission and approval

**Description:** Add typed requirements actions that call existing Quality Plan services and bind exact revision and
requirements hashes into the next session revision.

**Acceptance criteria:**

- Approval requires the exact current requirements hash.
- Queries or requirement drift block advancement with structured actions.
- Direct and session paths produce the same authoritative plan artifacts.

**Verification:** Direct/session parity and concurrent-approval tests.

**Dependencies:** Checkpoint A and Tasks 2.1–2.3.

#### Task 3.2 — Route design proposal and approval

**Description:** Add typed design actions over existing validation design services and coverage checks.

**Acceptance criteria:**

- Approval binds the exact design hash and current requirements revision.
- Coverage/query failures remain Appraise-owned blockers.
- A new agent can resume at design review with no transcript-derived state.

**Verification:** Direct/session parity, stale-design, and zero-context resume tests.

**Dependencies:** Task 3.1.

### Checkpoint B — Planning parity

- Fresh requirement-analysis and validation-design workers complete their bounded assignments solely through the
  session surface, and a replacement worker resumes without transcript replay.
- Existing human UI and low-level APIs retain behavior.
- Approval hashes and audit records are byte-equivalent across paths.

### Phase 4: Appraise-owned preparation

#### Task 4.1 — Derive environments and remote partitions server-side

**Description:** Let a session action select approved validation-to-environment intent while Appraise creates or reuses
the exact remote partition manifest and child subjects.

**Acceptance criteria:**

- Aggregate validation coverage is complete and disjoint.
- Each child retains one frozen environment and persisted membership authority.
- Callers never transport internal subset-authority packets.

**Verification:** Multi-environment replay, conflict, tamper, and cross-target tests.

**Dependencies:** Checkpoint B.

#### Task 4.2 — Internalize preflight, realization, and publication continuation

**Description:** Make `prepare` compute and persist canonical preflight, realization, generations, publications, and
Assessment identities through existing services.

**Acceptance criteria:**

- The caller supplies semantic choices, not canonical realization or preflight packets.
- Any blocker leaves a resumable session revision and no unauthorized partial execution.
- Partition children compile and publish only their persisted members.

**Verification:** Local, full-v2, and partitioned real-SQLite preparation tests plus fault injection.

**Dependencies:** Task 4.1.

#### Task 4.3 — Route exploration and realization roles

**Description:** Let target explorers submit bounded observations and validation implementers submit operation-catalog
realizations while Appraise owns partitioning, canonicalization, compilation, and publication.

**Acceptance criteria:**

- Explorer observations cannot silently rewrite requirements or approved design intent.
- Implementers receive no approval or execution authority and cannot publish arbitrary runtime packets.
- Rejected realization output returns structured critique and a new work item without weakening the approved hashes.

**Verification:** Cross-role authority negatives, stale work-item replay, unsupported-operation, and partitioned
realization tests.

**Dependencies:** Tasks 4.1–4.2 and Task 2.3.

### Phase 5: Authorization, execution, evidence, and decision

#### Task 5.1 — Represent authorization-required as session state

**Description:** Project the existing exact credential execution request into a bounded blocker and resume action.

**Acceptance criteria:**

- Session state contains only request identity/hash/expiry and safe authorization links.
- Grants remain one-use and exact-scope; secret values and secret-derived hashes never enter session state.
- Replaying the prepared session after grant consumption starts only the authorized execution.

**Verification:** Local UI and host assertion issuance, expiry, revocation, replay, and secret-canary tests.

**Dependencies:** Tasks 4.2–4.3.

#### Task 5.2 — Route managed run and reconciliation

**Description:** Advance prepared sessions through existing AssessmentRun/TestRun execution and sealed evidence
reconciliation.

**Acceptance criteria:**

- Session commands cannot introduce arbitrary publications, environments, cells, or TestRuns.
- Active/incomplete/blocked/terminal outcomes produce distinct resumable projections.
- Evidence remains bound to exact Assessment and AssessmentRun lineage.

**Verification:** Runtime-seam tests plus representative managed browser validation.

**Dependencies:** Task 5.1.

#### Task 5.3 — Route evidence review and decision

**Description:** Expose exact evidence review and decision actions without collapsing human approval into chat intent.

**Acceptance criteria:**

- Decision requires current alignment, readiness, and exact evidence-set hash.
- A decided session is immutable and links to the existing `AssessmentDecision`.
- Successors create a new explicit session lineage rather than reopening history.

**Verification:** Accepted, limited, rejected, stale, and successor parity tests.

**Dependencies:** Task 5.2.

#### Task 5.4 — Separate evidence analysis from binding review

**Description:** Assign sealed evidence to an evidence analyst for a hash-bound finding proposal, then require an
independent reviewer or explicit human gate before Appraise records the final finding/decision transition.

**Acceptance criteria:**

- Only attributed `TARGET_DEFECT` may produce a violated obligation; all other causes remain not evaluated.
- Producer and reviewer role identities cannot collapse into one binding agent decision.
- Later evidence or successor state invalidates the reviewed work-item hash and requires re-evaluation.

**Verification:** Attribution matrix, producer/reviewer separation, stale evidence-set, and successor-lineage tests.

**Dependencies:** Task 5.3 and Task 2.3.

### Checkpoint C — Complete managed lifecycle

- One local and one remote partitioned evaluation complete requirements through decision using only session tools.
- Interruption at every transition resumes without conversation replay or duplicate artifacts.
- Security review confirms credentials and authority remain confined to existing owners.

### Phase 6: UI convergence and compatibility cutover

#### Task 6.1 — Move Quality Plan and Assessment controls to the session read model

**Description:** Make human and agent surfaces consume the same phase, blockers, allowed actions, and receipts.

**Acceptance criteria:**

- UI no longer reconstructs a parallel lifecycle state machine.
- Existing approval and authorization interactions remain explicit.
- Accessibility and local-session CSRF boundaries remain intact.

**Verification:** Component, route, and Browser-plugin lifecycle tests.

**Dependencies:** Checkpoint C.

#### Task 6.2 — Deprecate direct low-level agent mutations

**Description:** Mark low-level mutations as compatibility-only, add reconnect guidance, and remove them only after two
successful clean-room session stress runs.

**Acceptance criteria:**

- Generated contracts identify the preferred session path and deprecation status.
- No UI or internal service depends on public low-level mutations before removal.
- Historical receipts remain readable and migrations are reversible at the release boundary.

**Verification:** Contract compatibility, orphan scans, negative tool-availability tests, and scaffold release checks.

**Dependencies:** Task 6.1 and two clean-room validations.

## Final release gate

- Run focused validation after each task; run the full validation/build/release suite once after the cumulative cutover
  stabilizes.
- Synchronize scaffold templates from root and verify migration/source byte parity.
- Regenerate coordinator contracts, operation references, and Graphify outputs from canonical sources.
- Perform one exact-artifact independent review covering security, migrations, concurrency, public contracts, and
  agent resumability.
- Demonstrate a new zero-context agent completing a representative remote evaluation without receiving selectors,
  credentials, internal packets, or previous conversation history.

## Risks and mitigations

| Risk                                                   | Impact   | Mitigation                                                                                           |
| ------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| Session becomes a second source of truth               | Critical | Store references and derived projections only; domain records decide validity.                       |
| Cross-service transition cannot be one transaction     | High     | Durable reservation plus exact idempotent domain receipt reconciliation and fault-injection tests.   |
| State hash changes for incidental data                 | High     | Strict allowlist, canonical ordering, domain separation, and mutation tests.                         |
| Generic transition input becomes opaque                | High     | Versioned discriminated actions with generated schemas and per-action annotations.                   |
| Compatibility layer persists indefinitely              | Medium   | Publish measurable cutover gates and remove only after UI parity and two clean-room runs.            |
| Session reads leak credentials or internal packets     | Critical | Safe projection boundary, recursive secret guard, canary tests, and independent security review.     |
| Large implementation recreates current boundary sprawl | High     | Deliver vertical phases with parity checkpoints; do not add a second implementation of domain rules. |
| Role agents become shadow lifecycle authorities        | Critical | Appraise issues work items, validates outputs, and alone commits transitions and approval decisions. |
| Producer narrative anchors independent review          | High     | Reviewer receives the exact artifact, criteria, and evidence ledger with no inherited producer chat. |

## Open decisions before implementation

1. Whether one session may create multiple successor Assessments or whether each successor starts a new linked session.
2. The retention policy for completed session command reservations and safe projections.
3. Which low-level MCP mutations remain public during the compatibility window and their removal release.
4. Whether human UI approval advances the same session automatically or requires an explicit session transition
   receipt after the domain approval commits.
5. Whether role execution is host-provided through MCP callbacks, Appraise-managed local workers, or both behind one
   role-work-item contract; the lifecycle protocol must remain transport-neutral.
