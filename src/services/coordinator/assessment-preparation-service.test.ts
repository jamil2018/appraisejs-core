import { describe, expect, it, vi } from 'vitest'

import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { canonicalMcpToolNames } from '../../../packages/appraisejs/src/mcp/contract.ts'
import { ServiceError } from '@/services/shared/errors'

const { preparation, database } = vi.hoisted(() => {
  const preparation = {
    id: 'preparation-1',
    targetProjectId: 'target-1',
    idempotencyKey: 'prepare-1',
    inputHash: '',
    qualityPlanId: 'plan-1',
    qualityPlanRevisionId: 'revision-1',
    expectedDesignHash: `sha256:${'d'.repeat(64)}`,
    phase: 'VALIDATING',
    receiptJson: '{}',
    failureJson: null as string | null,
  }
  const database = {
    assessmentPreparation: {
      findUnique: vi.fn(async () => (preparation.inputHash ? { ...preparation } : null)),
      findUniqueOrThrow: vi.fn(async () => ({ ...preparation })),
      upsert: vi.fn(async ({ create }) => {
        if (!preparation.inputHash) Object.assign(preparation, create)
        return { ...preparation }
      }),
      update: vi.fn(async ({ data }) => Object.assign(preparation, data)),
    },
    stepDefinition: { findMany: vi.fn() },
    locator: { findMany: vi.fn() },
  }
  return { preparation, database }
})

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: vi.fn(async () => ({ id: 'target-1', fingerprint: `sha256:${'a'.repeat(64)}` })),
}))
vi.mock('@/services/step-definition/built-in-readiness-service', () => ({
  ensureBuiltInStepDefinitionReadiness: vi.fn(async () => ({
    manifestHash: `sha256:${'b'.repeat(64)}`,
    readyIndexHash: `sha256:${'b'.repeat(64)}`,
    seeded: 0,
    repaired: 0,
    unchanged: 1,
    conflicting: 0,
  })),
}))
vi.mock('@/services/environment/environment-service', () => ({
  ensureEnvironment: vi.fn(async () => ({
    environment: {
      id: 'env-1',
      name: 'local',
      baseUrl: 'http://127.0.0.1:3000',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
    },
    outcome: 'resolved',
    projection: 'unchanged',
  })),
  environmentSummary: (environment: Record<string, unknown>) => environment,
}))
vi.mock('./quality-design-service', () => ({
  readQualityRequirementGraph: vi.fn(),
  compileQualityValidations: vi.fn(),
  publishQualityValidations: vi.fn(),
  createQualityAssessment: vi.fn(),
}))
vi.mock('./assessment-execution-service', () => ({ runQualityAssessment: vi.fn() }))

import { prepareQualityAssessmentRun } from './assessment-preparation-service'
import { runQualityAssessment } from './assessment-execution-service'
import {
  compileQualityValidations,
  createQualityAssessment,
  publishQualityValidations,
  readQualityRequirementGraph,
} from './quality-design-service'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'
import { ensureEnvironment } from '@/services/environment/environment-service'

const definition = builtInStepDefinitions.find(candidate => candidate.inputs.length === 0)!
const designHash = `sha256:${'d'.repeat(64)}`
const graph = {
  qualityPlan: { targetProjectId: 'target-1' },
  revision: { status: 'SCENARIOS_APPROVED' },
  designHash,
  validationVersions: [
    {
      id: 'validation-1',
      validationIdentity: 'checkout',
      canonicalHash: `sha256:${'c'.repeat(64)}`,
      status: 'SCENARIOS_APPROVED',
      design: { title: 'Checkout', behavior: 'Checkout completes.' },
    },
  ],
}

const input = {
  target: 'target-1',
  qualityPlanId: 'plan-1',
  revisionId: 'revision-1',
  expectedDesignHash: designHash,
  validationBindings: [
    {
      validationId: 'validation-1',
      steps: [
        {
          stepId: definition.identity.id,
          version: definition.identity.version,
          inputs: {},
          description: 'the checkout is ready',
        },
      ],
      locatorIds: [],
    },
  ],
  environment: { environmentId: 'env-1' },
  subject: { subjectDigest: `sha256:${'e'.repeat(64)}`, authority: 'artifact://checkout' },
  idempotencyKey: 'prepare-1',
}

