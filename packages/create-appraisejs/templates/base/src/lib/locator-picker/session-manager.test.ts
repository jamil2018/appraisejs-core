import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, readSessionFile, patchSessionFile, clearCrashLogs } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  readSessionFile: vi.fn(),
  patchSessionFile: vi.fn(),
  clearCrashLogs: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({ default: { environment: { findFirst } } }))
vi.mock('@locator-picker-companion/session-file', () => ({
  readLocatorPickerSessionFile: readSessionFile,
  patchLocatorPickerSessionFile: patchSessionFile,
  getLocatorPickerSessionFilePath: (id: string) => `/tmp/${id}.json`,
  clearLocatorPickerCrashLogs: clearCrashLogs,
}))

import { locatorPickerSessionManager } from './session-manager'

describe('locator picker session ownership', () => {
  beforeEach(() => vi.resetAllMocks())

  it('requires a live environment in the exact project before launching', async () => {
    findFirst.mockResolvedValue(null)

    await expect(locatorPickerSessionManager.startSession({ environmentId: 'env-b' }, 'project-a')).rejects.toThrow(
      'unavailable in this project',
    )

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'env-b', targetProjectId: 'project-a', archivedAt: null },
    })
    expect(clearCrashLogs).not.toHaveBeenCalled()
  })

  it('refuses another project and legacy unscoped session files', async () => {
    const base = {
      sessionId: 'session-1',
      launchSource: { url: 'https://example.test' },
      status: 'ready',
      currentUrl: 'https://example.test',
      currentPathname: '/',
      pageTitle: '',
      companionPid: null,
      startedAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    }
    readSessionFile.mockResolvedValueOnce({ ...base, targetProjectId: 'project-b' })
    readSessionFile.mockResolvedValueOnce(base)
    readSessionFile.mockResolvedValueOnce({ ...base, targetProjectId: 'project-a' })

    expect(await locatorPickerSessionManager.getSession('session-1', 'project-a')).toBeNull()
    expect(await locatorPickerSessionManager.getSession('session-1', 'project-a')).toBeNull()
    expect(await locatorPickerSessionManager.getSession('session-1', 'project-a')).toMatchObject({
      sessionId: 'session-1',
    })
  })

  it('does not close or change a session from another project', async () => {
    readSessionFile.mockResolvedValue({ sessionId: 'session-b', targetProjectId: 'project-b', companionPid: null })

    expect(await locatorPickerSessionManager.closeSession('session-b', 'project-a')).toBeNull()
    expect(patchSessionFile).not.toHaveBeenCalled()
  })

  it('rejects malformed session IDs before reading a file path', async () => {
    expect(await locatorPickerSessionManager.getSession('../../outside', 'project-a')).toBeNull()
    expect(await locatorPickerSessionManager.closeSession('../../outside', 'project-a')).toBeNull()
    await locatorPickerSessionManager.markSaving('../../outside', 'project-a')
    await locatorPickerSessionManager.markReadyAfterSave('../../outside', 'project-a')
    expect(readSessionFile).not.toHaveBeenCalled()
    expect(patchSessionFile).not.toHaveBeenCalled()
  })
})
