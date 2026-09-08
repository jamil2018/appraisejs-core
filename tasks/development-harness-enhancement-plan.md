# AppraiseJS Development Harness Enhancement Plan

## Summary

Enhance the repository development harness with:

- Efficient routing and validation.
- Capability-based agent profiles with bounded model selection.
- Durable lessons and improvement proposals that can be handled later.

Development tasks may finish with improvements safely backlogged. Learning and proposal maintenance happen automatically; changes to harness policy require user approval.

**Scope:** repository development tooling only. Appraise’s product Quality Journey harness and global Codex memory are excluded.

> **Task tracking instruction for implementing agents:** Maintain this plan as the implementation checklist. Change each task’s checkbox from `[ ]` to `[x]` immediately after completing its implementation and required verification. Do not check partially completed or blocked tasks. Record blockers and relevant verification evidence beneath the affected task. Update the saved plan before each handoff and final response so another agent can resume from its current status.

## Design Decisions

### Agent selection

Separate three versioned contracts:

| Contract         | Responsibility                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Agent profiles   | Responsibilities, required capabilities, authority, context boundaries, and stopping conditions      |
| Model catalog    | Approved exact model IDs, supported effort levels, capability assessments, and availability evidence |
| Selection policy | Deterministic rules selecting a model and effort from task requirements                              |

Preserve investigator, executor, advanced executor, solver, and judge roles. Use today’s model mappings as initial defaults.

Determine whether delegation is useful before selecting a model. Localized, low-risk, strongly verifiable work stays coordinator-only. Delegated work resolves to an exact approved model ID and effort at spawn time.

Model selection cannot expand permissions or relax independence requirements. Unsupported selections may use only approved compatible fallbacks; otherwise report the limitation. Explicit user overrides must remain compatible with host capabilities.

### Durable learning

| Record                | Purpose                                          | Storage                                            |
| --------------------- | ------------------------------------------------ | -------------------------------------------------- |
| Run observations      | Outcomes, measurements, failures, and recoveries | Existing local development journal                 |
| Lessons               | Reusable findings                                | Versioned `docs/development-harness/lessons/`      |
| Improvement proposals | Changes available for later consideration        | Versioned `docs/development-harness/improvements/` |

Repository records use Markdown with validated YAML metadata and sanitized evidence summaries. Raw transcripts, secrets, large logs, and machine-specific details remain excluded.

Lessons describe applicability, evidence, confidence, counterexamples, harness version, and last validation. Proposals describe the problem, supporting records, suggested change, expected benefit, effort, risks, acceptance measurements, status, and history.

Proposal states are **proposed, deferred, accepted, implementing, evaluating, verified, rejected, and superseded**. Proposal status does not block unrelated feature completion.

## Phase 1 — Foundations and Baseline

Establish consistent contracts and measure the current workflow before optimizing it.

### Tasks

- [x] Capture baseline timings, command counts, retries, and agent counts for representative documentation, localized fix, UI, and cross-module tasks.
- [x] Separate development-harness entry guidance from product Quality Journey documentation.
- [x] Correct coordinator-only routing for localized, low-risk, strongly verifiable execution.
- [x] Define versioned agent-profile, model-catalog, and selection-policy schemas.
- [x] Centralize existing model mappings and generate or validate host configuration from the canonical catalog.
- [x] Define validated observation, lesson, and improvement-proposal records with stable IDs and evidence references.
- [x] Document advisory-learning authority, approval boundaries, and task-completion independence.
- [x] Reconcile release waiver behavior with documented acceptance policy.
- [x] Add focused regression tests and update affected current documentation.

### Acceptance

Existing model choices remain the defaults. Routing tests prove simple work needs no subagent and consequential work retains its required review. Invalid records and inconsistent configuration fail clearly. Baseline measurements distinguish observed values from unavailable data.

## Phase 2 — Durable Learning and Deferred Improvements

Make experience reusable across runs without requiring immediate harness changes.

### Tasks

- [x] Implement observation capture for useful successes, failures, recoveries, repeated work, and development costs.
- [x] Implement agent-assisted synthesis with deterministic record and reference validation.
- [x] Consolidate matching evidence idempotently; preserve ambiguous matches and contradictory findings.
- [x] Implement proposal transitions, including deferral reasons, revisit conditions, rejection, and supersession.
- [x] Add commands to retrieve lessons, list/show proposals, consolidate evidence, defer or accept work, and record evaluation.
- [x] Import existing pending evolution observations idempotently, preserving provenance and existing guidance.
- [x] Retrieve a bounded set of lessons relevant to task paths, task class, and harness version.
- [x] Implement stale-lesson marking, revalidation, reminder suppression, and contextual resurfacing.
- [x] Add task-completion capture that records proposals without demanding immediate approval.
- [x] Add lifecycle, migration, deduplication, retrieval, and authority-boundary tests.
- [x] Update agent recipes to use the learning system at intake, completion, and handoff.

### Acceptance

A feature can finish with an improvement backlogged. Several runs can strengthen one proposal without duplicate counting. A fresh checkout can understand repository records without the original journal.

Rejected or unchanged suggestions remain suppressed; materially new evidence can trigger reconsideration. Advisory records cannot silently modify mandatory instructions, permissions, catalogs, or selection policy.

## Phase 3 — Adaptive Execution and Efficient Validation

Apply approved selection rules and remove repeated development work.

### Tasks

