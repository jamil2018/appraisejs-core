# 07 - Validation Feedback Routing

## Goal

Prove validation-review feedback changes the correct layer: test-only feedback revises validations, while product-scope
feedback reopens plan review.

## Builds On

- Pass 06 produced reviewable validation nodes and file approval evidence.

## Validation Scope

- Validation feedback on generated tests only.
- Validation feedback on matrix, expected failures, Appraise case links, Gherkin, and steps.
- Feedback that changes product scope or approved behavior.
- Reopening plan review when scope changes.
- Preserving unaffected approvals when only test artifacts change.
- Invalidating affected validation decisions and baseline evidence.

## Suggested Actions

1. Submit validation-node feedback that only changes test generation.
2. Submit validation feedback that expands or changes product behavior.
3. Verify the first path returns to validation preparation/review.
4. Verify the second path returns to plan review with clear rationale.
5. Add tests around approval preservation and affected artifact invalidation.

## Evidence To Capture

- Lifecycle transitions for test-only feedback versus product-scope feedback.
- Review threads linked to validation nodes.
- Tests proving correct invalidation scope.

## Exit Criteria

- Validation feedback cannot smuggle product-scope changes past plan review.
- Next pass may run baselines against approved validations.
