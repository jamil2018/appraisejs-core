# MCP-Native Validation Artifact Authoring

## Summary

Fix the counterintuitive validation-preparation model where the coding agent has to manufacture AppraiseJS validation
artifacts itself, then call `validation_publish` and hope Appraise accepts the artifact as reliable.

The agent should be an orchestrator. AppraiseJS should expose the currently available Appraise resources, own artifact
creation and mutation through MCP/API tools, materialize files and runtime records, and publish the review artifact from
its own draft state.

This is upstream of `17-validation-artifact-runtime-projection.md`: projection fixes the missing runtime DB boundary
after approval, while this plan fixes who creates and owns the artifacts before approval.

## Current Problem

The current MCP surface exposes a validation-preparation resource and a publish tool:

- `appraise://workflow/validation-preparation` describes the full `appraise.validation/v1` contract.
- `validation_publish` accepts a full `ValidationArtifact` object.
- The workflow guidance says to generate AppraiseJS-native authored artifacts first.

That is better than generic test-only output, but it still makes the agent the artifact author. AppraiseJS validates
shape after the fact rather than giving the agent first-class tools to create modules, suites, cases, steps, locators,
changed files, and validation nodes inside Appraise-owned state.

The result is fragile:

- Agents must infer available Appraise resources from docs or source instead of querying live capability/resource state.
- Agents invent IDs, suite membership, locator groups, steps, file manifests, hashes, and validation matrices.
- Appraise cannot guide or constrain each authoring decision at the moment it is made.
- A single large publish payload creates late failures instead of incremental, actionable blockers.
- Review artifacts can be accepted even though corresponding runtime/project resources do not exist yet.

## Desired Model

AppraiseJS owns validation artifact authoring. Agents orchestrate.

The agent should:

- Read live Appraise resources and capabilities through MCP.
- Ask Appraise to create or update validation resources through MCP tools.
- Receive stable IDs, hashes, blockers, and recommendations from Appraise.
- Use Appraise-owned lifecycle gates for review, approval, baseline, implementation, and completion.

The agent should not:

- Hand-author canonical validation YAML.
- Write Appraise runtime records directly.
- Guess stable IDs, identifier tags, suite membership, file hashes, or locator ownership.
- Treat a local file or handcrafted YAML object as authoritative merely because it matches a schema.

## Evidence In Current Source

- `packages/appraisejs/src/mcp.ts` lists `validation_publish` as a workflow-critical tool but does not expose tools to
  create validation modules, suites, cases, steps, locators, changed files, or matrices incrementally.
- `packages/appraisejs/src/mcp.ts` registers `appraise://workflow/validation-preparation` as documentation for the
  artifact contract, not as a live resource-authoring surface.
- `packages/appraisejs/src/mcp.ts` describes `validation_publish` as publishing generated validation nodes and
  changed-file evidence, with the caller providing the full `ValidationArtifact`.
- `src/lib/plan-contract/schemas.ts` defines the validation artifact schema, but schema validation is not a substitute
  for Appraise-owned creation.
- Existing services already know how to list or manipulate core resources:
  `src/services/module/module-service.ts`,
  `src/services/test-suite/test-suite-service.ts`,
  `src/services/test-case/test-case-service.ts`,
  `src/services/locator-group/locator-group-service.ts`,
  `src/services/locator/locator-service.ts`,
  `src/services/environment/environment-service.ts`, and
  `src/services/template-step/template-step-service.ts`.

## Rectification Plan

### 1. Introduce A Validation Draft Resource

Add an Appraise-owned validation draft state for each plan revision.

Suggested model:

- `ValidationDraft`
  - `id`
  - `planId`
  - `revision`
  - `status`: `draft`, `ready_for_review`, `published`, `changes_requested`, `discarded`
  - `targetProjectId`
  - `sourceHash`
  - `createdAt`, `updatedAt`
- `ValidationDraftNode`
  - task coverage, required flag, matrix, expected failures, executable intent
- Draft-owned or linked records for modules, suites, cases, steps, locator groups, locators, files, and manifests.

This draft can be stored as relational records, JSON with strict service validation, or a hybrid. The important boundary
is that Appraise owns it and can render the final YAML from it.

### 2. Expose Live Resource Discovery Through MCP

Add read-only MCP resources/tools that give agents the current Appraise context without source inspection.

Suggested resources:

- `appraise://plans/{planId}/validation-context`
- `appraise://plans/{planId}/validation-draft`
- `appraise://resources/modules`
- `appraise://resources/test-suites`
- `appraise://resources/test-cases`
- `appraise://resources/template-steps`
- `appraise://resources/locator-groups`
- `appraise://resources/locators`
- `appraise://resources/environments`

