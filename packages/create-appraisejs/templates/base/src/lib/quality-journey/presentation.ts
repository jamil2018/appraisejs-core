/**
 * Read-only language and hierarchy for the Quality Journey experience. This
 * projection deliberately describes canonical state; it never authorizes a
 * lifecycle transition or changes the underlying records.
 */
export const qualityJourneyVocabulary = {
  requirement: 'Your brief',
  validationProfile: 'Checks',
  coverageRigor: 'How thoroughly should we test?',
  testDimensions: 'Types of checks',
  evidenceSignals: 'How will we know it works?',
  analysis: 'Proposed test approach',
  scenarios: 'Test scenarios',
  automation: 'Test preparation',
  pendingDecisions: 'Needs your review',
  blockers: 'What needs attention',
  artifacts: 'Files and evidence',
  exactApproval: 'Approve this version',
  technicalDetails: 'Technical details',
} as const

export type QualityJourneyDisplayStage = {
  id: 'brief' | 'approach' | 'scenarios' | 'preparation' | 'run-tests' | 'results'
  label: string
  destination: string
  description: string
}

export const qualityJourneyDisplayStages: readonly QualityJourneyDisplayStage[] = [
  { id: 'brief', label: 'Your brief', destination: 'overview', description: 'The requirement and intended outcome.' },
  {
    id: 'approach',
    label: 'Test approach',
    destination: 'analysis',
    description: 'The proposed approach and questions that shape it.',
  },
  {
    id: 'scenarios',
    label: 'Test scenarios',
    destination: 'scenarios',
    description: 'The scenarios selected to check the target.',
  },
  {
    id: 'preparation',
    label: 'Test preparation',
    destination: 'automation',
    description: 'What is ready to run and what needs attention.',
  },
  { id: 'run-tests', label: 'Run tests', destination: 'execution', description: 'Permission, progress, and reruns.' },
  { id: 'results', label: 'Results', destination: 'triage', description: 'Findings, evidence, and closure.' },
]

const stageByCanonicalStage: Record<string, QualityJourneyDisplayStage['id']> = {
  INTAKE: 'brief',
  ANALYSIS: 'approach',
  ANALYSIS_REVIEW: 'approach',
  DISCOVERY: 'scenarios',
  SCENARIO_DESIGN: 'scenarios',
  SCENARIO_REVIEW: 'scenarios',
  AUTOMATION: 'preparation',
  EXECUTION: 'run-tests',
  TRIAGE: 'results',
  REPORT_REVIEW: 'results',
  CLOSED: 'results',
}

export function displayStageForQualityJourney(stage: string): QualityJourneyDisplayStage {
  const id = stageByCanonicalStage[stage] ?? 'brief'
  return qualityJourneyDisplayStages.find(item => item.id === id) ?? qualityJourneyDisplayStages[0]
}

export function qualityJourneyLabel(value: string) {
  return value.replaceAll('_', ' ').toLocaleLowerCase()
}

export function qualityJourneyRequirementSummary(contentJson: string) {
  try {
    const parsed: unknown = JSON.parse(contentJson)
    const objective =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).objective
        : undefined
    return typeof objective === 'string' && objective.trim() ? objective : 'Requirement snapshot unavailable'
  } catch {
    return 'Requirement snapshot unavailable'
  }
}

export type CodexHandoffGuidance = {
  label: 'Ready to start' | 'Opening Codex' | 'Waiting for connection' | 'Connected' | 'Needs recovery'
  description: string
}

const codexHandoffGuidanceByStatus: Record<string, CodexHandoffGuidance> = {
  NOT_PREPARED: {
    label: 'Ready to start',
    description: 'Open Codex, then paste and send the prepared prompt to begin analysis.',
  },
  PREPARED: {
    label: 'Ready to start',
    description: 'The prompt is ready. Open Codex, then paste and send it to begin analysis.',
  },
  LAUNCHING: {
    label: 'Opening Codex',
    description: 'Appraise is opening Codex. Analysis has not started until the prepared prompt is sent.',
  },
  LAUNCHED: {
    label: 'Waiting for connection',
    description: 'Codex was opened. Paste and send the prepared prompt; Appraise is waiting for the connection.',
  },
  CONNECTED: {
    label: 'Connected',
    description: 'Codex is connected. Appraise reports worker progress only after it observes submitted work.',
  },
  FAILED: {
    label: 'Needs recovery',
    description: 'Open Codex manually, then copy, paste, and send the prepared prompt.',
  },
  EXPIRED: {
    label: 'Needs recovery',
    description: 'Prepare a fresh prompt, then open Codex manually and send it.',
  },
}

export function codexHandoffGuidance(status: string): CodexHandoffGuidance {
  return codexHandoffGuidanceByStatus[status] ?? codexHandoffGuidanceByStatus.NOT_PREPARED
}

export type QualityJourneyNextAction = {
  title: string
  description: string
  actionLabel: string
  destination: string
  alsoNeedsAttention: string[]
}

