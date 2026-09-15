import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ project: vi.fn(), arm: vi.fn(), revalidate: vi.fn() }))

vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/services/coordinator/quality-journey-discovery-browser-service', () => ({
  armQualityJourneyDiscoveryBrowserHumanReturn: mocks.arm,
  captureQualityJourneyDiscoveryBrowserReceipt: vi.fn(),
  closeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  confirmQualityJourneyDiscoveryBrowserAccess: vi.fn(),
  logoutQualityJourneyDiscoveryBrowserSession: vi.fn(),
  markQualityJourneyDiscoveryBrowserMissingAccess: vi.fn(),
  replaceQualityJourneyDiscoveryBrowserContext: vi.fn(),
  revokeQualityJourneyDiscoveryBrowserSession: vi.fn(),
  startQualityJourneyDiscoveryBrowserSession: vi.fn(),
}))

import { armQualityJourneyDiscoveryBrowserHumanReturnAction } from './quality-journey-discovery-browser-actions'

const input = { journeyId: 'journey-1', discoveryRevisionId: 'discovery-1', sessionId: 'session-1' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'target-1' })
  mocks.arm.mockResolvedValue({
    session: { id: 'session-1', state: 'ACTIVE' },
    returnUrl: 'https://example.test/checkout',
  })
})

describe('Discovery browser human-return action', () => {
  it('resolves the target from trusted server context and returns only the service-derived frozen URL', async () => {
    await expect(armQualityJourneyDiscoveryBrowserHumanReturnAction(input)).resolves.toMatchObject({
      success: true,
      data: { returnUrl: 'https://example.test/checkout' },
    })
    expect(mocks.arm).toHaveBeenCalledWith({ ...input, targetProjectId: 'target-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })

  it.each([
    { targetProjectId: 'forged-target' },
    { returnUrl: 'https://attacker.test/checkout' },
    { credential: 'must-not-pass' },
    { mfaCode: 'must-not-pass' },
  ])('rejects browser-supplied authority or human-return data', async injected => {
    await expect(armQualityJourneyDiscoveryBrowserHumanReturnAction({ ...input, ...injected })).resolves.toMatchObject({
      success: false,
    })
    expect(mocks.arm).not.toHaveBeenCalled()
  })
})
