export type PlanRequirementKind = 'functional' | 'data' | 'quality' | 'validation' | 'constraint'

export type PlanRequirement = {
  id: string
  text: string
  kind: PlanRequirementKind
  terms: string[]
}

export type DomainCandidate = {
  domain: string
  confidence: number
  evidence: string[]
}

export type PlanRequirementAssessment = {
  domainCandidates: DomainCandidate[]
  selectedDomain?: string
  requirements: Array<
    PlanRequirement & {
      coveredBy: Array<{ taskId: string; surface: 'description' | 'acceptanceCriteria' | 'validationIntent' }>
    }
  >
  uncoveredRequirementIds: string[]
  warnings: Array<{ code: string; message: string }>
}

type TaskSurface = {
  id: string
  description: string
  acceptanceCriteria: string[]
  validationIntent: string
}

type RequirementDefinition = {
  id: string
  text: string
  kind: PlanRequirementKind
  pattern: RegExp
  coveragePatterns: RegExp[]
  domains?: string[]
}

const requirementDefinitions: RequirementDefinition[] = [
  {
    id: 'reminder-title',
    text: 'Reminder title',
    kind: 'data',
    pattern: /\btitle\b/i,
    coveragePatterns: [/\btitle\b/i],
    domains: ['reminder'],
  },
  {
    id: 'reminder-notes',
    text: 'Optional reminder notes',
    kind: 'data',
    pattern: /\bnotes?\b/i,
    coveragePatterns: [/\bnotes?\b/i],
    domains: ['reminder'],
  },
  {
    id: 'reminder-due-date-time',
    text: 'Reminder due date and time',
    kind: 'data',
    pattern: /\bdue\s*(?:date|time)|date\s*(?:and|&)\s*time\b/i,
    coveragePatterns: [/\bdue\b/i, /\b(?:date|time)\b/i],
    domains: ['reminder'],
  },
  {
    id: 'create',
    text: 'Create records',
    kind: 'functional',
    pattern: /\b(?:crud|create|add)\b/i,
    coveragePatterns: [/\b(?:create|add)\b/i],
  },
  {
    id: 'edit',
    text: 'Edit records',
    kind: 'functional',
    pattern: /\b(?:crud|edit|update)\b/i,
    coveragePatterns: [/\b(?:edit|update)\b/i],
  },
  {
    id: 'delete',
    text: 'Delete records',
    kind: 'functional',
    pattern: /\b(?:crud|delete|remove)\b/i,
    coveragePatterns: [/\b(?:delete|remove)\b/i],
  },
  {
    id: 'completion',
    text: 'Complete and reactivate records',
    kind: 'functional',
    pattern: /\b(?:complete|completed|completion|reactivat|toggle)\b/i,
    coveragePatterns: [/\b(?:complete|completed|completion|reactivat|toggle)/i],
  },
  {
    id: 'filtering',
    text: 'Active and completed filtering',
    kind: 'functional',
    pattern: /\b(?:filter|active|completed)\b/i,
    coveragePatterns: [/\bfilter/i, /\b(?:active|completed)\b/i],
  },
  {
    id: 'persistence',
    text: 'Persistent storage',
    kind: 'functional',
    pattern: /\b(?:persist|storage|localstorage|database|saved?)\b/i,
    coveragePatterns: [/\b(?:persist|storage|saved?|restore|reload|database|localstorage)/i],
  },
  {
    id: 'accessibility',
    text: 'Accessible interaction and screen-reader support',
    kind: 'quality',
    pattern: /\b(?:accessible|accessibility|screen[ -]?reader|focus management|a11y)\b/i,
    coveragePatterns: [/\b(?:accessib|screen[ -]?reader|focus management|a11y)/i],
  },
  {
    id: 'responsive',
    text: 'Responsive layout',
    kind: 'quality',
    pattern: /\b(?:responsive|mobile)\b/i,
    coveragePatterns: [/\b(?:responsive|mobile)/i],
  },
  {
    id: 'testing',
    text: 'Requested automated validation',
    kind: 'validation',
    pattern: /\b(?:tests?|validation|e2e|playwright)\b/i,
    coveragePatterns: [/\b(?:tests?|e2e|playwright|automated validation)/i],
  },
]

