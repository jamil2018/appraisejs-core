# SauceDemo AppraiseJS Stress Run — Continuation Tracker

Last updated: 2026-08-25 (Asia/Dhaka)

> Current checkpoint: paused by the user after the cumulative artifact's first exact-worktree judge review and two
> fortification passes. All four judge findings are fixed; the final release pass additionally repaired A-14 ledger
> validation, stale generated certification/reference artifacts, an obsolete generic-planning guard, eight coordinator
> service dependency cycles, and one unreachable new read model. The proposed Appraise-owned lifecycle-session ADR,
> migration plan, and checklist are written. Resume at the validation/final-judge steps below; do not restart the run.

## Goal

Stress the AppraiseJS planning-validation lifecycle against `https://www.saucedemo.com/` using a genuinely fresh-user agent. Keep the coordinator in control of Appraise-owned approvals and decisions, route every AppraiseJS failure through the harness swarm, repair confirmed AppraiseJS defects, then continue across the major SauceDemo feature families. Target-site defects are evidence, not repair scope.

## Current status

- Engineering/workflow hardening estimate: about 90% of the issues exposed by this run.
- Representative SauceDemo coverage completed: public login controls; blank and invalid login rejection;
  authenticated inventory entry; six-item inventory; Backpack add/remove; price-low-to-high sort.
- Credential-bearing locked-out and problem-user partitions are prepared but require explicit user authorization
  before the configured public SauceDemo credential may be sent to the target.
- Remaining sort, product detail, multi-item cart, checkout, menu/reset/About/logout, and isolation requirements and
  validation design are approved, but intentionally not executed because further open-ended coverage now has
  diminishing architectural value.
- Fresh cumulative judge artifact: HEAD `76ebd97d`; original reviewed tracked diff `a78ca681...`; original untracked
  manifest `ff49efcb...`. The judge required four corrections, all now implemented with focused regressions:
  secret-independent durable credential receipts, concurrent partition replay recovery, partition-specific MCP
  recovery guidance, and a valid active-generation publication-race fixture. A persisted-partition tamper guard was
  added as well.
- Deterministic validation completed before the final dependency repair: 208 unit files / 999 tests, 31 Chromium E2E
  tests, production build, 84 migrations, 127 seeded Step Definitions, MCP/package checks, capsule cutover, operation
  certification/projection checks, harness checks, docs links, artifact/package checks, and focused concurrency/tamper
  regressions. The dependency repair then passed 35 focused remote-scope/preparation tests, six SQLite tests, scaffold
  sync/parity, and `quality:fallow:release` at the unchanged 46-issue baseline with zero circular dependencies.
- `graphify:auto` completed after the dependency repair. A subsequent production build was deliberately interrupted
  when the user paused; it must be rerun. Because source changed after the last complete 999 + 31 suite, rerun the one
  final cumulative `npm run build`, `npm run validate`, release readiness, lint/format/diff checks, and exact parity
  checks before final judgment.
- The fresh post-fortification exact-artifact evaluation remains outstanding. Recompute the tracked binary-diff hash,
  sorted untracked content-manifest hash, file counts, and HEAD immediately before invoking a new zero-context judge.
- Do not reuse the first judge's rejection as certification: it covered tracked diff `a78ca681...` and untracked
  manifest `ff49efcb...`, both invalidated by later changes.
- Goal status was blocked on credential authorization before the user redirected the work to fortification and
  lifecycle-session migration planning.
- Git branch remains `codex/assessment-preflight-cutover`, based on `appraise-0.5`; the worktree is intentionally dirty
  and uncommitted. Do not reset, clean, or broadly format it.
- No build, test, server, browser, or subagent process remains intentionally running at this pause.

### Historical pause snapshot

