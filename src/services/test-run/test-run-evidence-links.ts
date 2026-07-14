export function testRunEvidenceLinks(runId: string, targetProjectId: string) {
  const encodedProjectId = encodeURIComponent(targetProjectId)
  return {
    reportUrl: `/test-runs/${runId}?project=${encodedProjectId}`,
    logsUrl: `/api/test-runs/${runId}/logs?targetProjectId=${encodedProjectId}`,
    diagnosticsUrl: `/api/test-runs/${runId}/diagnostics?targetProjectId=${encodedProjectId}`,
  }
}
