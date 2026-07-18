import { describe, expect, it, vi } from 'vitest'

import type { ValidationArtifact } from '@/lib/plan-contract'
import { preflightBaselineEnvironments } from './environment-runtime-preflight-service'

const validation = {
  validations: [{ matrix: [{ browser: 'chromium', environment: 'local' }] }],
} as unknown as ValidationArtifact

function client(input: { title?: string; expectedPageTitle?: string | null; foreignName?: string }) {
  return {
    environment: {
      findMany: vi.fn().mockImplementation(({ where }) =>
        where.targetProjectId?.not
          ? []
          : [
              {
                id: 'environment-one',
                name: 'local',
                baseUrl: 'http://127.0.0.1:4317',
                expectedPageTitle: input.expectedPageTitle ?? null,
              },
            ],
      ),
    },
    targetProject: {
      findMany: vi
        .fn()
        .mockResolvedValue(input.foreignName ? [{ id: 'project-two', displayName: input.foreignName }] : []),
    },
  } as never
}

const target = { id: 'project-one', displayName: 'HomeChores', canonicalPath: '/tmp/HomeChores' }

describe('baseline environment runtime preflight', () => {
  it('verifies a reachable loopback target by exact page title', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<title>HomeChores</title>'))
    await expect(preflightBaselineEnvironments(validation, target, client({}), fetchImpl)).resolves.toEqual([
      expect.objectContaining({ status: 'verified', observedPageTitle: 'HomeChores' }),
    ])
  })

  it('blocks an explicit page-title mismatch before baseline execution', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<title>SecondWife</title>'))
    await expect(
      preflightBaselineEnvironments(
        validation,
        target,
        client({ expectedPageTitle: 'HomeChores', foreignName: 'SecondWife' }),
        fetchImpl,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: expect.objectContaining({
        code: 'ENVIRONMENT_IDENTITY_MISMATCH',
        observedPageTitle: 'SecondWife',
      }),
    })
  })

  it('treats an unused loopback origin as available for expected-red baseline execution', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(preflightBaselineEnvironments(validation, target, client({}), fetchImpl)).resolves.toEqual([
      expect.objectContaining({ status: 'available' }),
    ])
  })
})
