import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/locator-picker/session-manager', () => ({
  locatorPickerSessionManager: {
    startSession: vi.fn(),
    getSession: vi.fn(),
    closeSession: vi.fn(),
    markReadyAfterSave: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/services/locator/locator-service', () => ({
  savePickedLocatorFromRequest: vi.fn(),
}))

import { revalidatePath } from 'next/cache'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { savePickedLocatorFromRequest } from '@/services/locator/locator-service'
import { savePickedLocatorAction } from './locator-picker-actions'

describe('savePickedLocatorAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revalidates locator pages after a successful update', async () => {
    vi.mocked(savePickedLocatorFromRequest).mockResolvedValue({
      kind: 'success',
      locatorId: 'loc-1',
      locatorGroupId: 'group-1',
      message: 'Locator updated successfully.',
      wasUpdate: true,
    })

    const result = await savePickedLocatorAction({
      sessionId: 'session-1',
      locatorId: 'loc-1',
      locatorName: 'submit',
      selector: '[data-testid="submit"]',
      resolutionMode: 'existing',
      existingLocatorGroupId: 'group-1',
    })

    expect(result).toEqual({
      status: 200,
      success: true,
      data: {
        locatorId: 'loc-1',
        locatorGroupId: 'group-1',
      },
      message: 'Locator updated successfully.',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/locators')
    expect(revalidatePath).toHaveBeenCalledWith('/locator-groups')
    expect(revalidatePath).toHaveBeenCalledWith('/locators/create')
    expect(revalidatePath).toHaveBeenCalledWith('/locators/modify/loc-1')
  })

  it('marks the session ready again when saving throws', async () => {
    vi.mocked(savePickedLocatorFromRequest).mockRejectedValue(new Error('disk full'))

    const result = await savePickedLocatorAction({
      sessionId: 'session-9',
      locatorName: 'submit',
      selector: '[data-testid="submit"]',
      resolutionMode: 'existing',
      existingLocatorGroupId: 'group-1',
    })

    expect(locatorPickerSessionManager.markReadyAfterSave).toHaveBeenCalledWith('session-9')
    expect(result).toEqual({
      status: 500,
      success: false,
      error: 'disk full',
    })
  })
})
