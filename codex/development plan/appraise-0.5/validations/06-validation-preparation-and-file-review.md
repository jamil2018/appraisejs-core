# 06 - Validation Preparation and File Review

## Goal

Prove an approved plan moves into validation preparation only, produces reviewable validation artifacts, and blocks
risky file changes until users approve exact hashes.

## Builds On

- Pass 05 proved persisted coordinator state and recovery behavior.
- A plan has exact current revision approval.

## Validation Scope

- `plan_start` and `validation_preparation_started`.
- Validation node generation.
- Appraise test case links.
- Gherkin paths and executable step paths.
- Matrix configuration.
- File classification defaults and overrides.
- Production and `requires_review` file blocking.
- Undeclared change blocking.
- Changed-after-approval invalidation.
- Optional validation approve/reject/defer.

## Suggested Actions

1. Start validation preparation through MCP/API after approval.
2. Generate or publish validation nodes with Appraise case, Gherkin, step, matrix, and expected failure metadata.
3. Modify `test_only`, `test_infrastructure`, `production`, and `requires_review` files in isolated fixtures.
4. Approve required validation nodes and flagged files by current hash.
5. Change an approved file and verify approval invalidation.

## Evidence To Capture

- Validation artifact with nodes, file manifest, classifications, and matrix.
- Review artifact with validation decisions and file approvals.
- Tests for manifest mismatch, ambiguous classification, dirty worktree, non-Git fallback, and invalidation.

## Exit Criteria

- Validation approval is impossible without current required validation decisions and current risky-file approvals.
- Next pass may test feedback routing from validation review.