const domainDefinitions: Array<{
  domain: string
  signals: Array<{ pattern: RegExp; evidence: string; weight: number }>
}> = [
  {
    domain: 'reminder',
    signals: [
      { pattern: /\breminder(?:s)?\b/i, evidence: 'reminder noun', weight: 6 },
      { pattern: /\bremind\b/i, evidence: 'remind action', weight: 4 },
      { pattern: /\bdue\s*(?:date|time)/i, evidence: 'due-date scheduling', weight: 3 },
    ],
  },
  {
    domain: 'todo',
    signals: [
      { pattern: /\btodo(?:s)?\b/i, evidence: 'todo noun', weight: 6 },
      { pattern: /\bchecklist\b/i, evidence: 'checklist noun', weight: 4 },
      { pattern: /\btask(?:s)?\b/i, evidence: 'task noun', weight: 2 },
    ],
  },
  {
    domain: 'recipe-organizer',
    signals: [
      { pattern: /\brecipes?\b/i, evidence: 'recipe noun', weight: 6 },
      { pattern: /\borganizer\b/i, evidence: 'organizer noun', weight: 3 },
      { pattern: /\b(?:ingredients?|favorites?)\b/i, evidence: 'recipe organization capability', weight: 2 },
    ],
  },
  {
    domain: 'notes',
    signals: [
      { pattern: /\bnotes?\s+(?:app|application|manager|organizer)\b/i, evidence: 'notes product noun', weight: 7 },
      { pattern: /\b(?:local|personal)\s+notes?\b/i, evidence: 'local notes product', weight: 6 },
      { pattern: /\bnotes?\b/i, evidence: 'notes noun', weight: 2 },
      { pattern: /\b(?:pin|ordering|search)\b/i, evidence: 'notes organization capability', weight: 2 },
    ],
  },
  {
    domain: 'editor',
    signals: [
      { pattern: /\beditor\b/i, evidence: 'editor noun', weight: 6 },
      { pattern: /\bmarkdown\b/i, evidence: 'markdown format', weight: 5 },
      { pattern: /\bdocument(?:s)?\b/i, evidence: 'document noun', weight: 4 },
      { pattern: /\bnotes?\b/i, evidence: 'notes field or noun', weight: 1 },
    ],
  },
  {
    domain: 'dashboard',
    signals: [{ pattern: /\bdashboard\b/i, evidence: 'dashboard noun', weight: 6 }],
  },
  {
    domain: 'api-information',
    signals: [
      { pattern: /\b(?:weather|forecast)\b/i, evidence: 'weather information', weight: 6 },
      { pattern: /\b(?:api|lookup)\b/i, evidence: 'API lookup', weight: 3 },
    ],
  },
]

const NEGATION_WORDS = new Set(['no', 'not', 'never', 'without'])

