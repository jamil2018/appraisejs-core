import path from 'path'

export function getAutomationRoot(): string {
  return path.join(process.cwd(), 'automation')
}

export function getAutomationConfigDir(): string {
  return path.join(getAutomationRoot(), 'config')
}

export function getAutomationEnvironmentsFilePath(): string {
  return path.join(getAutomationConfigDir(), 'environments', 'environments.json')
}

export function getAutomationFeaturesDir(): string {
  return path.join(getAutomationRoot(), 'features')
}

export function getAutomationLocatorsDir(): string {
  return path.join(getAutomationRoot(), 'locators')
}

export function getAutomationLocatorMapPath(): string {
  return path.join(getAutomationRoot(), 'mapping', 'locator-map.json')
}

export function getAutomationReportsDir(): string {
  return path.join(getAutomationRoot(), 'reports')
}

export function getAutomationTraceDir(): string {
  return path.join(getAutomationReportsDir(), 'traces')
}
