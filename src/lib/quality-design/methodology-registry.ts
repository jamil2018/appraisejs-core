import { createHash } from 'node:crypto'

import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'

const id = z.string().min(1)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const nonEmptyText = z.string().trim().min(1)

const assuranceLevelSchema = z.enum(['SMOKE', 'STANDARD', 'HIGH', 'EXHAUSTIVE'])
type AssuranceLevel = z.infer<typeof assuranceLevelSchema>

const methodologyRefSchema = z
  .object({
    providerId: id,
    methodologyId: id,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    digest,
  })
  .strict()
export type MethodologyRef = z.infer<typeof methodologyRefSchema>

const methodologyMethodSchema = z
  .object({
    id,
    title: nonEmptyText,
    purpose: nonEmptyText,
  })
  .strict()

const methodologyManifestSchema = z
  .object({
    providerId: id,
    methodologyId: id,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    title: nonEmptyText,
    methods: z.array(methodologyMethodSchema).min(1),
    plannerContract: z
      .object({
        schemaVersion: z.literal('1'),
        reasoningAuthority: z.literal('HOST_AGENT'),
        proposalOnly: z.literal(true),
        requiredLifecycle: z.array(nonEmptyText).min(1),
        rubric: z.object({ id, version: z.string().regex(/^\d+\.\d+\.\d+$/) }).strict(),
      })
      .strict(),
    contracts: z
      .array(
        z
          .object({
            artifactType: z.enum(['REQUIREMENT_ANALYSIS', 'VALIDATION_DESIGN', 'EVIDENCE_ATTRIBUTION']),
            schemaVersion: z.literal('1'),
            requiredSections: z.array(nonEmptyText).min(1),
          })
          .strict(),
      )
      .length(3),
    critiqueRules: z
      .array(
        z
          .object({
            id,
            appliesTo: z.enum(['REQUIREMENT_ANALYSIS', 'VALIDATION_DESIGN', 'EVIDENCE_ATTRIBUTION']),
            severity: z.enum(['BLOCKER', 'WARNING']),
            description: nonEmptyText,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export type MethodologyManifest = z.infer<typeof methodologyManifestSchema>

const provenanceSchema = z
  .object({
    sourceRequirementIds: z.array(id),
    rationale: z.string().trim(),
  })
  .strict()

const inferenceSchema = z
  .object({
    id,
    statement: nonEmptyText,
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    provenance: provenanceSchema,
  })
  .strict()

const requirementSchema = z
  .object({
    id,
    text: nonEmptyText,
  })
  .strict()

const qualityObligationSchema = z
  .object({
    id,
    requirementIds: z.array(id).min(1),
    intent: nonEmptyText,
    minimumAssurance: assuranceLevelSchema,
    provenance: provenanceSchema,
  })
  .strict()

export const requirementAnalysisProposalSchema = z
  .object({
    schemaVersion: z.literal('1'),
    methodology: methodologyRefSchema,
    requirements: z.array(requirementSchema).min(1),
    inferences: z.array(inferenceSchema),
    assumptions: z.array(nonEmptyText),
    ambiguities: z.array(nonEmptyText),
    contradictions: z.array(nonEmptyText),
    proposedQueries: z.array(z.object({ id, prompt: nonEmptyText, rationale: nonEmptyText }).strict()),
    obligations: z.array(qualityObligationSchema).min(1),
  })
  .strict()
export type RequirementAnalysisProposal = z.infer<typeof requirementAnalysisProposalSchema>

const validationAssertionSchema = z
  .object({
    id,
    statement: nonEmptyText,
    observable: z.boolean(),
  })
  .strict()

const scenarioSchema = z
  .object({
    id,
    title: nonEmptyText,
    obligationIds: z.array(id).min(1),
    behavior: nonEmptyText,
    kind: z.enum(['POSITIVE', 'NEGATIVE', 'RECOVERY']),
    assertions: z.array(validationAssertionSchema).min(1),
    requiredMinimumAssurance: assuranceLevelSchema,
    matrix: z
      .object({
        cells: z.array(z.object({ browser: id, environment: id }).strict()).min(1),
        rationale: z.string().trim(),
      })
      .strict(),
    failureMeaning: z.string().trim(),
  })
  .strict()

export const validationDesignProposalSchema = z
  .object({
    schemaVersion: z.literal('1'),
    methodology: methodologyRefSchema,
    requiredAssurance: assuranceLevelSchema,
    techniques: z.array(nonEmptyText).min(1),
    layers: z.array(nonEmptyText).min(1),
    risks: z.array(nonEmptyText).min(1),
    evidenceExpectations: z.array(nonEmptyText).min(1),
    limitations: z.array(nonEmptyText),
    scenarios: z.array(scenarioSchema).min(1),
  })
  .strict()
export type ValidationDesignProposal = z.infer<typeof validationDesignProposalSchema>

const evidenceAttributionKindSchema = z.enum([
  'target_defect',
  'requirement_ambiguity',
  'validation_design_defect',
  'validation_realization_defect',
  'appraise_runtime_defect',
  'environment_or_data_defect',
  'automation_blocked',
  'inconclusive',
])

export const evidenceAttributionSchema = z
  .object({
    schemaVersion: z.literal('1'),
    kind: evidenceAttributionKindSchema,
    supportingEvidenceHashes: z.array(digest).min(1),
    contradictingEvidenceHashes: z.array(digest),
    validationRechecked: z.boolean(),
    requirementAlignmentConfirmed: z.boolean(),
    confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    rationale: nonEmptyText,
  })
  .strict()
export type EvidenceAttribution = z.infer<typeof evidenceAttributionSchema>

export const obligationFindingSchema = z
  .object({
    schemaVersion: z.literal('1'),
    obligationId: id,
    outcome: z.enum(['SATISFIED', 'VIOLATED', 'NOT_EVALUATED']),
    attribution: evidenceAttributionSchema.optional(),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.outcome === 'VIOLATED' && finding.attribution?.kind !== 'target_defect') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only target_defect attribution may violate an obligation.',
      })
    }
    if (finding.outcome === 'NOT_EVALUATED' && !finding.attribution) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A not-evaluated obligation requires explicit failure attribution.',
      })
    }
  })

