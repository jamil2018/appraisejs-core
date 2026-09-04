const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'graphify-out'])
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.tsbuildinfo'])
const EXCLUDED_PATH_PREFIXES = ['automation/reports/']
const REPOSITORY_ONLY_TEMPLATE_PATHS = new Set(['src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts'])
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
