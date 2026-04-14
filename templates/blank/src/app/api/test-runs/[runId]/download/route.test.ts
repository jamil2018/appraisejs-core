import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockReaddir, mockAccess, mockFindUnique, archiveState } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockAccess: vi.fn(),
  mockFindUnique: vi.fn(),
  archiveState: { lastArchive: null as { fileCalls: ArchiveFileCall[] } | null },
}))

type ArchiveFileCall = { path: string; name: string }

function normalizeFsPath(value: string) {
  return value.replace(/\\/g, '/')
}

vi.mock('archiver', () => ({
  default: vi.fn(() => {
    const listeners = new Map<string, Array<(value?: Buffer) => void>>()
    const archive = {
      fileCalls: [] as ArchiveFileCall[],
      on(event: string, callback: (value?: Buffer) => void) {
        const current = listeners.get(event) ?? []
        current.push(callback)
        listeners.set(event, current)
      },
      file(filePath: string, options: { name: string }) {
        this.fileCalls.push({ path: filePath, name: options.name })
      },
      finalize() {
        const buffer = Buffer.from(JSON.stringify(this.fileCalls))
        for (const callback of listeners.get('data') ?? []) {
          callback(buffer)
        }
        for (const callback of listeners.get('end') ?? []) {
          callback()
        }
      },
    }

    archiveState.lastArchive = archive
    return archive
  }),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockFindUnique,
    },
  },
}))

vi.mock('fs', () => ({
  promises: {
    readdir: mockReaddir,
    access: mockAccess,
  },
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  getAutomationReportRunDir: vi.fn((runId: string) => `/artifacts/${runId}`),
  resolveStoredPath: vi.fn((storedPath: string) => {
    const mapping: Record<string, string> = {
      'legacy/cucumber.json': '/legacy/cucumber.json',
      'legacy/run.log': '/legacy/run.log',
      'legacy/trace.zip': '/legacy/trace.zip',
      'nested/cucumber.json': '/artifacts/run-1/cucumber.json',
      'nested/trace.zip': '/artifacts/run-1/traces/trace.zip',
    }

    return mapping[storedPath] ?? storedPath
  }),
}))

import { GET } from './route'

function fileEntry(name: string) {
  return {
    name,
    isDirectory: () => false,
  }
}

function directoryEntry(name: string) {
  return {
    name,
    isDirectory: () => true,
  }
}

describe('test run download route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    archiveState.lastArchive = null
  })

  it('returns 404 when the test run does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Test run not found' })
  })

  it('returns 404 when no artifact files are available', async () => {
    mockFindUnique.mockResolvedValue({
      logPath: null,
      reportPath: null,
      testCases: [],
    })
    mockReaddir.mockRejectedValue(new Error('missing'))

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'No run artifacts available for this test run' })
  })

  it('adds run-folder artifacts and only unique legacy fallback files to the archive', async () => {
    mockFindUnique.mockResolvedValue({
      logPath: 'legacy/run.log',
      reportPath: 'nested/cucumber.json',
      testCases: [{ tracePath: 'legacy/trace.zip' }, { tracePath: 'nested/trace.zip' }],
    })
    mockReaddir.mockImplementation(async (dir: string) => {
      const normalizedDir = normalizeFsPath(dir)

      if (normalizedDir === '/artifacts/run-1') {
        return [fileEntry('cucumber.json'), directoryEntry('logs'), directoryEntry('traces')]
      }

      if (normalizedDir === '/artifacts/run-1/logs') {
        return [fileEntry('folder.log')]
      }

      if (normalizedDir === '/artifacts/run-1/traces') {
        return [fileEntry('trace.zip')]
      }

      return []
    })
    mockAccess.mockResolvedValue(undefined)

    const response = await GET(new NextRequest('http://localhost/api/test-runs/run-1/download'), {
      params: Promise.resolve({ runId: 'run-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(
      archiveState.lastArchive?.fileCalls.map(fileCall => ({
        ...fileCall,
        path: normalizeFsPath(fileCall.path),
      })),
    ).toEqual([
      { path: '/artifacts/run-1/cucumber.json', name: 'cucumber.json' },
      { path: '/artifacts/run-1/logs/folder.log', name: 'logs/folder.log' },
      { path: '/artifacts/run-1/traces/trace.zip', name: 'traces/trace.zip' },
      { path: '/legacy/run.log', name: 'logs/run.log' },
    ])
    await expect(response.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer)
  })
})