export const builtInMethodologyManifest: MethodologyManifest = {
  providerId: 'appraise.built-in',
  methodologyId: 'quality-os-core',
  version: '1.0.0',
  title: 'Appraise Quality OS core methodology',
  plannerContract: {
    schemaVersion: '1',
    reasoningAuthority: 'HOST_AGENT',
    proposalOnly: true,
    requiredLifecycle: [
      'analyze',
      'query',
      'approve-analysis',
      'design',
      'approve-design',
      'realize',
      'consent',
      'run',
    ],
    rubric: { id: 'quality-planning-rubric', version: '1.0.0' },
  },
  contracts: [
    {
      artifactType: 'REQUIREMENT_ANALYSIS',
      schemaVersion: '1',
      requiredSections: [
        'requirements',
        'inferences',
        'assumptions',
        'ambiguities',
        'contradictions',
        'proposedQueries',
        'obligations',
      ],
    },
    {
      artifactType: 'VALIDATION_DESIGN',
      schemaVersion: '1',
      requiredSections: ['techniques', 'layers', 'risks', 'evidenceExpectations', 'limitations', 'scenarios'],
    },
    {
      artifactType: 'EVIDENCE_ATTRIBUTION',
      schemaVersion: '1',
      requiredSections: ['kind', 'supportingEvidenceHashes', 'contradictingEvidenceHashes', 'confidence', 'rationale'],
    },
  ],
  critiqueRules: [
    {
      id: 'requirement-coverage',
      appliesTo: 'REQUIREMENT_ANALYSIS',
      severity: 'BLOCKER',
      description: 'Every requirement must be covered by a provenance-bound obligation.',
    },
    {
      id: 'scenario-coverage',
      appliesTo: 'VALIDATION_DESIGN',
      severity: 'BLOCKER',
      description: 'Every obligation needs observable coverage including negative or recovery behavior.',
    },
    {
      id: 'target-defect-only',
      appliesTo: 'EVIDENCE_ATTRIBUTION',
      severity: 'BLOCKER',
      description: 'Only a reviewed target_defect attribution can produce a violated obligation.',
    },
  ],
  methods: [
    [
      'requirement-decomposition',
      'Requirement decomposition',
      'Separate observable requirements, actors, and constraints.',
    ],
    ['ambiguity-analysis', 'Ambiguity analysis', 'Find missing, contradictory, or underspecified intent.'],
    ['risk-discovery', 'Risk discovery', 'Identify failure consequences and prioritize assurance.'],
    ['quality-attributes', 'Quality attributes', 'Assess relevant non-functional quality dimensions.'],
    ['state-transitions', 'State transitions', 'Cover valid and invalid changes between meaningful states.'],
    [
      'boundary-and-equivalence',
      'Boundaries and equivalence',
      'Use equivalence classes and boundary values for inputs.',
    ],
    [
      'negative-and-recovery',
      'Negative and recovery paths',
      'Exercise rejection, error handling, and recovery behavior.',
    ],
    ['accessibility', 'Accessibility', 'Evaluate perceivable, operable, understandable, and robust behavior.'],
    ['security', 'Security', 'Evaluate authorization, abuse resistance, and sensitive-data handling.'],
    ['data-integrity', 'Data integrity', 'Evaluate correctness, consistency, and preservation of data.'],
    ['reliability', 'Reliability', 'Evaluate repeatability, resilience, and failure handling.'],
    ['compatibility', 'Compatibility', 'Evaluate supported environments, browsers, and integrations.'],
    ['performance', 'Performance', 'Evaluate response behavior under relevant load or size conditions.'],
  ].map(([methodId, title, purpose]) => ({ id: methodId, title, purpose })),
}

