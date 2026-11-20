import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({ project: vi.fn(), start: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-analysis-service', () => ({ startAppManagedAnalysis: mocks.start }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { startQualityJourneyManagedAnalysisAction } from './quality-journey-managed-analysis-actions'
const input = { journeyId: 'journey-1', expectedStateHash: `sha256:${'a'.repeat(64)}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.start.mockResolvedValue({ analysisRevisionId: 'analysis-1', awaitingAnswers: false })
})

describe('managed Analysis server action', () => {
  it('resolves project ownership on the server and refreshes the canonical Journey after publication', async () => {
    await expect(startQualityJourneyManagedAnalysisAction(input)).resolves.toMatchObject({ success: true, status: 200 })
    expect(mocks.start).toHaveBeenCalledWith({ ...input, targetProjectId: 'project-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('rejects client-supplied project and credential fields before orchestration', async () => {
    await expect(
      startQualityJourneyManagedAnalysisAction({ ...input, targetProjectId: 'other' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('preserves canonical conflict classification', async () => {
    mocks.start.mockRejectedValueOnce(new ServiceError('Original dispatch is UNKNOWN.', 'CONFLICT'))
    await expect(startQualityJourneyManagedAnalysisAction(input)).resolves.toMatchObject({
      success: false,
      status: 409,
      error: 'Original dispatch is UNKNOWN.',
    })
  })
})