- Engineering/workflow hardening estimate at pause: about 85%.
- SauceDemo feature-family coverage estimate at pause: about 40%.
- Goal state: active; deliberately not marked complete or blocked.
- Git branch: `codex/assessment-preflight-cutover`.
- Branch base: `appraise-0.5` at commit `76ebd97d`.
- Worktree: intentionally dirty with the uncommitted preflight and remote-evaluation-scope repairs. Do not reset, checkout, clean, or broadly format it.
- Another user agent is working in a different worktree.
- No commit or push has been made for this run.
- No swarm agent is running. On the 2026-08-24 resume, a fresh zero-context v3 implementation judge (`judge_v3_generation_resume`) was started and then interrupted at the user's next pause before returning a verdict. It must be restarted fresh before live preparation. A stale `judge_locator_search_identity` host entry remains `pending_init` despite two interrupt requests; it performed no work and must not be treated as an active review.
- The isolated AppraiseJS runtime remains stopped; no live lifecycle calls were made after the v3 implementation.
- No tests, runtime processes, lifecycle mutations, or file changes other than this tracker were performed during that brief resume.
- New swarm routing receipts created during the brief resume: v3 generation review `01fadd06-4859-4d4d-82b6-632bdfc7bd9c`; remote-scope review `d1b8cb45-f015-45bb-9305-8cc9f7879980`. The remote-scope judge itself was not started.

## Fresh-user SauceDemo state

The zero-context worker successfully discovered and created the first public-entry validation slice.

- Target project ID: `e428f85b-61b2-4b7e-ba77-61d6c2b4f3d0`
- Target kind: `REMOTE_BLACK_BOX`
- Canonical identity: `url:https://www.saucedemo.com`
- Target fingerprint: `sha256:a8782e72e86f17a9d106cf9a5a00d176b1fc00c89e895377e9782844cd886b79`
- Environment ID: `7a3509ba-97cd-4391-ae61-3dd2b48f395b`
- Environment base URL: `https://www.saucedemo.com`
- Quality Plan ID: `c291ed74-b123-4a5a-95f8-a19c622be5fd`
- Revision ID: `284f24e8-8609-45e7-8392-f9c93bc422ed`
- Requirement hash: `sha256:d3c92bb4db6fc1074893c5dea0e9958320fd865c525b84af11a10409c9b4bede`
- Requirement snapshot ID: `825049b8-208d-4442-a5d6-775424f8b0ac`
- Obligation ID: `8d96a288-b820-43fc-8745-bce25978ab08`
- Design hash: `sha256:1625e52851654544ac27904d5faebf77e29733567a8e663d94c4ca1167bfffc9`
- Validation version ID: `26b11895-c2bd-438f-acda-7c7b2ead4d3e`
- Validation canonical hash: `sha256:84683032b70c5dcbebe6901e3c3b75c4da2f99f285b9880bac135a4c21b58a8b`
- Scenario: `anonymous-public-login-entry`
- Assurance: `SMOKE`
- Browser: Chromium; no credentials.

Discovered canonical step definitions:

- Navigate: `browser.navigation.navigate.to.environment.base.url@1`
- Navigate definition hash: `sha256:e002ec5e8b5557c7033b8c959f4f3ba3e178781f77ff42ac761bc55872319c95`
- Visible assertion: `browser.assertions.visible@1`
- Visible definition hash: `sha256:0c5e70967b6f2f10a4a9177c18a88380a22a5c71fdb8f60ef431b0b666957c40`

Created resources:

- Module: `474c48c4-f0a4-50a5-a341-ca47893e45d9`
- Locator group: `00f22ccc-9420-5754-aad3-7e397667134d`, route `/`
- Login logo: `f6a16d65-1467-57e1-ad8a-4f3f94e177f5`, selector `.login_logo`
- Username: `fcd43f0c-a51f-542a-aa4f-f3fbf7bedf29`, selector `#user-name`
- Password: `eb30e018-a212-556e-a36e-260ccf03d3b0`, selector `#password`
- Login button: `b509594d-8c66-5f55-a63c-e94c42b846a2`, selector `#login-button`
- Worker-supplied cardinality evidence: each selector matched exactly one element.

Coordinator approvals already completed:

- Exact requirement approval.
- Exact design approval.

No new v2 Assessment, AssessmentRun, TestRun, sealed evidence set, or decision has yet been created for this slice. Historical v1 rows remain preserved and retired as described below.

## Confirmed AppraiseJS defects and repairs

### 1. Port/endpoint ambiguity

An unrelated app occupied port 3000. AppraiseJS was run separately on web 3100 and MCP 3110. Do not stop the unrelated process.

### 2. Opaque realization/compile contract

The public workflow exposed `validation_compile` with an opaque `realization: unknown`, while runtime required an undocumented sealed publication envelope.

Implemented clean cutover:

