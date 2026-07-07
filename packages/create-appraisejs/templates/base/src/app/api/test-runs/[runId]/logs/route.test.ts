import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TestRunStatus } from '@prisma/client'

const { mockTestRunFindUnique, mockGetTestRunLogsService } = vi.hoisted(() => ({
  mockTestRunFindUnique: vi.fn(),
  mockGetTestRunLogsService: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockTestRunFindUnique,
    },
  },
}))

vi.mock('@/services/test-run/test-run-service', () => ({
  getTestRunLogsService: mockGetTestRunLogsService,
}))

vi.mock('@/lib/test-run/process-manager', () => ({
  processManager: {
    get: vi.fn(),
    size: vi.fn(() => 0),
    getAllTestRunIds: vi.fn(() => []),
  },
}))

vi.mock('@/lib/process/task-spawner', () => ({
  taskSpawner: {
    on: vi.fn(),
    off: vi.fn(),
  },
}))

import { GET } from './route'

const logs = [
  { type: 'stdout', message: 'start', timestamp: new Date('2026-01-01T00:00:00.000Z') },
  { type: 'stdout', message: 'middle', timestamp: new Date('2026-01-01T00:00:01.000Z') },
  { type: 'stderr', message: 'Error: failed step', timestamp: new Date('2026-01-01T00:00:02.000Z') },
  { type: 'stdout', message: 'after', timestamp: new Date('2026-01-01T00:00:03.000Z') },
]

describe('test run logs route', () => {
  beforeEach(() => {
    mockTestRunFindUnique.mockReset()
    mockGetTestRunLogsService.mockReset()
    mockTestRunFindUnique.mockResolvedValue({ id: 'db-1', status: TestRunStatus.COMPLETED })
    mockGetTestRunLogsService.mockResolvedValue(logs)
  })

  it('returns only stderr entries for errorsOnly mode', async () => {
    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/logs?mode=errorsOnly'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    const body = await response.json()
    expect(body.mode).toBe('errorsOnly')
    expect(body.totalLogEntries).toBe(4)
    expect(body.logs).toEqual([expect.objectContaining({ type: 'stderr', message: 'Error: failed step' })])
  })

  it('returns a bounded tail for tail mode', async () => {
    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/logs?mode=tail&limit=2'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    const body = await response.json()
    expect(body.logs.map((log: { message: string }) => log.message)).toEqual(['Error: failed step', 'after'])
  })

  it('returns text around the first failure for aroundFailure mode', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/test-runs/run-1/logs?mode=aroundFailure&limit=3&format=text'),
      { params: Promise.resolve({ runId: 'run-1' }) },
    )

    await expect(response.text()).resolves.toContain('[stderr] Error: failed step')
  })
})
