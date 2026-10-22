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
    expect(shouldExcludeTemplatePath('scripts/test-harness/m06/source-custody/source-custody-owner.mjs')).toBe(true)
    expect(shouldExcludeTemplatePath('test-harness/m06/service-custody/custody-service-owner.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('src/lib/quality-journey/provider-source-database.sqlite.test.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('lib/quality-journey/codex-app-server/outcome-source.sqlite.test.ts')).toBe(true)
    expect(
      shouldExcludeTemplatePath('src/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal.test.ts'),
    ).toBe(true)
    expect(
      shouldExcludeTemplatePath('src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts'),
    ).toBe(true)
    expect(shouldExcludeTemplatePath('src/lib/quality-journey/codex-app-server/outcome-source.ts')).toBe(false)
    for (const source of [
      'src/services/coordinator/quality-journey-analysis-followup-budget.ts',
      'services/coordinator/quality-journey-analysis-followup-budget.ts',
      'src/services/coordinator/quality-journey-analysis-authority.ts',
      'services/coordinator/quality-journey-analysis-authority.ts',
    ])
      expect(shouldExcludeTemplatePath(source)).toBe(false)
    expect(shouldExcludeTemplatePath('src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('lib/quality-journey/scenario-contracts.mcp-parity.test.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('src/app/page.tsx')).toBe(false)
  })

  it('keeps native12 source assembly and cross-package factories repository-only', () => {
    for (const source of [
      'scripts/m06-native-fixture-workspace-13.mjs',
      'm06-native-fixture-workspace-13.mjs',
      'scripts/tests/m06-native-fixture-workspace-13.test.mjs',
      'tests/m06-native-fixture-workspace-13.test.mjs',
      'src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts.orig',
      'services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts.orig',
      'src/test/m06-analysis-retained-composition.ts',
      'src/test/m06-analysis-retained-composition.test.ts',
      'test/m06-analysis-retained-composition.test.ts',
      'test/m06-analysis-retained-composition.ts',
      'src/test/m06-analysis-retained-lifetime.ts',
      'test/m06-analysis-retained-lifetime.ts',
      'src/test/m06-analysis-retained-fixture.ts',
      'test/m06-analysis-retained-fixture.ts',
      'src/test/m06-analysis-retained-scenarios.ts',
      'test/m06-analysis-retained-scenarios.ts',
      'src/test/m06-analysis-retained-canonical.ts',
      'test/m06-analysis-retained-canonical.ts',
      'src/test/m06-analysis-retained-controller.ts',
      'test/m06-analysis-retained-controller.ts',
      'src/test/m06-analysis-retained-lifetime.test.ts',
      'test/m06-analysis-retained-lifetime.test.ts',
      'src/services/coordinator/quality-journey-analysis-scheduler.ts',
      'src/services/coordinator/quality-journey-analysis-scheduler.test.ts',
      'services/coordinator/quality-journey-analysis-scheduler.ts',
      'services/coordinator/quality-journey-analysis-scheduler.test.ts',
      'src/services/coordinator/quality-journey-analysis-scheduler.sqlite.integration.test.ts',
      'services/coordinator/quality-journey-analysis-scheduler.sqlite.integration.test.ts',
      'scripts/m06-native-patch-cli.mjs',
      'm06-native-patch-cli.mjs',
      'scripts/tests/m06-native-patch-cli.test.mjs',
      'tests/m06-native-patch-cli.test.mjs',
      'scripts/m06-native-patch-15.mjs',
      'm06-native-patch-15.mjs',
      'scripts/tests/m06-native-patch-15.test.mjs',
      'tests/m06-native-patch-15.test.mjs',
      'scripts/m06-native-patch-13.mjs',
      'm06-native-patch-13.mjs',
      'scripts/tests/m06-native-patch-13.test.mjs',
      'tests/m06-native-patch-13.test.mjs',
      'scripts/m06-native-patch-12.mjs',
      'm06-native-patch-12.mjs',
      'scripts/tests/m06-native-patch-12.test.mjs',
      'tests/m06-native-patch-12.test.mjs',
      'src/lib/quality-journey/codex-app-server/native-owned-session.ts',
      'lib/quality-journey/codex-app-server/native-mcp-session-bridge.ts',
      'src/services/coordinator/quality-journey-native-mcp-custody.sqlite.integration.test.ts',
      'src/app/api/internal/coordinator/[...operation]/repository-collaboration-public.integration.test.ts',
      'app/api/internal/coordinator/[...operation]/repository-collaboration-public.integration.test.ts',
      'scripts/tests/fixtures/m06-native-source-child.mjs',
      'tests/fixtures/m06-native-source-child.mjs',
    ])
      expect(shouldExcludeTemplatePath(source)).toBe(true)
    for (const source of [
      'src/lib/quality-journey/codex-app-server/native-source-owner.ts',
      'src/lib/quality-journey/codex-app-server/native-source-protocol.ts',
      'src/services/coordinator/quality-journey-native-mcp-acceptance.ts',
    ])
      expect(shouldExcludeTemplatePath(source)).toBe(false)
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
