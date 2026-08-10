import { beforeEach, describe, expect, it, vi } from 'vitest'

import { guardCoordinatorRequest, readCoordinatorJson } from './request-guard'

const { deriveCoordinatorProjectIdentity, readFile } = vi.hoisted(() => ({
  deriveCoordinatorProjectIdentity: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('./project-identity', () => ({ deriveCoordinatorProjectIdentity }))
vi.mock('node:fs', () => ({ promises: { readFile } }))

function request(token = 'token', url = 'http://127.0.0.1:3000/api/internal/coordinator/quality/assessments') {
  return new Request(url, {
    headers: {
      authorization: `Bearer ${token}`,
      host: '127.0.0.1:3000',
      'x-appraise-project': 'sha256:project',
    },
  })
}

beforeEach(() => {
  deriveCoordinatorProjectIdentity.mockReset().mockResolvedValue({
    projectFingerprint: 'sha256:project',
    canonicalProjectPath: '/tmp/project',
  })
  readFile.mockReset().mockResolvedValue(JSON.stringify({ projectFingerprint: 'sha256:project', token: 'token' }))
})

describe('coordinator request guard', () => {
  it('accepts authenticated loopback requests with the local project credential', async () => {
    await expect(guardCoordinatorRequest(request())).resolves.toBeUndefined()
    expect(readFile).toHaveBeenCalledWith('/tmp/project/.appraisejs/coordinator.json', 'utf8')
  })

  it('distinguishes a project mismatch before reading a credential', async () => {
    deriveCoordinatorProjectIdentity.mockResolvedValue({
      projectFingerprint: 'sha256:server',
      canonicalProjectPath: '/tmp/server-project',
    })
    await expect(guardCoordinatorRequest(request())).rejects.toMatchObject({
      name: 'CoordinatorProjectMismatchError',
      requestedFingerprint: 'sha256:project',
      serverFingerprint: 'sha256:server',
    })
    expect(readFile).not.toHaveBeenCalled()
  })

  it('rejects credential mismatches and non-loopback origins', async () => {
    await expect(guardCoordinatorRequest(request('wrong-token'))).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      guardCoordinatorRequest(
        new Request('http://localhost:3000/api/internal/coordinator/quality/assessments', {
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
