# Test Run Runtime

This document helps agents navigate AppraiseJS test execution, logs, reports, and run artifacts.

## Mental Model

Test runs are created through app actions and services, executed locally through a Cucumber/Playwright adapter, and
stored back into database/report models after execution. Runtime artifacts live under `automation/reports/<runId>`.

Managed Validation AST runs use a separate Appraise-owned runtime-capsule storage contract under
`.appraise/projects/<target-project-id>/runtime/<validation-hash>/<run-id>/`. The database is authoritative for each
capsule's target-project and TestRun ownership; filesystem directories are projections and are never imported as
authority. Capsule manifests use strict, bounded, canonical versioned JSON and immutable hashes. Run-specific capsule
instances reference project-scoped, content-addressed blobs rather than making the run identity the blob identity.
Blob bytes are verified before immutable storage. Materialization moves durably from `staging` to `ready`; persisted
integrity is constrained to `staging`, `ready`, `missing`, or `corrupt`, while orphaned filesystem projections are
reported without creating database authority. Managed path segments are validated and anchored to a trusted,
non-symlinked Appraise root; `.appraise`, `projects`, project, cache, digest, validation, and run ancestors are all
realpath containment-checked. Directories use mode `0700`, immutable files use mode `0600`, and symlinked ancestors are
rejected. Materialization exclusion uses a database lease keyed by project, validation hash, and run ID. Its owner token
and expiry are transactionally compared for acquire, bounded renewal, expiry takeover, and release, so an active long
materialization is renewable and an expired owner cannot release a successor. Reviewed managed validations execute from
these capsules; legacy validations continue using `automation/reports/<runId>`.

Runtime capsule diagnostics are a bounded projection, not an artifact export. The durable execution attempt stores
the canonical predictive-preflight result, its hash, and check timestamp before spawn so restart diagnostics do not
depend on process memory. Readers may expose stable status/failure codes, package versions and content hashes,
evidence counts and owned links, and a fixed recovery action. They must never expose command arguments, absolute
paths, environment values, owner tokens, raw failure text, complete receipts/manifests, or artifact contents.

Appraise 0.5 assumes a local loopback hub-admin boundary: the person controlling the local hub can administer every
registered target. A `targetProjectId` query parameter is an explicit ownership filter and prevents accidental
cross-target reads; it is not authentication. Coordinator/MCP access additionally binds the selected target
fingerprint to its registered immutable project ID. Missing or mismatched target context is returned as an opaque 404.
Future remote or multi-user hosting must add authentication and authorization rather than treating this filter as a
security credential.

Each managed project directory also contains a canonical `project.json` written atomically with mode `0600`. Its
directory segment and immutable identity are always `TargetProject.id`; display names and canonical target paths are
metadata only and may refresh without renaming managed history. The manifest binds schema version, project ID,
fingerprint, registration time, last verification time, display name, and canonical path. Refresh requires the current
database project and matching stored project ID/fingerprint; missing storage is reported explicitly, while corrupt or
foreign identity is never silently overwritten or imported.

Task 3.2 seals a strict version-1 `command-receipt.json` into every AST runtime capsule. The
contract binds ownership, physical Node/Cucumber/Appraise runtime identities, one Cucumber package root,
native-ESM/precompiled-JavaScript identities, exact config/features/imports, preflight and execution argv, bounded
environment and capabilities, expected cases/counts/tags, outputs, and execution limits. Receipt JSON is canonical and
bounded to 256 KiB. Predictive preflight results use a stable ordered check taxonomy and bounded blockers/resolved
identities. The capsule manifest binds the receipt path and hash, the receipt bytes are an independently copied and
verified run-local file, and compiler-receipt identity remains distinct from capsule-command identity. Predictive
preflight, persisted execution attempts, and execution all consume this same receipt.

