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

Journey execution first reserves an exact cycle and TestRun, then claims launch before materialization or process
effects. A lost reply reuses those identities; an uncertain claimed launch is not respawned. Reconciliation accepts
only terminal Journey-intent runs with the exact cycle binding and verifies the capsule manifest and artifact bytes
before creating a sealed receipt. Runtime traces and report-step screenshots live in the sealed `reports/traces`
and `reports/screenshots` subtrees. Each screenshot is bound to its report step and test case in the Journey receipt.
Previously persisted v1 command receipts with `traces` and `screenshots` roots remain readable under their exact
legacy paths; new receipts name the runtime's actual `reports/*` locations.

There is no published-Assessment capsule source or reconciliation branch. A mismatch between intent and Journey
binding fails before materialization or process launch.
