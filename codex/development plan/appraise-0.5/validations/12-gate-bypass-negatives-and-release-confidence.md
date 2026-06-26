# 12 - Gate Bypass Negatives and Release Confidence

## Goal

Prove all review gates are enforceable by intentionally attempting forbidden shortcuts, then run broad confidence checks
for release readiness.

## Builds On

- Passes 01 through 11 established the expected happy paths, recovery paths, and scaffold parity.

## Validation Scope

- Chat-only approval.
- Stale displayed revision.
- Unresolved blocking remarks.
- Missing validation approval.
- Unapproved risky file.
- Missing accepted baseline.
- Failed fresh validation.
- Unacknowledged blocking event.
- Missing final sign-off.
- Generated/template drift.
- Protocol pollution.
- Full build, unit, e2e, static analysis, and package checks.

## Suggested Actions

1. Attempt every bypass from the matrix against service/API/MCP/CLI/UI action surfaces where applicable.
2. Confirm each bypass fails with a specific recovery message.
3. Run focused tests for any newly fixed bypass.
4. Run broader checks: focused Vitest, selected Playwright, `npm run smoke:coordinator`, `npm run validate:unit`,
   `npm run validate:e2e`, quality checks, and `npm run build` as risk warrants.
5. Confirm generated/template sync state is clean or explain intentional generated diffs.

## Evidence To Capture

- Rejection responses for each forbidden transition.
- Final command list and pass/fail summary.
- Known warnings and deferred gaps with rationale.

## Exit Criteria

- No gate can be bypassed through service, UI action, internal API, MCP, CLI, package, or scaffold surfaces.
- Final validation has no unexplained focused failures, generated/template drift, protocol pollution, or bypassed gates.
