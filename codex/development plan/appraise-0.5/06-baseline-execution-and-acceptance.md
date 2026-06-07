# Session 06: Baseline Execution and Acceptance

## Goal

Run approved validations before implementation and prove that required new behavior fails for expected reasons while
the repository's existing health is recorded.

## Work

1. Extend validation contracts with ordered browser/environment-scoped expected failure signatures.
2. Submit one existing Appraise `TestRun` per required validation combination and preserve every attempt.
3. Classify results as expected behavioral failure, accepted regression pass, pre-existing unrelated failure, or
   invalid baseline failure.
4. Add baseline status UI, evidence links, explicit acceptance, and unrelated-failure acknowledgement.
5. Recover interrupted plan-linked runs and reconcile immutable evidence metadata.

## Required Rules

- Validation approval precedes baseline execution.
- All required combinations need accepted baselines.
- Undefined steps, setup/fixture failures, infrastructure failures, unmatched failures, and unexpected timeouts block.
- New tests that already pass require explicit regression-coverage justification.
- Existing tests broken by validation preparation block.
- Unrelated pre-existing failures require user acknowledgement.
- A changed failure signature invalidates carried-forward acknowledgement.
- Any test/file modification after execution revokes affected approval and baseline.

## Acceptance Criteria

- Expected signatures match exact environment/browser combinations and identify the last required passing setup step.
- Required matrix scheduling, duplicate-run prevention, cancellation, interruption, rerun, and reconciliation pass.
- Baseline evidence links to logs, reports, traces, and screenshots through existing test-run services.
- `baseline_accepted` is unreachable without every required combination and required acknowledgement.

## Handoff

Document result classification, expected-signature format, acknowledgement hashing, and the exact service call that
unlocks implementation.