Suggested tools:

- `validation_context_read`
- `validation_draft_read`
- `appraise_resources_list`
- `template_step_search`
- `locator_search`

Responses should include stable IDs, display names, ownership/source metadata, compatibility warnings, and recommended
next actions.

### 3. Add MCP Tools For Draft Mutation

Replace large handcrafted publish payloads with Appraise-owned mutation tools.

Suggested tools:

- `validation_draft_create`
- `validation_draft_reset`
- `validation_node_upsert`
- `validation_module_upsert`
- `validation_locator_group_upsert`
- `validation_locator_upsert`
- `validation_test_suite_upsert`
- `validation_test_case_upsert`
- `validation_test_step_upsert`
- `validation_file_upsert`
- `validation_matrix_upsert`
- `validation_expected_failure_upsert`
- `validation_draft_check`
- `validation_draft_publish`

Each mutation should return:

- The canonical created/updated resource ID.
- Any derived identifiers or tags.
- Current draft readiness.
- Structured blockers.
- The next recommended tool call.

The tools can be coarse-grained at first. For example, `validation_test_case_upsert` can accept a complete test case with
steps, while `validation_draft_publish` renders the final YAML, writes or validates declared files, and moves the plan to
validation review.

### 4. Define MCP Resource Proposal Contracts

Creating new Appraise resources through MCP still needs an input format, but that format should be a stable
agent-facing proposal contract, not raw Prisma data, not UI form state, and not hand-authored validation YAML.

Add versioned proposal schemas such as:

- `appraise.resource/module-proposal/v1`
- `appraise.resource/environment-proposal/v1`
- `appraise.resource/template-step-proposal/v1`
- `appraise.resource/locator-group-proposal/v1`
- `appraise.resource/locator-proposal/v1`
- `appraise.validation/test-suite-proposal/v1`
- `appraise.validation/test-case-proposal/v1`
- `appraise.validation/test-step-proposal/v1`

These schemas should be exposed through MCP resources and tool input schemas. They should accept intent-shaped data and
let Appraise normalize it into canonical records.

Examples:

- A test suite proposal may include `name`, `purpose`, `moduleRef`, `coveredTaskIds`, and optional `caseRefs`.
  Appraise returns the canonical suite ID, identifier tag, module link, and membership status.
- A test case proposal may include `title`, `behavior`, `coveredTaskIds`, `suiteRef`, and `steps`. Appraise returns the
  canonical test case ID, suite membership, identifier tag, resolved steps, and blockers.
- A test step proposal may include `intent`, `gherkinText`, `templateStepRef`, `parameters`, and optional `locatorRef`.
  Appraise resolves or rejects template-step and locator references.
- A template-step proposal may include `name`, `kind`, `signatureIntent`, `parameters`, `implementationIntent`, and
  `groupRef`. Appraise owns the final signature, enum values, group, generated function definition, and sync behavior.
- An environment proposal may include `name`, `baseUrl`, optional `apiBaseUrl`, and credential placeholders. Appraise
  validates uniqueness, URL shape, and whether secrets are allowed.
- A locator proposal may include `name`, `selector`, `route`, `moduleRef`, and optional `locatorGroupRef`. Appraise
  resolves the group, checks collisions, and syncs locator files.

Tool responses should always include:

- `accepted`: whether Appraise accepted the proposal.
- `resource`: the canonical resource Appraise created or updated.
- `normalizedInput`: the Appraise-normalized command payload.
- `blockers`: structured blockers with field paths and recovery guidance.
- `warnings`: non-blocking issues, such as low-confidence template-step matching.
- `nextRecommendedAction`: the next MCP tool or review action.

This gives agents a concrete format to pass while preserving the product boundary: the format is an Appraise command
contract, and Appraise remains responsible for canonical IDs, enum choices, resource links, generated files, and sync.

### 5. Let Appraise Generate IDs, Hashes, Membership, And Artifacts

Move these responsibilities from agents into Appraise services:

- Stable IDs and deterministic identifier tags.
- Suite-to-test-case membership.
- Template-step resolution and registry-first guidance.
- Locator group and locator ownership.
- File materialization and content hashing.
- Manifest path derivation.
- Validation matrix validation against known environments.
- Validation YAML serialization.
- Runtime projection or readiness checks required before baseline.

Agents may propose intent, labels, paths, and scenario content, but Appraise should canonicalize the final artifact.

### 6. Keep `validation_publish` Temporarily As A Compatibility Path

Do not break existing agents immediately.

Transition plan:

