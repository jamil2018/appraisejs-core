import { BrowserEngine } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { frozenRemoteEnvironmentPacketSnapshot } from '@/lib/quality-design/frozen-environment-snapshot'
import { hashCanonical } from '@/lib/quality-design/state'

const { persistProjectedExecutionArtifacts, parseValidation, materializeQuality, materializeAuthored } = vi.hoisted(
  () => ({
    persistProjectedExecutionArtifacts: vi.fn(),
    parseValidation: vi.fn(),
    materializeQuality: vi.fn(),
    materializeAuthored: vi.fn(),
  }),
)

vi.mock('@/lib/quality-design/validation-artifact-contract', () => ({
  validationArtifactSchema: { parse: parseValidation },
}))

vi.mock('@/services/coordinator/quality-validation-publication-service', () => ({
  persistProjectedExecutionArtifacts,
}))

vi.mock('@/lib/runtime-capsule', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/runtime-capsule')>()
  return {
    ...actual,
    RuntimeCapsuleMaterializer: class {
      materializeQuality = materializeQuality
      materializeAuthored = materializeAuthored
    },
  }
})

import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'

const compilerReceiptHash = `sha256:${'3'.repeat(64)}`
const astPublishOperationId = `astpub_${'3'.repeat(64)}`

describe('RuntimeCapsuleTestRunService independent published runs', () => {
  it('rejects an independent published validation with a foreign v2 authority before any transaction write', async () => {
    const transaction = vi.fn()
    const client = {
      qualityValidationPublication: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-1',
          generationId: 'generation-1',
          operationHash: `sha256:${'2'.repeat(64)}`,
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightDisposition: 'ACTIVE',
          preflightAuthority: 'foreign:authority',
        }),
      },
      $transaction: transaction,
    }

    await expect(
      new RuntimeCapsuleTestRunService(client as never).prepareIndependentPublished({
        publicationId: 'publication-1',
        validationVersionId: 'version-1',
        targetProjectId: 'project-1',
        environmentId: 'environment-1',
        name: 'Independent published validation',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'preflight_algorithm_unsupported', targetOutcome: 'not_evaluated' },
    })
    expect(transaction).not.toHaveBeenCalled()
    expect(persistProjectedExecutionArtifacts).not.toHaveBeenCalled()
  })

  it('surfaces a migrated retired publication through the public preparation read as not evaluated', async () => {
    const transaction = vi.fn()
    const client = {
      qualityValidationPublication: {
        // Exact persisted values written by the unified v2 migration for a
        // legacy publication. This public read must not downgrade to a bare
        // hash or let independent execution resume.
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-migrated-v1',
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
          preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v1',
          preflightDisposition: 'RETIRED_UNSUPPORTED',
          preflightAuthority: 'appraisejs:quality-validation-publication:v1',
        }),
      },
      $transaction: transaction,
    }

    await expect(
      new RuntimeCapsuleTestRunService(client as never).prepareIndependentPublished({
        publicationId: 'publication-migrated-v1',
        validationVersionId: 'version-1',
        targetProjectId: 'project-1',
        environmentId: 'environment-1',
        name: 'Migrated independent published validation',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'preflight_algorithm_unsupported', targetOutcome: 'not_evaluated' },
    })
    expect(transaction).not.toHaveBeenCalled()
    expect(persistProjectedExecutionArtifacts).not.toHaveBeenCalled()
  })

  it('prepares an independent published capsule without assessment or evidence writes', async () => {
    const node = {
      id: 'validation-ast',
      astProvenance: { publishOperationId: astPublishOperationId },
      appraiseArtifacts: {
        testSuites: [{ id: 'suite-1', testCaseIds: ['case-1'] }],
        testCases: [{ id: 'case-1' }],
      },
      testCaseIds: ['case-1'],
    }
    parseValidation.mockReturnValue({ validations: [node] })

    const assessmentRunCreate = vi.fn()
    const evidenceReceiptCreate = vi.fn()
    const preparedRun = {
      id: 'run-db-id',
      runId: 'run-id',
      targetProjectId: 'project-1',
      environmentId: 'environment-1',
      intent: 'INDEPENDENT',
      assessmentRunBinding: null,
      testCases: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }],
    }
    const tx = {
      environment: { findFirst: vi.fn().mockResolvedValue({ id: 'environment-1' }) },
      targetProject: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      testRun: { upsert: vi.fn().mockResolvedValue(preparedRun) },
      assessmentRun: { create: assessmentRunCreate },
      evidenceReceipt: { create: evidenceReceiptCreate },
    }
    const client = {
      qualityValidationPublication: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-1',
          generationId: 'generation-1',
          operationHash: `sha256:${'2'.repeat(64)}`,
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
          receiptHash: compilerReceiptHash,
        }),
      },
      $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    }

    const result = await new RuntimeCapsuleTestRunService(client as never).prepareIndependentPublished({
      publicationId: 'publication-1',
      validationVersionId: 'version-1',
      targetProjectId: 'project-1',
      environmentId: 'environment-1',
      name: 'Independent published validation',
      browserEngine: BrowserEngine.CHROMIUM,
    })

    expect(result.intent).toBe('INDEPENDENT')
    expect(tx.testRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ intent: 'INDEPENDENT' }) }),
    )
    expect(persistProjectedExecutionArtifacts).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ targetProjectId: 'project-1', node }),
    )
    expect(assessmentRunCreate).not.toHaveBeenCalled()
    expect(evidenceReceiptCreate).not.toHaveBeenCalled()
  })

  it('rejects a remote environment drift inside the TestRun snapshot persistence transaction', async () => {
    const node = {
      id: 'validation-ast',
      astProvenance: { publishOperationId: astPublishOperationId },
      appraiseArtifacts: {
        testSuites: [{ id: 'suite-1', testCaseIds: ['case-1'] }],
        testCases: [{ id: 'case-1' }],
      },
      testCaseIds: ['case-1'],
    }
    parseValidation.mockReturnValue({ validations: [node] })
    const frozen = {
      id: 'environment-1',
      targetProjectId: 'project-1',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      hasPassword: false,
      credentialBindingState: 'NONE',
      credentialReference: null,
      scopeVersion: 4,
    }
    const testRunUpsert = vi.fn()
    const tx = {
      environment: {
        findFirst: vi.fn().mockResolvedValue({
          id: frozen.id,
          targetProjectId: frozen.targetProjectId,
          name: frozen.name,
          baseUrl: 'https://wrong.example',
          expectedPageTitle: null,
          apiBaseUrl: null,
          username: null,
          credentialState: 'NONE',
          passwordEnvironmentVariable: null,
          scopeVersion: frozen.scopeVersion,
          updatedAt: new Date('2026-08-22T00:00:00.000Z'),
        }),
      },
      targetProject: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1' }) },
      assessmentRun: {
        findFirst: vi.fn().mockResolvedValue({
          evaluationSubjectRevision: {
            subjectKind: 'REMOTE_EVALUATION_SCOPE',
            remoteEvaluationScopeBinding: {
              environmentId: 'environment-1',
              environmentSnapshotHash: hashCanonical(frozen),
              environmentSnapshotJson: canonicalContractJson(frozen),
              environmentScopeVersion: 4,
            },
          },
        }),
      },
      testRun: { upsert: testRunUpsert },
    }
    const client = {
      qualityValidationPublication: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-1',
          generationId: 'generation-1',
          operationHash: `sha256:${'2'.repeat(64)}`,
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
          receiptHash: compilerReceiptHash,
        }),
      },
      $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    }

    await expect(
      new RuntimeCapsuleTestRunService(client as never).prepareQuality({
        publicationId: 'publication-1',
        validationVersionId: 'version-1',
        targetProjectId: 'project-1',
        environmentId: 'environment-1',
        name: 'Remote scope',
        assessmentRunId: 'assessment-run-1',
        environmentSnapshot: { hash: hashCanonical(frozen), json: canonicalContractJson(frozen), version: 4 },
      }),
    ).rejects.toThrow('changed before TestRun snapshot persistence')
    expect(testRunUpsert).not.toHaveBeenCalled()
  })

  it('rejects a remote-owned TestRun missing its packet before materialization, claiming, logs, or spawn', async () => {
    const testRunUpdate = vi.fn()
    const attemptUpsert = vi.fn()
    const client = {
      qualityValidationPublication: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-1',
          generationId: 'generation-1',
          operationHash: `sha256:${'2'.repeat(64)}`,
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
        }),
      },
      testRun: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'run-db-id',
          runId: 'run-id',
          targetProjectId: 'project-1',
          environmentId: 'environment-1',
          intent: 'ASSESSMENT',
          status: 'QUEUED',
          environment: { id: 'environment-1' },
          environmentSnapshotHash: null,
          environmentSnapshotJson: null,
          environmentSnapshotVersion: null,
          assessmentRunBinding: {
            validationVersionId: 'version-1',
            generationId: 'generation-1',
            publicationId: 'publication-1',
            publicationOperationHash: `sha256:${'2'.repeat(64)}`,
            assessmentRun: { evaluationSubjectRevision: { subjectKind: 'REMOTE_EVALUATION_SCOPE' } },
          },
          runtimeCapsuleExecutionAttempt: null,
        }),
        update: testRunUpdate,
        updateMany: vi.fn(),
      },
      runtimeCapsuleExecutionAttempt: { upsert: attemptUpsert, updateMany: vi.fn() },
      testRunLog: { upsert: vi.fn() },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startQuality({
        publicationId: 'publication-1',
        validationVersionId: 'version-1',
        targetProjectId: 'project-1',
        environmentId: 'environment-1',
        name: 'Remote scope',
        testRunDbId: 'run-db-id',
      }),
    ).rejects.toThrow('lacks its required frozen environment snapshot')
    expect(materializeQuality).not.toHaveBeenCalled()
    expect(attemptUpsert).not.toHaveBeenCalled()
    expect(testRunUpdate).not.toHaveBeenCalled()
  })

  it('freezes an independent REMOTE_BLACK_BOX packet at preparation while a local independent run remains optional', async () => {
    const node = {
      id: 'validation-ast',
      astProvenance: { publishOperationId: astPublishOperationId },
      appraiseArtifacts: {
        testSuites: [{ id: 'suite-1', testCaseIds: ['case-1'] }],
        testCases: [{ id: 'case-1' }],
      },
      testCaseIds: ['case-1'],
    }
    parseValidation.mockReturnValue({ validations: [node] })
    const environment = {
      id: 'environment-1',
      targetProjectId: 'project-1',
      name: 'Sauce Demo',
      baseUrl: 'https://www.saucedemo.com/',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: null,
      credentialState: 'NONE',
      passwordEnvironmentVariable: null,
      scopeVersion: 3,
      updatedAt: new Date('2026-08-22T00:00:00.000Z'),
    }
    const testRunUpsert = vi.fn().mockImplementation(async ({ create }) => ({
      ...create,
      id: 'run-db-id',
      runId: 'run-id',
      targetProjectId: 'project-1',
      environmentId: 'environment-1',
      intent: 'INDEPENDENT',
      assessmentRunBinding: null,
      testCases: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }],
    }))
    const tx = {
      environment: { findFirst: vi.fn().mockResolvedValue(environment) },
      targetProject: { findUnique: vi.fn().mockResolvedValue({ id: 'project-1', kind: 'REMOTE_BLACK_BOX' }) },
      testRun: { upsert: testRunUpsert },
    }
    const client = {
      qualityValidationPublication: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'publication-1',
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
          receiptHash: compilerReceiptHash,
        }),
      },
      $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
    }
    await new RuntimeCapsuleTestRunService(client as never).prepareIndependentPublished({
      publicationId: 'publication-1',
      validationVersionId: 'version-1',
      targetProjectId: 'project-1',
      environmentId: 'environment-1',
      name: 'Independent remote validation',
    })
    expect(testRunUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          environmentSnapshotHash: frozenRemoteEnvironmentPacketSnapshot(environment).hash,
          environmentSnapshotJson: frozenRemoteEnvironmentPacketSnapshot(environment).json,
          environmentSnapshotVersion: 3,
        }),
      }),
    )
    const packet = JSON.parse(
      (testRunUpsert.mock.calls[0]![0] as { create: { environmentSnapshotJson: string } }).create
        .environmentSnapshotJson,
    )
    expect(packet.baseUrl).toBe('https://www.saucedemo.com')
  })

  it.each([
    ['missing', null, null, null],
    ['malformed', 'not-json', 'sha256:packet', 1],
    ['tampered hash', '{"id":"environment-1","scopeVersion":1}', 'sha256:wrong', 1],
    [
      'version mismatch',
      '{"id":"environment-1","scopeVersion":2}',
      hashCanonical({ id: 'environment-1', scopeVersion: 2 }),
      1,
    ],
    [
      'environment mismatch',
      '{"id":"wrong-environment","scopeVersion":1}',
      hashCanonical({ id: 'wrong-environment', scopeVersion: 1 }),
      1,
    ],
  ])(
    'rejects an authored remote %s packet before materialization, attempts, claims, logs, or spawn',
    async (_kind, json, hash, version) => {
      materializeAuthored.mockClear()
      const testRunUpdate = vi.fn()
      const attemptUpsert = vi.fn()
      const client = {
        testRun: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: 'authored-run',
            runId: 'authored-run-id',
            targetProjectId: 'project-1',
            environmentId: 'environment-1',
            intent: 'INDEPENDENT',
            status: 'QUEUED',
            environment: { id: 'environment-1' },
            targetProject: { kind: 'REMOTE_BLACK_BOX' },
            testCases: [],
            assessmentRunBinding: null,
            environmentSnapshotJson: json,
            environmentSnapshotHash: hash,
            environmentSnapshotVersion: version,
            runtimeCapsuleExecutionAttempt: null,
          }),
          update: testRunUpdate,
          updateMany: vi.fn(),
        },
        runtimeCapsuleExecutionAttempt: { upsert: attemptUpsert, updateMany: vi.fn() },
        testRunLog: { upsert: vi.fn() },
      }
      await expect(
        new RuntimeCapsuleTestRunService(client as never).startIndependentAuthored({ testRunDbId: 'authored-run' }),
      ).rejects.toThrow()
      expect(materializeAuthored).not.toHaveBeenCalled()
      expect(attemptUpsert).not.toHaveBeenCalled()
      expect(testRunUpdate).not.toHaveBeenCalled()
    },
  )
})
