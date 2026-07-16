# Repository Release Readiness, Security, Resilience, And Maintainability Mitigation

## Status

Proposed implementation plan. Human review is required before implementation.

The current repository is **not release-ready**. This plan addresses the confirmed repository-wide audit findings in
risk order. It covers application code, public packages, runtime behavior, CI, generated artifacts, documentation,
repository rules, and agent skills.

This is a mitigation plan, not authorization to preserve obsolete behavior. When a compatibility layer would keep an
unsafe or duplicated architecture alive, prefer a documented migration and deletion of the old path.

## Objective

Make AppraiseJS safe and understandable enough to release by replacing project-specific and one-off behavior with a
small set of generic contracts:

1. one enforced local-only trust boundary;
2. one secret-reference model that never persists secret values;
3. one declarative MCP operation registry shared by both transports;
4. one owner for each runtime lifecycle transition;
5. one explicit project scope for every project-sensitive read and write;
6. one generated-artifact policy enforced by CI;
7. one source of truth for each public contract, with docs and skills delegating to it.

The implementation must preserve the corrected planning boundary already present in the worktree: the coding agent
authors a project-specific task graph from the user's brief; Appraise validates structure, scope, lifecycle state,
evidence, and review binding. Appraise must not regain hard-coded project archetypes, domain keyword routing, or
application-specific task templates.

## Audit Baseline

The audit established the following release blockers and quality gaps. These numbers are a snapshot, not targets to
game by changing thresholds or exclusions.

| ID   | Severity | Confirmed condition                                                                                                                                                      |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A-01 | Critical | The documented local-only web boundary is not enforced by the production start command, while destructive server operations have no independent authentication boundary. |
| A-02 | Critical | Environment passwords are stored in SQLite and projected in plaintext into tracked automation configuration.                                                             |
| A-03 | High     | Streamable HTTP MCP accepts unauthenticated requests and lacks complete loopback, host/origin, body-size, and concurrency controls.                                      |
| A-04 | High     | The root unit suite passes 821 tests but exits unsuccessfully because the test-run logger is written after it is closed.                                                 |
| A-05 | High     | CI, static analysis, and dependency automation do not cover the active release branch and all public packages.                                                           |
| A-06 | High     | `packages/appraisejs/src/mcp.ts` is a 3,000-plus-line registration and transport monolith with 79 tool registrations and 15 resources.                                   |
| A-07 | High     | Core application modules contain large controllers/services and 42 complexity suppressions across 21 source files.                                                       |
| A-08 | High     | Runtime logs, reports, traces, screenshots, project state, and built companion output are tracked in Git.                                                                |
| A-09 | Medium   | Common list operations and log reads are unbounded; repository search found substantially more `findMany` calls than pagination controls.                                |
| A-10 | Medium   | Active API, Node-version, package-purpose, and lifecycle documentation has drifted from source behavior.                                                                 |
| A-11 | Medium   | Planning skills duplicate lifecycle instructions and can diverge instead of delegating to one canonical workflow.                                                        |
| A-12 | Medium   | Repository rules prohibit useful generic extraction too categorically and discourage boundary tests for server actions.                                                  |
| A-13 | Medium   | The root package is publishable without a deliberate file allowlist, making accidental publication possible.                                                             |

Additional measured quality evidence:

- root Fallow grade: B, 77.2, with 107 findings above configured thresholds;
- public MCP package Fallow grade: B, 72.4, with 14 complexity findings and 7.8% duplication;
- React Doctor: 82/100 with 71 findings;
- root lint: zero errors and 22 warnings, many caused by tracked runtime artifacts;
- harness checks: passed across 40 files;
- public `appraisejs` package tests: 105 passed;
- `create-appraisejs` package tests: 65 passed;
- cached offline production dependency audit: no known vulnerabilities, but no live-registry verification was made;
- no production project-specific planning archetypes remain in the corrected worktree.

## Non-Negotiable Architecture Decisions

### 1. Appraise 0.5 is local-only

- Production and development servers bind to an explicit loopback address.
- Streamable HTTP MCP binds to loopback and requires the existing coordinator bearer identity.
- Requests with a non-loopback peer, invalid `Host`, or disallowed `Origin` are rejected before routing.
- A non-loopback host flag is an error in 0.5, not an undocumented escape hatch.
- Remote and multi-user deployment requires a separate approved authentication, authorization, session, CSRF, and
  network architecture. It is not part of this mitigation.

This decision gives the strongest practical boundary with the least new code. It avoids inventing a partial account
system merely to compensate for an accidentally public local tool.

### 2. Store references, never secret values

- Replace `Environment.password` with a non-secret process-environment variable name such as
  `passwordEnvironmentVariable`.
- Resolve the referenced value only at execution time and keep it out of database rows, API responses, logs,
  generated files, reports, diagnostics, and UI hydration.
- Do not introduce a generic secret-provider framework until a second provider is actually approved.
- Existing plaintext rows are legacy hazards. They must be migrated or explicitly disabled and redacted before the
  release gate can pass.

### 3. Appraise validates plans; it does not invent domain semantics

- Planning sessions remain generic across todo apps, meditation apps, games, APIs, libraries, and future project
  types.
- The agent authors tasks, dependencies, acceptance criteria, and implementation notes from the brief and repository.
- Appraise validates schema, graph integrity, scope, lifecycle gates, review identity, and evidence bindings.
- Production code and skills must not contain domain keyword-to-task mappings, archetype registries, or fallback task
  lists for named application types.
- A regression test must fail if planning code begins emitting application-specific tasks from domain keywords.

### 4. Prefer registries and policies over repeated branches

- MCP operations are data-driven definitions grouped by domain, not one long function containing repeated tool
  registration boilerplate.
- Security checks are shared ingress policies, not copied conditions in every route or tool.
- Pagination and bounded-response rules are shared contracts, not per-screen conventions.
- Generated-artifact classification is one denylist/allowlist policy used by Git hooks and CI.

### 5. Simplification must delete code