- [x] Implement deterministic model/effort selection using task scope, evidence needs, judgment, consequence, verification strength, and expected effort.
- [x] Preserve existing mappings when evidence is insufficient; support compatible explicit overrides and approved fallbacks.
- [x] Implement a Codex adapter that resolves selections into supported spawn arguments while preserving profile constraints.
- [x] Detect hosts that cannot honor a selected model/profile combination and report the limitation explicitly.
- [x] Record selection inputs, rationale, catalog/policy versions, fallback use, and available host receipts.
- [x] Distinguish requested settings from verified effective execution; support reproducing recorded selections.
- [x] Add a read-only development diagnostic for dependencies, Git state, skills, browser capabilities, and host selection support.
- [x] Introduce a validation registry covering affected surfaces, prerequisites, stages, and timeouts.
- [x] Use the registry to maintain the validation matrix and verify CI coverage.
- [x] Handle staged changes, untracked source, renames, and deletions; broaden checks for unknown/shared configuration changes.
- [x] Reuse valid build prerequisites within a validation session and invalidate reuse when relevant inputs or toolchain versions change.
- [x] Skip code-analysis hooks for strictly documentation-only changes while retaining source, dependency, and configuration checks.
- [x] Add scope-aware Graphify navigation, freshness reporting, and deletion-aware refresh.
- [x] Bound verification command duration and capture command timing, retries, and prerequisite reuse.
- [x] Bind consequential reviews to the exact artifact and invalidate acceptance after affected changes.
- [x] Add selection, adapter, fallback, validation, invalidation, and CI-composition regression tests.

### Acceptance

The same profile can select different approved model/effort combinations under explicit policy fixtures. Unsupported selections fail clearly, and stronger models receive no additional authority.

Validation avoids redundant prerequisites without skipping required checks. Changes to relevant inputs invalidate reused work. Missing required CI coverage is detected.

## Phase 4 — Integration Verification and Handoff

Verify the delivered mechanisms and immediate mechanical improvements. Accumulated learning effectiveness and comparative model performance belong to a separate future optimization cycle.

### Tasks

- [x] Verify the integrated observation-to-lesson-to-proposal workflow using deterministic fixtures.
- [x] Verify consolidation, contradictory evidence, stale lessons, reminder suppression, and contextual resurfacing.
- [x] Exercise deferred proposal pickup, approval, implementation, and evaluation transitions across simulated task boundaries.
- [x] Verify that development tasks can complete while unrelated improvement proposals remain backlogged.
- [x] Verify approval boundaries, model-selection rules, compatible fallbacks, and requested-versus-effective execution reporting.
- [x] Verify existing-journal migration, idempotency, recovery, and repository-record usability without the original local journal.
- [x] Verify measurement capture and provenance; ensure missing measurements remain unknown and synthetic evidence is clearly labeled.
- [x] Benchmark immediate mechanical improvements, such as prerequisite reuse and documentation-only hook handling, against controlled baseline measurements.
- [x] Run the integrated harness checks and all validation required by the affected surfaces.
- [x] Complete an independent review of consequential changes against the final artifact and verification evidence.
- [x] Document operation, troubleshooting, limitations, and the procedure for a separate future optimization cycle.
- [x] Update handoff evidence and task checkboxes to reflect actual completion.

### Acceptance

All implementation and integration checks can be completed during development without waiting for real task accumulation.

Initial acceptance establishes that the harness behaves correctly, preserves authority boundaries, and collects usable evidence. Controlled benchmarks establish only the mechanical improvements they directly measure.

Long-term learning usefulness, sustained productivity gains, and model superiority are **not acceptance requirements for this plan**. No future operational-evaluation tasks remain open in this checklist.

## Defaults and Boundaries

- **Codex first, portable core.**
- **Capability-based profiles; exact model IDs at spawn.**
- **Deterministic selection within approved policy.**
- **Repository-owned advisory learning and contextual resurfacing.**
- **No scheduled digests or background automation.**
- **No autonomous changes to models, selection policy, authority, or quality gates.**
- Preserve unrelated working-tree changes throughout implementation.

## Implementation evidence

- Branch: `codex/development-harness-enhancements`. Preserved pre-existing lockfile and collaboration-plan changes.
- Initial `npm run check:harness`: 33 tests passed; profile and active-document checks passed.
- Release and Graphify argument regressions: 11 tests passed. Artifact binding: 2 Node tests passed. Graph freshness: 1 Node test passed.
- Diagnostics expose installed/configured facts separately from unknown host/browser runtime support.
- Runtime role/model/context/sandbox enforcement remains unverified; requested named executor-advanced profiles do not establish effective-host proof.

- Selection/routing: 21 Node tests pass, including coordinator execution fast path, fixed host profiles, independent context, content-addressed replay, and fallback constraints.
- Scaffold boundary: 73 package tests pass. Root focused validation: 20 tests pass.
- Release CI/artifact/package policy and Fallow release baselines pass. React Doctor CI passes with existing warnings (78/100).
- Initial build failed on restricted Google Fonts access; network retry compiled then found a new run-vitest receipt typing issue being repaired before final build.

- Durable learning: 12 integration tests pass; migrated63 observations idempotently. Normal consolidation repaired26 historical lessons to stale/low; one current validated lesson remains active. Portable record/reference checker passes against64 local observations.
- Historical representative task measurements are explicitly unknown; controlled fixture command/timing measurements are recorded in the evidence file, not claimed as historical or application performance.

## Final acceptance evidence

All four phases are implemented and verified. See [the evidence record](development-harness-enhancement-evidence.md) for test counts, recovery details, authority limits, and measurements. Independent review resolved every material finding; its final artifact receipt is stored in the ignored local `.appraisejs/` directory.
