import { describe, expect, it } from 'vitest'

import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

import { validationCoverageRows } from './validation-coverage-explorer'

describe('validationCoverageRows', () => {
  it('maps task intent through validation scenarios and step evidence', () => {
    const detail = {
      plan: { tasks: [{ id: 'task-one', title: 'One', validationIntent: 'Observe one.' }] },
      validation: {
        validations: [
          {
            id: 'validation-one',
            taskIds: ['task-one'],
            coverageArgument: {
              mappings: [
                {
                  targetId: 'task-one',
                  state: 'covered',
                  scenarioIds: ['scenario-one'],
                  stimulusStepIds: ['stimulus-one'],
                  observationStepIds: ['observe-one'],
                },
              ],
            },
          },
        ],
      },
    } as unknown as PlanReviewDetail
    expect(validationCoverageRows(detail)).toEqual([
      expect.objectContaining({
        taskId: 'task-one',
        state: 'covered',
        validationIds: ['validation-one'],
        scenarioIds: ['scenario-one'],
        stepIds: ['stimulus-one', 'observe-one'],
      }),
    ])
  })

  it('uses the validated AST preview before managed validation publication', () => {
    const detail = {
      plan: { tasks: [{ id: 'task-one', title: 'One', validationIntent: 'Observe one.' }] },
      validationAstPreview: {
        astId: 'notice-happy-path',
        coverage: [
          {
            kind: 'task',
            targetId: 'task-one',
            state: 'covered',
            scenarioIds: ['scenario-one'],
            observationStepIds: ['observe-one'],
          },
        ],
      },
    } as unknown as PlanReviewDetail

    expect(validationCoverageRows(detail)).toEqual([
      expect.objectContaining({
        taskId: 'task-one',
        state: 'covered',
        validationIds: ['notice-happy-path'],
        scenarioIds: ['scenario-one'],
        stepIds: ['observe-one'],
      }),
    ])
  })
})