- Do not improve scores by increasing thresholds, adding exclusions, moving code without changing ownership, or adding
  suppressions.
- Do not add repositories, factories, adapters, provider frameworks, or compatibility layers without at least two
  real consumers or a protocol boundary that requires them.
- Each decomposition task must reduce duplicated branches, public surface area, or total production code in the
  affected responsibility.
- Remove superseded exports and files in the same tranche; no `legacy`, `temporary`, `v2`, or dual-write path remains
  without a dated removal gate approved in review.

## Dependency Order

```text
contract fixtures and release ledger
  -> local trust boundary and secret references
  -> logger lifecycle reliability
  -> CI/package coverage
  -> MCP registry decomposition
  -> application hotspot decomposition
  -> bounded data and log access
  -> artifact/package cleanup
  -> docs, rules, and skill consolidation
  -> full release validation
```

Security contract changes precede refactoring so later work cannot preserve an unsafe transport by accident. Contract
fixtures precede decomposition so behavior remains stable while code moves.

## Implementation Plan

## Phase 0: Freeze Generic Contracts And Release Evidence

### Task 0.1: Add an audit finding ledger and executable release-gate command

Create a small machine-readable ledger for A-01 through A-13 and a command that reports each finding as open or
verified from named checks. The command must orchestrate existing checks; it must not reimplement lint, test, Fallow,
React Doctor, package, or security scanners.

**Acceptance criteria**

- Every audit finding has an owner, verification command, required evidence, and release-blocking state.
- `npm run release:check` exits nonzero while any critical/high finding is open or any required command fails.
- Waivers require an owner, rationale, expiry date, and linked review; undocumented skips are impossible.
- The ledger contains no absolute developer paths, credentials, or transient run identifiers.

**Likely files**

- `package.json`
- `scripts/check-release-readiness.mjs`
- `config/release-readiness.json`
- `docs/release-readiness.md`

**Verification:** parser/unit tests for the checker; `npm run release:check` must initially fail on the known blockers.

**Dependencies:** none. **Estimated scope:** medium.

### Task 0.2: Lock the generic planning intelligence boundary with regression tests

Replace any remaining test assumptions that Appraise creates a task graph from a domain brief with contract tests
showing that the agent supplies the graph and Appraise validates it. Add a negative source check for production
archetype/keyword routing without turning the check into a brittle ban on words in fixtures or documentation.

**Acceptance criteria**

- Planning works for two structurally different briefs without project-type branches in Appraise production code.
- The same plan validation path accepts any schema-valid agent-authored graph.
- Domain keywords alone never cause Appraise to synthesize tasks or acceptance criteria.
- `appraise-project-from-brief` delegates plan authoring/review to the canonical planning skill.

**Likely files**

- `packages/appraisejs/src/mcp.test.ts`
- `packages/appraisejs/src/mcp.e2e.ts`
- `.agents/skills/appraise-planning/SKILL.md`
- `.agents/skills/appraise-project-from-brief/SKILL.md`

**Verification:** focused MCP tests plus `npm run check:harness`.

**Dependencies:** none. **Estimated scope:** medium.

### Checkpoint 0

- The release checker exposes all known blockers rather than presenting a false green state.
- Generic planning tests fail if project-specific task synthesis returns.
- No production behavior has changed yet.

## Phase 1: Close Critical Security Boundaries

### Task 1.1: Enforce loopback-only web startup

Make loopback binding explicit in every supported development and production startup path. Add a startup assertion so
an environment or CLI override cannot silently expose Appraise 0.5 on a non-loopback interface.

**Acceptance criteria**

- `npm run dev` and `npm run start` listen only on the documented loopback address.
- Non-loopback host configuration fails closed with one actionable error.
- A socket-level test proves the service is unavailable through a non-loopback interface.
- Setup and lifecycle docs state that remote exposure is unsupported in 0.5.

**Likely files**

- `package.json`
- `scripts/start-local.mjs`
- `docs/agent-mcp-setup.md`
- `README.md`

**Verification:** startup unit test, socket smoke test, and production build/start smoke.

**Dependencies:** Task 0.1. **Estimated scope:** medium.

### Task 1.2: Add one request-boundary policy for state-changing web ingress

Extend the app request boundary to cover APIs and other state-changing ingress currently excluded from project
selection middleware. Validate loopback peer assumptions, `Host`, and same-origin intent centrally before a request
can reach a destructive handler. Preserve framework-native Server Action origin checks rather than duplicating them.

**Acceptance criteria**

- Cross-origin and invalid-host mutation requests are rejected before route/service code runs.
- Read-only routes required by the local UI continue to work.
- The policy is called from one ingress layer, with narrow documented exceptions only.
- Tests cover DNS-rebinding-style `Host` values, forged `Origin`, absent `Origin`, and valid local requests.

**Likely files**

- `src/proxy.ts`
- `src/lib/local-request-boundary.ts`
- `src/lib/local-request-boundary.test.ts`
- `docs/server-actions-conventions.md`

**Verification:** focused boundary tests and representative API integration tests.

**Dependencies:** Task 1.1. **Estimated scope:** medium.

### Task 1.3: Harden Streamable HTTP MCP without changing stdio behavior

Reuse the coordinator bearer identity at MCP ingress, enforce loopback binding and peer checks, validate `Host` and
`Origin`, cap request bodies, and bound concurrent sessions/requests. Keep stdio transport protocol output unchanged.

**Acceptance criteria**

- HTTP MCP rejects missing/invalid bearer credentials before parsing a tool request.
- Non-loopback bind requests, non-loopback peers, invalid hosts, and disallowed origins fail closed.
- Oversized bodies receive `413`; excess concurrent work receives a bounded retryable response.
- Setup output configures the required authorization header without printing the token to normal logs.
- Existing stdio contract tests remain byte/protocol compatible.

**Likely files**

