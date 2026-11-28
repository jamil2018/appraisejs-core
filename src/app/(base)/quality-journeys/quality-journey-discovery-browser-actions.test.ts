import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  authorizeReturn: vi.fn(),
  capture: vi.fn(),
  seal: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/app-managed-discovery-evidence', () => ({ sealManagedScoutEvidenceReview: mocks.seal }))
vi.mock('@/services/coordinator/quality-journey-discovery-browser-service', () => ({
  authorizeQualityJourneyDiscoveryBrowserExactReturn: mocks.authorizeReturn,
  captureQualityJourneyDiscoveryBrowserReceipt: mocks.capture,
  closeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  confirmQualityJourneyDiscoveryBrowserAccess: vi.fn(),
  logoutQualityJourneyDiscoveryBrowserSession: vi.fn(),
  markQualityJourneyDiscoveryBrowserMissingAccess: vi.fn(),
  replaceQualityJourneyDiscoveryBrowserContext: vi.fn(),
  revokeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  startQualityJourneyDiscoveryBrowserSession: vi.fn(),
}))

import {
  authorizeQualityJourneyDiscoveryBrowserExactReturnAction,
  captureQualityJourneyDiscoveryBrowserReceiptAction,
  sealManagedScoutEvidenceReviewAction,
} from './quality-journey-discovery-browser-actions'

const input = { journeyId: 'journey-1', discoveryRevisionId: 'discovery-1', sessionId: 'session-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.authorizeReturn.mockResolvedValue({
    return: 'RETURN_COMMITTED',
    session: { id: 'session-1', state: 'ACTIVE' },
  })
  mocks.capture.mockResolvedValue({ artifactId: 'receipt-1' })
  mocks.seal.mockResolvedValue({ reviewHash: `sha256:${'a'.repeat(64)}` })
})

describe('Managed Discovery review actions', () => {
  it('uses the managed manual capture path only after resolving the active project', async () => {
    const response = await captureQualityJourneyDiscoveryBrowserReceiptAction({ ...input, snapshotId: 'snapshot-1' })
    expect(response.success).toBe(true)
    expect(mocks.capture).toHaveBeenCalledWith(
      { ...input, snapshotId: 'snapshot-1', targetProjectId: 'target-1' },
      undefined,
      { managedManual: true },
    )
  })

  it('passes the exact review hash to the scoped service and revalidates the Journey', async () => {
    const reviewHash = `sha256:${'a'.repeat(64)}`
    const response = await sealManagedScoutEvidenceReviewAction({
      journeyId: 'journey-1',
      discoveryRevisionId: 'discovery-1',
      reviewHash,
    })
    expect(response.success).toBe(true)
    expect(mocks.seal).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      discoveryRevisionId: 'discovery-1',
      reviewHash,
      targetProjectId: 'target-1',
    })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })

  it('rejects client-supplied project authority and malformed hashes', async () => {
    await expect(
      sealManagedScoutEvidenceReviewAction({
        journeyId: 'journey-1',
        discoveryRevisionId: 'discovery-1',
        reviewHash: `sha256:${'a'.repeat(64)}`,
        targetProjectId: 'forged-target',
      }),
    ).resolves.toMatchObject({ success: false })
    await expect(
      sealManagedScoutEvidenceReviewAction({
        journeyId: 'journey-1',
        discoveryRevisionId: 'discovery-1',
        reviewHash: 'stale',
      }),
    ).resolves.toMatchObject({ success: false })
    expect(mocks.seal).not.toHaveBeenCalled()
  })
})

describe('Discovery browser exact-return action', () => {
  it('resolves the target from trusted server context and returns no authorization URL', async () => {
    mocks.authorizeReturn.mockResolvedValueOnce({
      return: 'RETURN_COMMITTED',
      session: { id: 'session-1', state: 'ACTIVE' },
      returnUrl: 'https://must-not-cross.example/checkout',
    })
    const response = await authorizeQualityJourneyDiscoveryBrowserExactReturnAction(input)
    expect(response).toMatchObject({
      success: true,
      data: { return: 'RETURN_COMMITTED' },
    })
    expect(JSON.stringify(response)).not.toContain('returnUrl')
    expect(mocks.authorizeReturn).toHaveBeenCalledWith({ ...input, targetProjectId: 'target-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })

  it('does not report success when the service has not committed the exact return', async () => {
    mocks.authorizeReturn.mockResolvedValueOnce({ return: 'ARMED', session: { id: 'session-1' } })
    await expect(authorizeQualityJourneyDiscoveryBrowserExactReturnAction(input)).resolves.toMatchObject({
      success: false,
    })
  })

  it.each([
    { targetProjectId: 'forged-target' },
    { returnUrl: 'https://attacker.test/checkout' },
    { credential: 'must-not-pass' },
    { mfaCode: 'must-not-pass' },
  ])('rejects browser-supplied authority or human-return data', async injected => {
    await expect(
      authorizeQualityJourneyDiscoveryBrowserExactReturnAction({ ...input, ...injected }),
    ).resolves.toMatchObject({
      success: false,
    })
    expect(mocks.authorizeReturn).not.toHaveBeenCalled()
  })
})
