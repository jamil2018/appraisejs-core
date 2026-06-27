import { describe, expect, it } from 'vitest'

import {
  extractModulePathFromAutomationFile,
  getAutomationLocatorMapPath,
  shouldBackfillLegacyEnvironmentConfig,
  shouldExcludeTemplatePath,
} from '../../src/lib/template-sync-utils'

describe('template sync utils', () => {
  it('excludes generated and local-only template paths', () => {
    expect(shouldExcludeTemplatePath('node_modules/react/index.js')).toBe(true)
    expect(shouldExcludeTemplatePath('automation/reports/latest.json')).toBe(true)
    expect(shouldExcludeTemplatePath('prisma/dev.sqlite3')).toBe(true)
    expect(shouldExcludeTemplatePath('src/app/page.tsx')).toBe(false)
  })

  it('detects whether legacy environment config should be backfilled', () => {
    expect(shouldBackfillLegacyEnvironmentConfig(false, true)).toBe(true)
    expect(shouldBackfillLegacyEnvironmentConfig(true, true)).toBe(false)
    expect(shouldBackfillLegacyEnvironmentConfig(false, false)).toBe(false)
  })

  it('builds automation paths and extracts module paths from automation files', () => {
    expect(getAutomationLocatorMapPath('/repo')).toBe('/repo/automation/mapping/locator-map.json')
    expect(
      extractModulePathFromAutomationFile(
        '/repo/automation/features/payments/refunds/test.feature',
        '/repo',
        'features',
      ),
    ).toBe('/payments/refunds')
    expect(extractModulePathFromAutomationFile('/repo/automation/locators/root.ts', '/repo', 'locators')).toBe('/')
  })
})
