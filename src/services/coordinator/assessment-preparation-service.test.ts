import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { canonicalMcpToolNames } from '../../../packages/appraisejs/src/mcp/contract.ts'
import { ServiceError } from '@/services/shared/errors'

const { preparation, database, transaction } = vi.hoisted(() => {
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
    targetProject: {
      findUnique: vi.fn(async () => ({ kind: 'LOCAL_WORKSPACE' })),
      findFirst: vi.fn(async () => null),
    },
    environment: { findFirst: vi.fn(async () => null) },
  }
  // Keep transaction work distinct from outer reads so remote phase guards
  // prove they receive the client that owns the durable checkpoint/acquire.
  const transaction = {
    assessmentPreparation: database.assessmentPreparation,
    stepDefinition: database.stepDefinition,
    locator: database.locator,
    targetProject: database.targetProject,
  }
  Object.assign(database, { $transaction: vi.fn(async callback => callback(transaction)) })
  return { preparation, database, transaction }
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
  getEnvironmentByIdOrThrow: vi.fn(async () => ({
    id: 'env-1',
    name: 'local',
    baseUrl: 'http://127.0.0.1:3000',
    expectedPageTitle: null,
    apiBaseUrl: null,
    username: null,
    credentialState: 'NONE',
  })),
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
  readQualityAssessment: vi.fn(),
}))
vi.mock('./assessment-execution-service', () => ({ runQualityAssessment: vi.fn() }))
vi.mock('./remote-evaluation-scope-service', () => ({
  setCanonicalAssessmentPreflightAuthority: vi.fn(),
  parseRemoteSubjectReference: vi.fn((value: unknown) =>
    value && typeof value === 'object' && 'subjectRevisionId' in value ? value : null,
  ),
  assertRemoteEvaluationScopePreflight: vi.fn(async () => ({
    subject: { id: 'remote-subject-1' },
    binding: { environmentId: 'env-1' },
  })),
  remoteScopePhaseBinding: vi.fn(() => ({
    subjectRevisionId: 'remote-subject-1',
    targetProjectId: 'target-1',
    qualityPlanId: 'plan-1',
    qualityPlanRevisionId: 'revision-1',
    environmentId: 'env-1',
    scopeHash: `sha256:${'s'.repeat(64)}`,
    environmentSnapshotHash: `sha256:${'e'.repeat(64)}`,
    environmentSnapshotJson: '{}',
    environmentScopeVersion: 1,
    environmentUpdatedAt: new Date('2026-08-22T00:00:00.000Z'),
  })),
  assertRemoteEvaluationScopeCurrent: vi.fn(async () => undefined),
  hydrateRemoteEvaluationScopeBindings: vi.fn(),
}))

import { preflightQualityAssessmentRun, prepareQualityAssessmentRun } from './assessment-preparation-service'
import { runQualityAssessment } from './assessment-execution-service'
import {
  compileQualityValidations,
  createQualityAssessment,
  publishQualityValidations,
  readQualityAssessment,
  readQualityRequirementGraph,
} from './quality-design-service'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'
import { ensureEnvironment, getEnvironmentByIdOrThrow } from '@/services/environment/environment-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { validationArtifactSchema } from '@/lib/quality-design/validation-artifact-contract'
import * as runtimeInputContract from '@/lib/quality-design/validation-runtime-input-contract'
import {
  assertRemoteEvaluationScopeCurrent,
  assertRemoteEvaluationScopePreflight,
  hydrateRemoteEvaluationScopeBindings,
} from './remote-evaluation-scope-service'

const environmentNavigationDefinition = builtInStepDefinitions.find(
  candidate => candidate.identity.id === 'browser.navigation.navigate.to.environment.base.url',
)!
const definition = builtInStepDefinitions.find(candidate => candidate.inputs.length === 0)!
const visibleDefinition = builtInStepDefinitions.find(
  candidate => candidate.identity.id === 'browser.assertions.visible',
)!
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
          stepId: environmentNavigationDefinition.identity.id,
          version: environmentNavigationDefinition.identity.version,
          inputs: {},
          description: 'the user navigates to the base url of the selected environment',
        },
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

function selectedAssessment(overrides: Record<string, unknown> = {}) {
  return {
    assessment: {
      id: 'assessment-successor-1',
      status: 'READY',
      lineageId: 'assessment-root-1',
      generation: 1,
      supersedesAssessmentId: 'assessment-root-1',
    },
    qualityPlan: { id: 'plan-1', targetProjectId: 'target-1' },
    revision: { revision: { id: 'revision-1' } },
    subject: {
      id: 'subject-1',
      subjectDigest: `sha256:${'e'.repeat(64)}`,
      subjectKind: 'ARTIFACT',
      authority: 'artifact://checkout',
      metadata: null,
    },
    ...overrides,
  }
}

function reset() {
  vi.clearAllMocks()
  vi.mocked(resolveTargetProject).mockResolvedValue({
    id: 'target-1',
    kind: 'LOCAL_WORKSPACE',
    fingerprint: `sha256:${'a'.repeat(64)}`,
  } as never)
  vi.mocked(hydrateRemoteEvaluationScopeBindings).mockReset()
  Object.assign(preparation, { inputHash: '', phase: 'VALIDATING', receiptJson: '{}', failureJson: null })
  vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
    {
      id: environmentNavigationDefinition.identity.id,
      version: environmentNavigationDefinition.identity.version,
      definitionJson: JSON.stringify(environmentNavigationDefinition),
    },
    { id: definition.identity.id, version: definition.identity.version, definitionJson: JSON.stringify(definition) },
  ] as never)
  vi.mocked(database.locator.findMany).mockResolvedValue([] as never)
  vi.mocked(database.targetProject.findUnique).mockResolvedValue({ kind: 'LOCAL_WORKSPACE' } as never)
  vi.mocked(database.targetProject.findFirst).mockResolvedValue(null as never)
  vi.mocked(database.environment.findFirst).mockResolvedValue(null as never)
  vi.mocked(getEnvironmentByIdOrThrow).mockResolvedValue({
    id: 'env-1',
    name: 'local',
    baseUrl: 'http://127.0.0.1:3000',
    expectedPageTitle: null,
    apiBaseUrl: null,
    username: null,
    credentialState: 'NONE',
  } as never)
  vi.mocked(readQualityRequirementGraph).mockResolvedValue(graph as never)
  vi.mocked(compileQualityValidations).mockResolvedValue({
    compilationHash: `sha256:${'f'.repeat(64)}`,
    validationVersions: graph.validationVersions,
  } as never)
  vi.mocked(publishQualityValidations).mockResolvedValue({
    validationVersions: graph.validationVersions.map(version => ({
      ...version,
      status: 'PUBLISHED',
      activeGeneration: {
        id: `generation-${version.id}`,
        publicationId: `publication-${version.id}`,
        operationHash: `sha256:${'p'.repeat(64)}`,
        disposition: 'ACTIVE',
      },
    })),
  } as never)
  vi.mocked(createQualityAssessment).mockResolvedValue({ assessment: { id: 'assessment-1', status: 'READY' } } as never)
  vi.mocked(readQualityAssessment).mockResolvedValue({ assessment: { id: 'assessment-1', status: 'READY' } } as never)
  vi.mocked(runQualityAssessment).mockResolvedValue({ id: 'run-1', status: 'RUNNING' } as never)
}

