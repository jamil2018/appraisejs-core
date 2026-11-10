// Deterministic fixture projection only; no stdin/transport/process launch at module evaluation.
export function analysisCharter(envelope) {
  if (envelope.followup) {
    const followup = envelope.followup
    const predecessor = followup.predecessor.data
    if (
      predecessor.analysisRevisionId !== followup.predecessorAnalysisRevisionId ||
      predecessor.requirementRevisionId !== envelope.requirement.artifactId ||
      followup.questions.some(q => q.question.data.required && !q.currentAnswer)
    )
      process.exit(92)
    const identity = followup.inputHash.replace(/^sha256:/, '').slice(0, 24)
    return {
      ...predecessor,
      charterId: `m06-followup-charter-${identity}`,
      analysisRevisionId: `m06-followup-revision-${identity}`,
      // Only current, assignment-authorized heads resolve the immediate predecessor.
      questions: followup.questions.filter(q => !q.currentAnswer).map(q => q.question.data),
      resolvedQuestionAnswerIds: followup.questions
        .filter(q => q.currentAnswer)
        .map(q => q.currentAnswer.reference.artifactId),
      assumptions: [...predecessor.assumptions, ...(followup.feedback ? [followup.feedback.data.feedback] : [])],
    }
  }
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'm06-analysis-charter',
    analysisRevisionId: 'm06-analysis-revision',
    journeyId: envelope.journeyId,
    targetProjectId: envelope.targetProjectId,
    cycleId: envelope.cycleId,
    requirementRevisionId: envelope.requirement.artifactId,
    objectives: [envelope.requirement.data.objective],
    scope: { included: ['Fixture analysis'], excluded: [] },
    actors: ['User'],
    requirements: [
      {
        requirementId: 'REQ-M06',
        statement: envelope.requirement.data.objective,
        sourceRefs: ['requirement:objective'],
      },
    ],
    obligations: [
      {
        obligationId: 'OBL-M06',
        requirementId: 'REQ-M06',
        statement: 'The clarified requirement has evidence.',
        acceptanceSignals: ['Recorded clarification'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Recorded clarification'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'm06-required-question',
        prompt: 'Which payment method is in scope?',
        required: true,
        rationale: 'Scope depends on this decision.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
}
