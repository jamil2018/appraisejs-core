# Real Subagent Audit Mitigation Plan

## Summary

Real coding-subagent audits proved that AppraiseJS guidance is discoverable and that agents can create review-ready
plans and stop at approval standby. The audits also exposed gaps that can still block a normal agent from succeeding
without coordinator help: stale MCP servers, missing native MCP registration, inconsistent approval wait ergonomics,
and unclear target workspace selection for new app briefs.

This plan mitigates those issues without weakening Appraise-owned lifecycle gates.

## Audit Evidence

- Two subagents started from normal product briefs without hidden AppraiseJS operator instructions.
- Both discovered setup guidance through repo docs, skills, and `npm run setup:agent`.
- Both created real Appraise plans through the running HTTP MCP endpoint.
- Both reached review-ready or approval standby and did not implement before approval.
- Native Appraise MCP tools were not visible in the Codex tool list, so both agents used raw HTTP JSON-RPC.
- The running MCP endpoint appeared stale relative to the branch source: it did not expose `planning_session_create` or
  the new workflow resources.

## Goals

- Let agents detect and recover from a stale running Appraise MCP server.
- Give agents a first-class path when native MCP tools are not registered in the host session.
- Make approval standby reliably resumable without requiring client-side aborts.
- Make new-app target workspace selection explicit before plan creation.
- Preserve primitive MCP tools and Appraise-owned approval gates.

## Non-Goals

- Do not auto-approve plans or start implementation from chat approval.
- Do not require raw HTTP MCP as the primary happy path.
- Do not design a full multi-project hub UI in this mitigation pass.
- Do not delete or hide primitive `plan_create`, `plan_wait_for_review`, or `plan_wait_for_approval`.

## Work

### 1. Stale MCP Server Detection

- Add a capability/version payload to `project_diagnostic` and `appraise://project`.
- Include:
  - package version;
  - MCP surface version;
  - exposed tool names for workflow-critical tools;
  - exposed workflow resource URIs;
  - server start time or build identifier when available.
- Update `setup:agent` to print the expected capability names:
  - `planning_session_create`;
  - `appraise://agent-guide`;
  - `appraise://workflow/planning`;
  - `appraise://workflow/standby`.
- If capability checks fail, return explicit recovery:
  - restart or reconnect the MCP client;
  - restart the Appraise MCP sidecar;
  - rerun `npm run setup:mcp` and `npm run setup:agent`.

### 2. Native MCP Registration Recovery

- Extend setup output with a "tools not visible" recovery section.
- Document the normal failure mode:
  - setup text can be visible while native MCP tools are not yet loaded;
  - the client must register the Streamable HTTP endpoint or stdio command and restart/reconnect.
- Add a copyable fallback diagnostic path:
  - run `appraisejs agent setup --json`;
  - inspect HTTP endpoint reachability;
  - read `appraise://agent-guide` after reconnect;
  - stop and ask the user to reconnect if native tools remain unavailable.
- Keep raw JSON-RPC as an advanced troubleshooting note, not as the ordinary agent path.

### 3. Resumable Approval Standby

- Add an optional `timeoutMs` or `mode: "poll" | "long_poll"` input to `plan_wait_for_approval`.
- Make the default safe for ordinary agents:
  - return compact `pending` state after a bounded wait;
  - include `nextAfterSequence`;
  - include `nextRequiredAgentBehavior: "standby_for_appraise_review"`;
  - include review links and content hash.
- Preserve long-poll behavior for clients that explicitly request it.
- Update skills and workflow resources to prefer bounded waits when the host cannot safely hold a thread open.

### 4. Explicit Target Workspace Selection

- Update `planning_session_create` input validation and guidance so new-app briefs require either:
  - `targetWorkspacePath`; or
  - an explicit `targetMode: "hub"` acknowledgement.
- If neither is provided, return a structured recovery response instead of silently creating a hub-scoped plan.
- Include existing target project candidates in the recovery response.
- Update `project_diagnostic` next-action guidance to distinguish:
  - hub checkout planning;
  - external target app planning;
  - stale or mismatched MCP binding.
