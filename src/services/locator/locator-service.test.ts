import { describe, expect, it, vi } from 'vitest'
import { deleteLocators, detectAndCreateConflicts, savePickedLocatorFromRequest } from './locator-service'

vi.mock('@/lib/locator-picker/session-manager', () => ({
  locatorPickerSessionManager: {
    getSession: vi.fn(),
    markSaving: vi.fn().mockResolvedValue(undefined),
    markReadyAfterSave: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/config/db-config', () => ({
  default: {
    locator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
    },
    conflictResolution: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import prisma from '@/config/db-config'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'

describe('detectAndCreateConflicts', () => {
  it('returns 0 when no other locators in group', async () => {
    vi.mocked(prisma.locator.findMany).mockResolvedValue([])

    await expect(detectAndCreateConflicts('loc-1', 'btn', '//x', 'group-1')).resolves.toBe(0)
    expect(prisma.conflictResolution.create).not.toHaveBeenCalled()
  })
})

describe('deleteLocators', () => {
  it('deletes locators without synchronizing target files', async () => {
    vi.mocked(prisma.locator.deleteMany).mockResolvedValue({ count: 3 } as never)

    await expect(deleteLocators(['loc-1', 'loc-2', 'loc-3'], 'project-1')).resolves.toEqual({ count: 3 })
    expect(prisma.locator.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['loc-1', 'loc-2', 'loc-3'] }, targetProjectId: 'project-1' },
    })
  })
})

describe('savePickedLocatorFromRequest', () => {
  it('does not persist an ambiguous selector returned by the picker companion', async () => {
    vi.mocked(locatorPickerSessionManager.getSession).mockResolvedValue({
      pickedLocator: { selector: 'css=.checkout-button', matchCount: 2 },
    } as never)

    await expect(
      savePickedLocatorFromRequest(
        {
          sessionId: 'picker-session',
          locatorName: 'checkout-button',
          selector: 'css=.checkout-button',
          resolutionMode: 'existing',
          existingLocatorGroupId: 'group-1',
        },
        'project-1',
      ),
    ).resolves.toEqual({
      kind: 'error',
      status: 400,
      message: 'The picker selector was not verified as exactly one live match. Pick again or enter a manual selector.',
    })
    expect(prisma.locator.create).not.toHaveBeenCalled()
    expect(locatorPickerSessionManager.markReadyAfterSave).toHaveBeenCalledWith('picker-session')
  })

  it.each([
    [
      'mismatched fingerprint',
      { selectorFingerprint: 'sha256:wrong', checkedAt: new Date().toISOString(), checkedUrl: 'https://example.com' },
    ],
    [
      'stale observation',
      {
        selectorFingerprint: 'sha256:306a95eb66d5327e766bcc5a281b21559b9deda8fd491d209499d40d62183a78',
        checkedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
        checkedUrl: 'https://example.com',
      },
    ],
    [
      'future observation',
      {
        selectorFingerprint: 'sha256:306a95eb66d5327e766bcc5a281b21559b9deda8fd491d209499d40d62183a78',
        checkedAt: new Date(Date.now() + 60 * 1000).toISOString(),
        checkedUrl: 'https://example.com',
      },
    ],
  ])('does not persist a picker selector with a %s', async (_label, observation) => {
    vi.mocked(locatorPickerSessionManager.getSession).mockResolvedValue({
      pickedLocator: { selector: 'css=.checkout-button', matchCount: 1, ...observation },
    } as never)

    const result = await savePickedLocatorFromRequest(
      {
        sessionId: 'picker-session',
        locatorName: 'checkout-button',
        selector: 'css=.checkout-button',
        resolutionMode: 'existing',
        existingLocatorGroupId: 'group-1',
      },
      'project-1',
    )

    expect(result).toMatchObject({ kind: 'error', status: 400 })
    expect(prisma.locator.create).not.toHaveBeenCalled()
  })
})
