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

export type QualityJourneyNextActionInput = {
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

type ObservationTimestamp = string | Date

export type QualityJourneyStatusProjectionInput = QualityJourneyNextActionInput & {
  blockerResponsibleActor?: string
  observedAt?: ObservationTimestamp | null
  observedWorkAt?: ObservationTimestamp | null
  handoffLaunchedAt?: ObservationTimestamp | null
  handoffConnectedAt?: ObservationTimestamp | null
  handoffFailedAt?: ObservationTimestamp | null
}

export type QualityJourneyStatusProjection = {
  summary: string
  nextActor: string
  action: {
    label: string
    destination: string
  }
  lastObserved: {
    summary: string
    evidenceAt?: string
    checkedAt?: string
  }
  alsoNeedsAttention: string[]
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

type StatusCandidate = {
  summary: string
  nextActor: string
  secondarySummary: string
}

function observationTimestamp(value: ObservationTimestamp | null | undefined) {
  return value instanceof Date ? value.toISOString() : (value ?? undefined)
}

const handoffCandidates: Record<string, StatusCandidate> = {
  PREPARED: {
    summary: 'The Codex prompt is ready to send. Analysis has not started.',
    nextActor: 'You',
    secondarySummary: 'Send the prepared Codex prompt',
  },
  LAUNCHING: {
    summary: 'Appraise is opening Codex. Analysis has not started.',
    nextActor: 'Appraise',
    secondarySummary: 'Codex launch is still being recorded',
  },
  LAUNCHED: {
    summary: 'Codex was opened, but Appraise has not observed a connection or submitted analysis work.',
    nextActor: 'You',
    secondarySummary: 'Codex connection has not been observed',
  },
  CONNECTED: {
    summary: 'Codex is connected, but Appraise has not received submitted analysis work.',
    nextActor: 'Coding agent',
    secondarySummary: 'Submitted analysis work has not been observed',
  },
  FAILED: {
    summary: 'The Codex handoff failed. Open Codex manually, then copy, paste, and send the prepared prompt.',
    nextActor: 'You',
    secondarySummary: 'Codex handoff needs recovery',
  },
  EXPIRED: {
    summary: 'The Codex handoff expired. Prepare a fresh prompt before reconnecting Codex.',
    nextActor: 'You',
    secondarySummary: 'Codex handoff needs recovery',
  },
  NOT_PREPARED: {
    summary: 'Analysis has not started. Prepare a Codex prompt to begin.',
    nextActor: 'You',
    secondarySummary: 'A Codex prompt has not been prepared',
  },
}

const noRecordedHandoffCandidate: StatusCandidate = {
  summary: 'Analysis has not started. Appraise has no recorded Codex handoff or connection.',
  nextActor: 'You',
  secondarySummary: 'Codex connection has not been observed',
}

const unknownHandoffCandidate: StatusCandidate = {
  summary: 'The Codex connection status is unknown. Analysis has not started.',
  nextActor: 'You',
  secondarySummary: 'Codex connection status is unknown',
}

function candidateForHandoffStatus(status: string | undefined) {
  if (status === undefined) return noRecordedHandoffCandidate
  return handoffCandidates[status] ?? unknownHandoffCandidate
}

function isRecoveryHandoff(status: string | undefined) {
  return status === 'FAILED' || status === 'EXPIRED'
}

function handoffCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate | null {
  if (input.hasObservedWorkerProgress) return null
  if (input.stage !== 'ANALYSIS' && !isRecoveryHandoff(input.handoffStatus)) return null
  return candidateForHandoffStatus(input.handoffStatus)
}

function closedCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate | null {
  return input.stage === 'CLOSED'
    ? { summary: 'This journey is closed.', nextActor: 'No one', secondarySummary: 'This journey is closed' }
    : null
}

function blockerCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate | null {
  if (!input.blockerCount) return null
  return {
    summary: `${input.blockerCount} item${pluralSuffix(input.blockerCount)} needs attention before Appraise can safely continue.`,
    nextActor: input.blockerResponsibleActor ?? 'The responsible owner',
    secondarySummary: `${input.blockerCount} item${pluralSuffix(input.blockerCount)} needs attention`,
  }
}

function questionCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate | null {
  if (!input.unresolvedRequiredQuestionCount) return null
  return {
    summary: `${input.unresolvedRequiredQuestionCount} required question${pluralSuffix(input.unresolvedRequiredQuestionCount)} must be answered.`,
    nextActor: 'You',
    secondarySummary: `${input.unresolvedRequiredQuestionCount} required question${pluralSuffix(input.unresolvedRequiredQuestionCount)} is open`,
  }
}

function decisionCandidate(
  active: boolean | undefined,
  summary: string,
  secondarySummary: string,
): StatusCandidate | null {
  return active ? { summary, nextActor: 'You', secondarySummary } : null
}

function permissionCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate | null {
  if (!input.requestedExecutionConsentCount) return null
  return {
    summary: `${input.requestedExecutionConsentCount} permission request${pluralSuffix(input.requestedExecutionConsentCount)} awaits your decision.`,
    nextActor: 'You',
    secondarySummary: `${input.requestedExecutionConsentCount} permission request${pluralSuffix(input.requestedExecutionConsentCount)} awaits a decision`,
  }
}

function isStatusCandidate(candidate: StatusCandidate | null): candidate is StatusCandidate {
  return candidate !== null
}

function inProgressCandidate(input: QualityJourneyStatusProjectionInput): StatusCandidate {
  const displayStage = displayStageForQualityJourney(input.stage)
  return {
    summary: input.hasObservedWorkerProgress
      ? 'Appraise has observed submitted work for the current test approach.'
      : `${displayStage.label} is in progress.`,
    nextActor: 'Appraise',
    secondarySummary: `${displayStage.label} is in progress`,
  }
}

function statusCandidates(input: QualityJourneyStatusProjectionInput): StatusCandidate[] {
  const attention = [
    closedCandidate(input),
    blockerCandidate(input),
    questionCandidate(input),
    decisionCandidate(
      input.pendingAnalysisDecision,
      'The proposed test approach is ready for your exact-version review.',
      'The proposed test approach needs review',
    ),
    decisionCandidate(
      input.pendingScenarioDecision,
      'Test scenarios are ready for your review.',
      'Test scenarios need review',
    ),
    decisionCandidate(
      input.pendingReportDecision,
      'Results are ready for your exact-version review.',
      'Results need review',
    ),
    permissionCandidate(input),
    handoffCandidate(input),
  ].filter(isStatusCandidate)
  return attention.length ? attention : [inProgressCandidate(input)]
}

function lastObservation(input: QualityJourneyStatusProjectionInput): QualityJourneyStatusProjection['lastObserved'] {
  const checkedAt = observationTimestamp(input.observedAt)
  if (input.hasObservedWorkerProgress) {
    return {
      summary: 'Appraise has observed submitted analysis work.',
      evidenceAt: observationTimestamp(input.observedWorkAt),
      checkedAt,
    }
  }

  const evidenceByHandoffStatus: Record<string, { summary: string; at?: ObservationTimestamp | null }> = {
    PREPARED: { summary: 'A Codex prompt was prepared; no connection has been observed.' },
    LAUNCHING: {
      summary: 'A Codex launch request was recorded; no connection has been observed.',
      at: input.handoffLaunchedAt,
    },
    LAUNCHED: {
      summary: 'Codex was opened; no connection or submitted analysis work has been observed.',
      at: input.handoffLaunchedAt,
    },
    CONNECTED: {
      summary: 'A Codex connection was observed; submitted analysis work has not been observed.',
      at: input.handoffConnectedAt,
    },
    FAILED: { summary: 'A failed Codex handoff was recorded.', at: input.handoffFailedAt },
    EXPIRED: { summary: 'An expired Codex handoff was recorded.', at: input.handoffFailedAt },
    NOT_PREPARED: { summary: 'No Codex handoff or connection has been observed.' },
  }
  const evidence = input.handoffStatus ? evidenceByHandoffStatus[input.handoffStatus] : undefined
  return {
    summary:
      evidence?.summary ??
      (input.handoffStatus === undefined
        ? 'No Codex handoff or connection has been observed.'
        : 'Codex connection status is unknown; no connection has been observed.'),
    evidenceAt: observationTimestamp(evidence?.at),
    checkedAt,
  }
}

/**
 * A compact, read-only status story for Journey surfaces. It is deliberately
 * based only on already-observed evidence and does not authorize lifecycle
 * work, handoffs, approvals, or connections.
 */
export function qualityJourneyStatusProjection(
  input: QualityJourneyStatusProjectionInput,
): QualityJourneyStatusProjection {
  const [primary, ...secondary] = statusCandidates(input)
  const nextAction = nextActionForQualityJourney(input)
  return {
    summary: primary.summary,
    nextActor: primary.nextActor,
    action: { label: nextAction.actionLabel, destination: nextAction.destination },
    lastObserved: lastObservation(input),
    alsoNeedsAttention: [
      ...nextAction.alsoNeedsAttention,
      ...secondary.map(candidate => candidate.secondarySummary),
    ].filter((summary, index, values) => values.indexOf(summary) === index),
  }
}
