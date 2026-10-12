import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  context: vi.fn(),
  materialize: vi.fn(),
  externalMaterialize: vi.fn(),
}))

vi.mock('@/services/target-project/target-project-service', () => ({ resolveTargetProject: mocks.resolve }))
vi.mock('@/services/coordinator/quality-journey-automation-service', () => ({
  getQualityJourneyAutomationContext: mocks.context,
  materializeQualityJourneyApprovedScenarios: mocks.materialize,
  materializeExternalQualityJourneyApprovedScenarios: mocks.externalMaterialize,
}))

import { getQualityJourneyAutomationRoute, postQualityJourneyAutomationRoute } from './quality-journey-automation-route'

const path = ['quality', 'journeys', 'journey-1', 'automation']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolve.mockResolvedValue({ id: 'target-1' })
  mocks.context.mockResolvedValue({ inputHash: 'context-hash' })
  mocks.externalMaterialize.mockResolvedValue({ stage: 'AUTOMATION' })
})

describe('automation coordinator route', () => {
  it('resolves the Journey and target for the external Automator submission', async () => {
    const principal = { principalId: 'project-principal' } as never
    const response = await postQualityJourneyAutomationRoute(
      [...path, 'external-materializations'],
      { target: '/selected/target', workItemId: 'work-1' },
      undefined,
      principal,
    )

    expect(mocks.resolve).toHaveBeenCalledWith('/selected/target')
    expect(mocks.externalMaterialize).toHaveBeenCalledWith(
      { journeyId: 'journey-1', targetProjectId: 'target-1', workItemId: 'work-1' },
      principal,
      undefined,
      undefined,
    )
    expect(response?.status).toBe(201)
    expect(mocks.materialize).not.toHaveBeenCalled()
  })

  it.each(['journeyId', 'targetProjectId'])(
    'rejects caller-supplied %s before resolving target or writing',
    async field => {
      await expect(
        postQualityJourneyAutomationRoute(
          [...path, 'external-materializations'],
          { target: '/selected/target', [field]: 'foreign' },
          undefined,
          { principalId: 'project-principal' } as never,
        ),
      ).rejects.toThrow('resolved by Appraise')
      expect(mocks.resolve).not.toHaveBeenCalled()
      expect(mocks.externalMaterialize).not.toHaveBeenCalled()
    },
  )

  it('requires an external project principal for the external submission', async () => {
    await expect(
      postQualityJourneyAutomationRoute([...path, 'external-materializations'], { target: '/selected/target' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(mocks.externalMaterialize).not.toHaveBeenCalled()
  })

  it('reads the exact target-scoped context and exposes no execution route', async () => {
    const response = await getQualityJourneyAutomationRoute(
      [...path, 'context'],
      new URLSearchParams({ target: '/selected/target' }),
    )
    expect(mocks.context).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'target-1' })
    expect(response?.status).toBe(200)
    expect(await getQualityJourneyAutomationRoute([...path, 'execution'], new URLSearchParams())).toBeUndefined()
  })
})
