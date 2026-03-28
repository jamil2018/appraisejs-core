import { getAutomationLocatorsDir } from '@/lib/automation/paths'
import path from 'path'

export function extractModulePathFromLocatorFile(filePath: string): string {
  const locatorsDir = getAutomationLocatorsDir()
  const relativePath = path.relative(locatorsDir, filePath)
  const pathParts = relativePath.split(/[/\\]/).filter(part => part)
  const moduleParts = pathParts.slice(0, -1)
  return moduleParts.length > 0 ? `/${moduleParts.join('/')}` : '/'
}

export function extractLocatorGroupName(filePath: string): string {
  return path.basename(filePath.replace(/\\/g, '/'), '.json')
}
