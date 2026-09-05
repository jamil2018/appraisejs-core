import type { QualityJourneyTriageReport } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import type { TriageInput } from './quality-journey-triage-input'

const fail = (message: string): never => {
  throw new ServiceError(message, 'CONFLICT')
}
const same = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === a.length && [...a].sort().every((v, i) => v === [...b].sort()[i])
function fullyEvidencedPass(run: TriageInput['runs'][number]) {
  return (
    run.evidence.result === 'PASSED' &&
    run.evidence.status === 'COMPLETED' &&
    run.evidence.evidenceHealth === 'valid' &&
    Array.isArray(run.evidence.missingArtifacts) &&
    run.evidence.missingArtifacts.length === 0
  )
}

/** Every material outcome has one primary attribution; successful execution is
 * not silently promoted to requirement success when its evidence is invalid. */
export function validateQualityJourneyTriageReport(report: QualityJourneyTriageReport, input: TriageInput) {
  if (
    report.executionCycleId !== input.executionCycleId ||
    report.cycleId !== input.cycleId ||
    report.predecessorReportRevisionId !== input.predecessorReport?.reportRevisionId
  )
    fail('Report source cycle or predecessor is outside the isolated assignment.')
  const material = input.runs.filter(run => !fullyEvidencedPass(run))
  if (
    !same(
      report.findings.map(f => f.testRunId),
      material.map(r => r.testRunId),
    ) ||
    new Set(report.findings.map(f => f.findingId)).size !== report.findings.length
  )
    fail('Every material outcome requires exactly one primary finding; finding IDs must be unique.')
  for (const finding of report.findings) validateFinding(finding, input)
  validateCoverage(report, input)
  validateRemediation(report)
}

function validateFinding(finding: QualityJourneyTriageReport['findings'][number], input: TriageInput) {
  const run = input.runs.find(r => r.testRunId === finding.testRunId)!
  const scenario = input.scenarios.find(s => s.revisionId === run.scenarioRevisionId)!
  if (
    finding.evidenceReceiptId !== run.evidenceReceiptId ||
    finding.scenarioRevisionId !== run.scenarioRevisionId ||
    !same(finding.requirementIds, scenario.intent.requirementIds ?? [])
  )
    fail('Finding run, evidence, scenario, or requirement linkage differs from accepted lineage.')
  if (finding.kind === 'TARGET_DEFECT' && !validFailedEvidence(run))
    fail('A target defect requires a failed run with complete valid sealed evidence.')
  if (finding.confidence === 'LOW' && !finding.unresolved) fail('Low-confidence attribution must remain unresolved.')
}

function validFailedEvidence(run: TriageInput['runs'][number]) {
  return (
    run.evidence.result === 'FAILED' &&
    run.evidence.evidenceHealth === 'valid' &&
    Array.isArray(run.evidence.missingArtifacts) &&
    run.evidence.missingArtifacts.length === 0
  )
}

function validateRemediation(report: QualityJourneyTriageReport) {
  if (report.remediation) {
    const proposal = report.remediation
    const findings = report.findings.filter(f => proposal.findingIds.includes(f.findingId))
    if (
      findings.length !== proposal.findingIds.length ||
      findings.some(f => f.kind !== 'VALIDATION_REALIZATION_DEFECT' || f.unresolved)
    )
      fail('Automation remediation requires resolved automation-realization findings.')
    if (!same(proposal.scenarioRevisionIds, [...new Set(findings.map(f => f.scenarioRevisionId))]))
      fail('Remediation must name exactly the scenarios of its approved correction findings.')
  }
}

function validateCoverage(report: QualityJourneyTriageReport, input: TriageInput) {
  const requirements = input.analysis.content.requirements.map(r => r.requirementId)
  if (
    !same(
      report.coverage.map(c => c.requirementId),
      requirements,
    )
  )
    fail('Coverage must account for every accepted requirement exactly once.')
  for (const coverage of report.coverage) {
    const scenarios = input.scenarios
      .filter(s => s.intent.requirementIds?.includes(coverage.requirementId))
      .map(s => s.revisionId)
    const runs = input.runs.filter(r => scenarios.includes(r.scenarioRevisionId))
    if (
      !same(coverage.scenarioRevisionIds, scenarios) ||
      !same(
        coverage.testRunIds,
        runs.map(r => r.testRunId),
      )
    )
      fail('Coverage scenario and run sets differ from exact accepted lineage.')
    const findings = report.findings.filter(f => coverage.testRunIds.includes(f.testRunId))
    const outcome = coverageOutcome(findings, runs, scenarios)
    if (coverage.outcome !== outcome)
      fail('Coverage outcome overstates or contradicts sealed evidence and attribution.')
  }
}

function coverageOutcome(
  findings: QualityJourneyTriageReport['findings'],
  runs: TriageInput['runs'],
  scenarios: string[],
) {
  if (findings.some(f => f.unresolved)) return 'UNRESOLVED'
  if (findings.some(f => f.kind === 'TARGET_DEFECT')) return 'FAILED'
  const fullyCovered = runs.length > 0 && scenarios.every(id => runs.some(r => r.scenarioRevisionId === id))
  return fullyCovered && runs.every(fullyEvidencedPass) ? 'PASSED' : 'NOT_EVALUATED'
}