function reset() {
  vi.clearAllMocks()
  Object.assign(preparation, { inputHash: '', phase: 'VALIDATING', receiptJson: '{}', failureJson: null })
  vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
    { id: definition.identity.id, version: definition.identity.version, definitionJson: JSON.stringify(definition) },
  ] as never)
  vi.mocked(database.locator.findMany).mockResolvedValue([] as never)
  vi.mocked(readQualityRequirementGraph).mockResolvedValue(graph as never)
  vi.mocked(compileQualityValidations).mockResolvedValue({
    compilationHash: `sha256:${'f'.repeat(64)}`,
    validationVersions: graph.validationVersions,
  } as never)
  vi.mocked(publishQualityValidations).mockResolvedValue({
    validationVersions: graph.validationVersions.map(version => ({ ...version, status: 'PUBLISHED' })),
  } as never)
  vi.mocked(createQualityAssessment).mockResolvedValue({ assessment: { id: 'assessment-1', status: 'READY' } } as never)
  vi.mocked(runQualityAssessment).mockResolvedValue({ id: 'run-1', status: 'RUNNING' } as never)
}

describe('assessment preparation service', () => {
  it('checkpoints a complete preparation and replays the completed receipt without mutations', async () => {
    reset()
    const result = await prepareQualityAssessmentRun(input)

    expect(result).toMatchObject({
      phase: 'STARTED',
      environment: { id: 'env-1' },
      assessment: { id: 'assessment-1' },
      assessmentRun: { id: 'run-1' },
      hashes: { compilationHash: `sha256:${'f'.repeat(64)}` },
    })
    const compileInput = vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
      realization: {
        validations: {
          realization: { runtimePublication: { runtimeInput: { matrix: unknown; stepDefinitions: unknown } } }
        }[]
      }
    }
    expect(compileInput.realization.validations[0]?.realization.runtimePublication.runtimeInput.matrix).toEqual([
      { browser: 'chromium', environment: 'env-1' },
    ])
    expect(
      compileInput.realization.validations[0]?.realization.runtimePublication.runtimeInput.stepDefinitions,
    ).toEqual([
      {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepDefinitionHashes(definition).definitionHash,
      },
    ])
    const replay = await prepareQualityAssessmentRun(input)
    expect(replay).toMatchObject({ unchanged: true, phase: 'STARTED', preparationId: 'preparation-1' })
    expect(compileQualityValidations).toHaveBeenCalledTimes(1)
  })

  it('returns a bounded failure receipt and resumes at the first incomplete phase', async () => {
    reset()
    vi.mocked(compileQualityValidations).mockRejectedValueOnce(new Error('compiler unavailable'))
    const failed = await prepareQualityAssessmentRun(input)
    expect(failed).toMatchObject({
      phase: 'ENVIRONMENT',
      blockers: [{ message: 'compiler unavailable' }],
      nextRecommendedAction: 'assessment_prepare_run',
      retry: { classification: 'infrastructure_failure', safe: true },
    })
    const resumed = await prepareQualityAssessmentRun(input)
    expect(resumed.phase).toBe('STARTED')
    expect(ensureBuiltInStepDefinitionReadiness).toHaveBeenCalledTimes(2)
    expect(ensureEnvironment).toHaveBeenCalledTimes(1)
    expect(compileQualityValidations).toHaveBeenCalledTimes(2)
  })

  it('repairs missing built-ins before resolving compact bindings', async () => {
    reset()
    let repaired = false
    vi.mocked(ensureBuiltInStepDefinitionReadiness).mockImplementationOnce(async () => {
      repaired = true
      return {
        manifestHash: `sha256:${'b'.repeat(64)}`,
        readyIndexHash: `sha256:${'b'.repeat(64)}`,
        seeded: 1,
        repaired: 0,
        unchanged: 0,
        conflicting: 0,
      }
    })
    vi.mocked(database.stepDefinition.findMany).mockImplementation(
      async () =>
        (repaired
          ? [
              {
                id: definition.identity.id,
                version: definition.identity.version,
                definitionJson: JSON.stringify(definition),
              },
            ]
          : []) as never,
    )

    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({ phase: 'STARTED' })
    expect(vi.mocked(ensureBuiltInStepDefinitionReadiness).mock.invocationCallOrder[0]).toBeLessThan(
      database.stepDefinition.findMany.mock.invocationCallOrder[0]!,
    )
  })

  it('derives sealed locator descriptors from target-owned locator records', async () => {
    reset()
    vi.mocked(database.locator.findMany).mockResolvedValue([
      {
        id: 'locator-1',
        name: 'submit',
        value: '[data-testid="submit"]',
        locatorGroupId: 'group-1',
        locatorGroup: { id: 'group-1', name: 'Checkout', route: '/checkout', moduleId: 'module-1' },
      },
    ] as never)
    const locatorInput = {
      ...input,
      validationBindings: [{ ...input.validationBindings[0]!, locatorIds: ['locator-1'] }],
    }

    await prepareQualityAssessmentRun(locatorInput)
    const realization = (
      vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
        realization: {
          validations: Array<{
            realization: {
              runtimePublication: {
                runtimeInput: { locators: unknown[] }
                projection: { validationNode: { appraiseArtifacts: { locators: unknown[] } } }
              }
            }
          }>
        }
      }
    ).realization.validations[0]!.realization.runtimePublication

    expect(realization.runtimeInput.locators).toEqual([
      {
        id: 'locator-1',
        version: '1',
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        binding: {
          id: 'locator-1',
          name: 'submit',
          value: '[data-testid="submit"]',
          locatorGroupId: 'group-1',
        },
      },
    ])
    expect(realization.projection.validationNode.appraiseArtifacts.locators).toEqual([
      { id: 'locator-1', name: 'submit', value: '[data-testid="submit"]', locatorGroupId: 'group-1' },
    ])
  })

  it('recovers an already-realized publication after its caller loses the post-commit response', async () => {
    reset()
    const committed = structuredClone(graph) as {
      qualityPlan: { targetProjectId: string }
      revision: { status: string }
      designHash: string
      validationVersions: Array<{
        id: string
        validationIdentity: string
        canonicalHash: string
        status: string
        realizationHash?: string
        design: { title: string; behavior: string }
      }>
    }
    vi.mocked(readQualityRequirementGraph).mockImplementation(async () => committed as never)
    vi.mocked(compileQualityValidations).mockImplementationOnce(async () => {
      committed.validationVersions[0] = {
        ...committed.validationVersions[0]!,
        status: 'REALIZED',
        realizationHash: `sha256:${'9'.repeat(64)}`,
      }
      throw new Error('connection lost after realization commit')
    })

    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({ phase: 'ENVIRONMENT' })
    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({ phase: 'STARTED' })
    expect(compileQualityValidations).toHaveBeenCalledTimes(1)
  })

  it('recovers an already-published phase after its caller loses the post-commit response', async () => {
    reset()
    const committed = structuredClone(graph) as {
      qualityPlan: { targetProjectId: string }
      revision: { status: string }
      designHash: string
      validationVersions: Array<{
        id: string
        validationIdentity: string
        canonicalHash: string
        status: string
        realizationHash?: string
        design: { title: string; behavior: string }
      }>
    }
    vi.mocked(readQualityRequirementGraph).mockImplementation(async () => committed as never)
    vi.mocked(publishQualityValidations).mockImplementationOnce(async () => {
      committed.validationVersions[0] = {
        ...committed.validationVersions[0]!,
        status: 'PUBLISHED',
        realizationHash: `sha256:${'8'.repeat(64)}`,
      }
      throw new Error('connection lost after publication commit')
    })

    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({ phase: 'REALIZED' })
    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({ phase: 'STARTED' })
    expect(publishQualityValidations).toHaveBeenCalledTimes(1)
  })

  it('rejects a changed request under an existing idempotency key', async () => {
    reset()
    preparation.inputHash = 'sha256:different'
    await expect(prepareQualityAssessmentRun(input)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('only recommends live canonical MCP actions for retry and non-retryable preparation state', async () => {
    reset()
    vi.mocked(compileQualityValidations).mockRejectedValueOnce(new ServiceError('stale realization', 'CONFLICT'))

    const failed = await prepareQualityAssessmentRun(input)

    expect(failed).toMatchObject({
      retry: { classification: 'state_conflict', safe: false },
      nextRecommendedAction: 'project_diagnostic',
      nextRequiredAgentBehavior: 'inspect_diagnostic_and_revise_request_or_state',
    })
    expect(canonicalMcpToolNames).toContain(failed.nextRecommendedAction)
  })
})
