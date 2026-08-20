import { BrowserEngine } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

const { persistProjectedExecutionArtifacts, parseValidation } = vi.hoisted(() => ({
  persistProjectedExecutionArtifacts: vi.fn(),
  parseValidation: vi.fn(),
}))

vi.mock('@/lib/quality-design/validation-artifact-contract', () => ({
  validationArtifactSchema: { parse: parseValidation },
}))

vi.mock('@/services/coordinator/quality-validation-publication-service', () => ({
  persistProjectedExecutionArtifacts,
}))

import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'

describe('RuntimeCapsuleTestRunService independent published runs', () => {
  it('prepares an independent published capsule without assessment or evidence writes', async () => {
    const node = {
      id: 'validation-ast',
      astProvenance: { publishOperationId: 'publication-1' },
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
          phase: 'review_ready',
          targetProjectId: 'project-1',
          validationVersionId: 'version-1',
          validationProjectionJson: '{}',
          astId: 'validation-ast',
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
})
