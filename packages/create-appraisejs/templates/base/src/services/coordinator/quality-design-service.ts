import prisma from '@/config/db-config'
import { randomUUID } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical, hashQualityPlanRevision, canApproveRequirements } from '@/lib/quality-design/state'
import { builtInMethodologyRef } from '@/lib/quality-design/methodology-registry'
import { canonicalizeAndValidateQualityRealization } from '@/lib/quality-design/validation-realization'
import { frozenEnvironmentSnapshot } from '@/lib/quality-design/frozen-environment-snapshot'
import {
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  expectedQualityPublicationPreflightAuthority,
  isKnownQualityPublicationPreflightAuthority,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import { publishQualityValidationRuntime } from '@/services/coordinator/quality-validation-publication-service'
import { ServiceError } from '@/services/shared/errors'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import {
  assertRemoteEvaluationScopeCurrent,
  parseRemoteSubjectReference,
  resolveRemoteEvaluationScopeSubject,
} from '@/services/coordinator/remote-evaluation-scope-service'
import type { RemoteScopePhaseBinding } from '@/services/coordinator/remote-evaluation-scope-service'

const qualityDb = prisma as unknown as PrismaLike

type QualityQueryRecord = {
  id: string
  prompt: string
  status: 'BLOCKING' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION' | 'ANSWERED'
  answer: string | null
  rationale: string | null
}

type QualityRevisionRecord = {
  id: string
  targetProjectId: string
  qualityPlanId: string
  revision: number
  status: string
  approvedAt: Date | null
  contentHash: string
  sourceSpecification: string
  requirementGraphJson: string
  methodologyId: string
  methodologyVersion: string
  methodologyHash: string
  predecessorRevisionId?: string | null
  queryAnswerIdempotencyKey?: string | null
  queryAnswerRequestHash?: string | null
  qualityPlan: {
    id: string
    targetProjectId: string
    title: string
    description: string | null
    targetProject?: { kind: string }
  }
  requirementSnapshots: Array<{
    id: string
    externalRef: string | null
    text: string
    kind: string
    contentHash: string
  }>
  obligations: Array<{
    id: string
    requirementSnapshotId: string
    title: string
    intent: string
    assertionScopeJson: string
    minimumAssurance: string
    limitations: string | null
    contentHash: string
  }>
  queries: QualityQueryRecord[]
  validationVersions: Array<{
    id: string
    validationIdentity: string
    version: number
    validationDesignRevisionId: string
    status: string
    reuseOutcome: string | null
    canonicalAstJson: string
    canonicalHash: string
    realizationJson?: string | null
    realizationHash?: string | null
    compilationHash?: string | null
    scenarioApprovedAt?: Date | null
    scenarioApprovedBy?: string | null
    scenarioApprovalHash?: string | null
    activeGenerationId?: string | null
    activeGeneration?: {
      id: string
      generationKey: string
      disposition: string
      preflightAlgorithmVersion: string
      preflightAuthority: string
      canonicalRealizationJson: string
      realizationHash: string
      publication?: {
        id: string
        generationId: string
        operationHash: string
        phase: string
        preflightAlgorithmVersion: string
        preflightAuthority: string
        preflightDisposition: string
        runtimeInputHash: string
        runtimeInputJson: string
        receiptHash: string
      } | null
    } | null
  }>
}

type Delegate<T> = {
  findFirst(args: unknown): Promise<T | null>
  findMany?(args: unknown): Promise<T[]>
  create(args: unknown): Promise<T>
  update(args: unknown): Promise<T>
}

type PrismaLike = {
  qualityPlanRevision: Delegate<QualityRevisionRecord>
  qualityPlan: Delegate<{ id: string }>
  requirementSnapshot: Delegate<{ id: string }>
  qualityObligationRevision: Delegate<unknown>
  requirementAnalysisRevision: Delegate<{ id: string }>
  validationDesignRevision: Delegate<{ id: string }>
  requirementQuery: Delegate<QualityQueryRecord>
  validationVersion: Delegate<QualityRevisionRecord['validationVersions'][number]>
  obligationValidationVersion: Delegate<unknown>
  evaluationSubjectRevision: Delegate<{
    id: string
    subjectDigest: string
    subjectKind: string
    authority: string
    metadataJson: string | null
  }>
  assessment: Delegate<{
    id: string
    targetProjectId: string
    qualityPlanId: string
    qualityPlanRevisionId: string
    evaluationSubjectRevisionId: string
    status: string
    alignment: string
    observedAssurance: string | null
    baselineAssessmentId: string | null
    lineageId: string
    generation: number
    supersedesAssessmentId: string | null
    supersessionDispositionJson: string | null
    successorIdempotencyKey: string | null
    successorRequestHash: string | null
    rootIdempotencyKey?: string | null
    rootRequestHash?: string | null
    rootScopeReservationHash?: string | null
    evaluationSubjectRevision: {
      id: string
      subjectDigest: string
      subjectKind: string
      authority: string
      metadataJson: string | null
      remoteEvaluationScopeBinding?: {
        partitionMembership?: { validationVersionIdsJson: string } | null
      } | null
    }
    qualityPlan: { id: string; targetProjectId: string; title: string; description: string | null }
    qualityPlanRevision: QualityRevisionRecord
    baselineAssessment?: {
      id: string
      status: string
      evidenceReceipts: unknown[]
      decisions: Array<{ decision: string; decisionHash: string }>
    } | null
    evidenceReceipts: unknown[]
    findings: Array<{
      id: string
      qualityObligationRevisionId: string
      outcome: string
      attribution: string
      evidenceSetHash: string
      findingHash: string
      reviewStatus: string
      reviewHash: string | null
    }>
    decisions: Array<{
      id: string
      decision: string
      rationale: string
      decidedBy: string
      decidedAt: Date
      decisionHash: string
    }>
    targetProject: { kind: string }
    runs: Array<{
      id?: string
      status?: string
      stopReason?: string | null
      createdAt?: Date
      bindings: Array<{
        evidenceReceiptId: string | null
        terminalOutcome: string | null
        terminalizedAt?: Date | null
        integrityRejectionCode?: string | null
        testRun: {
          id?: string
          status?: string
          result?: string
          evidenceHealth?: string
          targetProjectId: string
          targetProject: { kind: string }
          environment: { id: string }
          environmentSnapshotHash: string | null
          environmentSnapshotJson: string | null
          environmentSnapshotVersion: number | null
        }
      }>
    }>
  }>
  assessmentDecision: Delegate<unknown>
  assessmentFinding?: Delegate<unknown>
  $transaction<T>(operation: (transaction: PrismaLike) => Promise<T>): Promise<T>
  $transaction<T>(operations: Promise<T>[]): Promise<T[]>
}

type ScenarioProposal = {
  id?: string
  title?: string
  obligationIds: string[]
  behavior: string
  assertions: unknown[]
  coverage: unknown
  requiredMinimumAssurance?: 'SMOKE' | 'STANDARD' | 'HIGH' | 'EXHAUSTIVE'
  matrixIntent: unknown
  limitations: unknown
}

const assuranceRank = { SMOKE: 1, STANDARD: 2, HIGH: 3, EXHAUSTIVE: 4 } as const

type QualityRequirementInput = {
  id?: string
  externalRef?: string
  text: string
  kind?: 'FUNCTIONAL' | 'DATA' | 'QUALITY' | 'VALIDATION' | 'CONSTRAINT'
  minimumAssurance?: 'SMOKE' | 'STANDARD' | 'HIGH' | 'EXHAUSTIVE'
  limitations?: string
}

type SourceSpecification = {
  title?: string
  description?: string
  requirements?: QualityRequirementInput[]
}

type EvaluationSubjectInput = {
  subjectDigest?: string
  subjectKind?: 'ARTIFACT' | 'DEPLOYMENT_SNAPSHOT'
  authority?: string
  metadata?: unknown
  subjectRevisionId?: string
  expectedSubjectDigest?: string
}

function normalizeSource(source: unknown): SourceSpecification {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return { title: 'Quality Plan', requirements: [] }
  const value = source as Record<string, unknown>
  const requirements = Array.isArray(value.requirements)
    ? value.requirements
        .filter(isRequirementRecord)
        .filter(item => typeof item.text === 'string' && item.text.trim())
        .map(item => ({
          id: typeof item.id === 'string' ? item.id : undefined,
          externalRef: typeof item.externalRef === 'string' ? item.externalRef : undefined,
          text: String(item.text).trim(),
          kind: parseRequirementKind(item.kind),
          minimumAssurance: parseAssurance(item.minimumAssurance),
          limitations:
            typeof item.limitations === 'string' && item.limitations.trim() ? item.limitations.trim() : undefined,
        }))
    : []
  return {
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : 'Quality Plan',
    description:
      typeof value.description === 'string' && value.description.trim() ? value.description.trim() : undefined,
    requirements,
  }
}

function isRequirementRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseRequirementKind(value: unknown): QualityRequirementInput['kind'] {
  return value === 'DATA' || value === 'QUALITY' || value === 'VALIDATION' || value === 'CONSTRAINT'
    ? value
    : 'FUNCTIONAL'
}

function parseAssurance(value: unknown): NonNullable<QualityRequirementInput['minimumAssurance']> {
  return value === 'SMOKE' || value === 'HIGH' || value === 'EXHAUSTIVE' ? value : 'STANDARD'
}

function sourceGraph(source: SourceSpecification) {
  return {
    requirements: source.requirements?.map((requirement, index) => ({
      id: requirement.id ?? `requirement-${index + 1}`,
      externalRef: requirement.externalRef,
      text: requirement.text,
      kind: requirement.kind ?? 'FUNCTIONAL',
    })),
  }
}

function sourceHashInput(source: SourceSpecification) {
  const requirements = source.requirements ?? []
  return {
    sourceSpecification: JSON.stringify(source),
    requirementGraph: sourceGraph(source),
    requirements: requirements.map((requirement, index) => ({
      externalRef: requirement.externalRef,
      text: requirement.text,
      kind: requirement.kind ?? 'FUNCTIONAL',
      index,
    })),
    obligations: requirements.map((requirement, index) => ({
      title: requirement.externalRef ?? requirement.id ?? `Requirement ${index + 1}`,
      intent: requirement.text,
      minimumAssurance: requirement.minimumAssurance ?? 'STANDARD',
      limitations: requirement.limitations,
    })),
  }
}

async function readRevisionOrThrow(client: PrismaLike, qualityPlanId: string, revisionId?: string) {
  const revision = await client.qualityPlanRevision.findFirst({
    where: { qualityPlanId, ...(revisionId ? { id: revisionId } : {}) },
    orderBy: { revision: 'desc' },
    include: {
      qualityPlan: { include: { targetProject: { select: { kind: true } } } },
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
    },
  })
  if (!revision) throw new ServiceError('Quality Plan revision not found.', 'NOT_FOUND')
  return revision
}

function revisionPayload(revision: QualityRevisionRecord) {
  const queries = revision.queries.map((query: QualityQueryRecord) => ({
    id: query.id,
    prompt: query.prompt,
    status: query.status,
    answer: query.answer,
    rationale: query.rationale,
  }))
  const orderedValidationVersions = [...revision.validationVersions].sort((left, right) =>
    left.canonicalHash.localeCompare(right.canonicalHash),
  )
  const validationDesigns = orderedValidationVersions.map(version => JSON.parse(version.canonicalAstJson))
  const designHash = validationDesigns.length ? hashCanonical(validationDesigns) : null
  return {
    qualityPlan: {
      id: revision.qualityPlan.id,
      targetProjectId: revision.qualityPlan.targetProjectId,
      title: revision.qualityPlan.title,
      description: revision.qualityPlan.description,
    },
    targetKind: revision.qualityPlan.targetProject?.kind,
    revision: {
      id: revision.id,
      revision: revision.revision,
      status: revision.status,
      contentHash: revision.contentHash,
      methodology: {
        methodologyId: revision.methodologyId,
        version: revision.methodologyVersion,
        digest: revision.methodologyHash,
      },
      approvedAt: revision.approvedAt,
      sourceSpecification: JSON.parse(revision.sourceSpecification),
      requirementGraph: JSON.parse(revision.requirementGraphJson),
    },
    requirements: revision.requirementSnapshots.map(requirement => ({
      id: requirement.id,
      externalRef: requirement.externalRef,
      text: requirement.text,
      kind: requirement.kind,
      contentHash: requirement.contentHash,
    })),
    obligations: revision.obligations.map(obligation => ({
      id: obligation.id,
      requirementSnapshotId: obligation.requirementSnapshotId,
      title: obligation.title,
      intent: obligation.intent,
      assertionScope: JSON.parse(obligation.assertionScopeJson),
      minimumAssurance: obligation.minimumAssurance,
      limitations: obligation.limitations,
      contentHash: obligation.contentHash,
    })),
    queries,
    approval: canApproveRequirements(queries) ? { blocked: false } : { blocked: true, blockingQueries: queries },
    validationVersionCount: revision.validationVersions.length,
    designHash,
    validationVersions: orderedValidationVersions.map(version => ({
      id: version.id,
      validationIdentity: version.validationIdentity,
      version: version.version,
      status: version.status,
      reuseOutcome: version.reuseOutcome,
      canonicalHash: version.canonicalHash,
      realization: version.realizationJson ? JSON.parse(version.realizationJson) : null,
      realizationHash: version.realizationHash ?? null,
      compilationHash: version.compilationHash ?? null,
      scenarioApprovedAt: version.scenarioApprovedAt ?? null,
      scenarioApprovedBy: version.scenarioApprovedBy ?? null,
      scenarioApprovalHash: version.scenarioApprovalHash ?? null,
      activeGeneration: hasSupportedActiveGeneration(version, revision.qualityPlan.targetProject?.kind)
        ? {
            id: version.activeGeneration.id,
            generationKey: version.activeGeneration.generationKey,
            disposition: version.activeGeneration.disposition,
            preflightAlgorithmVersion: version.activeGeneration.preflightAlgorithmVersion,
            preflightAuthority: version.activeGeneration.preflightAuthority,
            canonicalRealizationJson: version.activeGeneration.canonicalRealizationJson,
            realizationHash: version.activeGeneration.realizationHash,
            publicationId: version.activeGeneration.publication.id,
            operationHash: version.activeGeneration.publication.operationHash,
            runtimeInputHash: version.activeGeneration.publication.runtimeInputHash,
          }
        : null,
      design: JSON.parse(version.canonicalAstJson),
    })),
    nextRecommendedAction: qualityDesignNextAction(revision.status, queries, orderedValidationVersions),
  }
}

const qualityDesignStatusActions: Record<string, string> = {
  DRAFT: 'Call requirements_approve for this exact revision hash, then propose obligation-linked scenarios.',
  REQUIREMENTS_APPROVED: 'Call validation_design_propose to create obligation-linked scenarios for approval.',
  SCENARIO_REVIEW:
    'Review the current scenario design, then call validation_design_approve with its exact design hash.',
  SCENARIOS_APPROVED:
    'Use step_search, locator_search, and environment_list to resolve compact bindings, then call assessment_preflight.',
  REALIZED:
    'Read the current preparation receipt and resume assessment_prepare_run with the same idempotency key if a prior preparation is incomplete.',
  PUBLISHED: 'Create or prepare an assessment for an immutable subject digest, then run the published validations.',
}

function qualityDesignNextAction(
  status: string,
  queries: QualityRevisionRecord['queries'],
  validationVersions: QualityRevisionRecord['validationVersions'],
) {
  if (!canApproveRequirements(queries)) return 'Resolve blocking requirement queries before approval.'
  if (validationVersions.length > 0 && validationVersions.every(version => hasSupportedActiveGeneration(version)))
    return qualityDesignStatusActions.PUBLISHED
  return (
    qualityDesignStatusActions[status] ??
    'Read the current Quality Plan revision state before choosing the next lifecycle action.'
  )
}

/** Historical ValidationVersion status remains visible, but execution is
 * authorized only by the exact current generation/publication pair. */
type QualityRevisionValidation = QualityRevisionRecord['validationVersions'][number]
type QualityRevisionGeneration = NonNullable<QualityRevisionValidation['activeGeneration']>
type QualityRevisionPublication = NonNullable<QualityRevisionGeneration['publication']>

function hasSupportedActiveGeneration(
  version: QualityRevisionValidation,
  targetKind?: string,
): version is QualityRevisionValidation & {
  activeGeneration: QualityRevisionGeneration & { publication: QualityRevisionPublication }
} {
  const generation = version.activeGeneration
  const publication = generation?.publication
  return Boolean(
    generation &&
    publication &&
    generation.disposition === 'ACTIVE' &&
    generation.preflightAlgorithmVersion === ASSESSMENT_PREFLIGHT_ALGORITHM &&
    isKnownQualityPublicationPreflightAuthority(generation.preflightAuthority) &&
    (!targetKind || generation.preflightAuthority === expectedQualityPublicationPreflightAuthority(targetKind)) &&
    publication.generationId === generation.id &&
    Boolean(publication.operationHash) &&
    publication.phase === 'review_ready' &&
    publication.preflightAlgorithmVersion === ASSESSMENT_PREFLIGHT_ALGORITHM &&
    publication.preflightDisposition === 'ACTIVE' &&
    publication.preflightAuthority === generation.preflightAuthority &&
    Boolean(publication.runtimeInputHash),
  )
}

function parseScenarioProposals(value: unknown): ScenarioProposal[] {
  return scenarioProposalArray(value).filter(isRequirementRecord).map(scenarioProposal)
}

function scenarioProposalArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const scenarios = (value as { scenarios?: unknown }).scenarios
    return Array.isArray(scenarios) ? scenarios : []
  }
  return []
}

function nonEmptyStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function scenarioIntent(scenario: Record<string, unknown>) {
  if (typeof scenario.behavior === 'string' && scenario.behavior.trim()) return scenario.behavior.trim()
  return typeof scenario.intent === 'string' ? scenario.intent.trim() : ''
}

function scenarioProposal(scenario: Record<string, unknown>, index: number): ScenarioProposal {
  return {
    id: typeof scenario.id === 'string' && scenario.id.trim() ? scenario.id.trim() : `scenario-${index + 1}`,
    title: typeof scenario.title === 'string' && scenario.title.trim() ? scenario.title.trim() : undefined,
    obligationIds: nonEmptyStrings(scenario.obligationIds),
    behavior: scenarioIntent(scenario),
    assertions: Array.isArray(scenario.assertions) ? scenario.assertions : [],
    coverage: scenario.coverage,
    requiredMinimumAssurance: parseAssurance(scenario.requiredMinimumAssurance),
    matrixIntent: scenario.matrixIntent,
    limitations: scenario.limitations,
  }
}

function scenarioDesign(scenario: ScenarioProposal) {
  return {
    id: scenario.id,
    title: scenario.title,
    obligationIds: scenario.obligationIds,
    behavior: scenario.behavior,
    assertions: scenario.assertions ?? null,
    coverage: scenario.coverage ?? null,
    requiredMinimumAssurance: scenario.requiredMinimumAssurance ?? 'STANDARD',
    matrixIntent: scenario.matrixIntent ?? null,
    limitations: scenario.limitations ?? null,
  }
}

function assertScenariosCoverKnownObligations(revision: QualityRevisionRecord, scenarios: ScenarioProposal[]) {
  if (!scenarios.length) throw new ServiceError('At least one scenario design proposal is required.', 'VALIDATION')
  const obligationsById = new Map(revision.obligations.map(obligation => [obligation.id, obligation]))
  const knownObligations = new Set(revision.obligations.map(obligation => obligation.id))
  for (const scenario of scenarios) {
    assertScenarioReviewFields(scenario)
    const unknown = scenario.obligationIds.filter(id => !knownObligations.has(id))
    if (unknown.length) throw new ServiceError('Scenario proposal references unknown obligations.', 'CONFLICT')
    if (assuranceRank[scenario.requiredMinimumAssurance ?? 'STANDARD'] < requiredAssurance(scenario, obligationsById)) {
      throw new ServiceError('Scenario proposal assurance is weaker than a linked obligation requires.', 'CONFLICT')
    }
  }
}

function assertScenarioReviewFields(scenario: ScenarioProposal) {
  const missingField = [
    [scenario.obligationIds.length === 0, 'Scenario proposals must link obligations.'],
    [!scenario.behavior, 'Scenario proposals require behavioral intent.'],
    [scenario.assertions.length === 0, 'Scenario proposals require assertions.'],
    [scenario.coverage === undefined || scenario.coverage === null, 'Scenario proposals require coverage intent.'],
    [
      scenario.matrixIntent === undefined || scenario.matrixIntent === null,
      'Scenario proposals require matrix intent.',
    ],
    [
      scenario.limitations === undefined || scenario.limitations === null,
      'Scenario proposals require explicit limitations.',
    ],
  ].find(([missing]) => missing)
  if (missingField) throw new ServiceError(missingField[1] as string, 'VALIDATION')
}

function legacyValidationDesignProposal(scenarios: ScenarioProposal[]) {
  return {
    schemaVersion: '1' as const,
    methodology: builtInMethodologyRef,
    requiredAssurance: scenarios.reduce<NonNullable<ScenarioProposal['requiredMinimumAssurance']>>(
      (highest, scenario) =>
        assuranceRank[scenario.requiredMinimumAssurance ?? 'STANDARD'] > assuranceRank[highest]
          ? (scenario.requiredMinimumAssurance ?? 'STANDARD')
          : highest,
      'STANDARD',
    ),
    techniques: ['legacy quality-design API projection'],
    layers: ['managed validation runtime'],
    risks: ['Legacy caller supplied a compact scenario proposal.'],
    evidenceExpectations: ['Sealed evidence receipt for each selected validation matrix cell.'],
    limitations: scenarios.flatMap(scenario =>
      Array.isArray(scenario.limitations)
        ? scenario.limitations.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
    ),
    scenarios: scenarios.map((scenario, index) => ({
      id: scenario.id ?? `scenario-${index + 1}`,
      title: scenario.title ?? scenario.behavior,
      obligationIds: scenario.obligationIds,
      behavior: scenario.behavior,
      kind: 'POSITIVE' as const,
      assertions: scenario.assertions.map((assertion, assertionIndex) => ({
        id: `legacy-assertion-${index + 1}-${assertionIndex + 1}`,
        statement:
          typeof assertion === 'string' && assertion.trim() ? assertion.trim() : canonicalContractJson(assertion),
        observable: true,
      })),
      requiredMinimumAssurance: scenario.requiredMinimumAssurance ?? 'STANDARD',
      matrix: {
        cells: [{ browser: 'chromium', environment: 'legacy-default' }],
        rationale: 'The executable matrix is bound later by the reviewed runtime publication.',
      },
      failureMeaning: 'The expected behavior or observable assertion was not met.',
    })),
  }
}

async function createLegacyValidationDesign(
  transaction: PrismaLike,
  revision: QualityRevisionRecord,
  scenarios: ScenarioProposal[],
) {
  const proposal = legacyValidationDesignProposal(scenarios)
  const designHash = hashCanonical({ kind: 'appraise.validation-design/legacy-projection/v1', proposal })
  const existing = await transaction.validationDesignRevision.findFirst({
    where: { qualityPlanRevisionId: revision.id, designHash },
  })
  if (existing) return { id: existing.id, designHash }
  const existingDesigns = transaction.validationDesignRevision.findMany
    ? await transaction.validationDesignRevision.findMany({ where: { qualityPlanRevisionId: revision.id } })
    : []
  const nextRevision =
    existingDesigns.reduce((highest, design) => {
      const revisionNumber = (design as { revision?: unknown }).revision
      return typeof revisionNumber === 'number' ? Math.max(highest, revisionNumber) : highest
    }, 0) + 1
  const analysisId = `legacy-analysis:${revision.id}`
  const created = await transaction.validationDesignRevision.create({
    data: {
      targetProjectId: revision.targetProjectId,
      qualityPlanRevisionId: revision.id,
      requirementAnalysisRevisionId: analysisId,
      revision: nextRevision,
      status: 'IN_REVIEW',
      decision: 'PENDING',
      strategyJson: canonicalContractJson({
        methodology: builtInMethodologyRef,
        requiredAssurance: proposal.requiredAssurance,
      }),
      scenarioPortfolioJson: canonicalContractJson(proposal.scenarios),
      critiqueJson: canonicalContractJson([]),
      provenanceJson: canonicalContractJson({ source: 'quality-design-service:legacy-projection/v1' }),
      designHash,
    },
  })
  return { id: created.id, designHash }
}

