import { describe, expect, it } from 'vitest'

import { createActionCatalog, type ActionDescriptorDefinition } from './action-catalog'

const categories = [
  { id: 'browser', title: 'Browser', description: 'Browser actions.' },
  { id: 'browser.navigation', parentCategoryId: 'browser', title: 'Navigation', description: 'Navigate pages.' },
  { id: 'browser.forms', parentCategoryId: 'browser', title: 'Forms', description: 'Edit forms.' },
]

const actions: ActionDescriptorDefinition[] = [
  {
    id: 'browser.goto',
    version: '1',
    title: 'Go to',
    description: 'Navigate to a URL.',
    categories: ['browser.navigation'],
    inputs: [{ name: 'url', type: 'string', required: true, description: 'URL.' }],
    outputs: [],
    requirements: { runtime: 'browser', capabilities: ['navigation'] },
    examples: [{ description: 'Open home.', inputs: { url: '/' } }],
    deprecated: false,
  },
  {
    id: 'browser.open',
    version: '1',
    title: 'Open',
    description: 'Legacy navigation.',
    categories: ['browser.navigation'],
    inputs: [{ name: 'url', type: 'string', required: true, description: 'URL.' }],
    outputs: [],
    requirements: { runtime: 'browser', capabilities: ['navigation'] },
    examples: [],
    deprecated: true,
    replacementActionId: 'browser.goto',
  },
  {
    id: 'browser.fill',
    version: '1',
    title: 'Fill',
    description: 'Fill a field.',
    categories: ['browser.forms'],
    inputs: [{ name: 'value', type: 'string', required: true, description: 'Value.' }],
    outputs: [],
    requirements: { runtime: 'browser', capabilities: ['forms'] },
    examples: [],
    deprecated: false,
  },
]

describe('versioned action catalog contracts', () => {
  it('returns progressive category summaries and unchanged responses', () => {
    const catalog = createActionCatalog({ categories, actions })
    expect(catalog.listCategories()).toMatchObject({
      status: 'current',
      categories: [{ id: 'browser', childCategoryCount: 2, actionCount: 3 }],
    })
    expect(catalog.listCategories(undefined, catalog.catalogHash)).toEqual({
      status: 'unchanged',
      catalogHash: catalog.catalogHash,
      categories: [],
    })
  })

  it('filters and paginates deterministically independent of definition order', () => {
    const catalog = createActionCatalog({ categories: [...categories].reverse(), actions: [...actions].reverse() })
    expect(catalog.listActions({ categoryId: 'browser.navigation', deprecated: false }, 0, 1)).toMatchObject({
      items: [{ id: 'browser.goto', deprecated: false }],
      nextCursor: null,
    })
    expect(
      catalog
        .listActions({ capability: 'navigation', inputType: 'string', runtime: 'browser' })
        .items.map(item => item.id),
    ).toEqual(['browser.goto', 'browser.open'])
    expect(catalog.catalogHash).toBe(createActionCatalog({ categories, actions }).catalogHash)
  })

  it('reads exact descriptors with examples, hashes, and deprecation metadata', () => {
    const catalog = createActionCatalog({ categories, actions })
    expect(catalog.readActions([{ id: 'browser.open', version: '1' }])).toMatchObject([
      {
        id: 'browser.open',
        version: '1',
        deprecated: true,
        replacementActionId: 'browser.goto',
        examples: [],
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    ])
  })

  it('rejects invalid category and deprecation references', () => {
    expect(() => createActionCatalog({ categories, actions: [{ ...actions[0]!, categories: ['missing'] }] })).toThrow(
      'Unknown category',
    )
    expect(() =>
      createActionCatalog({ categories, actions: [{ ...actions[1]!, replacementActionId: undefined }] }),
    ).toThrow('must declare replacementActionId')
    expect(() =>
      createActionCatalog({
        categories: [
          { id: 'first', parentCategoryId: 'second', title: 'First', description: 'First.' },
          { id: 'second', parentCategoryId: 'first', title: 'Second', description: 'Second.' },
        ],
        actions: [],
      }),
    ).toThrow('contains a cycle')
  })
})
