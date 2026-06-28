# AppraiseJS Planning Flow Validation Plan

## Summary

Validate the AppraiseJS planning feature as a real user workflow: the user asks an agent to generate a plan, the agent publishes it through AppraiseJS, the user reviews and gives feedback in AppraiseJS, the agent revises until exact plan approval, then prepares validation tests for user review, and only after all gates are approved proceeds to implementation. The validating agent will run the interactions, execute tests, and fix issues as they are discovered.

## Primary User Flow

- Start from a normal chat request to create a feature plan.
- Agent verifies AppraiseJS project readiness, creates a structured plan through the real coordinator/MCP/API path, and presents the AppraiseJS review link only after `plan_review_ready`.
- User finds and reviews the plan in AppraiseJS through both the direct link and the plan list/dashboard.
- User adds blocking and non-blocking feedback; agent revises the plan; user reviews revision diffs and approves the exact current hash-bound revision.
- Agent prepares validation tests only, with no product implementation unless a risky file is explicitly approved for the exact hash.
- User reviews validation nodes, generated Appraise test cases, Gherkin/step files, matrix settings, expected failures, and flagged files.
- Agent revises validation artifacts until all required validations and risky files are approved.
- AppraiseJS runs baseline combinations; user accepts expected failures, acknowledges unrelated failures, or rejects invalid baselines.
- Agent implements with checkpoint polling, handles midstream feedback, runs fresh validations, and presents completion evidence.
- User performs final completion review, including optional failures and unresolved non-blocking remarks, then explicitly signs off.

## Required Validation Flows

- Connection and setup failures:
  Test AppraiseJS not running, MCP misconfiguration, missing identity, auth failure, project mismatch, unreachable API, dirty worktree warning, and non-Git reduced-assurance warning.
- Plan discovery:
  Test direct review links plus AppraiseJS UI discovery of pending, stale, conflicted, awaiting-review, approved, cancelled, and completed plans.
- Plan creation and review:
  Test canonical links, lifecycle, content hash, projection sync, graph/list parity, keyboard review, accessible labels, task ordering, edge labels, graph failure fallback, layout save/reset, and review-ready event timing.
- User authority boundaries:
  Test that users can create, resolve, dismiss, and downgrade remarks; agents can address or dispute remarks; unresolved blocking remarks prevent progression.
- Revision loop:
  Test stale hash rejection, higher revision enforcement, revision diff display, orphaned remarks, suspicious node replacement handling, and exact revision approval.
- Cancellation and restart:
  Test user-visible terminal cancellation, blocked progression after cancellation, pending cancellation on reconnect, and restart through a new revision or derived plan.
- Validation preparation:
  Test validation node generation, Appraise test case links, Gherkin and executable step paths, matrix configuration, file classification, production/`requires_review` blocking, undeclared change blocking, changed-after-approval invalidation, and optional validation approval/rejection/defer.
- Validation feedback routing:
  Test validation feedback that changes tests only, and feedback that changes product scope and reopens plan review.
- Baseline review:
  Test expected behavioral failure acceptance, unrelated failure acknowledgement, invalid setup/fixture/infrastructure rejection, undefined steps, unexpected timeout, unmatched failure, duplicate/interrupted run recovery, rerun, and implementation unlock only after accepted required baselines.
- Implementation checkpoints:
  Test task/group checkpoints, parallel independent tasks, coordinator-owned subagent provenance, implemented vs verified states, pause/resume/cancel, queued feedback timing, scoped feedback pausing affected tasks and dependents, unaffected approval preservation, and impacted validation reruns.
- Final validation and completion:
  Test fresh required validation runs, baseline regression health, `validation_passed` before `completed`, explicit final user sign-off, optional failure handling, and unresolved non-blocking remark follow-up/dismiss/leave-open decisions.
- Recovery and persistence:
  Test app restart during plan review, validation review, baseline run, and implementation checkpoint; event redelivery; acknowledgement idempotency; duplicate/expired leases; approved takeover; partial create recovery; and no silent MCP-to-CLI fallback.
- Git and storage decisions:
  Test Git conflict disabling approval/progression, agent-proposed resolution requiring user acceptance, dirty-file hashes, non-Git snapshot fallback, user acceptance of reduced reproducibility, safe sidecar writes, symlink/traversal rejection, stale locks, and atomic compare-and-write.
- Scaffold/new-project flow:
  Test a newly scaffolded app from creation through start, plan creation, review, approval, validation review, and artifact exclusions for local tokens, leases, personal layouts, events, locks, reports, and traces.
- Gate bypass negatives:
  Explicitly attempt to proceed with chat-only approval, stale displayed revision, unresolved blocking remarks, missing validation approval, unapproved risky file, missing accepted baseline, failed fresh validation, unacknowledged blocking event, and missing final sign-off.

## Validation And Fix Workflow

- Run the real interactive workflow first, then add or update automated coverage for every observed gap.
- For every failure, classify immediately:
  - Product bug: fix canonical source and rerun the failed step plus focused regression tests.
  - Missing coverage: add the smallest useful automated test.
  - Harness/fixture issue: fix the harness without weakening behavior assertions.
  - Deferred behavior: document the gap, rationale, and risk explicitly.
- Keep fixes in canonical source files; do not patch generated automation output or scaffold copies directly.
- After root/base changes that affect scaffolds, run the documented template sync workflow and review generated diffs.
- Do not bypass AppraiseJS approval gates, fake approvals, or treat chat approval as equivalent to AppraiseJS approval.

## Harnesses And Commands

- Use AppraiseJS UI, MCP, CLI, and internal API paths for primary workflow evidence.
- Use `Vitest` for contracts, repositories, sync, coordinator, review, validation, baseline, implementation, CLI client, and API-boundary tests.
- Use `Playwright` for plan list/detail, graph/list review, remarks, approval, validation review, baseline review, recovery states, and accessibility.
- Use CLI subprocess and MCP smoke/E2E tests for diagnostics, create, wait, read, revise, approval wait, validation publish/submit, events, acknowledgement, reconnect, and clean stdio protocol output.
- Use AppraiseJS test-run harnesses for baseline and final validation evidence with logs, reports, traces, and screenshots.
- Run focused checks first, then broader confidence checks: focused `npx vitest run <files>`, selected `playwright test` specs, `npm run smoke:coordinator`, `npm run validate:unit`, `npm run validate:e2e`, and `npm run build`.

## Acceptance Criteria

- A real normal-user planning session completes from request to AppraiseJS plan review, feedback, plan approval, validation review, baseline acceptance, implementation, fresh validation, and final completion sign-off.
- Every required flow above is either validated with automated or browser evidence, fixed and regression-tested, or explicitly documented as deferred with a concrete reason.
- The agent cannot move across plan, validation, baseline, implementation, or completion gates without the corresponding AppraiseJS approval/evidence.
- UI review is accessible, keyboard-operable, discoverable from AppraiseJS, and equivalent across graph and list views.
- Adapter parity is proven across service, UI action, internal API, MCP, CLI, package, and scaffold surfaces.
- Final validation has no unexplained focused test failures, no generated/template drift, no protocol pollution, and no bypassed review gates.

## Assumptions

- AppraiseJS should be used for the product workflow being tested; it should not be used as the coordinator for creating this meta-plan.
- Current source, schemas, docs, and tests are authoritative; historical development plans are reference-only.
- Broad checks may be staged after focused fixes, but any skipped or deferred checks must be reported clearly.
