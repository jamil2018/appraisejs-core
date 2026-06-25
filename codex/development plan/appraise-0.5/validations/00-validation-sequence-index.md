# Appraise 0.5 Validation Sequence

## Purpose

Break the full AppraiseJS planning-flow validation matrix into ordered passes that can be executed, fixed, and
reported independently. Each pass builds on evidence from the previous pass and should leave behind enough automated
or browser evidence for the next pass to start without re-proving earlier gates.

## Execution Rule

Run each validation pass in order unless a later pass is explicitly scoped to documentation only. If a pass finds a
product bug, fix the canonical source, add the smallest durable regression coverage, rerun that pass, then continue.

## Ordered Passes

1. `01-connection-setup-and-diagnostics.md`
2. `02-plan-create-discovery-and-review-ready.md`
3. `03-plan-review-ui-and-accessibility.md`
4. `04-user-authority-and-revision-loop.md`
5. `05-cancellation-reconnect-and-persistence.md`
6. `06-validation-preparation-and-file-review.md`
7. `07-validation-feedback-routing.md`
8. `08-baseline-execution-and-acceptance.md`
9. `09-implementation-checkpoints-and-feedback.md`
10. `10-final-validation-and-completion.md`
11. `11-scaffold-new-project-flow.md`
12. `12-gate-bypass-negatives-and-release-confidence.md`

## Common Evidence Format

Each pass should finish with:

- Commands or browser scenarios executed.
- Plan IDs, run IDs, event sequences, and lifecycle states observed.
- Bugs fixed, tests added, and remaining deferred gaps.
- Whether the next pass is unblocked.

## Non-Goals

Do not treat chat approval as AppraiseJS approval. Do not patch generated automation output when source, generator, or
sync logic is responsible. Do not claim UI coverage from service-only evidence.