- Keep `validation_publish`, but mark it as legacy or advanced.
- Add MCP guidance that new agents should use validation draft tools.
- Internally route `validation_publish` through the same validation draft import/check/publish pipeline.
- Return warnings when `validation_publish` receives IDs, files, environments, or test cases that cannot be resolved
  into Appraise-owned resources.
- Remove or restrict direct full-artifact publishing only after draft tools are stable.

### 7. Update Lifecycle Guidance

Revise `appraise://workflow/validation-preparation` and docs so the happy path is:

1. `plan_start`
2. `validation_context_read`
3. `validation_draft_create`
4. resource search/list calls as needed
5. draft mutation calls
6. `validation_draft_check`
7. `validation_draft_publish`
8. validation review standby

The guidance should state explicitly: agents orchestrate Appraise-owned artifact creation; agents do not author
canonical validation YAML directly.

### 8. UI Alignment

Expose the same draft state in the validation review/preparation UI:

- Show draft nodes, files, suites, cases, locators, and blockers before publication.
- Let a human inspect what the agent is assembling before `validation_review_ready`.
- Show whether a resource was reused, created, projected, or blocked.
- Make missing environments/files/template steps actionable before approval.

## API And MCP Contract Sketch

Example orchestrated flow:

```json
{ "tool": "validation_context_read", "input": { "planId": "pln_..." } }
```

```json
{ "tool": "validation_draft_create", "input": { "planId": "pln_...", "revision": 2 } }
```

```json
{
  "tool": "validation_test_case_upsert",
  "input": {
    "planId": "pln_...",
    "draftId": "vldraft_...",
    "suiteRef": "current-location-weather",
    "title": "Show current weather for the user's browser location",
    "steps": [
      { "intent": "navigate", "templateStepRef": "Navigate to URL", "parameters": { "url": "/" } },
      { "intent": "grant geolocation", "parameters": { "latitude": "23.8103", "longitude": "90.4125" } }
    ]
  }
}
```

```json
{ "tool": "validation_draft_check", "input": { "planId": "pln_...", "draftId": "vldraft_..." } }
```

```json
{ "tool": "validation_draft_publish", "input": { "planId": "pln_...", "draftId": "vldraft_..." } }
```

## Implementation Notes

- Do not expose raw Prisma CRUD through MCP. Expose Appraise service commands with domain validation.
- Keep lifecycle transitions Appraise-owned.
- Treat target workspaces as first-class context; all file checks should resolve against the bound target project.
- Prefer registry/template-step reuse by making reusable resources searchable at authoring time.
- Return structured blockers early rather than accepting partial draft state silently.
- Make draft mutation idempotent enough for agent retries.
- Preserve review YAML as the human-readable artifact, but generate it from Appraise draft state.
- Keep proposal schemas intentionally smaller than UI forms. UI forms can require visual/editor-specific state, while
  MCP proposals should express user/test intent and let Appraise fill canonical implementation details.
- Version proposal schemas independently from Prisma migrations so MCP clients can reason about compatibility.

## Test Plan

- MCP resource tests proving validation context exposes modules, suites, cases, template steps, locators, environments,
  target project metadata, and plan task coverage.
- Draft service tests for creating, updating, checking, publishing, and resetting validation drafts.
- Proposal-schema tests proving agent-facing resource formats normalize into canonical module, environment,
  template-step, locator, suite, case, and step records.
- Negative proposal tests proving missing `moduleRef`, ambiguous `templateStepRef`, duplicate locator names, invalid
  environment URLs, and unresolved suite membership return structured blockers.
- Tests proving Appraise generates stable IDs/tags instead of requiring the agent to guess them.
- Tests proving template-step search and locator search guide agents toward reuse before custom steps.
- Tests proving `validation_draft_publish` writes or validates files and computes hashes from disk.
- Tests proving published YAML is generated from draft state and matches the existing `ValidationArtifact` contract.
- Compatibility tests proving legacy `validation_publish` routes through the same checks and emits warnings/blockers.
- End-to-end MCP test where an agent creates a validation draft only through MCP tools, publishes it, receives
  `validation_review_ready`, and then proceeds through validation approval and baseline preflight.
- UI tests showing draft resources and blockers before validation review publication.

## Acceptance Criteria

- A capable agent can prepare validation review without hand-authoring a full `ValidationArtifact`.
- Appraise exposes enough live resources for the agent to make orchestration decisions without reading Appraise source.
- New resource creation uses versioned MCP proposal contracts rather than raw Prisma models, UI form shapes, or
  hand-authored artifact YAML.
- Appraise owns validation IDs, tags, hashes, suite membership, file materialization, and publication.
- `validation_publish` is no longer the primary happy path for new agents.
- Validation review artifacts are generated from Appraise-owned draft state.
- Missing resources fail as structured draft blockers before validation review or baseline.