Materialization consumes only a `review_ready` `ValidationAstPublishOperation`. Before writing
bytes it revalidates the immutable publish journal, exact current `PlanProjection.validationJson`, logical projection,
runtime-input snapshot, validation provenance, TestRun/plan/project ownership, and ordered extension-review hashes.
It never reads target-repository `automation/` files. Deterministic feature, binding, reviewed-extension, support,
config, and expected-case bytes are stored as project-scoped content-addressed blobs; the run manifest references
those blobs. Verified blob bytes are atomically copied into independent run-local files through an exclusive
same-directory temporary file and immutable link publication into their
declared run-local manifest paths, so the sealed capsule config can load directly from its own working directory.
Run-local ancestors receive the same anchored containment and symlink checks, and both blob and run-local hashes are
verified before readiness. The capsule becomes `ready` only after every database blob row, path reference, and
run-local file is complete. The manifest binds
the publish operation, projection, compiler receipt, runtime-input snapshot, and a versioned capsule-generator
identity. Generated bindings embed the exact frozen runtime-input locator ID/name-to-selector map, register every
frozen Gherkin step, and dispatch only the reviewed Appraise action IDs through the physical Appraise-owned Cucumber
runtime. They call `page.locator` with reviewed selectors directly and never consult target automation or a mutable
global locator cache; world and hook support uses that same runtime instance. Reviewed
extension bytes use validated portable ID/version paths and are never recompiled. A periodic database-lease heartbeat
renews during slow blob writes, and ownership is reasserted before every blob, manifest, reference, and ready-state
authority transition. Materialization alone does not authorize execution: the capsule service must prepare the
TestRun, pass predictive preflight, persist the attempt, and retain transition ownership through spawn.

Predictive capsule preflight consumes the canonical `command-receipt.json` sealed into the manifest and performs 13
ordered checks: receipt, ownership, manifest, filesystem, physical runtime, Cucumber singleton, config profiles,
native-ESM/compiler identity, environment/capabilities, tag selection, expected evidence, output writability, and the
exact Cucumber dry run. The dry run uses the sealed Node/Cucumber argv, capsule cwd, literal allowlisted environment,
timeout/output bounds, and dedicated `reports/preflight.json`; it never inherits ambient process environment or writes
the final execution report. Bounded reconciliation requires one canonical `@tc_` correlation per expected case, exact
validation/suite/case tags, no duplicate or undefined/ambiguous scenario, and exact selected counts. Results always
contain all 13 checks in canonical order with sanitized blockers. A ready result also records a bounded resolved-capsule
summary: the immutable runtime-input hash, feature and import paths, exact tag expression, browser, environment ID,
final report path, and selected scenario count. This summary is stored with and hashed as part of the durable preflight
receipt, so baseline execution and later diagnosis can prove which reviewed runtime capsule passed without exporting
the full command receipt or any environment values.

`RuntimeCapsuleTestRunService.prepare` uses a unique preparation key to converge concurrent requests and reuse a
durable queued/running preparation after a crash. The key binds plan revision, publish operation and runtime-input
identity, validation, browser, environment, and an attempt ordinal; random display names are not identity. A deliberate
retry advances the ordinal. `start` persists the exact preflight receipt before spawn, moves the guarded attempt through
`STARTING` and `RUNNING`, registers the process, and finalizes evidence through the shared artifact gateway. Terminal
attempts are idempotent. Cancellation uses owner-token/state guards before and during spawn, terminates a registered
process when present, and durably reconciles both attempt and TestRun terminal state.

Baseline start applies the same recovery contract to legacy runs. Replaying an active baseline reports `reused`, the
canonical attempt/TestRun identities, reconciliation legality, and `baseline_reconcile` as the next action. A legacy
display-name collision is reusable only when the existing TestRun is bound to the same plan and target; otherwise the
conflict includes the existing run identity and an Appraise-owned repair action.

Lifecycle responses, MCP evidence tools, report pages, log routes, and capsule diagnostics use `TestRun.runId` as the
canonical public TestRun identity. The database primary key remains internal. A `runId` emitted by baseline or
implementation start must resolve immediately through `test_run_read` and `test_run_diagnose`, including while the
run is queued/running and after a harness failure. Owned links must embed that same `runId`; callers must not translate
between the public run ID and the internal TestRun row ID.

