import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFindFirst, mockReadBytes, archiveState } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockReadBytes: vi.fn(),
  archiveState: { names: [] as string[] },
}))

vi.mock('@/config/db-config', () => ({ default: { testRun: { findFirst: mockFindFirst } } }))
vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mockReadBytes
  },
}))
vi.mock('archiver', () => ({
  default: vi.fn(() => {
    const listeners = new Map<string, Array<(value?: Buffer) => void>>()
    return {
      on(event: string, callback: (value?: Buffer) => void) {
        listeners.set(event, [...(listeners.get(event) ?? []), callback])
      },
      append(_bytes: Buffer, options: { name: string }) {
        archiveState.names.push(options.name)
      },
      finalize() {
        for (const callback of listeners.get('data') ?? []) callback(Buffer.from('zip'))
        for (const callback of listeners.get('end') ?? []) callback()
      },
    }
  }),
}))

import { GET } from './route'

describe('test run download route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    archiveState.names = []
  })

  it('returns 404 when the test run does not exist', async () => {
    mockFindFirst.mockResolvedValue(null)
    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download?targetProjectId=p1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })
    expect(response.status).toBe(404)
  })

  it('archives only capsule artifacts scoped to the run project', async () => {
    mockFindFirst.mockResolvedValue({
      runId: 'run-1',
      targetProjectId: 'p1',
      testCases: [{ id: 'trtc-1', testCaseId: 'case-1', tracePath: 'traces/one.zip' }],
    })
    mockReadBytes.mockResolvedValue({ bytes: Buffer.from('artifact') })
    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download?targetProjectId=p1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })
    expect(response.status).toBe(200)
    expect(archiveState.names).toEqual(['cucumber.json', 'logs/cucumber.log', 'traces/case-1.zip'])
    expect(mockReadBytes).toHaveBeenLastCalledWith({
      runId: 'run-1',
      kind: 'trace',
      testCaseId: 'trtc-1',
      storedPath: 'traces/one.zip',
      expectedTargetProjectId: 'p1',
    })
  })

  it('returns an opaque conflict for oversized capsule archives', async () => {
    mockFindFirst.mockResolvedValue({
      runId: 'run-1',
      targetProjectId: 'p1',
      testCases: [
        { id: 'one', testCaseId: 'one', tracePath: 'traces/one.zip' },
        { id: 'two', testCaseId: 'two', tracePath: 'traces/two.zip' },
      ],
    })
    mockReadBytes.mockResolvedValue({ bytes: Buffer.alloc(70 * 1024 * 1024) })
    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download?targetProjectId=p1'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Artifact integrity conflict.' })
  })
})
