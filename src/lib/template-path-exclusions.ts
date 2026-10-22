const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'graphify-out'])
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.tsbuildinfo'])
const EXCLUDED_PATH_PREFIXES = ['automation/reports/']
const REPOSITORY_ONLY_TEMPLATE_PREFIXES = [
  'scripts/test-harness/m06/',
  'test-harness/m06/',
  'fixtures/p0-',
  'lib/managed-journey-',
  'lib/p0-',
  'qualify-managed-journey-',
  'qualify-p0-',
  'scripts/fixtures/p0-',
  'scripts/lib/managed-journey-',
  'scripts/lib/p0-',
  'scripts/qualify-managed-journey-',
  'scripts/qualify-p0-',
  'scripts/tests/managed-journey-',
  'scripts/tests/p0-',
  'tests/managed-journey-',
  'tests/p0-',
  'lib/quality-journey/managed-worker-gateway.',
  'src/lib/quality-journey/managed-worker-gateway.',
]
const REPOSITORY_ONLY_TEMPLATE_PATHS = new Set([
  'scripts/m06-native-fixture-workspace-13.mjs',
  'm06-native-fixture-workspace-13.mjs',
  'scripts/tests/m06-native-fixture-workspace-13.test.mjs',
  'tests/m06-native-fixture-workspace-13.test.mjs',
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
  'src/lib/quality-journey/codex-app-server/native-owned-session.test.ts',
  'src/lib/quality-journey/codex-app-server/native-mcp-session-bridge.ts',
  'src/lib/quality-journey/codex-app-server/native-mcp-session-bridge.test.ts',
  'src/services/coordinator/quality-journey-native-mcp-custody.sqlite.integration.test.ts',
  'src/app/api/internal/coordinator/[...operation]/repository-collaboration-public.integration.test.ts',
  'scripts/tests/fixtures/m06-native-source-child.mjs',
  'tests/fixtures/m06-native-source-child.mjs',
  'scripts/m06-native-patch-10.mjs',
  'm06-native-patch-10.mjs',
  'scripts/tests/m06-native-patch-10.test.mjs',
  'tests/m06-native-patch-10.test.mjs',
  'scripts/m06-native-patch-11.mjs',
  'm06-native-patch-11.mjs',
  'scripts/tests/m06-native-patch-11.test.mjs',
  'tests/m06-native-patch-11.test.mjs',
  'scripts/m06-analysis-loop-smoke.ts',
  'm06-analysis-loop-smoke.ts',
  'src/test/quality-journey-physical-source.ts',
  'src/lib/quality-journey/provider-intent-contract.test.ts',
  'src/test/m06-analysis-loop.ts',
  'src/test/m06-analysis-retained-composition.ts',
  'src/test/m06-analysis-retained-composition.test.ts',
  'src/test/m06-analysis-retained-lifetime.ts',
  'src/test/m06-analysis-retained-fixture.ts',
  'src/test/m06-analysis-retained-scenarios.ts',
  'src/test/m06-analysis-retained-canonical.ts',
  'src/test/m06-analysis-retained-controller.ts',
  'src/test/m06-analysis-retained-lifetime.test.ts',
  'src/services/coordinator/quality-journey-analysis-fixture-input.ts',
  'src/services/coordinator/quality-journey-analysis-driver.ts',
  'src/services/coordinator/quality-journey-analysis-driver.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-provider-reconciliation.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-terminal-outcome-owner.sqlite.integration.test.ts',
  'src/lib/quality-journey/provider-source-database.sqlite.test.ts',
  'src/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal.test.ts',
  'src/lib/quality-journey/codex-app-server/outcome-source.sqlite.test.ts',
  'src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts.orig',
  'scripts/quality-journey-c33-clean-install.mjs',
  'scripts/m06-analysis-smoke.ts',
  'm06-analysis-smoke.ts',
  'src/services/coordinator/quality-journey-analysis-delivery.ts',
  'src/services/coordinator/quality-journey-analysis-delivery.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-analysis-scheduler.ts',
  'src/services/coordinator/quality-journey-analysis-scheduler.test.ts',
  'src/services/coordinator/quality-journey-analysis-scheduler.sqlite.integration.test.ts',
  'scripts/m05-owned-process-smoke.ts',
  'm05-owned-process-smoke.ts',
  'src/lib/quality-journey/codex-app-server/owned-child.test.ts',
  'src/services/coordinator/quality-journey-process-supervisor.sqlite.integration.test.ts',
  'src/lib/quality-journey/automation-contracts.mcp-parity.test.ts',
  'src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts',
])
const EXCLUDED_FILENAMES = new Set(['.DS_Store'])

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function shouldExcludeTemplatePath(relativePath: string): boolean {
  const normalizedPath = toPosixPath(relativePath)
  const parts = normalizedPath.split('/')

  if (parts.some(part => EXCLUDED_DIRS.has(part))) return true
  if (parts.some(part => EXCLUDED_FILENAMES.has(part))) return true
  // Root sync copies `src/` with paths relative to that directory, while other
  // sync callers pass repository-relative paths. Accept both representations.
  if (
    REPOSITORY_ONLY_TEMPLATE_PATHS.has(normalizedPath) ||
    REPOSITORY_ONLY_TEMPLATE_PATHS.has(`src/${normalizedPath}`)
  ) {
    return true
  }
  if (REPOSITORY_ONLY_TEMPLATE_PREFIXES.some(prefix => normalizedPath.startsWith(prefix))) return true
  if (
    EXCLUDED_PATH_PREFIXES.some(prefix => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix))
  ) {
    return true
  }

  const ext = normalizedPath.endsWith('.sqlite3')
    ? '.sqlite3'
    : normalizedPath.endsWith('.sqlite')
      ? '.sqlite'
      : normalizedPath.endsWith('.tsbuildinfo')
        ? '.tsbuildinfo'
        : normalizedPath.slice(normalizedPath.lastIndexOf('.'))

  return EXCLUDED_EXTENSIONS.has(ext)
}

export function shouldBackfillLegacyEnvironmentConfig(
  targetHasEnvironmentsFile: boolean,
  legacyEnvironmentsDirExists: boolean,
): boolean {
  return !targetHasEnvironmentsFile && legacyEnvironmentsDirExists
}
