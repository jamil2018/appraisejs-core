export function reportStepEvidenceHref(projectId: string, reportId: string, stepId: string) {
  const query = new URLSearchParams({ project: projectId, step: stepId })
  return `/reports/${encodeURIComponent(reportId)}?${query}#step-evidence`
}

export function reportStepScreenshotHref(projectId: string, stepId: string) {
  const query = new URLSearchParams({ targetProjectId: projectId })
  return `/api/reports/steps/${encodeURIComponent(stepId)}/screenshot?${query}`
}
