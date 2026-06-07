# Session 05: Validation Preparation and File Review

## Goal

Implement the second approval gate in which the coordinator creates executable tests before product implementation,
and users review validation intent plus every risky changed file.

## Work

1. Add lifecycle operations from `plan_approved` through validation preparation and review.
2. Link each validation node to generated Appraise test cases, Gherkin, executable steps, and matrix configuration.
3. Add repository-configurable file classification with sensible defaults:
   `test_only`, `test_infrastructure`, `production`, and `requires_review`.
4. Independently compute Git/snapshot deltas and reconcile them with the coordinator manifest.
5. Add per-file rationale, diff, feedback thread, approval, and content-hash invalidation.
6. Add individual validation-node approval and one revision-level validation review submission.

## Required Rules

- Product implementation is forbidden during validation preparation unless the exact file is explicitly approved.
- `production` and `requires_review` files trigger prominent user notification and per-file review.
- Undeclared changes block validation approval.
- Pre-existing dirty files are excluded unless changed again; only their new delta is reviewed.
- Modified approved files return to review automatically.
- Validation feedback cannot change approved behavior. Scope changes reopen plan review.
- Users comment at validation-node level; the coordinator propagates feedback into generated steps.

## Acceptance Criteria

- Every required validation and flagged file must be approved for the current hashes.
- Optional validations may be approved, rejected, or deferred.
- Manifest mismatch, ambiguous classification, dirty worktree, non-Git fallback, and changed-after-approval tests pass.
- Validation preparation can add necessary test infrastructure but cannot hide undefined or broken steps.

## Handoff

Provide default classification policy, override format, diff model, approval hashing rules, and a demonstration where a
production file blocks progression until individually handled.
