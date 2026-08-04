import prisma from '@/config/db-config'
import { hashCanonical, hashQualityPlanRevision, canApproveRequirements } from '@/lib/quality-design/state'
import { ServiceError } from '@/services/shared/errors'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

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
  qualityPlan: { id: string; targetProjectId: string; title: string; description: string | null }
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
  }>
}

type Delegate<T> = {
  findFirst(args: unknown): Promise<T | null>
  create(args: unknown): Promise<T>
  update(args: unknown): Promise<T>
}

type PrismaLike = {
  qualityPlanRevision: Delegate<QualityRevisionRecord>
  qualityPlan: Delegate<{ id: string }>
  requirementSnapshot: Delegate<{ id: string }>
  qualityObligationRevision: Delegate<unknown>
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
    evaluationSubjectRevision: {
      id: string
      subjectDigest: string
      subjectKind: string
      authority: string
      metadataJson: string | null
    }
    qualityPlan: { id: string; targetProjectId: string; title: string; description: string | null }
    qualityPlanRevision: QualityRevisionRecord
    evidenceReceipts: unknown[]
    decisions: Array<{
      id: string
      decision: string
      rationale: string
      decidedBy: string
      decidedAt: Date
      decisionHash: string
    }>
  }>
  assessmentDecision: Delegate<unknown>
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
  subjectDigest: string
  subjectKind?: 'ARTIFACT' | 'DEPLOYMENT_SNAPSHOT'
  authority: string
  metadata?: unknown
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
      qualityPlan: true,
      requirementSnapshots: true,
      obligations: true,
      queries: true,
      validationVersions: true,
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
    revision: {
      id: revision.id,
      revision: revision.revision,
      status: revision.status,
      contentHash: revision.contentHash,
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
      design: JSON.parse(version.canonicalAstJson),
    })),
    nextRecommendedAction: canApproveRequirements(queries)
      ? 'Call requirements_approve for this exact revision hash, then propose obligation-linked scenarios.'
      : 'Resolve blocking requirement queries before approval.',
  }
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
  input: { target?: string; source: unknown; idempotencyKey: string },
  client: PrismaLike = qualityDb,
) {
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
      validationVersions: true,
    },
  })
  if (existing) return { idempotent: true, ...revisionPayload(existing) }

  const created = await client.$transaction(transaction =>
    createRequirementRevision(transaction as PrismaLike, target.id, source, graph, contentHash),
  )
  return { idempotent: false, ...revisionPayload(created) }
}

async function createRequirementRevision(
  transaction: PrismaLike,
  targetProjectId: string,
  source: SourceSpecification,
  graph: unknown,
  contentHash: string,
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
    },
  })
  await createRequirementSnapshots(transaction, revision.id, source.requirements ?? [])
  if (!source.requirements?.length) await createBlockingRequirementQuery(transaction, revision.id)
  return readRevisionOrThrow(transaction, qualityPlan.id, revision.id)
}

