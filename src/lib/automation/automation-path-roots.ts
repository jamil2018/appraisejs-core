import path from 'path'

// Two-arg join with turbopackIgnore on process.cwd() — required for Turbopack NFT (see Next.js docs).
function getRepoRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), '.')
}

let automationRootCache: string | undefined
let legacyTestsRootCache: string | undefined

export function getAutomationRoot(): string {
  if (automationRootCache === undefined) {
    automationRootCache = path.join(getRepoRoot(), 'automation')
  }
  return automationRootCache
}

export function getLegacyTestsRoot(): string {
  if (legacyTestsRootCache === undefined) {
    legacyTestsRootCache = path.join(getRepoRoot(), 'src', 'tests')
  }
  return legacyTestsRootCache
}

export function getAutomationConfigDir(): string {
  return path.join(getAutomationRoot(), 'config')
}

export function getAutomationEnvironmentsDir(): string {
  return path.join(getAutomationConfigDir(), 'environments')
}

export function getAutomationFeaturesDir(): string {
  return path.join(getAutomationRoot(), 'features')
}

export function getAutomationLocatorsDir(): string {
  return path.join(getAutomationRoot(), 'locators')
}

export function getAutomationMappingDir(): string {
  return path.join(getAutomationRoot(), 'mapping')
}

export function getAutomationReportsDir(): string {
  return path.join(getAutomationRoot(), 'reports')
}

export function getAutomationReportRunDir(runId: string): string {
  return path.join(getAutomationReportsDir(), runId)
}

export function getAutomationRunReportPath(runId: string): string {
  return path.join(getAutomationReportRunDir(runId), 'cucumber.json')
}

export function buildJsonReportFormat(reportPath: string): string {
  return `json:${toProjectRelativePath(reportPath)}`
}

function getAutomationReportLogsDir(runId: string): string {
  return path.join(getAutomationReportRunDir(runId), 'logs')
}

export function getAutomationRunLogPath(runId: string): string {
  return path.join(getAutomationReportLogsDir(runId), 'run.log')
}

export function toProjectRelativePath(targetPath: string): string {
  const normalizedPath = path.isAbsolute(targetPath) ? path.relative(getRepoRoot(), targetPath) : targetPath
  return normalizedPath.replace(/\\/g, '/')
}

export function resolveStoredPath(storedPath: string): string {
  if (path.isAbsolute(storedPath)) {
    return storedPath
  }
  return path.join(getRepoRoot(), storedPath)
}

export function getAutomationStepsDir(): string {
  return path.join(getAutomationRoot(), 'steps')
}

export function getAutomationActionStepsDir(): string {
  return path.join(getAutomationStepsDir(), 'actions')
}

export function getAutomationValidationStepsDir(): string {
  return path.join(getAutomationStepsDir(), 'validations')
}