- Removed public manual `validation_compile` and `validation_publish` surfaces.
- Added read-only `assessment_preflight`.
- `assessment_prepare_run` owns canonical realization/publication repair; remote calls supply the exact v2 `expectedPreflight` token returned by `assessment_preflight`.
- Added one shared strict canonical realization boundary in `src/lib/quality-design/validation-realization.ts`.
- Added recursive strict schemas, duplicate/conflict protection, closure canonicalization, artifact/runtime validation, replay guards, provenance consistency, and real-SQLite coverage.
- Updated MCP contracts, fixtures, projections, UI, current docs, scaffold, generated references, and Graphify output.
- The final judge for this first repair approved it after several adversarial repair cycles.

### 3. No supported remote evaluation subject

A fresh remote-black-box user had to fabricate `subjectDigest` and `authority`. Target origin/fingerprint is location identity, not deployment identity.

Approved architecture and implemented direction:

- Added Appraise-owned `REMOTE_EVALUATION_SCOPE`.
- Added `evaluation_subject_remote_scope_create`.
- Issuance performs database work only: no target browser/network/process/filesystem/secret-resolution I/O.
- Scope binds target fingerprint, exact environment snapshot/origin, approved plan revision/design, canonical validation realization, and server-owned runtime/security/evidence policy hashes.
- It explicitly asserts `targetContentIdentity: not_asserted` and `identityStrength: evaluation_scope_only`.
- Remote assessment ingresses accept only an Appraise-produced `subjectRevisionId`; local artifact/deployment descriptor workflows remain supported.
- Added idempotent issuance receipts, root Assessment idempotency and same-scope reservation, legacy-root migration backfill, and remote evidence isolation by `assessmentId` plus `assessmentRunId`.
- Added frozen environment snapshot propagation into run/capsule preparation.
- Added functional remote/local UI preflight and preparation paths.

### 4. Harness usability issue

`npm run swarm:route` rejected `--expected-minutes` as an unknown argument without printing accepted options or a correction. Track as an enhancement; no harness configuration was silently changed.

### 5. Locator identity and remote-scope v2 cutover

Implemented and independently reviewed before this pause:

- `locator_search.id` is now the persistent target-owned locator ID; graph-only IDs are exposed separately as presentation IDs.
- Remote scope identity is v2-only and separates immutable scope intent, realization intent, and canonical preflight hashes.
- Historical v1 publications are marked `RETIRED_UNSUPPORTED`; they remain readable but cannot materialize or execute.
- Managed and independent preparation fail closed for unsupported v1 state.
- Wrong loopback/coordinator endpoints now return typed `coordinator_endpoint_mismatch` errors without forwarding target/project secrets.
- Scope receipt replay returns the exact bounded v2 algorithm and comparison hashes.

Current live v2 subject and hashes:

- Subject revision ID: `137ed766-c74a-4776-9a8d-55753874589a`
- Scope intent hash: `sha256:e21553216411d0ecf80849125496c3c8ac20ed3b3071952c696643e9d06e577b`
- Realization intent hash: `sha256:a8fdf60480a812b3334b1b5cc4e3a23d04f828f2d18bbc55f5a322b14d91c30c`
- Preflight hash: `sha256:cb7d87a8f569feb7e194a1cdd1f5a679e2681b96827ff8ec45caff0f2601e9a7`
- Algorithm: `appraise.quality-assessment-preflight/v2`

### 6. Canonical preflight depended on locator discovery order

The fresh-user agent supplied valid locator IDs in discovery order. Scope issuance normalized the IDs before canonical resolution, but public `assessment_preflight` did not. The same compact intent therefore produced issued hash `cb7d…` and public hash `f4d7…`, reported only as `publication_preflight_mismatch`.

Implemented repair:

- `resolveCanonicalAssessmentPreflight` now applies `normalizedRemoteScopeBindings` at its own authority boundary.
- Step order remains untouched because it is authored execution semantics.
- The conflict now reports bounded predicate diagnostics (`algorithmVersion`, `request`, or `recomputed`) plus expected/observed comparison tokens, without raw realization data.
- Focused unit tests passed: 42 tests.
- Focused real-SQLite issuance → public preflight/assertion regression passed: 1 test.
- A live unchanged clean-agent request then returned `ready: true` with the exact v2 hashes above.

