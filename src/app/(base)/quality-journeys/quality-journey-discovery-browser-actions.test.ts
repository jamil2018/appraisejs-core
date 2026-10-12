import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ project: vi.fn(), authorizeReturn: vi.fn(), revalidate: vi.fn() }))

vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/quality-journey-discovery-browser-service', () => ({
  authorizeQualityJourneyDiscoveryBrowserExactReturn: mocks.authorizeReturn,
  captureQualityJourneyDiscoveryBrowserReceipt: vi.fn(),
  closeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  confirmQualityJourneyDiscoveryBrowserAccess: vi.fn(),
  logoutQualityJourneyDiscoveryBrowserSession: vi.fn(),
  markQualityJourneyDiscoveryBrowserMissingAccess: vi.fn(),
  replaceQualityJourneyDiscoveryBrowserContext: vi.fn(),
  revokeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  startQualityJourneyDiscoveryBrowserSession: vi.fn(),
}))

import { authorizeQualityJourneyDiscoveryBrowserExactReturnAction } from './quality-journey-discovery-browser-actions'

const input = { journeyId: 'journey-1', discoveryRevisionId: 'discovery-1', sessionId: 'session-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.authorizeReturn.mockResolvedValue({
    return: 'RETURN_COMMITTED',
    session: { id: 'session-1', state: 'ACTIVE' },
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
