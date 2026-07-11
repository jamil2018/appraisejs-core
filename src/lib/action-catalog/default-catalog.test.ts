import { describe, expect, it } from 'vitest'
import { defaultActionCatalog } from './default-catalog'

describe('default action catalog', () => {
  it('publishes current runtime-backed browser actions through progressive discovery', () => {
    expect(defaultActionCatalog.listCategories().categories).toMatchObject([
      { id: 'browser', childCategoryCount: 5, actionCount: 6 },
    ])
    expect(defaultActionCatalog.listActions({ categoryId: 'browser.navigation' }).items.map(item => item.id)).toEqual([
      'browser.navigation.goto',
      'browser.navigation.reload',
    ])
    expect(defaultActionCatalog.readActions([{ id: 'browser.mouse.click', version: '1' }])[0]).toMatchObject({
      requirements: { runtime: 'browser', capabilities: ['mouse'] },
      inputs: [{ type: 'locator' }],
    })
  })
})