type QualityJourneyNextActionInput = {
  stage: string
  blockerCount: number
  unresolvedRequiredQuestionCount: number
  pendingAnalysisDecision?: boolean
  pendingScenarioDecision?: boolean
  pendingReportDecision?: boolean
  requestedExecutionConsentCount?: number
  hasObservedWorkerProgress?: boolean
  handoffStatus?: string
}

type AttentionItem = { kind: 'blockers' | 'questions' | 'permissions'; summary: string }

function pluralSuffix(count: number) {
  return count === 1 ? '' : 's'
}

function attentionItems(input: QualityJourneyNextActionInput): AttentionItem[] {
  return [
    input.blockerCount
      ? { kind: 'blockers', summary: `${input.blockerCount} item${pluralSuffix(input.blockerCount)} needs attention` }
      : null,
    input.unresolvedRequiredQuestionCount
      ? {
          kind: 'questions',
          summary: `${input.unresolvedRequiredQuestionCount} required question${pluralSuffix(input.unresolvedRequiredQuestionCount)} is open`,
        }
      : null,
    input.requestedExecutionConsentCount
      ? {
          kind: 'permissions',
          summary: `${input.requestedExecutionConsentCount} permission request${pluralSuffix(input.requestedExecutionConsentCount)} awaits a decision`,
        }
      : null,
  ].filter((item): item is AttentionItem => item !== null)
}

function summaries(attention: AttentionItem[], omit?: AttentionItem['kind']) {
  return attention.filter(item => item.kind !== omit).map(item => item.summary)
}

function closedAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (input.stage !== 'CLOSED') return null
  return {
    title: 'This journey is closed',
    description: 'Review the outcome, evidence, and any accepted risks before starting follow-up work.',
    actionLabel: 'View results',
    destination: 'triage',
    alsoNeedsAttention: summaries(attention),
  }
}

function blockerAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.blockerCount) return null
  return {
    title: qualityJourneyVocabulary.blockers,
    description: 'Resolve the listed issue before Appraise can safely continue.',
    actionLabel: 'Review what needs attention',
    destination: 'activity',
    alsoNeedsAttention: summaries(attention, 'blockers'),
  }
}

function requiredQuestionAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.unresolvedRequiredQuestionCount) return null
  return {
    title: 'Answer required questions',
    description: 'These answers are needed before the proposed test approach can be approved.',
    actionLabel: 'Answer questions',
    destination: 'analysis',
    alsoNeedsAttention: summaries(attention, 'questions'),
  }
}

function analysisDecisionAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.pendingAnalysisDecision) return null
  return {
    title: 'Review the proposed test approach',
    description: 'Approve this exact version or request changes to create a new version.',
    actionLabel: 'Review test approach',
    destination: 'analysis',
    alsoNeedsAttention: summaries(attention),
  }
}

function scenarioDecisionAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.pendingScenarioDecision) return null
  return {
    title: 'Review test scenarios',
    description: 'Select or reject each proposed scenario before preparation can begin.',
    actionLabel: 'Review scenarios',
    destination: 'scenarios',
    alsoNeedsAttention: summaries(attention),
  }
}

function reportDecisionAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.pendingReportDecision) return null
  return {
    title: 'Review results',
    description: 'Record the decision for this exact report version.',
    actionLabel: 'Review results',
    destination: 'triage',
    alsoNeedsAttention: summaries(attention),
  }
}

function executionPermissionAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction | null {
  if (!input.requestedExecutionConsentCount) return null
  return {
    title: 'Permission is needed to run tests',
    description: 'Review the requested scope and its data-changing consequences before granting consent.',
    actionLabel: 'Review permission',
    destination: 'execution',
    alsoNeedsAttention: summaries(attention, 'permissions'),
  }
}

function observedProgressAction(
  input: QualityJourneyNextActionInput,
  attention: AttentionItem[],
): QualityJourneyNextAction {
  const displayStage = displayStageForQualityJourney(input.stage)
  if (input.stage === 'ANALYSIS' && !input.hasObservedWorkerProgress) {
    const guidance = codexHandoffGuidance(input.handoffStatus ?? 'NOT_PREPARED')
    return {
      title: guidance.label,
      description: guidance.description,
      actionLabel: 'Start test approach',
      destination: 'analysis',
      alsoNeedsAttention: summaries(attention),
    }
  }
  return {
    title: `${displayStage.label} is in progress`,
    description: displayStage.description,
    actionLabel: `View ${displayStage.label.toLocaleLowerCase()}`,
    destination: displayStage.destination,
    alsoNeedsAttention: summaries(attention),
  }
}

/** Applies the agreed action priority without encoding any permission logic. */
export function nextActionForQualityJourney(input: QualityJourneyNextActionInput): QualityJourneyNextAction {
  const attention = attentionItems(input)
  return (
    closedAction(input, attention) ??
    blockerAction(input, attention) ??
    requiredQuestionAction(input, attention) ??
    analysisDecisionAction(input, attention) ??
    scenarioDecisionAction(input, attention) ??
    reportDecisionAction(input, attention) ??
    executionPermissionAction(input, attention) ??
    observedProgressAction(input, attention)
  )
}
