# Appraise Natural-Language Project Flow, Continuation, and Plan Identity Fix

## Summary

Make AppraiseJS reliable for natural-language project requests and follow-up work by adding agent routing for "use
Appraise," durable target-project discovery, opaque plan identity, and token-efficient review continuation.

The review strategy is: use one long-polling MCP wait while the current turn is active; if it times out or the host goes
standby, Appraise records a resumable wake event so no tokens are consumed while idle.

## Key Changes

- Add `appraise-project-from-brief` skill.
  - Trigger on phrases like "create/build this project using AppraiseJS."
  - Run `project_diagnostic`, detect/register the target project, then create the plan through `plan_create`.
  - If an Appraise marker already exists, route follow-up feature requests through Appraise unless the user explicitly
    opts out.

- Add target-project continuity marker.
  - Write `.appraisejs/project.json` during `project_add` when the target repo is writable.
  - Include hub fingerprint, target project id/fingerprint, display name, timestamp, and "future plans go through
    Appraise" guidance.
  - If marker writing fails, registration still succeeds with a warning.

- Move new plans to opaque IDs.
  - Coordinator assigns IDs like `pln_<ulid>` for new plans.
  - Add friendly `slug` metadata for display/search; slugs are not identity.
  - Existing kebab-case plan IDs remain readable as legacy IDs.
  - `/plans/{planId}` and `appraise://plans/{planId}` use canonical opaque IDs.
  - Optional `/plans/{slug}` resolves only when exactly one active plan matches; ambiguous slugs show a chooser/search
    result.

- Update persistence and projections.
  - Extend `PlanProjection` with `slug` and `legacyPlanId`.
  - Keep artifact filenames keyed by canonical `planId`; legacy artifacts keep current names.
  - Sync backfills legacy plans with `legacyPlanId = planId` and `slug = planId`.

- Fix review continuation with token-efficient waiting.
  - After `plan_wait_for_review`, show links and call one `plan_wait_for_approval` long-poll.
  - Do not loop repeatedly on `pending`; one timeout returns compact resumable state.
  - On `approved`, call `plan_start`, acknowledge only after `validation_preparation_started`, then continue to
    validation artifact generation.
  - On `changes_requested`, call `plan_review_read`, revise against the returned hash, then repeat the review wait.
  - On `cancelled`, acknowledge and stop.

- Add wake/resume support for standby hosts.
  - UI approval or change request emits the existing durable event plus a compact continuation notification.
  - Notification contains `planId`, `sequence`, `status`, links, and recovery guidance.
  - Appraise can resume the agent later without consuming tokens while dormant.
  - `plan_wait_for_approval` remains read-only and never starts work by itself.

## Public Interfaces

- `plan_create` no longer requires callers to invent a name-derived `planId` for new plans.
- Plan responses include `planId`, `slug`, optional `legacyPlanId`, and links.
- `project_add` returns marker status: `written`, `refreshed`, or `skipped`.
- Review continuation events expose `approved`, `changes_requested`, `cancelled`, or `pending_timeout`.

## Test Plan

- Skill policy tests verify:
  - new natural-language Appraise skill exists;
  - planning calls `plan_wait_for_approval` after `plan_wait_for_review`;
  - old "Stop at the review gate" wording is removed.

- Coordinator/API tests verify:
  - opaque plan IDs are generated for new plans;
  - legacy kebab-case plans still open and sync;
  - duplicate slugs do not collide;
  - ambiguous slug routes do not open arbitrary plans;
  - `plan_wait_for_approval` returns compact pending state after timeout.

- Target project tests verify:
  - marker written/refreshed when writable;
  - marker failure is non-blocking;
  - marker discovery routes future work to Appraise.

- MCP E2E verifies:
  - natural-language project flow creates a review-ready plan;
  - approval resumes and reaches `preparing_validations`;
  - change request resumes, reads remarks, revises, and waits again;
  - no repeated polling loop is required.

## Assumptions

- Use compatibility migration, not full backfill.
- Long-polling is preferred during an active turn; wake/resume is preferred after timeout or standby.
- `.appraisejs/project.json` is local metadata and Git-ignored by default.
- Existing `TargetProject` remains the hub-owned project registry.