- `packages/appraisejs/src/mcp.ts`
- `packages/appraisejs/src/coordinator-client.ts`
- `packages/appraisejs/src/mcp.test.ts`
- `packages/appraisejs/src/mcp.e2e.ts`
- `docs/agent-mcp-setup.md`

**Verification:** package tests, negative HTTP E2E cases, stdio E2E, and `npm run build:appraisejs`.

**Dependencies:** Tasks 1.1 and 1.2. **Estimated scope:** medium.

### Task 1.4: Replace persisted environment passwords with environment-variable references

Change the canonical data model from a secret value to the name of a process environment variable. Add an explicit
legacy migration state. An environment with unresolved or legacy credentials is disabled for authenticated execution
and reports a redacted, actionable configuration error.

**Acceptance criteria**

- New and updated rows cannot persist password values.
- Runtime resolution reads only the named process environment variable and never returns its value.
- Legacy rows are inventoried, disabled, and redacted until the operator supplies a reference; the migration is
  transactional and restart-safe.
- The release checker fails while any legacy plaintext password remains.

**Likely files**

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_replace_environment_password_with_reference/migration.sql`
- `src/services/environment/environment-service.ts`
- `src/lib/environment-secret.ts`
- `src/lib/environment-secret.test.ts`

**Verification:** migration tests against populated SQLite fixtures, service tests, and secret-leak assertions.

**Dependencies:** Task 0.1. **Estimated scope:** medium.

### Task 1.5: Remove secret values from UI, sync, generated files, and scaffold source

Update forms and environment projection/sync contracts to accept and display only the reference name. Make generated
automation configuration secret-free. Apply the root-first scaffold workflow and regenerate templates rather than
editing template output by hand.

**Acceptance criteria**

- Browser payloads and form defaults contain only reference metadata, never a resolved secret.
- `automation/config/environments/environments.json` contains no password or resolved credential field.
- Sync comparison uses the reference name and does not read secret values.
- A repository-wide secret sentinel test proves a known fixture secret cannot appear in DB exports, logs, reports,
  generated files, snapshots, or package tarballs.

**Likely files**

- `src/app/(base)/environments/environment-form.tsx`
- `src/app/(base)/environments/environment-helpers.ts`
- `src/lib/environment-file-utils.ts`
- `src/lib/sync/sync-pending-counts.ts`
- `docs/automation-sync-rules.md`

**Verification:** focused UI/service/sync tests, `npm --prefix packages/create-appraisejs run prepare-template`, package
tests, and secret-sentinel scan.

**Dependencies:** Task 1.4. **Estimated scope:** medium.

### Security Checkpoint

- A-01, A-02, and A-03 are verified closed.
- No supported process listens beyond loopback.
- No persisted, projected, logged, or packaged environment secret remains.
- HTTP MCP rejects all unauthenticated and non-local negative cases; stdio still works.
- Do not proceed to architecture refactoring if this checkpoint is red.

## Phase 2: Restore Runtime Reliability

### Task 2.1: Give test-run terminalization and logger closure one owner

Refactor test-run completion so success and failure paths report through one terminalization function. Close the logger
exactly once after the final status write, and make late writes return a controlled result rather than throwing an
unhandled stream error.

**Acceptance criteria**

- Success, failure, cancellation, timeout, and setup-error paths each terminalize once.
- No code writes after logger closure and `close` is idempotent.
- An error raised during post-run metrics/report work produces one failed run and one final log entry.
- The full unit command exits zero with no unhandled rejection or `ERR_STREAM_WRITE_AFTER_END`.

**Likely files**

- `src/services/test-run/test-run-service.ts`
- `src/lib/test-run/test-run-logger.ts`
- `src/services/test-run/test-run-service.test.ts`
- `docs/test-run-runtime.md`

**Verification:** focused race/fault-injection tests followed by `npm run validate:unit`.

**Dependencies:** Task 0.1. **Estimated scope:** medium.

### Task 2.2: Add terminal-state invariants at the service boundary

Centralize legal final statuses and required artifacts so run completion cannot be partially reported. Reuse the same
invariants for managed capsules and ordinary local runs instead of maintaining separate terminal-state branches.

**Acceptance criteria**

- Each terminal state has an explicit required/optional artifact contract.
- Invalid state transitions fail before persistence and leave a diagnosable run.
- Managed and ordinary runs share terminalization logic; only their evidence requirements differ as data.
- Cancellation and process-manager cleanup remain idempotent.

**Likely files**

- `src/services/test-run/test-run-service.ts`
- `src/lib/test-run/terminal-state.ts`
- `src/lib/test-run/terminal-state.test.ts`
- `src/lib/test-run/process-manager.ts`

**Verification:** state-table unit tests, existing managed-run tests, and targeted cancellation smoke.

**Dependencies:** Task 2.1. **Estimated scope:** medium.

### Reliability Checkpoint

- A-04 is closed.
- Focused fault injection and the full root unit suite exit cleanly.
- No `unhandledRejection`, stream-after-close, duplicate final event, or double cleanup is observed.

## Phase 3: Make CI Represent The Release

### Task 3.1: Run CI on the active release branch and every shipped package

Update CI triggers for `appraise-0.5` and add explicit jobs for the root app, `packages/appraisejs`, and
`packages/create-appraisejs`. Keep jobs separately visible so one package cannot be hidden by root exclusions.

**Acceptance criteria**

- Pull requests targeting `appraise-0.5` run all release jobs.
- Each public package runs its own tests and build/package validation.
- The root unit config may exclude package tests only because package jobs are required.
- Branch protection can require one stable aggregate release check.

**Likely files**

- `.github/workflows/ci.yml`
- `package.json`
- `packages/appraisejs/package.json`
- `packages/create-appraisejs/package.json`
- `docs/agent-validation-matrix.md`

**Verification:** local workflow syntax validation and a real pull-request CI run.

**Dependencies:** Security and Reliability Checkpoints. **Estimated scope:** medium.

### Task 3.2: Extend static quality gates without hiding existing findings

Run Fallow against the root app and each package with appropriate package boundaries. Keep React Doctor scoped to
actual React source. Establish ratchets from the audit baseline and prohibit new suppressions, ignores, or raised
thresholds without review.

**Acceptance criteria**

- Public package source participates in required dead-code, duplication, dependency, and complexity checks.
- Changed files cannot add a new threshold violation or suppression.
- Scores improve through code deletion/decomposition, not configuration relaxation.
- Generated/runtime artifacts are excluded through the artifact policy, not one-off tool ignores.

**Likely files**

- `.fallowrc.json`
- `react-doctor.config.json`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/agent-validation-matrix.md`

