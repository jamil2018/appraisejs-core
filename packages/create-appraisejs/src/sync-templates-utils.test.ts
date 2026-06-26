import { describe, expect, it } from 'vitest'
import { shouldExcludeBundledTemplatePath } from './sync-templates-utils.js'

describe('shouldExcludeBundledTemplatePath', () => {
  it('excludes plan artifacts, automation features, locators, and reports paths', () => {
    expect(shouldExcludeBundledTemplatePath('appraise/plans')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('appraise/plans/todo-app.yaml')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('appraise/plans/reviews/todo-app.review.yaml')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/features/base/login.feature')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/locators/base/login.json')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/reports/logs/run.log')).toBe(true)
    expect(shouldExcludeBundledTemplatePath('automation/reports')).toBe(true)
  })

  it('keeps other automation content', () => {
    expect(shouldExcludeBundledTemplatePath('automation/config/environments/environments.json')).toBe(false)
    expect(shouldExcludeBundledTemplatePath('automation/mapping/locator-map.json')).toBe(false)
    expect(shouldExcludeBundledTemplatePath('src/app/page.tsx')).toBe(false)
    expect(shouldExcludeBundledTemplatePath('packages/locator-picker-companion/dist/cli.js')).toBe(false)
  })
})
