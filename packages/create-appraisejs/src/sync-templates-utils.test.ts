import { describe, expect, it } from 'vitest'
import { shouldExcludeBundledTemplatePath } from './sync-templates-utils.js'

describe('shouldExcludeBundledTemplatePath', () => {
  it('excludes automation features, locators, and reports paths', () => {
    expect(shouldExcludeBundledTemplatePath('automation/features/base/login.feature')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/locators/base/login.json')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/reports/logs/run.log')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/reports')).toBe(true)
  })

  it('keeps other automation content', () => {
    expect(shouldExcludeBundledTemplatePath('automation/config/environments/environments.json')).toBe(false)
    expect(shouldExcludeBundledTemplatePath('automation/mapping/locator-map.json')).toBe(false)
    expect(shouldExcludeBundledTemplatePath('src/app/page.tsx')).toBe(false)
  })
})