async function createRequirementSnapshots(
  transaction: PrismaLike,
  qualityPlanRevisionId: string,
  requirements: NonNullable<SourceSpecification['requirements']>,
) {
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
    await transaction.qualityObligationRevision.create({
      data: {
        qualityPlanRevisionId,
        requirementSnapshotId: snapshot.id,
        title: requirement.externalRef ?? requirement.id ?? `Requirement ${index + 1}`,
        intent: requirement.text,
        assertionScopeJson: JSON.stringify({ requirementSnapshotId: snapshot.id }),
        minimumAssurance: requirement.minimumAssurance ?? 'STANDARD',
        limitations: requirement.limitations,
        contentHash: hashCanonical({ requirement, index }),
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
    answers: Array<{
      queryId: string
      status: 'ANSWERED' | 'DEFERRED' | 'ACCEPTED_ASSUMPTION'
      answer?: string
      rationale?: string
    }>
    idempotencyKey: string
  },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  const revisionQueryIds = new Set(revision.queries.map(query => query.id))
  for (const answer of input.answers) {
    if (!revisionQueryIds.has(answer.queryId)) {
      throw new ServiceError('Requirement query does not belong to this Quality Plan revision.', 'CONFLICT')
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
      validationVersions: true,
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
    for (const version of orderedVersions) {
      await transaction.validationVersion.update({
        where: { id: version.id },
        data: {
          status: 'SCENARIO_APPROVED',
          scenarioApprovedAt: new Date(),
          scenarioApprovedBy: input.approvedBy,
          scenarioApprovalHash: designHash,
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
      'Resolve reuse and mechanical bindings through validation_reuse_resolve and validation_compile before publication.',
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

export async function compileQualityValidations(
  input: { qualityPlanId: string; revisionId: string; expectedDesignHash: string; realization: unknown },
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
  const realizationByValidationId = parseRealization(input.realization, revision.validationVersions)
  await client.$transaction(async transaction => {
    for (const version of revision.validationVersions) {
      if (version.status !== 'SCENARIO_APPROVED' && version.status !== 'REALIZED') {
        throw new ServiceError('Only approved scenario validation versions can be compiled.', 'CONFLICT')
      }
      const realization = realizationByValidationId.get(version.id) ?? null
      const realizationHash = compileRealizationHash(version.id, realization)
      await transaction.validationVersion.update({
        where: { id: version.id },
        data: {
          status: 'REALIZED',
          realizationJson: JSON.stringify(realization),
          realizationHash,
          compilationHash: hashCanonical({
            validationVersionId: version.id,
            canonicalHash: version.canonicalHash,
            realizationHash,
          }),
        },
      })
    }
    await transaction.qualityPlanRevision.update({ where: { id: revision.id }, data: { status: 'REALIZED' } })
  })
  const realized = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  return {
    ...revisionPayload(realized),
    compilationHash: compilationHash(realized.validationVersions),
    nextRecommendedAction:
      'Call validation_publish with this compilation hash to publish executable validation versions.',
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
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as { validationVersionId?: unknown; realization?: unknown }
    if (typeof record.validationVersionId === 'string' && record.realization !== undefined)
      byValidationId.set(record.validationVersionId, record.realization)
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

export async function publishQualityValidations(
  input: { qualityPlanId: string; revisionId: string; validationVersionIds: string[]; expectedCompilationHash: string },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  const requestedIds = new Set(input.validationVersionIds)
  if (!requestedIds.size) throw new ServiceError('Validation publication requires validationVersionIds.', 'VALIDATION')
  const selectedVersions = revision.validationVersions.filter(version => requestedIds.has(version.id))
  if (selectedVersions.length !== requestedIds.size) {
    throw new ServiceError('Validation publication references unknown validation versions.', 'CONFLICT')
  }
  const realizedVersions = revision.validationVersions.filter(
    version => version.status === 'REALIZED' && version.realizationHash,
  )
  if (!idsEqual(requestedIds, new Set(realizedVersions.map(version => version.id)))) {
    throw new ServiceError('Validation publication must include the full realized validation set.', 'CONFLICT')
  }
  if (revision.validationVersions.some(version => version.status !== 'REALIZED' || !version.realizationHash)) {
    throw new ServiceError('Validation publication requires realized validation versions.', 'CONFLICT')
  }
  const revisionCompilationHash = compilationHash(revision.validationVersions)
  if (revisionCompilationHash !== input.expectedCompilationHash) {
    throw new ServiceError('Validation compilation hash is stale.', 'CONFLICT')
  }
  await client.$transaction(
    selectedVersions.map(version =>
      client.validationVersion.update({
        where: { id: version.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
    ),
  )
  return {
    ...(await readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: revision.id }, client)),
    compilationHash: revisionCompilationHash,
    nextRecommendedAction: 'Create an assessment for an immutable subject digest, then run approved validations.',
  }
}

function parseEvaluationSubject(subject: unknown): EvaluationSubjectInput {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    throw new ServiceError('Assessment subject must be an immutable subject descriptor.', 'VALIDATION')
  }
  const value = subject as Record<string, unknown>
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

async function readAssessmentOrThrow(client: PrismaLike, assessmentId: string) {
  const assessment = await client.assessment.findFirst({
    where: { id: assessmentId },
    include: {
      evaluationSubjectRevision: true,
      qualityPlan: true,
      qualityPlanRevision: {
        include: {
          qualityPlan: true,
          requirementSnapshots: true,
          obligations: true,
          queries: true,
          validationVersions: true,
        },
      },
      evidenceReceipts: true,
      decisions: true,
    },
  })
  if (!assessment) throw new ServiceError('Assessment not found.', 'NOT_FOUND')
  return assessment
}

function assessmentEvidenceSetHash(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  return hashCanonical({
    assessmentId: assessment.id,
    evidenceReceipts: assessment.evidenceReceipts,
    validationVersions: assessment.qualityPlanRevision.validationVersions.map(version => ({
      id: version.id,
      canonicalHash: version.canonicalHash,
      status: version.status,
    })),
  })
}

function assessmentPayload(assessment: Awaited<ReturnType<typeof readAssessmentOrThrow>>) {
  const validationVersions = assessment.qualityPlanRevision.validationVersions
  const published = validationVersions.filter(version => version.status === 'PUBLISHED')
  const blockers = [
    ...(assessment.qualityPlanRevision.status === 'SCENARIOS_APPROVED' ||
    assessment.qualityPlanRevision.status === 'REALIZED'
      ? []
      : ['Quality Plan revision must have approved scenarios before assessment readiness.']),
    ...(published.length && published.length === validationVersions.length
      ? []
      : ['All validation versions must be published for this assessment.']),
    ...(assessment.alignment === 'CURRENT' ? [] : ['Requirement alignment is not current.']),
  ]
  return {
    assessment: {
      id: assessment.id,
      status: assessment.status,
      alignment: assessment.alignment,
      observedAssurance: assessment.observedAssurance,
      baselineAssessmentId: assessment.baselineAssessmentId,
    },
    qualityPlan: {
      id: assessment.qualityPlan.id,
      targetProjectId: assessment.qualityPlan.targetProjectId,
      title: assessment.qualityPlan.title,
      description: assessment.qualityPlan.description,
    },
    revision: revisionPayload(assessment.qualityPlanRevision),
    subject: {
      id: assessment.evaluationSubjectRevision.id,
      subjectDigest: assessment.evaluationSubjectRevision.subjectDigest,
      subjectKind: assessment.evaluationSubjectRevision.subjectKind,
      authority: assessment.evaluationSubjectRevision.authority,
      metadata: assessment.evaluationSubjectRevision.metadataJson
        ? JSON.parse(assessment.evaluationSubjectRevision.metadataJson)
        : null,
    },
    readiness: {
      ready: blockers.length === 0,
      blockers,
      publishedValidationVersionIds: published.map(version => version.id),
    },
    evidenceReceiptCount: assessment.evidenceReceipts.length,
    evidenceSetHash: assessmentEvidenceSetHash(assessment),
    decisions: assessment.decisions,
    nextRecommendedAction: blockers.length
      ? 'Resolve assessment readiness blockers before assessment_run or assessment_decide.'
      : 'Call assessment_run to collect sealed evidence, then assessment_review and assessment_decide.',
  }
}

function assertAssessmentDecisionReady(payload: ReturnType<typeof assessmentPayload>) {
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

export async function createQualityAssessment(
  input: {
    qualityPlanId: string
    revisionId: string
    subject: unknown
    baselineAssessmentId?: string
    idempotencyKey: string
  },
  client: PrismaLike = qualityDb,
) {
  const revision = await readRevisionOrThrow(client, input.qualityPlanId, input.revisionId)
  const subject = parseEvaluationSubject(input.subject)
  const created = await client.$transaction(async transaction => {
    const existingSubject = await transaction.evaluationSubjectRevision.findFirst({
      where: { subjectDigest: subject.subjectDigest },
    })
    const subjectRevision =
      existingSubject ??
      (await transaction.evaluationSubjectRevision.create({
        data: {
          subjectDigest: subject.subjectDigest,
          subjectKind: subject.subjectKind,
          authority: subject.authority,
          metadataJson: subject.metadata === undefined ? null : JSON.stringify(subject.metadata),
        },
      }))
    const existingAssessment = await transaction.assessment.findFirst({
      where: {
        targetProjectId: revision.targetProjectId,
        qualityPlanRevisionId: revision.id,
        evaluationSubjectRevisionId: subjectRevision.id,
      },
      include: {
        evaluationSubjectRevision: true,
        qualityPlan: true,
        qualityPlanRevision: {
          include: {
            qualityPlan: true,
            requirementSnapshots: true,
            obligations: true,
            queries: true,
            validationVersions: true,
          },
        },
        evidenceReceipts: true,
        decisions: true,
      },
    })
    if (existingAssessment) return existingAssessment
    return transaction.assessment.create({
      data: {
        targetProjectId: revision.targetProjectId,
        qualityPlanId: input.qualityPlanId,
        qualityPlanRevisionId: revision.id,
        evaluationSubjectRevisionId: subjectRevision.id,
        baselineAssessmentId: input.baselineAssessmentId,
      },
      include: {
        evaluationSubjectRevision: true,
        qualityPlan: true,
        qualityPlanRevision: {
          include: {
            qualityPlan: true,
            requirementSnapshots: true,
            obligations: true,
            queries: true,
            validationVersions: true,
          },
        },
        evidenceReceipts: true,
        decisions: true,
      },
    })
  })
  return assessmentPayload(created)
}

export async function readQualityAssessment(assessmentId: string, client: PrismaLike = qualityDb) {
  return assessmentPayload(await readAssessmentOrThrow(client, assessmentId))
}

export async function decideQualityAssessment(
  input: {
    assessmentId: string
    expectedEvidenceSetHash: string
    decision: 'accepted' | 'rejected' | 'accepted_with_limitations'
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
  const decisionHash = hashCanonical({
    assessmentId: assessment.id,
    evidenceSetHash: payload.evidenceSetHash,
    decision: input.decision,
    rationale: input.rationale,
  })
  await client.$transaction(async transaction => {
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