describe('assessment preparation service', () => {
  it('binds an explicitly selected READY successor without creating a root Assessment', async () => {
    reset()
    vi.mocked(readQualityAssessment).mockResolvedValue(selectedAssessment() as never)

    const result = await prepareQualityAssessmentRun({
      ...input,
      assessmentId: 'assessment-successor-1',
      idempotencyKey: 'prepare-successor-1',
    })

    expect(result).toMatchObject({
      phase: 'STARTED',
      assessment: { id: 'assessment-successor-1', status: 'READY' },
      assessmentRun: { id: 'run-1' },
    })
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: 'assessment-successor-1',
        idempotencyKey: 'prepare:prepare-successor-1',
      }),
    )
    expect(readQualityAssessment).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      'decided',
      selectedAssessment({ assessment: { ...selectedAssessment().assessment, status: 'DECIDED' } }),
      'assessment_selector_not_ready',
    ],
    [
      'foreign plan',
      selectedAssessment({ qualityPlan: { id: 'plan-foreign', targetProjectId: 'target-foreign' } }),
      'assessment_selector_scope_mismatch',
    ],
    [
      'mismatched subject',
      selectedAssessment({ subject: { ...selectedAssessment().subject, authority: 'artifact://foreign' } }),
      'assessment_selector_scope_mismatch',
    ],
  ])('rejects a %s selected Assessment before publication or run mutation', async (_name, selected, code) => {
    reset()
    vi.mocked(readQualityAssessment).mockResolvedValue(selected as never)

    await expect(
      prepareQualityAssessmentRun({
        ...input,
        assessmentId: 'assessment-successor-1',
        idempotencyKey: `prepare-rejected-${_name}`,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code } })

    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.update).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('preserves omitted-selector root creation and idempotent replay behavior', async () => {
    reset()
    await prepareQualityAssessmentRun({ ...input, idempotencyKey: 'prepare-root-replay' })
    await prepareQualityAssessmentRun({ ...input, idempotencyKey: 'prepare-root-replay' })

    expect(createQualityAssessment).toHaveBeenCalledTimes(1)
    expect(createQualityAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'prepare:prepare-root-replay' }),
    )
    expect(runQualityAssessment).toHaveBeenCalledTimes(1)
  })

  it('includes an explicit Assessment selector in the immutable preparation hash', async () => {
    reset()
    vi.mocked(readQualityAssessment).mockResolvedValue(selectedAssessment() as never)
    await prepareQualityAssessmentRun({
      ...input,
      assessmentId: 'assessment-successor-1',
      idempotencyKey: 'prepare-selector-hash',
    })

    await expect(
      prepareQualityAssessmentRun({
        ...input,
        assessmentId: 'assessment-successor-2',
        idempotencyKey: 'prepare-selector-hash',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(runQualityAssessment).toHaveBeenCalledTimes(1)
  })

  it('rejects an Assessment selector on the read-only preflight contract', async () => {
    reset()
    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: input.validationBindings,
        environment: input.environment,
        subject: input.subject,
        runtime: {},
        assessmentId: 'assessment-successor-1',
      }),
    ).rejects.toBeInstanceOf(z.ZodError)
  })

  it('rejects omitted bindings for a local target before readiness or preparation mutation', async () => {
    reset()
    const omitted = { ...input }
    delete (omitted as { validationBindings?: unknown }).validationBindings

    await expect(prepareQualityAssessmentRun(omitted)).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { code: 'validation_bindings_required' },
    })
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
  })

  it('rejects raw remote descriptors and remote environment creation before readiness or any durable mutation', async () => {
    reset()
    vi.mocked(database.targetProject.findUnique).mockResolvedValue({ kind: 'REMOTE_BLACK_BOX' } as never)

    await expect(prepareQualityAssessmentRun(input)).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      prepareQualityAssessmentRun({
        ...input,
        subject: { subjectRevisionId: 'remote-subject-1' },
        environment: { allowCreate: true, proposal: { name: 'Remote', baseUrl: 'https://www.saucedemo.com' } },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })

    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.update).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('stops a remote preparation when the environment changes after scope preflight and before readiness mutation', async () => {
    reset()
    vi.mocked(database.targetProject.findUnique).mockResolvedValue({ kind: 'REMOTE_BLACK_BOX' } as never)
    vi.mocked(assertRemoteEvaluationScopePreflight).mockResolvedValue({
      subject: { id: 'remote-subject-1' },
      binding: { environmentId: 'env-1' },
    } as never)
    vi.mocked(assertRemoteEvaluationScopeCurrent).mockRejectedValueOnce(
      new ServiceError('remote environment changed after scope preflight', 'CONFLICT'),
    )

    await expect(
      prepareQualityAssessmentRun({ ...input, subject: { subjectRevisionId: 'remote-subject-1' } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(assertRemoteEvaluationScopePreflight).toHaveBeenCalledTimes(1)
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('uses the transaction-injected client for remote preparation acquisition and checkpoints', async () => {
    reset()
    vi.mocked(database.targetProject.findUnique).mockResolvedValue({ kind: 'REMOTE_BLACK_BOX' } as never)
    vi.mocked(assertRemoteEvaluationScopePreflight).mockResolvedValue({
      subject: { id: 'remote-subject-1' },
      binding: { environmentId: 'env-1' },
    } as never)

    await expect(
      prepareQualityAssessmentRun({ ...input, subject: { subjectRevisionId: 'remote-subject-1' } }),
    ).resolves.toMatchObject({ phase: 'STARTED' })

    expect((database as typeof database & { $transaction: ReturnType<typeof vi.fn> }).$transaction).toHaveBeenCalled()
    expect(
      vi
        .mocked(assertRemoteEvaluationScopeCurrent)
        .mock.calls.some(([, client]) => client === (transaction as unknown)),
    ).toBe(true)
  })

  it('preflights compact intent deterministically without readiness, durable, environment, publication, or runtime mutation', async () => {
    reset()
    const preflightInput = {
      target: input.target,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedDesignHash: input.expectedDesignHash,
      validationBindings: input.validationBindings,
      environment: input.environment,
      subject: input.subject,
      runtime: { browserEngine: 'CHROMIUM' as const },
    }

    const first = await preflightQualityAssessmentRun(preflightInput)
    const second = await preflightQualityAssessmentRun(preflightInput)

    expect(first).toMatchObject({
      ready: true,
      validationCount: 1,
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      expectedPreflight: {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        preflightHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      nextRecommendedAction: 'assessment_prepare_run',
      diagnostics: [],
      validations: [
        expect.objectContaining({
          validationVersionId: 'validation-1',
          stepReferenceCount: 2,
          locatorReferenceCount: 0,
          realizationHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ],
    })
    expect(first.expectedPreflight).toEqual({
      algorithmVersion: first.algorithmVersion,
      preflightHash: first.preflightHash,
    })
    expect(first).not.toHaveProperty('scopeIntent')
    expect(first).not.toHaveProperty('realizationIntent')
    expect(second).toEqual(first)
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('hydrates omitted v2 remote bindings before canonical preflight and reports their bounded source metadata', async () => {
    reset()
    const remoteTarget = {
      id: 'target-1',
      kind: 'REMOTE_BLACK_BOX',
      fingerprint: `sha256:${'a'.repeat(64)}`,
      canonicalIdentity: 'remote:https://www.saucedemo.com',
      normalizedRemoteOrigin: 'https://www.saucedemo.com',
    }
    const remoteEnvironment = {
      id: 'env-1',
      targetProjectId: 'target-1',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      scopeVersion: 1,
    }
    vi.mocked(resolveTargetProject).mockResolvedValue(remoteTarget as never)
    vi.mocked(database.targetProject.findFirst).mockResolvedValue(remoteTarget as never)
    vi.mocked(database.environment.findFirst).mockResolvedValue(remoteEnvironment as never)
    vi.mocked(hydrateRemoteEvaluationScopeBindings).mockImplementation(
      async request =>
        ({
          subject: { id: 'remote-subject-1' },
          binding: { environmentId: 'env-1' },
          validationBindings: input.validationBindings,
          bindingsSource:
            request.validationBindings === undefined ? 'persisted_remote_scope' : 'caller_exact_remote_scope',
          bindingsRecovered: request.validationBindings === undefined,
          counts: { validationCount: 1, stepCount: 2, locatorCount: 0 },
        }) as never,
    )

    const omitted = { ...input, subject: { subjectRevisionId: 'remote-subject-1' } }
    delete (omitted as { validationBindings?: unknown }).validationBindings
    delete (omitted as { idempotencyKey?: unknown }).idempotencyKey
    const result = await preflightQualityAssessmentRun(omitted)
    const explicitInput = { ...input, subject: { subjectRevisionId: 'remote-subject-1' } }
    delete (explicitInput as { idempotencyKey?: unknown }).idempotencyKey
    const explicit = await preflightQualityAssessmentRun(explicitInput)

    expect(result).toMatchObject({
      bindingsSource: 'persisted_remote_scope',
      bindingsRecovered: true,
      counts: { validationCount: 1, stepCount: 2, locatorCount: 0 },
    })
    expect(hydrateRemoteEvaluationScopeBindings).toHaveBeenCalledWith(
      expect.objectContaining({ validationBindings: undefined, environmentId: 'env-1' }),
      expect.anything(),
    )
    expect(explicit).toMatchObject({
      bindingsSource: 'caller_exact_remote_scope',
      bindingsRecovered: false,
      preflightHash: result.preflightHash,
    })
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
  })

  it('returns a typed not-evaluated preflight defect for the live assertion-only browser scenario without starting a run', async () => {
    reset()
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionJson: JSON.stringify(environmentNavigationDefinition),
      },
      {
        id: visibleDefinition.identity.id,
        version: visibleDefinition.identity.version,
        definitionJson: JSON.stringify(visibleDefinition),
      },
    ] as never)
    const assertionOnly = {
      ...input,
      validationBindings: [
        {
          validationId: 'validation-1',
          steps: [
            {
              stepId: visibleDefinition.identity.id,
              version: visibleDefinition.identity.version,
              inputs: { target: 'login-form' },
              description: 'the login form is visible',
            },
          ],
          locatorIds: [],
        },
      ],
    }

    await expect(
      preflightQualityAssessmentRun({
        target: assertionOnly.target,
        qualityPlanId: assertionOnly.qualityPlanId,
        revisionId: assertionOnly.revisionId,
        expectedDesignHash: assertionOnly.expectedDesignHash,
        validationBindings: assertionOnly.validationBindings,
        environment: assertionOnly.environment,
        subject: assertionOnly.subject,
        runtime: {},
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      details: { code: 'scenario_page_context_required', targetOutcome: 'not_evaluated' },
    })
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
    expect(publishQualityValidations).not.toHaveBeenCalled()
    expect(createQualityAssessment).not.toHaveBeenCalled()
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('preserves authored navigation-first order and accepts the environment-base-url scenario in preflight', async () => {
    reset()
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue(
      [environmentNavigationDefinition, visibleDefinition].map(definition => ({
        id: definition.identity.id,
        version: definition.identity.version,
        definitionJson: JSON.stringify(definition),
      })) as never,
    )
    const navigationFirst = {
      ...input,
      validationBindings: [
        {
          validationId: 'validation-1',
          steps: [
            {
              stepId: environmentNavigationDefinition.identity.id,
              version: environmentNavigationDefinition.identity.version,
              inputs: {},
              description: 'the user navigates to the base url of the selected environment',
            },
            {
              stepId: visibleDefinition.identity.id,
              version: visibleDefinition.identity.version,
              inputs: { target: 'login-form' },
              description: 'the login form is visible',
            },
          ],
          locatorIds: [],
        },
      ],
    }

    await expect(
      preflightQualityAssessmentRun({
        target: navigationFirst.target,
        qualityPlanId: navigationFirst.qualityPlanId,
        revisionId: navigationFirst.revisionId,
        expectedDesignHash: navigationFirst.expectedDesignHash,
        validationBindings: navigationFirst.validationBindings,
        environment: navigationFirst.environment,
        subject: navigationFirst.subject,
        runtime: {},
      }),
    ).resolves.toMatchObject({ ready: true, validationCount: 1 })
    expect(runQualityAssessment).not.toHaveBeenCalled()
  })

  it('runs the strict runtime/artifact validator before returning a preflight result', async () => {
    reset()
    const strict = vi.spyOn(runtimeInputContract, 'validateValidationAstRuntimeInput').mockImplementationOnce(() => {
      throw new ServiceError('invalid runtime candidate', 'VALIDATION')
    })

    try {
      await expect(
        preflightQualityAssessmentRun({
          target: input.target,
          qualityPlanId: input.qualityPlanId,
          revisionId: input.revisionId,
          expectedDesignHash: input.expectedDesignHash,
          validationBindings: input.validationBindings,
          environment: input.environment,
          subject: input.subject,
          runtime: {},
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'realization_runtime_invalid' } })
      expect(strict).toHaveBeenCalledTimes(1)
      expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
      expect(ensureEnvironment).not.toHaveBeenCalled()
    } finally {
      strict.mockRestore()
    }
  })

  it('rejects artifact-only corruption before runtime validation or mutation', async () => {
    reset()
    const artifact = vi.spyOn(validationArtifactSchema, 'parse').mockImplementationOnce(() => {
      throw new ServiceError('artifact-only corruption', 'VALIDATION')
    })
    const runtime = vi.spyOn(runtimeInputContract, 'validateValidationAstRuntimeInput')
    try {
      await expect(
        preflightQualityAssessmentRun({
          target: input.target,
          qualityPlanId: input.qualityPlanId,
          revisionId: input.revisionId,
          expectedDesignHash: input.expectedDesignHash,
          validationBindings: input.validationBindings,
          environment: input.environment,
          subject: input.subject,
          runtime: {},
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'realization_runtime_invalid' } })
      expect(runtime).not.toHaveBeenCalled()
      expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
      expect(ensureEnvironment).not.toHaveBeenCalled()
    } finally {
      artifact.mockRestore()
      runtime.mockRestore()
    }
  })

  it('rejects non-preflight command fields and unknown input before target resolution', async () => {
    reset()
    const preflightInput = {
      target: input.target,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedDesignHash: input.expectedDesignHash,
      validationBindings: input.validationBindings,
      environment: input.environment,
      subject: input.subject,
      runtime: {},
    }

    for (const invalid of [
      { ...preflightInput, idempotencyKey: 'must-not-be-accepted' },
      { ...preflightInput, authorizationGrantId: 'd2ad80b2-c96c-4c4e-b2d1-0c913c4fe21b' },
      {
        ...preflightInput,
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: `sha256:${'a'.repeat(64)}`,
        },
      },
      { ...preflightInput, realization: { internal: true } },
      { ...preflightInput, unrecognized: true },
    ]) {
      await expect(preflightQualityAssessmentRun(invalid)).rejects.toBeInstanceOf(z.ZodError)
    }
    expect(resolveTargetProject).not.toHaveBeenCalled()
    expect(getEnvironmentByIdOrThrow).not.toHaveBeenCalled()
  })

  it('requires one strict environment resolution mode before any target or readiness mutation', async () => {
    reset()
    const proposal = { name: 'Preview', baseUrl: 'https://preview.example.test' }
    const invalidEnvironments = [
      {},
      { allowCreate: true },
      { environmentId: 'env-1', proposal },
      { environmentId: 'env-1', allowCreate: true },
      { allowCreate: true, proposal: { name: 'Preview' } },
      { allowCreate: true, proposal: { ...proposal, ignored: true } },
    ]

    for (const environment of invalidEnvironments) {
      await expect(prepareQualityAssessmentRun({ ...input, environment })).rejects.toBeInstanceOf(z.ZodError)
    }
    expect(resolveTargetProject).not.toHaveBeenCalled()
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()

    await expect(
      prepareQualityAssessmentRun({ ...input, environment: { allowCreate: true, proposal } }),
    ).resolves.toMatchObject({ phase: 'STARTED' })
    expect(ensureEnvironment).toHaveBeenCalledTimes(1)
    expect(ensureEnvironment).toHaveBeenCalledWith({ allowCreate: true, proposal }, 'target-1')
  })

  it('rejects the retired bare realization-preflight hash before target resolution', async () => {
    reset()
    await expect(
      prepareQualityAssessmentRun({
        ...input,
        expectedRealizationPreflightHash: `sha256:${'a'.repeat(64)}`,
      }),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(resolveTargetProject).not.toHaveBeenCalled()
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
  })

  it('rejects unknown fixed nested fields before target resolution while preserving dynamic typed step inputs', async () => {
    reset()
    const preflight = {
      target: input.target,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedDesignHash: input.expectedDesignHash,
      validationBindings: input.validationBindings,
      environment: input.environment,
      subject: input.subject,
      runtime: {},
    }
    for (const invalid of [
      { ...preflight, validationBindings: [{ ...input.validationBindings[0]!, unexpected: true }] },
      {
        ...preflight,
        validationBindings: [
          { ...input.validationBindings[0]!, steps: [{ ...input.validationBindings[0]!.steps[0]!, unexpected: true }] },
        ],
      },
      { ...preflight, subject: { ...input.subject, unexpected: true } },
      { ...preflight, runtime: { browserEngine: 'CHROMIUM', unexpected: true } },
    ])
      await expect(preflightQualityAssessmentRun(invalid)).rejects.toBeInstanceOf(z.ZodError)

    await expect(
      preflightQualityAssessmentRun({
        ...preflight,
        validationBindings: [
          {
            ...input.validationBindings[0]!,
            steps: [
              {
                stepId: environmentNavigationDefinition.identity.id,
                version: environmentNavigationDefinition.identity.version,
                inputs: {},
                description: 'the user navigates to the base url of the selected environment',
              },
              {
                ...input.validationBindings[0]!.steps[0]!,
                inputs: { payload: { nested: ['typed', { value: true }] } },
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    expect(resolveTargetProject).toHaveBeenCalledTimes(1)

    const stringInputDefinition = builtInStepDefinitions.find(
      candidate => candidate.identity.id === 'browser.browser.assertion.assert.page.title',
    )!
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionJson: JSON.stringify(environmentNavigationDefinition),
      },
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionJson: JSON.stringify(environmentNavigationDefinition),
      },
      {
        id: stringInputDefinition.identity.id,
        version: stringInputDefinition.identity.version,
        definitionJson: JSON.stringify(stringInputDefinition),
      },
    ] as never)
    await expect(
      preflightQualityAssessmentRun({
        ...preflight,
        validationBindings: [
          {
            ...input.validationBindings[0]!,
            steps: [
              {
                stepId: environmentNavigationDefinition.identity.id,
                version: environmentNavigationDefinition.identity.version,
                inputs: {},
                description: 'the user navigates to the base url of the selected environment',
              },
              {
                stepId: environmentNavigationDefinition.identity.id,
                version: environmentNavigationDefinition.identity.version,
                inputs: {},
                description: 'the user navigates to the base url of the selected environment',
              },
              {
                stepId: stringInputDefinition.identity.id,
                version: stringInputDefinition.identity.version,
                inputs: { expected: 'AppraiseJS' },
                description: 'the page title is AppraiseJS',
              },
            ],
          },
        ],
      }),
    ).resolves.toMatchObject({ ready: true })
    expect(resolveTargetProject).toHaveBeenCalledTimes(2)
  })

  it('guards prepare with the exact versioned existing-environment preflight token before durable preparation', async () => {
    reset()
    const preflight = await preflightQualityAssessmentRun({
      target: input.target,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedDesignHash: input.expectedDesignHash,
      validationBindings: input.validationBindings,
      environment: input.environment,
      subject: input.subject,
      runtime: {},
    })
    reset()

    await expect(
      prepareQualityAssessmentRun({
        ...input,
        expectedPreflight: preflight.expectedPreflight,
      }),
    ).resolves.toMatchObject({
      phase: 'STARTED',
      preflight: { algorithmVersion: preflight.algorithmVersion, preflightHash: preflight.preflightHash },
    })
    reset()
    await expect(
      prepareQualityAssessmentRun({
        ...input,
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: `sha256:${'0'.repeat(64)}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'preflight_stale' } })
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
  })

  it('rejects duplicate compact validation and locator identities before keyed resolution', async () => {
    reset()
    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: [...input.validationBindings, structuredClone(input.validationBindings[0]!)],
        environment: input.environment,
        subject: input.subject,
        runtime: {},
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'duplicate_validation_binding' } })
    expect(database.stepDefinition.findMany).not.toHaveBeenCalled()

    reset()
    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: [{ ...input.validationBindings[0]!, locatorIds: ['locator-1', 'locator-1'] }],
        environment: input.environment,
        subject: input.subject,
        runtime: {},
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', details: { code: 'duplicate_locator_id' } })
    expect(database.locator.findMany).not.toHaveBeenCalled()
  })

  it('rejects an unverifiable active generation instead of consulting legacy realization summaries', async () => {
    reset()
    vi.mocked(readQualityRequirementGraph).mockResolvedValue({
      ...graph,
      revision: { status: 'REALIZED' },
      validationVersions: [
        {
          ...graph.validationVersions[0]!,
          status: 'PUBLISHED',
          realizationHash: `sha256:${'9'.repeat(64)}`,
          realization: { runtimePublication: { idempotencyKey: 'old', runtimeInput: { astId: 'different' } } },
          activeGeneration: { canonicalRealizationJson: 'not-json' },
        },
      ],
    } as never)

    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: input.validationBindings,
        environment: input.environment,
        subject: input.subject,
        runtime: {},
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'active_generation_unverifiable' } })
  })

  it('accepts compiler-derived ast provenance for matching compact intent but still rejects a changed intent', async () => {
    reset()
    await prepareQualityAssessmentRun(input)
    const persistedRealization = structuredClone(
      (
        vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
          realization: { validations: Array<{ realization: Record<string, unknown> }> }
        }
      ).realization.validations[0]!.realization,
    ) as {
      runtimePublication: {
        projection: { validationNode: { astProvenance?: unknown } }
        validationProjection: { validations: Array<{ astProvenance?: unknown }> }
      }
    }
    const provenance = {
      schemaVersion: '2',
      astHash: graph.validationVersions[0]!.canonicalHash,
      executionAuthority: 'reviewed_publication',
      publishOperationId: 'astpub_compiler-derived',
      receiptHash: `sha256:${'9'.repeat(64)}`,
      runtimeInputHash: `sha256:${'8'.repeat(64)}`,
    }
    persistedRealization.runtimePublication.projection.validationNode.astProvenance = provenance
    persistedRealization.runtimePublication.validationProjection.validations[0]!.astProvenance = provenance

    reset()
    vi.mocked(readQualityRequirementGraph).mockResolvedValue({
      ...graph,
      revision: { status: 'REALIZED' },
      validationVersions: [
        {
          ...graph.validationVersions[0]!,
          status: 'PUBLISHED',
          realizationHash: `sha256:${'9'.repeat(64)}`,
          realization: persistedRealization,
          activeGeneration: { canonicalRealizationJson: JSON.stringify(persistedRealization.runtimePublication) },
        },
      ],
    } as never)

    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: input.validationBindings,
        environment: input.environment,
        subject: input.subject,
        runtime: {},
      }),
    ).resolves.toMatchObject({ ready: true })

    await expect(
      preflightQualityAssessmentRun({
        target: input.target,
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        validationBindings: [
          {
            ...input.validationBindings[0]!,
            steps: [{ ...input.validationBindings[0]!.steps[0]!, description: 'a changed compact intent' }],
          },
        ],
        environment: input.environment,
        subject: input.subject,
        runtime: {},
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'active_generation_conflict' } })
  })

  it('checkpoints a complete preparation and replays the completed receipt without mutations', async () => {
    reset()
    const result = await prepareQualityAssessmentRun(input)

    expect(result).toMatchObject({
      phase: 'STARTED',
      preflight: {
        ready: true,
        validationCount: 1,
        stepReferenceCount: 2,
        locatorReferenceCount: 0,
        stepReferenceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        locatorReferenceHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      environment: { id: 'env-1' },
      assessment: { id: 'assessment-1' },
      assessmentRun: { id: 'run-1' },
      hashes: { compilationHash: `sha256:${'f'.repeat(64)}` },
    })
    const compileInput = vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
      realization: {
        validations: {
          realization: {
            runtimePublication: {
              runtimeInput: {
                matrix: unknown
                stepDefinitions: unknown
                locatorBindings: unknown
                expected: { scenarios: unknown[] }
              }
            }
          }
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
        definitionHash: computeStepReferenceHash(definition),
      },
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionHash: computeStepReferenceHash(environmentNavigationDefinition),
      },
    ])
    expect(
      compileInput.realization.validations[0]?.realization.runtimePublication.runtimeInput.locatorBindings,
    ).toEqual([])
    expect(
      compileInput.realization.validations[0]?.realization.runtimePublication.runtimeInput.expected.scenarios[0],
    ).toMatchObject({
      caseId: expect.stringMatching(/^quality-case-[A-Za-z0-9_-]+$/),
    })
    const replay = await prepareQualityAssessmentRun(input)
    expect(replay).toMatchObject({ unchanged: true, phase: 'STARTED', preparationId: 'preparation-1' })
    expect(compileQualityValidations).toHaveBeenCalledTimes(1)
  })

  it('replays a completed preflight identity only from its immutable receipt without mutations', async () => {
    reset()
    const completed = await prepareQualityAssessmentRun(input)
    const completedPreflight = completed.preflight as {
      algorithmVersion: 'appraise.quality-assessment-preflight/v2'
      preflightHash: string
    }
    const expectedPreflight = {
      algorithmVersion: completedPreflight.algorithmVersion,
      preflightHash: completedPreflight.preflightHash,
    }
    const assertNoReplayWork = () => {
      expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
      expect(getEnvironmentByIdOrThrow).not.toHaveBeenCalled()
      expect(ensureEnvironment).not.toHaveBeenCalled()
      expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
      expect(database.assessmentPreparation.update).not.toHaveBeenCalled()
      expect(compileQualityValidations).not.toHaveBeenCalled()
      expect(publishQualityValidations).not.toHaveBeenCalled()
      expect(createQualityAssessment).not.toHaveBeenCalled()
      expect(runQualityAssessment).not.toHaveBeenCalled()
    }

    vi.clearAllMocks()
    await expect(prepareQualityAssessmentRun({ ...input, expectedPreflight })).resolves.toMatchObject({
      unchanged: true,
      phase: 'STARTED',
    })
    assertNoReplayWork()

    vi.clearAllMocks()
    await expect(
      prepareQualityAssessmentRun({
        ...input,
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: `sha256:${'0'.repeat(64)}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'preflight_stale' } })
    assertNoReplayWork()

    preparation.receiptJson = JSON.stringify({ preflight: { ready: true } })
    vi.clearAllMocks()
    await expect(prepareQualityAssessmentRun({ ...input, expectedPreflight })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'preflight_stale' },
    })
    assertNoReplayWork()
  })

  it('guards a completion observed after the outer replay lookup before readiness work', async () => {
    reset()
    const completed = await prepareQualityAssessmentRun(input)
    const completedPreflight = completed.preflight as {
      algorithmVersion: 'appraise.quality-assessment-preflight/v2'
      preflightHash: string
    }
    const expectedPreflight = {
      algorithmVersion: completedPreflight.algorithmVersion,
      preflightHash: completedPreflight.preflightHash,
    }

    vi.clearAllMocks()
    database.assessmentPreparation.findUnique.mockResolvedValueOnce(null)
    await expect(prepareQualityAssessmentRun({ ...input, expectedPreflight })).resolves.toMatchObject({
      unchanged: true,
      phase: 'STARTED',
    })
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(getEnvironmentByIdOrThrow).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.update).not.toHaveBeenCalled()

    vi.clearAllMocks()
    database.assessmentPreparation.findUnique.mockResolvedValueOnce(null)
    await expect(
      prepareQualityAssessmentRun({
        ...input,
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: `sha256:${'0'.repeat(64)}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'preflight_stale' } })
    expect(ensureBuiltInStepDefinitionReadiness).not.toHaveBeenCalled()
    expect(getEnvironmentByIdOrThrow).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(database.assessmentPreparation.update).not.toHaveBeenCalled()
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
                id: environmentNavigationDefinition.identity.id,
                version: environmentNavigationDefinition.identity.version,
                definitionJson: JSON.stringify(environmentNavigationDefinition),
              },
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

  it('preserves deferred environment references for runtime type validation', async () => {
    reset()
    const fillDefinition = builtInStepDefinitions.find(candidate => candidate.identity.id === 'browser.forms.fill')!
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionJson: JSON.stringify(environmentNavigationDefinition),
      },
      {
        id: fillDefinition.identity.id,
        version: fillDefinition.identity.version,
        definitionJson: JSON.stringify(fillDefinition),
      },
    ] as never)
    vi.mocked(database.locator.findMany).mockResolvedValue([
      {
        id: 'locator-1',
        targetProjectId: 'target-1',
        name: 'password',
        value: 'input[name="password"]',
        locatorGroupId: 'group-1',
        locatorGroup: {
          id: 'group-1',
          name: 'Login',
          route: '/login',
          moduleId: 'module-1',
          targetProjectId: 'target-1',
          module: { targetProjectId: 'target-1' },
        },
      },
    ] as never)
    const environmentReference = { ref: 'environment', key: 'password' }

    await prepareQualityAssessmentRun({
      ...input,
      validationBindings: [
        {
          validationId: 'validation-1',
          locatorIds: ['locator-1'],
          steps: [
            {
              stepId: environmentNavigationDefinition.identity.id,
              version: environmentNavigationDefinition.identity.version,
              inputs: {},
              description: 'the user navigates to the base url of the selected environment',
            },
            {
              stepId: fillDefinition.identity.id,
              version: fillDefinition.identity.version,
              inputs: {
                target: { ref: 'locator', id: 'locator-1', version: '1' },
                value: environmentReference,
              },
              keyword: 'When' as const,
              description: 'the user enters the configured password',
            },
          ],
        },
      ],
    })

    const realization = (
      vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
        realization: {
          validations: Array<{
            realization: {
              runtimePublication: {
                runtimeInput: { rootInvocations: Array<{ invocation: { inputs: Record<string, unknown> } }> }
              }
            }
          }>
        }
      }
    ).realization.validations[0]!.realization.runtimePublication

    expect(realization.runtimeInput.rootInvocations[1]!.invocation.inputs.value).toEqual(environmentReference)
  })

  it('derives sealed locator descriptors from target-owned locator records', async () => {
    reset()
    vi.mocked(database.locator.findMany).mockResolvedValue([
      {
        id: 'locator-1',
        targetProjectId: 'target-1',
        name: 'submit',
        value: '[data-testid="submit"]',
        locatorGroupId: 'group-1',
        locatorGroup: {
          id: 'group-1',
          name: 'Checkout',
          route: '/checkout',
          moduleId: 'module-1',
          targetProjectId: 'target-1',
          module: { targetProjectId: 'target-1' },
        },
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

  it('carries canonical locator cardinality into immutable runtime inputs without opening a browser', async () => {
    reset()
    const locatorDefinition = builtInStepDefinitions.find(candidate =>
      candidate.inputs.some(input => input.type === 'locator'),
    )!
    const locatorInputName = locatorDefinition.inputs.find(input => input.type === 'locator')!.name
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: environmentNavigationDefinition.identity.id,
        version: environmentNavigationDefinition.identity.version,
        definitionJson: JSON.stringify(environmentNavigationDefinition),
      },
      {
        id: locatorDefinition.identity.id,
        version: locatorDefinition.identity.version,
        definitionJson: JSON.stringify(locatorDefinition),
      },
    ] as never)
    const cardinalityInput = {
      ...input,
      validationBindings: [
        {
          validationId: 'validation-1',
          steps: [
            {
              stepId: environmentNavigationDefinition.identity.id,
              version: environmentNavigationDefinition.identity.version,
              inputs: {},
              description: 'the user navigates to the base url of the selected environment',
            },
            {
              stepId: locatorDefinition.identity.id,
              version: locatorDefinition.identity.version,
              inputs: Object.fromEntries(
                locatorDefinition.inputs
                  .filter(item => item.required)
                  .map(item => [item.name, item.type === 'boolean' ? true : item.type === 'number' ? 1 : 'locator-1']),
              ),
              description: 'the locator is ready',
            },
          ],
          locatorIds: [],
        },
      ],
    }

    await prepareQualityAssessmentRun(cardinalityInput)
    const runtimeInput = (
      vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
        realization: {
          validations: Array<{
            realization: { runtimePublication: { runtimeInput: { locatorBindings: unknown } } }
          }>
        }
      }
    ).realization.validations[0]!.realization.runtimePublication.runtimeInput

    expect(runtimeInput.locatorBindings).toEqual([
      {
        caseId: 'quality-case-validation-1',
        stepId: 'quality-case-validation-1-step-2',
        inputName: locatorInputName,
        cardinality: 'exactlyOne',
      },
    ])
    expect(ensureEnvironment).toHaveBeenCalledTimes(1)
  })

  it('preserves locator-bearing reviewed compositions and leaves cardinality enforcement to child operations', async () => {
    reset()
    const child = builtInStepDefinitions.find(candidate => candidate.inputs.some(input => input.type === 'locator'))!
    const composition = {
      ...child,
      identity: { ...child.identity, id: 'appraise.test.locator-composition' },
      execution: {
        kind: 'composition' as const,
        steps: [
          {
            step: {
              id: child.identity.id,
              version: child.identity.version,
              definitionHash: computeStepReferenceHash(child),
            },
            inputs: Object.fromEntries(child.inputs.map(item => [item.name, { input: item.name }])),
          },
        ],
      },
    }
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: composition.identity.id,
        version: composition.identity.version,
        definitionJson: JSON.stringify(composition),
      },
    ] as never)
    const compositionInput = {
      ...input,
      validationBindings: [
        {
          validationId: 'validation-1',
          steps: [
            {
              stepId: composition.identity.id,
              version: composition.identity.version,
              inputs: Object.fromEntries(
                composition.inputs
                  .filter(item => item.required)
                  .map(item => [item.name, item.type === 'boolean' ? true : item.type === 'number' ? 1 : 'locator-1']),
              ),
              description: 'the composed locator operation is ready',
            },
          ],
          locatorIds: [],
        },
      ],
    }

    await expect(prepareQualityAssessmentRun(compositionInput)).resolves.toMatchObject({ phase: 'STARTED' })
    const runtimeInput = (
      vi.mocked(compileQualityValidations).mock.calls[0]?.[0] as {
        realization: {
          validations: Array<{
            realization: {
              runtimePublication: {
                runtimeInput: { locatorBindings: unknown[]; operationCardinalities: unknown[] }
              }
            }
          }>
        }
      }
    ).realization.validations[0]!.realization.runtimePublication.runtimeInput
    expect(runtimeInput.locatorBindings).toEqual([])
    expect(runtimeInput.operationCardinalities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: `${child.execution.kind === 'operation' ? child.execution.handlerId : ''}@${child.execution.kind === 'operation' ? child.execution.handlerVersion : ''}`,
          cardinality: expect.stringMatching(/^(exactlyOne|collection)$/),
        }),
      ]),
    )
  })

  it('rejects missing canonical locator cardinality before any browser-facing phase', async () => {
    reset()
    const locatorDefinition = builtInStepDefinitions.find(candidate =>
      candidate.inputs.some(input => input.type === 'locator'),
    )!
    const locatorInputName = locatorDefinition.inputs.find(input => input.type === 'locator')!.name
    vi.mocked(database.stepDefinition.findMany).mockResolvedValue([
      {
        id: locatorDefinition.identity.id,
        version: locatorDefinition.identity.version,
        definitionJson: JSON.stringify(locatorDefinition),
      },
    ] as never)
    const read = vi
      .spyOn(defaultOperationRegistry, 'read')
      .mockReturnValueOnce([{ inputs: [{ name: locatorInputName, type: 'locator' }] }] as never)
    const locatorInput = {
      ...input,
      validationBindings: [
        {
          ...input.validationBindings[0]!,
          steps: [
            {
              stepId: locatorDefinition.identity.id,
              version: locatorDefinition.identity.version,
              inputs: Object.fromEntries(
                locatorDefinition.inputs
                  .filter(item => item.required)
                  .map(item => [item.name, item.type === 'boolean' ? true : item.type === 'number' ? 1 : 'locator-1']),
              ),
              description: 'the locator is ready',
            },
          ],
        },
      ],
    }

    try {
      await expect(prepareQualityAssessmentRun(locatorInput)).rejects.toMatchObject({ code: 'VALIDATION' })
      expect(ensureEnvironment).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  it('rejects unresolved bindings before creating durable preparation state', async () => {
    reset()
    const unresolvedInput = {
      ...input,
      validationBindings: [{ ...input.validationBindings[0]!, locatorIds: ['missing-locator'] }],
    }

    await expect(prepareQualityAssessmentRun(unresolvedInput)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(database.assessmentPreparation.upsert).not.toHaveBeenCalled()
    expect(ensureEnvironment).not.toHaveBeenCalled()
    expect(compileQualityValidations).not.toHaveBeenCalled()
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
        activeGeneration?: {
          id: string
          publicationId: string
          operationHash: string
          runtimeInputHash: string
          realizationHash: string
          canonicalRealizationJson: string
          preflightAlgorithmVersion: string
          preflightAuthority: string
          disposition: string
        }
        realization?: unknown
        design: { title: string; behavior: string }
      }>
    }
    vi.mocked(readQualityRequirementGraph).mockImplementation(async () => committed as never)
    vi.mocked(compileQualityValidations).mockImplementationOnce(async request => {
      committed.validationVersions[0] = {
        ...committed.validationVersions[0]!,
        status: 'REALIZED',
        realizationHash: `sha256:${'9'.repeat(64)}`,
        activeGeneration: {
          id: 'generation-validation-1',
          publicationId: 'publication-validation-1',
          operationHash: `sha256:${'p'.repeat(64)}`,
          runtimeInputHash: `sha256:${'r'.repeat(64)}`,
          realizationHash: `sha256:${'9'.repeat(64)}`,
          canonicalRealizationJson: JSON.stringify(
            (request.realization as { validations: Array<{ realization: { runtimePublication: unknown } }> })
              .validations[0]!.realization.runtimePublication,
          ),
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightAuthority: 'appraisejs:quality-validation-publication:v2',
          disposition: 'ACTIVE',
        },
        realization: (request.realization as { validations: Array<{ realization: unknown }> }).validations[0]!
          .realization,
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
        activeGeneration?: {
          id: string
          publicationId: string
          operationHash: string
          runtimeInputHash: string
          realizationHash: string
          preflightAlgorithmVersion: string
          preflightAuthority: string
          disposition: string
        }
        design: { title: string; behavior: string }
      }>
    }
    vi.mocked(readQualityRequirementGraph).mockImplementation(async () => committed as never)
    vi.mocked(publishQualityValidations).mockImplementationOnce(async () => {
      committed.validationVersions[0] = {
        ...committed.validationVersions[0]!,
        status: 'PUBLISHED',
        realizationHash: `sha256:${'8'.repeat(64)}`,
        activeGeneration: {
          id: 'generation-validation-1',
          publicationId: 'publication-validation-1',
          operationHash: `sha256:${'p'.repeat(64)}`,
          runtimeInputHash: `sha256:${'r'.repeat(64)}`,
          realizationHash: `sha256:${'8'.repeat(64)}`,
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightAuthority: 'appraisejs:quality-validation-publication:v2',
          disposition: 'ACTIVE',
        },
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

  it('persists and replays only the bounded authorization handoff for a committed execution request', async () => {
    reset()
    const executionRequestId = '5a9fb98f-8912-44a9-b843-30fb19dd6129'
    const expectedRequestHash = `sha256:${'e'.repeat(64)}`
    const expiresAt = '2026-08-24T12:00:00.000Z'
    vi.mocked(runQualityAssessment).mockRejectedValue(
      new ServiceError('AUTHORIZATION_REQUIRED', 'UNAUTHORIZED', 403, {
        requestId: executionRequestId,
        requestHash: expectedRequestHash,
        expiresAt,
        password: 'must-not-persist',
        passwordEnvironmentVariable: 'APPRAISE_ENV_PASSWORD',
        authorization: { grant: 'must-not-persist' },
      }),
    )

    const first = await prepareQualityAssessmentRun(input)
    const expectedAuthorization = {
      executionRequestId,
      expectedRequestHash,
      expiresAt,
      authorizationRequestCreated: true,
      nextAction: {
        tool: 'assessment_prepare_run',
        reason:
          'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
      },
    }
    expect(first).toMatchObject({
      phase: 'ASSESSMENT',
      durableState: 'authorization_request_committed',
      authorization: expectedAuthorization,
      retry: { classification: 'authorization_required', safe: true },
      nextRecommendedAction: 'assessment_prepare_run',
      nextRequiredAgentBehavior: 'replay_same_idempotency_key_to_resume',
    })
    expect(JSON.parse(preparation.failureJson!)).toEqual({
      message: 'AUTHORIZATION_REQUIRED',
      classification: 'authorization_required',
      authorization: expectedAuthorization,
    })
    expect(preparation.failureJson).not.toContain('must-not-persist')
    expect(preparation.failureJson).not.toContain('APPRAISE_ENV_PASSWORD')

    const replay = await prepareQualityAssessmentRun(input)

    expect(replay).toMatchObject({
      preparationId: first.preparationId,
      durableState: 'authorization_request_committed',
      authorization: expectedAuthorization,
      retry: { classification: 'authorization_required', safe: true },
    })
    expect(runQualityAssessment).toHaveBeenCalledTimes(2)
    expect(createQualityAssessment).toHaveBeenCalledTimes(1)
    expect(publishQualityValidations).toHaveBeenCalledTimes(1)
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

  it('preserves successor guidance after terminal capsule-start failure as immutable idempotency history', async () => {
    reset()
    vi.mocked(runQualityAssessment).mockRejectedValue(
      new ServiceError(
        'Assessment execution has terminal TestRun history after recovery reconciliation failed; resubmit with a fresh key.',
        'CONFLICT',
        409,
        { code: 'assessment_execution_terminal' },
      ),
    )

    const first = await prepareQualityAssessmentRun(input)

    expect(first).toMatchObject({
      phase: 'ASSESSMENT',
      retry: { classification: 'terminal_execution_failure', safe: false },
      nextRecommendedAction: 'assessment_create_successor',
      nextRequiredAgentBehavior: 'create_successor_then_prepare_with_a_new_idempotency_key',
    })
    expect(canonicalMcpToolNames).toContain(first.nextRecommendedAction)

    const replay = await prepareQualityAssessmentRun(input)

    expect(replay).toMatchObject({
      unchanged: true,
      phase: 'ASSESSMENT',
      retry: { classification: 'terminal_execution_failure', safe: false },
      nextRecommendedAction: 'assessment_create_successor',
    })
    expect(runQualityAssessment).toHaveBeenCalledTimes(1)
    expect(compileQualityValidations).toHaveBeenCalledTimes(1)
    expect(publishQualityValidations).toHaveBeenCalledTimes(1)
    expect(createQualityAssessment).toHaveBeenCalledTimes(1)

    expect(runQualityAssessment).toHaveBeenCalledTimes(1)
  })

  it('preserves an execution reservation conflict through the preparation receipt and directs reconciliation', async () => {
    reset()
    vi.mocked(runQualityAssessment).mockRejectedValueOnce(
      new ServiceError('Assessment execution is already reserved by an active run.', 'CONFLICT', 409, {
        code: 'assessment_execution_reserved',
      }),
    )

    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({
      phase: 'ASSESSMENT',
      retry: { classification: 'execution_reserved', safe: false },
      nextRecommendedAction: 'assessment_reconcile',
      nextRequiredAgentBehavior: 'wait_for_active_assessment_execution_then_reconcile',
    })
  })

  it('keeps a pre-binding runtime outage resumable by the same preparation key', async () => {
    reset()
    vi.mocked(runQualityAssessment).mockRejectedValueOnce(new Error('pre-binding runtime outage'))

    await expect(prepareQualityAssessmentRun(input)).resolves.toMatchObject({
      phase: 'ASSESSMENT',
      retry: { classification: 'infrastructure_failure', safe: true },
      nextRecommendedAction: 'assessment_prepare_run',
      nextRequiredAgentBehavior: 'replay_same_idempotency_key_to_resume',
    })
  })
})
