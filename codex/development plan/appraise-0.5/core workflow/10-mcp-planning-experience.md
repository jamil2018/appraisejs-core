# Session 10: MCP Planning Experience

## Goal

Make MCP connection verification and plan publication reliable, self-describing, and consistent across MCP, API,
CLI, and agent skills.

## Current Deficiencies

- The planning skill requires an MCP project diagnostic, but diagnostics are exposed only through the CLI.
- `plan_create` and `plan_revise` advertise generic record inputs, so invalid plans fail without useful field-level
  guidance.
- Plan creation returns a relative browser route while skills require a canonical `appraise://` review link.
- The create, wait, read, and acknowledge sequence is distributed across tools without one consistent evidence
  contract.

## Work

1. Add a `project_diagnostic` MCP tool backed by the existing diagnostic service.
2. Report project identity, application and API reachability, authentication, Git state, contract version, warnings,
   and actionable recovery instructions.
3. Replace generic plan records in MCP with the shared plan artifact schema used by the API and CLI.
4. Preserve structured validation errors through the API client and MCP response, including stable code, field path,
   message, and recovery guidance.
5. Return canonical links from plan creation, reads, revisions, and review readiness:
   `appraise://plans/{planId}`, an absolute browser URL, and the relative route.
6. Include revision, lifecycle, content hash, links, and event sequence in the review-ready evidence contract.
7. Update planning and recovery skills to diagnose, create, wait, read events, capture evidence, acknowledge handled
   events, present the returned link and hash, and stop at the review gate.
8. Add parity and runtime tests covering diagnostics, invalid plans, publication evidence, and recovery.

## Required Rules

- MCP diagnostics never silently fall back to CLI.
- Dirty Git state and reduced reproducibility are warnings; unreachable application, failed authentication, and
  project mismatch are blocking errors.
- CLI, API, and MCP accept and reject the same plan fixtures through one contract.
- Validation failures identify the exact invalid field and do not collapse into `Invalid input`.
- The configured AppraiseJS base URL is the source for absolute browser links.
- Existing `reviewUrl` consumers remain compatible while structured canonical links are introduced.
- MCP stdout contains protocol traffic only; diagnostics remain inside tool responses or stderr.
- A plan URL is presented only after the durable `plan_review_ready` event is received.

## Public Contracts

- Add MCP tool `project_diagnostic`.
- Add a shared diagnostic result containing `ok`, project identity, contract version, checks, warnings, recovery
  actions, and links.
- Add a structured coordinator error envelope with `code`, `message`, optional `path`, and optional `recovery`.
- Add structured plan links with `appraise`, `browser`, and `route`.
- Extend plan creation and review-ready results with `planId`, `revision`, `lifecycle`, `contentHash`, links, and the
  relevant event sequence.

## Acceptance Criteria

- The planning skill can verify a live, authenticated, correctly matched project entirely through MCP.
- Missing identity, unreachable application, authentication failure, project mismatch, dirty worktree, and healthy
  project cases return deterministic diagnostic results.
- Invalid plans report paths such as `tasks.0.validationIntent` with actionable messages.
- CLI, API, and MCP plan contract fixtures have parity for successful and rejected inputs.
- Plan creation and review readiness return the same canonical Appraise and browser links.
- The official SDK stdio test performs diagnostics, creates a plan, waits for review readiness, verifies links and
  hash, acknowledges events, and confirms clean protocol output.
- Agent skill policy tests enforce diagnostic-first operation, event handling, evidence presentation, and no
  implementation before approval.

## Validation

- Focused diagnostic, coordinator-client, API-route, plan-contract, and skill-policy Vitest tests.
- Contract fixture parity tests across CLI, API, and MCP.
- `npm --prefix packages/appraisejs run test:mcp:e2e` against a live local AppraiseJS server.
- Focused ESLint and Prettier checks for changed files.
- Package build and root build.
- Fallow and React Doctor commit checks.
- Sequential root and `create-appraisejs` template synchronization when canonical scaffold files change.

## Handoff

Provide the diagnostic and error schemas, link-generation rules, compatibility behavior, updated skill transcript,
and a complete MCP E2E transcript showing connection verification through review-ready publication. Do not broaden
this session into plan semantics, review UI changes, validation generation, or implementation workflow changes.
