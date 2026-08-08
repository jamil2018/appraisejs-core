import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { ServiceError } from '@/services/shared/errors'

const {
  addPlanRemark,
  approvePlanRevision,
  publishSharedPlanLayout,
  requestPlanChanges,
  retargetPlanRemark,
  savePersonalPlanLayout,
  transitionPlanRemark,
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  startBaselineExecution,
  startImplementation,
  approveImplementationCompletion,
  CoordinatorPlanCreatePartialError,
  requireActiveProjectForPlanMutation,
  assertPlanBelongsToProject,
} = vi.hoisted(() => ({
  addPlanRemark: vi.fn(),
  approvePlanRevision: vi.fn(),
  publishSharedPlanLayout: vi.fn(),
  requestPlanChanges: vi.fn(),
  retargetPlanRemark: vi.fn(),
  savePersonalPlanLayout: vi.fn(),
  transitionPlanRemark: vi.fn(),
  acceptBaseline: vi.fn(),
  acknowledgeBaselineFailure: vi.fn(),
  cancelBaselineExecution: vi.fn(),
  justifyBaselineRegressionPass: vi.fn(),
  reconcileBaselineExecution: vi.fn(),
  startBaselineExecution: vi.fn(),
  startImplementation: vi.fn(),
  approveImplementationCompletion: vi.fn(),
  CoordinatorPlanCreatePartialError: class CoordinatorPlanCreatePartialError extends Error {},
  requireActiveProjectForPlanMutation: vi.fn(),
  assertPlanBelongsToProject: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/services/plan-review/plan-review-service', () => ({
  addPlanRemark,
  approvePlanRevision,
  publishSharedPlanLayout,
  requestPlanChanges,
  retargetPlanRemark,
  savePersonalPlanLayout,
  transitionPlanRemark,
}))

vi.mock('@/services/coordinator/coordinator-baseline-service', () => ({
  acceptBaseline,
  acknowledgeBaselineFailure,
  cancelBaselineExecution,
  justifyBaselineRegressionPass,
  reconcileBaselineExecution,
  startBaselineExecution,
  startImplementation,
}))

vi.mock('@/services/coordinator/coordinator-implementation-service', () => ({
  approveImplementationCompletion,
}))

vi.mock('@/lib/active-project', () => ({ requireActiveProjectForPlanMutation }))

vi.mock('@/services/coordinator/coordinator-plan-service', () => ({
  assertPlanBelongsToProject,
  CoordinatorPlanCreatePartialError,
}))

import { addPlanRemarkAction, completeImplementationAction } from './plan-review-actions'

describe('plan review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireActiveProjectForPlanMutation.mockResolvedValue({ id: 'project-one' })
    assertPlanBelongsToProject.mockResolvedValue(undefined)
  })

  it('accepts opaque plan IDs when adding remarks', async () => {
    const planId = 'pln_01jz7q1by2e4prv55bda9xf39m'
    addPlanRemark.mockResolvedValueOnce(undefined)

    const result = await addPlanRemarkAction({
      planId,
      target: { type: 'plan' },
      body: ' Needs a blocker. ',
      blocking: true,
    })

    expect(result).toEqual({ kind: 'appraise.ack/v1', ok: true })
    expect(addPlanRemark).toHaveBeenCalledWith({
      planId,
      target: { type: 'plan' },
      body: 'Needs a blocker.',
      blocking: true,
    })
    expect(assertPlanBelongsToProject).toHaveBeenCalledWith(planId, 'project-one')
    expect(revalidatePath).toHaveBeenCalledWith('/plans')
    expect(revalidatePath).toHaveBeenCalledWith(`/plans/${planId}`)
  })

  it('returns validation errors instead of throwing server action overlays', async () => {
    await expect(
      addPlanRemarkAction({
        planId: '../bad',
        target: { type: 'plan' },
        body: 'Nope.',
        blocking: false,
      }),
    ).resolves.toMatchObject({
      schema: 'appraise.error/v1',
      classification: 'request_invalid',
      code: 'request_invalid',
      httpStatus: 400,
      operation: { name: 'plan_review_action' },
      operationOutcome: 'not_started',
    })
    expect(addPlanRemark).not.toHaveBeenCalled()
  })

  it('requires explicit completion intent and binds the exact evidence hash', async () => {
    const planId = 'pln_01jz7q1by2e4prv55bda9xf39m'
    const evidenceHash = `sha256:${'a'.repeat(64)}`

    await expect(
      completeImplementationAction({ planId, evidenceHash, confirmCompletion: false }),
    ).resolves.toMatchObject({ schema: 'appraise.error/v1', classification: 'request_invalid', httpStatus: 400 })
    expect(approveImplementationCompletion).not.toHaveBeenCalled()

    approveImplementationCompletion.mockResolvedValueOnce(undefined)
    await expect(completeImplementationAction({ planId, evidenceHash, confirmCompletion: true })).resolves.toEqual({
      kind: 'appraise.ack/v1',
      ok: true,
    })
    expect(approveImplementationCompletion).toHaveBeenCalledWith({
      planId,
      contentHash: evidenceHash,
      approvedBy: 'local-user',
    })
  })

  it('returns the refreshed receipt details when completion evidence is stale', async () => {
    const evidenceHash = `sha256:${'a'.repeat(64)}`
    const currentEvidenceHash = `sha256:${'b'.repeat(64)}`
    approveImplementationCompletion.mockRejectedValueOnce(
      new ServiceError('Completion approval must reference the current completion evidence hash.', 'CONFLICT', 409, {
        staleEvidenceHash: evidenceHash,
        currentEvidenceHash,
      }),
    )

    await expect(
      completeImplementationAction({
        planId: 'pln_01jz7q1by2e4prv55bda9xf39m',
        evidenceHash,
        confirmCompletion: true,
      }),
    ).resolves.toMatchObject({
      schema: 'appraise.error/v1',
      classification: 'state_conflict',
      code: 'state_conflict',
      httpStatus: 409,
      details: { staleEvidenceHash: evidenceHash, currentEvidenceHash },
    })
  })

  it('maps changed validation details to a structured recovery code without legacy action fields', async () => {
    approveImplementationCompletion.mockRejectedValueOnce(
      new ServiceError('Validation files changed after approval or baseline execution.', 'CONFLICT', 409, {
        changedFiles: [{ path: 'automation/features/navigation.feature' }],
      }),
    )

    const result = await completeImplementationAction({
      planId: 'pln_01jz7q1by2e4prv55bda9xf39m',
      evidenceHash: `sha256:${'a'.repeat(64)}`,
      confirmCompletion: true,
    })

    expect(result).toMatchObject({ schema: 'appraise.error/v1', code: 'validation_artifact_changed' })
    expect(result).not.toHaveProperty('success')
    expect(result).not.toHaveProperty('error')
  })
})