- Update skills to tell agents to create or ask for a target workspace before planning a brand-new app.

### 5. Real-World Audit Harness

- Add a repeatable audit script or checklist under docs that captures:
  - prompt brief;
  - target workspace path;
  - MCP discovery mode;
  - setup output;
  - plan id and links;
  - review-ready event sequence;
  - approval wait result;
  - whether implementation was blocked before approval;
  - gaps observed.
- Add at least two audit fixtures:
  - React/Vite todo app;
  - recipe organizer app.
- Keep the audit as product evidence, not a source-modifying test.
- Mirror the manual subagent audit protocol used to discover these gaps:
  - spawn two independent coding subagents from the same repo checkout;
  - give each subagent only a normal product brief and the constraint "Do not implement before Appraise approval";
  - do not provide hidden AppraiseJS operator instructions, raw MCP call examples, or expected tool names beyond what
    the product itself exposes;
  - ask each subagent to discover setup from repo docs, installed skills, setup commands, native MCP tools, and MCP
    resources;
  - require each subagent to report exact commands, MCP discovery attempts, tool/resource availability, plan ids,
    links, lifecycle state, content hash, approval wait result, and whether implementation was blocked;
  - have the coordinator independently verify the reported browser routes, plan artifacts, lifecycle state, and local
    worktree effects;
  - remove audit-generated plan YAML files after recording evidence unless the user explicitly wants them committed.
- Use these two baseline prompts:
  - `Use AppraiseJS to plan a small React/Vite todo app with Tailwind, shadcn/ui, and TanStack Form. Do not implement before Appraise approval.`
  - `Use AppraiseJS to plan a small recipe organizer app where users can add recipes, tag them, search/filter them, and mark favorites. Do not implement before Appraise approval.`
- Score each audit run with explicit outcomes:
  - `pass`: native MCP tools/resources are visible, the plan is created, review-ready evidence is durable, and standby
    returns compact resumable state without implementation;
  - `partial`: the agent reaches standby only through recovery paths such as raw HTTP MCP or manual setup commands;
  - `fail`: the agent cannot create a plan, treats chat approval as lifecycle approval, implements before approval, or
    reports completion while approval is still pending.
- Record product feedback from partial/fail runs as follow-up issues, not as agent prompt mistakes.

## Acceptance Criteria

- A stale MCP server is detectable from `project_diagnostic` without comparing source manually.
- Setup output tells an agent exactly what to do when native MCP tools are missing.
- `plan_wait_for_approval` can reliably return a compact pending standby state.
- `planning_session_create` does not accidentally create hub-scoped plans for new-app briefs without explicit target
  selection.
- Skills and MCP resources describe the same recovery paths.
- A fresh real-subagent audit can create a plan, show review links, and enter standby without using raw HTTP JSON-RPC.
- The real-subagent audit protocol is documented well enough that another coordinator can rerun the todo and recipe
  prompts and compare pass/partial/fail outcomes.

## Validation

- Unit tests cover:
  - capability/version metadata;
  - stale capability recovery text;
  - bounded approval wait pending response;
  - target-workspace-required behavior in `planning_session_create`;
  - setup output for missing native MCP tools.
- MCP E2E covers:
  - `planning_session_create` visible in `tools/list`;
  - workflow resources visible in `resources/list`;
  - `plan_wait_for_approval` bounded pending response;
  - explicit target workspace registration for a temporary empty workspace.
- Harness checks cover active skill/doc references to the recovery paths.
- Run the real-subagent audit protocol after restarting/reconnecting MCP:
  - run one subagent with the todo prompt;
  - run one subagent with the recipe prompt;
  - verify whether native MCP tools expose `planning_session_create`;
  - verify whether resources expose `appraise://agent-guide`, `appraise://workflow/planning`, and
    `appraise://workflow/standby`;
  - verify each generated plan route returns `200 OK` and includes the plan id and goal;
  - verify each approval wait returns either approval/change/cancellation or compact pending standby state;
  - verify neither subagent starts validation preparation or implementation before Appraise approval;
  - clean up audit-generated plan artifacts unless they are intentionally retained as evidence.