**Verification:** root and package quality commands plus a deliberate failing fixture for the ratchet.

**Dependencies:** Task 3.1. **Estimated scope:** medium.

### Task 3.3: Cover all package manifests with dependency and package-content checks

Add Dependabot coverage for each independently versioned package. Make live production dependency audit and package
tarball inspection required release checks.

**Acceptance criteria**

- Root and both package manifests/lockfiles receive dependency updates.
- CI uses live registry data for production dependency audit and records the command output.
- Tarballs contain only documented source/build/license/readme files and no runtime state, secrets, databases, or
  reports.
- Registry/network failure is reported as an unavailable check, never a false pass.

**Likely files**

- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `package.json`
- `packages/appraisejs/package.json`
- `packages/create-appraisejs/package.json`

**Verification:** Dependabot config validation, live `npm audit --omit=dev`, and `npm pack --dry-run` for publishable
packages.

**Dependencies:** Task 3.1. **Estimated scope:** small.

### CI Checkpoint

- A-05 is closed.
- A pull request to `appraise-0.5` cannot merge without root, package, security, quality, and package-content checks.
- A local cached audit is not treated as final dependency evidence.

## Phase 4: Replace The MCP Monolith With One Declarative Registry

### Task 4.1: Freeze the complete MCP public contract

Snapshot tool names, resource URIs, input schemas, response modes, error envelopes, and transport parity before moving
registrations. Keep the snapshot readable and generated from canonical definitions once the registry exists.

**Acceptance criteria**

- All 79 tools and 15 resources are accounted for explicitly.
- StdIO and HTTP expose the same operation contract unless a transport exception is documented and tested.
- Contract tests compare names and schemas, not incidental registration order.
- Unknown, duplicate, and unregistered definitions fail package startup in tests.

**Likely files**

- `packages/appraisejs/src/mcp-contract.test.ts`
- `packages/appraisejs/src/mcp.test.ts`
- `packages/appraisejs/src/mcp.e2e.ts`
- `docs/coordinator-api-mcp.md`

**Verification:** contract snapshot and transport-parity tests.

**Dependencies:** Task 1.3. **Estimated scope:** small.

### Task 4.2: Extract shared coordinator-call and response-projection helpers

Replace repeated request, error mapping, compact/full response, and next-action branches with small typed helpers. Do
not create a generic framework: extract only behavior repeated by current operations.

**Acceptance criteria**

- Coordinator calls have one timeout/error/redaction path.
- Compact/full response selection has one implementation per response family.
- Existing operation-specific semantics remain visible in domain modules.
- Production lines and duplicated branches decrease; no new adapter layer simply forwards every argument.

**Likely files**

- `packages/appraisejs/src/mcp/coordinator-call.ts`
- `packages/appraisejs/src/mcp/response-projector.ts`
- `packages/appraisejs/src/mcp/coordinator-call.test.ts`
- `packages/appraisejs/src/mcp.ts`

**Verification:** helper tests, package tests, and before/after duplication report.

**Dependencies:** Task 4.1. **Estimated scope:** medium.

### Task 4.3: Move operation definitions into domain registries

Group current operations by project, planning, validation, baseline, implementation, completion, test-run, and
diagnostic domain. Each definition owns only its name, description, schema, coordinator operation, and projector.

**Acceptance criteria**

- `createAppraiseMcpServer` composes registries and contains no domain-specific branching.
- Adding a schema-valid operation requires one domain definition and tests, not edits across transport branches.
- Duplicate tool/resource names fail fast.
- No domain registry contains project-type archetypes or inferred task templates.

**Likely files**

- `packages/appraisejs/src/mcp/registry.ts`
- `packages/appraisejs/src/mcp/domains/planning.ts`
- `packages/appraisejs/src/mcp/domains/validation.ts`
- `packages/appraisejs/src/mcp/domains/runtime.ts`
- `packages/appraisejs/src/mcp.ts`

**Verification:** full contract snapshot, package tests, MCP E2E, and Fallow duplication/complexity checks.

**Dependencies:** Task 4.2. **Estimated scope:** medium per domain batch; implement as separate commits.

### Task 4.4: Reuse immutable MCP definitions across HTTP requests

Build and validate the operation registry once per process. Create only request/session state per HTTP request, with
bounded cleanup. Do not cache target-project selection or coordinator identity across requests.

**Acceptance criteria**

- Static schemas and definitions are created once.
- Request-scoped identity, project binding, abort signal, and transport state never leak between clients.
- Concurrency tests prove isolation and bounded cleanup.
- A benchmark demonstrates lower allocation/startup cost without weakening auth checks.

**Likely files**

- `packages/appraisejs/src/mcp/http-server.ts`
- `packages/appraisejs/src/mcp/registry.ts`
- `packages/appraisejs/src/mcp/http-server.test.ts`
- `packages/appraisejs/src/mcp.ts`

**Verification:** concurrency/isolation tests, package E2E, and a repeatable microbenchmark.

**Dependencies:** Task 4.3. **Estimated scope:** medium.

### MCP Architecture Checkpoint

- A-06 is closed without changing the public operation contract.
- `mcp.ts` is a composition entry point, not a domain implementation.
- Package complexity and duplication improve without threshold/config changes.
- Security negative tests still pass after the transport refactor.

## Phase 5: Decompose Application Hotspots By Ownership

Perform these tasks one at a time. Each extraction must leave a green focused suite and remove its obsolete code in
the same commit. Do not create a shared abstraction merely because two functions have similar names.

