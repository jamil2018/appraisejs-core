import { describe, expect, it } from 'vitest'

import {
  getEnvironmentRows,
  getInlineLocatorSaveResult,
  getLocatorGroupRows,
  getLocatorPickerSession,
  getLocatorRow,
  getModuleRows,
} from './create-locator-workspace-response'

describe('create-locator-workspace response helpers', () => {
  const now = new Date('2026-05-12T00:00:00.000Z')

  it('filters action response row payloads by expected shape', () => {
    const environment = {
      id: 'env-1',
      name: 'Local',
      baseUrl: 'https://example.com',
      apiBaseUrl: null,
      username: null,
      password: null,
      createdAt: now,
      updatedAt: now,
    }
    const locatorGroup = {
      id: 'group-1',
      name: 'Login',
      route: '/login',
      moduleId: 'module-1',
      createdAt: now,
      updatedAt: now,
    }
    const moduleRow = {
      id: 'module-1',
      name: 'Auth',
      parentId: null,
      createdAt: now,
      updatedAt: now,
    }

    expect(getEnvironmentRows([environment, { ...environment, baseUrl: null }])).toEqual([environment])
    expect(getLocatorGroupRows([locatorGroup, { ...locatorGroup, moduleId: null }])).toEqual([locatorGroup])
    expect(getModuleRows([moduleRow, { ...moduleRow, createdAt: 'today' }])).toEqual([moduleRow])
  })

  it('returns locator picker session, locator row, and inline save results from valid action payloads', () => {
    const locator = {
      id: 'locator-1',
      name: 'Login button',
      value: 'button[data-testid="login"]',
      locatorGroupId: 'group-1',
      createdAt: now,
      updatedAt: now,
    }
    const session = {
      sessionId: 'session-1',
      launchSource: { url: 'https://example.com' },
      browserName: 'chromium',
      status: 'ready',
      currentUrl: 'https://example.com/login',
      currentPathname: '/login',
      pageTitle: 'Login',
      companionPid: null,
      startedAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:01.000Z',
    }
    const inlineResult = {
      locatorId: 'locator-1',
      locatorName: 'Login button',
      locatorGroupId: 'group-1',
      locatorGroupName: 'Login',
      selector: 'button[data-testid="login"]',
      route: '/login',
      moduleId: 'module-1',
    }

    expect(getLocatorRow(locator)).toEqual(locator)
    expect(getLocatorPickerSession(session)).toEqual(session)
    expect(getInlineLocatorSaveResult(inlineResult)).toEqual(inlineResult)
    expect(getLocatorRow({ ...locator, value: null })).toBeNull()
    expect(getLocatorPickerSession({ ...session, browserName: 'firefox' })).toBeNull()
    expect(getInlineLocatorSaveResult({ ...inlineResult, selector: null })).toBeNull()
  })
})
