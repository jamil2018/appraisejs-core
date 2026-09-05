import type { Prisma } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashQualityJourneyExecutionValue as hash, type AssignmentManifest } from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'

export type TriageInput = {
  journeyId: string
  targetProjectId: string
  executionCycleId: string
  cycleId: string
  analysis: {
    artifactId: string
    revisionId: string
    contentHash: string
    content: { requirements: Array<{ requirementId: string; statement: string }> }
  }
  scenarios: Array<{
    artifactId: string
    revisionId: string
    contentHash: string
    intent: { requirementIds?: string[]; [key: string]: unknown }
  }>
  runs: Array<{
    testRunId: string
    runId: string
    scenarioRevisionId: string
    evidenceReceiptId: string
    receiptHash: string
    evidence: { result: string; status: string; evidenceHealth: string; [key: string]: unknown }
  }>
  predecessorReport?: { reportRevisionId: string; contentHash: string; report: unknown; feedback: string }
}
const conflict = (message: string) => new ServiceError(message, 'CONFLICT')

function matchesEvidenceCycle(
  evidence: Record<string, unknown>,
  scope: { journeyId: string; targetProjectId: string },
  cycle: { id: string; cycleId: string; preparedCapsulesHash: string; environmentSnapshotHash: string },
) {
  return (
    evidence.journeyId === scope.journeyId &&
    evidence.targetProjectId === scope.targetProjectId &&
    evidence.cycleId === cycle.cycleId &&
    evidence.executionCycleId === cycle.id &&
    evidence.preparedCapsulesHash === cycle.preparedCapsulesHash &&
    evidence.environmentSnapshotHash === cycle.environmentSnapshotHash
  )
}

function matchesEvidenceRun(
  evidence: Record<string, unknown>,
  binding: { testRunId: string; runId: string; preparedCapsuleId: string },
) {
  return (
    evidence.testRunId === binding.testRunId &&
    evidence.runId === binding.runId &&
    evidence.preparedCapsuleId === binding.preparedCapsuleId
  )
}

/** This projection is an allowlist: no Automator result envelope, worker narrative,
 * credentials, mutable run summary, or broad artifact-library contents are inputs. */
