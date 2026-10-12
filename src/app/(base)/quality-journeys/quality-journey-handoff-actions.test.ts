import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  findProject: vi.fn(),
  inspect: vi.fn(),
  prepare: vi.fn(),
  launch: vi.fn(),
  approve: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies }))
vi.mock('@/config/db-config', () => ({ default: { targetProject: { findUnique: mocks.findProject } } }))
vi.mock('@/services/coordinator/quality-journey-handoff-service', () => ({
  inspectQualityJourneyHandoff: mocks.inspect,
  prepareQualityJourneyHandoff: mocks.prepare,
  launchQualityJourneyHandoff: mocks.launch,
  approveQualityJourneyHandoffTakeover: mocks.approve,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))

import {
  approveQualityJourneyHandoffTakeoverAction,
  inspectQualityJourneyHandoffAction,
  launchQualityJourneyHandoffAction,
  prepareQualityJourneyHandoffAction,
} from './quality-journey-handoff-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.cookies.mockResolvedValue({ get: () => ({ value: 'project-a' }) })
  mocks.findProject.mockImplementation(async ({ where }: { where: { id: string } }) =>
    ['project-a', 'project-b'].includes(where.id) ? { id: where.id } : null,
  )
  mocks.inspect.mockResolvedValue({ handoff: { status: 'EXPIRED' } })
  mocks.prepare.mockResolvedValue({ handoffId: 'handoff-1' })
  mocks.launch.mockResolvedValue({ status: 'LAUNCHED' })
  mocks.approve.mockResolvedValue({ handoffId: 'handoff-1' })
})

describe('read-only handoff inspection', () => {
  it('resolves the explicitly selected registered project and scopes the Journey read to it', async () => {
    await expect(
      inspectQualityJourneyHandoffAction({ journeyId: 'journey-b', projectId: 'project-b' }),
    ).resolves.toMatchObject({
      status: 200,
      success: true,
      data: { handoff: { status: 'EXPIRED' } },
    })
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-b' } }))
    expect(mocks.inspect).toHaveBeenCalledWith({ journeyId: 'journey-b', targetProjectId: 'project-b' })
    expect(mocks.findProject).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-a' } }))
  })

  it.each([{}, { projectId: '' }, { projectId: 'x'.repeat(201) }, { projectId: 'project-b', extra: true }])(
    'rejects a missing, invalid, or expanded inspection target',
    async invalid => {
      await expect(inspectQualityJourneyHandoffAction({ journeyId: 'journey-b', ...invalid })).resolves.toMatchObject({
        success: false,
      })
      expect(mocks.findProject).not.toHaveBeenCalled()
      expect(mocks.inspect).not.toHaveBeenCalled()
    },
  )

  it('rejects an unregistered selected project without falling back to another project', async () => {
    await expect(
      inspectQualityJourneyHandoffAction({ journeyId: 'journey-b', projectId: 'missing-project' }),
    ).resolves.toMatchObject({ success: false, status: 400 })
    expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'missing-project' } }))
    expect(mocks.findProject).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-a' } }))
    expect(mocks.inspect).not.toHaveBeenCalled()
  })
})

it('retains the active-cookie guard for prepare, launch, and takeover mutations', async () => {
  await expect(prepareQualityJourneyHandoffAction({ journeyId: 'journey-a' })).resolves.toMatchObject({ success: true })
  await expect(
    launchQualityJourneyHandoffAction({
      journeyId: 'journey-a',
      handoffId: 'handoff-1',
      launchUrl: 'https://example.test/launch',
    }),
  ).resolves.toMatchObject({ success: true })
  await expect(
    approveQualityJourneyHandoffTakeoverAction({
      journeyId: 'journey-a',
      handoffId: 'handoff-1',
      generation: 1,
      takeoverApproval: `qjha_${'a'.repeat(32)}`,
      takeoverRequestId: `qjhr_${'b'.repeat(32)}`,
    }),
  ).resolves.toMatchObject({ success: true })

  expect(mocks.findProject).toHaveBeenCalledTimes(3)
  expect(mocks.findProject).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'project-a' } }))
  expect(mocks.prepare).toHaveBeenCalledWith({
    journeyId: 'journey-a',
    targetProjectId: 'project-a',
    providerId: 'codex',
  })
  expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ targetProjectId: 'project-a' }))
  expect(mocks.approve).toHaveBeenCalledWith(expect.objectContaining({ targetProjectId: 'project-a' }))
})