function requiredAssurance(
  scenario: ScenarioProposal,
  obligationsById: Map<string, QualityRevisionRecord['obligations'][number]>,
) {
  return Math.max(
    ...scenario.obligationIds.map(
      id => assuranceRank[obligationsById.get(id)!.minimumAssurance as keyof typeof assuranceRank],
    ),
  )
}

export async function submitQualityRequirementSource(
  input: { target?: string; source: unknown; idempotencyKey: string; requireExplicitAnalysis?: boolean },
  client: PrismaLike = qualityDb,
) {
  const requireExplicitAnalysis = input.requireExplicitAnalysis !== false
  if (!input.target) {
    throw new ServiceError('Quality Plan source submission requires a registered target project.', 'VALIDATION')
  }
  const target = await resolveTargetProject(input.target ?? '')
  const source = normalizeSource(input.source)
  const graph = sourceGraph(source)
  const contentHash = hashQualityPlanRevision(sourceHashInput(source))
  const existing = await client.qualityPlanRevision.findFirst({
    where: { targetProjectId: target.id, contentHash },
    include: {
      qualityPlan: true,
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
    },
  })
  if (existing) {
    if (
      requireExplicitAnalysis &&
      (await client.requirementAnalysisRevision.findFirst({
        where: { id: `legacy-analysis:${existing.id}`, qualityPlanRevisionId: existing.id },
      }))
    )
      throw new ServiceError(
        'This source has compatibility-only analysis. Read its historical record and start a Quality Journey; legacy approvals cannot be upgraded.',
        'CONFLICT',
        409,
      )
    return { idempotent: true, ...revisionPayload(existing) }
  }

  const created = await client.$transaction(transaction =>
    createRequirementRevision(
      transaction as PrismaLike,
      target.id,
      source,
      graph,
      contentHash,
      requireExplicitAnalysis,
    ),
  )
  return { idempotent: false, ...revisionPayload(created) }
}

async function createRequirementRevision(
  transaction: PrismaLike,
  targetProjectId: string,
  source: SourceSpecification,
  graph: unknown,
  contentHash: string,
  requireExplicitAnalysis = true,
) {
  const qualityPlan = await transaction.qualityPlan.create({
    data: { targetProjectId, title: source.title ?? 'Quality Plan', description: source.description },
  })
  const revision = await transaction.qualityPlanRevision.create({
    data: {
      targetProjectId,
      qualityPlanId: qualityPlan.id,
      revision: 1,
      contentHash,
      sourceSpecification: JSON.stringify(source),
      requirementGraphJson: JSON.stringify(graph),
      methodologyId: builtInMethodologyRef.methodologyId,
      methodologyVersion: builtInMethodologyRef.version,
      methodologyHash: builtInMethodologyRef.digest,
    },
  })
  await createRequirementSnapshots(
    transaction,
    targetProjectId,
    revision.id,
    source.requirements ?? [],
    requireExplicitAnalysis,
  )
  if (!source.requirements?.length) await createBlockingRequirementQuery(transaction, revision.id)
  return readRevisionOrThrow(transaction, qualityPlan.id, revision.id)
}

async function createRequirementSnapshots(
  transaction: PrismaLike,
  targetProjectId: string,
  qualityPlanRevisionId: string,
  requirements: NonNullable<SourceSpecification['requirements']>,
  requireExplicitAnalysis: boolean,
) {
  const snapshots: Array<{ id: string; requirement: QualityRequirementInput; index: number }> = []
  for (const [index, requirement] of requirements.entries()) {
    const snapshot = await transaction.requirementSnapshot.create({
      data: {
        qualityPlanRevisionId,
        externalRef: requirement.externalRef,
        text: requirement.text,
        kind: requirement.kind ?? 'FUNCTIONAL',
        contentHash: hashCanonical({ text: requirement.text, externalRef: requirement.externalRef, index }),
      },
    })
    snapshots.push({ id: snapshot.id, requirement, index })
  }
  if (!snapshots.length || requireExplicitAnalysis) return

  // The legacy source-submission API still projects simple requirements into
  // obligations. Persist that projection as an already-reviewed immutable
  // analysis so it satisfies the Quality OS's non-null provenance boundary
  // without weakening the newer analysis/design APIs.
  const analysisId = `legacy-analysis:${qualityPlanRevisionId}`
  const obligations = snapshots.map(({ id, requirement, index }) => ({
    id: `legacy-obligation:${id}`,
    requirementIds: [id],
    intent: requirement.text,
    minimumAssurance: requirement.minimumAssurance ?? 'STANDARD',
    provenance: {
      sourceRequirementIds: [id],
      rationale: `Legacy source projection for requirement ${requirement.externalRef ?? requirement.id ?? index + 1}.`,
    },
  }))
  const proposal = {
    schemaVersion: '1' as const,
    methodology: builtInMethodologyRef,
    requirements: snapshots.map(({ id, requirement }) => ({ id, text: requirement.text })),
    inferences: [],
    assumptions: [],
    ambiguities: [],
    contradictions: [],
    proposedQueries: [],
    obligations,
  }
  const analysisHash = hashCanonical({ kind: 'appraise.requirement-analysis/legacy-projection/v1', proposal })
  const approvedAt = new Date()
  await transaction.requirementAnalysisRevision.create({
    data: {
      id: analysisId,
      targetProjectId,
      qualityPlanRevisionId,
      revision: 1,
      status: 'APPROVED',
      decision: 'APPROVED',
      analysisJson: canonicalContractJson(proposal),
      provenanceJson: canonicalContractJson({ source: 'quality-design-service:legacy-projection/v1' }),
      critiqueJson: canonicalContractJson([]),
      analysisHash,
      decisionRationale: 'Legacy requirement source projection is preserved as an approved analysis artifact.',
      decidedBy: 'appraisejs:legacy-quality-design-api',
      decidedAt: approvedAt,
      approvedAt,
      approvedBy: 'appraisejs:legacy-quality-design-api',
      approvalHash: hashCanonical({ analysisHash, approvedAt: approvedAt.toISOString() }),
    },
  })
  for (const [snapshotIndex, snapshot] of snapshots.entries()) {
    const obligation = obligations[snapshotIndex]!
    await transaction.qualityObligationRevision.create({
      data: {
        id: obligation.id,
        qualityPlanRevisionId,
        requirementAnalysisRevisionId: analysisId,
        requirementSnapshotId: snapshot.id,
        title: snapshot.requirement.externalRef ?? snapshot.requirement.id ?? `Requirement ${snapshot.index + 1}`,
        intent: snapshot.requirement.text,
        assertionScopeJson: JSON.stringify({ requirementSnapshotId: snapshot.id }),
        minimumAssurance: snapshot.requirement.minimumAssurance ?? 'STANDARD',
        limitations: snapshot.requirement.limitations,
        contentHash: hashCanonical({ analysisHash, obligation }),
      },
    })
  }
}

async function createBlockingRequirementQuery(transaction: PrismaLike, qualityPlanRevisionId: string) {
  await transaction.requirementQuery.create({
    data: {
      qualityPlanRevisionId,
      prompt: 'No explicit requirements were found in the submitted source specification.',
      status: 'BLOCKING',
    },
  })
}

type RequirementQueryAnswerInput = {
  queryId: string
  status: 'ANSWERED' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION'
  answer?: string
  rationale?: string
}

function assertAnswersBelongToRevision(revision: QualityRevisionRecord, answers: RequirementQueryAnswerInput[]) {
  const revisionQueryIds = new Set(revision.queries.map(query => query.id))
  if (answers.some(answer => !revisionQueryIds.has(answer.queryId)))
    throw new ServiceError('Requirement query does not belong to this Quality Plan revision.', 'CONFLICT')
}

async function findQueryAnswerSuccessor(client: PrismaLike, qualityPlanId: string, idempotencyKey: string) {
  return client.qualityPlanRevision.findFirst({
    where: { qualityPlanId, queryAnswerIdempotencyKey: idempotencyKey },
    include: {
      qualityPlan: { include: { targetProject: { select: { kind: true } } } },
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
    },
  })
}

function queryAnswerReplay(successor: QualityRevisionRecord, requestHash: string) {
  if (successor.queryAnswerRequestHash !== requestHash)
    throw new ServiceError('Requirement query idempotency key was reused with different answers.', 'CONFLICT')
  return { idempotent: true, ...revisionPayload(successor) }
}

async function createQueryAnswerSuccessor(input: {
  client: PrismaLike
  revision: QualityRevisionRecord
  answers: RequirementQueryAnswerInput[]
  idempotencyKey: string
  requestHash: string
}) {
  const successor = await input.client.$transaction(async transaction => {
    const created = await transaction.qualityPlanRevision.create({
      data: {
        targetProjectId: input.revision.targetProjectId,
        qualityPlanId: input.revision.qualityPlanId,
        revision: input.revision.revision + 1,
        status: 'DRAFT',
        contentHash: hashCanonical({
          predecessorContentHash: input.revision.contentHash,
          requestHash: input.requestHash,
        }),
        sourceSpecification: input.revision.sourceSpecification,
        requirementGraphJson: input.revision.requirementGraphJson,
        methodologyId: input.revision.methodologyId,
        methodologyVersion: input.revision.methodologyVersion,
        methodologyHash: input.revision.methodologyHash,
        predecessorRevisionId: input.revision.id,
        queryAnswerIdempotencyKey: input.idempotencyKey,
        queryAnswerRequestHash: input.requestHash,
      },
    })
    for (const snapshot of input.revision.requirementSnapshots) {
      await transaction.requirementSnapshot.create({
        data: {
          qualityPlanRevisionId: created.id,
          externalRef: snapshot.externalRef,
          text: snapshot.text,
          kind: snapshot.kind,
          contentHash: snapshot.contentHash,
        },
      })
    }
    const answers = new Map(input.answers.map(answer => [answer.queryId, answer]))
    for (const query of input.revision.queries) {
      const answer = answers.get(query.id)
      await transaction.requirementQuery.create({
        data: {
          qualityPlanRevisionId: created.id,
          prompt: query.prompt,
          status: answer?.status ?? query.status,
          answer: answer?.answer ?? query.answer,
          rationale: answer?.rationale ?? query.rationale,
        },
      })
    }
    await transaction.qualityPlanRevision.update({ where: { id: input.revision.id }, data: { status: 'SUPERSEDED' } })
    return readRevisionOrThrow(transaction, input.revision.qualityPlanId, created.id)
  })
  return { idempotent: false, predecessorRevisionId: input.revision.id, ...revisionPayload(successor) }
}

export async function readQualityRequirementGraph(
  input: { qualityPlanId: string; revisionId?: string },
  client: PrismaLike = qualityDb,
) {
  return revisionPayload(await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId))
}

export async function answerQualityRequirementQueries(
  input: {
    qualityPlanId: string
    revisionId?: string
    answers: RequirementQueryAnswerInput[]
    idempotencyKey: string
  },
  client: PrismaLike = qualityDb,
) {
  const orderedAnswers = [...input.answers].sort((left, right) => left.queryId.localeCompare(right.queryId))
  // An omitted revisionId selects the latest revision for a new command. An
  // idempotent retry instead remains bound to its immutable predecessor.
  const existingReplay = await findQueryAnswerSuccessor(client, input.qualityPlanId, input.idempotencyKey)
  if (existingReplay) {
    const requestHash = hashCanonical({
      predecessorRevisionId: input.revisionId ?? existingReplay.predecessorRevisionId,
      answers: orderedAnswers,
    })
    return queryAnswerReplay(existingReplay, requestHash)
  }
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  assertAnswersBelongToRevision(revision, input.answers)
  // A post-draft answer is a new requirements interpretation.  Do not mutate
  // an approved/reviewed revision (or any of its analysis/design descendants):
  // record the changed answers on a new, content-addressed successor instead.
  if (revision.status !== 'DRAFT') {
    const requestHash = hashCanonical({ predecessorRevisionId: revision.id, answers: orderedAnswers })
    const replay = await findQueryAnswerSuccessor(client, input.qualityPlanId, input.idempotencyKey)
    if (replay) return queryAnswerReplay(replay, requestHash)
    try {
      return await createQueryAnswerSuccessor({
        client,
        revision,
        answers: orderedAnswers,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      })
    } catch (error) {
      if (!uniqueConstraint(error)) throw error
      const raced = await findQueryAnswerSuccessor(client, input.qualityPlanId, input.idempotencyKey)
      if (!raced) throw error
      return queryAnswerReplay(raced, requestHash)
    }
  }
  await client.$transaction(
    input.answers.map(answer =>
      client.requirementQuery.update({
        where: { id: answer.queryId },
        data: { status: answer.status, answer: answer.answer, rationale: answer.rationale },
      }),
    ),
  )
  return readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: revision.id }, client)
}

