import { describe, expect, it, vi } from 'vitest'

import { assertLoopbackOriginReservation, normalizedLoopbackOrigin } from './environment-origin-reservation'

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
      assertLoopbackOriginReservation({ baseUrl: 'http://127.0.0.1:4173', targetProjectId: 'project-one' }, client),
    ).rejects.toMatchObject({ details: expect.objectContaining({ code: 'ENVIRONMENT_ORIGIN_RESERVED' }) })
  })
})
