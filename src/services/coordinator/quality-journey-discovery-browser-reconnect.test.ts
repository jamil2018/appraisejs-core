import { beforeEach, expect, it, vi } from 'vitest'
import { reconnectDiscoveryBrowser } from './quality-journey-discovery-browser-reconnect'

const mocks = vi.hoisted(() => ({ rows: vi.fn(), live: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: { qualityJourneyOwnedBrowser: { findMany: mocks.rows } } }))
vi.mock('./quality-journey-discovery-browser-service', () => ({ getQualityJourneyDiscoveryBrowserSession: mocks.live }))

const scope = { journeyId: 'journey', targetProjectId: 'project', discoveryRevisionId: 'discovery' }
beforeEach(() => vi.clearAllMocks())

it('looks up the selected project and delegates exact revision and process ownership verification', async () => {
  mocks.rows.mockResolvedValue([{ sessionId: 'existing' }])
  mocks.live.mockResolvedValue({ id: 'existing' })
  await expect(reconnectDiscoveryBrowser(scope)).resolves.toEqual({ id: 'existing' })
  expect(mocks.rows).toHaveBeenCalledWith({
    where: { journeyId: 'journey', targetProjectId: 'project', status: 'LIVE' },
    select: { sessionId: true },
    take: 2,
  })
  expect(mocks.live).toHaveBeenCalledWith({ ...scope, sessionId: 'existing' })
})
it.each([[], [{ sessionId: 'one' }, { sessionId: 'two' }]])('requires exactly one live session', async (...rows) => {
  mocks.rows.mockResolvedValue(rows)
  await expect(reconnectDiscoveryBrowser(scope)).rejects.toThrow(/browser/i)
  expect(mocks.live).not.toHaveBeenCalled()
})
