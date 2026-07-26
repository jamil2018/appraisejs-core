import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cookies, findUnique } = vi.hoisted(() => ({
  cookies: vi.fn(),
  findUnique: vi.fn(),
}))

vi.mock('next/headers', () => ({ cookies }))
vi.mock('@/config/db-config', () => ({
  default: { planProjection: { findUnique } },
}))

import { requireActiveProjectForPlanMutation } from './active-project'

describe('requireActiveProjectForPlanMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findUnique.mockResolvedValue({
      targetProject: {
        id: 'project-for-plan',
        displayName: 'Plan project',
        canonicalPath: '/tmp/plan-project',
      },
    })
  })

  it('uses the authoritative plan binding when the navigation cookie is stale', async () => {
    cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'previous-project' }),
    })

    await expect(requireActiveProjectForPlanMutation('plan-1')).resolves.toEqual({
      id: 'project-for-plan',
      displayName: 'Plan project',
      canonicalPath: '/tmp/plan-project',
      source: 'url',
    })
  })

  it('retains cookie provenance when the active project matches the plan', async () => {
    cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: 'project-for-plan' }),
    })

    await expect(requireActiveProjectForPlanMutation('plan-1')).resolves.toMatchObject({
      id: 'project-for-plan',
      source: 'cookie',
    })
  })
})