### Task 5.1: Replace coordinator route branching with an operation table

Move parsing and dispatch metadata into a typed operation table while services retain business rules. The route should
authenticate/validate ingress, resolve the operation, map the response, and do nothing else.

**Acceptance criteria**

- Unknown operations and methods fail through one bounded error path.
- Adding an operation does not require another top-level conditional branch.
- Project scope and coordinator authentication cannot be bypassed by operation metadata.
- Route behavior is covered by table-driven contract tests.

**Likely files**

- `src/app/api/internal/coordinator/[...operation]/route.ts`
- `src/services/coordinator/coordinator-operation-registry.ts`
- `src/services/coordinator/coordinator-operation-registry.test.ts`
- `docs/coordinator-api-mcp.md`

**Verification:** route contract tests, coordinator service tests, and complexity check.

**Dependencies:** Phase 4 contract patterns, not implementation helpers. **Estimated scope:** medium.

### Task 5.2: Split test-run execution orchestration into explicit stages

After terminal-state work is stable, isolate preparation, process execution, report ingestion, metrics, and
terminalization as named stages coordinated by one short service flow.

**Acceptance criteria**

- Each stage has typed input/output and no hidden mutation of another stage's state.
- One orchestrator owns ordering and rollback/terminalization decisions.
- Existing managed/local run behavior remains contract-compatible.
- Complexity suppressions removed from the touched flow are not replaced elsewhere.

**Likely files**

- `src/services/test-run/test-run-service.ts`
- `src/services/test-run/stages/prepare-run.ts`
- `src/services/test-run/stages/execute-run.ts`
- `src/services/test-run/stages/collect-run-evidence.ts`
- `src/services/test-run/test-run-service.test.ts`

**Verification:** stage tests, test-run service tests, runtime smoke, Fallow, and build.

**Dependencies:** Reliability Checkpoint. **Estimated scope:** medium per stage batch.

### Task 5.3: Split plan-review state management from rendering

Move plan/review loading, mutation commands, and derived graph state into focused hooks/services. Keep route-specific UI
local; extract shared UI only where there are real consumers.

**Acceptance criteria**

- The main workspace component renders composition and contains no server response normalization.
- Review commands have one pending/error/replay path.
- Keyboard, focus, status announcement, and stale-review behavior remain covered.
- React Doctor findings in the touched workspace are resolved rather than ignored.

**Likely files**

- `src/app/(base)/plan-review/[planId]/plan-review-workspace.tsx`
- `src/app/(base)/plan-review/[planId]/use-plan-review-controller.ts`
- `src/app/(base)/plan-review/[planId]/plan-review-command-panel.tsx`
- `src/app/(base)/plan-review/[planId]/plan-review-workspace.test.tsx`

**Verification:** component tests, accessibility assertions, React Doctor, and browser review-loop smoke.

**Dependencies:** Task 3.2. **Estimated scope:** medium per UI slice.

### Task 5.4: Separate coordinator implementation policy from persistence mechanics

Reduce the coordinator implementation service to lifecycle policy and orchestration. Move receipt persistence,
evidence reconciliation, and run lookup into narrowly owned existing or new modules only where those responsibilities
are already repeated.

**Acceptance criteria**

- Lifecycle transitions are readable as a short ordered flow.
- Persistence helpers cannot advance lifecycle state independently.
- Receipt replay and evidence binding retain their current integrity tests.
- No second implementation lifecycle or compatibility path is introduced.

**Likely files**

- `src/services/coordinator/coordinator-implementation-service.ts`
- `src/services/coordinator/implementation-receipt-store.ts`
- `src/services/coordinator/implementation-evidence-service.ts`
- `src/services/coordinator/coordinator-implementation-service.test.ts`

**Verification:** coordinator implementation tests, crash/replay tests, Fallow, and build.

**Dependencies:** Task 5.1. **Estimated scope:** medium.

### Task 5.5: Replace sync-pending branch accumulation with typed comparators

Represent each sync family with a typed loader and pure comparator, then aggregate counts generically. Do not force
unrelated entities into a lowest-common-denominator schema.

**Acceptance criteria**

- Each entity family exposes one pure comparison result with actionable mismatch reasons.
- Aggregation contains no entity-specific property branches.
- Environment comparison uses only non-secret references after Phase 1.
- Existing sync output and dry-run behavior remain compatible.

**Likely files**

- `src/lib/sync/sync-pending-counts.ts`
- `src/lib/sync/pending-comparators.ts`
- `src/lib/sync/pending-comparators.test.ts`
- `docs/automation-sync-rules.md`

**Verification:** comparator matrix tests, sync tests, Fallow, and scaffold template preparation if shared source moves.

**Dependencies:** Task 1.5. **Estimated scope:** medium per entity batch.

### Application Architecture Checkpoint

- A-07 is closed for the audited hotspots.
- Production complexity suppressions in touched modules are removed, not relocated.
- Root Fallow and React Doctor scores improve materially with no relaxed configuration.
- Public behavior and lifecycle gates remain covered by contract and browser tests.

## Phase 6: Bound Data And Artifact Reads

### Task 6.1: Introduce one cursor pagination contract for list services

Define a small cursor contract with a conservative default and hard maximum. Apply it first to plans and test runs,
then to other user-visible or MCP-exposed unbounded lists based on query inventory.

**Acceptance criteria**

- List responses include items, next cursor, applied limit, and stable ordering.
- Caller limits above the maximum are rejected or clamped consistently.
- Filters are applied before pagination and cursors cannot cross target-project scope.
- UI and MCP clients can fetch additional pages without duplicate or missing records.

**Likely files**

- `src/lib/pagination.ts`
- `src/services/test-run/test-run-service.ts`
- `src/services/coordinator/coordinator-plan-service.ts`
- `packages/appraisejs/src/mcp/response-projector.ts`
- `src/lib/pagination.test.ts`

**Verification:** boundary/property tests, two-project scope tests, and query-count assertions.

