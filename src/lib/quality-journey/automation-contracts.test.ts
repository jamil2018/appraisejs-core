import { describe, expect, it } from 'vitest'

import { automationMaterializationRequestSchema, preparedRuntimeCapsuleSchema } from './automation-contracts'

const hash = `sha256:${'a'.repeat(64)}`

describe('Quality Journey Phase 6 contracts', () => {
  it('accepts only a typed preparation capsule with no execution identity', () => {
    expect(
      preparedRuntimeCapsuleSchema.parse({
        schemaVersion: 'appraise.quality-journey/v1',
        capsuleId: 'prepared-1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        cycleId: 'cycle-1',
        materializationId: 'materialization-1',
        inputHash: hash,
        manifestHash: hash,
        status: 'PREPARED',
      }),
    ).toMatchObject({ capsuleId: 'prepared-1', status: 'PREPARED' })
  })

  it('rejects a TestRun or legacy RuntimeCapsule binding before Phase 7', () => {
    const value = {
      schemaVersion: 'appraise.quality-journey/v1',
      capsuleId: 'prepared-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      cycleId: 'cycle-1',
      materializationId: 'materialization-1',
      inputHash: hash,
      manifestHash: hash,
      status: 'PREPARED',
      testRunId: 'run-1',
    }
    expect(preparedRuntimeCapsuleSchema.safeParse(value).success).toBe(false)
  })

  it('requires exact typed per-step lineage rather than inferred mappings', () => {
    const base = {
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      leaseId: 'lease-1',
      ownerToken: 'secret',
      idempotencyKey: 'materialize-1',
      expectedInputHash: hash,
      expectedScopeHash: hash,
      scenarios: [
        {
          scenarioRevisionId: 'scenario-1',
          steps: [
            {
              sourceScenarioStepId: 'step-1',
              stepDefinition: { id: 'definition-1', version: '1', definitionHash: hash },
              operation: {
                id: 'operation-1',
                version: '1',
                handler: { id: 'handler-1', version: '1', contentHash: hash },
              },
              parameters: [],
              testData: [],
              locatorRequirements: [{ requirementId: 'locator-1', parameterName: 'selector' }],
            },
          ],
        },
      ],
      result: {
        schemaVersion: 'appraise.quality-journey/v1',
        assignmentId: 'assignment-1',
        workItemId: 'work-1',
        attemptId: 'attempt-1',
        roleContractDigest: hash,
        inputHash: hash,
        role: 'AUTOMATOR',
        status: 'COMPLETED',
        outputs: [],
        evidenceReceipts: [],
        assumptions: [],
        blockers: [],
        unresolvedQuestions: [],
        submittedAt: '2026-09-05T00:00:00.000Z',
      },
    }
    expect(automationMaterializationRequestSchema.safeParse(base).success).toBe(false)
    expect(
      automationMaterializationRequestSchema.safeParse({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0],
            steps: [
              {
                ...base.scenarios[0]!.steps[0]!,
                locatorRequirements: [
                  { requirementId: 'locator-1', parameterName: 'selector', runtimeParameter: true },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true)
  })
})
