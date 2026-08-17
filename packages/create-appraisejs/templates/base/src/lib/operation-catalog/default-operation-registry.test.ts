import { describe, expect, it } from 'vitest'

import { listBrowserOperationHandlerRefs } from '../../../packages/cucumber-runtime/src/operations/index'
import definitions from '../../../packages/cucumber-runtime/src/operations/definitions.json'
import { defaultOperationRegistry } from './default-operation-registry'

describe('default operation registry', () => {
  it('covers every managed operation with one handler and both authoring projections', () => {
    const firstPage = defaultOperationRegistry.list({}, 0, 100)
    const operations = [
      ...firstPage.items,
      ...(firstPage.nextCursor == null ? [] : defaultOperationRegistry.list({}, firstPage.nextCursor, 100).items),
    ]
    expect(operations.length).toBeGreaterThanOrEqual(116)
    expect(operations.map(item => `${item.id}@${item.version}`).sort()).toEqual(listBrowserOperationHandlerRefs())
    expect(operations.every(item => item.humanSurface === 'supported' && item.agentSurface === 'supported')).toBe(true)
    expect(
      definitions
        .flatMap(operation => operation.inputs.filter(input => input.type === 'locator'))
        .every(
          input => 'cardinality' in input && (input.cardinality === 'exactlyOne' || input.cardinality === 'collection'),
        ),
    ).toBe(true)
  })

  it('converges action and template aliases on canonical operation identities', () => {
    expect(defaultOperationRegistry.resolveAlias('action-id', 'browser.mouse.click', 'agent')?.id).toBe(
      'browser.mouse.click',
    )
    expect(defaultOperationRegistry.resolveAlias('step-definition-slug', 'click/click', 'human')?.id).toBe(
      'browser.mouse.click',
    )
  })
})
