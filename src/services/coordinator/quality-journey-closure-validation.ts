import type { z } from 'zod'
import {
  hashQualityJourneyExecutionValue as hash,
  journeyClosureSchema,
  type QualityJourneyTriageReport,
} from '@/lib/quality-journey'
import { triageInputArtifacts, type TriageInput } from './quality-journey-triage-input'

type ClosureItem = z.infer<typeof journeyClosureSchema>['unresolvedItems'][number]

/** Free-text risk is never interpreted as permission. IDs stay bounded even
 * when report, requirement, and finding identifiers use their maximum length. */
export function qualityJourneyClosureItems(
  report: QualityJourneyTriageReport,
  contentHash: string,
  input: TriageInput,
): ClosureItem[] {
  const reportRef: ClosureItem['artifactRefs'][number] = {
    kind: 'TEST_REPORT_ANALYSIS_REVISION',
    artifactId: report.reportRevisionId,
    revisionId: report.reportRevisionId,
    contentHash,
  }
  const refs = triageInputArtifacts(input)
  const itemId = (kind: string, identity: string) =>
    `qjci_${hash({ reportRevisionId: report.reportRevisionId, contentHash, kind, identity }).slice(7)}`
  const provenance = (scenarios: string[], runs: string[]) => {
    const evidence = input.runs.filter(run => runs.includes(run.testRunId)).map(run => run.evidenceReceiptId)
    return [
      reportRef,
      ...refs.filter(
        ref =>
          ref.kind === 'ANALYSIS_CHARTER_REVISION' ||
          (ref.kind === 'SCENARIO_REVISION' && scenarios.includes(ref.revisionId!)) ||
          (ref.kind === 'TEST_RUN' && runs.includes(ref.artifactId)) ||
          (ref.kind === 'EVIDENCE_RECEIPT' && evidence.includes(ref.artifactId)),
      ),
    ]
  }
  return [
    ...report.findings.map(finding => ({
      itemId: itemId('finding', finding.findingId),
      summary: `${finding.kind}: ${finding.rationale}`,
      artifactRefs: provenance([finding.scenarioRevisionId], [finding.testRunId]),
    })),
    ...report.coverage
      .filter(item => item.outcome !== 'PASSED')
      .map(item => ({
        itemId: itemId('coverage', item.requirementId),
        summary: `${item.outcome}: ${item.rationale}`,
        artifactRefs: provenance(item.scenarioRevisionIds, item.testRunIds),
      })),
    ...report.residualRisks.map((summary, index) => ({
      itemId: itemId('risk', String(index)),
      summary,
      artifactRefs: [reportRef],
    })),
  ].sort((a, b) => a.itemId.localeCompare(b.itemId))
}
