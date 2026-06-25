# 08 - Baseline Execution and Acceptance

## Goal

Prove approved validations run before implementation and that baseline acceptance is required before implementation can
start.

## Builds On

- Pass 07 completed validation review or returned product-scope feedback back through plan review.
- Required validation nodes and risky files are approved for current hashes.

## Validation Scope

- Required browser/environment matrix expansion.
- Expected behavioral failure acceptance.
- Unrelated failure acknowledgement.
- Invalid setup, fixture, infrastructure, undefined step, unexpected timeout, and unmatched failure rejection.
- Duplicate or interrupted run recovery.
- Rerun and reconciliation.
- Implementation unlock only after accepted required baselines.

## Suggested Actions

1. Run baseline combinations through AppraiseJS test-run services.
2. Capture logs, report links, traces, and screenshots where available.
3. Classify expected failures, unrelated failures, invalid failures, and regression passes.
4. Acknowledge unrelated failures and justify already-passing new tests.
5. Attempt implementation start before and after baseline acceptance.

## Evidence To Capture

- Baseline attempts for every required matrix combination.
- Classification and acknowledgement hashes.
- Rejection evidence for undefined steps, infrastructure failures, and unmatched failures.
- Tests proving `baseline_accepted` gates implementation.

## Exit Criteria

- No implementation can start without accepted required baselines.
- Next pass may test implementation checkpoints and midstream feedback.
