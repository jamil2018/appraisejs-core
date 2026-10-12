import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ project: vi.fn(), pause: vi.fn(), resume: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-recovery-service', () => ({
  pauseQualityJourneyOperational: mocks.pause,
  resumeQualityJourneyOperational: mocks.resume,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import { qualityJourneyRecoveryAction } from './quality-journey-recovery-actions'

const request = {
  journeyId: 'journey-1',
  expectedStateHash: `sha256:${'a'.repeat(64)}`,
  expectedVersion: 2,
  idempotencyKey: 'pause-key-1',
  reason: 'Need to reconcile owned processes.',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-active' })
  mocks.pause.mockResolvedValue({ operationalStatus: 'PAUSED' })
})

it('uses local active project scope and never accepts a caller target', async () => {
  expect(await qualityJourneyRecoveryAction('pause', { ...request, targetProjectId: 'project-other' })).toMatchObject({
    success: false,
    status: 400,
  })
  expect(mocks.pause).not.toHaveBeenCalled()
  expect(await qualityJourneyRecoveryAction('pause', request)).toMatchObject({ success: true })
  expect(mocks.pause).toHaveBeenCalledWith({ ...request, targetProjectId: 'project-active' })
  expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
})
