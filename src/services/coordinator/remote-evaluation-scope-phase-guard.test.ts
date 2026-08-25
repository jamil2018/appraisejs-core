import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA,
  remoteEvaluationScopePartitionCreateSchema,
  remoteScopePartitionRequestIdentity,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import { hashCanonical } from '@/lib/quality-design/state'

const hash = (letter: string) => `sha256:${letter.repeat(64)}`
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

const { database, state, validationUpdate, revisionUpdate } = vi.hoisted(() => {
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
    mutateAtNextTransaction: false,
    subjects: [] as Array<Record<string, unknown>>,
    bindings: [] as Array<Record<string, unknown>>,
    issuances: [] as Array<Record<string, unknown>>,
    environment: {
      id: 'environment-1',
      targetProjectId: target.id,
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com/',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      scopeVersion: 1,
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
    },
    revision: null as Record<string, unknown> | null,
  }
  const validationUpdate = vi.fn()
  const revisionUpdate = vi.fn()
  const database = {
    targetProject: { findFirst: vi.fn(async () => state.target) },
    environment: { findFirst: vi.fn(async () => ({ ...state.environment })) },
    stepDefinition: { findFirst: vi.fn(async () => ({ ...state.stepDefinition })) },
    locator: { findFirst: vi.fn(async () => ({ ...state.locator })) },
    qualityPlanRevision: {
      findFirst: vi.fn(async () => state.revision),
      update: revisionUpdate,
    },
    validationVersion: { update: validationUpdate },
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
    $transaction: vi.fn(async callback => {
      if (state.mutateAtNextTransaction) {
        state.mutateAtNextTransaction = false
        state.stepDefinition.definitionHash = h('9')
        state.locator.value = '[data-test="changed"]'
        state.locator.locatorGroupId = 'changed-group'
      }
      return callback(database)
    }),
  }
  return { database, state, validationUpdate, revisionUpdate }
})

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject: vi.fn(async () => state.target),
}))
vi.mock('@/lib/quality-design/validation-realization', () => ({
  canonicalizeAndValidateQualityRealization: vi.fn(() => {
    const h = (letter: string) => `sha256:${letter.repeat(64)}`
    return {
      envelope: { idempotencyKey: 'publication-1', projection: {}, validationProjection: {}, extensionReviews: [] },
      validation: {
        validations: [
          {
            id: 'validation-1',
            astProvenance: { publishOperationId: 'astpub_receipt' },
            appraiseArtifacts: { modules: [], locatorGroups: [], locators: [], testCases: [], testSuites: [] },
          },
        ],
      },
      runtimeInput: {
        astId: 'validation-1',
        astHash: h('e'),
        contextHash: h('f'),
        previewHash: h('1'),
        receiptHash: h('2'),
      },
    }
  }),
}))

import {
  createRemoteEvaluationScope,
  remoteScopePartitionAuthorityForSubject,
  remoteScopePhaseBinding,
  setRemoteEvaluationScopePreflightResolverForTests,
} from './remote-evaluation-scope-service'
import { compileQualityValidations } from './quality-design-service'
import { publishQualityValidationRuntime } from './quality-validation-publication-service'

function revision() {
  const design = { id: 'scenario-1', behavior: 'Login entry', assertions: [], coverage: {}, matrixIntent: {} }
  return {
    id: 'revision-1',
    targetProjectId: 'target-1',
    qualityPlanId: 'plan-1',
    revision: 1,
    status: 'SCENARIOS_APPROVED',
    approvedAt: new Date('2026-08-22T00:00:00.000Z'),
    contentHash: hash('c'),
    sourceSpecification: '{}',
    requirementGraphJson: '{}',
    qualityPlan: { id: 'plan-1', targetProjectId: 'target-1', title: 'Sauce Demo', description: null },
    requirementSnapshots: [],
    obligations: [],
    queries: [],
    validationVersions: [
      {
        id: 'validation-1',
        validationIdentity: 'scenario-1',
        version: 1,
        status: 'SCENARIO_APPROVED',
        reuseOutcome: null,
        canonicalAstJson: JSON.stringify(design),
        canonicalHash: hash('d'),
        realizationJson: null,
        realizationHash: null,
        compilationHash: null,
        scenarioApprovedAt: null,
        scenarioApprovedBy: null,
        scenarioApprovalHash: null,
      },
    ],
  }
}

