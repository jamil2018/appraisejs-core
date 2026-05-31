import { join, relative } from 'path'

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function getAutomationFeaturesDir(baseDir: string): string {
  return join(baseDir, 'automation', 'features')
}

function getAutomationLocatorsDir(baseDir: string): string {
  return join(baseDir, 'automation', 'locators')
}

export function getAutomationLocatorMapPath(baseDir: string): string {
  return toPosixPath(join(baseDir, 'automation', 'mapping', 'locator-map.json'))
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