**Dependencies:** relevant Phase 4 and 5 decomposition. **Estimated scope:** medium per list family.

### Task 6.2: Tail logs without loading the complete artifact

Replace whole-file read/split behavior with bounded byte-range tailing. Preserve line boundaries, truncation metadata,
UTF-8 correctness, and missing/rotated artifact diagnostics.

**Acceptance criteria**

- Memory use is bounded by requested output plus a small fixed buffer.
- Large single lines, multibyte characters, empty files, rotation, and missing files are handled deterministically.
- API and UI communicate truncation and allow forward pagination or follow behavior where supported.
- Target-project and run identity checks occur before filesystem reads.

**Likely files**

- `src/app/api/test-runs/[runId]/logs/route.ts`
- `src/lib/test-run/log-tail-reader.ts`
- `src/lib/test-run/log-tail-reader.test.ts`
- `src/components/test-run/use-log-viewer.ts`
- `src/components/test-run/log-viewer.tsx`

**Verification:** large-file tests with memory ceiling, route tests, and browser log-view smoke.

**Dependencies:** Task 2.1. **Estimated scope:** medium.

### Task 6.3: Profile hot queries before adding indexes or caches

Instrument representative local datasets and use SQLite query plans to identify actual hot scans. Add only indexes
supported by measured query patterns. Do not introduce application caches unless profiling proves repeated expensive
work that pagination/indexing cannot solve.

**Acceptance criteria**

- A repeatable fixture records dataset size, query count, latency, and query plan.
- Each new index names the measured query it improves and its write/storage cost.
- No cross-project or stale-data cache is introduced.
- Performance budgets run in a stable benchmark job or documented local harness, not timing-fragile unit assertions.

