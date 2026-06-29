import { describe, expect, it } from 'vitest'

import { agentGuide, createPlanFromBrief, nextApprovalWaitSequence, planningWorkflow } from './mcp.js'

describe('MCP approval wait helpers', () => {
  it('advances the long-poll cursor past non-gate events that were already delivered', () => {
    expect(
      nextApprovalWaitSequence(0, [
        { sequence: 1, type: 'plan_graph_processing_started' },
        { sequence: 2, type: 'plan_review_ready' },
      ]),
    ).toBe(2)
  })

  it('preserves the caller cursor when no newer events were delivered', () => {
    expect(nextApprovalWaitSequence(5, [{ sequence: 3, type: 'plan_review_ready' }])).toBe(5)
  })
})

describe('MCP agent workflow guidance', () => {
  it('describes setup, planning, and standby without collapsing Appraise gates', () => {
    expect(agentGuide.setup.preferredCommand).toBe('appraisejs agent setup')
    expect(planningWorkflow.phases).toEqual(
      expect.arrayContaining(['project_diagnostic', 'plan_wait_for_approval standby']),
    )
    expect(planningWorkflow.standby).toContain('Do not treat chat approval as Appraise approval')
  })

  it('creates a minimal review plan from a normal project brief', () => {
    const plan = createPlanFromBrief({
      projectBrief: 'Build a tiny todo app with persisted filters.',
      displayName: 'Todo app',
      sourceFiles: ['src/App.tsx'],
    })

    expect(plan).toMatchObject({
      version: '1',
      lifecycle: 'draft',
      goal: 'Todo app',
      tasks: [
        expect.objectContaining({
          id: 'plan-from-brief',
          validationIntent: expect.stringContaining('review readiness'),
        }),
      ],
    })
    expect(plan.description).toContain('src/App.tsx')
  })
})
