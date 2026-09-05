import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), export: vi.fn(), resolve: vi.fn() }))
vi.mock('@/services/coordinator/quality-journey-artifact-library-service', () => ({
  listQualityJourneyArtifactLibrary: mocks.list,
  getQualityJourneyLibraryArtifact: mocks.get,
  exportQualityJourney: mocks.export,
}))
vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))
import { getQualityJourneyLibraryRoute } from './quality-journey-library-route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'project-1' })
  mocks.list.mockResolvedValue({ entries: [] })
  mocks.get.mockResolvedValue({ entryId: 'artifact-1' })
  mocks.export.mockResolvedValue({ artifacts: [] })
})

it('binds reads to the resolved target and path journey', async () => {
  await getQualityJourneyLibraryRoute(
    ['quality', 'journeys', 'journey-1', 'library'],
    new URLSearchParams('target=registered&limit=20&offset=2'),
  )
  expect(mocks.list).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    targetProjectId: 'project-1',
    limit: 20,
    offset: 2,
    kind: undefined,
  })
  await getQualityJourneyLibraryRoute(
    ['quality', 'journeys', 'journey-1', 'library', 'artifact-1'],
    new URLSearchParams('target=registered'),
  )
  expect(mocks.get).toHaveBeenCalledWith({
    journeyId: 'journey-1',
    targetProjectId: 'project-1',
    entryId: 'artifact-1',
  })
  await getQualityJourneyLibraryRoute(
    ['quality', 'journeys', 'journey-1', 'export'],
    new URLSearchParams('target=registered'),
  )
  expect(mocks.export).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
})

it.each(['targetProjectId=other', 'journeyId=other', 'actor=USER', 'limit=101', 'offset=-1'])(
  'rejects invalid or caller-injected scope %s before resolving',
  async parameter => {
    await expect(
      getQualityJourneyLibraryRoute(
        ['quality', 'journeys', 'journey-1', 'library'],
        new URLSearchParams(`target=registered&${parameter}`),
      ),
    ).rejects.toThrow()
    expect(mocks.resolve).not.toHaveBeenCalled()
  },
)
