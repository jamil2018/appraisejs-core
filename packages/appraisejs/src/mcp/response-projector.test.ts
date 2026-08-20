import { describe, expect, it } from 'vitest'

import { applyLifecycleResponseMode } from './response-projector.js'

describe('lifecycle response projection', () => {
  it('keeps preparation identities and hashes at the top level of the compact summary', () => {
    expect(
      applyLifecycleResponseMode(
        {
          preparationId: 'prepare-1',
          phase: 'STARTED',
          environment: { id: 'environment-1' },
          publication: { validationVersionIds: ['validation-1'], compilationHash: 'sha256:publication' },
          assessment: { id: 'assessment-1' },
          assessmentRun: { id: 'run-1' },
          hashes: { inputHash: 'sha256:input', compilationHash: 'sha256:compilation' },
          nextRecommendedAction: 'assessment_reconcile',
          nextRequiredAgentBehavior: 'wait_for_terminal_execution_then_reconcile',
          internalOnly: 'not included',
        },
        'summary',
      ),
    ).toEqual({
      status: undefined,
      qualityPlanId: undefined,
      revisionId: undefined,
      preparationId: 'prepare-1',
      phase: 'STARTED',
      environment: { id: 'environment-1' },
      publication: { validationVersionIds: ['validation-1'], compilationHash: 'sha256:publication' },
      assessment: { id: 'assessment-1' },
      assessmentRun: { id: 'run-1' },
      hashes: { inputHash: 'sha256:input', compilationHash: 'sha256:compilation' },
      assessmentId: undefined,
      assessmentRunId: undefined,
      validationVersionId: undefined,
      evidenceSetHash: undefined,
      nextRecommendedAction: 'assessment_reconcile',
      nextRequiredAgentBehavior: 'wait_for_terminal_execution_then_reconcile',
      ready: undefined,
      blockers: undefined,
      warnings: undefined,
      links: undefined,
    })
  })

  it('keeps only decision-critical evidence state in decisionOnly mode', () => {
    expect(
      applyLifecycleResponseMode(
        {
          assessment: { id: 'assessment-1', status: 'EVIDENCE_REVIEW' },
          evidenceSetHash: 'sha256:evidence',
          evidenceReceiptCount: 1,
          targetOutcome: null,
          readiness: { ready: true, blockers: [], runtimeCells: [{ large: 'omitted' }] },
          decisions: [],
          evidenceReceipts: [{ large: 'omitted' }],
          revision: { large: 'omitted' },
        },
        'decisionOnly',
      ),
    ).toEqual(
      expect.objectContaining({
        assessment: { id: 'assessment-1', status: 'EVIDENCE_REVIEW' },
        evidenceSetHash: 'sha256:evidence',
        evidenceReceiptCount: 1,
        targetOutcome: null,
        decisions: [],
      }),
    )
    expect(
      applyLifecycleResponseMode({ revision: { large: true }, evidenceReceipts: [{ large: true }] }, 'decisionOnly'),
    ).not.toHaveProperty('evidenceReceipts')
  })
})
