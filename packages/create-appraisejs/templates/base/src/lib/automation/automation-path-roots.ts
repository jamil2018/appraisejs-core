import path from 'path'

// Two-arg join with turbopackIgnore on process.cwd() — required for Turbopack NFT (see Next.js docs).
function getRepoRoot(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), '.')
}

let automationRootCache: string | undefined
let legacyTestsRootCache: string | undefined

function getPathRoot(projectRoot?: string): string {
  return projectRoot ? path.resolve(projectRoot) : getRepoRoot()
}

export function getAutomationRoot(projectRoot?: string): string {
  if (projectRoot) return path.join(getPathRoot(projectRoot), 'automation')
  if (automationRootCache === undefined) {
    automationRootCache = path.join(getRepoRoot(), 'automation')
  }
  return automationRootCache
}

export function getLegacyTestsRoot(projectRoot?: string): string {
  if (projectRoot) return path.join(getPathRoot(projectRoot), 'src', 'tests')
  if (legacyTestsRootCache === undefined) {
    legacyTestsRootCache = path.join(getRepoRoot(), 'src', 'tests')
  }
  return legacyTestsRootCache
}

export function getAutomationConfigDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'config')
}

export function getAutomationEnvironmentsDir(projectRoot?: string): string {
  return path.join(getAutomationConfigDir(projectRoot), 'environments')
}

export function getAutomationFeaturesDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'features')
}

export function getAutomationLocatorsDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'locators')
}

export function getAutomationMappingDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'mapping')
}

export function getAutomationReportsDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'reports')
}

export function getAutomationReportRunDir(runId: string, projectRoot?: string): string {
  return path.join(getAutomationReportsDir(projectRoot), runId)
}

export function getAutomationRunReportPath(runId: string, projectRoot?: string): string {
  return path.join(getAutomationReportRunDir(runId, projectRoot), 'cucumber.json')
}

export function buildJsonReportFormat(reportPath: string, projectRoot?: string): string {
  return `json:${toProjectRelativePath(reportPath, projectRoot)}`
}

function getAutomationReportLogsDir(runId: string, projectRoot?: string): string {
  return path.join(getAutomationReportRunDir(runId, projectRoot), 'logs')
}

export function getAutomationRunLogPath(runId: string, projectRoot?: string): string {
  return path.join(getAutomationReportLogsDir(runId, projectRoot), 'run.log')
}

export function toProjectRelativePath(targetPath: string, projectRoot?: string): string {
  const normalizedTargetPath = targetPath.replace(/\\/g, '/')
  const normalizedRepoRoot = getPathRoot(projectRoot).replace(/\\/g, '/')
  const normalizedPath = path.isAbsolute(targetPath)
    ? path.posix.relative(normalizedRepoRoot, normalizedTargetPath)
    : normalizedTargetPath
  return normalizedPath
}

export function resolveStoredPath(storedPath: string, projectRoot?: string): string {
  if (path.isAbsolute(storedPath)) {
    return storedPath
  }
  return path.join(getPathRoot(projectRoot), storedPath)
}

export function getAutomationStepsDir(projectRoot?: string): string {
  return path.join(getAutomationRoot(projectRoot), 'steps')
}

export function getAutomationActionStepsDir(projectRoot?: string): string {
  return path.join(getAutomationStepsDir(projectRoot), 'actions')
}

export function getAutomationValidationStepsDir(projectRoot?: string): string {
  return path.join(getAutomationStepsDir(projectRoot), 'validations')
}
