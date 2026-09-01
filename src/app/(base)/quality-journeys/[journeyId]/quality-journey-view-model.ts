type UnknownRecord = Record<string, unknown>

export type AnalysisQuestionView = {
  id: string
  questionId: string
  prompt: string
  rationale: string
  required: boolean
  answers: Array<{ answerId: string; answer: string; contentHash: string; createdAt: Date }>
}

export type AnalysisRevisionView = {
  id: string
  artifactId: string
  analysisRevisionId: string
  revision: number
  contentHash: string
  objectives: string[]
  scope: { included: string[]; excluded: string[] }
  requirements: Array<{ requirementId: string; statement: string; sourceRefs: string[] }>
  obligations: Array<{ obligationId: string; requirementId: string; statement: string; acceptanceSignals: string[] }>
  constraints: string[]
  assumptions: string[]
  risks: string[]
  acceptanceSignals: string[]
  questions: AnalysisQuestionView[]
  publication: { reviewHash: string; publishedAt: Date } | null
  decision: { decision: string; reviewHash: string; createdAt: Date } | null
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function charterPayload(value: string): UnknownRecord {
  try {
    return record(JSON.parse(value))
  } catch {
    return {}
  }
}

/** Maps persisted payload JSON into a deliberately narrow presentation model.
 * The route never renders arbitrary artifact JSON or appraises it as authority. */
export function toAnalysisRevisionView(revision: {
  id: string
  artifactId: string
  artifactRevisionId: string
  revision: number
  contentHash: string
  artifact: { artifactJson: string }
  questions: Array<{
    id: string
    questionId: string
    required: boolean
    artifact: { artifactJson: string }
    answers: Array<{ answerId: string; contentHash: string; createdAt: Date; artifact: { artifactJson: string } }>
  }>
  publication: { reviewHash: string; publishedAt: Date } | null
  decision: { decision: string; reviewHash: string; createdAt: Date } | null
}): AnalysisRevisionView {
  const charter = charterPayload(revision.artifact.artifactJson)
  const scope = record(charter.scope)
  return {
    id: revision.id,
    artifactId: revision.artifactId,
    analysisRevisionId: revision.artifactRevisionId,
    revision: revision.revision,
    contentHash: revision.contentHash,
    objectives: strings(charter.objectives),
    scope: { included: strings(scope.included), excluded: strings(scope.excluded) },
    requirements: rows(charter.requirements).map(requirement => ({
      requirementId: text(requirement.requirementId, 'Unknown requirement'),
      statement: text(requirement.statement, 'Requirement payload unavailable.'),
      sourceRefs: strings(requirement.sourceRefs),
    })),
    obligations: rows(charter.obligations).map(obligation => ({
      obligationId: text(obligation.obligationId, 'Unknown obligation'),
      requirementId: text(obligation.requirementId, 'Unknown requirement'),
      statement: text(obligation.statement, 'Obligation payload unavailable.'),
      acceptanceSignals: strings(obligation.acceptanceSignals),
    })),
    constraints: strings(charter.constraints),
    assumptions: strings(charter.assumptions),
    risks: strings(charter.risks),
    acceptanceSignals: strings(charter.acceptanceSignals),
    questions: revision.questions.map(question => {
      const payload = charterPayload(question.artifact.artifactJson)
      return {
        id: question.id,
        questionId: question.questionId,
        required: question.required,
        prompt: text(payload.prompt, 'Question payload unavailable.'),
        rationale: text(payload.rationale),
        answers: question.answers.map(answer => {
          const payload = charterPayload(answer.artifact.artifactJson)
          return {
            answerId: answer.answerId,
            answer: text(payload.answer, 'Answer payload unavailable.'),
            contentHash: answer.contentHash,
            createdAt: answer.createdAt,
          }
        }),
      }
    }),
    publication: revision.publication,
    decision: revision.decision,
  }
}

export function qualityJourneyLabel(value: string) {
  return value.replaceAll('_', ' ').toLocaleLowerCase()
}
