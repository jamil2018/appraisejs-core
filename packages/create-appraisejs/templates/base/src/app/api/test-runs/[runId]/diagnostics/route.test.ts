import { beforeEach, describe, expect, it, vi } from 'vitest'
const { findUnique, readDiagnostic } = vi.hoisted(() => ({ findUnique: vi.fn(), readDiagnostic: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: { testRun: { findUnique, findFirst: findUnique } } }))
vi.mock('@/services/test-run/runtime-capsule-diagnostics-service', () => ({
  readRuntimeCapsuleDiagnostic: readDiagnostic,
}))
import { GET } from './route'
describe('GET capsule diagnostics', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns exact no-store DTO', async () => {
    findUnique.mockResolvedValue({ targetProjectId: 'target', runtimeCapsule: { id: 'capsule' } })
    readDiagnostic.mockResolvedValue({ schemaVersion: '1', blockers: [] })
    const response = await GET(new Request('http://localhost?targetProjectId=target'), {
      params: Promise.resolve({ runId: 'run' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    await expect(response.json()).resolves.toEqual({ schemaVersion: '1', blockers: [] })
  })
  it('uses the explicit report project after another project becomes active', async () => {
    findUnique.mockResolvedValue(null)
    const response = await GET(
      new Request('http://localhost/api/test-runs/run/diagnostics?targetProjectId=p1', {
        headers: { cookie: 'appraise-active-project=p2' },
      }),
      { params: Promise.resolve({ runId: 'run' }) },
    )
    expect(response.status).toBe(404)
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { runId: 'run', targetProjectId: 'p1' } }))
  })
  it('maps absent to 404 and corruption to opaque 409', async () => {
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ targetProjectId: 'target', runtimeCapsule: { id: 'capsule' } })
    expect(
      (
        await GET(new Request('http://localhost?targetProjectId=target'), {
          params: Promise.resolve({ runId: 'missing' }),
        })
      ).status,
    ).toBe(404)
    readDiagnostic.mockRejectedValue(new Error('raw receipt path'))
    const response = await GET(new Request('http://localhost?targetProjectId=target'), {
      params: Promise.resolve({ runId: 'run' }),
    })
    expect(response.status).toBe(409)
    expect(JSON.stringify(await response.json())).not.toContain('raw receipt')
  })
})