export async function approveQualityRequirements(
  input: { qualityPlanId: string; revisionId: string; expectedRevisionHash: string; approvedBy: string },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  if (revision.contentHash !== input.expectedRevisionHash) {
    throw new ServiceError('Quality Plan revision hash is stale.', 'CONFLICT')
  }
  if (!canApproveRequirements(revision.queries)) {
    throw new ServiceError('Blocking requirement queries prevent Quality Plan revision approval.', 'CONFLICT')
  }
  const approved = await client.qualityPlanRevision.update({
    where: { id: revision.id },
    data: { status: 'REQUIREMENTS_APPROVED', approvedAt: new Date() },
    include: {
      qualityPlan: true,
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
    },
  })
  return {
    ...revisionPayload(approved),
    approvedBy: input.approvedBy,
    nextRecommendedAction: 'Call validation_design_propose to create obligation-linked scenarios for approval.',
  }
}

export async function proposeQualityValidationDesign(
  input: { qualityPlanId: string; revisionId: string; proposal: unknown; idempotencyKey: string },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  if (revision.status !== 'REQUIREMENTS_APPROVED' && revision.status !== 'SCENARIO_REVIEW') {
    throw new ServiceError('Requirement approval is required before scenario proposal.', 'CONFLICT')
  }
  const scenarios = parseScenarioProposals(input.proposal)
  assertScenariosCoverKnownObligations(revision, scenarios)
  await client.$transaction(async transaction => {
    const designRevision = await createLegacyValidationDesign(transaction, revision, scenarios)
    for (const scenario of scenarios) {
      const design = scenarioDesign(scenario)
      const canonicalHash = hashCanonical(design)
      const existing = await transaction.validationVersion.findFirst({
        where: { qualityPlanRevisionId: revision.id, canonicalHash },
      })
      if (existing) continue
      const validationVersion = await transaction.validationVersion.create({
        data: {
          targetProjectId: revision.targetProjectId,
          qualityPlanRevisionId: revision.id,
          validationDesignRevisionId: designRevision.id,
          validationIdentity: `${revision.id}:${scenario.id ?? canonicalHash}`,
          version: 1,
          status: 'DESIGNED',
          canonicalAstJson: JSON.stringify(design),
          canonicalHash,
        },
      })
      for (const obligationId of scenario.obligationIds) {
        await transaction.obligationValidationVersion.create({
          data: {
            qualityPlanRevisionId: revision.id,
            qualityObligationRevisionId: obligationId,
            validationVersionId: validationVersion.id,
            coverageIntentJson: JSON.stringify({ scenarioId: scenario.id, coverage: scenario.coverage ?? null }),
          },
        })
      }
    }
    await transaction.qualityPlanRevision.update({ where: { id: revision.id }, data: { status: 'SCENARIO_REVIEW' } })
  })
  return {
    ...(await readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: revision.id }, client)),
    nextRecommendedAction:
      'Review behavioral intent, assertions, coverage, required minimum assurance, matrix intent, and limitations, then call validation_design_approve.',
  }
}

export async function approveQualityValidationDesign(
  input: { qualityPlanId: string; revisionId: string; expectedDesignHash: string; approvedBy: string },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  if (revision.status !== 'SCENARIO_REVIEW') {
    throw new ServiceError('Scenario review is required before scenario approval.', 'CONFLICT')
  }
  const orderedVersions = [...revision.validationVersions].sort((left, right) =>
    left.canonicalHash.localeCompare(right.canonicalHash),
  )
  const designHash = hashCanonical(orderedVersions.map(version => JSON.parse(version.canonicalAstJson)))
  if (designHash !== input.expectedDesignHash) throw new ServiceError('Scenario design hash is stale.', 'CONFLICT')
  await client.$transaction(async transaction => {
    const approvedAt = new Date()
    for (const version of orderedVersions) {
      await transaction.validationVersion.update({
        where: { id: version.id },
        data: {
          status: 'SCENARIO_APPROVED',
          scenarioApprovedAt: approvedAt,
          scenarioApprovedBy: input.approvedBy,
          scenarioApprovalHash: designHash,
        },
      })
    }
    for (const designRevisionId of new Set(orderedVersions.map(version => version.validationDesignRevisionId))) {
      await transaction.validationDesignRevision.update({
        where: { id: designRevisionId },
        data: {
          status: 'APPROVED',
          decision: 'APPROVED',
          decisionRationale: 'Approved through the compatible quality-design API.',
          decidedBy: input.approvedBy,
          decidedAt: approvedAt,
          approvedAt,
          approvedBy: input.approvedBy,
          approvalHash: hashCanonical({
            designHash,
            approvedAt: approvedAt.toISOString(),
            approvedBy: input.approvedBy,
          }),
        },
      })
    }
    await transaction.qualityPlanRevision.update({ where: { id: revision.id }, data: { status: 'SCENARIOS_APPROVED' } })
  })
  return {
    ...(await readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: revision.id }, client)),
    approvedBy: input.approvedBy,
    designHash,
    nextRecommendedAction:
      'Use step_search, locator_search, and environment_list to resolve compact bindings, then call assessment_preflight.',
  }
}

function compileRealizationHash(validationVersionId: string, realization: unknown) {
  return hashCanonical({ validationVersionId, realization: realization ?? null })
}

function compilationHash(versions: QualityRevisionRecord['validationVersions']) {
  const realizedVersions = versions
    .filter(version => version.status === 'REALIZED' && version.realizationHash)
    .sort((left, right) => left.id.localeCompare(right.id))
  return hashCanonical(
    realizedVersions.map(version => ({
      id: version.id,
      canonicalHash: version.canonicalHash,
      realizationHash: version.realizationHash,
    })),
  )
}

function idsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false
  for (const value of left) if (!right.has(value)) return false
  return true
}

function matchingValidationCatalog(
  current: QualityRevisionRecord['validationVersions'],
  expected: QualityRevisionRecord['validationVersions'],
) {
  return (
    current.length === expected.length &&
    current.every(version => {
      const expectedVersion = expected.find(item => item.id === version.id)
      return (
        expectedVersion &&
        expectedVersion.canonicalHash === version.canonicalHash &&
        expectedVersion.canonicalAstJson === version.canonicalAstJson
      )
    })
  )
}

async function assertRemoteCompilationScopeCurrent(input: {
  binding?: RemoteScopePhaseBinding
  transaction: PrismaLike
  qualityPlanId: string
  revisionId: string
  expectedRevision: QualityRevisionRecord
  expectedDesignHash: string
}) {
  if (!input.binding) return
  await assertRemoteEvaluationScopeCurrent(input.binding, input.transaction as never)
  const current = await readRevisionOrThrow(input.transaction, input.qualityPlanId, input.revisionId)
  if (
    current.contentHash !== input.expectedRevision.contentHash ||
    revisionPayload(current).designHash !== input.expectedDesignHash ||
    !matchingValidationCatalog(current.validationVersions, input.expectedRevision.validationVersions)
  )
    throw new ServiceError('Remote evaluation scope has changed before realization.', 'CONFLICT', 409, {
      code: 'remote_evaluation_scope_stale',
    })
}

async function persistCompiledValidations(input: {
  transaction: PrismaLike
  revision: QualityRevisionRecord
  selectedVersions: QualityRevisionRecord['validationVersions']
  realizationByValidationId: Map<string, unknown>
  target: { id: string; fingerprint: string }
}) {
  for (const version of input.selectedVersions) {
    if (version.status !== 'SCENARIO_APPROVED' && version.status !== 'REALIZED')
      throw new ServiceError('Only approved scenario validation versions can be compiled.', 'CONFLICT')
    const realization = input.realizationByValidationId.get(version.id) ?? null
    const canonical = canonicalizeAndValidateQualityRealization({ realization, target: input.target })
    const normalizedRealization = canonical.realization
    const realizationHash = compileRealizationHash(version.id, normalizedRealization)
    await input.transaction.validationVersion.update({
      where: { id: version.id },
      data: {
        status: 'REALIZED',
        realizationJson: JSON.stringify(normalizedRealization),
        realizationHash,
        compilationHash: hashCanonical({
          validationVersionId: version.id,
          canonicalHash: version.canonicalHash,
          realizationHash,
        }),
      },
    })
  }
  // A partition may realize only one immutable member set. The revision-level
  // status remains an all-approved aggregate until every version is realized.
  if (input.selectedVersions.length === input.revision.validationVersions.length)
    await input.transaction.qualityPlanRevision.update({
      where: { id: input.revision.id },
      data: { status: 'REALIZED' },
    })
}

async function persistedPartitionValidationIds(binding?: RemoteScopePhaseBinding, client: PrismaLike = qualityDb) {
  if (!binding) return undefined
  const remoteScopeModule = await import('@/services/coordinator/remote-evaluation-scope-service')
  if (!('remoteScopePartitionAuthorityForSubject' in remoteScopeModule)) return undefined
  const authority = await remoteScopeModule.remoteScopePartitionAuthorityForSubject(
    { subjectRevisionId: binding.subjectRevisionId },
    client as never,
  )
  return authority.kind === 'persisted-partition-manifest' ? authority.validationVersionIds : undefined
}

function selectedValidationVersions(
  versions: QualityRevisionRecord['validationVersions'],
  partitionValidationIds?: readonly string[],
) {
  if (!partitionValidationIds) return versions
  const selected = versions.filter(version => partitionValidationIds.includes(version.id))
  if (selected.length !== partitionValidationIds.length)
    throw new ServiceError('REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION', 'CONFLICT', 409, {
      code: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION',
    })
  return selected
}

export async function compileQualityValidations(
  input: {
    qualityPlanId: string
    revisionId: string
    expectedDesignHash: string
    realization: unknown
    remoteScopeBinding?: RemoteScopePhaseBinding
  },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  if (revision.status !== 'SCENARIOS_APPROVED' && revision.status !== 'REALIZED') {
    throw new ServiceError('Scenario approval is required before validation compilation.', 'CONFLICT')
  }
  if (!revision.validationVersions.length) {
    throw new ServiceError('No approved scenario designs are available for compilation.', 'CONFLICT')
  }
  const currentDesignHash = revisionPayload(revision).designHash
  if (currentDesignHash !== input.expectedDesignHash) {
    throw new ServiceError('Scenario design hash is stale.', 'CONFLICT')
  }
  const target = await resolveTargetProject(revision.targetProjectId)
  const partitionValidationIds = await persistedPartitionValidationIds(input.remoteScopeBinding, client)
  const selectedVersions = selectedValidationVersions(revision.validationVersions, partitionValidationIds)
  const realizationByValidationId = parseRealization(input.realization, selectedVersions)
  await client.$transaction(async transaction => {
    await assertRemoteCompilationScopeCurrent({
      binding: input.remoteScopeBinding,
      transaction,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedRevision: revision,
      expectedDesignHash: currentDesignHash,
    })
    await persistCompiledValidations({ transaction, revision, selectedVersions, realizationByValidationId, target })
  })
  const realized = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  return {
    ...revisionPayload(realized),
    compilationHash: compilationHash(selectedValidationVersions(realized.validationVersions, partitionValidationIds)),
    validationVersions: selectedValidationVersions(realized.validationVersions, partitionValidationIds),
    nextRecommendedAction:
      'Resume assessment_prepare_run with the same idempotency key to publish the server-derived runtime realization.',
  }
}

function parseRealization(realization: unknown, versions: QualityRevisionRecord['validationVersions']) {
  if (realization === undefined || realization === null) {
    throw new ServiceError('Validation compilation requires realization input.', 'VALIDATION')
  }
  if (typeof realization === 'object' && !Array.isArray(realization)) {
    const value = realization as { validations?: unknown; default?: unknown }
    if (Array.isArray(value.validations)) return parseExplicitRealizations(value.validations, versions)
    if (value.default !== undefined) return realizationForEveryVersion(value.default, versions)
  }
  return realizationForEveryVersion(realization, versions)
}

