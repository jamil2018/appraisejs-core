# Review Handoff, Validation Artifacts, And Registry-First Agent Flow

## Summary

Fix four agent-flow gaps in AppraiseJS:

- After `plan_review_ready`, agents must show the complete direct plan URL handoff before any standby or wait call.
- After `validation_preparation_started`, agents must create and surface AppraiseJS-native validation artifacts before validation review standby.
- During validation preparation, agents must prefer existing registry/template steps and only create custom step definitions after proving a real registry gap.
- Add a real subagent E2E audit to verify delegated agents follow the generated validation path and registry-first policy.

## Key Changes

### Review Handoff Before Standby

- Update Appraise planning and lifecycle guidance with the hard rule: `No wait call before complete URL handoff.`
- Require the review-ready handoff to include:
  - Direct browser URL
  - `appraise://` URL
  - Plan ID
  - Revision
  - Lifecycle
  - Content hash
  - Current after sequence
  - Next after sequence
  - Recommended wait call
- Keep `plan_review_loop` as the preferred standby tool, but only after the complete handoff has been shown to the user.

### MCP Handoff Shape

- Harden MCP responses in `packages/appraisejs/src/mcp.ts`.
- Add a directly printable `requiredUserFacingMessage` or `handoffMarkdown` to review-ready and approval-pending responses.
- Include absolute `browserUrl`, `appraiseUrl`, plan metadata, sequence state, and recommended wait call.
- Use the generated handoff from `planning_session_create`, `plan_wait_for_review`, `plan_review_loop` pending responses, and `plan_wait_for_approval` pending responses.

### Validation Artifact Preparation

- Clarify validation flow:
  - `plan_start`
  - `validation_preparation_started`
  - Generate AppraiseJS validation artifacts
  - `validation_publish`
  - `validation_review_ready`
  - User validation approval
- Require AppraiseJS-native validation artifacts before validation review standby:
  - `ValidationArtifact`
  - Validation nodes
  - `automation/features`
  - Step paths
  - Executable metadata
  - Browser/environment matrix
  - Expected failures
  - Changed-file evidence
  - Manifest paths
  - `appraise/plans/validations/<plan-id>.validation.yaml`
- Require `validation_publish` before claiming the user can review validations.
- Have `validation_publish` return a validation review handoff with:
  - Direct browser URL such as `http://127.0.0.1:3000/plans/<plan-id>?review=validation`
  - `appraise://` URL
  - Lifecycle
  - Revision
  - Validation artifact path
  - Validation count
  - Changed-file count
  - Manifest paths
  - Next review action

### Registry-First Step Policy

- Agents must inspect or use the existing template-step registry before creating custom step definitions.
- Existing registry/template steps should be the default for common web workflows, including:
  - Navigation
  - Click
  - Hover
  - Input fill, clear, check, uncheck, and select
  - Wait
  - Visibility assertion
  - Text assertion
  - URL assertion
  - Store
  - Random data
- Simple CRUD apps, including todo apps, should default to zero new custom step definitions.
- Any custom step must include a gap justification naming the missing reusable capability and explaining why locators plus existing steps are insufficient.
- Validation artifacts should make reused step paths and newly created step paths reviewable so step bloat is visible during validation review.

## Test Plan

### MCP And Skill Tests

- Add MCP unit coverage that review-ready responses include the complete printable URL handoff.
- Assert handoff guidance contains `complete direct browser URL` and `No wait call before complete URL handoff`.
- Assert validation-preparation guidance names `validation_publish`, `ValidationArtifact`, `automation/features`, `automation/steps`, and `appraise/plans/validations/<plan-id>.validation.yaml`.
- Add skill-policy tests that planning guidance orders handoff before standby.
- Add skill-policy tests that validation-preparation guidance requires registry/template step reuse before custom steps.

### Validation Publish Tests

- Assert `validation_publish` persists `appraise/plans/validations/<plan-id>.validation.yaml`.
- Assert the publish response includes validation review URL, artifact path, validation count, changed-file count, and manifest paths.
- Assert `validation_review_ready` is emitted only after the validation artifact is persisted.
- Assert the plan lifecycle becomes `awaiting_validation_review`.

### Registry-First Policy Tests

- Add a todo validation fixture expecting zero new custom step definitions.
- Assert custom step creation requires a non-empty reuse/gap justification.
- Assert validation artifacts expose reused registry/template step paths separately from newly created step paths.

### Subagent-Utilized E2E

- Extend the real subagent audit protocol with a fixture:

  ```text
  Use AppraiseJS to plan and prepare validations for a simple todo app. Use existing registry/template steps wherever possible.
  ```

- The coordinator should approve the plan through Appraise, let the subagent enter `validation_preparation_started`, and observe whether it publishes AppraiseJS validation artifacts.
- Pass criteria:
  - The subagent uses `validation_publish`.
  - Appraise emits `validation_review_ready`.
  - The subagent reports the direct validation review URL.
  - The validation artifact includes validation nodes and manifest paths.
  - The todo flow creates no custom step definitions.
- Fail criteria:
  - The subagent writes generic tests without an Appraise validation artifact.
  - The subagent skips `validation_publish`.
  - The subagent enters validation approval wait before artifacts are visible.
  - The subagent creates custom todo-specific steps without registry gap justification.

## Validation Commands

- `npx vitest run packages/appraisejs/src/mcp.test.ts packages/appraisejs/src/skill-policy.test.ts src/services/coordinator/coordinator-validation-service.test.ts`
- Add and run the relevant registry-policy and subagent-audit harness checks.
- `npm run check:harness`
- `npx prettier --check --ignore-unknown docs/agent-*.md .agents/skills/appraise-*/SKILL.md packages/appraisejs/src/mcp.ts packages/appraisejs/src/mcp.test.ts packages/appraisejs/src/skill-policy.test.ts src/services/coordinator/coordinator-validation-service.test.ts`

## Assumptions

- Generic Playwright or Cucumber files are insufficient unless linked into an Appraise `ValidationArtifact`.
- Existing registry/template steps should be the default for common web workflows.
- Custom step definitions are allowed only for true capability gaps.
- Validation review standby begins only after `validation_publish` returns and `validation_review_ready` exists.
- Agents should not hand-edit Appraise lifecycle YAML or SQLite directly; they should use lifecycle tools such as `plan_start` and `validation_publish`.
