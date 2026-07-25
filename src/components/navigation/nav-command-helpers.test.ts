import { describe, expect, it } from 'vitest'

import { getSidebarNavigationSections } from './nav-command-helpers'

describe('getSidebarNavigationSections', () => {
  it('groups reusable project resources under Library', () => {
    const sections = getSidebarNavigationSections()
    const library = sections.find(section => section.label === 'Library')
    const system = sections.find(section => section.label === 'System')

    expect(library?.items.map(item => item.label)).toEqual([
      'Step Definitions',
      'Step Blocks',
      'Case Templates',
      'Locators',
      'Locator Groups',
      'Modules',
      'Environments',
      'Tags',
    ])
    expect(system?.items.map(item => item.label)).toEqual(['Projects', 'Settings'])
  })
})
