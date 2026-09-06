import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ project: vi.fn(), status: vi.fn() }))

vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-query-service', () => ({
  getQualityJourneyStatusSnapshot: mocks.status,
}))

import { readQualityJourneyStatusAction } from './quality-journey-status-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.status.mockResolvedValue({ journeyId: 'journey-1', closed: false })
})

it('reads a status snapshot in the active project without accepting caller project scope', async () => {
  await expect(readQualityJourneyStatusAction({ journeyId: 'journey-1' })).resolves.toMatchObject({
    success: true,
    data: { journeyId: 'journey-1' },
  })
  expect(mocks.status).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })

  await expect(
    readQualityJourneyStatusAction({ journeyId: 'journey-1', targetProjectId: 'other-project' }),
  ).resolves.toMatchObject({ success: false, status: 400 })
  expect(mocks.status).toHaveBeenCalledTimes(1)
})
