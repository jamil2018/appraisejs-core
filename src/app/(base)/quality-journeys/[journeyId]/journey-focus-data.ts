import type { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import type { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import type { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import type { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import type { getQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'

import { selectJourneyFocus } from './journey-focus-projection'
import type { AnalysisReviewContent } from './proposed-checks-event'
import { toAnalysisRevisionView } from './quality-journey-view-model'

type Criterion = ReturnType<typeof toAnalysisRevisionView>['obligations'][number]
type CriterionChanges = Extract<AnalysisReviewContent, { kind: 'review-changes' }>['changes']

export function analysisCriterionChanges(
  previous: readonly Criterion[],
  current: readonly Criterion[],
): CriterionChanges {
  const old = new Map(previous.map(criterion => [criterion.obligationId, criterion]))
  const changes: CriterionChanges = []
  for (const criterion of current) {
    const prior = old.get(criterion.obligationId)
    old.delete(criterion.obligationId)
    if (
      !prior ||
      prior.requirementId !== criterion.requirementId ||
      prior.statement !== criterion.statement ||
      JSON.stringify(prior.acceptanceSignals) !== JSON.stringify(criterion.acceptanceSignals)
    ) {
      changes.push({
        id: criterion.obligationId,
        kind: prior ? 'changed' : 'added',
        statement: criterion.statement,
        signals: criterion.acceptanceSignals,
      })
    }
  }
  for (const criterion of old.values())
    changes.push({
      id: criterion.obligationId,
      kind: 'removed',
      statement: criterion.statement,
      signals: criterion.acceptanceSignals,
    })
  return changes
}

export function currentJourneyAnalysis(
  journey: Awaited<ReturnType<typeof getQualityJourney>>,
  analysis: Awaited<ReturnType<typeof getQualityJourneyAnalysis>>,
) {
  const activeAnalysisId = journey.journey.activeRevisionIds.analysis
  const activeRevision = analysis.revisions.find(item => item.artifactRevisionId === activeAnalysisId)
  const successorDraft = analysis.revisions.findLast(item => !item.publication)
  const revision =
    journey.journey.stage === 'ANALYSIS'
      ? (successorDraft ?? activeRevision)
      : (activeRevision ?? analysis.revisions.at(-1))
  return { revision, view: revision ? toAnalysisRevisionView(revision) : null }
}

export function currentJourneyFocus(detail: {
  journey: Awaited<ReturnType<typeof getQualityJourney>>
  activeAnalysis: ReturnType<typeof toAnalysisRevisionView> | null
  execution: Awaited<ReturnType<typeof getQualityJourneyExecution>>
  triage: Awaited<ReturnType<typeof getQualityJourneyTriage>>
  scenarios: Awaited<ReturnType<typeof getQualityJourneyScenarioPortfolio>> | null
}) {
  const { journey, activeAnalysis, execution, triage, scenarios } = detail
  const openQuestion = activeAnalysis?.questions.find(question => question.required && !question.answers.length)?.prompt
  const consent = execution.consents.find(item => item.status === 'REQUESTED')
  const report = triage.reports.find(item => item.id === triage.activeReportRevisionId) ?? triage.reports.at(-1)
  return selectJourneyFocus({
    stage: journey.journey.stage,
    openQuestion,
    analysis: activeAnalysis
      ? {
          revision: activeAnalysis.revision,
          scope: activeAnalysis.scope.included,
          acceptanceSignals: activeAnalysis.acceptanceSignals,
          reviewHash: journey.journey.analysisReviewHash,
        }
      : undefined,
    scenarioCount: scenarios?.portfolio?.scenarios.length ?? 0,
    scenarioReviewHash: scenarios?.portfolio?.reviewHash ?? undefined,
    requestedConsent: consent
      ? {
          reason: consent.reason ?? 'Review the requested test run.',
          target: typeof consent.scope.checkpoint === 'string' ? consent.scope.checkpoint : 'Current target',
          preparedScenarioCount: Array.isArray(consent.scope.preparedRuntimeCapsuleIds)
            ? consent.scope.preparedRuntimeCapsuleIds.length
            : 0,
          effects: Array.isArray(consent.scope.actions)
            ? consent.scope.actions.filter((item: unknown): item is string => typeof item === 'string')
            : [],
          scopeHash: consent.scopeHash,
        }
      : undefined,
    report: report
      ? {
          findingCount: report.report.findings.length,
          unresolvedCount: report.report.findings.filter(finding => finding.unresolved).length,
        }
      : undefined,
  })
}
