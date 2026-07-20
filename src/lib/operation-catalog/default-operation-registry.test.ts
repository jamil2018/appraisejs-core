import { describe, expect, it } from 'vitest'

import { defaultActionCatalog } from '@/lib/action-catalog'
import { listBrowserOperationHandlerRefs } from '../../../packages/cucumber-runtime/src/operations/index'
import { defaultOperationRegistry } from './default-operation-registry'

describe('default operation registry', () => {
  it('covers every managed action with one handler and both authoring projections', () => {
    const actions = defaultActionCatalog.listActions({}, 0, 100).items
    const firstPage = defaultOperationRegistry.list({}, 0, 100)
    const operations = [
      ...firstPage.items,
      ...(firstPage.nextCursor == null ? [] : defaultOperationRegistry.list({}, firstPage.nextCursor, 100).items),
    ]
    expect(operations.length).toBeGreaterThanOrEqual(116)
    expect(actions.every(action => operations.some(operation => operation.id === action.id))).toBe(true)
    expect(operations.map(item => `${item.id}@${item.version}`).sort()).toEqual(listBrowserOperationHandlerRefs())
    expect(operations.every(item => item.humanSurface === 'supported' && item.agentSurface === 'supported')).toBe(true)
  })

  it('converges action and template aliases on canonical operation identities', () => {
    expect(defaultOperationRegistry.resolveAlias('action-id', 'browser.mouse.click', 'agent')?.id).toBe(
      'browser.mouse.click',
    )
    expect(defaultOperationRegistry.resolveAlias('template-step-slug', 'click/click', 'human')?.id).toBe(
      'browser.mouse.click',
    )
  })
})
