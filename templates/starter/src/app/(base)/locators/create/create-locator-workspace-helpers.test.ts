import { describe, expect, it } from 'vitest'

import {
  applyPickedLocatorToWorkspaceState,
  canLaunchPicker,
  canSaveLocator,
  createInitialWorkspaceState,
  formatStatus,
  statusTone,
} from './create-locator-workspace-helpers'

describe('create-locator-workspace helpers', () => {
  it('computes save and launch eligibility from workspace state', () => {
    const state = {
      ...createInitialWorkspaceState([{ id: 'env-1' } as never]),
      environmentId: 'env-1',
      locatorName: 'Login button',
      selector: 'button[data-testid="login"]',
      resolutionMode: 'existing' as const,
      existingLocatorGroupId: 'group-1',
    }

    expect(canLaunchPicker(state)).toBe(true)
    expect(canSaveLocator(state)).toBe(true)
  })

  it('applies a picked locator suggestion to empty or auto-filled fields', () => {
    const nextState = applyPickedLocatorToWorkspaceState(
      createInitialWorkspaceState(
        [{ id: 'env-1' } as never],
        {
          route: '/',
        },
      ),
      {
        sessionId: 'session-1',
        launchSource: { url: 'https://example.com' },
        browserName: 'chromium',
        status: 'picked',
        currentUrl: 'https://example.com/account/login',
        currentPathname: '/account/login',
        pageTitle: 'Login',
        companionPid: 123,
        startedAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:01.000Z',
        pickedLocator: {
          sessionId: 'session-1',
          selector: 'button[data-testid="login"]',
          currentUrl: 'https://example.com/account/login',
          pathname: '/account/login',
          pageTitle: 'Login',
          tagName: 'button',
          accessibleName: 'Log in',
        },
      },
      [],
      [{ id: 'module-1', name: 'account', parentId: null } as never],
    )

    expect(nextState.selector).toBe('button[data-testid="login"]')
    expect(nextState.locatorName).toBe('Log in')
    expect(nextState.route).toBe('/account/login')
    expect(nextState.newLocatorGroupName).toBe('Login')
    expect(nextState.moduleId).toBe('module-1')
  })

  it('formats picker status labels and variants', () => {
    expect(formatStatus('picked')).toBe('Picked')
    expect(statusTone('error')).toBe('destructive')
  })
})