### 7. Successful preflight omitted its required preparation token

Implemented repair:

- The service/API now returns the exact service-owned `expectedPreflight: { algorithmVersion, preflightHash }` token and `nextRecommendedAction: 'assessment_prepare_run'`.
- The HTTP route forwards the response unchanged.
- MCP summary/full projections preserve the service-owned token/action rather than deriving them.
- Full projection redacts raw `scopeIntent`, `realizationIntent`, and `validationBindings`.

Focused validation passed: 46 root service/route tests and 22 package projector/contract tests, plus affected ESLint, Prettier, and `git diff --check`.

### 8. Retired-v1 singleton blocked a fresh executable v2 generation

Architecture was independently revised and then implemented as a first-class immutable `QualityValidationGeneration` cutover:

- Added insert-only generations and deterministic publication identity; caller idempotency is stored separately and is excluded from artifact identity.
- Added a composite same-version `activeGenerationId` selector and exact publication ownership across generation/version/revision/target.
- Added durable per-run publication checkpoints and exact generation/publication identity on bindings, runtime capsules, reconciliation, provenance, and newly sealed evidence.
- Migrated v1 publications into retired unsupported generations while preserving their exact stored publication identity; v1 never becomes active or executable.
- Replaced readiness/execution authority based on `ValidationVersion.status` with the exact supported active generation and review-ready publication.
- Added guarded SQLite migration, immutable/update-denial constraints, restrictive deletes, composite ownership checks, and legacy-unbound evidence behavior.
- Fixed two integration defects found during implementation: the checkpoint relation originally implied an unintended Prisma column, and binding creation omitted the target/revision columns required by its composite FK.

Focused validation passed:

- Prisma generate and validate.
- Migration validation with 81 migrations and dedicated upgrade fixtures.
- 70 focused generation/migration tests.
- 20 execution/runtime files with 117 tests.
- 4 read-model/UI files with 56 tests.
- Affected ESLint, Prettier, and `git diff --check`.

The fresh independent implementation judge was started but interrupted at this pause before returning a verdict. Restart that exact review with zero inherited transcript; repair any findings before live use.

## Independent review history for remote scope

First implementation review found:

- Environment origin missing from scope identity.
- Readiness mutation before stale-scope rejection.
- No legacy root reservation backfill.
- Default MCP projection omitted `subjectRevisionId`.
- UI was guidance-only.
- Issuance could fall through to filesystem target resolution.
- Dedicated tests were missing.

Those were repaired with strict environment binding, pre-mutation guards, migration backfill, operation-aware projection, DB-only target resolution, functional UI actions, and dedicated unit/SQLite/migration tests.

Second implementation review found:

- Same-key replay could return an old subject with newly recomputed scope fields.
- Environment drift remained possible between validation and run reservation.
- UI still did not complete the canonical preflight/prepare lifecycle.
- SQLite concurrency tests were initially too shallow.

Third repair pass reports:

- Canonical resolved scope is part of idempotency conflict behavior; drift with the same key conflicts rather than mixing packets.
- Immutable environment snapshot/version is persisted and propagated into TestRun/runtime capsule.
- Transactional environment recheck occurs before AssessmentRun reservation.
- Fresh remote and local UI paths call canonical preflight and prepare actions.
- Two-process/two-Prisma-client SQLite races exercise issuance and root reservation.

This third pass has not yet received an independent judge verdict because the review was interrupted for this handoff.

## Current changed areas

Important canonical source paths:

- `prisma/schema.prisma`
- `prisma/migrations/20260822090000_remote_evaluation_scope_v1/`
- `src/lib/quality-design/validation-realization.ts`
- `src/services/coordinator/remote-evaluation-scope-service.ts`
- `src/services/coordinator/assessment-preparation-service.ts`
- `src/services/coordinator/quality-design-service.ts`
- `src/services/coordinator/quality-validation-publication-service.ts`
- `src/services/coordinator/assessment-execution-service.ts`
- `src/services/test-run/runtime-capsule-test-run-service.ts`
- `src/lib/runtime-capsule/materializer.ts`
- `src/app/api/internal/coordinator/[...operation]/route.ts`
- `src/app/(base)/quality-plans/quality-design-actions.ts`
- `src/app/(base)/quality-plans/[qualityPlanId]/quality-lifecycle-controls.tsx`
- `packages/appraisejs/src/mcp/domains/quality-design.ts`
- `packages/appraisejs/src/mcp/response-projector.ts`
- `docs/agent-lifecycle-flow.md`
- `docs/coordinator-api-mcp.md`
- Generated operation reference, scaffold template mirrors, and Graphify outputs.

