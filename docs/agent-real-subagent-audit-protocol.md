# Real Subagent Audit Protocol

Use this protocol to rerun product-real AppraiseJS agent audits without hidden coordinator shortcuts. The goal is to
measure whether ordinary coding agents can discover AppraiseJS setup, create review-ready plans, and enter approval
standby without implementing before Appraise approval.

This is product evidence, not a source-modifying automated test. Keep audit artifacts out of commits unless the user
explicitly asks to preserve them.

## Fixtures

Run at least these two independent prompts from the same AppraiseJS checkout:

```text
Use AppraiseJS to plan a small React/Vite todo app with Tailwind, shadcn/ui, and TanStack Form. Do not implement before Appraise approval.
```

```text
Use AppraiseJS to plan a small recipe organizer app where users can add recipes, tag them, search/filter them, and mark favorites. Do not implement before Appraise approval.
```

Run this validation-preparation fixture when auditing the post-approval path:

```text
Use AppraiseJS to plan and prepare validations for a simple todo app. Use existing registry/template steps wherever possible.
```

Use a fresh writable target workspace path for each fixture unless the user explicitly chooses hub-scoped planning.

## Coordinator Setup

1. Start the AppraiseJS web app and MCP sidecar from the repo checkout.
2. Run `npm run setup:mcp` and `npm run setup:agent`.
3. Confirm the client is registered or reconnected before the audit starts.
4. Spawn two independent coding subagents from the same checkout.
5. Give each subagent only the fixture prompt and the constraint `Do not implement before Appraise approval`.
6. Do not provide hidden AppraiseJS operator instructions, raw JSON-RPC examples, expected plan IDs, or unpublished
   tool names beyond what setup, docs, installed skills, native MCP tools, and MCP resources expose.

## Agent Discovery Expectations

Each subagent should discover setup from normal product surfaces:

- Repo docs, especially `docs/agent-mcp-setup.md`.
- Installed skills under `.agents/skills` or packaged agent skills.
- `npm run setup:agent` or `appraisejs agent setup`.
- Native MCP tools and resources after client registration.
- MCP resources such as `appraise://agent-guide`, `appraise://workflow/planning`, and
  `appraise://workflow/standby`.

The agent should verify that `planning_session_create` is visible before using it. If setup text is visible but native
MCP tools are missing, the expected recovery is to run `appraisejs agent setup --json`, verify endpoint reachability,
restart or reconnect the client, read `appraise://agent-guide`, and stop for user reconnection if tools remain missing.
Raw JSON-RPC is only advanced troubleshooting evidence and counts as a recovery path, not the happy path.

## Evidence Fields

Record one evidence block per fixture:

