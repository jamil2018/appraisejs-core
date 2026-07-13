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

import { addPlanRemarkAction, completeImplementationAction } from './plan-review-actions'

describe('plan review actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(result).toEqual({ status: 200, success: true })
    expect(addPlanRemark).toHaveBeenCalledWith({
      planId,
      target: { type: 'plan' },
      body: 'Needs a blocker.',
      blocking: true,
    })
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
    ).resolves.toMatchObject({ status: 400, success: false })
    expect(addPlanRemark).not.toHaveBeenCalled()
  })

  it('requires explicit completion intent and binds the exact evidence hash', async () => {
    const planId = 'pln_01jz7q1by2e4prv55bda9xf39m'
    const evidenceHash = `sha256:${'a'.repeat(64)}`

    await expect(
      completeImplementationAction({ planId, evidenceHash, confirmCompletion: false }),
    ).resolves.toMatchObject({ status: 400, success: false })
    expect(approveImplementationCompletion).not.toHaveBeenCalled()

    approveImplementationCompletion.mockResolvedValueOnce(undefined)
    await expect(completeImplementationAction({ planId, evidenceHash, confirmCompletion: true })).resolves.toEqual({
      status: 200,
      success: true,
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
      status: 409,
      success: false,
      details: { staleEvidenceHash: evidenceHash, currentEvidenceHash },
    })
  })
})
