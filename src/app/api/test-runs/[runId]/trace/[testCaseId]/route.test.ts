import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ServiceError } from '@/services/shared/errors'

const {
  mockAccess,
  mockClose,
  mockChmod,
  mockFindUnique,
  mockGetProcess,
  mockMkdir,
  mockMkdtemp,
  mockOpen,
  mockReadBytes,
  mockRealpath,
  mockRm,
  mockSpawn,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockClose: vi.fn(),
  mockChmod: vi.fn(),
  mockFindUnique: vi.fn(),
  mockGetProcess: vi.fn(),
  mockMkdir: vi.fn(),
  mockMkdtemp: vi.fn(),
  mockOpen: vi.fn(),
  mockReadBytes: vi.fn(),
  mockRealpath: vi.fn(),
  mockRm: vi.fn(),
  mockSpawn: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    access: mockAccess,
    chmod: mockChmod,
    mkdir: mockMkdir,
    mkdtemp: mockMkdtemp,
    open: mockOpen,
    realpath: mockRealpath,
    rm: mockRm,
  },
}))

vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mockReadBytes
  },
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockFindUnique,
      findFirst: mockFindUnique,
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
    mockMkdtemp.mockResolvedValue('/repo/.appraise/tmp/trace-viewers/trace-owned')
    mockOpen.mockResolvedValue({ writeFile: mockWriteFile, close: mockClose })
    mockRealpath.mockImplementation(async (value: string) => value)
    mockRm.mockResolvedValue(undefined)
  })

  it('returns 404 when the run is missing on GET', async () => {
    mockFindUnique.mockResolvedValue(null)

    const response = await GET(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1'),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Test run not found' })
  })

  it('returns 404 when the test case is not part of the run on GET', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [],
    })

    const response = await GET(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1'),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Test case not found in this test run' })
  })

  it('returns viewer status when the process exists on GET', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1' }],
    })
    mockGetProcess.mockReturnValue({ isRunning: true })

    const response = await GET(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1'),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      isRunning: true,
      processName: 'trace-viewer-trtc-1',
    })
  })

  it.each([
    [404, new ServiceError('private missing detail', 'NOT_FOUND', 404), 'Artifact not found.'],
    [409, new ServiceError('private integrity detail', 'CONFLICT', 409), 'Artifact integrity conflict.'],
    [500, new Error('private database detail'), 'Artifact request failed.'],
  ])('returns an opaque %i error on GET', async (status, error, message) => {
    mockFindUnique.mockRejectedValue(error)

    const response = await GET(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1'),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: message })
  })

  it('returns 400 when no trace path is stored on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: null }],
    })

    const response = await POST(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'No trace path available for this test case' })
  })

  it('returns 404 when the trace file is missing on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockAccess.mockRejectedValue(new Error('missing'))

    const response = await POST(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Trace file not found at path: trace.zip' })
  })

  it('spawns the trace viewer when the trace file exists on POST', async () => {
    mockFindUnique.mockResolvedValue({
      testCases: [{ id: 'trtc-1', tracePath: 'trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockAccess.mockResolvedValue(undefined)
    mockSpawn.mockResolvedValue({ name: 'trace-viewer-trtc-1' })

    const response = await POST(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1', {
        method: 'POST',
      }),
      {
        params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }),
      },
    )

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

  it('launches a managed trace from an exclusive private snapshot and removes it on exit', async () => {
    const once = vi.fn()
    mockFindUnique.mockResolvedValue({
      runtimeCapsule: { id: 'capsule-1' },
      targetProjectId: 'project-1',
      testCases: [{ id: 'trtc-1', tracePath: 'traces/trace.zip', testCase: { id: 'tc-1' } }],
    })
    mockReadBytes.mockResolvedValue({ bytes: Buffer.from('PK trace'), contentType: 'application/zip', maxBytes: 100 })
    mockSpawn.mockResolvedValue({ name: 'trace-viewer-trtc-1', process: { once } })

    const response = await POST(
      new NextRequest('http://localhost/api/test-runs/run-1/trace/trtc-1?targetProjectId=project-1', {
        method: 'POST',
      }),
      { params: Promise.resolve({ runId: 'run-1', testCaseId: 'trtc-1' }) },
    )

    expect(mockReadBytes).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', kind: 'trace' }))
    expect(mockOpen).toHaveBeenCalledWith('/repo/.appraise/tmp/trace-viewers/trace-owned/trace.zip', 'wx', 0o600)
    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      ['playwright', 'show-trace', '/repo/.appraise/tmp/trace-viewers/trace-owned/trace.zip'],
      expect.any(Object),
    )
    const exitCleanup = once.mock.calls.find(([event]) => event === 'exit')?.[1]
    exitCleanup()
    expect(mockRm).toHaveBeenCalledWith('/repo/.appraise/tmp/trace-viewers/trace-owned', {
      recursive: true,
      force: true,
    })
    expect(response.status).toBe(200)
  })
})
