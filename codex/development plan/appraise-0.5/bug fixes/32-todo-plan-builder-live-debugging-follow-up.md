# Todo plan builder live-debugging follow-up

## Verified outcome

The full plan-builder lifecycle completed for `pln_01kxfsvv9kcqt8hfarft6t2zpf`. The generated todo app passed its
managed browser validation, all six tasks were verified, and final sign-off produced `plan_completed`.

## Fixed during the run

- Preserve project context in plan and validation review URLs.
- Keep compact planning, validation-context, baseline, and implementation-validation responses actionable.
- Scope environment names by target project and reuse compatible same-project validation resources.
- Return safe database uniqueness conflicts.
- Compile keyboard and viewport AST actions.
- Match approved baseline failure fragments against full Playwright failure lines.
- Interpret `depends-on` and `blocks` edges according to their declared direction.
- Reuse active managed implementation runs and describe their automatic capsule execution accurately.
- Resolve accessible names from associated labels, ARIA references, placeholders, and other standard sources.
- Normalize completion sign-off IDs, pre-serialize all artifacts before writes, and recover the observed partial
  completion using the original reviewed evidence receipt.
- Emit an explicit `validation_passed` event when atomic task reconciliation reaches the gate.

## Follow-up completion

### P0: managed run identity and diagnostics — completed

1. Make `test_run_read`, `test_run_diagnose`, report links, and log links accept the same public TestRun ID returned by
   implementation validation.
2. Include the target-project query or binding on every evidence URL.
3. Return bounded 404/diagnostic envelopes when artifacts are absent instead of an unhandled server error.
4. Add an end-to-end contract test covering start, reconcile, read, diagnose, logs, and report for one capsule run.

### P1: completion invariants — completed

1. Replace sequential artifact CAS writes with a journaled multi-artifact commit or recoverable transaction record.
2. Assert that `completed` always has a valid final sign-off and `plan_completed` event.
3. Treat released evidence protection as valid after a signed-off completion while retaining immutable evidence hashes.
4. Add crash-injection tests after each validation, plan, review, sync, and event write.

### P1: lifecycle efficiency — completed

1. Add `responseMode` to every lifecycle mutation and default to summary mode.
2. Return changed fields, stable IDs, hashes, evidence health, and one structured next action; fetch full artifacts only
   on explicit request.
3. Add response-size and estimated-token telemetry with CI budgets for planning, validation, baseline, implementation,
   and completion operations.
4. Make every replayable mutation return its prior receipt rather than create duplicate work.

### P2: authoring and recovery UX — completed

1. Add validation-resource proposal abandon and cleanup operations.
2. Validate graph semantics and show the computed runnable order before plan approval.
3. Add a lifecycle health surface for missing events, orphaned runs, inconsistent evidence protection, and authorized
   recovery actions.
4. Keep final-sign-off recovery visible when lifecycle state and review evidence disagree.
5. Investigate the host browser bootstrap error `Cannot redefine property: process`; retain Playwright CLI as a tested
   fallback until the native integration is fixed.

## Implementation evidence

- Public TestRun identity is now consistent across start, reconcile, read, diagnose, logs, and reports, with explicit
  target-project scope and bounded missing-evidence responses.
- Completion uses a durable private transaction journal and replay-safe ordered writes. Crash injection covers each
  journal phase, and completion health verifies sign-off, events, evidence protection, and managed-run associations.
- Lifecycle mutations default to compact summaries, expose response byte/token estimates, and preserve stable receipts
  when replayed.
- Validation-resource proposals support explicit abandon and ownership-safe cleanup. Plan review exposes validated
  execution order, and the lifecycle health endpoint returns bounded authorized recovery actions.
- Native browser bootstrap failure remains host-owned; the documented Playwright CLI fallback preserves the same
  Appraise lifecycle and review gates.

## Acceptance

- A fresh todo flow completes without duplicate runs, manual identity translation, stale receipts, or raw artifact edits.
- All evidence URLs work under explicit project scope.
- Compact responses stay within their documented token budgets.
- Crash injection cannot leave lifecycle, review, validation, and event artifacts observably inconsistent.
