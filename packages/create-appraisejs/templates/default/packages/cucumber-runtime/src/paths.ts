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

export function resolveProjectPath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath)
}

export function toProjectRelativePath(targetPath: string): string {
  const normalizedPath = path.isAbsolute(targetPath) ? path.relative(process.cwd(), targetPath) : targetPath
  return normalizedPath.replace(/\\/g, '/')
}

export function getAutomationReportRunDirFromReportPath(reportPath: string): string {
  return path.dirname(resolveProjectPath(reportPath))
}

export function getAutomationTraceDir(reportPath = process.env.REPORT_PATH): string {
  if (reportPath) {
    return path.join(getAutomationReportRunDirFromReportPath(reportPath), 'traces')
  }

  return path.join(getAutomationReportsDir(), 'traces')
}

export function getAutomationScreenshotDir(reportPath = process.env.REPORT_PATH): string {
  if (reportPath) {
    return path.join(getAutomationReportRunDirFromReportPath(reportPath), 'screenshots')
  }

  return path.join(getAutomationReportsDir(), 'screenshots')
}
