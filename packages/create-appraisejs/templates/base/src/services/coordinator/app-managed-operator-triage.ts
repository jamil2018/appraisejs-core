import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { parseCucumberReportText } from '@/lib/test-run/report-parser'
import { assertOperatorAutomationLocatorAuthority } from './app-managed-automation-operator-authority'
import { ServiceError } from '@/services/shared/errors'
import type { QualityJourneyTriageReport } from '@/lib/quality-journey'
import type { TriageInput } from './quality-journey-triage-input'
import type { readAppManagedTriageEvidence } from './app-managed-triage-evidence'

/** A completed operator replacement authorizes evidence review, never another native dispatch. */
export async function hasOperatorPreparation(
  scope: { journeyId: string; targetProjectId: string; cycleId: string },
  tx: Prisma.TransactionClient,
) {
  const prepared = await tx.qualityJourneyAutomationMaterialization.findMany({
    where: { ...scope, status: 'MATERIALIZED', attempt: { status: 'COMPLETED', replacesAttemptId: { not: null } } },
    select: { workItemId: true, attemptId: true },
  })
  for (const material of prepared) {
    try {
      await assertOperatorAutomationLocatorAuthority({ ...scope, ...material }, tx)
      return true
    } catch (error) {
      if (!(error instanceof ServiceError && error.code === 'CONFLICT')) throw error
    }
  }
  return false
}

const note = z.string().trim().min(1).max(2000)
export const operatorFindingSchema = z
  .object({
    testRunId: z.string().min(1),
    kind: z.enum([
      'TARGET_DEFECT',
      'INCONCLUSIVE',
      'VALIDATION_REALIZATION_DEFECT',
      'APPRAISE_RUNTIME_DEFECT',
      'ENVIRONMENT_OR_DATA_DEFECT',
    ]),
    observation: note,
    expectation: note,
    nextAction: note,
  })
  .strict()
export type OperatorFinding = z.infer<typeof operatorFindingSchema>

function sealedSteps(text?: string) {
  if (!text) return []
  try {
    return parseCucumberReportText(text).features.flatMap(f =>
      f.scenarios.flatMap(s =>
        s.steps.map(step => ({
          name: step.name.slice(0, 500),
          status: step.status,
          error: step.errorMessage?.slice(0, 1000),
        })),
      ),
    )
  } catch {
    // A malformed report cannot support a target defect attribution.
    return []
  }
}

export function reviewSealedRuns(
  input: TriageInput,
  artifacts: Awaited<ReturnType<typeof readAppManagedTriageEvidence>>,
) {
  return input.runs.map(run => {
    const source = artifacts.find(a => a.receiptId === run.evidenceReceiptId && a.artifactKind === 'report')
    const scenario = input.scenarios.find(s => s.revisionId === run.scenarioRevisionId)!
    const complete =
      run.evidence.evidenceHealth === 'valid' &&
      Array.isArray(run.evidence.missingArtifacts) &&
      !run.evidence.missingArtifacts.length
    const steps = sealedSteps(source?.text)
    return {
      testRunId: run.testRunId,
      evidenceReceiptId: run.evidenceReceiptId,
      scenarioRevisionId: run.scenarioRevisionId,
      title: String(scenario.intent.title ?? run.scenarioRevisionId),
      requirementIds: scenario.intent.requirementIds ?? [],
      passed: complete && run.evidence.result === 'PASSED' && run.evidence.status === 'COMPLETED',
      canAttributeTargetFailure:
        complete && run.evidence.result === 'FAILED' && steps.some(s => s.status.toLowerCase() === 'failed'),
      steps,
    }
  })
}

export function composeOperatorReport(
  input: TriageInput,
  runs: ReturnType<typeof reviewSealedRuns>,
  notes: OperatorFinding[],
) {
  const material = runs.filter(r => !r.passed)
  if (notes.length !== material.length || new Set(notes.map(n => n.testRunId)).size !== notes.length)
    throw new ServiceError('Review each material run outcome once.', 'VALIDATION')
  const findings: QualityJourneyTriageReport['findings'] = material.map(run => {
    const note = notes.find(n => n.testRunId === run.testRunId)
    if (!note || (note.kind === 'TARGET_DEFECT' && !run.canAttributeTargetFailure))
      throw new ServiceError('This attribution requires a matching sealed failed test.', 'VALIDATION')
    const failed = run.steps.find(s => s.status.toLowerCase() === 'failed')
    return {
      findingId: 'finding_' + hashCanonical([run.testRunId, run.evidenceReceiptId]).slice(7, 31),
      testRunId: run.testRunId,
      evidenceReceiptId: run.evidenceReceiptId,
      scenarioRevisionId: run.scenarioRevisionId,
      requirementIds: run.requirementIds,
      kind: note.kind,
      targetOutcome: note.kind === 'TARGET_DEFECT' ? 'FAILED' : 'NOT_EVALUATED',
      confidence: note.kind === 'INCONCLUSIVE' ? 'LOW' : 'HIGH',
      rationale: note.observation,
      competingHypotheses: [],
      unresolved: note.kind === 'INCONCLUSIVE',
      postmortem: {
        observation: note.observation,
        expectedBehavior: note.expectation,
        causalAnalysis: failed ? 'Failed test step: ' + failed.name : 'See the sealed run evidence.',
        nextAction: note.nextAction,
      },
    }
  })
  const coverage: QualityJourneyTriageReport['coverage'] = input.analysis.content.requirements.map(req => {
    const scenarioRevisionIds = input.scenarios
      .filter(s => s.intent.requirementIds?.includes(req.requirementId))
      .map(s => s.revisionId)
    const relevant = runs.filter(r => scenarioRevisionIds.includes(r.scenarioRevisionId))
    const matching = findings.filter(f => f.requirementIds.includes(req.requirementId))
    const allPassed =
      !!relevant.length &&
      relevant.every(r => r.passed) &&
      scenarioRevisionIds.every(s => relevant.some(r => r.scenarioRevisionId === s))
    return {
      requirementId: req.requirementId,
      scenarioRevisionIds,
      testRunIds: relevant.map(r => r.testRunId),
      outcome: matching.some(f => f.unresolved)
        ? 'UNRESOLVED'
        : matching.some(f => f.targetOutcome === 'FAILED')
          ? 'FAILED'
          : allPassed
            ? 'PASSED'
            : 'NOT_EVALUATED',
      rationale:
        matching
          .map(f => f.rationale)
          .join(' ')
          .slice(0, 8000) ||
        (allPassed ? 'All assigned scenarios passed with sealed evidence.' : 'Coverage was not established.'),
    }
  })
  return {
    summary: findings.length
      ? findings
          .map(f => f.rationale)
          .join(' ')
          .slice(0, 8000)
      : 'All assigned test runs passed with sealed evidence.',
    findings,
    coverage,
    residualRisks: [],
    recommendations: findings.length
      ? Array.from(new Set(findings.map(f => f.postmortem.nextAction))).slice(0, 128)
      : ['Retain the sealed evidence for this run.'],
  }
}