function parseExplicitRealizations(items: unknown[], versions: QualityRevisionRecord['validationVersions']) {
  const byValidationId = new Map<string, unknown>()
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as { validationVersionId?: unknown; realization?: unknown }
    if (typeof record.validationVersionId === 'string' && record.realization !== undefined) {
      if (byValidationId.has(record.validationVersionId))
        throw new ServiceError('Duplicate explicit validation realization is not allowed.', 'VALIDATION', 400, {
          code: 'duplicate_validation_version_id',
          duplicateIndex: index,
        })
      byValidationId.set(record.validationVersionId, record.realization)
    }
  }
  const expectedIds = new Set(versions.map(version => version.id))
  if (!idsEqual(new Set(byValidationId.keys()), expectedIds)) {
    throw new ServiceError('Validation realization must cover every validation version exactly once.', 'VALIDATION')
  }
  return byValidationId
}

function realizationForEveryVersion(realization: unknown, versions: QualityRevisionRecord['validationVersions']) {
  return new Map(versions.map(version => [version.id, realization]))
}

function assertExpectedPublicationCatalog(
  current: QualityRevisionRecord,
  expectedRevision: QualityRevisionRecord,
  expectedCompilationHash: string,
  partitionValidationIds?: readonly string[],
) {
  if (
    current.contentHash === expectedRevision.contentHash &&
    compilationHash(selectedValidationVersions(current.validationVersions, partitionValidationIds)) ===
      expectedCompilationHash
  )
    return
  throw new ServiceError('Remote evaluation scope has changed before publication status update.', 'CONFLICT', 409, {
    code: 'remote_evaluation_scope_stale',
  })
}

function assertSelectedPublicationsCurrent(
  versions: QualityRevisionRecord['validationVersions'],
  selectedVersions: QualityRevisionRecord['validationVersions'],
) {
  for (const expected of selectedVersions) {
    const actual = versions.find(version => version.id === expected.id)
    if (
      !actual ||
      actual.canonicalHash !== expected.canonicalHash ||
      actual.canonicalAstJson !== expected.canonicalAstJson ||
      actual.realizationHash !== expected.realizationHash ||
      !actual.activeGeneration ||
      actual.activeGeneration.disposition !== 'ACTIVE' ||
      !actual.activeGeneration.publication
    )
      throw new ServiceError('Remote evaluation scope publication is stale before status update.', 'CONFLICT', 409, {
        code: 'remote_evaluation_scope_stale',
      })
  }
}

async function assertRemotePublicationFinalizationCurrent(input: {
  binding?: RemoteScopePhaseBinding
  transaction: PrismaLike
  qualityPlanId: string
  revisionId: string
  expectedRevision: QualityRevisionRecord
  expectedCompilationHash: string
  selectedVersions: QualityRevisionRecord['validationVersions']
  partitionValidationIds?: readonly string[]
}) {
  if (!input.binding) return
  await assertRemoteEvaluationScopeCurrent(input.binding, input.transaction as never)
  const current = await readRevisionOrThrow(input.transaction, input.qualityPlanId, input.revisionId)
  assertExpectedPublicationCatalog(
    current,
    input.expectedRevision,
    input.expectedCompilationHash,
    input.partitionValidationIds,
  )
  assertSelectedPublicationsCurrent(current.validationVersions, input.selectedVersions)
}

async function markValidationVersionsPublished(
  transaction: PrismaLike,
  selectedVersions: QualityRevisionRecord['validationVersions'],
) {
  await Promise.all(
    selectedVersions.map(version =>
      transaction.validationVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
    ),
  )
}

export async function publishQualityValidations(
  input: {
    qualityPlanId: string
    revisionId: string
    validationVersionIds: string[]
    expectedCompilationHash: string
    remoteScopeBinding?: RemoteScopePhaseBinding
  },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  if (new Set(input.validationVersionIds).size !== input.validationVersionIds.length)
    throw new ServiceError('Duplicate validation publication identifier is not allowed.', 'VALIDATION', 400, {
      code: 'duplicate_validation_version_id',
    })
  const requestedIds = new Set(input.validationVersionIds)
  if (!requestedIds.size) throw new ServiceError('Validation publication requires validationVersionIds.', 'VALIDATION')
  const selectedVersions = revision.validationVersions.filter(version => requestedIds.has(version.id))
  if (selectedVersions.length !== requestedIds.size) {
    throw new ServiceError('Validation publication references unknown validation versions.', 'CONFLICT')
  }
  const partitionValidationIds = await persistedPartitionValidationIds(input.remoteScopeBinding, client)
  const authorityVersions = selectedValidationVersions(revision.validationVersions, partitionValidationIds)
  const authorityIds = new Set(authorityVersions.map(version => version.id))
  if (partitionValidationIds && !idsEqual(requestedIds, authorityIds))
    throw new ServiceError('REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION', 'CONFLICT', 409, {
      code: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION',
    })
  const realizedVersions = authorityVersions.filter(version => version.status === 'REALIZED' && version.realizationHash)
  if (!idsEqual(requestedIds, new Set(realizedVersions.map(version => version.id)))) {
    throw new ServiceError('Validation publication must include the full realized validation set.', 'CONFLICT')
  }
  if (authorityVersions.some(version => version.status !== 'REALIZED' || !version.realizationHash)) {
    throw new ServiceError('Validation publication requires realized validation versions.', 'CONFLICT')
  }
  const revisionCompilationHash = compilationHash(authorityVersions)
  if (revisionCompilationHash !== input.expectedCompilationHash) {
    throw new ServiceError('Validation compilation hash is stale.', 'CONFLICT')
  }
  const target = await resolveTargetProject(revision.targetProjectId)
  for (const version of selectedVersions) {
    if (input.remoteScopeBinding) {
      await assertRemoteEvaluationScopeCurrent(input.remoteScopeBinding)
    }
    const canonical = canonicalizeAndValidateQualityRealization({
      realization: JSON.parse(version.realizationJson ?? 'null'),
      target,
    })
    const envelope = canonical.envelope
    const runtime = canonical.runtimeInput
    const requiredHashes = ['astId', 'astHash', 'contextHash', 'previewHash', 'receiptHash'] as const
    if (requiredHashes.some(key => typeof runtime[key] !== 'string'))
      throw new ServiceError('Quality runtime publication input is missing immutable compiler hashes.', 'VALIDATION')
    await publishQualityValidationRuntime(
      {
        targetProjectId: revision.targetProjectId,
        targetFingerprint: target.fingerprint,
        qualityPlanRevisionId: revision.id,
        validationVersionId: version.id,
        idempotencyKey: envelope.idempotencyKey,
        expectedRevisionHash: revision.contentHash,
        validationHash: version.canonicalHash,
        validationContent: version.canonicalAstJson,
        expectedRealizationHash: version.realizationHash ?? null,
        reviewContent: envelope.reviewContent ?? canonicalContractJson(envelope.validationProjection),
        astId: runtime.astId as string,
        astHash: runtime.astHash as string,
        contextHash: runtime.contextHash as string,
        previewHash: runtime.previewHash as string,
        receiptHash: runtime.receiptHash as string,
        projection: envelope.projection,
        validationProjection: envelope.validationProjection,
        runtimeInput: runtime,
        extensionReviews: envelope.extensionReviews ?? [],
        remoteScopeBinding: input.remoteScopeBinding,
      },
      client as unknown as import('@prisma/client').PrismaClient,
    )
  }
  await client.$transaction(async transaction => {
    await assertRemotePublicationFinalizationCurrent({
      binding: input.remoteScopeBinding,
      transaction,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      expectedRevision: revision,
      expectedCompilationHash: revisionCompilationHash,
      selectedVersions,
      partitionValidationIds,
    })
    await markValidationVersionsPublished(transaction, selectedVersions)
  })
  return {
    ...(await readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: revision.id }, client)),
    compilationHash: revisionCompilationHash,
    nextRecommendedAction: 'Create an assessment for an immutable subject digest, then run approved validations.',
  }
}

function subjectDescriptorRecord(subject: unknown) {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    throw new ServiceError('Assessment subject must be an immutable subject descriptor.', 'VALIDATION')
  }
  return subject as Record<string, unknown>
}

function digestSubjectDescriptor(value: Record<string, unknown>): EvaluationSubjectInput {
  const subjectDigest = typeof value.subjectDigest === 'string' ? value.subjectDigest.trim() : ''
  const authority = typeof value.authority === 'string' ? value.authority.trim() : ''
  if (!subjectDigest.startsWith('sha256:'))
    throw new ServiceError('Assessment subjectDigest must be a sha256 digest.', 'VALIDATION')
  if (!authority) throw new ServiceError('Assessment subject authority is required.', 'VALIDATION')
  return {
    subjectDigest,
    subjectKind: value.subjectKind === 'DEPLOYMENT_SNAPSHOT' ? 'DEPLOYMENT_SNAPSHOT' : 'ARTIFACT',
    authority,
    metadata: value.metadata,
  }
}

function parseEvaluationSubject(subject: unknown): EvaluationSubjectInput {
  const value = subjectDescriptorRecord(subject)
  const remote = parseRemoteSubjectReference(value)
  if (remote) return remote
  return digestSubjectDescriptor(value)
}

function canonicalSubjectMetadata(metadata: unknown): string | null {
  return metadata === undefined ? null : canonicalContractJson(metadata)
}

function subjectRevisionMatches(
  existing: { subjectKind: string; authority: string; metadataJson: string | null },
  requested: EvaluationSubjectInput,
) {
  if (!requested.subjectDigest || !requested.authority) return false
  if (existing.subjectKind !== requested.subjectKind || existing.authority !== requested.authority) return false
  const expectedMetadata = canonicalSubjectMetadata(requested.metadata)
  if (existing.metadataJson === null || expectedMetadata === null) return existing.metadataJson === expectedMetadata
  try {
    return canonicalContractJson(JSON.parse(existing.metadataJson)) === expectedMetadata
  } catch {
    return false
  }
}

type AssessmentSuccessorDisposition = {
  code: string
  rationale: string
  retryReason?: string
}

function requiredDispositionText(value: Record<string, unknown>, key: 'code' | 'rationale') {
  const text = typeof value[key] === 'string' ? value[key].trim() : ''
  if (!text) throw new ServiceError('Assessment successor disposition requires code and rationale.', 'VALIDATION')
  return text
}

function optionalDispositionText(value: Record<string, unknown>, key: 'retryReason') {
  const text = typeof value[key] === 'string' ? value[key].trim() : ''
  return text || undefined
}

function parseAssessmentSuccessorDisposition(value: unknown): AssessmentSuccessorDisposition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ServiceError('Assessment successor disposition must be a structured object.', 'VALIDATION')
  const source = value as Record<string, unknown>
  const retryReason = optionalDispositionText(source, 'retryReason')
  return {
    code: requiredDispositionText(source, 'code'),
    rationale: requiredDispositionText(source, 'rationale'),
    ...(retryReason ? { retryReason } : {}),
  }
}

