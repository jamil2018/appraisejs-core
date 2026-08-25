import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'
import { canonicalFrozenRemoteEnvironmentPacket } from '@/lib/quality-design/frozen-environment-snapshot'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  parseCanonicalRuntimeCapsuleManifest,
} from '@/lib/runtime-capsule/contracts'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const { database } = vi.hoisted(() => ({
  database: {
    assessment: { findUniqueOrThrow: vi.fn() },
    validationVersion: { findMany: vi.fn() },
    evaluationSubjectRevision: { upsert: vi.fn() },
    assessmentRun: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: vi.fn(async () => ({ id: 'target-1', kind: 'REMOTE_BLACK_BOX' })),
}))

import {
  deriveExecutionEffects,
  derivedAssessmentCells,
  runQualityAssessment,
  reconcileQualityAssessment,
  reserveReadyAssessmentForTests,
  setAssessmentCredentialAuthorizationServiceForTests,
  setAssessmentExecutionClientForTests,
  setAssessmentRuntimeServiceFactoryForTests,
  setRemoteScopeCurrentAssertionForTests,
  stopQualityAssessment,
} from './assessment-execution-service'

function executableGeneration(publication: Record<string, unknown>, remote = false) {
  return {
    id: 'generation-1',
    generationKey: `sha256:${'1'.repeat(64)}`,
    disposition: 'ACTIVE',
    preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
    preflightAuthority: remote
      ? 'appraisejs:remote-evaluation-scope:v2'
      : 'appraisejs:quality-validation-publication:v2',
    assuranceLevel: 'STANDARD',
    publication: {
      id: 'publication-1',
      generationId: 'generation-1',
      operationHash: `sha256:${'2'.repeat(64)}`,
      phase: 'review_ready',
      preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightDisposition: 'ACTIVE',
      preflightAuthority: remote
        ? 'appraisejs:remote-evaluation-scope:v2'
        : 'appraisejs:quality-validation-publication:v2',
      ...publication,
    },
  }
}

function publishedValidation(runtimeInputJson: string, remote = false) {
  return {
    id: 'validation-1',
    status: 'PUBLISHED',
    activeGeneration: executableGeneration({ runtimeInputHash: 'sha256:runtime', runtimeInputJson }, remote),
  }
}

const managedValidationProjectionJson = canonicalContractJson({
  validations: [
    {
      id: 'validation-1',
      testCaseIds: ['case-1'],
      appraiseArtifacts: {
        testCases: [{ id: 'case-1', title: 'Fixture case', description: 'Fixture', steps: [] }],
        testSuites: [{ id: 'suite-1', name: 'Fixture suite', moduleId: 'module-1', testCaseIds: ['case-1'] }],
      },
      matrix: [{ browser: 'chromium', environment: 'env-1' }],
    },
  ],
})
const managedRuntimeInputJson = canonicalContractJson({
  astId: 'validation-1',
  expected: { scenarioCount: 1, scenarios: [{ scenarioId: 'scenario-1', caseId: 'case-1', stepIds: ['step-1'] }] },
})

function currentManagedBinding(assuranceLevel = 'STANDARD') {
  return {
    runtimeInputHash: `sha256:${'b'.repeat(64)}`,
    generationId: 'generation-1',
    publicationId: 'publication-1',
    publicationOperationHash: `sha256:${'2'.repeat(64)}`,
    generation: { id: 'generation-1', generationKey: `sha256:${'1'.repeat(64)}`, assuranceLevel },
    publication: {
      id: 'publication-1',
      generationId: 'generation-1',
      operationHash: `sha256:${'2'.repeat(64)}`,
      validationVersionId: 'validation-1',
      runtimeInputHash: `sha256:${'b'.repeat(64)}`,
      // Reconciliation validates expected-case tuples against immutable
      // publication bytes, not the caller fixture's incidental input.
      runtimeInputJson: managedRuntimeInputJson,
      validationHash: `sha256:${'a'.repeat(64)}`,
      validationContent: '{"data":"fixture"}',
      astId: 'validation-1',
      projectionHash: `sha256:${'e'.repeat(64)}`,
      receiptHash: `sha256:${'f'.repeat(64)}`,
      validationProjectionJson: managedValidationProjectionJson,
    },
  }
}

/** Shared valid managed-capsule fixture. Keep it real rather than using `{}`
 * so reconciliation tests exercise canonical manifest and tuple authority. */
function managedCapsuleForTest(input: {
  testRunId: string
  runId: string
  binding: ReturnType<typeof currentManagedBinding>
}) {
  const definition = builtInStepDefinitions[0]!
  const hashes = computeStepDefinitionHashes(definition)
  const step = {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  }
  const publication = input.binding.publication
  const manifest = {
    schemaVersion: '2' as const,
    projectId: 'target-1',
    validationHash: publication.validationHash,
    runId: input.runId,
    operationHash: publication.operationHash,
    projectionHash: publication.projectionHash,
    receiptHash: publication.receiptHash,
    runtimeInputHash: publication.runtimeInputHash,
    source: {
      kind: 'PUBLISHED_VALIDATION' as const,
      sourceHash: publication.validationHash,
      publishOperationId: publication.id,
      generationId: input.binding.generationId,
      generationKey: `sha256:${'1'.repeat(64)}`,
    },
    commandReceipt: { path: 'command-receipt.json', hash: `sha256:${'c'.repeat(64)}` },
    generator: { id: 'appraise.validation-ast-capsule' as const, version: '2' as const },
    expectedCases: [
      { validationId: publication.astId, suiteId: 'suite-1', caseId: 'case-1', scenarioId: 'scenario-1' },
    ],
    rootInvocations: [{ step, inputs: {} }],
    stepDefinitions: [
      {
        step,
        definition,
        definitionHash: hashes.definitionHash,
        humanProjectionHash: hashes.humanProjectionHash,
        agentContractHash: hashes.agentContractHash,
        executionHash: hashes.executionHash,
        publicationReceiptHash: `sha256:${'d'.repeat(64)}`,
      },
    ],
    extensions: [],
    files: [
      {
        path: 'command-receipt.json',
        role: 'command-receipt' as const,
        hash: `sha256:${'c'.repeat(64)}`,
        size: 1,
      },
    ],
  }
  const manifestHash = hashRuntimeCapsuleValue(manifest)
  return {
    integrityState: 'ready',
    targetProjectId: 'target-1',
    testRunId: input.testRunId,
    validationHash: publication.validationHash,
    qualityPublicationId: publication.id,
    manifestJson: canonicalRuntimeCapsuleJson(manifest),
    manifestHash,
    capsuleHash: hashRuntimeCapsuleValue({ ...manifest, manifestHash }),
  }
}

type MutableCapsuleManifest = {
  projectId: string
  runId: string
  validationHash: string
  operationHash: string
  projectionHash: string
  receiptHash: string
  runtimeInputHash: string
  source: {
    kind: 'PUBLISHED_VALIDATION' | 'AUTHORED_TEST_SNAPSHOT'
    sourceHash: string
    publishOperationId: string
    generationId: string
    generationKey: string
  }
  expectedCases: Array<{ validationId: string; suiteId: string; caseId: string; scenarioId: string }>
}

type MutableCapsule = ReturnType<typeof managedCapsuleForTest>
type MutableBinding = Record<string, unknown> & {
  generationId: string
  publicationOperationHash: string
}
type CapsuleMismatchFixture = {
  binding: MutableBinding
  capsule: MutableCapsule
  manifest: MutableCapsuleManifest
}

describe('assessment execution guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setAssessmentExecutionClientForTests()
    setAssessmentCredentialAuthorizationServiceForTests()
    setAssessmentRuntimeServiceFactoryForTests()
    setRemoteScopeCurrentAssertionForTests()
  })

  it('derives omitted runtime cells from the immutable published matrix', () => {
    expect(
      derivedAssessmentCells({ assessmentId: 'assessment-1', idempotencyKey: 'run-1' }, {
        versions: [
          {
            id: 'validation-1',
            activeGeneration: executableGeneration({
              runtimeInputJson: JSON.stringify({
                matrix: [
                  { browser: 'chromium', environment: 'env-1' },
                  { browser: 'firefox', environment: 'env-2' },
                ],
              }),
            }),
          },
        ],
      } as never),
    ).toEqual([
      {
        validationVersionId: 'validation-1',
        resultMatrixCell: 'CHROMIUM:env-1',
        environmentId: 'env-1',
        browserEngine: 'CHROMIUM',
      },
      {
        validationVersionId: 'validation-1',
        resultMatrixCell: 'FIREFOX:env-2',
        environmentId: 'env-2',
        browserEngine: 'FIREFOX',
      },
    ])
  })

  it('hard-gates an unclassified runtime operation even when callers omit risk declarations', () => {
    const effects = deriveExecutionEffects(
      {
        versions: [
          {
            id: 'validation-1',
            activeGeneration: executableGeneration({
              runtimeInputHash: 'sha256:runtime',
              runtimeInputJson: JSON.stringify({ stepDefinitions: [{ id: 'operation-1' }] }),
            }),
          },
        ],
      } as never,
      [{ validationVersionId: 'validation-1', resultMatrixCell: 'CHROMIUM:env-1', environmentId: 'env-1' }],
    )
    expect(effects).toEqual({
      riskClassification: 'MATERIAL_EFFECT',
      materialEffects: ['UNCLASSIFIED_OPERATION'],
    })
  })

  it('rejects an assessment with stale requirement alignment before runtime preparation', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({ status: 'READY', alignment: 'STALE' })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: { environmentId: 'env-1' },
      }),
    ).rejects.toThrow('current requirement alignment')
  })

  it('requires an existing assessment before runtime preparation', async () => {
    database.assessment.findUniqueOrThrow.mockRejectedValue(new Error('Assessment not found'))
    await expect(
      runQualityAssessment({
        assessmentId: 'missing-assessment',
        idempotencyKey: 'run-1',
        runtime: { environmentId: 'env-1' },
      }),
    ).rejects.toThrow('Assessment not found')
  })

  it('rejects a replay key whose AssessmentRun already has terminal history before it can prepare another binding', async () => {
    const prepareQuality = vi.fn()
    const assessment = {
      id: 'assessment-terminal-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] })),
        ],
      },
    }
    const cells = [
      {
        validationVersionId: 'validation-1',
        resultMatrixCell: 'CHROMIUM:environment-1',
        environmentId: 'environment-1',
        browserEngine: 'CHROMIUM',
      },
    ]
    const requestHash = `sha256:${createHash('sha256')
      .update(
        canonicalContractJson({
          assessmentId: assessment.id,
          targetProjectId: assessment.targetProjectId,
          qualityPlanRevisionId: assessment.qualityPlanRevisionId,
          evaluationSubjectRevisionId: assessment.evaluationSubjectRevisionId,
          cells,
          selections: [
            {
              validationVersionId: 'validation-1',
              generationId: 'generation-1',
              generationKey: `sha256:${'1'.repeat(64)}`,
              publicationId: 'publication-1',
              publicationOperationHash: `sha256:${'2'.repeat(64)}`,
              runtimeInputHash: 'sha256:runtime',
            },
          ],
        }),
      )
      .digest('hex')}`
    const terminalRun = {
      id: 'run-terminal-1',
      status: 'COMPLETED',
      requestHash,
      bindings: [
        {
          terminalizedAt: new Date(),
          evidenceReceiptId: null,
          testRun: { status: 'COMPLETED' },
        },
      ],
    }
    const transaction = {
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(terminalRun) },
    }
    setAssessmentCredentialAuthorizationServiceForTests({
      executionRequiresCredential: vi.fn().mockResolvedValue(false),
    } as never)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality, startQuality: vi.fn(), cancel: vi.fn() }))
    setAssessmentExecutionClientForTests({
      assessment: { findUniqueOrThrow: vi.fn().mockResolvedValue(assessment) },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(terminalRun) },
      $transaction: vi.fn(async callback => callback(transaction)),
    } as never)

    await expect(
      runQualityAssessment({ assessmentId: assessment.id, idempotencyKey: 'terminal-replay-key' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'assessment_execution_terminal' } })
    expect(prepareQuality).not.toHaveBeenCalled()
  })

  it('atomically reserves a READY Assessment so concurrent fresh keys cannot create parallel runs', async () => {
    let assessmentStatus = 'READY'
    const transaction = {
      assessment: {
        updateMany: vi.fn(async ({ where }: { where: { status?: string } }) => {
          if (where.status === 'READY' && assessmentStatus === 'READY') {
            assessmentStatus = 'RUNNING'
            return { count: 1 }
          }
          return { count: 0 }
        }),
        findUnique: vi.fn(async () => ({
          targetProjectId: 'target-1',
          qualityPlanRevisionId: 'revision-1',
          evaluationSubjectRevisionId: 'subject-1',
          status: assessmentStatus,
        })),
      },
    }
    const identity = {
      assessmentId: 'assessment-reservation-1',
      targetProjectId: 'target-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
    }

    const [winner, loser] = await Promise.allSettled([
      reserveReadyAssessmentForTests(transaction as never, identity as never),
      reserveReadyAssessmentForTests(transaction as never, identity as never),
    ])

    expect([winner, loser].filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = [winner, loser].find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({
      reason: { code: 'CONFLICT', details: { code: 'assessment_execution_reserved' } },
    })
    expect(transaction.assessment.updateMany).toHaveBeenCalledTimes(2)
    expect(assessmentStatus).toBe('RUNNING')
  })

  it('fails closed to fresh-key terminal guidance when reconciliation itself fails after terminal startup history', async () => {
    const assessment = {
      id: 'assessment-reconciliation-failure-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] })),
        ],
      },
    }
    const transaction = {
      assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      assessmentRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'run-reconciliation-failure-1',
          status: 'PREPARED',
          requestHash: 'sha256:request',
          bindings: [],
        }),
      },
    }
    setAssessmentCredentialAuthorizationServiceForTests({
      executionRequiresCredential: vi.fn().mockResolvedValue(false),
    } as never)
    setAssessmentExecutionClientForTests({
      assessment: { findUniqueOrThrow: vi.fn().mockResolvedValue(assessment) },
      assessmentRun: {
        findUnique: vi.fn().mockResolvedValue({
          bindings: [
            {
              terminalizedAt: new Date(),
              evidenceReceiptId: null,
              testRun: { status: 'COMPLETED' },
            },
          ],
        }),
        findUniqueOrThrow: vi.fn().mockRejectedValue(new Error('reconciliation query failed')),
      },
      assessmentRunBinding: { findMany: vi.fn().mockRejectedValue(new Error('materialization failed before retry')) },
      $transaction: vi.fn(async callback => callback(transaction)),
    } as never)

    await expect(
      runQualityAssessment({ assessmentId: assessment.id, idempotencyKey: 'reconciliation-failure-key' }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        code: 'assessment_execution_terminal',
        nextRecommendedAction: 'assessment_create_successor',
        nextRequiredAgentBehavior: 'create_successor_then_prepare_with_a_new_idempotency_key',
      },
    })
  })

  it('blocks a stale remote evaluation scope before managed runtime preparation or AssessmentRun mutation', async () => {
    const prepareQuality = vi.fn()
    const create = vi.fn()
    const scopeGuard = vi.fn(async () => {
      throw new Error('remote evaluation scope has drifted')
    })
    setRemoteScopeCurrentAssertionForTests(scopeGuard)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality, startQuality: vi.fn(), cancel: vi.fn() }))
    setAssessmentExecutionClientForTests({
      assessment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'assessment-remote-1',
          status: 'READY',
          alignment: 'CURRENT',
          targetProjectId: 'target-1',
          qualityPlanId: 'plan-1',
          qualityPlanRevisionId: 'revision-1',
          evaluationSubjectRevisionId: 'subject-remote-1',
          evaluationSubjectRevision: {
            subjectDigest: 'sha256:remote-scope',
            subjectKind: 'REMOTE_EVALUATION_SCOPE',
          },
          qualityPlanRevision: {
            validationVersions: [
              publishedValidation(
                JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] }),
                true,
              ),
            ],
          },
        }),
      },
      assessmentRun: { create },
    } as never)

    await expect(
      runQualityAssessment({ assessmentId: 'assessment-remote-1', idempotencyKey: 'remote-run-1' }),
    ).rejects.toThrow('remote evaluation scope has drifted')
    expect(scopeGuard).toHaveBeenCalledWith({
      subjectRevisionId: 'subject-remote-1',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
      environmentId: 'environment-1',
    })
    expect(create).not.toHaveBeenCalled()
    expect(prepareQuality).not.toHaveBeenCalled()
  })

  it('retains the deterministic managed remote runtime path after a current scope guard', async () => {
    const environmentSnapshot = {
      id: 'environment-1',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      updatedAt: '2026-08-22T00:00:00.000Z',
    }
    const scopeGuard = vi.fn(async () => ({
      binding: {
        targetProjectId: 'target-1',
        environmentId: 'environment-1',
        environmentSnapshotHash: hashCanonical(environmentSnapshot),
        environmentSnapshotJson: canonicalContractJson(environmentSnapshot),
        environmentUpdatedAt: new Date('2026-08-22T00:00:00.000Z'),
      },
    }))
    const prepareQuality = vi.fn(async () => {
      throw new Error('deterministic managed remote runtime fixture')
    })
    setRemoteScopeCurrentAssertionForTests(scopeGuard)
    setAssessmentCredentialAuthorizationServiceForTests({
      executionRequiresCredential: vi.fn().mockResolvedValue(false),
    } as never)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality, startQuality: vi.fn(), cancel: vi.fn() }))
    const run = { id: 'assessment-run-remote-1', status: 'PREPARED', requestHash: 'sha256:request', bindings: [] }
    const assessment = {
      id: 'assessment-remote-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-remote-1',
      evaluationSubjectRevision: { subjectDigest: 'sha256:remote-scope', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(
            JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] }),
            true,
          ),
        ],
      },
    }
    let createdConsent: Record<string, unknown> | undefined
    const transaction = {
      assessment: {
        findUnique: vi.fn().mockResolvedValue(assessment),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(run) },
      assessmentRunPublicationCheckpoint: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      executionConsent: {
        create: vi.fn(async ({ data }) => {
          createdConsent = data
          return { id: 'consent-remote-1', ...data }
        }),
        findUnique: vi.fn(() => ({ id: 'consent-remote-1', ...createdConsent, expiresAt: null })),
        update: vi.fn(),
      },
      environment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'environment-1',
          targetProjectId: 'target-1',
          name: 'Sauce Demo',
          baseUrl: 'https://www.saucedemo.com',
          expectedPageTitle: null,
          apiBaseUrl: null,
          username: null,
          credentialState: 'NONE',
          passwordEnvironmentVariable: null,
          updatedAt: new Date('2026-08-22T00:00:00.000Z'),
        }),
      },
    }
    setAssessmentExecutionClientForTests({
      assessment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(assessment),
        findUnique: vi.fn().mockResolvedValue({ executionManifestHash: null, executionConsentSnapshotHash: null }),
      },
      targetProject: { findUnique: vi.fn().mockResolvedValue({ executionConsentMode: 'TRUSTED_AGENT' }) },
      executionConsent: { findUnique: vi.fn().mockResolvedValue(null) },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(null), findUniqueOrThrow: vi.fn().mockResolvedValue(run) },
      assessmentRunBinding: { findMany: vi.fn().mockResolvedValue([]) },
      assessmentRunPublicationCheckpoint: {
        findMany: vi.fn().mockResolvedValue([
          {
            validationVersionId: 'validation-1',
            generationId: 'generation-1',
            publicationId: 'publication-1',
            publicationOperationHash: `sha256:${'2'.repeat(64)}`,
            runtimeInputHash: 'sha256:runtime',
            publication: {
              id: 'publication-1',
              generationId: 'generation-1',
              operationHash: `sha256:${'2'.repeat(64)}`,
              validationVersionId: 'validation-1',
              runtimeInputHash: 'sha256:runtime',
              runtimeInputJson: JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] }),
              generation: { id: 'generation-1' },
            },
          },
        ]),
      },
      $transaction: vi.fn(async callback => callback(transaction)),
    } as never)

    await expect(
      runQualityAssessment({ assessmentId: 'assessment-remote-1', idempotencyKey: 'remote-runtime-1' }),
    ).rejects.toThrow('deterministic managed remote runtime fixture')
    expect(scopeGuard).toHaveBeenCalledTimes(2)
    expect(prepareQuality).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId: 'publication-1',
        environmentId: 'environment-1',
        environmentSnapshot: {
          hash: hashCanonical(environmentSnapshot),
          json: canonicalContractJson(environmentSnapshot),
          version: 1,
        },
      }),
    )
  })

  it('blocks a remote environment mutation after the initial scope guard and before AssessmentRun materialization', async () => {
    const frozenEnvironment = {
      id: 'environment-1',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      updatedAt: '2026-08-22T00:00:00.000Z',
    }
    const create = vi.fn()
    const prepareQuality = vi.fn()
    setRemoteScopeCurrentAssertionForTests(async (_input, transactionClient) => {
      if (transactionClient)
        throw new Error('remote scope environment has changed inside the AssessmentRun transaction')
      return {
        binding: {
          targetProjectId: 'target-1',
          environmentId: 'environment-1',
          environmentSnapshotHash: hashCanonical(frozenEnvironment),
          environmentSnapshotJson: canonicalContractJson(frozenEnvironment),
          environmentUpdatedAt: new Date(frozenEnvironment.updatedAt),
        },
      }
    })
    setAssessmentCredentialAuthorizationServiceForTests({
      executionRequiresCredential: vi.fn().mockResolvedValue(false),
    } as never)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality, startQuality: vi.fn(), cancel: vi.fn() }))
    const assessment = {
      id: 'assessment-remote-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-remote-1',
      evaluationSubjectRevision: { subjectDigest: 'sha256:remote-scope', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(
            JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'environment-1' }] }),
            true,
          ),
        ],
      },
    }
    const transaction = {
      assessment: { findUnique: vi.fn().mockResolvedValue(assessment), update: vi.fn() },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(null), create },
      executionConsent: { create: vi.fn().mockResolvedValue({ id: 'consent-remote-1', status: 'GRANTED' }) },
      environment: {
        // This is the second read, inside the transaction: it models a write
        // racing immediately after the initial scope-current assertion.
        findFirst: vi.fn().mockResolvedValue({
          ...frozenEnvironment,
          baseUrl: 'https://wrong-origin.example',
          updatedAt: new Date('2026-08-22T00:00:01.000Z'),
          targetProjectId: 'target-1',
        }),
      },
    }
    setAssessmentExecutionClientForTests({
      assessment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(assessment),
        findUnique: vi.fn().mockResolvedValue({ executionManifestHash: null, executionConsentSnapshotHash: null }),
      },
      targetProject: { findUnique: vi.fn().mockResolvedValue({ executionConsentMode: 'TRUSTED_AGENT' }) },
      executionConsent: { findUnique: vi.fn().mockResolvedValue(null) },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(null), findUniqueOrThrow: vi.fn() },
      assessmentRunBinding: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(async callback => callback(transaction)),
    } as never)

    const failure = await runQualityAssessment({
      assessmentId: 'assessment-remote-1',
      idempotencyKey: 'remote-toctou-1',
    }).catch(error => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('environment has changed')
    expect(create).not.toHaveBeenCalled()
    expect(prepareQuality).not.toHaveBeenCalled()
  })

  it('rejects partial explicit matrix coverage before creating an AssessmentRun', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({
      id: 'assessment-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(
            JSON.stringify({
              matrix: [
                { browser: 'chromium', environment: 'env-1' },
                { browser: 'firefox', environment: 'env-1' },
              ],
            }),
          ),
        ],
      },
    })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: {
          cells: [
            {
              validationVersionId: 'validation-1',
              resultMatrixCell: 'CHROMIUM:env-1',
              environmentId: 'env-1',
              browserEngine: 'CHROMIUM',
            },
          ],
        },
      }),
    ).rejects.toThrow('complete published validation matrix')
  })

  it('rejects a forged matrix label that differs from the executed browser', async () => {
    database.assessment.findUniqueOrThrow.mockResolvedValue({
      id: 'assessment-1',
      status: 'READY',
      alignment: 'CURRENT',
      targetProjectId: 'target-1',
      qualityPlanRevisionId: 'revision-1',
      evaluationSubjectRevisionId: 'subject-1',
      qualityPlanRevision: {
        validationVersions: [
          publishedValidation(JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'env-1' }] })),
        ],
      },
    })
    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: {
          cells: [
            {
              validationVersionId: 'validation-1',
              resultMatrixCell: 'CHROMIUM:env-1',
              environmentId: 'env-1',
              browserEngine: 'FIREFOX',
            },
          ],
        },
      }),
    ).rejects.toThrow('matrix identity')
  })

  it('denies credential execution before consuming a grant or preparing runtime work', async () => {
    const consumeCredentialExecutionGrant = vi.fn()
    const prepareQuality = vi.fn()
    setAssessmentCredentialAuthorizationServiceForTests({
      executionRequiresCredential: vi.fn().mockResolvedValue(true),
      credentialAuthorizationInput: vi.fn().mockReturnValue({ bindings: [{ reference: 'environment:password' }] }),
      ensureCredentialExecutionRequest: vi.fn().mockResolvedValue({
        id: 'authorization-request-1',
        requestHash: 'sha256:authorization',
        expiresAt: new Date(Date.now() + 60_000),
      }),
      consumeCredentialExecutionGrant,
    } as never)
    const transaction = {
      assessmentRun: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
    }
    setAssessmentExecutionClientForTests({
      assessment: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'assessment-1',
            status: 'READY',
            alignment: 'CURRENT',
            targetProjectId: 'target-1',
            qualityPlanRevisionId: 'revision-1',
            evaluationSubjectRevisionId: 'subject-1',
            evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
            qualityPlanRevision: {
              validationVersions: [
                publishedValidation(JSON.stringify({ matrix: [{ browser: 'chromium', environment: 'env-1' }] })),
              ],
            },
          })
          .mockResolvedValueOnce({ qualityPlanId: 'plan-1' }),
      },
      assessmentRun: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async callback => callback(transaction)),
    } as never)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality, startQuality: vi.fn(), cancel: vi.fn() }))

    await expect(
      runQualityAssessment({
        assessmentId: 'assessment-1',
        idempotencyKey: 'run-1',
        runtime: { environmentId: 'env-1' },
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'AUTHORIZATION_REQUIRED',
      details: {
        requestId: 'authorization-request-1',
        requestHash: 'sha256:authorization',
        authorization: {
          executionRequestId: 'authorization-request-1',
          expectedRequestHash: 'sha256:authorization',
          authorizationRequestCreated: true,
          nextAction: { tool: 'assessment_prepare_run' },
        },
      },
    })
    expect(consumeCredentialExecutionGrant).not.toHaveBeenCalled()
    expect(transaction.assessmentRun.create).not.toHaveBeenCalled()
    expect(prepareQuality).not.toHaveBeenCalled()
  })

  it('does not invoke cancellation when an assessment has no active runs', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    setAssessmentExecutionClientForTests({ assessmentRun: { findMany } } as never)
    const cancel = vi.fn()
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await expect(stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'operator stop' })).resolves.toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  it('terminalizes a stop that races before the first binding is prepared', async () => {
    const runUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        version: 1,
        status: 'PREPARED',
        assessmentId: 'assessment-1',
        bindings: [],
      })
      .mockResolvedValueOnce({ id: 'run-1', status: 'STOPPED', bindings: [] })
    setAssessmentExecutionClientForTests({
      assessmentRun: {
        findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        findUniqueOrThrow,
        updateMany: runUpdate,
      },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    const cancel = vi.fn()
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'race stop' })
    expect(cancel).not.toHaveBeenCalled()
    expect(runUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'run-1', status: 'STOP_REQUESTED' }, data: { status: 'STOPPED' } }),
    )
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }))
  })

  it('stops active runs without sealing cancelled evidence and cancels the assessment', async () => {
    const cancelledBinding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...currentManagedBinding(),
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        status: 'CANCELLED',
        result: 'CANCELLED',
        evidenceHealth: 'pending',
        completedAt: new Date(),
        reportPath: null,
        logPath: null,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready' },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({ id: 'run-1', version: 0, bindings: [{ testRunId: 'test-run-1' }] })
      .mockResolvedValueOnce({ id: 'run-1', assessmentId: 'assessment-1', bindings: [cancelledBinding] })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: 'operator stop',
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const evidenceUpsert = vi.fn()
    setAssessmentExecutionClientForTests({
      assessmentRun: {
        findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
        findUniqueOrThrow,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    const cancel = vi.fn().mockResolvedValue(undefined)
    setAssessmentRuntimeServiceFactoryForTests(() => ({ prepareQuality: vi.fn(), startQuality: vi.fn(), cancel }))
    await stopQualityAssessment({ assessmentId: 'assessment-1', reason: 'operator stop' })
    expect(cancel).toHaveBeenCalledWith('test-run-1')
    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'CANCELLED' } }))
  })

  it('seals byte-bound failed evidence with derived assurance and advances review', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-run.log')
    const tracePath = path.join(process.cwd(), '.tmp-assessment-trace.zip')
    await Promise.all([
      fs.writeFile(reportPath, '{"passed":false}'),
      fs.writeFile(logPath, 'failed'),
      fs.writeFile(tracePath, 'trace'),
    ])
    const managed = currentManagedBinding('HIGH')
    expect(() =>
      parseCanonicalRuntimeCapsuleManifest(
        managedCapsuleForTest({ testRunId: 'test-run-1', runId: 'run-1', binding: managed }).manifestJson,
      ),
    ).not.toThrow()
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...managed,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'HIGH' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{"data":"fixture"}' },
      },
      testRun: {
        id: 'test-run-1',
        targetProjectId: 'target-1',
        runId: 'run-1',
        intent: 'ASSESSMENT',
        status: 'COMPLETED',
        result: 'FAILED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: managedCapsuleForTest({ testRunId: 'test-run-1', runId: 'run-1', binding: managed }),
        testCases: [{ tracePath }],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: 'receipt-1', terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn().mockResolvedValue({ id: 'receipt-1' })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            outcome: 'FAILED',
            assuranceLevel: 'HIGH',
            reportHash: expect.stringMatching(/^sha256:/),
            logHash: expect.stringMatching(/^sha256:/),
            traceHash: expect.stringMatching(/^sha256:/),
          }),
        }),
      )
      expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EVIDENCE_REVIEW' } }))
    } finally {
      await Promise.all([
        fs.rm(reportPath, { force: true }),
        fs.rm(logPath, { force: true }),
        fs.rm(tracePath, { force: true }),
      ])
    }
  })

  it.each([
    [
      'null publication id',
      ({ capsule }: CapsuleMismatchFixture) =>
        ((capsule as unknown as { qualityPublicationId: string | null }).qualityPublicationId = null),
    ],
    [
      'wrong publication id',
      ({ capsule }: CapsuleMismatchFixture) => (capsule.qualityPublicationId = 'publication-other'),
    ],
    ['malformed manifest JSON', ({ capsule }: CapsuleMismatchFixture) => (capsule.manifestJson = '{not-json')],
    [
      'noncanonical manifest JSON',
      ({ capsule, manifest }: CapsuleMismatchFixture) => (capsule.manifestJson = JSON.stringify(manifest)),
    ],
    [
      'manifest hash mismatch',
      ({ capsule }: CapsuleMismatchFixture) => (capsule.manifestHash = `sha256:${'0'.repeat(64)}`),
    ],
    [
      'capsule hash mismatch',
      ({ capsule }: CapsuleMismatchFixture) => (capsule.capsuleHash = `sha256:${'0'.repeat(64)}`),
    ],
    [
      'capsule project owner mismatch',
      ({ capsule }: CapsuleMismatchFixture) => (capsule.targetProjectId = 'target-other'),
    ],
    ['capsule TestRun owner mismatch', ({ capsule }: CapsuleMismatchFixture) => (capsule.testRunId = 'test-run-other')],
    ['manifest project mismatch', ({ manifest }: CapsuleMismatchFixture) => (manifest.projectId = 'target-other')],
    ['manifest run mismatch', ({ manifest }: CapsuleMismatchFixture) => (manifest.runId = 'run-other')],
    [
      'validation hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.validationHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'operation hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.operationHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'projection hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.projectionHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'receipt hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.receiptHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'runtime-input hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.runtimeInputHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'authored snapshot source',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.source.kind = 'AUTHORED_TEST_SNAPSHOT'),
    ],
    [
      'source hash mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.source.sourceHash = `sha256:${'9'.repeat(64)}`),
    ],
    [
      'publish operation mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.source.publishOperationId = 'astpub_wrong'),
    ],
    [
      'generation id mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.source.generationId = 'generation-other'),
    ],
    [
      'generation key mismatch',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.source.generationKey = `sha256:${'9'.repeat(64)}`),
    ],
    ['empty expected validation', ({ manifest }: CapsuleMismatchFixture) => (manifest.expectedCases = [])],
    [
      'wrong expected validation',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.expectedCases[0].validationId = 'validation-other'),
    ],
    [
      'wrong expected suite',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.expectedCases[0].suiteId = 'suite-other'),
    ],
    [
      'wrong expected case',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.expectedCases[0].caseId = 'case-other'),
    ],
    [
      'wrong expected scenario',
      ({ manifest }: CapsuleMismatchFixture) => (manifest.expectedCases[0].scenarioId = 'scenario-other'),
    ],
    [
      'binding generation mismatch',
      ({ binding }: CapsuleMismatchFixture) => (binding.generationId = 'generation-other'),
    ],
    [
      'binding publication operation mismatch',
      ({ binding }: CapsuleMismatchFixture) => (binding.publicationOperationHash = `sha256:${'9'.repeat(64)}`),
    ],
  ])('classifies managed capsule %s as INCONCLUSIVE without a receipt', async (_label, mutate) => {
    const reportPath = path.join(process.cwd(), `.tmp-assessment-capsule-mismatch-${Math.random()}.json`)
    const logPath = path.join(process.cwd(), `.tmp-assessment-capsule-mismatch-${Math.random()}.log`)
    await Promise.all([fs.writeFile(reportPath, '{"passed":true}'), fs.writeFile(logPath, 'passed')])
    const managed = currentManagedBinding()
    const capsule = managedCapsuleForTest({ testRunId: 'test-run-1', runId: 'run-1', binding: managed })
    const manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson) as unknown as MutableCapsuleManifest
    const binding: MutableBinding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...managed,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
      },
      testRun: {
        id: 'test-run-1',
        targetProjectId: 'target-1',
        runId: 'run-1',
        intent: 'ASSESSMENT',
        status: 'COMPLETED',
        result: 'PASSED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: capsule,
        testCases: [],
      },
    }
    mutate({ binding, capsule, manifest })
    // Semantic mutations must retain valid canonical hashes so each case proves
    // the tuple gate rather than only the hash parser.
    if (
      capsule.manifestJson !== '{not-json' &&
      capsule.manifestJson !== JSON.stringify(manifest) &&
      !['manifest hash mismatch', 'capsule hash mismatch'].includes(_label)
    ) {
      capsule.manifestJson = canonicalRuntimeCapsuleJson(manifest)
      capsule.manifestHash = hashRuntimeCapsuleValue(manifest)
      capsule.capsuleHash = hashRuntimeCapsuleValue({ ...manifest, manifestHash: capsule.manifestHash })
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date(), testRun: { status: 'COMPLETED' } }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: bindingUpdate },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).not.toHaveBeenCalled()
      expect(bindingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'INCONCLUSIVE' }) }),
      )
      expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'READY' } }))
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it('seals a valid remote managed capsule only with its strict frozen environment packet', async () => {
    const reportPath = path.join(process.cwd(), `.tmp-assessment-remote-capsule-${Math.random()}.json`)
    const logPath = path.join(process.cwd(), `.tmp-assessment-remote-capsule-${Math.random()}.log`)
    await Promise.all([fs.writeFile(reportPath, '{"passed":true}'), fs.writeFile(logPath, 'passed')])
    const managed = currentManagedBinding()
    const frozenEnvironment = canonicalFrozenRemoteEnvironmentPacket({
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
    })
    const binding: MutableBinding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...managed,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
      },
      testRun: {
        id: 'test-run-1',
        targetProjectId: 'target-1',
        runId: 'run-1',
        intent: 'ASSESSMENT',
        status: 'COMPLETED',
        result: 'PASSED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        targetProject: { kind: 'REMOTE_BLACK_BOX' },
        environment: { id: 'env-1', baseUrl: 'https://www.saucedemo.com' },
        environmentSnapshotHash: hashCanonical(frozenEnvironment),
        environmentSnapshotJson: canonicalContractJson(frozenEnvironment),
        environmentSnapshotVersion: 1,
        runtimeCapsule: managedCapsuleForTest({ testRunId: 'test-run-1', runId: 'run-1', binding: managed }),
        testCases: [],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: 'receipt-1', terminalizedAt: new Date(), testRun: { status: 'COMPLETED' } }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn().mockResolvedValue({ id: 'receipt-1' })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).toHaveBeenCalledTimes(1)
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it('never seals remote evidence from a corrupt frozen packet even when report and log bytes are valid', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-corrupt-packet-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-corrupt-packet.log')
    await Promise.all([fs.writeFile(reportPath, '{"passed":false}'), fs.writeFile(logPath, 'failed')])
    const corruptPacket = { id: 'env-1', scopeVersion: 1 }
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...currentManagedBinding(),
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        targetProjectId: 'target-1',
        status: 'COMPLETED',
        result: 'FAILED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', targetProjectId: 'target-1', baseUrl: 'https://www.saucedemo.com' },
        targetProject: { kind: 'REMOTE_BLACK_BOX' },
        environmentSnapshotHash: hashCanonical(corruptPacket),
        environmentSnapshotJson: canonicalContractJson(corruptPacket),
        environmentSnapshotVersion: 1,
        runtimeCapsule: { integrityState: 'ready', capsuleHash: 'sha256:capsule', manifestHash: 'sha256:manifest' },
        testCases: [],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: bindingUpdate },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).not.toHaveBeenCalled()
      expect(bindingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'INCONCLUSIVE' }) }),
      )
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it.each(['FAILED', 'BLOCKED', 'PASSED'] as const)(
    'classifies corrupt remote legacy-artifact evidence as INCONCLUSIVE before the otherwise eligible %s outcome',
    async result => {
      const corruptPacket = { id: 'env-1', scopeVersion: 1 }
      const reportPath = path.join(process.cwd(), `.tmp-assessment-corrupt-packet-${result}.json`)
      const logPath = path.join(process.cwd(), `.tmp-assessment-corrupt-packet-${result}.log`)
      const humanVerificationLog =
        '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://www.saucedemo.com","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}'
      const log = result === 'BLOCKED' ? humanVerificationLog : `eligible ${result.toLowerCase()} evidence`
      await Promise.all([fs.writeFile(reportPath, `{"result":"${result}"}`), fs.writeFile(logPath, log)])
      const binding = {
        id: 'binding-1',
        version: 0,
        validationVersionId: 'validation-1',
        resultMatrixCell: 'CHROMIUM:env-1',
        runtimeInputHash: 'sha256:runtime',
        evidenceReceiptId: null,
        validationVersion: {
          canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
          canonicalHash: 'sha256:validation',
          publication: { runtimeInputJson: '{}' },
        },
        testRun: {
          targetProjectId: 'target-1',
          status: 'COMPLETED',
          result,
          evidenceHealth: 'valid',
          completedAt: new Date(),
          reportPath,
          logPath,
          ...(result === 'BLOCKED' ? { logs: { logs: humanVerificationLog } } : {}),
          browserEngine: 'CHROMIUM',
          environment: { id: 'env-1', targetProjectId: 'target-1', baseUrl: 'https://www.saucedemo.com' },
          targetProject: { kind: 'REMOTE_BLACK_BOX' },
          environmentSnapshotHash: hashCanonical(corruptPacket),
          environmentSnapshotJson: canonicalContractJson(corruptPacket),
          environmentSnapshotVersion: 1,
          runtimeCapsule: { integrityState: 'ready' },
          testCases: [],
        },
      }
      const findUniqueOrThrow = vi
        .fn()
        .mockResolvedValueOnce({
          id: 'run-1',
          targetProjectId: 'target-1',
          qualityPlanRevisionId: 'revision-1',
          evaluationSubjectRevisionId: 'subject-1',
          assessmentId: 'assessment-1',
          // Older remote Assessments can retain an ARTIFACT descriptor. The
          // durable TestRun TargetProject must still require a strict packet.
          evaluationSubjectRevision: { subjectDigest: 'sha256:subject', subjectKind: 'ARTIFACT' },
          bindings: [binding],
        })
        .mockResolvedValueOnce({
          id: 'run-1',
          assessmentId: 'assessment-1',
          stopReason: null,
          bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
        })
        .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
      const evidenceUpsert = vi.fn()
      const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
      setAssessmentExecutionClientForTests({
        assessmentRun: {
          findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
          findUniqueOrThrow,
          updateMany: vi.fn(),
        },
        assessmentRunBinding: { updateMany: bindingUpdate },
        evidenceReceipt: { upsert: evidenceUpsert },
        assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      } as never)

      try {
        await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
        expect(evidenceUpsert).not.toHaveBeenCalled()
        expect(bindingUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'INCONCLUSIVE' }) }),
        )
      } finally {
        await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
      }
    },
  )

  it('classifies a truly missing remote legacy-artifact packet as INCONCLUSIVE before sealing eligible evidence', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-missing-packet-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-missing-packet.log')
    await Promise.all([
      fs.writeFile(reportPath, '{"result":"PASSED"}'),
      fs.writeFile(logPath, 'eligible passed evidence'),
    ])
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...currentManagedBinding(),
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        targetProjectId: 'target-1',
        targetProject: { kind: 'REMOTE_BLACK_BOX' },
        status: 'COMPLETED',
        result: 'PASSED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', targetProjectId: 'target-1', baseUrl: 'https://www.saucedemo.com' },
        environmentSnapshotHash: null,
        environmentSnapshotJson: null,
        environmentSnapshotVersion: null,
        runtimeCapsule: { integrityState: 'ready', capsuleHash: 'sha256:capsule', manifestHash: 'sha256:manifest' },
        testCases: [],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject', subjectKind: 'ARTIFACT' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: bindingUpdate },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).not.toHaveBeenCalled()
      expect(bindingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'INCONCLUSIVE' }) }),
      )
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it('seals integrity-valid human-verification evidence but returns the assessment to READY', async () => {
    const reportPath = path.join(process.cwd(), '.tmp-assessment-blocked-report.json')
    const logPath = path.join(process.cwd(), '.tmp-assessment-blocked-run.log')
    await Promise.all([
      fs.writeFile(reportPath, '{"passed":false}'),
      fs.writeFile(
        logPath,
        '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
      ),
    ])
    const managed = currentManagedBinding()
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      ...managed,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{"data":"fixture"}' },
      },
      testRun: {
        id: 'test-run-1',
        targetProjectId: 'target-1',
        runId: 'run-1',
        intent: 'ASSESSMENT',
        status: 'COMPLETED',
        result: 'BLOCKED',
        evidenceHealth: 'valid',
        completedAt: new Date(),
        reportPath,
        logPath,
        logs: {
          logs: '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
        },
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: managedCapsuleForTest({ testRunId: 'test-run-1', runId: 'run-1', binding: managed }),
        testCases: [],
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        targetProjectId: 'target-1',
        qualityPlanRevisionId: 'revision-1',
        evaluationSubjectRevisionId: 'subject-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: 'receipt-1', terminalOutcome: 'BLOCKED', terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn().mockResolvedValue({ id: 'receipt-1' })
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    try {
      await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
      expect(evidenceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ outcome: 'BLOCKED' }) }),
      )
      expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'READY' } }))
      expect(assessmentUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'EVIDENCE_REVIEW' } }),
      )
    } finally {
      await Promise.all([fs.rm(reportPath, { force: true }), fs.rm(logPath, { force: true })])
    }
  })

  it('does not seal a blocked receipt when report evidence is invalid or missing', async () => {
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      evidenceReceiptId: null,
      testRun: {
        status: 'COMPLETED',
        result: 'BLOCKED',
        evidenceHealth: 'invalid_missing_report',
        completedAt: new Date(),
        runtimeCapsule: { integrityState: 'ready' },
        logs: {
          logs: '{"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","operation":"browser.navigation.goto@1","step":{"id":"step.open","version":"1"},"observedAt":"2026-08-14T00:00:00.000Z"}}',
        },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ terminalOutcome: 'BLOCKED', terminalizedAt: new Date(), evidenceReceiptId: null }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const bindingUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: bindingUpdate },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: vi.fn() },
    } as never)

    await reconcileQualityAssessment({ assessmentId: 'assessment-1' })

    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(bindingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ terminalOutcome: 'INCONCLUSIVE' }) }),
    )
  })

  it('terminalizes failed execution without evidence and returns the assessment to READY', async () => {
    const binding = {
      id: 'binding-1',
      version: 0,
      validationVersionId: 'validation-1',
      resultMatrixCell: 'CHROMIUM:env-1',
      runtimeInputHash: 'sha256:runtime',
      evidenceReceiptId: null,
      validationVersion: {
        canonicalAstJson: JSON.stringify({ requiredMinimumAssurance: 'STANDARD' }),
        canonicalHash: 'sha256:validation',
        publication: { runtimeInputJson: '{}' },
      },
      testRun: {
        status: 'COMPLETED',
        result: 'FAILED',
        evidenceHealth: 'infrastructure_failure',
        completedAt: new Date(),
        reportPath: null,
        logPath: null,
        browserEngine: 'CHROMIUM',
        environment: { id: 'env-1', baseUrl: 'https://example.test' },
        runtimeCapsule: { integrityState: 'ready' },
      },
    }
    const findUniqueOrThrow = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        evaluationSubjectRevision: { subjectDigest: 'sha256:subject' },
        bindings: [binding],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        assessmentId: 'assessment-1',
        stopReason: null,
        bindings: [{ evidenceReceiptId: null, terminalizedAt: new Date() }],
      })
      .mockResolvedValueOnce({ id: 'run-1', bindings: [] })
    const evidenceUpsert = vi.fn()
    const assessmentUpdate = vi.fn().mockResolvedValue({ count: 1 })
    setAssessmentExecutionClientForTests({
      assessmentRun: { findMany: vi.fn().mockResolvedValue([{ id: 'run-1' }]), findUniqueOrThrow, updateMany: vi.fn() },
      assessmentRunBinding: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      evidenceReceipt: { upsert: evidenceUpsert },
      assessment: { updateMany: assessmentUpdate },
    } as never)
    await reconcileQualityAssessment({ assessmentId: 'assessment-1' })
    expect(evidenceUpsert).not.toHaveBeenCalled()
    expect(assessmentUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'READY' } }))
  })
})
