import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashCanonical } from '@/lib/quality-design/state'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`

const { database, transaction, state, persistProjectedExecutionArtifacts, testRunUpsert } = vi.hoisted(() => {
  const h = (letter: string) => `sha256:${letter.repeat(64)}`
  const target = {
    id: 'target-1',
    kind: 'REMOTE_BLACK_BOX',
    fingerprint: h('a'),
    canonicalIdentity: 'remote:https://www.saucedemo.com',
    normalizedRemoteOrigin: 'https://www.saucedemo.com',
  }
  const state = {
    target,
    stepDefinition: { definitionHash: h('b') },
    locator: { value: '#login-button', locatorGroupId: 'login' },
    mutationAtNextTransaction: null as
      'step_only' | 'locator_only' | 'design_revision' | 'persisted_realization' | null,
    preflightClients: [] as unknown[],
    persistedRealization: h('f'),
    subjects: [] as Array<Record<string, unknown>>,
    bindings: [] as Array<Record<string, unknown>>,
    issuances: [] as Array<Record<string, unknown>>,
    environment: {
      id: 'environment-1',
      targetProjectId: target.id,
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      scopeVersion: 1,
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
    },
    revision: {
      id: 'revision-1',
      targetProjectId: target.id,
      qualityPlanId: 'plan-1',
      contentHash: h('c'),
    },
  }
  const persistProjectedExecutionArtifacts = vi.fn()
  const testRunUpsert = vi.fn()
  const database = {
    targetProject: {
      findFirst: vi.fn(async () => target),
      findUnique: vi.fn(async () => target),
    },
    environment: { findFirst: vi.fn(async () => ({ ...state.environment })) },
    stepDefinition: { findFirst: vi.fn(async () => ({ ...state.stepDefinition })) },
    locator: { findFirst: vi.fn(async () => ({ ...state.locator })) },
    qualityPlanRevision: { findFirst: vi.fn(async () => ({ ...state.revision })) },
    evaluationSubjectRevision: {
      findFirst: vi.fn(async ({ where, include }) => {
        const subject = state.subjects.find(item =>
          where.id ? item.id === where.id : item.subjectDigest === where.subjectDigest,
        )
        if (!subject) return null
        return include?.remoteEvaluationScopeBinding
          ? {
              ...subject,
              remoteEvaluationScopeBinding:
                state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id) ?? null,
            }
          : subject
      }),
      create: vi.fn(async ({ data }) => {
        const subject = { id: `subject-${state.subjects.length + 1}`, ...data }
        state.subjects.push(subject)
        return subject
      }),
    },
    remoteEvaluationScopeBinding: {
      findFirst: vi.fn(
        async ({ where }) =>
          state.bindings.find(item =>
            where.scopeHash
              ? item.targetProjectId === where.targetProjectId && item.scopeHash === where.scopeHash
              : item.evaluationSubjectRevisionId === where.evaluationSubjectRevisionId,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        const binding = { id: `binding-${state.bindings.length + 1}`, ...data }
        state.bindings.push(binding)
        return binding
      }),
    },
    remoteEvaluationScopeIssuance: {
      findFirst: vi.fn(
        async ({ where }) =>
          state.issuances.find(
            item => item.targetProjectId === where.targetProjectId && item.idempotencyKey === where.idempotencyKey,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        state.issuances.push({ id: `issuance-${state.issuances.length + 1}`, ...data })
      }),
    },
    assessmentRun: { findFirst: vi.fn() },
    qualityValidationPublication: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'publication-1',
        phase: 'review_ready',
        targetProjectId: target.id,
        validationVersionId: 'validation-1',
        generationId: 'generation-1',
        operationHash: h('e'),
        receiptHash: h('c'),
        runtimeInputHash: h('d'),
        validationProjectionJson: '{}',
        astId: 'validation-1',
      })),
    },
    testRun: { upsert: testRunUpsert },
  }
  // Scope issuance and TestRun persistence share delegates but not a client
  // identity. This makes a fake accidentally using the outer client visible.
  const transaction = {
    targetProject: database.targetProject,
    environment: database.environment,
    stepDefinition: database.stepDefinition,
    locator: database.locator,
    qualityPlanRevision: database.qualityPlanRevision,
    evaluationSubjectRevision: database.evaluationSubjectRevision,
    remoteEvaluationScopeBinding: database.remoteEvaluationScopeBinding,
    remoteEvaluationScopeIssuance: database.remoteEvaluationScopeIssuance,
    assessmentRun: database.assessmentRun,
    testRun: database.testRun,
  }
  Object.assign(database, {
    $transaction: vi.fn(async callback => {
      if (state.mutationAtNextTransaction) {
        const mutation = state.mutationAtNextTransaction
        state.mutationAtNextTransaction = null
        if (mutation === 'step_only') {
          state.stepDefinition.definitionHash = h('9')
        } else if (mutation === 'locator_only') {
          state.locator.value = '[data-test="changed"]'
          state.locator.locatorGroupId = 'changed-group'
        } else if (mutation === 'design_revision') state.revision.contentHash = h('8')
        else state.persistedRealization = h('7')
      }
      return callback(transaction)
    }),
  })
  return { database, transaction, state, persistProjectedExecutionArtifacts, testRunUpsert }
})

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('@/lib/quality-design/validation-artifact-contract', () => ({
  validationArtifactSchema: {
    parse: vi.fn(() => ({
      validations: [
        {
          id: 'validation-1',
          astProvenance: {
            schemaVersion: '2',
            astHash: `sha256:${'a'.repeat(64)}`,
            executionAuthority: 'reviewed_publication',
            publishOperationId: `astpub_${'c'.repeat(64)}`,
            receiptHash: `sha256:${'c'.repeat(64)}`,
            runtimeInputHash: `sha256:${'d'.repeat(64)}`,
          },
          testCaseIds: ['case-1'],
          appraiseArtifacts: {
            testSuites: [{ id: 'suite-1', testCaseIds: ['case-1'] }],
            testCases: [{ id: 'case-1' }],
          },
        },
      ],
    })),
  },
}))
vi.mock('@/services/coordinator/quality-validation-publication-service', () => ({
  persistProjectedExecutionArtifacts,
}))

import {
  createRemoteEvaluationScope,
  setRemoteEvaluationScopePreflightResolverForTests,
} from '@/services/coordinator/remote-evaluation-scope-service'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'

function scopeRequest(idempotencyKey: string) {
  return {
    target: 'target-1',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    expectedDesignHash: hash('d'),
    validationBindings: [
      {
        validationId: 'validation-1',
        locatorIds: ['locator-1'],
        steps: [
          {
            stepId: 'browser.assertions.visible',
            version: '1',
            inputs: { locator: 'locator-1' },
            description: 'visible',
          },
        ],
      },
    ],
    environment: { environmentId: 'environment-1' },
    runtime: { browserEngine: 'CHROMIUM' as const },
    idempotencyKey,
  }
}

describe('remote TestRun persistence phase guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.subjects.splice(0)
    state.bindings.splice(0)
    state.issuances.splice(0)
    state.stepDefinition.definitionHash = hash('b')
    state.locator.value = '#login-button'
    state.locator.locatorGroupId = 'login'
    state.mutationAtNextTransaction = null
    state.preflightClients.splice(0)
    state.persistedRealization = hash('f')
    state.revision.contentHash = hash('c')
    setRemoteEvaluationScopePreflightResolverForTests(async (_input, client) => {
      state.preflightClients.push(client)
      const readClient = client as unknown as {
        stepDefinition: { findFirst(args: unknown): Promise<{ definitionHash: string } | null> }
        locator: { findFirst(args: unknown): Promise<{ value: string; locatorGroupId: string } | null> }
      }
      const [step, locator] = await Promise.all([
        readClient.stepDefinition.findFirst({ where: { id: 'step-1' } }),
        readClient.locator.findFirst({ where: { id: 'locator-1' } }),
      ])
      const realizationHash = hashCanonical({
        stepDefinitionHash: step!.definitionHash,
        locator,
        persistedRealization: state.persistedRealization,
      })
      return {
        realizationPreflightHash: realizationHash,
        validations: [
          {
            validationVersionId: 'validation-1',
            validationIdentity: 'login-entry',
            version: 1,
            canonicalHash: hash('d'),
            canonicalAstHash: hashCanonical({
              id: 'scenario-1',
              behavior: 'Login entry',
              assertions: [],
              coverage: {},
              matrixIntent: {},
            }),
            realizationHash,
          },
        ],
      }
    })
  })

  async function assertTransactionDrift(
    mutation: 'step_only' | 'locator_only' | 'design_revision' | 'persisted_realization',
    idempotencyKey: string,
  ) {
    const issued = await createRemoteEvaluationScope(scopeRequest(idempotencyKey))
    const subject = state.subjects.find(item => item.id === issued.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    database.assessmentRun.findFirst.mockResolvedValue({
      id: 'assessment-run-1',
      targetProjectId: 'target-1',
      evaluationSubjectRevision: { ...subject, remoteEvaluationScopeBinding: binding },
    })
    state.mutationAtNextTransaction = mutation

    await expect(
      new RuntimeCapsuleTestRunService(database as never).prepareQuality({
        publicationId: 'publication-1',
        validationVersionId: 'validation-1',
        targetProjectId: 'target-1',
        environmentId: 'environment-1',
        assessmentRunId: 'assessment-run-1',
        name: 'Remote execution',
        environmentSnapshot: {
          hash: binding.environmentSnapshotHash as string,
          json: binding.environmentSnapshotJson as string,
          version: binding.environmentScopeVersion as number,
        },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
    expect(state.preflightClients.at(-1)).toBe(transaction)
    expect(persistProjectedExecutionArtifacts).not.toHaveBeenCalled()
    expect(testRunUpsert).not.toHaveBeenCalled()
  }

  it('blocks Step Definition drift after AssessmentRun reservation and before projections or TestRun persistence', async () => {
    await assertTransactionDrift('step_only', 'scope-test-run-step')
  })

  it('blocks locator/group drift after AssessmentRun reservation and before projections or TestRun persistence', async () => {
    await assertTransactionDrift('locator_only', 'scope-test-run-locator')
  })

  it('blocks design/revision drift before projections or TestRun persistence', async () => {
    await assertTransactionDrift('design_revision', 'scope-test-run-design')
  })

  it('blocks persisted realization drift before projections or TestRun persistence', async () => {
    await assertTransactionDrift('persisted_realization', 'scope-test-run-realization')
  })
})