async function readAssessmentOrThrow(client: PrismaLike, assessmentId: string) {
  const assessment = await client.assessment.findFirst({
    where: { id: assessmentId },
    include: {
      evaluationSubjectRevision: {
        include: { remoteEvaluationScopeBinding: { include: { partitionMembership: true } } },
      },
      targetProject: { select: { kind: true } },
      qualityPlan: true,
      qualityPlanRevision: {
        include: {
          qualityPlan: { include: { targetProject: { select: { kind: true } } } },
          requirementSnapshots: true,
          obligations: true,
          queries: true,
          validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
        },
      },
      baselineAssessment: { include: { evidenceReceipts: true, decisions: true } },
      evidenceReceipts: true,
      findings: true,
      decisions: true,
      runs: {
        include: {
          bindings: {
            include: {
              testRun: {
                include: {
                  environment: { select: { id: true } },
                  targetProject: { select: { kind: true } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!assessment) throw new ServiceError('Assessment not found.', 'NOT_FOUND')
  return assessment
}

function assessmentEvidenceSetHash(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  const activeGenerations = executableGenerationByValidation(assessment)
  return hashCanonical({
    assessmentId: assessment.id,
    evidenceReceipts: currentAssessmentEvidenceReceipts(assessment, activeGenerations).map(receipt => {
      const value = receipt as Record<string, unknown>
      return {
        receiptHash: value.receiptHash,
        validationVersionId: value.validationVersionId,
        resultMatrixCell: value.resultMatrixCell,
        outcome: value.outcome,
        runtimeInputHash: value.runtimeInputHash,
        generationId: value.generationId,
        publicationId: value.publicationId,
        publicationOperationHash: value.publicationOperationHash,
      }
    }),
    validationVersions: assessment.qualityPlanRevision.validationVersions.map(version => ({
      id: version.id,
      canonicalHash: version.canonicalHash,
      generation: activeGenerations.get(version.id) ?? null,
    })),
  })
}

function evidenceReceiptPayload(receipt: unknown) {
  const value = receipt as Record<string, unknown>
  const text = (key: string) => (typeof value[key] === 'string' ? value[key] : null)
  return {
    id: text('id'),
    validationVersionId: text('validationVersionId'),
    resultMatrixCell: text('resultMatrixCell'),
    assuranceLevel: text('assuranceLevel'),
    outcome: text('outcome'),
    runtimeInputHash: text('runtimeInputHash'),
    environmentSnapshotHash: text('environmentSnapshotHash'),
    browserSnapshotHash: text('browserSnapshotHash'),
    dataProvenanceHash: text('dataProvenanceHash'),
    outputHash: text('outputHash'),
    reportHash: text('reportHash'),
    logHash: text('logHash'),
    traceHash: text('traceHash'),
    generationId: text('generationId'),
    publicationId: text('publicationId'),
    publicationOperationHash: text('publicationOperationHash'),
    publicationAuthority: text('publicationAuthority'),
    receiptHash: text('receiptHash'),
    sealedAt: value.sealedAt instanceof Date ? value.sealedAt : null,
  }
}

function receiptMatrixKey(receipt: Record<string, unknown>) {
  const version = typeof receipt.validationVersionId === 'string' ? receipt.validationVersionId : null
  const cell = typeof receipt.resultMatrixCell === 'string' ? receipt.resultMatrixCell : null
  const generationId = typeof receipt.generationId === 'string' ? receipt.generationId : null
  const publicationId = typeof receipt.publicationId === 'string' ? receipt.publicationId : null
  const publicationOperationHash =
    typeof receipt.publicationOperationHash === 'string' ? receipt.publicationOperationHash : null
  return version && cell && generationId && publicationId && publicationOperationHash
    ? `${version}:${generationId}:${publicationId}:${publicationOperationHash}:${cell}`
    : String(receipt.id ?? JSON.stringify(receipt))
}

function receiptSealedAt(receipt: Record<string, unknown>) {
  return receipt.sealedAt instanceof Date ? receipt.sealedAt.getTime() : 0
}

function currentMatrixReceipts(receipts: unknown[]) {
  const latestByCell = new Map<string, Record<string, unknown>>()
  for (const receipt of receipts) {
    const value = receipt as Record<string, unknown>
    const current = latestByCell.get(receiptMatrixKey(value))
    if (!current || receiptSealedAt(value) >= receiptSealedAt(current)) latestByCell.set(receiptMatrixKey(value), value)
  }
  return [...latestByCell.values()]
}

type ExecutableGeneration = {
  generationId: string
  publicationId: string
  publicationOperationHash: string
}

function executableGenerationByValidation(assessment: AssessmentRecord) {
  return new Map(
    assessment.qualityPlanRevision.validationVersions.flatMap(version => {
      if (!hasSupportedActiveGeneration(version, assessment.targetProject.kind)) return []
      const generation = version.activeGeneration!
      const publication = generation.publication!
      return [
        [
          version.id,
          {
            generationId: generation.id,
            publicationId: publication.id,
            publicationOperationHash: publication.operationHash,
          } satisfies ExecutableGeneration,
        ] as const,
      ]
    }),
  )
}

function receiptMatchesExecutableGeneration(
  receipt: Record<string, unknown>,
  expected: ExecutableGeneration | undefined,
) {
  return Boolean(
    expected &&
    receipt.generationId === expected.generationId &&
    receipt.publicationId === expected.publicationId &&
    receipt.publicationOperationHash === expected.publicationOperationHash,
  )
}

function currentAssessmentEvidenceReceipts(
  assessment: AssessmentRecord,
  activeGenerations = executableGenerationByValidation(assessment),
) {
  return currentMatrixReceipts(assessment.evidenceReceipts).filter(receipt => {
    const validationVersionId =
      typeof receipt.validationVersionId === 'string' ? receipt.validationVersionId : undefined
    return receiptMatchesExecutableGeneration(
      receipt,
      validationVersionId ? activeGenerations.get(validationVersionId) : undefined,
    )
  })
}

/** A remote packet-integrity rejection terminalizes a matrix cell without an
 * EvidenceReceipt. Keep that explicit at review: it is a target outcome of
 * not_evaluated, not merely an assessment that has not started yet. */
function hasPacketIntegrityInconclusive(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  if (assessment.targetProject.kind !== 'REMOTE_BLACK_BOX') return false
  return assessment.runs.some(run =>
    run.bindings.some(binding => {
      if (binding.evidenceReceiptId || binding.terminalOutcome !== 'INCONCLUSIVE') return false
      if (binding.testRun.targetProject.kind !== 'REMOTE_BLACK_BOX') return false
      try {
        frozenEnvironmentSnapshot(binding.testRun, { required: true })
        return false
      } catch {
        return true
      }
    }),
  )
}

/** A managed capsule may be internally hash-consistent yet name a different
 * publication tuple. Reconciliation records this specific integrity boundary
 * on the binding, allowing both local and remote read models to distinguish
 * it from ordinary unsealed infrastructure/target outcomes. */
function hasManagedCapsuleIntegrityInconclusive(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  return assessment.runs.some(run =>
    run.bindings.some(
      binding =>
        !binding.evidenceReceiptId &&
        binding.terminalOutcome === 'INCONCLUSIVE' &&
        binding.integrityRejectionCode === 'managed_capsule_integrity',
    ),
  )
}

type AssessmentRecord = Awaited<ReturnType<typeof readAssessmentOrThrow>>

function assessmentPartitionValidationIds(assessment: AssessmentRecord) {
  const membership = assessment.evaluationSubjectRevision.remoteEvaluationScopeBinding?.partitionMembership
  if (!membership) return undefined
  try {
    const ids = JSON.parse(membership.validationVersionIdsJson)
    return Array.isArray(ids) && ids.length && ids.every(id => typeof id === 'string') ? ids : undefined
  } catch {
    return undefined
  }
}

function assessmentReadiness(assessment: AssessmentRecord) {
  const partitionValidationIds = assessmentPartitionValidationIds(assessment)
  const validationVersions = partitionValidationIds
    ? assessment.qualityPlanRevision.validationVersions.filter(version => partitionValidationIds.includes(version.id))
    : assessment.qualityPlanRevision.validationVersions
  const activeGenerations = executableGenerationByValidation(assessment)
  const executable = validationVersions.filter(version => activeGenerations.has(version.id))
  const blockers = [
    ...(assessment.qualityPlanRevision.status === 'SCENARIOS_APPROVED' ||
    assessment.qualityPlanRevision.status === 'REALIZED'
      ? []
      : ['Quality Plan revision must have approved scenarios before assessment readiness.']),
    ...(executable.length && executable.length === validationVersions.length
      ? []
      : ['All validation versions must have an active executable generation for this assessment.']),
    ...(assessment.alignment === 'CURRENT' ? [] : ['Requirement alignment is not current.']),
  ]
  return { blockers, executable, activeGenerations }
}

function assessmentRuntimeCells(published: AssessmentRecord['qualityPlanRevision']['validationVersions']) {
  return published.flatMap(version => {
    const runtimeInput = version.activeGeneration?.publication?.runtimeInputJson
      ? (JSON.parse(version.activeGeneration.publication.runtimeInputJson) as {
          matrix?: Array<{ browser: string; environment: string }>
        })
      : null
    return (runtimeInput?.matrix ?? []).map(cell => ({
      validationVersionId: version.id,
      resultMatrixCell: `${cell.browser.toUpperCase()}:${cell.environment}`,
      environmentId: cell.environment,
      browserEngine: cell.browser.toUpperCase(),
    }))
  })
}

function assessmentSubjectPayload(subject: AssessmentRecord['evaluationSubjectRevision']) {
  return {
    id: subject.id,
    subjectDigest: subject.subjectDigest,
    subjectKind: subject.subjectKind,
    authority: subject.authority,
    metadata: subject.metadataJson ? JSON.parse(subject.metadataJson) : null,
    ...(subject.subjectKind === 'REMOTE_EVALUATION_SCOPE'
      ? { targetContentIdentity: 'not_asserted' as const, identityStrength: 'evaluation_scope_only' as const }
      : {}),
  }
}

function assessmentBaselinePayload(assessment: AssessmentRecord) {
  if (!assessment.baselineAssessment) return null
  const baseline = assessment.baselineAssessment
  return {
    assessmentId: baseline.id,
    status: baseline.status,
    evidenceReceiptCount: baseline.evidenceReceipts.length,
    decision: baseline.decisions[0]?.decision ?? null,
  }
}

function latestAssessmentRun(assessment: AssessmentRecord) {
  return [...assessment.runs].sort(
    (left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0),
  )[0]
}

function assessmentRunPayload(assessment: AssessmentRecord) {
  const run = latestAssessmentRun(assessment)
  if (!run) return null
  return {
    id: run.id,
    status: run.status,
    stopReason: run.stopReason,
    testRuns: run.bindings.map(binding => ({
      id: binding.testRun.id,
      status: binding.testRun.status,
      result: binding.testRun.result,
      evidenceHealth: binding.testRun.evidenceHealth,
      terminalOutcome: binding.terminalOutcome,
      evidenceReceiptId: binding.evidenceReceiptId,
    })),
  }
}

function assessmentExecutionNextAction(assessment: AssessmentRecord, evidenceReceiptCount: number) {
  if (evidenceReceiptCount > 0) return undefined
  const run = latestAssessmentRun(assessment)
  if (!run) return undefined
  if (!run.bindings.length && (run.status === 'STOPPED' || run.status === 'COMPLETED'))
    return 'Call assessment_create_successor for this immutable predecessor, then prepare the returned successor with a new idempotency key and consent; the latest AssessmentRun stopped before any TestRun binding.'
  if (!run.bindings.length) return undefined
  const terminal = run.bindings.every(
    binding =>
      Boolean(binding.terminalizedAt || binding.evidenceReceiptId) &&
      ['COMPLETED', 'CANCELLED'].includes(binding.testRun.status ?? ''),
  )
  if (terminal)
    return 'Call assessment_create_successor for this immutable predecessor, then prepare the returned successor with a new idempotency key and consent; the latest AssessmentRun has terminal TestRun history.'
  return 'Call assessment_reconcile for the latest AssessmentRun before attempting another preparation or execution.'
}

function assessmentPayload(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  const { blockers, executable, activeGenerations } = assessmentReadiness(assessment)
  const currentEvidenceReceipts = currentAssessmentEvidenceReceipts(assessment, activeGenerations)
  const humanVerificationBlocked = currentEvidenceReceipts.some(
    receipt => (receipt as { outcome?: unknown }).outcome === 'BLOCKED',
  )
  const packetIntegrityInconclusive = hasPacketIntegrityInconclusive(assessment)
  const managedCapsuleIntegrityInconclusive = hasManagedCapsuleIntegrityInconclusive(assessment)
  const retiredPreflightWithoutEvidence =
    assessment.status === 'STALE' &&
    assessment.evaluationSubjectRevision.subjectKind === 'REMOTE_EVALUATION_SCOPE' &&
    assessment.evaluationSubjectRevision.authority === 'appraisejs:remote-evaluation-scope:v1' &&
    assessment.evidenceReceipts.length === 0
  return {
    assessment: {
      id: assessment.id,
      status: assessment.status,
      alignment: assessment.alignment,
      observedAssurance: assessment.observedAssurance,
      baselineAssessmentId: assessment.baselineAssessmentId,
      lineageId: assessment.lineageId,
      generation: assessment.generation,
      supersedesAssessmentId: assessment.supersedesAssessmentId,
      supersessionDisposition: assessment.supersessionDispositionJson
        ? JSON.parse(assessment.supersessionDispositionJson)
        : null,
    },
    targetOutcome:
      humanVerificationBlocked ||
      packetIntegrityInconclusive ||
      managedCapsuleIntegrityInconclusive ||
      retiredPreflightWithoutEvidence
        ? ('not_evaluated' as const)
        : null,
    qualityPlan: {
      id: assessment.qualityPlan.id,
      targetProjectId: assessment.qualityPlan.targetProjectId,
      title: assessment.qualityPlan.title,
      description: assessment.qualityPlan.description,
    },
    revision: revisionPayload(assessment.qualityPlanRevision),
    subject: assessmentSubjectPayload(assessment.evaluationSubjectRevision),
    readiness: {
      ready: blockers.length === 0,
      blockers,
      publishedValidationVersionIds: executable.map(version => version.id),
      runtimeCells: assessmentRuntimeCells(executable),
    },
    evidenceReceiptCount: currentEvidenceReceipts.length,
    evidenceReceipts: currentEvidenceReceipts.map(evidenceReceiptPayload),
    historicalEvidenceReceiptCount: assessment.evidenceReceipts.length - currentEvidenceReceipts.length,
    findings: assessment.findings,
    evidenceSetHash: assessmentEvidenceSetHash(assessment),
    baseline: assessmentBaselinePayload(assessment),
    assessmentRun: assessmentRunPayload(assessment),
    decisions: assessment.decisions,
    nextRecommendedAction:
      assessmentExecutionNextAction(assessment, currentEvidenceReceipts.length) ??
      assessmentNextAction(blockers.length, assessment.status, currentEvidenceReceipts.length),
  }
}

function assessmentNextAction(blockerCount: number, status: string, evidenceReceiptCount: number) {
  if (blockerCount > 0) return 'Resolve assessment readiness blockers before assessment_run or assessment_decide.'
  if (status === 'DECIDED')
    return 'Assessment is decided. Create a successor only when a new immutable evaluation is required.'
  if (status === 'EVIDENCE_REVIEW' && evidenceReceiptCount > 0)
    return 'Review the sealed evidence, then call assessment_decide with the exact evidence set hash.'
  return 'Call assessment_run to collect sealed evidence, then assessment_review and assessment_decide.'
}

function assertAssessmentDecisionReady(payload: ReturnType<typeof assessmentPayload>) {
  if (payload.targetOutcome === 'not_evaluated')
    throw new ServiceError(
      'Managed execution has no valid packet-bound target outcome; the target remains not evaluated. Start a fresh TestRun after the integrity boundary is restored.',
      'CONFLICT',
    )
  if (!payload.readiness.ready) {
    throw new ServiceError('Assessment is not ready for a decision.', 'CONFLICT', 409, {
      blockers: payload.readiness.blockers,
    })
  }
  if (payload.evidenceReceiptCount === 0) {
    throw new ServiceError('Assessment decisions require sealed evidence receipts.', 'CONFLICT')
  }
  if (payload.decisions.length) {
    throw new ServiceError('Assessment already has a decision.', 'CONFLICT')
  }
  if (payload.assessment.status !== 'EVIDENCE_REVIEW') {
    throw new ServiceError('Assessment decisions require evidence review.', 'CONFLICT')
  }
}

type RemoteAssessmentSubject = Awaited<ReturnType<typeof resolveRemoteEvaluationScopeSubject>> | null
type AssessmentCreateRequest = {
  qualityPlanId: string
  revisionId: string
  subject: unknown
  baselineAssessmentId?: string
  idempotencyKey: string
}

async function assertRemoteAssessmentScopeCurrent(input: {
  remoteSubject: RemoteAssessmentSubject
  revision: QualityRevisionRecord
  qualityPlanId: string
  transaction?: PrismaLike
}) {
  if (!input.remoteSubject) return
  await assertRemoteEvaluationScopeCurrent(
    {
      subjectRevisionId: input.remoteSubject.subject.id,
      targetProjectId: input.revision.targetProjectId,
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revision.id,
      environmentId: input.remoteSubject.binding.environmentId,
    },
    input.transaction as never,
  )
}

async function rootAssessmentReplay(
  transaction: PrismaLike,
  targetProjectId: string,
  idempotencyKey: string,
  requestHash: string,
) {
  const replay = await transaction.assessment.findFirst({
    where: { targetProjectId, rootIdempotencyKey: idempotencyKey },
    include: assessmentDetailInclude,
  })
  if (!replay) return null
  if (replay.rootRequestHash !== requestHash)
    throw new ServiceError('Assessment idempotency key has different canonical input.', 'CONFLICT')
  return replay
}

async function rootAssessmentSubjectRevision(input: {
  transaction: PrismaLike
  remoteSubject: RemoteAssessmentSubject
  subject: EvaluationSubjectInput
}) {
  const existing = await input.transaction.evaluationSubjectRevision.findFirst({
    where: input.remoteSubject
      ? { id: input.remoteSubject.subject.id }
      : { subjectDigest: input.subject.subjectDigest },
  })
  const subjectRevision =
    existing ??
    (await input.transaction.evaluationSubjectRevision.create({
      data: {
        subjectDigest: input.subject.subjectDigest!,
        subjectKind: input.subject.subjectKind,
        authority: input.subject.authority!,
        metadataJson: input.subject.metadata === undefined ? null : JSON.stringify(input.subject.metadata),
      },
    }))
  if (input.remoteSubject && subjectRevision.id !== input.remoteSubject.subject.id)
    throw new ServiceError('Remote evaluation scope subject is not available in this transaction.', 'CONFLICT')
  return subjectRevision
}

async function assertRootAssessmentScopeAvailable(input: {
  transaction: PrismaLike
  revision: QualityRevisionRecord
  subjectRevisionId: string
}) {
  const rootScopeReservationHash = hashCanonical({
    schemaVersion: 'assessment-root-scope/v1',
    targetProjectId: input.revision.targetProjectId,
    qualityPlanRevisionId: input.revision.id,
    evaluationSubjectRevisionId: input.subjectRevisionId,
  })
  const existing = await input.transaction.assessment.findFirst({
    where: {
      targetProjectId: input.revision.targetProjectId,
      OR: [
        { rootScopeReservationHash },
        {
          qualityPlanRevisionId: input.revision.id,
          evaluationSubjectRevisionId: input.subjectRevisionId,
          supersedesAssessmentId: null,
        },
      ],
    },
    include: assessmentDetailInclude,
  })
  if (existing)
    throw new ServiceError(
      existing.status === 'DECIDED' || ['STALE', 'CANCELLED'].includes(existing.status)
        ? 'Assessment scope is terminal; use assessment_create_successor.'
        : 'Assessment scope already has an active Assessment.',
      'CONFLICT',
      409,
      { code: 'assessment_scope_reserved', assessmentId: existing.id },
    )
  return rootScopeReservationHash
}

async function createRootAssessmentInTransaction(input: {
  transaction: PrismaLike
  request: AssessmentCreateRequest
  revision: QualityRevisionRecord
  subject: EvaluationSubjectInput
  remoteSubject: RemoteAssessmentSubject
  requestHash: string
  rootAssessmentId: string
}) {
  const { remoteSubject, request, requestHash, revision, rootAssessmentId, subject, transaction } = input
  await assertRemoteAssessmentScopeCurrent({
    remoteSubject,
    revision,
    qualityPlanId: request.qualityPlanId,
    transaction,
  })
  const replay = await rootAssessmentReplay(transaction, revision.targetProjectId, request.idempotencyKey, requestHash)
  if (replay) return replay
  const subjectRevision = await rootAssessmentSubjectRevision({ transaction, remoteSubject, subject })
  const rootScopeReservationHash = await assertRootAssessmentScopeAvailable({
    transaction,
    revision,
    subjectRevisionId: subjectRevision.id,
  })
  return transaction.assessment.create({
    data: {
      id: rootAssessmentId,
      targetProjectId: revision.targetProjectId,
      qualityPlanId: request.qualityPlanId,
      qualityPlanRevisionId: revision.id,
      evaluationSubjectRevisionId: subjectRevision.id,
      baselineAssessmentId: request.baselineAssessmentId,
      lineageId: rootAssessmentId,
      rootIdempotencyKey: request.idempotencyKey,
      rootRequestHash: requestHash,
      rootScopeReservationHash,
    },
    include: assessmentDetailInclude,
  })
}

export async function createQualityAssessment(input: AssessmentCreateRequest, client: PrismaLike = qualityDb) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  const subject = parseEvaluationSubject(input.subject)
  const rootAssessmentId = randomUUID()
  const target = await resolveTargetProject(revision.targetProjectId)
  const remoteTarget = target.kind === 'REMOTE_BLACK_BOX'
  if (remoteTarget && !subject.subjectRevisionId)
    throw new ServiceError(
      'REMOTE_BLACK_BOX assessments require subjectRevisionId from evaluation_subject_remote_scope_create.',
      'VALIDATION',
    )
  if (!remoteTarget && subject.subjectRevisionId)
    throw new ServiceError('Remote evaluation scope subjects are valid only for REMOTE_BLACK_BOX targets.', 'CONFLICT')
  const remoteSubject = subject.subjectRevisionId
    ? await resolveRemoteEvaluationScopeSubject({
        subject: { subjectRevisionId: subject.subjectRevisionId, expectedSubjectDigest: subject.expectedSubjectDigest },
        targetProjectId: revision.targetProjectId,
        qualityPlanId: input.qualityPlanId,
        revisionId: revision.id,
      })
    : null
  await assertRemoteAssessmentScopeCurrent({ remoteSubject, revision, qualityPlanId: input.qualityPlanId })
  const requestHash = hashCanonical({
    schemaVersion: 'assessment-create/v2',
    targetProjectId: revision.targetProjectId,
    qualityPlanId: input.qualityPlanId,
    revisionId: revision.id,
    baselineAssessmentId: input.baselineAssessmentId ?? null,
    subject: remoteSubject
      ? { subjectRevisionId: remoteSubject.subject.id, subjectDigest: remoteSubject.subject.subjectDigest }
      : subject,
  })
  const created = await client.$transaction(transaction =>
    createRootAssessmentInTransaction({
      transaction,
      request: input,
      revision,
      subject,
      remoteSubject,
      requestHash,
      rootAssessmentId,
    }),
  )
  const payload = assessmentPayload(created)
  if (!payload.readiness.ready || created.status !== 'CREATED') return payload
  const ready = await client.$transaction(async transaction => {
    await assertRemoteAssessmentScopeCurrent({
      remoteSubject,
      revision,
      qualityPlanId: input.qualityPlanId,
      transaction,
    })
    return transaction.assessment.update({
      where: { id: created.id },
      data: { status: 'READY' },
      include: assessmentDetailInclude,
    })
  })
  return assessmentPayload(ready)
}

/**
 * Creates an immutable retry generation without reopening or changing the
 * predecessor. Each predecessor can have exactly one successor and a caller's
 * idempotency key freezes its complete successor request.
 */
const assessmentDetailInclude = {
  evaluationSubjectRevision: { include: { remoteEvaluationScopeBinding: { include: { partitionMembership: true } } } },
  targetProject: { select: { kind: true } },
  qualityPlan: true,
  qualityPlanRevision: {
    include: {
      qualityPlan: true,
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: { include: { activeGeneration: { include: { publication: true } } } },
    },
  },
  evidenceReceipts: true,
  findings: true,
  decisions: true,
  runs: {
    include: {
      bindings: {
        include: {
          testRun: {
            include: {
              environment: { select: { id: true } },
              targetProject: { select: { kind: true } },
            },
          },
        },
      },
    },
  },
}

function assertSuccessorEligible(predecessor: Awaited<ReturnType<typeof readAssessmentOrThrow>>, retryReason?: string) {
  if (['CREATED', 'READY', 'RUNNING'].includes(predecessor.status))
    throw new ServiceError('Assessment successors require a terminal predecessor.', 'CONFLICT')
  if (!['DECIDED', 'STALE', 'CANCELLED', 'EVIDENCE_REVIEW'].includes(predecessor.status))
    throw new ServiceError('Assessment status cannot create a successor.', 'CONFLICT')
  if (predecessor.status === 'EVIDENCE_REVIEW' && !retryReason)
    throw new ServiceError('Evidence-review successors require an explicit retryReason.', 'VALIDATION')
}

function successorRequestHash(
  predecessor: Awaited<ReturnType<typeof readAssessmentOrThrow>>,
  subject: EvaluationSubjectInput,
  disposition: AssessmentSuccessorDisposition,
) {
  return hashCanonical({
    predecessorAssessmentId: predecessor.id,
    targetProjectId: predecessor.targetProjectId,
    qualityPlanId: predecessor.qualityPlanId,
    qualityPlanRevisionId: predecessor.qualityPlanRevisionId,
    subject,
    disposition,
  })
}

function assertIdempotencyMatch(existing: { successorRequestHash: string | null } | null, requestHash: string) {
  if (existing && existing.successorRequestHash !== requestHash)
    throw new ServiceError('Assessment successor idempotency key was already used with different input.', 'CONFLICT')
}

function assertSuccessorMatch<
  T extends { successorRequestHash: string | null; successorIdempotencyKey: string | null },
>(successor: T | null, requestHash: string, idempotencyKey: string): T | null {
  if (!successor) return null
  if (successor.successorRequestHash === requestHash && successor.successorIdempotencyKey === idempotencyKey)
    return successor
  throw new ServiceError('Assessment already has an immutable successor.', 'CONFLICT')
}

async function resolveSuccessorSubject(transaction: PrismaLike, subject: EvaluationSubjectInput) {
  if (subject.subjectRevisionId) {
    const referenced = await transaction.evaluationSubjectRevision.findFirst({
      where: { id: subject.subjectRevisionId },
    })
    if (!referenced) throw new ServiceError('Remote evaluation scope subject was not found.', 'NOT_FOUND')
    if (subject.expectedSubjectDigest && referenced.subjectDigest !== subject.expectedSubjectDigest)
      throw new ServiceError('Remote evaluation scope subject digest does not match.', 'CONFLICT')
    return referenced
  }
  const existing = await transaction.evaluationSubjectRevision.findFirst({
    where: { subjectDigest: subject.subjectDigest! },
  })
  if (existing && !subjectRevisionMatches(existing, subject))
    throw new ServiceError(
      'Existing evaluation subject digest conflicts with requested authority, kind, or metadata.',
      'CONFLICT',
    )
  if (existing) return existing
  return transaction.evaluationSubjectRevision.create({
    data: {
      subjectDigest: subject.subjectDigest,
      subjectKind: subject.subjectKind,
      authority: subject.authority!,
      metadataJson: canonicalSubjectMetadata(subject.metadata),
    },
  })
}

async function createSuccessorInTransaction(input: {
  transaction: PrismaLike
  predecessor: Awaited<ReturnType<typeof readAssessmentOrThrow>>
  subject: EvaluationSubjectInput
  disposition: AssessmentSuccessorDisposition
  idempotencyKey: string
  requestHash: string
}) {
  const { transaction, predecessor, subject, disposition, idempotencyKey, requestHash } = input
  const keyMatch = await transaction.assessment.findFirst({
    where: { targetProjectId: predecessor.targetProjectId, successorIdempotencyKey: idempotencyKey },
    include: assessmentDetailInclude,
  })
  assertIdempotencyMatch(keyMatch, requestHash)
  if (keyMatch) return keyMatch
  const existingSuccessor = await transaction.assessment.findFirst({
    where: { supersedesAssessmentId: predecessor.id },
    include: assessmentDetailInclude,
  })
  const matchingSuccessor = assertSuccessorMatch(existingSuccessor, requestHash, idempotencyKey)
  if (matchingSuccessor) return matchingSuccessor
  const subjectRevision = await resolveSuccessorSubject(transaction, subject)
  return transaction.assessment.create({
    data: {
      targetProjectId: predecessor.targetProjectId,
      qualityPlanId: predecessor.qualityPlanId,
      qualityPlanRevisionId: predecessor.qualityPlanRevisionId,
      evaluationSubjectRevisionId: subjectRevision.id,
      status: 'READY',
      lineageId: predecessor.lineageId || predecessor.id,
      generation: predecessor.generation + 1,
      supersedesAssessmentId: predecessor.id,
      supersessionDispositionJson: canonicalContractJson(disposition),
      successorIdempotencyKey: idempotencyKey,
      successorRequestHash: requestHash,
    },
    include: assessmentDetailInclude,
  })
}

function uniqueConstraint(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002',
  )
}

async function recoverSuccessorFromRace(input: {
  client: PrismaLike
  predecessor: Awaited<ReturnType<typeof readAssessmentOrThrow>>
  idempotencyKey: string
  requestHash: string
  error: unknown
}) {
  if (!uniqueConstraint(input.error)) throw input.error
  const keyReplay = await input.client.assessment.findFirst({
    where: { targetProjectId: input.predecessor.targetProjectId, successorIdempotencyKey: input.idempotencyKey },
  })
  const replay =
    keyReplay ?? (await input.client.assessment.findFirst({ where: { supersedesAssessmentId: input.predecessor.id } }))
  if (!replay) throw input.error
  assertIdempotencyMatch(replay, input.requestHash)
  assertSuccessorMatch(replay, input.requestHash, input.idempotencyKey)
  return readAssessmentOrThrow(input.client, replay.id)
}

export async function createQualityAssessmentSuccessor(
  input: {
    assessmentId: string
    subject: unknown
    disposition: unknown
    idempotencyKey: string
  },
  client: PrismaLike = qualityDb,
) {
  const predecessor = await readAssessmentOrThrow(client, input.assessmentId)
  const subject = parseEvaluationSubject(input.subject)
  const target = await resolveTargetProject(predecessor.targetProjectId)
  const remoteTarget = target.kind === 'REMOTE_BLACK_BOX'
  if (remoteTarget && !subject.subjectRevisionId)
    throw new ServiceError(
      'REMOTE_BLACK_BOX assessment successors require subjectRevisionId from evaluation_subject_remote_scope_create.',
      'VALIDATION',
    )
  if (!remoteTarget && subject.subjectRevisionId)
    throw new ServiceError('Remote evaluation scope subjects are valid only for REMOTE_BLACK_BOX targets.', 'CONFLICT')
  const remote = subject.subjectRevisionId
    ? await resolveRemoteEvaluationScopeSubject({
        subject: { subjectRevisionId: subject.subjectRevisionId, expectedSubjectDigest: subject.expectedSubjectDigest },
        targetProjectId: predecessor.targetProjectId,
        qualityPlanId: predecessor.qualityPlanId,
        revisionId: predecessor.qualityPlanRevisionId,
      })
    : null
  if (remote) {
    await assertRemoteEvaluationScopeCurrent({
      subjectRevisionId: remote.subject.id,
      targetProjectId: predecessor.targetProjectId,
      qualityPlanId: predecessor.qualityPlanId,
      revisionId: predecessor.qualityPlanRevisionId,
      environmentId: remote.binding.environmentId,
    })
  }
  const disposition = parseAssessmentSuccessorDisposition(input.disposition)
  assertSuccessorEligible(predecessor, disposition.retryReason)
  const requestHash = successorRequestHash(predecessor, subject, disposition)
  try {
    const created = await client.$transaction(async transaction => {
      // Re-read eligibility and the full remote scope from the transaction's
      // snapshot.  An outer readiness check is advisory only; this is the
      // phase-local CAS that owns successor creation.
      const currentPredecessor = await readAssessmentOrThrow(transaction, predecessor.id)
      assertSuccessorEligible(currentPredecessor, disposition.retryReason)
      if (subject.subjectRevisionId)
        await assertRemoteEvaluationScopeCurrent(
          {
            subjectRevisionId: subject.subjectRevisionId,
            targetProjectId: currentPredecessor.targetProjectId,
            qualityPlanId: currentPredecessor.qualityPlanId,
            revisionId: currentPredecessor.qualityPlanRevisionId,
            environmentId: remote!.binding.environmentId,
          },
          transaction as never,
        )
      return createSuccessorInTransaction({
        transaction,
        predecessor: currentPredecessor,
        subject,
        disposition,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      })
    })
    return assessmentPayload(created)
  } catch (error) {
    return assessmentPayload(
      await recoverSuccessorFromRace({ client, predecessor, idempotencyKey: input.idempotencyKey, requestHash, error }),
    )
  }
}

export async function readQualityAssessment(assessmentId: string, client: PrismaLike = qualityDb) {
  return assessmentPayload(await readAssessmentOrThrow(client, assessmentId))
}

/**
 * Project-scoped read model for the Quality Plans browser. Detail payloads remain
 * revision-authoritative so each card uses the same immutable content as review.
 */
export async function listQualityPlans(input: { targetProjectId: string }, client: PrismaLike = qualityDb) {
  if (!client.qualityPlan.findMany) throw new ServiceError('Quality Plan list query is unavailable.', 'INTERNAL')
  const plans = await client.qualityPlan.findMany({
    where: { targetProjectId: input.targetProjectId },
    orderBy: { updatedAt: 'desc' },
  })
  return Promise.all(plans.map(plan => readQualityRequirementGraph({ qualityPlanId: plan.id }, client)))
}

/**
 * Project-scoped assessment review packets. Reusing the exact detail payload
 * prevents the list from presenting readiness or evidence state differently.
 */
export async function listQualityAssessments(input: { targetProjectId: string }, client: PrismaLike = qualityDb) {
  if (!client.assessment.findMany) throw new ServiceError('Assessment list query is unavailable.', 'INTERNAL')
  const assessments = await client.assessment.findMany({
    where: { targetProjectId: input.targetProjectId },
    orderBy: { updatedAt: 'desc' },
  })
  return Promise.all(assessments.map(assessment => readQualityAssessment(assessment.id, client)))
}

export async function decideQualityAssessment(
  input: {
    assessmentId: string
    expectedEvidenceSetHash: string
    decision: 'accepted' | 'rejected' | 'accepted_with_limitations' | 'needs_revision'
    decidedBy: string
    rationale: string
  },
  client: PrismaLike = qualityDb,
) {
  const assessment = await readAssessmentOrThrow(client, input.assessmentId)
  const payload = assessmentPayload(assessment)
  assertAssessmentDecisionReady(payload)
  if (payload.evidenceSetHash !== input.expectedEvidenceSetHash) {
    throw new ServiceError('Assessment evidence set hash is stale.', 'CONFLICT')
  }
  if (assessment.alignment !== 'CURRENT') throw new ServiceError('Assessment alignment is not current.', 'CONFLICT')
  const obligationIds = assessment.qualityPlanRevision.obligations.map(obligation => obligation.id)
  const findingByObligation = new Map(
    assessment.findings.map(finding => [finding.qualityObligationRevisionId, finding]),
  )
  if (obligationIds.some(id => !findingByObligation.has(id)))
    throw new ServiceError('Every quality obligation requires an attributed finding before decision.', 'CONFLICT')
  const findings = [...findingByObligation.values()]
  const targetDefects = findings.filter(
    finding => finding.outcome === 'VIOLATED' && finding.attribution === 'TARGET_DEFECT',
  )
  if (input.decision === 'rejected' && !targetDefects.length)
    throw new ServiceError('Assessment rejection requires at least one target_defect finding.', 'CONFLICT')
  if ((input.decision === 'accepted' || input.decision === 'accepted_with_limitations') && targetDefects.length)
    throw new ServiceError('An Assessment with a target_defect finding cannot be accepted.', 'CONFLICT')
  if (input.decision === 'accepted' && findings.some(finding => finding.outcome !== 'SATISFIED'))
    throw new ServiceError('Unqualified acceptance requires every obligation to be satisfied.', 'CONFLICT')
  const findingBasis = findings
    .map(finding => ({
      findingHash: finding.findingHash,
      obligationId: finding.qualityObligationRevisionId,
      outcome: finding.outcome,
      attribution: finding.attribution,
    }))
    .sort((left, right) => left.obligationId.localeCompare(right.obligationId))
  const decisionHash = hashCanonical({
    assessmentId: assessment.id,
    evidenceSetHash: payload.evidenceSetHash,
    findings: findingBasis,
    decision: input.decision,
    rationale: input.rationale,
    decidedBy: input.decidedBy,
  })
  await client.$transaction(async transaction => {
    const reviewedAt = new Date()
    for (const finding of findings) {
      const reviewStatus = input.decision === 'needs_revision' ? 'NEEDS_REVISION' : 'APPROVED'
      const reviewHash = hashCanonical({
        findingHash: finding.findingHash,
        status: reviewStatus,
        reviewedBy: input.decidedBy,
        reviewedAt: reviewedAt.toISOString(),
        rationale: input.rationale,
      })
      await transaction.assessmentFinding?.update({
        where: { id: finding.id },
        data: {
          reviewStatus,
          reviewedBy: input.decidedBy,
          reviewedAt,
          reviewRationale: input.rationale,
          reviewHash,
        },
      })
    }
    await transaction.assessmentDecision.create({
      data: {
        assessmentId: assessment.id,
        decision: input.decision.toUpperCase(),
        rationale: input.rationale,
        decidedBy: input.decidedBy,
        decisionHash,
      },
    })
    await transaction.assessment.update({ where: { id: assessment.id }, data: { status: 'DECIDED' } })
  })
  return readQualityAssessment(assessment.id, client)
}
