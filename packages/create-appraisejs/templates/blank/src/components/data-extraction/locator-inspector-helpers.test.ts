import { describe, expect, it } from 'vitest'

import {
  createLocatorInspectorInjectionScript,
  generateCSSPath,
  generateXPath,
  getLocatorInspectorOrigin,
  isLocatorInspectorMessage,
} from './locator-inspector-helpers'

describe('locator-inspector helpers', () => {
  it('builds selector helpers and validates message payloads', () => {
    expect(generateCSSPath({ tagName: 'BUTTON', id: 'submit' })).toBe('#submit')
    expect(generateCSSPath({ tagName: 'DIV', className: 'hero primary' })).toBe('div.hero.primary')
    expect(generateXPath({ tagName: 'BUTTON', id: 'submit' })).toBe('//*[@id="submit"]')
    expect(
      isLocatorInspectorMessage({
        type: 'ELEMENT_SELECTED',
        elementData: {
          tagName: 'BUTTON',
          outerHTML: '<button>Save</button>',
        },
      }),
    ).toBe(true)
    expect(isLocatorInspectorMessage({ type: 'UNKNOWN' })).toBe(false)
  })

  it('derives iframe origins and scopes the injected script to the parent origin', () => {
    expect(getLocatorInspectorOrigin('/sample-page', 'https://appraise.dev/locators')).toBe('https://appraise.dev')
    expect(createLocatorInspectorInjectionScript('https://appraise.dev')).toContain('"https://appraise.dev"')
  })
})
