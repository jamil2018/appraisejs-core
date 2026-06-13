import { describe, expect, it } from 'vitest'

import { planArtifactSchema } from './plan-file.js'

const validPlan = {
  version: '1',
  planId: 'contract-parity',
  revision: 1,
  lifecycle: 'awaiting_plan_review',
  goal: 'Keep CLI, API, and MCP plan inputs aligned',
  description: 'Verify every plan entry point accepts and rejects the same artifact shape.',
  tasks: [
    {
      id: 'publish-plan',
      title: 'Publish plan',
      description: 'Publish one valid plan.',
      acceptanceCriteria: ['The plan is accepted.'],
      validationIntent: 'Run contract parity tests.',
    },
  ],
  edges: [],
  implementationGroups: [{ id: 'publication', taskIds: ['publish-plan'] }],
}

describe('plan input contract parity', () => {
  it('accepts the shared successful fixture', () => {
    expect(planArtifactSchema.safeParse(validPlan).success).toBe(true)
  })

  it.each([
    [{ ...validPlan, description: '' }, 'description'],
    [{ ...validPlan, goal: 'a'.repeat(81) }, 'goal'],
    [{ ...validPlan, tasks: [{ ...validPlan.tasks[0], validationIntent: '' }] }, 'tasks.0.validationIntent'],
    [
      { ...validPlan, implementationGroups: [{ id: 'publication', taskIds: ['missing-task'] }] },
      'implementationGroups.0.taskIds',
    ],
  ])('rejects an invalid fixture with a stable field path', (fixture, expectedPath) => {
    const result = planArtifactSchema.safeParse(fixture)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues[0]?.path.join('.')).toBe(expectedPath)
  })
})
