# Baseline Execution

Baseline execution starts only after validation review reaches `validations_approved`. The coordinator submits one
existing Appraise `TestRun` for each required validation matrix combination and records every attempt in the
Git-tracked validation sidecar.

## Expected Failure Format

Each expected failure is scoped to an exact `browser` and `environment`, has a zero-based `order`, stores the exact
failure `signature`, and names `lastPassingStepId`. Classification compares observed signatures in order and verifies
that the required setup step completed first.

Results are classified as:

- `expected_behavioral_failure`: exact ordered signature match.
- `accepted_regression_pass`: the new validation already passes and needs a written regression-coverage justification.
- `pre_existing_unrelated_failure`: an unmatched non-infrastructure failure that needs user acknowledgement.
- `invalid_baseline_failure`: undefined or ambiguous steps, setup/fixture/infrastructure failures, timeouts,
  cancellation, interruption, or a missing required setup step.

## Evidence And Acknowledgements

Each attempt preserves its Appraise test-run ID and links to logs, the run report, traces, and screenshots. Repeated
attempts append new records; they never replace old evidence.

An unrelated-failure acknowledgement binds to the attempt ID and the SHA-256 hash of its ordered failure signatures.
A changed signature therefore requires a new acknowledgement. Changes to reviewed validation files block baseline
reconciliation, acceptance, and implementation until validation review is repeated.

## Implementation Unlock

`startImplementation(planId)` in
`src/services/coordinator/coordinator-baseline-service.ts` is the only baseline service call that moves a plan from
`baseline_accepted` to `in_progress`. It rechecks every required combination, acknowledgement, regression
justification, validation-file hash, and the accepted baseline decision before emitting `implementation_started`.
