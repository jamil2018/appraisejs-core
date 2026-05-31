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

export function getAutomationReportRunDir(runId: string): string {
  return path.join(getAutomationReportsDir(), runId)
}

export function resolveProjectPath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(process.cwd(), targetPath)
}

export function toProjectRelativePath(targetPath: string): string {
  const normalizedTargetPath = targetPath.replace(/\\/g, '/')
  const normalizedProjectRoot = process.cwd().replace(/\\/g, '/')
  const normalizedPath = path.isAbsolute(targetPath)
    ? path.posix.relative(normalizedProjectRoot, normalizedTargetPath)
    : normalizedTargetPath
  return normalizedPath
}

export function getAutomationReportRunDirFromReportPath(reportPath: string): string {
  return path.dirname(resolveProjectPath(reportPath))
}

export function buildJsonReportFormat(reportPath: string): string {
  return `json:${toProjectRelativePath(reportPath)}`
}

function extractReportPathFromFormat(reportFormat = process.env.REPORT_FORMAT): string | null {
  if (!reportFormat) {
    return null
  }

  const quotedMatch = /^"json"\s*:\s*"(.*)"\s*$/.exec(reportFormat)
  if (quotedMatch) {
    return quotedMatch[1].length > 0 ? quotedMatch[1] : null
  }

  if (reportFormat.startsWith('json:')) {
    const reportPath = reportFormat.slice('json:'.length).trim()
    return reportPath.length > 0 ? reportPath : null
  }

  return null
}

function getRuntimeReportRunDir(
  reportPath = process.env.REPORT_PATH,
  reportFormat = process.env.REPORT_FORMAT,
  testRunId = process.env.TEST_RUN_ID,
): string | null {
  const resolvedReportPath = reportPath ?? extractReportPathFromFormat(reportFormat)
  if (resolvedReportPath) {
    return getAutomationReportRunDirFromReportPath(resolvedReportPath)
  }

  if (testRunId) {
    return getAutomationReportRunDir(testRunId)
  }

  return null
}

export function getAutomationTraceDir(
  reportPath = process.env.REPORT_PATH,
  testRunId = process.env.TEST_RUN_ID,
  reportFormat = process.env.REPORT_FORMAT,
): string {
  const runDir = getRuntimeReportRunDir(reportPath, reportFormat, testRunId)
  if (runDir) {
    return path.join(runDir, 'traces')
  }

  return path.join(getAutomationReportsDir(), 'traces')
}

export function getAutomationScreenshotDir(
  reportPath = process.env.REPORT_PATH,
  testRunId = process.env.TEST_RUN_ID,
  reportFormat = process.env.REPORT_FORMAT,
): string {
  const runDir = getRuntimeReportRunDir(reportPath, reportFormat, testRunId)
  if (runDir) {
    return path.join(runDir, 'screenshots')
  }

  return path.join(getAutomationReportsDir(), 'screenshots')
}
