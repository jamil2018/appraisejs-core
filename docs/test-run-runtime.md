# Test Run Runtime

Every TestRun executes from an immutable runtime capsule with an exact command receipt, selected cases, Step
Definitions, locators, environment identity, and expected-case manifest.

There are two execution intents:

- `QUALITY_JOURNEY`: created by a Journey execution cycle and required to have the exact
  `QualityJourneyExecutionTestRun` binding. Its output becomes usable only through Journey-owned evidence sealing,
  triage, report review, and closure.
- `INDEPENDENT`: created from a target-owned authored snapshot and required to have no Journey binding. Its output is
  diagnostic and cannot satisfy Journey evidence, triage, decisions, or closure.

Both paths share capsule materialization, immutable blob storage, preflight, execution-attempt ownership, process
management, logs, and reports. A remote target uses its frozen non-secret environment packet; mutable environment
state is never substituted after sealing.

There is no published-Assessment capsule source or reconciliation branch. A mismatch between intent and Journey
binding fails before materialization or process launch.
