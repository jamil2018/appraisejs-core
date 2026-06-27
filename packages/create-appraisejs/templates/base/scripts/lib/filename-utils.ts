import { extractModulePathFromAutomationFile } from '../../src/lib/template-sync-utils'

/**
 * Extracts test-suite identity from a `.feature` filename.
 */
export function extractTestSuiteNameFromFilename(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  return fileName.replace(/\.feature$/, '')
}

/**
 * Extracts locator group name from a locator `.json` file path.
 */
export function extractLocatorGroupName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() || ''
  return fileName.replace('.json', '')
}

/**
 * Resolves module path from a locator file under `automation/locators`.
 */
export function extractModulePathFromLocatorFile(filePath: string, baseDir: string): string {
  return extractModulePathFromAutomationFile(filePath, baseDir, 'locators')
}
