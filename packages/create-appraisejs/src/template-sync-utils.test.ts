import {
  extractModulePathFromAutomationFile,
  getAutomationLocatorMapPath,
  shouldBackfillLegacyEnvironmentConfig,
  shouldExcludeTemplatePath,
} from '../../../src/lib/template-sync-utils.js'
import { describe, expect, it } from 'vitest'

describe('shouldExcludeTemplatePath', () => {
  it.each([
    'scripts/m06-native-patch-10.mjs',
    'm06-native-patch-10.mjs',
    'scripts/tests/m06-native-patch-10.test.mjs',
    'tests/m06-native-patch-10.test.mjs',
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
    'src/lib/quality-journey/codex-app-server/native-owned-session.test.ts',
    'src/lib/quality-journey/codex-app-server/native-mcp-session-bridge.test.ts',
    'src/services/coordinator/quality-journey-native-mcp-custody.sqlite.integration.test.ts',
    'src/app/api/internal/coordinator/[...operation]/repository-collaboration-public.integration.test.ts',
    'app/api/internal/coordinator/[...operation]/repository-collaboration-public.integration.test.ts',
    'scripts/tests/fixtures/m06-native-source-child.mjs',
    'tests/fixtures/m06-native-source-child.mjs',
    'scripts/m06-native-patch-11.mjs',
    'm06-native-patch-11.mjs',
    'scripts/tests/m06-native-patch-11.test.mjs',
    'tests/m06-native-patch-11.test.mjs',
  ])('keeps the source-bound native patch preparer out of scaffolds: %s', file => {
    expect(shouldExcludeTemplatePath(file)).toBe(true)
  })

  it('retains ordinary scripts beside the repository-only preparer', () => {
    expect(shouldExcludeTemplatePath('scripts/migrate-compatible.mjs')).toBe(false)
    expect(shouldExcludeTemplatePath('migrate-compatible.mjs')).toBe(false)
  })

  it('excludes report artifacts, plan artifacts, Graphify output, database files, and OS artifacts', () => {
    expect(shouldExcludeTemplatePath('automation/reports/logs/run.log')).toBe(true)
    expect(shouldExcludeTemplatePath('src/graphify-out/graph.json')).toBe(true)
    expect(shouldExcludeTemplatePath('prisma/graphify-out/GRAPH_REPORT.md')).toBe(true)
    expect(shouldExcludeTemplatePath('scripts/graphify-out/graph.html')).toBe(true)
    expect(shouldExcludeTemplatePath('prisma/dev.db')).toBe(true)
    expect(shouldExcludeTemplatePath('tsconfig.tsbuildinfo')).toBe(true)
    expect(shouldExcludeTemplatePath('automation/steps/.DS_Store')).toBe(true)
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
    expect(shouldExcludeTemplatePath('scripts/qualify-p0-r2f-auth.mjs')).toBe(true)
    expect(shouldExcludeTemplatePath('scripts/lib/managed-journey-isolated-launch.mjs')).toBe(true)
    expect(shouldExcludeTemplatePath('scripts/fixtures/p0-r2f-serializer/input.json')).toBe(true)
    expect(shouldExcludeTemplatePath('lib/p0-r2d-canonical-bridge.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('qualify-managed-journey-provider.mjs')).toBe(true)
    expect(shouldExcludeTemplatePath('src/lib/quality-journey/managed-worker-gateway.ts')).toBe(true)
  })

  it('keeps normal source files and config files', () => {
    expect(shouldExcludeTemplatePath('automation/features/base/login.feature')).toBe(false)
    expect(shouldExcludeTemplatePath('prisma/schema.prisma')).toBe(false)
    expect(shouldExcludeTemplatePath('package.json')).toBe(false)
  })
})

describe('shouldBackfillLegacyEnvironmentConfig', () => {
  it('backs fills only when the target file is missing and the legacy directory exists', () => {
    expect(shouldBackfillLegacyEnvironmentConfig(false, true)).toBe(true)
    expect(shouldBackfillLegacyEnvironmentConfig(true, true)).toBe(false)
    expect(shouldBackfillLegacyEnvironmentConfig(false, false)).toBe(false)
  })
})

describe('extractModulePathFromAutomationFile', () => {
  it('derives locator module paths from automation locators', () => {
    expect(extractModulePathFromAutomationFile('/repo/automation/locators/base/login.json', '/repo', 'locators')).toBe(
      '/base',
    )
  })

  it('derives nested feature module paths from automation features', () => {
    expect(
      extractModulePathFromAutomationFile(
        '/repo/automation/features/users/admins/directors/login.feature',
        '/repo',
        'features',
      ),
    ).toBe('/users/admins/directors')
  })

  it('handles windows-style paths', () => {
    expect(
      extractModulePathFromAutomationFile(
        'C:\\repo\\automation\\locators\\users\\admins\\dashboard.json',
        'C:\\repo',
        'locators',
      ),
    ).toBe('/users/admins')
  })

  it('returns the root module for top-level feature files', () => {
    expect(extractModulePathFromAutomationFile('/repo/automation/features/login.feature', '/repo', 'features')).toBe(
      '/',
    )
  })
})

describe('getAutomationLocatorMapPath', () => {
  it('points locator-map.json into the automation workspace', () => {
    expect(getAutomationLocatorMapPath('/repo')).toBe('/repo/automation/mapping/locator-map.json')
  })
})