New important tests include:

- `src/lib/quality-design/validation-realization.test.ts`
- `src/services/coordinator/assessment-preparation-service.integration.test.ts`
- `src/services/coordinator/remote-evaluation-scope-service.test.ts`
- `src/services/coordinator/remote-evaluation-scope-issuance.test.ts`
- `src/services/coordinator/remote-evaluation-scope-service.sqlite.integration.test.ts`
- `src/services/coordinator/remote-evaluation-scope-sqlite.integration.test.ts`
- `scripts/lib/remote-evaluation-scope-migration.test.ts`
- Matching scaffold copies produced by `prepare-template`.

## Latest validation evidence

Earlier broad validation (before the user's single-final-suite constraint):

- Focused root lifecycle suite: 9 files, 74 tests.
- MCP package suite: 12 files, 57 tests.
- `packages/create-appraisejs` suite: 12 files, 73 tests.
- `npm run validate:migrations`: 79 migrations applied/reset/reseeded.
- TypeScript, focused ESLint, Prettier, release artifact and package checks.
- Scaffold sync with 125 built-in Step Definitions.
- Full lint: zero errors and 12 unrelated/pre-existing warnings.
- Graphify source/Prisma/scripts output regenerated; package graph still reported an environment `Operation not permitted` warning.

Coordinator independently reran `npm run build` with required network permission. It completed successfully, including the final Next.js production route summary. The sandboxed attempt failed only because Google Fonts could not be fetched.

Do not treat these checks as final approval. They predate the user's instruction to run the full validation suite only once after all changes are complete. From this pause onward, use focused tests, affected lint, and formatting per repair; defer full validation/build/release gates until all SauceDemo workflow repairs and feature coverage are complete.

Latest v3-generation focused validation is recorded in defect 8 above. No new full validation/build/release suite was run for that cutover.

## Runtime state at pause

- The isolated development server used web port 3100 and MCP port 3110.
- It was stopped cleanly at this pause. Port 3000 remains an unrelated app and must not be stopped.
- Before live continuation, stop/restart only the AppraiseJS 3100/3110 process. Do not stop the unrelated port-3000 app.
- Apply/verify the new Prisma migration through the repository's normal development workflow before using the new MCP operation.
- Rebuild `packages/appraisejs` before using the CLI bridge if its dist output is stale.

Prior verified MCP surface before the remote-scope change:

- Surface version: `2026-08-21.assessment-preflight-cutover`
- Contract hash: `sha256:56e04ef2b65e5781fb3cf85df51a1082dee9d4b67c26a0d3e9d4473cdec61b66`

Expect both values to change after restart. Do not rely on this old hash.

CLI bridge pattern:

```bash
node packages/appraisejs/dist/cli.js mcp-call <tool> \
  --endpoint http://127.0.0.1:3110/mcp \
  --input-json '<json>'
```

## Exact resume sequence

1. Confirm branch and preserve the dirty tree:

   ```bash
   git status --short --branch
   ```

2. Read this tracker and the Appraise continuation/lifecycle/runtime skills.

3. Restart a fresh zero-context independent implementation judge over the completed v3 `QualityValidationGeneration` cutover. Require an approve/revise/reject verdict covering schema/migration parity, exact v1 preservation, deterministic identity and active-generation CAS, exact checkpoint/binding/capsule/evidence tuple flow, absence of status fallback, public-preflight independence/token redaction, and focused coverage. Both interrupted judge attempts returned no verdict; do not resume either partial review.

4. If the judge reports defects, route bounded fixes through the swarm, run only focused checks, and obtain a fresh independent verdict.

5. Also run a new isolated independent judge over the accumulated remote-scope repair. The judge must challenge:

   - same-key replay after environment and realization drift;
   - frozen environment snapshot usage through TestRun/capsule;
   - injected drift after initial guard but before preparation/run mutation;
   - fresh remote and local UI preflight/prepare flow;
   - real two-client/process SQLite concurrency;
   - migration upgrade behavior and root/successor preservation;
   - MCP compact/default handoff containing `subjectRevisionId`;
   - no cross-Assessment evidence reuse.

6. If any judge reports an Appraise defect, route it through the harness and repair it before live use.

7. Run only focused tests and affected lint/formatting while repairs continue. Do not run the full validation/build/release suite yet.

8. Restart/migrate AppraiseJS on web 3100 and MCP 3110 without touching port 3000.

9. Before any lifecycle mutation, follow continuation recovery: call `project_diagnostic` for the SauceDemo target, then read pending coordinator events and stop on cancellation. Verify the live MCP contract/capabilities and confirm `evaluation_subject_remote_scope_create`, `assessment_preflight`, and `assessment_prepare_run` are present.

10. The prior fresh worker is no longer available. Create a new zero-context worker and give it only the target URL plus the requirement to use AppraiseJS as a first-time user; do not leak IDs/selectors/solutions from this file into its discovery context.

11. Let the fresh agent replay its own scope and preflight request. Confirm preflight returns the exact token/action, then allow prepare with the returned token. Coordinator verifies and approves only Appraise-owned lifecycle gates.

12. Execute the first public-login-entry validation, inspect sealed evidence, and decide using the exact evidence-set hash. Keep `targetOutcome: not_evaluated` until evidence is valid and sealed.

13. Expand coverage across these SauceDemo feature families:

    - Valid login and inventory landing.
    - Invalid, blank, locked-out, and problem-user login behavior.
    - Inventory sorting by name and price in both directions.
    - Product detail navigation and back navigation.
    - Add/remove items from inventory and product detail.
    - Cart badge, cart persistence, cart item details, continue shopping, and removal.
    - Checkout information validation.
    - Checkout overview calculations and item inventory.
    - Checkout completion and return-home flow.
    - Menu open/close, inventory reset, about navigation, and logout.
    - State isolation between scenarios and credential/persona handling.

14. For every new Appraise error or misleading interaction, stop target expansion, classify it through the swarm, repair canonical source, independently judge, then resume.

15. Only after all repairs and planned SauceDemo feature families are complete: sync the scaffold/template, regenerate managed references/Graphify outputs where required, then run the full validation/build/release suite once and perform the final independent completion audit.

16. Finish only after broad feature-family coverage, sealed evidence/decisions, regression verification, and the requested final problem/fix plus enhancement report.

## Process enhancements already identified

- Public lifecycle tools need compact responses that always include the identifier required by the next recommended operation.
- Idempotent receipts must either return stored canonical packets or conflict after derived binding drift; never mix historical identity with current derived fields.
- Read-only preflight and mutating prepare must share one canonical resolver and compare exact hashes.
- Mutation boundaries need adversarial post-check drift tests, not only stale-at-entry tests.
- Migration validation needs seeded upgrade fixtures, not only a clean reset chain.
- Concurrency claims need real SQLite multi-client/process tests, not mocked or raw-insert substitutes.
- Fresh UI tests must begin before realization/publication, not from already-ready fixtures.
- The routing CLI should print accepted flags or suggest corrections for unknown arguments.
- Harness completion claims should automatically require tests for replay, mutation ordering, migration upgrade, response projection, and cross-Assessment isolation when those risks are present.
- Executor retry discipline needs improvement: one execution-fixture assignment returned twice without completing the requested conversion before a fresh executor finished it.
- Routing receipts should validate input field names before recording risk; one receipt used `publicContract` instead of the parser's `publicContractRisk`, producing an inaccurate route record.
- Host receipts should make effective context isolation and named-role enforcement inspectable; the requested zero-context judge boundary could not be independently proven from the agent result alone.
- Graphify package refresh should distinguish a product failure from a sandbox `Operation not permitted` limitation.

## Stop conditions and safety

- Do not repair SauceDemo itself.
- Do not fabricate remote deployment/content identity.
- Do not bypass Appraise approvals, target binding, evidence sealing, or decisions.
- Do not reuse foreign locator resources or inherited fresh-user answers.
- Do not expose or persist generated passwords or credential values.
- Do not edit generated automation output directly.
- Do not commit, push, merge, reset, clean, or discard the dirty tree without explicit user authorization.