function scopeRequest(idempotencyKey: string) {
  const design = JSON.parse(
    (state.revision!.validationVersions as Array<{ canonicalAstJson: string }>)[0]!.canonicalAstJson,
  )
  return {
    target: 'target-1',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    expectedDesignHash: hashCanonical([design]),
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

function persistedPartitionRecord(subject: Record<string, unknown>, binding: Record<string, unknown>) {
  const validationBindings = JSON.parse(String(binding.validationBindingsJson))
  const validationVersionIds = ['validation-1']
  const coverageHash = hashCanonical({
    schemaVersion: 'appraise.remote-evaluation-scope-partition-coverage/v1',
    validationVersionIds,
  })
  const input = remoteEvaluationScopePartitionCreateSchema.parse({
    target: 'target-1',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    expectedDesignHash: scopeRequest('unused').expectedDesignHash,
    partitions: [
      {
        partitionKey: 'primary',
        environment: { environmentId: binding.environmentId },
        validationBindings,
      },
    ],
    runtime: { browserEngine: 'CHROMIUM' },
    idempotencyKey: 'partition-integrity',
  })
  const identityBase = {
    ...remoteScopePartitionRequestIdentity(input),
    coverageHash,
    children: [
      {
        partitionKey: 'primary',
        environmentId: binding.environmentId,
        scopeHash: binding.scopeHash,
        validationBindingsHash: binding.validationBindingsHash,
      },
    ],
  }
  const manifestHash = digest({ schemaVersion: REMOTE_EVALUATION_SCOPE_PARTITION_SCHEMA, identity: identityBase })
  const partition: {
    partitionKey: string
    environmentId: unknown
    validationVersionIdsJson: string
    validationBindingsHash: unknown
    childHash: string
    remoteEvaluationScopeBinding: Record<string, unknown> & {
      evaluationSubjectRevision: Record<string, unknown>
    }
  } = {
    partitionKey: 'primary',
    environmentId: binding.environmentId,
    validationVersionIdsJson: canonicalContractJson(validationVersionIds),
    validationBindingsHash: binding.validationBindingsHash,
    childHash: digest({
      manifestHash,
      partitionKey: 'primary',
      environmentId: binding.environmentId,
      validationVersionIds,
      scopeHash: binding.scopeHash,
    }),
    remoteEvaluationScopeBinding: { ...binding, evaluationSubjectRevision: subject },
  }
  return {
    ...partition,
    manifest: {
      id: 'manifest-1',
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      qualityPlanRevisionId: 'revision-1',
      designHash: input.expectedDesignHash,
      coverageHash,
      manifestHash,
      requestHash: digest({ schemaVersion: 'remote-scope-partition-request/v1', identity: identityBase }),
      canonicalManifestJson: canonicalContractJson(identityBase),
      partitions: [partition],
    },
  }
}

describe('remote scope compile transaction guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.subjects.splice(0)
    state.bindings.splice(0)
    state.issuances.splice(0)
    state.stepDefinition.definitionHash = hash('b')
    state.locator.value = '#login-button'
    state.locator.locatorGroupId = 'login'
    state.mutateAtNextTransaction = false
    delete (database as Record<string, unknown>).remoteEvaluationScopePartition
    state.revision = revision()
    setRemoteEvaluationScopePreflightResolverForTests(async (_input, client) => {
      const readClient = client as unknown as {
        stepDefinition: { findFirst(args: unknown): Promise<{ definitionHash: string } | null> }
        locator: { findFirst(args: unknown): Promise<{ value: string; locatorGroupId: string } | null> }
      }
      const [step, locator] = await Promise.all([
        readClient.stepDefinition.findFirst({ where: { id: 'step-1' } }),
        readClient.locator.findFirst({ where: { id: 'locator-1' } }),
      ])
      const realizationHash = hashCanonical({ stepDefinitionHash: step!.definitionHash, locator: locator })
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

  it('runs the actual full scope checker in the compile transaction and blocks Step Definition/locator drift before realization writes', async () => {
    const issued = await createRemoteEvaluationScope(scopeRequest('scope-phase-1'))
    const subject = state.subjects.find(item => item.id === issued.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    const phase = remoteScopePhaseBinding({ subject: subject as never, binding: binding as never })
    state.mutateAtNextTransaction = true

    await expect(
      compileQualityValidations(
        {
          qualityPlanId: 'plan-1',
          revisionId: 'revision-1',
          expectedDesignHash: scopeRequest('unused').expectedDesignHash,
          realization: { default: {} },
          remoteScopeBinding: phase,
        },
        database as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
    expect(validationUpdate).not.toHaveBeenCalled()
    expect(revisionUpdate).not.toHaveBeenCalled()
  })

  it('runs the same actual full checker in the publication transaction before every projection or publication write', async () => {
    const issued = await createRemoteEvaluationScope(scopeRequest('scope-phase-publication'))
    const subject = state.subjects.find(item => item.id === issued.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    const phase = remoteScopePhaseBinding({ subject: subject as never, binding: binding as never })
    const projectionWrite = vi.fn()
    const publicationWrite = vi.fn()
    Object.assign(database, {
      qualityValidationPublication: { findUnique: projectionWrite, create: publicationWrite },
      module: { upsert: projectionWrite },
      locatorGroup: { upsert: projectionWrite },
      locator: { ...database.locator, upsert: projectionWrite },
      testCase: { upsert: projectionWrite },
      testCaseStep: { upsert: projectionWrite },
      testSuite: { upsert: projectionWrite },
    })
    state.mutateAtNextTransaction = true

    await expect(
      publishQualityValidationRuntime(
        {
          targetProjectId: 'target-1',
          targetFingerprint: hash('a'),
          qualityPlanRevisionId: 'revision-1',
          validationVersionId: 'validation-1',
          idempotencyKey: 'publication-1',
          expectedRevisionHash: hash('c'),
          validationHash: hash('d'),
          validationContent: '{}',
          expectedRealizationHash: hash('3'),
          reviewContent: '{}',
          astId: 'validation-1',
          astHash: hash('e'),
          contextHash: hash('f'),
          previewHash: hash('1'),
          receiptHash: hash('2'),
          projection: {},
          validationProjection: {},
          runtimeInput: {},
          extensionReviews: [],
          remoteScopeBinding: phase,
        },
        database as never,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
    expect(projectionWrite).not.toHaveBeenCalled()
    expect(publicationWrite).not.toHaveBeenCalled()
  })

  it('fails closed before a phase can use a tampered persisted partition membership', async () => {
    const issued = await createRemoteEvaluationScope(scopeRequest('scope-phase-partition-tamper'))
    const subject = state.subjects.find(item => item.id === issued.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    Object.assign(database, {
      remoteEvaluationScopePartition: {
        findFirst: vi.fn(async () => ({
          // The audit binding proves validation-1. A changed membership row
          // must never become a caller-selectable partition authority.
          validationVersionIdsJson: JSON.stringify(['validation-tampered']),
          environmentId: binding.environmentId,
          validationBindingsHash: binding.validationBindingsHash,
        })),
      },
    })

    await expect(
      remoteScopePartitionAuthorityForSubject({ subjectRevisionId: subject.id }, database as never),
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
  })

  it('rebuilds every persisted manifest constituent before exposing subset authority', async () => {
    const issued = await createRemoteEvaluationScope(scopeRequest('scope-phase-partition-integrity'))
    const subject = state.subjects.find(item => item.id === issued.subject.id)!
    const binding = state.bindings.find(item => item.evaluationSubjectRevisionId === subject.id)!
    const clean = persistedPartitionRecord(subject, binding)

    Object.assign(database, {
      remoteEvaluationScopePartition: {
        findFirst: vi.fn(async () => clean),
      },
    })
    await expect(
      remoteScopePartitionAuthorityForSubject({ subjectRevisionId: subject.id }, database as never),
    ).resolves.toEqual({ kind: 'persisted-partition-manifest', validationVersionIds: ['validation-1'] })

    const corrupted = [
      (value: ReturnType<typeof persistedPartitionRecord>) => (value.manifest.coverageHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) => (value.manifest.manifestHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) => (value.manifest.requestHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) => (value.manifest.partitions[0]!.childHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.validationBindingsHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.validationVersionIdsJson = '["validation-tampered"]'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.canonicalManifestJson = canonicalContractJson({
          ...JSON.parse(value.manifest.canonicalManifestJson),
          coverageHash: hash('9'),
        })),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evaluationSubjectRevision.subjectDigest =
          hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evaluationSubjectRevision.subjectKind = 'ARTIFACT'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evaluationSubjectRevision.authority = 'foreign'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evaluationSubjectRevision.metadataJson = '{}'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evaluationSubjectRevisionId = 'foreign-subject'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.targetProjectId = 'foreign-target'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.qualityPlanId = 'foreign-plan'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.qualityPlanRevisionId = 'foreign-revision'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.environmentId = 'foreign-environment'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.scopeHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.scopeSchemaVersion = 'legacy'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.preflightAlgorithmVersion = 'legacy'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.scopeIntentHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.realizationIntentHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.preflightHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.canonicalPreflightJson = '{}'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.targetFingerprint = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.designHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.revisionContentHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.realizationPreflightHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.runtimePolicyHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.securityPolicyHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.evidencePolicyHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.canonicalScopeJson = '{}'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.validationBindingsJson = '[]'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.environmentSnapshotHash = hash('9')),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.environmentSnapshotJson = '{}'),
      (value: ReturnType<typeof persistedPartitionRecord>) =>
        (value.manifest.partitions[0]!.remoteEvaluationScopeBinding.environmentScopeVersion = 2),
    ]
    for (const corrupt of corrupted) {
      const tampered = persistedPartitionRecord(subject, binding)
      corrupt(tampered)
      Object.assign(database, {
        remoteEvaluationScopePartition: {
          findFirst: vi.fn(async () => tampered),
        },
      })
      await expect(
        remoteScopePartitionAuthorityForSubject({ subjectRevisionId: subject.id }, database as never),
      ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'remote_evaluation_scope_stale' } })
    }
  })
})
