export type JourneyFocusInput = {
  stage: string
  openQuestion?: string
  analysis?: { revision: number; scope: string[]; acceptanceSignals: string[]; reviewHash?: string }
  scenarioCount: number
  scenarioReviewHash?: string
  requestedConsent?: {
    reason: string
    target: string
    preparedScenarioCount: number
    effects: string[]
    scopeHash: string
  }
  report?: { findingCount: number; unresolvedCount: number }
}

export type JourneyFocus = {
  kind: 'question' | 'proposed-checks' | 'review-changes' | 'activity' | 'run-permission' | 'result-evidence'
  title: string
  summary: string
  details: string[]
  destination: 'analysis' | 'scenarios' | 'automation' | 'execution' | 'triage' | 'current-work'
  action: string
}

function runPermissionFocus(consent: NonNullable<JourneyFocusInput['requestedConsent']>): JourneyFocus {
  return {
    kind: 'run-permission',
    title: 'Run permission',
    summary: consent.reason,
    details: [
      'Target ' + consent.target,
      consent.preparedScenarioCount + ' prepared scenarios',
      'Effects ' + consent.effects.join(', '),
      'Scope hash ' + consent.scopeHash,
    ],
    destination: 'execution',
    action: 'Review run permission',
  }
}

function questionFocus(question: string, revision?: number): JourneyFocus {
  return {
    kind: 'question',
    title: 'Question',
    summary: question,
    details: revision === undefined ? [] : ['Test approach revision ' + revision],
    destination: 'analysis',
    action: 'Answer in test approach',
  }
}

function approachFocus(analysis: NonNullable<JourneyFocusInput['analysis']>): JourneyFocus {
  return {
    kind: 'proposed-checks',
    title: 'Proposed checks',
    summary:
      analysis.acceptanceSignals.length + ' acceptance signals in test approach revision ' + analysis.revision + '.',
    details: [
      ...analysis.scope.map(item => 'In scope ' + item),
      ...(analysis.reviewHash ? ['Review hash ' + analysis.reviewHash] : []),
    ],
    destination: 'analysis',
    action: 'Review this version',
  }
}

function scenarioFocus(count: number, hash?: string): JourneyFocus {
  return {
    kind: 'review-changes',
    title: 'Review changes',
    summary: count + ' test scenarios are ready for review.',
    details: hash ? ['Review hash ' + hash] : [],
    destination: 'scenarios',
    action: 'Review scenarios',
  }
}

function reportFocus(report?: JourneyFocusInput['report']): JourneyFocus {
  return {
    kind: 'result-evidence',
    title: 'Result and evidence',
    summary: report
      ? report.findingCount + ' recorded findings, ' + report.unresolvedCount + ' unresolved.'
      : 'Review the recorded run results and available evidence.',
    details: [],
    destination: 'triage',
    action: 'Open results',
  }
}

function activityFocus(stage: string): JourneyFocus {
  const destination =
    stage === 'DISCOVERY' || stage === 'SCENARIO_DESIGN'
      ? 'scenarios'
      : stage === 'AUTOMATION'
        ? 'automation'
        : stage === 'EXECUTION'
          ? 'execution'
          : 'current-work'
  return {
    kind: 'activity',
    title: 'Activity',
    summary: 'Check the current Journey work and the next available action.',
    details: [],
    destination,
    action: 'View current work',
  }
}

export function selectJourneyFocus(input: JourneyFocusInput): JourneyFocus {
  if (input.requestedConsent) return runPermissionFocus(input.requestedConsent)
  if (input.openQuestion) return questionFocus(input.openQuestion, input.analysis?.revision)

  switch (input.stage) {
    case 'ANALYSIS_REVIEW':
      return input.analysis ? approachFocus(input.analysis) : activityFocus(input.stage)
    case 'SCENARIO_REVIEW':
      return scenarioFocus(input.scenarioCount, input.scenarioReviewHash)
    case 'TRIAGE':
    case 'REPORT_REVIEW':
    case 'CLOSED':
      return reportFocus(input.report)
    default:
      return activityFocus(input.stage)
  }
}