**Likely files**

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_add_measured_query_indexes/migration.sql`
- `scripts/benchmark-repository-queries.mjs`
- `docs/performance-budgets.md`

**Verification:** before/after query plans and benchmark evidence on the same fixture.

**Dependencies:** Task 6.1. **Estimated scope:** medium.

### Performance Checkpoint

- A-09 is closed for all externally reachable and user-visible lists/log reads.
- Default and maximum response sizes are documented and contract-tested.
- No index or cache exists without measured evidence.

## Phase 7: Clean Repository And Package Boundaries

### Task 7.1: Define and enforce the generated/runtime artifact policy

Classify source-controlled fixtures, reproducible generated outputs, local runtime state, and release artifacts in one
policy. Update ignores from that policy and add a checker that rejects tracked runtime paths.

**Acceptance criteria**

- `.appraise/`, `.playwright-cli/`, runtime reports/logs/traces/screenshots, local databases, and companion build output
  are ignored unless a named sanitized fixture allowlist requires them.
- The checker fails if a runtime artifact is staged or tracked outside the fixture allowlist.
- Generated Graphify and scaffold outputs remain governed by their existing documented workflows.
- Tests use minimal deterministic fixtures, not copied real run directories.

**Likely files**

- `.gitignore`
- `scripts/check-generated-artifacts.mjs`
- `docs/agent-generated-artifacts.md`
- `package.json`
- `AGENTS.md`

**Verification:** checker fixtures, `git ls-files` policy audit, harness check, and package dry runs.

**Dependencies:** Task 0.1. **Estimated scope:** medium.

### Task 7.2: Remove tracked runtime artifacts and audit repository history for exposed secrets

Untrack current runtime output without deleting the user's local working evidence. Scan tracked history for real
credentials or tokens. History rewriting and credential rotation require a separate explicit approval because they
affect collaborators and external systems.

**Acceptance criteria**

- Current tree contains no tracked runtime state outside the fixture allowlist.
- Sanitized fixtures contain no machine-specific absolute paths, tokens, passwords, cookies, or private payloads.
- Secret-scan findings are classified as fixture, false positive, or real exposure with evidence.
- Any real exposure blocks release until credentials are rotated; history rewrite is proposed separately if needed.

**Likely files**

- tracked files identified by `scripts/check-generated-artifacts.mjs`
- sanitized test fixtures in their owning test directories
- `docs/agent-generated-artifacts.md`

**Verification:** clean policy check, secret scan of current tree and history, and affected tests.

**Dependencies:** Task 7.1. **Estimated scope:** medium.

### Task 7.3: Make root publication impossible and package contents explicit

Set the repository root package to private. Add explicit `files` allowlists to publishable packages where absent and
keep package descriptions/readmes aligned with their real CLI, coordinator, MCP, and registry responsibilities.

**Acceptance criteria**

- `npm publish` from the root fails by design.
- Publishable tarballs contain only the documented package contract.
- Tarball inspection terminates quickly and never traverses runtime directories.
- Package metadata and Node engine requirements match source and CI.

**Likely files**

- `package.json`
- `packages/appraisejs/package.json`
- `packages/appraisejs/README.md`
- `packages/create-appraisejs/package.json`
- `packages/create-appraisejs/README.md`

**Verification:** `npm pack --dry-run` for each publishable package and an asserted root publish refusal.

**Dependencies:** Tasks 7.1 and 3.3. **Estimated scope:** small.

### Repository Hygiene Checkpoint

- A-08 and A-13 are closed.
- A fresh clone contains source, intentional generated outputs, and sanitized fixtures only.
- Local test execution does not dirty tracked runtime paths.
- Package tarballs are minimal and secret-free.

## Phase 8: Consolidate Docs, Rules, And Skills

### Task 8.1: Generate public operation reference from the canonical registries

Generate the stable operation inventory used by documentation from the coordinator and MCP registries. Keep human
documentation focused on lifecycle meaning, examples, and constraints. A contract test must detect a route/tool that
exists in only one side of the documented boundary.

**Acceptance criteria**

- Removed or rejected operations such as obsolete validation publication paths are not advertised as callable.
- Every public MCP tool maps to an existing coordinator operation or documented local-only operation.
- Generated reference output is clearly marked and never hand-edited.
- Human docs explain behavior without duplicating schemas verbatim.

**Likely files**

- `scripts/generate-coordinator-reference.mjs`
- `docs/coordinator-api-mcp.md`
- `packages/appraisejs/src/mcp/registry.ts`
- `src/services/coordinator/coordinator-operation-registry.ts`
- `package.json`

**Verification:** generation idempotence, contract parity test, Prettier, and harness check.

**Dependencies:** Tasks 4.3 and 5.1. **Estimated scope:** medium.

### Task 8.2: Make each planning skill a single-responsibility router

Keep project discovery/registration in `appraise-project-from-brief`, plan authoring/review in `appraise-planning`, and
lifecycle transitions in their owning skills. Replace copied instructions with explicit handoff conditions and links
to canonical repo docs.

**Acceptance criteria**

- No lifecycle sequence is duplicated across planning skills.
- Discovery hands off a bound target and brief; it does not author fallback tasks.
- Planning requires an agent-authored graph and preserves human review gates.
- Packaged skill copies are regenerated or synchronized from canonical source and pass drift checks.

**Likely files**

- `.agents/skills/appraise-project-from-brief/SKILL.md`
- `.agents/skills/appraise-planning/SKILL.md`
- `packages/appraisejs/agent-skills/appraise-planning-standby/SKILL.md`
- `docs/agent-lifecycle-flow.md`
- `scripts/check-agent-harness.mjs`

**Verification:** `npm run check:harness`, skill drift tests, and two natural-language planning contract fixtures.

**Dependencies:** Task 0.2. **Estimated scope:** medium.

### Task 8.3: Replace categorical repository rules with evidence-based boundaries

Revise component and server-action guidance so it discourages speculative generic layers but permits small shared
abstractions after demonstrated duplication. Require tests at service boundaries and at server-action mapping/error
boundaries when those mappings contain behavior.

**Acceptance criteria**

- Component rules define extraction signals: multiple real consumers, independent responsibility, or repeated state
  and error behavior.
- Rules explicitly reject catch-all CRUD frameworks and pass-through wrappers.
- Server-action rules require focused tests for parsing, authorization/scope mapping, cache invalidation, and error
  envelopes when present.
- Examples point to current canonical code, not historical plans.

**Likely files**

- `docs/component-organization-rules.md`
- `docs/server-actions-conventions.md`
- `docs/agent-task-recipes.md`
- `AGENTS.md`

**Verification:** Prettier, `npm run check:harness`, and review against actual refactors from Phases 4 and 5.

**Dependencies:** Application Architecture Checkpoint. **Estimated scope:** small.

### Task 8.4: Correct active documentation drift and add drift tests

Align Node requirements, package purpose, startup boundary, lifecycle operations, generated artifacts, scaffold flow,
and validation commands with source. Historical plans remain historical and must not be mass-rewritten.

**Acceptance criteria**

- Active docs contain one current Node floor matching package engines and CI.
- Package READMEs describe all current public responsibilities accurately.
- Startup, MCP auth, secret references, pagination, and artifact rules are documented in their owning docs.
- Cheap drift assertions run in the harness; high-maintenance prose snapshots are avoided.

**Likely files**

- `README.md`
- `packages/appraisejs/README.md`
- `docs/agent-mcp-setup.md`
- `docs/agent-validation-matrix.md`
- `scripts/check-agent-harness.mjs`

**Verification:** harness check, docs link check, Prettier, and command-example smoke tests.

**Dependencies:** all behavior-changing phases. **Estimated scope:** medium.

### Documentation And Agent Checkpoint

- A-10, A-11, and A-12 are closed.
- Active docs, rules, and skills point to canonical source instead of restating divergent contracts.
- No agent instruction asks Appraise to infer project-specific task content.

## Phase 9: Release Validation And Acceptance

### Task 9.1: Run the complete automated release matrix

Run all focused checks during their owning tasks, then execute the complete matrix from a clean checkout with online
dependency access. Do not bypass hooks or convert failures into warnings.

**Required commands/evidence**

- `npm run check:harness`
- `npm run lint`
- `npm run validate`
- `npm run build`
- `npm run quality:fallow:commit`
- `npm run quality:react-doctor:commit`
- `npm --prefix packages/appraisejs run test`
- `npm --prefix packages/appraisejs run test:mcp:e2e`
- `npm run build:appraisejs`
- `npm --prefix packages/create-appraisejs run prepare-template`
- package tests/builds for `create-appraisejs`
- live production dependency audits for every lockfile
- package tarball inspections and generated-artifact/secret checks
- `npm run graphify:auto` when safe source changes touch committed graph scopes, using the Graphify workflow rather
  than hand-editing outputs
- `npm run release:check`

**Acceptance criteria**

- Every command exits zero from a clean checkout.
- No unhandled rejection, console error, leaked secret sentinel, or unexpected worktree change remains.
- The release report records commit, environment versions, command, exit state, and artifact link/summary.
- Flaky reruns do not count as a pass until the source of nondeterminism is fixed.

**Dependencies:** all prior checkpoints. **Estimated scope:** medium.

### Task 9.2: Run adversarial local-boundary and lifecycle acceptance

Exercise the real application and MCP surfaces, not only mocks. Use a fresh external target and complete plan review,
validation preparation, baseline, implementation validation, and exact completion sign-off without bypassing Appraise
gates.

**Acceptance criteria**

- Non-loopback, invalid-host, cross-origin, unauthenticated MCP, oversized-body, replay, and cross-project requests are
  rejected with bounded errors.
- A generic non-todo brief completes planning without Appraise-side archetype selection.
- Environment credentials resolve at execution time and never appear in UI/network/log/report/generated evidence.
- Large plan/test-run datasets and large logs remain responsive and bounded.
- The full managed lifecycle produces valid, project-bound evidence and exact final sign-off.

**Dependencies:** Task 9.1. **Estimated scope:** medium.

### Task 9.3: Perform final deletion and scope review

Before release, search for superseded implementations, unused exports, compatibility branches, temporary flags,
complexity suppressions, and duplicated docs/skills introduced or left behind by the migration.

**Acceptance criteria**

- No old password field/projection, unauthenticated HTTP MCP path, project archetype module, or alternate
  terminalization path remains.
- No new `TODO` or temporary flag defers a release-blocking audit finding.
- Fallow reports no unused migration scaffolding or new circular dependency.
- Review confirms that configuration was not relaxed to obtain a green score.

**Dependencies:** Tasks 9.1 and 9.2. **Estimated scope:** small.

## Release Acceptance Gates

The release may proceed only when all of the following are true:

### Security

- [ ] A-01, A-02, and A-03 are closed with negative test evidence.
- [ ] App and HTTP MCP are loopback-only and fail closed.
- [ ] No plaintext environment credential exists in current DB rows, tracked files, generated output, logs, reports,
      network payloads, or package tarballs.
- [ ] Live production dependency audits have no unresolved high/critical vulnerability.

### Correctness And Resilience

- [ ] Root and package tests exit zero with no unhandled asynchronous errors.
- [ ] Test-run terminalization is single-owner and idempotent.
- [ ] Cross-project and lifecycle-gate negative tests pass.
- [ ] A fresh managed lifecycle reaches exact completion without raw artifact edits or gate bypasses.

### Maintainability

- [ ] No project-specific planning archetype or domain keyword routing exists in production code or canonical skills.
- [ ] No new complexity suppression, quality exclusion, raised threshold, or unexplained waiver was added.
- [ ] Audited MCP and application hotspots are decomposed by responsibility and their obsolete paths are deleted.
- [ ] Root/package Fallow and React Doctor meet the ratcheted targets recorded in the release ledger; improvements come
      from source changes, not configuration relaxation.

### Performance

- [ ] Externally reachable/user-visible lists have default and maximum bounds.
- [ ] Logs are tailed with bounded memory.
- [ ] Index changes include repeatable before/after query-plan evidence.

### Repository And Documentation

- [ ] CI covers `appraise-0.5`, root, both public packages, package contents, and live dependency checks.
- [ ] Runtime artifacts are untracked and CI-enforced; a fresh test run does not dirty tracked paths.
- [ ] Root publication is disabled and public package tarballs are minimal.
- [ ] Active docs, rules, skills, source, and generated references agree.
- [ ] `npm run release:check` passes from a clean checkout.

## Delivery Strategy

Do not implement this plan as one review-opaque commit or one giant refactor. Use a release train of narrowly scoped
pull requests targeting `appraise-0.5`:

1. **PR 1 — security boundary and secret references:** Phase 0 and Phase 1.
2. **PR 2 — logger reliability and release CI:** Phases 2 and 3.
3. **PR 3 — MCP registry decomposition:** Phase 4 only.
4. **PR 4 — application hotspot decomposition:** Phase 5, split further by hotspot if review size grows.
5. **PR 5 — bounded reads and repository hygiene:** Phases 6 and 7.
6. **PR 6 — docs/skills parity and final release evidence:** Phases 8 and 9.

Each PR must:

- begin from the current `appraise-0.5` state without discarding unrelated work;
- make one architectural claim that reviewers can verify;
- include focused regression tests and update current owning docs;
- run relevant package/scaffold/Graphify sync workflows from canonical source;
- delete superseded code in the same PR;
- leave the release ledger more green than before and introduce no new waiver.

Security PRs must merge before decomposition PRs. Independent UI, documentation, or test work may proceed in parallel
only after shared contracts are frozen and file ownership does not overlap.

## Risks And Mitigations

| Risk                                                    | Impact   | Mitigation                                                                                                                                                                         |
| ------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret migration loses access to existing environments  | High     | Back up before migration, inventory legacy rows, disable unresolved environments, and require explicit reference mapping before redaction. Never copy values into generated files. |
| Local-only enforcement breaks remote development habits | Medium   | Fail with an explicit 0.5 boundary message; require a separately reviewed remote architecture rather than an unsafe flag.                                                          |
| MCP decomposition changes schemas or response envelopes | High     | Freeze full contract snapshots first and require stdio/HTTP parity E2E after every domain batch.                                                                                   |
| New generic helpers become another abstraction layer    | High     | Extract only repeated current behavior, require net deletion/branch reduction, and reject pass-through wrappers.                                                                   |
| Large refactors hide lifecycle regressions              | High     | Keep one hotspot per commit/PR, preserve fault-injection and real lifecycle acceptance, and delete old paths immediately.                                                          |
| Pagination breaks existing clients                      | Medium   | Add explicit defaults/cursors at service boundaries, update bundled clients in the same slice, and contract-test stable ordering.                                                  |
| Artifact cleanup removes useful evidence                | Medium   | Untrack without deleting local files, retain only minimal sanitized fixtures, and document regeneration commands.                                                                  |
| Quality targets are gamed through configuration         | High     | Lock baselines, diff quality configuration in release review, and require source-level evidence for every score improvement.                                                       |
| History contains real credentials                       | Critical | Block release, rotate credentials first, and request separate approval before history rewriting or coordinated force pushes.                                                       |

## Explicit Non-Goals

- Building user accounts, roles, remote collaboration, or internet-facing deployment for Appraise 0.5.
- Building an autonomous semantic planner inside Appraise.
- Adding project-type archetypes, keyword classifiers, or application-specific task libraries.
- Creating a general secret-provider plugin framework before a second provider is approved.
- Replacing SQLite or Prisma without measured evidence that either is the bottleneck.
- Rewriting historical development plans to match current architecture.
- Rewriting Git history without explicit approval.
- Pursuing arbitrary line-count targets by scattering cohesive code across files.

## Definition Of Done

This plan is complete only when A-01 through A-13 are verified closed, all release acceptance gates pass from a clean
checkout, active documentation and skills match the implemented contracts, the real managed lifecycle succeeds, and
the audit can be rerun without relying on waivers, manual artifact edits, or project-specific exceptions.
