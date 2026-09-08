import { describe, expect, it } from 'vitest'

import { getSidebarNavigationSections } from './nav-command-helpers'

describe('getSidebarNavigationSections', () => {
  it('exposes the project quality-control routes', () => {
    const sections = getSidebarNavigationSections()
    const control = sections.find(section => section.label === 'Control')

    expect(control?.items.map(item => item.label)).toEqual(['Dashboard', 'Quality Journeys', 'Collaboration'])
    expect(control?.items.map(item => item.href)).toEqual(['/', '/quality-journeys', '/collaboration'])
  })

  it('groups reusable project resources under Library', () => {
    const sections = getSidebarNavigationSections()
    const library = sections.find(section => section.label === 'Library')
    const system = sections.find(section => section.label === 'System')

    expect(library?.items.map(item => item.label)).toEqual([
      'Step Definitions',
      'Case Templates',
      'Locators',
      'Locator Groups',
      'Modules',
      'Environments',
      'Tags',
    ])
    expect(system?.items.map(item => item.label)).toEqual(['Projects', 'Settings', 'Help'])
    expect(library?.items.find(item => item.label === 'Step Definitions')?.href).toBe('/step-definitions')
  })

  it('uses Case Templates consistently and indexes Help aliases', () => {
    const sections = getSidebarNavigationSections()
    const help = sections.flatMap(section => section.items).find(item => item.href === '/help')

    expect(sections.flatMap(section => section.items).find(item => item.href === '/template-test-cases')?.label).toBe(
      'Case Templates',
    )
    expect(help?.keywords).toEqual(expect.arrayContaining(['setup', 'glossary']))
  })
})