The database lease covers the complete preflight, not only materialization. Ownership is renewed before every check,
and the final dry-run stage renews, repeats complete repository/blob/run-file integrity, securely revalidates output
ancestors, renews again, and only then spawns. Controlled mutation therefore blocks without invoking Cucumber. Config
validation compares the deterministic sealed profiles-v1 source bytes and never evaluates capsule code in the Appraise
server process. Output probes and final preflight cleanup resolve contained physical directories and reject symlinked
ancestors or final paths immediately before filesystem mutation.

## Key Locations

- Test run actions: `src/actions/test-run/test-run-actions.ts`
- Test run service: `src/services/test-run/test-run-service.ts`
- Evidence summary/finalizer: `src/services/test-run/run-evidence-summary-service.ts`
- Local execution adapter: `src/lib/executor/local-executor-adapter.ts`
- Process registry and cancellation: `src/lib/test-run/process-manager.ts`
- Log formatting and storage: `src/lib/test-run/log-formatter.ts`, `src/lib/test-run/winston-logger.ts`
- Report parsing: `src/lib/test-run/report-parser.ts`
- Report persistence: `src/services/report/report-service.ts`
- Runtime artifact paths: `src/lib/automation/automation-path-roots.ts`
- Capsule schema/migrations: `prisma/schema.prisma`, `prisma/migrations/20260711220000_add_runtime_capsules/`,
  `prisma/migrations/20260712010000_add_runtime_capsule_execution_attempt/`, and
  `prisma/migrations/20260712020000_add_test_run_preparation_key/`
- Logs API route: `src/app/api/test-runs/[runId]/logs/route.ts`
- Bounded capsule diagnostic route: `src/app/api/test-runs/[runId]/diagnostics/route.ts` (`Cache-Control: no-store`)
  Diagnostics are hub-only in Appraise 0.5 and are intentionally not synchronized into `create-appraisejs` templates.
- Artifact download route: `src/app/api/test-runs/[runId]/download/route.ts`
- Capsule artifact ownership gateway: `src/services/test-run/test-run-artifact-access-service.ts`. Capsule log,
  report, trace, screenshot, evidence-summary, report-persistence, trace-viewer, and archive readers must resolve
  through this service. It binds TestRun, capsule, target project, manifest, command receipt, and expected test-case
  membership; rejects symlinks and path escapes; and enforces receipt or hard size/content-type caps. Missing or
  foreign artifacts are 404 responses, while ownership, integrity, containment, and content corruption are 409
  conflicts. Legacy non-capsule readers retain their existing stored-path behavior.
- Cucumber runtime config: `cucumber.mjs`
- Cucumber runtime package: `packages/cucumber-runtime/src`

## Execution Flow

1. Actions validate user input and call the test run service.
2. The service resolves selected tags or suites into an executable tag expression and linked test cases.
3. `local-executor-adapter.ts` prepares the automation workspace, sets runtime environment variables, and starts the
   Appraise-owned `@cucumber/cucumber` binary directly with Node. Target workspaces never resolve an unpinned
   `npx cucumber-js` fallback.
4. `process-manager.ts` tracks active processes for status, logs, and cancellation.
5. Cucumber writes JSON reports under `automation/reports/<runId>/cucumber.json`.
6. Logs are persisted and the raw process status is recorded as completed.
7. Report parsing and persistence update report records, metrics, and linked run test cases.
8. The evidence finalizer computes `TestRun.evidenceHealth` and derives the trusted `TestRun.result`. A zero exit code
   is not enough for trusted passing evidence.

## Evidence Health

`TestRun.evidenceHealth` is the durable trust verdict for managed evidence:

- `valid`
- `invalid_empty_run`
- `invalid_missing_test_cases`
- `invalid_missing_report`
- `invalid_placeholder_binary`
- `invalid_unmatched_scenarios`
- `invalid_stale_runtime`
- `infrastructure_failure`

`RunEvidenceSummary` is the bounded service result for UI, coordinator, and MCP callers. It includes stable ids
(`testRunPageId`, `executionRunId`, `planId`, optional `validationId`), evidence links (`reportUrl`, `logsUrl`),
counts, blockers, missing artifacts, log excerpts, `evidenceHealth`, and `nextAllowedAction`.

