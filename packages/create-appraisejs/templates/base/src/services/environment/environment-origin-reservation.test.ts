import { describe, expect, it, vi } from 'vitest'

import {
  assertLoopbackOriginReservation,
  normalizedLoopbackOrigin,
  suggestAvailableLoopbackBaseUrl,
} from './environment-origin-reservation'

describe('loopback environment origin reservation', () => {
  it('normalizes localhost aliases to one reservable origin', () => {
    expect(normalizedLoopbackOrigin('http://localhost:4173/path')).toBe('http://127.0.0.1:4173')
    expect(normalizedLoopbackOrigin('http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173')
  })

  it('rejects a loopback origin already assigned to another target project', async () => {
    const client = {
      environment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'environment-two', name: 'local', baseUrl: 'http://localhost:4173', targetProjectId: 'project-two' },
          ]),
      },
    } as never
    await expect(
      assertLoopbackOriginReservation(
        { baseUrl: 'http://127.0.0.1:4173', targetProjectId: 'project-one' },
        client,
        vi.fn().mockResolvedValue(true),
      ),
    ).rejects.toMatchObject({
      details: expect.objectContaining({
        code: 'ENVIRONMENT_ORIGIN_RESERVED',
        suggestedBaseUrl: 'http://127.0.0.1:4174',
      }),
    })
  })

  it('suggests the first available port that is not reserved by another target project', async () => {
    const client = {
      environment: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: 'environment-two', name: 'local', baseUrl: 'http://localhost:4174', targetProjectId: 'project-two' },
          ]),
      },
    } as never
    const isPortAvailable = vi.fn().mockResolvedValue(true)

    await expect(
      suggestAvailableLoopbackBaseUrl(
        { baseUrl: 'http://127.0.0.1:4173', targetProjectId: 'project-one' },
        client,
        isPortAvailable,
      ),
    ).resolves.toBe('http://127.0.0.1:4175')
    expect(isPortAvailable).toHaveBeenCalledTimes(1)
    expect(isPortAvailable).toHaveBeenCalledWith(4175, '127.0.0.1')
  })
})
