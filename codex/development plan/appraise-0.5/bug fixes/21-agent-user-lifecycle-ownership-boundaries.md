# Agent/User Lifecycle Ownership Boundaries

## Summary

Remove lifecycle ambiguity where the Appraise UI and the connected coding agent can both mutate the same workflow
surface. Appraise should keep human review authority clear, while the connected agent owns mechanical execution after a
review gate opens that next phase.

The immediate bug is that the validation review UI still exposes `Start required baselines` after
`validations_approved`. A broader audit shows the same ambiguity for baseline reconciliation and implementation start.
Those controls should not be ordinary user-facing buttons when the MCP/coordinator contract already instructs agents to
perform them.

## Current Problem

- `src/app/(base)/plans/[planId]/validation-review-panel.tsx` renders user-facing buttons for:
  - `Start required baselines`
  - `Reconcile run evidence`
  - `Unlock implementation`
- `src/app/(base)/plans/[planId]/plan-review-workspace.tsx` renders the same post-validation execution controls in the
  baseline side panel.
- `packages/appraisejs/src/mcp.ts` tells the connected agent to call `baseline_start`, continue with
  `baseline_reconcile`, and call `implementation_start` after baseline acceptance.
- The same lifecycle mutation can therefore be performed by either the user in the browser or the agent through MCP,
  with no visible phase ownership boundary.
- Review-decision tools are also exposed through MCP, but those should be treated as explicit-user-decision relays, not
  autonomous agent decisions.

## Ownership Model

Use one normal writer for each lifecycle surface:

- User/Appraise UI owns review decisions:
  - plan approval and change requests
  - validation node decisions, changed-file approvals, validation review submission, and validation feedback
  - baseline acceptance, unrelated-failure acknowledgement, and regression-pass justification
  - final completion approval
  - explicit interrupt controls such as cancellation
- Agent/MCP owns execution mechanics:
  - validation preparation and publish
  - baseline start and reconciliation
  - implementation start
  - implementation checkpoints, implementation group/task progress, and implementation validation runs
- MCP tools that record user-owned decisions must be described as relays for an explicit Appraise/user decision.
  They must not be framed as autonomous agent authority.

## Key Changes

- Remove user-facing buttons for agent-owned execution:
  - `Start required baselines`
  - `Reconcile run evidence`
  - `Unlock implementation`
- Replace those buttons with read-only lifecycle guidance, for example:
  - `Validation review is approved. The connected agent starts required baselines through MCP.`
  - `Baseline runs are active. The connected agent reconciles run evidence through MCP.`
  - `Baseline evidence is accepted. The connected agent unlocks implementation through MCP.`
- Keep user-facing controls for human decisions and interrupts:
  - `Accept complete baseline`
  - `Acknowledge unchanged failure`
  - `Save justification`
  - `Cancel baseline runs`
- Treat `Cancel baseline runs` as a human interrupt, not a competing ordinary execution path.
- Remove `startBaselineExecutionAction`, `reconcileBaselineExecutionAction`, and `startImplementationAction` from client
  imports and props. Delete those server-action exports if no UI caller remains.
- Keep coordinator API and MCP tools for `baseline_start`, `baseline_reconcile`, and `implementation_start`; those are
  the canonical agent-owned execution path.
- Update MCP descriptions and next-action guidance:
  - mark `baseline_start`, `baseline_reconcile`, and `implementation_start` as agent-owned
  - mark validation review, baseline acceptance, acknowledgement, justification, and completion tools as
    explicit-user-decision relay tools where applicable
- Add a lifecycle ownership matrix to current docs:
  - `docs/agent-lifecycle-flow.md`
  - `docs/coordinator-api-mcp.md`
- Sync scaffold templates after root/source changes with:

```bash
npm --prefix packages/create-appraisejs run prepare-template
```

## Test Plan

- Update `src/app/(base)/plans/[planId]/plan-review-workspace.test.tsx` so:
  - `validations_approved` does not render `Start required baselines`
  - `baseline_running` does not render `Reconcile run evidence`
  - `baseline_accepted` does not render `Unlock implementation`
  - the removed controls do not call their old server actions
- Keep coverage proving user-owned controls still render in the correct states:
  - validation evidence decisions and validation review submission
  - validation feedback
  - baseline cancellation interrupt
  - baseline acceptance
  - failure acknowledgement and regression justification
- Update MCP tests to assert lifecycle guidance distinguishes agent-owned tools from explicit-user-decision relay tools.
- Run focused checks:

```bash
npx vitest run 'src/app/(base)/plans/[planId]/plan-review-workspace.test.tsx'
npx vitest run packages/appraisejs/src/mcp.test.ts src/app/api/internal/coordinator/coordinator-boundary.test.ts
npx eslint 'src/app/(base)/plans/[planId]/validation-review-panel.tsx' 'src/app/(base)/plans/[planId]/plan-review-workspace.tsx'
npx prettier --check 'src/app/(base)/plans/[planId]/validation-review-panel.tsx' 'src/app/(base)/plans/[planId]/plan-review-workspace.tsx' 'docs/agent-lifecycle-flow.md' 'docs/coordinator-api-mcp.md'
npm --prefix packages/create-appraisejs run prepare-template
```

If source changes touch committed graph scopes, run:

```bash
npm run graphify:auto
```

## Assumptions

- Baseline start, baseline reconcile, and implementation start are agent/MCP-owned.
- Humans retain review authority and emergency interrupt controls.
- This does not require a schema or migration change; it is a lifecycle-surface ownership and documentation fix.
- A future explicit takeover flow can let the UI take over an agent-owned phase, but this plan removes ambiguous shared
  ordinary controls first.
