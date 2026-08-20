import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockFindFirst, mockGetProcess, mockReadBytes, mockSpawn, mockSnapshot } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockGetProcess: vi.fn(),
  mockReadBytes: vi.fn(),
  mockSpawn: vi.fn(),
  mockSnapshot: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({ default: { testRun: { findFirst: mockFindFirst } } }))
vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mockReadBytes
  },
}))
vi.mock('@/services/test-run/trace-viewer-snapshot-service', () => ({ spawnTraceViewerFromSnapshot: mockSnapshot }))
vi.mock('@/lib/process/task-spawner', () => ({ taskSpawner: { getProcess: mockGetProcess, spawn: mockSpawn } }))

import { GET, POST } from './route'

const traceRequest = (method: 'GET' | 'POST') =>
  new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=p1', { method })
const context = { params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }) }

describe('trace route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when the run is missing', async () => {
    mockFindFirst.mockResolvedValue(null)
    expect((await GET(traceRequest('GET'), context)).status).toBe(404)
  })

  it('returns the existing viewer status only for a case owned by the run', async () => {
    mockFindFirst.mockResolvedValue({ testCases: [{ id: 'trtc-1' }] })
    mockGetProcess.mockReturnValue({ isRunning: true })
    const response = await GET(traceRequest('GET'), context)
    await expect(response.json()).resolves.toEqual({ isRunning: true, processName: 'trace-viewer-trtc-1' })
  })

  it('launches a trace viewer from a capsule-read snapshot', async () => {
    mockFindFirst.mockResolvedValue({
      targetProjectId: 'p1',
      testCases: [{ id: 'trtc-1', tracePath: 'traces/trace.zip' }],
    })
    mockReadBytes.mockResolvedValue({ bytes: Buffer.from('PK trace') })
    mockSnapshot.mockImplementation(async (_bytes: Buffer, spawn: (filePath: string) => Promise<unknown>) =>
      spawn('/tmp/trace.zip'),
    )
    mockSpawn.mockResolvedValue({ name: 'trace-viewer-trtc-1' })
    const response = await POST(traceRequest('POST'), context)
    expect(mockReadBytes).toHaveBeenCalledWith({
      runId: 'run-1',
      kind: 'trace',
      testCaseId: 'trtc-1',
      storedPath: 'traces/trace.zip',
      expectedTargetProjectId: 'p1',
    })
    expect(mockSpawn).toHaveBeenCalledWith('npx', ['playwright', 'show-trace', '/tmp/trace.zip'], expect.any(Object))
    expect(response.status).toBe(200)
  })
})