The stored logs API supports `mode=summary`, `mode=errorsOnly`, `mode=tail`, and `mode=aroundFailure` for bounded
agent recovery. Live `text/event-stream` requests still use SSE streaming.

Baseline and implementation validation gates must consume `evidenceHealth`. `TestRun.result === PASSED` is only
trusted when evidence health is `valid`; invalid or infrastructure evidence stays reduced assurance and blocks normal
lifecycle progression.

Reviewed managed validations use capsule execution for baseline and implementation. Mixed artifacts keep legacy validations
on the legacy runtime while routing reviewed managed nodes through their exact publish operation. Both paths reconcile into
the same evidence-health contract; only valid managed evidence provides full assurance.

Projected baseline scenarios carry plan, validation, suite, and case identifier tags. Partial-suite selection uses the
same `@ts_<suiteId> and @tc_<caseId>` identifiers; a zero-scenario report is invalid evidence, never a passing or
unrelated product result.

Identifier tags are stored canonically with `name` values such as `ts_<suiteId>` or `tc_<caseId>` and expressions with
one leading `@`. Runtime lookup remains compatible with legacy stored names or expressions that disagree about the
leading `@`. Plan-bound standalone runs persist exact expected suite/case rows in the same transaction as the TestRun.

Baseline attempts are also persisted as immutable database facts with append-only sequenced state and decision events.
The validation artifact remains the compatibility projection; validation feedback invalidates decisions without
deleting prior attempt or acknowledgement history.

Baseline preparation keys are the execution identity; display names are deterministic labels that include the
one-based attempt number. Exact replays converge on the existing preparation, and retries after validation repair use
the next ordinal so the global TestRun name constraint cannot deadlock lifecycle recovery.

## Runtime Environment

The capsule command receipt is the single execution contract for preflight and launch. It seals the exact Node and
Cucumber binaries, config, capsule-relative working directory, feature/import/support files, environment, selection,
outputs, and hashes. Absolute runtime paths containing unresolved bracket, mustache, or shell placeholders are rejected
before materialization or review; paths containing spaces remain valid. A passed preflight is persisted against the
same capsule and receipt hashes consumed by execution.

Every managed attempt creates its canonical `TestRun.runId` before preflight or process registration. UI details,
logs, reports, MCP reads, and diagnosis resolve that same public ID, including blocked preflight and spawn failures.
Diagnosis responses remain bounded and include evidence health, report/log links, the failed capsule component, and one
legal recovery action.

The local executor sets these important environment variables for child Cucumber runs:

- `ENVIRONMENT`: selected AppraiseJS environment name.
- `HEADLESS`: browser headless mode.
- `BROWSER`: Playwright browser name.
- `REPORT_PATH`: run-specific report file path.
- `REPORT_FORMAT`: Cucumber JSON format pointing at `REPORT_PATH`.
- `TEST_RUN_ID`: current test run id.
- `APPRAISE_CUCUMBER_BINARY`: exact Appraise-owned Cucumber binary used by the managed run.
- `TS_NODE_COMPILER_OPTIONS`: managed TypeScript settings, including DOM libraries needed by browser steps.
- `APPRAISE_TARGET_ROOT`, `APPRAISE_PLAN_ID`, and `APPRAISE_VALIDATION_ID`: plan-bound execution context when provided
  by lifecycle tools.

## Validation

- For selection/filtering behavior, prefer focused tests around `src/services/test-run/test-run-service.ts` and
  `src/lib/test-run/matching.ts`.
- For report parsing changes, run `npx vitest run src/lib/test-run/report-parser.test.ts`.
- For evidence-health changes, run `npx vitest run src/services/test-run/run-evidence-summary-service.test.ts`.
- For artifact download changes, run the related route test under `src/app/api/test-runs/[runId]/download`.
- Use `npm run test` when Cucumber execution behavior or step runtime behavior changes.

## Never Do

- Do not fake report records by editing `automation/reports` output.
- Do not bypass `process-manager.ts` when adding run cancellation, log streaming, or active-process behavior.
- Do not change Cucumber paths or report formats without checking `cucumber.mjs`, `local-executor-adapter.ts`, and
  `packages/cucumber-runtime/src`.
