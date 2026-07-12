import { describe, expect, it } from 'vitest'

import { inventoryV1Removal } from './v1-removal-inventory-service'

const hash = (character: string) => `sha256:${character.repeat(64)}`

describe('v1 removal inventory', () => {
  it('classifies mixed and broken plans deterministically while retaining exact stable ids', async () => {
    const client = {
      planProjection: {
        findMany: async () => [
          {
            planId: 'plan-a',
            validationJson: JSON.stringify({
              validations: [
                {
                  id: 'v2',
                  astProvenance: {
                    schemaVersion: '2',
                    publishOperationId: 'op',
                    astHash: hash('a'),
                    receiptHash: hash('b'),
                    runtimeInputHash: hash('c'),
                  },
                },
                { id: 'legacy' },
              ],
            }),
            validationAstPublishOperations: [
              { id: 'op', astHash: hash('a'), receiptHash: hash('b'), runtimeInputHash: hash('c'), phase: 'completed' },
            ],
            testRuns: [
              { runId: 'run-a', status: 'RUNNING', runtimeCapsule: null, runtimeCapsuleExecutionAttempt: null },
            ],
          },
        ],
      },
    }

    await expect(inventoryV1Removal(client as never)).resolves.toEqual({
      schemaVersion: 1,
      affectedPlanCount: 1,
      affectedTestRunCount: 1,
      activeExecutionCount: 1,
      plans: [
        {
          planId: 'plan-a',
          reasons: [
            'active-managed-execution',
            'managed-run-without-capsule',
            'managed-run-without-execution-attempt',
            'missing-provenance',
          ],
          validationIds: ['legacy', 'v2'],
          testRunIds: ['run-a'],
          activeTestRunIds: ['run-a'],
        },
      ],
    })
  })

  it('excludes a fully provenanced v2 plan with capsule-backed terminal runs', async () => {
    const client = {
      planProjection: {
        findMany: async () => [
          {
            planId: 'plan-v2',
            validationJson: JSON.stringify({
              validations: [
                {
                  id: 'v2',
                  astProvenance: {
                    schemaVersion: '2',
                    publishOperationId: 'op',
                    astHash: hash('a'),
                    receiptHash: hash('b'),
                    runtimeInputHash: hash('c'),
                  },
                },
              ],
            }),
            validationAstPublishOperations: [
              { id: 'op', astHash: hash('a'), receiptHash: hash('b'), runtimeInputHash: hash('c'), phase: 'completed' },
            ],
            testRuns: [
              {
                runId: 'run-v2',
                status: 'COMPLETED',
                runtimeCapsule: { id: 'capsule' },
                runtimeCapsuleExecutionAttempt: { id: 'attempt' },
              },
            ],
          },
        ],
      },
    }

    await expect(inventoryV1Removal(client as never)).resolves.toMatchObject({
      affectedPlanCount: 0,
      affectedTestRunCount: 0,
      activeExecutionCount: 0,
      plans: [],
    })
  })
})
