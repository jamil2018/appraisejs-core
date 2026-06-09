import { beforeEach, describe, expect, it, vi } from 'vitest'

import { guardCoordinatorRequest, readCoordinatorJson } from './request-guard'

const { authenticateProject, ensureProjectIdentity } = vi.hoisted(() => ({
  authenticateProject: vi.fn(),
  ensureProjectIdentity: vi.fn(),
}))

vi.mock('@/services/coordinator/coordinator-service', () => ({
  COORDINATOR_MAX_REQUEST_BYTES: 1_048_576,
  authenticateProject,
  ensureProjectIdentity,
}))

function request(url = 'http://127.0.0.1:3000/api/internal/coordinator/plans') {
  return new Request(url, {
    headers: {
      authorization: 'Bearer token',
      host: '127.0.0.1:3000',
      'x-appraise-project': 'sha256:project',
    },
  })
}

beforeEach(() => {
  authenticateProject.mockReset().mockResolvedValue(undefined)
  ensureProjectIdentity.mockReset().mockResolvedValue(undefined)
})

describe('coordinator request guard', () => {
  it('accepts authenticated loopback requests', async () => {
    await expect(guardCoordinatorRequest(request())).resolves.toBeUndefined()
    expect(authenticateProject).toHaveBeenCalledWith('sha256:project', 'token')
  })

  it('rejects DNS-rebinding hosts and non-loopback origins', async () => {
    await expect(
      guardCoordinatorRequest(
        new Request('http://127.0.0.1:3000/api/internal/coordinator/plans', {
          headers: {
            authorization: 'Bearer token',
            host: 'attacker.example',
            'x-appraise-project': 'sha256:project',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    await expect(
      guardCoordinatorRequest(
        new Request('http://localhost:3000/api/internal/coordinator/plans', {
          headers: {
            authorization: 'Bearer token',
            host: 'localhost:3000',
            origin: 'https://attacker.example',
            'x-appraise-project': 'sha256:project',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects declared and actual oversized request bodies', async () => {
    const declared = request()
    declared.headers.set('content-length', '1048577')
    await expect(guardCoordinatorRequest(declared)).rejects.toMatchObject({ statusCode: 413 })

    const actual = new Request('http://localhost', { method: 'POST', body: 'x'.repeat(1_048_577) })
    await expect(readCoordinatorJson(actual)).rejects.toMatchObject({ statusCode: 413 })
  })
})
