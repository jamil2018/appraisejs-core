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

vi.mock('@/lib/active-project', () => ({
  requireActiveProjectForMutation: vi.fn().mockResolvedValue({ id: 'project-1' }),
}))

import { revalidatePath } from 'next/cache'
import { locatorPickerSessionManager } from '@/lib/locator-picker/session-manager'
import { savePickedLocatorFromRequest } from '@/services/locator/locator-service'
import {
  closeLocatorPickerSessionAction,
  getLocatorPickerSessionAction,
  savePickedLocatorAction,
  startLocatorPickerSessionAction,
} from './locator-picker-actions'

describe('project-scoped picker actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the trusted project to session launch and refuses an environment from another project', async () => {
    vi.mocked(locatorPickerSessionManager.startSession).mockRejectedValueOnce(
      new Error('Choose an environment or provide a URL before launching Chromium.'),
    )

    const result = await startLocatorPickerSessionAction({ environmentId: 'foreign-env' })

    expect(locatorPickerSessionManager.startSession).toHaveBeenCalledWith({ environmentId: 'foreign-env' }, 'project-1')
    expect(result.success).toBe(false)
  })

  it('does not reveal a picker session owned by another project', async () => {
    vi.mocked(locatorPickerSessionManager.getSession).mockResolvedValueOnce(null)

    const result = await getLocatorPickerSessionAction('foreign-session')

    expect(locatorPickerSessionManager.getSession).toHaveBeenCalledWith('foreign-session', 'project-1')
    expect(result).toMatchObject({ status: 404, success: false })
  })

  it('cannot cancel a picker session from another project', async () => {
    vi.mocked(locatorPickerSessionManager.closeSession).mockResolvedValueOnce(null)

    const result = await closeLocatorPickerSessionAction('foreign-session')

    expect(locatorPickerSessionManager.closeSession).toHaveBeenCalledWith('foreign-session', 'project-1')
    expect(result).toMatchObject({ status: 404, success: false })
  })
})

describe('savePickedLocatorAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revalidates locator pages after a successful update', async () => {
    vi.mocked(savePickedLocatorFromRequest).mockResolvedValue({
      kind: 'success',
      locatorId: 'loc-1',
      locatorName: 'submit',
      locatorGroupId: 'group-1',
      locatorGroupName: 'Checkout',
      selector: '[data-testid="submit"]',
      route: '/checkout',
      moduleId: 'module-1',
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
        locatorName: 'submit',
        locatorGroupId: 'group-1',
        locatorGroupName: 'Checkout',
        selector: '[data-testid="submit"]',
        route: '/checkout',
        moduleId: 'module-1',
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

    expect(locatorPickerSessionManager.markReadyAfterSave).toHaveBeenCalledWith('session-9', 'project-1')
    expect(result).toEqual({
      status: 500,
      success: false,
      error: 'disk full',
    })
  })
})
