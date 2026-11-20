import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({ project: vi.fn(), start: vi.fn(), revalidate: vi.fn(), recover: vi.fn() }))
vi.mock('@/services/coordinator/app-managed-triage-recovery', () => ({ recoverAppManagedTriage: mocks.recover }))
vi.mock('@/lib/active-project', () => ({ requireActiveProjectForMutation: mocks.project }))
vi.mock('@/services/coordinator/app-managed-triage-service', () => ({ startAppManagedTriage: mocks.start }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import {
  startQualityJourneyManagedTriageAction,
  recoverQualityJourneyManagedTriageAction,
} from './quality-journey-managed-triage-actions'

const input = { journeyId: 'journey-1', expectedStateHash: `sha256:${'a'.repeat(64)}` }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ id: 'project-1' })
  mocks.start.mockResolvedValue({ accepted: true, reportRevisionId: 'report-1' })
})
describe('managed triage action', () => {
  it('recovers a retained proposal only in the active project', async () => {
    const request = { ...input, attemptId: 'attempt-1', candidateHash: `sha256:${'b'.repeat(64)}` }
    expect(await recoverQualityJourneyManagedTriageAction(request)).toMatchObject({ success: true })
    expect(mocks.recover).toHaveBeenCalledWith({ ...request, targetProjectId: 'project-1' })
    expect(await recoverQualityJourneyManagedTriageAction({ ...request, targetProjectId: 'forged' })).toMatchObject({
      status: 400,
    })
  })
  it('uses server-resolved project scope and refreshes the canonical report review surface', async () => {
    await expect(startQualityJourneyManagedTriageAction(input)).resolves.toMatchObject({ success: true, status: 200 })
    expect(mocks.start).toHaveBeenCalledWith({ ...input, targetProjectId: 'project-1' })
    expect(mocks.revalidate).toHaveBeenCalledWith('/quality-journeys/journey-1')
  })
  it('rejects client-supplied scope or report content before orchestration', async () => {
    await expect(
      startQualityJourneyManagedTriageAction({ ...input, targetProjectId: 'foreign' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    await expect(startQualityJourneyManagedTriageAction({ ...input, report: {} })).resolves.toMatchObject({
      success: false,
      status: 400,
    })
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('preserves the canonical UNKNOWN conflict', async () => {
    mocks.start.mockRejectedValue(new ServiceError('Triage outcome UNKNOWN.', 'CONFLICT'))
    await expect(startQualityJourneyManagedTriageAction(input)).resolves.toMatchObject({
      success: false,
      status: 409,
      error: 'Triage outcome UNKNOWN.',
    })
  })
})
