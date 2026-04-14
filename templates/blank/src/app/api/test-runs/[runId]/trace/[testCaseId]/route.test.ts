import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockAccess, mockFindUnique, mockGetProcess, mockSpawn } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockFindUnique: vi.fn(),
  mockGetProcess: vi.fn(),
  mockSpawn: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    access: mockAccess,
  },
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockFindUnique,
    },
  },
}))

vi.mock('@/lib/process/task-spawner', () => ({
  taskSpawner: {
    getProcess: mockGetProcess,
    spawn: mockSpawn,
  },
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  resolveStoredPath: vi.fn((storedPath: string) => `/resolved/${storedPath}`),
}))

import { GET, POST } from './route'

describe('trace route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when the run is missing on GET', async () => {
    mockFindUnique.mockResolvedValue(null)

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1'), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Test run not found' })
  })

  it('returns 404 when the test case is not part of the run on GET', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [],
    })

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1'), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Test case not found in this test run' })
  })

  it('returns viewer status when the process exists on GET', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1' }],
    })
    mockGetProcess.mockReturnValue({ isRunning: true })

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1'), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      isRunning: true,
      processName: 'trace-viewer-trtc-1',
    })
  })

  it('returns 400 when no trace path is stored on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: null }],
    })

    const response = await POST(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1', { method: 'POST' }), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'No trace path available for this test case' })
  })

  it('returns 404 when the trace file is missing on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockAccess.mockRejectedValue(new Error('missing'))

    const response = await POST(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1', { method: 'POST' }), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Trace file not found at path: trace.zip' })
  })

  it('spawns the trace viewer when the trace file exists on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockAccess.mockResolvedValue(undefined)
    mockSpawn.mockResolvedValue({ name: 'trace-viewer-trtc-1' })

    const response = await POST(new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1', { method: 'POST' }), {
      params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
    })

    expect(mockSpawn).toHaveBeenCalledWith('npx', ['playwright', 'show-trace', '/resolved/trace.zip'], {
      streamLogs: true,
      prefixLogs: true,
      logPrefix: 'trace-viewer-trtc-1',
      captureOutput: false,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Trace viewer launched successfully',
      processName: 'trace-viewer-trtc-1',
    })
  })
})
