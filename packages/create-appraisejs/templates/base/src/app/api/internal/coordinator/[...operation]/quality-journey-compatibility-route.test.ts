import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn() }))

vi.mock('@/services/coordinator/quality-journey-compatibility-service', () => ({
  readQualityJourneyCompatibility: mocks.read,
}))
vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))

import { getQualityJourneyCompatibilityRoute } from './quality-journey-compatibility-route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'target-1' })
  mocks.read.mockResolvedValue({ compatibility: 'READ_ONLY' })
})

it('binds compatibility reads to the resolved target and exact optional detail pair', async () => {
  await getQualityJourneyCompatibilityRoute(
    ['quality', 'compatibility'],
    new URLSearchParams('target=registered&qualityPlanId=plan-1&revisionId=revision-1&offset=2&limit=20'),
  )
  expect(mocks.read).toHaveBeenCalledWith({
    targetProjectId: 'target-1',
    qualityPlanId: 'plan-1',
    revisionId: 'revision-1',
    offset: 2,
    limit: 20,
  })
})

it.each(['qualityPlanId=plan-1', 'revisionId=revision-1', 'targetProjectId=other', 'limit=101'])(
  'rejects partial or caller-injected scope before resolving %s',
  async parameter => {
    await expect(
      getQualityJourneyCompatibilityRoute(
        ['quality', 'compatibility'],
        new URLSearchParams(`target=registered&${parameter}`),
      ),
    ).rejects.toThrow()
    expect(mocks.resolve).not.toHaveBeenCalled()
  },
)
