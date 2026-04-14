import { join, relative } from 'path'

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', 'dist'])
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.tsbuildinfo'])
const EXCLUDED_PATH_PREFIXES = ['automation/reports/']
const EXCLUDED_FILENAMES = new Set(['.DS_Store'])

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function shouldExcludeTemplatePath(relativePath: string): boolean {
  const normalizedPath = toPosixPath(relativePath)
  const parts = normalizedPath.split('/')

  if (parts.some(part => EXCLUDED_DIRS.has(part))) return true
  if (parts.some(part => EXCLUDED_FILENAMES.has(part))) return true
  if (EXCLUDED_PATH_PREFIXES.some(prefix => normalizedPath.startsWith(prefix))) return true

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

export function getAutomationFeaturesDir(baseDir: string): string {
  return join(baseDir, 'automation', 'features')
}

export function getAutomationLocatorsDir(baseDir: string): string {
  return join(baseDir, 'automation', 'locators')
}

export function getAutomationLocatorMapPath(baseDir: string): string {
  return join(baseDir, 'automation', 'mapping', 'locator-map.json')
}

export function extractModulePathFromAutomationFile(
  filePath: string,
  baseDir: string,
  automationSubdir: 'features' | 'locators',
): string {
  const automationBaseDir =
    automationSubdir === 'features' ? getAutomationFeaturesDir(baseDir) : getAutomationLocatorsDir(baseDir)
  const normalizedBaseDir = toPosixPath(automationBaseDir).replace(/\/$/, '')
  const normalizedFilePath = toPosixPath(filePath)
  const relativePath = normalizedFilePath.startsWith(`${normalizedBaseDir}/`)
    ? normalizedFilePath.slice(normalizedBaseDir.length + 1)
    : toPosixPath(relative(automationBaseDir, filePath))
  const pathParts = relativePath.split('/').filter(part => part && part !== '')
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? `/${moduleParts.join('/')}` : '/'
}