export async function compileQualityJourneyTriageInput(
  scope: { journeyId: string; targetProjectId: string; executionCycleId: string },
  tx: Prisma.TransactionClient,
): Promise<TriageInput> {
  const cycle = await tx.qualityJourneyExecutionCycle.findFirst({
    where: { id: scope.executionCycleId, journeyId: scope.journeyId, targetProjectId: scope.targetProjectId },
    include: { testRuns: true, evidenceReceipts: true },
  })
  if (
    !cycle ||
    !['COMPLETED', 'CANCELLED'].includes(cycle.status) ||
    !cycle.testRuns.length ||
    cycle.testRuns.length !== cycle.evidenceReceipts.length
  )
    throw conflict('Triage requires every run in a terminal execution cycle to have sealed evidence.')
  const capsules = JSON.parse(cycle.preparedCapsulesJson) as Array<{
    preparedCapsuleId: string
    scenarioRevisionId: string
  }>
  if (hash(capsules) !== cycle.preparedCapsulesHash) throw conflict('Frozen execution capsule scope is corrupt.')
  const scenarios = await tx.qualityJourneyScenarioRevision.findMany({
    where: {
      scenarioRevisionId: { in: capsules.map(c => c.scenarioRevisionId) },
      portfolioRevision: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId },
    },
    include: {
      portfolioRevision: {
        include: { discoveryRevision: { include: { analysisRevision: { include: { artifact: true } } } } },
      },
      decisions: true,
    },
    orderBy: { scenarioRevisionId: 'asc' },
  })
  if (scenarios.length !== capsules.length || scenarios.some(s => !s.decisions.some(d => d.decision === 'APPROVED')))
    throw conflict('Triage requires exact approved scenario lineage for every run.')
  const approvedPortfolioScenarios = await tx.qualityJourneyScenarioRevision.findMany({
    where: {
      portfolioRevisionId: { in: [...new Set(scenarios.map(s => s.portfolioRevisionId))] },
      decisions: { some: { decision: 'APPROVED' } },
    },
    orderBy: { scenarioRevisionId: 'asc' },
  })
  const analyses = scenarios.map(s => s.portfolioRevision.discoveryRevision.analysisRevision)
  const analysis = analyses[0]
  if (!analysis || analyses.some(a => a.id !== analysis.id))
    throw conflict('Triage analysis lineage differs between scenarios.')
  const content = JSON.parse(analysis.artifact.artifactJson)
  if (hash(content) !== analysis.artifact.contentHash) throw conflict('Accepted analysis content is corrupt.')
  const runs = cycle.testRuns
    .map(binding => {
      const receipt = cycle.evidenceReceipts.find(r => r.testRunId === binding.testRunId)
      const capsule = capsules.find(c => c.preparedCapsuleId === binding.preparedCapsuleId)
      if (!receipt || !capsule) throw conflict('Sealed evidence is incomplete.')
      const evidence = JSON.parse(receipt.evidenceJson)
      if (
        hash(evidence) !== receipt.receiptHash ||
        !matchesEvidenceCycle(evidence, scope, cycle) ||
        !matchesEvidenceRun(evidence, binding) ||
        hash(evidence.artifacts) !== receipt.runtimeBytesHash
      )
        throw conflict('Sealed evidence identity or content is corrupt.')
      return {
        testRunId: binding.testRunId,
        runId: binding.runId,
        scenarioRevisionId: capsule.scenarioRevisionId,
        evidenceReceiptId: receipt.id,
        receiptHash: receipt.receiptHash,
        evidence,
      }
    })
    .sort((a, b) => a.testRunId.localeCompare(b.testRunId))
  return {
    ...scope,
    cycleId: cycle.cycleId,
    analysis: {
      artifactId: analysis.artifact.artifactId,
      revisionId: analysis.artifact.revisionId!,
      contentHash: analysis.artifact.contentHash,
      content,
    },
    scenarios: approvedPortfolioScenarios.map(s => ({
      artifactId: s.stableScenarioId,
      revisionId: s.scenarioRevisionId,
      contentHash: s.contentHash,
      intent: JSON.parse(s.behavioralIntentJson),
    })),
    runs,
  }
}

export function triageInputArtifacts(input: TriageInput): AssignmentManifest['inputArtifacts'] {
  const refs: AssignmentManifest['inputArtifacts'][number][] = [
    {
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: input.analysis.artifactId,
      revisionId: input.analysis.revisionId,
      contentHash: input.analysis.contentHash,
    },
    ...input.scenarios.map(s => ({
      kind: 'SCENARIO_REVISION' as const,
      artifactId: s.artifactId,
      revisionId: s.revisionId,
      contentHash: s.contentHash,
    })),
    ...input.runs.flatMap(r => [
      {
        kind: 'TEST_RUN' as const,
        artifactId: r.testRunId,
        contentHash: hash({ testRunId: r.testRunId, runId: r.runId, evidenceReceiptId: r.evidenceReceiptId }),
      },
      { kind: 'EVIDENCE_RECEIPT' as const, artifactId: r.evidenceReceiptId, contentHash: r.receiptHash },
    ]),
  ]
  if (input.predecessorReport)
    refs.push(
      {
        kind: 'TEST_REPORT_ANALYSIS_REVISION',
        artifactId: input.predecessorReport.reportRevisionId,
        revisionId: input.predecessorReport.reportRevisionId,
        contentHash: input.predecessorReport.contentHash,
      },
      {
        kind: 'REPORT_REVISION_FEEDBACK',
        artifactId: input.predecessorReport.reportRevisionId,
        contentHash: hash(input.predecessorReport.feedback),
      },
    )
  return refs.sort((a, b) => canonicalContractJson(a).localeCompare(canonicalContractJson(b)))
}