function withoutNegatedSignals(value: string): string {
  const tokens = value.match(/[a-z0-9]+(?:['’][a-z0-9]+)?|[^a-z0-9]+/gi) ?? []
  let wordIndex = 0
  const words = tokens
    .map((token, tokenIndex) => {
      if (!/^[a-z0-9]/i.test(token)) return undefined
      return { token: token.toLowerCase(), tokenIndex, wordIndex: wordIndex++ }
    })
    .filter((word): word is { token: string; tokenIndex: number; wordIndex: number } => Boolean(word))
  const negatedTokenIndexes = new Set<number>()
  for (const word of words) {
    if (!NEGATION_WORDS.has(word.token)) continue
    for (const candidate of words) {
      if (candidate.wordIndex > word.wordIndex && candidate.wordIndex <= word.wordIndex + 3) {
        negatedTokenIndexes.add(candidate.tokenIndex)
      }
    }
  }
  return tokens
    .map((token, tokenIndex) => (negatedTokenIndexes.has(tokenIndex) ? ' '.repeat(token.length) : token))
    .join('')
}

export function analyzeBrief(projectBrief: string) {
  const lifecycleNeutralBrief = projectBrief.replace(
    /\b(?:complete|completed|completion)\s+(?:the\s+)?(?:flow|run|review|lifecycle|validation|process)\b/gi,
    '',
  )
  const recordCompletionIntent =
    /\b(?:complete|completed|reactivate|toggle)\s+(?:a\s+|the\s+)?(?:records?|items?|todos?|tasks?|reminders?)\b|\b(?:records?|items?|todos?|tasks?|reminders?)\s+(?:as\s+)?(?:complete|completed|active)\b/i.test(
      lifecycleNeutralBrief,
    )
  const positiveSignalBrief = withoutNegatedSignals(lifecycleNeutralBrief)
  const preliminaryDomains = domainDefinitions
    .map(definition => ({
      domain: definition.domain,
      score: definition.signals
        .filter(signal => signal.pattern.test(positiveSignalBrief))
        .reduce((total, signal) => total + signal.weight, 0),
    }))
    .sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain))
  const selectedDomain = preliminaryDomains[0]?.score ? preliminaryDomains[0].domain : undefined
  const requirements = requirementDefinitions
    .filter(definition => {
      if (definition.domains && (!selectedDomain || !definition.domains.includes(selectedDomain))) return false
      if (definition.id === 'completion') return recordCompletionIntent
      if (definition.id === 'filtering') {
        return /\bfilter(?:ing|ed|s)?\b/i.test(lifecycleNeutralBrief)
      }
      return definition.pattern.test(lifecycleNeutralBrief)
    })
    .map(({ id, text, kind, coveragePatterns }) => ({ id, text, kind, terms: coveragePatterns.map(String) }))
  const domainCandidates = domainDefinitions
    .map(definition => {
      const matches = definition.signals.filter(signal => signal.pattern.test(positiveSignalBrief))
      const score = matches.reduce((total, signal) => total + signal.weight, 0)
      return {
        domain: definition.domain,
        confidence: Math.min(1, score / 8),
        evidence: matches.map(signal => signal.evidence),
        score,
      }
    })
    .filter(candidate => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.domain.localeCompare(right.domain))
    .map(candidate => ({
      domain: candidate.domain,
      confidence: candidate.confidence,
      evidence: candidate.evidence,
    }))

  return { requirements, domainCandidates, selectedDomain: domainCandidates[0]?.domain }
}

export function assessPlanRequirements(projectBrief: string, tasks: TaskSurface[]): PlanRequirementAssessment {
  const analysis = analyzeBrief(projectBrief)
  const requirements = analysis.requirements.map(requirement => {
    const definition = requirementDefinitions.find(candidate => candidate.id === requirement.id)!
    const coveredBy = tasks.flatMap(task => {
      const surfaces: Array<{ surface: 'description' | 'acceptanceCriteria' | 'validationIntent'; value: string }> = [
        { surface: 'description', value: task.description },
        { surface: 'validationIntent', value: task.validationIntent },
        ...task.acceptanceCriteria.map(value => ({ surface: 'acceptanceCriteria' as const, value })),
      ]
      return surfaces
        .filter(({ surface, value }) => {
          if (task.id === 'plan-from-brief' && surface === 'description') return false
          return definition.coveragePatterns.every(pattern => pattern.test(value))
        })
        .map(({ surface }) => ({ taskId: task.id, surface }))
    })
    return { ...requirement, coveredBy }
  })
  const uncoveredRequirementIds = requirements
    .filter(requirement => {
      if (requirement.kind === 'quality') {
        return (
          !requirement.coveredBy.some(item => item.surface === 'acceptanceCriteria') ||
          !requirement.coveredBy.some(item => item.surface === 'validationIntent')
        )
      }
      if (requirement.kind === 'validation') {
        return !requirement.coveredBy.some(item => item.surface === 'validationIntent')
      }
      return requirement.coveredBy.length === 0
    })
    .map(requirement => requirement.id)
  const warnings: PlanRequirementAssessment['warnings'] = []
  if (
    analysis.domainCandidates.length > 1 &&
    analysis.domainCandidates[0]!.confidence - analysis.domainCandidates[1]!.confidence < 0.3
  ) {
    warnings.push({
      code: 'domain-ambiguity',
      message: 'Multiple product domains match this brief; review the selected task shape.',
    })
  }
  if (uncoveredRequirementIds.length) {
    warnings.push({
      code: 'uncovered-requirements',
      message: `${uncoveredRequirementIds.length} explicit requirement${uncoveredRequirementIds.length === 1 ? '' : 's'} need coverage before review-ready publication.`,
    })
  }
  return { ...analysis, requirements, uncoveredRequirementIds, warnings }
}