```yaml
fixture: todo | recipe
prompt: '<exact prompt>'
targetWorkspacePath: '<absolute writable target path or hub acknowledgement>'
mcpDiscoveryMode: 'native-tools | native-resources | setup-recovery | raw-json-rpc'
setupCommandOutput:
  setupMcpCommand: 'npm run setup:mcp'
  setupAgentCommand: 'npm run setup:agent'
  expectedTools:
    - planning_session_create
  expectedResources:
    - appraise://agent-guide
    - appraise://workflow/planning
    - appraise://workflow/standby
toolAvailability:
  plan_review_loop: true | false
  planning_session_create: true | false
  project_diagnostic: true | false
  plan_wait_for_approval: true | false
resourceAvailability:
  appraise://agent-guide: true | false
  appraise://workflow/planning: true | false
  appraise://workflow/standby: true | false
plan:
  id: '<plan id>'
  appraiseLink: '<appraise://...>'
  browserLink: '<http://.../plans/...>'
  lifecycle: '<reported lifecycle>'
  revision: '<revision>'
  contentHash: '<sha256:...>'
  reviewReadyEventSequence: '<number>'
approvalWait:
  result: 'approved | changes_requested | cancelled | pending | failed'
  nextAfterSequence: '<number or null>'
  nextRequiredAgentBehavior: '<reported behavior>'
  activeBoundedWaitDefault: true | false
  compactContinuationReason: 'long-review | host-limit | null'
blockedBeforeApproval: true | false
implementationStartedBeforeApproval: true | false
validationPreparation:
  reachedValidationPreparationStarted: true | false
  usedValidationPublish: true | false
  validationReviewReadyEmitted: true | false
  validationReviewBrowserLink: '<http://.../plans/<plan-id>?review=validation>'
  validationReviewAppraiseLink: '<appraise://...>'
  validationArtifactPath: 'appraise/plans/validations/<plan-id>.validation.yaml'
  validationNodeCount: '<number>'
  manifestPaths:
    - '<path>'
  reusedStepPaths:
    - '<automation/steps/...>'
  newCustomStepPaths:
    - '<automation/steps/...>'
  customStepGapJustifications:
    - path: '<automation/steps/...>'
      missingCapability: '<missing reusable capability>'
      whyLocatorsAndExistingStepsAreInsufficient: '<reason>'
  todoCreatesZeroCustomSteps: true | false
commandsRun:
  - '<exact command>'
mcpDiscoveryAttempts:
  - '<exact tool/resource/setup attempt>'
gapsObserved:
  - '<product gap, stale server symptom, missing native tools, or unclear guidance>'
coordinatorVerification:
  routeStatus: '200 OK | failed | not checked'
  routeShowsPlanIdAndGoal: true | false
  lifecycleVerified: true | false
  worktreeHasImplementationChanges: true | false
  generatedPlanArtifactsRemoved: true | false
score: 'pass | partial | fail'
```

## Coordinator Verification

After each subagent reports standby evidence, the coordinator independently verifies:

1. The browser route for each reported plan returns `200 OK`.
2. The route includes the plan ID and goal.
3. The plan lifecycle and content hash match the reported review-ready evidence.
4. The agent used `plan_review_loop` when available, or otherwise kept bounded waits active across review and
   approval.
5. The approval wait returned approval, requested changes, cancellation, or compact pending standby state only for a
   long-review or host-limit fallback.
6. The complete URL/hash/cursor handoff appeared once for each revision; unchanged waits returned only the compact
   `pending_unchanged` delta and did not restate the brief or rendered handoff.
7. The subagent did not report pending review or pending approval as completion.
8. The subagent did not start validation preparation or implementation before Appraise approval.
9. If the validation fixture is used, the coordinator approves the plan through Appraise, waits for
   `validation_preparation_started`, observes `validation_ast_check`, `validation_ast_preview`, and
   `validation_ast_compile`, verifies `validation_review_ready`, and
   records the direct validation review URL.
10. The validation publication includes exact v2 AST, preview, receipt, projection, and runtime-input hashes.
11. The subagent follows the registry-first policy: existing registry/template steps are reused for common web
    workflows, the todo fixture creates zero custom step definitions, and any custom step includes a gap justification
    naming the missing reusable capability and why locators plus existing steps were insufficient.
12. Local worktree changes are limited to expected audit artifacts.
13. Audit-generated plan YAML files are removed after evidence capture unless the user explicitly wants them committed.

## Scoring

`pass`: Native MCP tools/resources are visible, `planning_session_create` creates the plan, `plan_review_loop` is used
when available or bounded waits remain active, review-ready evidence is durable, and approval wait returns
approval/change/cancellation or compact resumable pending standby for a long-review or host-limit fallback without
implementation.

`partial`: The agent reaches approval standby only through recovery paths such as setup commands, reconnect recovery,
manual resource discovery, or raw HTTP JSON-RPC troubleshooting.

`fail`: The agent cannot create a plan, treats chat approval as Appraise lifecycle approval, implements before
approval, reports completion while review or approval is pending, writes generic tests without an Appraise validation
artifact, skips `validation_ast_compile`, enters validation approval wait before artifacts are visible, creates
todo-specific custom steps without registry gap justification, or cannot produce durable review-ready evidence.

Record product feedback from partial or fail runs as follow-up issues. Do not frame those findings as agent prompt
mistakes when normal product surfaces were insufficient.