export function methodologyManifestDigest(manifest: MethodologyManifest): string {
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson(methodologyManifestSchema.parse(manifest)))
    .digest('hex')}`
}

export const builtInMethodologyRef: MethodologyRef = {
  providerId: builtInMethodologyManifest.providerId,
  methodologyId: builtInMethodologyManifest.methodologyId,
  version: builtInMethodologyManifest.version,
  digest: methodologyManifestDigest(builtInMethodologyManifest),
}

export type MethodologyProvider = {
  read(ref: Omit<MethodologyRef, 'digest'>): MethodologyManifest | null
}

export const builtInMethodologyProvider: MethodologyProvider = {
  read(ref) {
    if (
      ref.providerId !== builtInMethodologyManifest.providerId ||
      ref.methodologyId !== builtInMethodologyManifest.methodologyId ||
      ref.version !== builtInMethodologyManifest.version
    ) {
      return null
    }
    return builtInMethodologyManifest
  },
}

export type CritiqueFinding = {
  code:
    | 'MISSING_PROVENANCE'
    | 'UNCOVERED_REQUIREMENT'
    | 'UNCOVERED_OBLIGATION'
    | 'NON_FALSIFIABLE_ASSERTION'
    | 'HAPPY_PATH_ONLY'
    | 'DUPLICATE_SCENARIO'
    | 'UNJUSTIFIED_MATRIX'
    | 'ASSURANCE_DOWNGRADE'
    | 'MISSING_FAILURE_MEANING'
  subjectId: string
  message: string
}

const assuranceRank: Record<AssuranceLevel, number> = { SMOKE: 1, STANDARD: 2, HIGH: 3, EXHAUSTIVE: 4 }

export function critiqueRequirementAnalysis(proposal: RequirementAnalysisProposal): CritiqueFinding[] {
  const findings: CritiqueFinding[] = []
  const coveredRequirements = new Set(proposal.obligations.flatMap(obligation => obligation.requirementIds))

  for (const requirement of proposal.requirements) {
    if (!coveredRequirements.has(requirement.id)) {
      findings.push({
        code: 'UNCOVERED_REQUIREMENT',
        subjectId: requirement.id,
        message: 'Requirement has no derived obligation.',
      })
    }
  }
  for (const inference of proposal.inferences) {
    if (!inference.provenance.sourceRequirementIds.length || !inference.provenance.rationale) {
      findings.push({
        code: 'MISSING_PROVENANCE',
        subjectId: inference.id,
        message: 'Inference requires requirement provenance.',
      })
    }
  }
  for (const obligation of proposal.obligations) {
    if (!obligation.provenance.sourceRequirementIds.length || !obligation.provenance.rationale) {
      findings.push({
        code: 'MISSING_PROVENANCE',
        subjectId: obligation.id,
        message: 'Obligation requires requirement provenance.',
      })
    }
  }
  return findings
}

export function critiqueValidationDesign(
  proposal: ValidationDesignProposal,
  expectedObligationIds: readonly string[],
): CritiqueFinding[] {
  const findings: CritiqueFinding[] = []
  const coveredObligations = new Set(proposal.scenarios.flatMap(scenario => scenario.obligationIds))
  const fingerprints = new Map<string, string>()

  for (const obligationId of expectedObligationIds) {
    if (!coveredObligations.has(obligationId)) {
      findings.push({
        code: 'UNCOVERED_OBLIGATION',
        subjectId: obligationId,
        message: 'Obligation has no scenario coverage.',
      })
    }
  }
  if (proposal.scenarios.every(scenario => scenario.kind === 'POSITIVE')) {
    findings.push({
      code: 'HAPPY_PATH_ONLY',
      subjectId: 'portfolio',
      message: 'Portfolio requires a negative or recovery scenario.',
    })
  }
  for (const scenario of proposal.scenarios) {
    const fingerprint = canonicalContractJson({
      assertions: scenario.assertions.map(assertion => assertion.statement).sort(),
      behavior: scenario.behavior,
      obligationIds: [...scenario.obligationIds].sort(),
    })
    const duplicateOf = fingerprints.get(fingerprint)
    if (duplicateOf) {
      findings.push({
        code: 'DUPLICATE_SCENARIO',
        subjectId: scenario.id,
        message: `Scenario duplicates ${duplicateOf}.`,
      })
    } else {
      fingerprints.set(fingerprint, scenario.id)
    }
    if (scenario.assertions.some(assertion => !assertion.observable)) {
      findings.push({
        code: 'NON_FALSIFIABLE_ASSERTION',
        subjectId: scenario.id,
        message: 'Scenario has a non-observable assertion.',
      })
    }
    if (!scenario.matrix.rationale) {
      findings.push({
        code: 'UNJUSTIFIED_MATRIX',
        subjectId: scenario.id,
        message: 'Scenario matrix needs a rationale.',
      })
    }
    if (assuranceRank[scenario.requiredMinimumAssurance] < assuranceRank[proposal.requiredAssurance]) {
      findings.push({
        code: 'ASSURANCE_DOWNGRADE',
        subjectId: scenario.id,
        message: 'Scenario assurance is below the portfolio requirement.',
      })
    }
    if (!scenario.failureMeaning) {
      findings.push({
        code: 'MISSING_FAILURE_MEANING',
        subjectId: scenario.id,
        message: 'Scenario must explain what failure means.',
      })
    }
  }
  return findings
}

const plannerEvaluationRubric = {
  id: 'quality-planning-rubric',
  version: '1.0.0',
  scale: { minimum: 0, maximum: 2, passingTotal: 16 },
  dimensions: [
    'provenance',
    'queryUsefulness',
    'riskDiscovery',
    'obligationQuality',
    'scenarioDiversity',
    'falsifiability',
    'redundancy',
    'assurance',
    'attribution',
    'interactionEfficiency',
  ],
} as const

const semanticStopWords = new Set([
  'and',
  'behavior',
  'expected',
  'product',
  'quality',
  'required',
  'requirement',
  'result',
  'safe',
  'should',
  'supplied',
  'test',
  'validate',
  'validated',
  'with',
])

function semanticTerms(...values: string[]) {
  return new Set(
    values
      .join(' ')
      .toLowerCase()
      .match(/[a-z][a-z0-9-]{3,}/g)
      ?.filter(term => !semanticStopWords.has(term)) ?? [],
  )
}

function hasSemanticPlanningAlignment(analysis: RequirementAnalysisProposal, design: ValidationDesignProposal) {
  return analysis.obligations.every(obligation => {
    const requirementTexts = analysis.requirements
      .filter(requirement => obligation.requirementIds.includes(requirement.id))
      .map(requirement => requirement.text)
    const sourceTerms = semanticTerms(obligation.intent, ...requirementTexts)
    const linkedScenarios = design.scenarios.filter(scenario => scenario.obligationIds.includes(obligation.id))
    const validationTerms = semanticTerms(
      ...design.risks,
      ...design.techniques,
      ...linkedScenarios.flatMap(scenario => [
        scenario.title,
        scenario.behavior,
        scenario.failureMeaning,
        ...scenario.assertions.map(assertion => assertion.statement),
      ]),
    )
    const alignedTerms = [...sourceTerms].filter(term => validationTerms.has(term))
    return sourceTerms.size > 0 && alignedTerms.length >= 2
  })
}

function hasRelevantRequirementQueries(analysis: RequirementAnalysisProposal) {
  const unresolvedTerms = semanticTerms(
    ...analysis.ambiguities,
    ...analysis.contradictions,
    ...analysis.requirements.map(requirement => requirement.text),
  )
  return analysis.proposedQueries.every(query => {
    const queryTerms = semanticTerms(query.prompt, query.rationale)
    return [...queryTerms].some(term => unresolvedTerms.has(term))
  })
}

export function evaluateQualityPlanning(input: {
  analysis: RequirementAnalysisProposal
  design: ValidationDesignProposal
  attribution: EvidenceAttribution
  interactionTurns: number
}) {
  const analysisCritique = critiqueRequirementAnalysis(input.analysis)
  const designCritique = critiqueValidationDesign(
    input.design,
    input.analysis.obligations.map(obligation => obligation.id),
  )
  const ambiguityCount = input.analysis.ambiguities.length + input.analysis.contradictions.length
  const queryFingerprints = new Set(
    input.analysis.proposedQueries.map(query => `${query.prompt.toLowerCase()}::${query.rationale.toLowerCase()}`),
  )
  const scenarioKinds = new Set(input.design.scenarios.map(scenario => scenario.kind))
  const scenarioFingerprints = new Set(
    input.design.scenarios.map(scenario =>
      canonicalContractJson({
        behavior: scenario.behavior,
        obligationIds: [...scenario.obligationIds].sort(),
        assertions: scenario.assertions.map(assertion => assertion.statement).sort(),
      }),
    ),
  )
  const scores = {
    provenance: analysisCritique.some(finding => finding.code === 'MISSING_PROVENANCE') ? 0 : 2,
    queryUsefulness:
      ambiguityCount === 0
        ? input.analysis.proposedQueries.length === 0
          ? 2
          : 1
        : input.analysis.proposedQueries.length >= ambiguityCount &&
            hasRelevantRequirementQueries(input.analysis) &&
            queryFingerprints.size === input.analysis.proposedQueries.length
          ? 2
          : input.analysis.proposedQueries.length && hasRelevantRequirementQueries(input.analysis)
            ? 1
            : 0,
    riskDiscovery: hasSemanticPlanningAlignment(input.analysis, input.design)
      ? input.design.risks.length >= 2 && input.design.techniques.length >= 2
        ? 2
        : 1
      : 0,
    obligationQuality: input.analysis.obligations.every(
      obligation => obligation.intent.length >= 12 && obligation.provenance.rationale.length >= 8,
    )
      ? 2
      : 1,
    scenarioDiversity:
      scenarioKinds.has('POSITIVE') && (scenarioKinds.has('NEGATIVE') || scenarioKinds.has('RECOVERY')) ? 2 : 0,
    falsifiability: designCritique.some(finding =>
      ['NON_FALSIFIABLE_ASSERTION', 'MISSING_FAILURE_MEANING'].includes(finding.code),
    )
      ? 0
      : 2,
    redundancy: scenarioFingerprints.size === input.design.scenarios.length ? 2 : 0,
    assurance: designCritique.some(finding => finding.code === 'ASSURANCE_DOWNGRADE') ? 0 : 2,
    attribution:
      input.attribution.validationRechecked && input.attribution.requirementAlignmentConfirmed
        ? input.attribution.confidence === 'HIGH'
          ? 2
          : 1
        : 0,
    interactionEfficiency: input.interactionTurns <= 2 ? 2 : input.interactionTurns <= 4 ? 1 : 0,
  }
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0)
  return {
    rubric: { id: plannerEvaluationRubric.id, version: plannerEvaluationRubric.version },
    scores,
    total,
    passed: total >= plannerEvaluationRubric.scale.passingTotal && Object.values(scores).every(score => score > 0),
    improvementDimensions: plannerEvaluationRubric.dimensions.filter(dimension => scores[dimension] < 2),
  }
}
