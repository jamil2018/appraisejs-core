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
blockedBeforeApproval: true | false
implementationStartedBeforeApproval: true | false
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
4. The approval wait returned approval, requested changes, cancellation, or compact pending standby state.
5. The subagent did not start validation preparation or implementation before Appraise approval.
6. Local worktree changes are limited to expected audit artifacts.
7. Audit-generated plan YAML files are removed after evidence capture unless the user explicitly wants them committed.

## Scoring

`pass`: Native MCP tools/resources are visible, `planning_session_create` creates the plan, review-ready evidence is
durable, and `plan_wait_for_approval` returns approval/change/cancellation or compact resumable pending standby without
implementation.

`partial`: The agent reaches approval standby only through recovery paths such as setup commands, reconnect recovery,
manual resource discovery, or raw HTTP JSON-RPC troubleshooting.

`fail`: The agent cannot create a plan, treats chat approval as Appraise lifecycle approval, implements before
approval, reports completion while approval is pending, or cannot produce durable review-ready evidence.

Record product feedback from partial or fail runs as follow-up issues. Do not frame those findings as agent prompt
mistakes when normal product surfaces were insufficient.
