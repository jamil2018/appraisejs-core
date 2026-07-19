import { describe, expect, it } from 'vitest'
import { defaultActionCatalog } from './default-catalog'

describe('default action catalog', () => {
  it('publishes current runtime-backed browser actions through progressive discovery', () => {
    expect(defaultActionCatalog.listCategories().categories).toMatchObject([
      { id: 'browser', childCategoryCount: 7, actionCount: 20 },
    ])
    expect(defaultActionCatalog.listActions({ categoryId: 'browser.navigation' }).items.map(item => item.id)).toEqual([
      'browser.navigation.goto',
      'browser.navigation.reload',
    ])
    expect(defaultActionCatalog.readActions([{ id: 'browser.mouse.click', version: '1' }])[0]).toMatchObject({
      requirements: { runtime: 'browser', capabilities: ['mouse'] },
      inputs: [{ type: 'locator' }],
    })
    expect(defaultActionCatalog.readActions([{ id: 'browser.assertions.accessible', version: '1' }])[0]).toMatchObject({
      assertionConcerns: ['accessibility'],
    })
    expect(defaultActionCatalog.readActions([{ id: 'browser.waits.timeout', version: '1' }])[0]).toMatchObject({
      inputs: [{ numeric: { unit: 'milliseconds', minimum: 0, maximum: 300_000 } }],
    })
    expect(
      defaultActionCatalog.readActions([
        { id: 'browser.keyboard.press', version: '1' },
        { id: 'browser.viewport.set', version: '1' },
        { id: 'browser.assertions.no-horizontal-overflow', version: '1' },
      ]),
    ).toHaveLength(3)
    expect(
      defaultActionCatalog.readActions([
        { id: 'browser.assertions.no-console-errors', version: '1' },
        { id: 'browser.assertions.no-failed-network-requests', version: '1' },
      ]),
    ).toMatchObject([
      { requirements: { capabilities: ['assertions', 'console-observation'] } },
      { requirements: { capabilities: ['assertions', 'network-observation'] } },
    ])
  })
})
