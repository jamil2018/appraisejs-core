import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  builtInMethodologyProvider,
  builtInMethodologyRef,
  critiqueRequirementAnalysis,
  critiqueValidationDesign,
  evidenceAttributionSchema,
  methodologyManifestDigest,
  obligationFindingSchema,
  requirementAnalysisProposalSchema,
  validationDesignProposalSchema,
  type EvidenceAttribution,
  type MethodologyProvider,
  type MethodologyRef,
  type RequirementAnalysisProposal,
  type ValidationDesignProposal,
} from '@/lib/quality-design/methodology-registry'
import { hashCanonical } from '@/lib/quality-design/state'
import { ServiceError } from '@/services/shared/errors'

/**
 * The Quality OS service intentionally owns the semantic lifecycle records
 * rather than extending the legacy source-to-obligation projection.  The
 * interface is structural so focused tests can exercise it without a SQLite
 * database; production always uses the canonical Prisma client.
 */
type Delegate<T> = {
  findFirst(args: unknown): Promise<T | null>
  findMany?(args: unknown): Promise<T[]>
  create(args: unknown): Promise<T>
  update(args: unknown): Promise<T>
}

type RequirementSnapshotRecord = { id: string; text: string; contentHash?: string }
type QueryRecord = { id: string; status: string }
type ObligationRecord = {
  id: string
  requirementAnalysisRevisionId?: string
  requirementSnapshotId: string
  minimumAssurance: string
  contentHash?: string
}
type AnalysisRecord = {
  id: string
  targetProjectId: string
  qualityPlanRevisionId: string
  revision: number
  status: string
  decision: string
  analysisJson: string
  provenanceJson: string
  critiqueJson: string | null
  analysisHash: string
  decisionRationale: string | null
  decidedBy: string | null
  decidedAt: Date | null
  approvedAt: Date | null
  approvedBy: string | null
  approvalHash: string | null
}
type DesignRecord = {
  id: string
  targetProjectId: string
  qualityPlanRevisionId: string
  requirementAnalysisRevisionId: string
  revision: number
  status: string
  decision: string
  strategyJson: string
  scenarioPortfolioJson: string
  critiqueJson: string | null
  provenanceJson: string
  designHash: string
  decisionRationale: string | null
  decidedBy: string | null
  decidedAt: Date | null
  approvedAt: Date | null
  approvedBy: string | null
  approvalHash: string | null
  requirementAnalysisRevision?: AnalysisRecord
}
type RevisionRecord = {
  id: string
  targetProjectId: string
  qualityPlanId: string
  status: string
  requirementSnapshots: RequirementSnapshotRecord[]
  queries?: QueryRecord[]
  obligations?: ObligationRecord[]
}
type AssessmentRecord = {
  id: string
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  evaluationSubjectRevisionId: string
  status: string
  executionManifestHash?: string | null
  targetProject?: { executionConsentMode: ExecutionConsentMode }
  evaluationSubjectRevision?: { subjectDigest: string }
}

function immutableDecisionData(
  input: { decision: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'; rationale: string; decidedBy: string },
  decidedAt: Date,
  approvalHash: string | null,
) {
  return {
    status: input.decision === 'APPROVED' ? 'APPROVED' : 'SUPERSEDED',
    decision: input.decision,
    decisionRationale: input.rationale,
    decidedBy: input.decidedBy,
    decidedAt,
    ...(input.decision === 'APPROVED' ? { approvedAt: decidedAt, approvedBy: input.decidedBy, approvalHash } : {}),
  }
}
type EnvironmentRecord = { id: string; targetProjectId: string; credentialState?: string | null }
type ConsentRecord = {
  id: string
  assessmentId: string
  targetProjectId: string
  executionManifestHash: string
  mode: ExecutionConsentMode
  status: ExecutionConsentStatus
  scopeJson: string
  consentHash: string
  grantedBy: string | null
  grantedAt: Date | null
  expiresAt: Date | null
  consumedAt: Date | null
  revokedAt: Date | null
  revokedReason: string | null
}
type EvidenceReceiptRecord = {
  id: string
  assessmentId: string | null
  targetProjectId: string
  qualityPlanRevisionId: string
  receiptHash: string
}

export type PrismaLike = {
  qualityPlanRevision: Delegate<RevisionRecord>
  requirementAnalysisRevision: Delegate<AnalysisRecord>
  requirementQuery: Delegate<QueryRecord>
  qualityObligationRevision: Delegate<ObligationRecord>
  validationDesignRevision: Delegate<DesignRecord>
  validationVersion: Delegate<{ id: string; canonicalHash: string }>
  obligationValidationVersion: Delegate<{ id?: string }>
  assessment: Delegate<AssessmentRecord>
  environment: Delegate<EnvironmentRecord>
  executionConsent: Delegate<ConsentRecord>
  evidenceReceipt: Delegate<EvidenceReceiptRecord>
  assessmentFinding: Delegate<{ id: string; findingHash: string }>
  assessmentFindingEvidenceReceipt: Delegate<{ assessmentFindingId: string }>
  $transaction<T>(operation: (transaction: PrismaLike) => Promise<T>): Promise<T>
}

const qualityOsDb = prisma as unknown as PrismaLike

export type ExecutionConsentMode = 'ALWAYS_ASK' | 'RISK_AWARE' | 'TRUSTED_AGENT'
type ExecutionConsentStatus = 'REQUESTED' | 'GRANTED' | 'CONSUMED' | 'EXPIRED' | 'REVOKED'

const terminalAnalysisDecisions = new Set(['APPROVED', 'NEEDS_REVISION', 'REJECTED'])
const terminalDesignDecisions = new Set(['APPROVED', 'NEEDS_REVISION', 'REJECTED'])
const consentRank: Record<ExecutionConsentMode, number> = {
  TRUSTED_AGENT: 1,
  RISK_AWARE: 2,
  ALWAYS_ASK: 3,
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new ServiceError(`${label} is corrupted.`, 'CONFLICT')
  }
}

function methodologyOrThrow(ref: MethodologyRef, provider: MethodologyProvider) {
  const manifest = provider.read({
    providerId: ref.providerId,
    methodologyId: ref.methodologyId,
    version: ref.version,
  })
  if (!manifest) throw new ServiceError('The requested methodology is unavailable.', 'NOT_FOUND')
  if (methodologyManifestDigest(manifest) !== ref.digest)
    throw new ServiceError('The methodology digest does not match the installed methodology.', 'CONFLICT')
  return manifest
}

function exactSet(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && actual.every(value => expected.includes(value))
}

function uniqueIds(values: readonly string[], label: string) {
  if (new Set(values).size !== values.length) throw new ServiceError(`${label} contains duplicate IDs.`, 'VALIDATION')
}

function analysisProposalOrThrow(value: unknown, provider: MethodologyProvider) {
  const proposal = requirementAnalysisProposalSchema.parse(value)
  methodologyOrThrow(proposal.methodology, provider)
  uniqueIds(
    proposal.requirements.map(requirement => requirement.id),
    'Requirement analysis proposal',
  )
  uniqueIds(
    proposal.obligations.map(obligation => obligation.id),
    'Requirement analysis proposal',
  )
  return proposal
}

function designProposalOrThrow(value: unknown, provider: MethodologyProvider) {
  const proposal = validationDesignProposalSchema.parse(value)
  methodologyOrThrow(proposal.methodology, provider)
  uniqueIds(
    proposal.scenarios.map(scenario => scenario.id),
    'Validation design proposal',
  )
  return proposal
}

export function requirementAnalysisHash(proposal: RequirementAnalysisProposal) {
  return hashCanonical({ kind: 'appraise.requirement-analysis/v1', proposal })
}

export function obligationSetHash(obligations: readonly Pick<ObligationRecord, 'id' | 'minimumAssurance'>[]) {
  return hashCanonical(
    [...obligations]
      .map(obligation => ({ id: obligation.id, minimumAssurance: obligation.minimumAssurance }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  )
}

export function validationDesignHash(
  proposal: ValidationDesignProposal,
  approvedAnalysisHash: string,
  expectedObligationSetHash: string,
) {
  return hashCanonical({
    approvedAnalysisHash,
    expectedObligationSetHash,
    kind: 'appraise.validation-design/v1',
    proposal,
  })
}

export function listQualityMethodologies(provider: MethodologyProvider = builtInMethodologyProvider) {
  const manifest = provider.read({
    providerId: builtInMethodologyRef.providerId,
    methodologyId: builtInMethodologyRef.methodologyId,
    version: builtInMethodologyRef.version,
  })
  return manifest ? [{ ref: builtInMethodologyRef, manifest }] : []
}

export function readQualityMethodology(
  ref: Omit<MethodologyRef, 'digest'>,
  provider: MethodologyProvider = builtInMethodologyProvider,
) {
  const manifest = provider.read(ref)
  if (!manifest) throw new ServiceError('The requested methodology is unavailable.', 'NOT_FOUND')
  const resolvedRef = { ...ref, digest: methodologyManifestDigest(manifest) }
  return { ref: resolvedRef, manifest: methodologyOrThrow(resolvedRef, provider) }
}

async function readRevision(client: PrismaLike, qualityPlanRevisionId: string) {
  const revision = await client.qualityPlanRevision.findFirst({
    where: { id: qualityPlanRevisionId },
    include: { requirementSnapshots: true, queries: true, obligations: true },
  })
  if (!revision) throw new ServiceError('Quality Plan revision not found.', 'NOT_FOUND')
  return revision
}

async function nextRevision(
  client: PrismaLike,
  delegate: 'requirementAnalysisRevision' | 'validationDesignRevision',
  qualityPlanRevisionId: string,
) {
  const records = (await client[delegate].findMany?.({ where: { qualityPlanRevisionId } })) ?? []
  return records.reduce((maximum, record) => Math.max(maximum, record.revision), 0) + 1
}

function assertProposalMatchesSnapshots(proposal: RequirementAnalysisProposal, snapshots: RequirementSnapshotRecord[]) {
  const supplied = proposal.requirements.map(requirement => requirement.id)
  const expected = snapshots.map(snapshot => snapshot.id)
  if (!exactSet(supplied, expected))
    throw new ServiceError('Analysis proposal must reference every exact RequirementSnapshot ID once.', 'CONFLICT')
  const byId = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]))
  for (const requirement of proposal.requirements) {
    if (byId.get(requirement.id)?.text !== requirement.text)
      throw new ServiceError('Analysis proposal requirement text no longer matches its snapshot.', 'CONFLICT')
  }
  const known = new Set(expected)
  for (const obligation of proposal.obligations) {
    if (obligation.requirementIds.some(requirementId => !known.has(requirementId)))
      throw new ServiceError('Analysis obligation references an unknown RequirementSnapshot.', 'CONFLICT')
  }
}

export async function proposeRequirementAnalysis(
  input: { targetProjectId: string; qualityPlanRevisionId: string; proposal: unknown },
  client: PrismaLike = qualityOsDb,
  provider: MethodologyProvider = builtInMethodologyProvider,
) {
  const proposal = analysisProposalOrThrow(input.proposal, provider)
  const revision = await readRevision(client, input.qualityPlanRevisionId)
  if (revision.targetProjectId !== input.targetProjectId)
    throw new ServiceError('Quality Plan revision belongs to another target.', 'CONFLICT')
  assertProposalMatchesSnapshots(proposal, revision.requirementSnapshots)
  const analysisHash = requirementAnalysisHash(proposal)
  const existing = await client.requirementAnalysisRevision.findFirst({
    where: { qualityPlanRevisionId: revision.id, analysisHash },
  })
  if (existing) return { idempotent: true, analysis: analysisPayload(existing) }
  const critique = critiqueRequirementAnalysis(proposal)
  const created = await client.$transaction(async transaction => {
    const analysis = await transaction.requirementAnalysisRevision.create({
      data: {
        targetProjectId: revision.targetProjectId,
        qualityPlanRevisionId: revision.id,
        revision: await nextRevision(transaction, 'requirementAnalysisRevision', revision.id),
        status: 'IN_REVIEW',
        decision: 'PENDING',
        analysisJson: canonicalContractJson(proposal),
        provenanceJson: canonicalContractJson({ methodology: proposal.methodology, inferences: proposal.inferences }),
        critiqueJson: canonicalContractJson(critique),
        analysisHash,
      },
    })
    for (const query of proposal.proposedQueries) {
      await transaction.requirementQuery.create({
        data: {
          id: `${revision.id}:${query.id}`,
          qualityPlanRevisionId: revision.id,
          prompt: query.prompt,
          status: 'BLOCKING',
          rationale: query.rationale,
        },
      })
    }
    await transaction.qualityPlanRevision.update({ where: { id: revision.id }, data: { status: 'REQUIREMENT_REVIEW' } })
    return analysis
  })
  return { idempotent: false, analysis: analysisPayload(created) }
}

export async function readRequirementAnalysis(
  input: { qualityPlanRevisionId?: string; qualityPlanId?: string; analysisRevisionId?: string },
  client: PrismaLike = qualityOsDb,
) {
  const analysis = await client.requirementAnalysisRevision.findFirst({
    where: {
      ...(input.qualityPlanRevisionId ? { qualityPlanRevisionId: input.qualityPlanRevisionId } : {}),
      ...(input.analysisRevisionId ? { id: input.analysisRevisionId } : {}),
    },
    orderBy: { revision: 'desc' },
  })
  if (!analysis) throw new ServiceError('Requirement analysis revision not found.', 'NOT_FOUND')
  if (input.qualityPlanId) {
    const scopedRevision = await client.qualityPlanRevision.findFirst({
      where: { id: analysis.qualityPlanRevisionId, qualityPlanId: input.qualityPlanId },
    })
    if (!scopedRevision)
      throw new ServiceError('Requirement analysis revision not found for this Quality Plan.', 'NOT_FOUND')
  }
  return analysisPayload(analysis)
}

function analysisPayload(analysis: AnalysisRecord) {
  return {
    id: analysis.id,
    qualityPlanRevisionId: analysis.qualityPlanRevisionId,
    revision: analysis.revision,
    status: analysis.status,
    decision: analysis.decision,
    proposal: parseJson<RequirementAnalysisProposal>(analysis.analysisJson, 'Requirement analysis'),
    provenance: parseJson<unknown>(analysis.provenanceJson, 'Requirement analysis provenance'),
    critique: analysis.critiqueJson ? parseJson<unknown>(analysis.critiqueJson, 'Requirement analysis critique') : [],
    analysisHash: analysis.analysisHash,
    approvalHash: analysis.approvalHash,
    decidedAt: analysis.decidedAt,
    decidedBy: analysis.decidedBy,
  }
}

export async function decideRequirementAnalysis(
  input: {
    analysisRevisionId: string
    qualityPlanId?: string
    expectedAnalysisHash: string
    decision: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
    decidedBy: string
    rationale: string
  },
  client: PrismaLike = qualityOsDb,
) {
  if (!terminalAnalysisDecisions.has(input.decision)) throw new ServiceError('Invalid analysis decision.', 'VALIDATION')
  return client.$transaction(async transaction => {
    const analysis = await transaction.requirementAnalysisRevision.findFirst({
      where: { id: input.analysisRevisionId },
    })
    if (!analysis) throw new ServiceError('Requirement analysis revision not found.', 'NOT_FOUND')
    if (analysis.analysisHash !== input.expectedAnalysisHash)
      throw new ServiceError('Requirement analysis hash is stale.', 'CONFLICT')
    if (analysis.decision !== 'PENDING')
      throw new ServiceError('Requirement analysis decision is immutable.', 'CONFLICT')
    const proposal = requirementAnalysisProposalSchema.parse(parseJson(analysis.analysisJson, 'Requirement analysis'))
    const critique = critiqueRequirementAnalysis(proposal)
    const revision = await readRevision(transaction, analysis.qualityPlanRevisionId)
    if (input.qualityPlanId && revision.qualityPlanId !== input.qualityPlanId)
      throw new ServiceError('Requirement analysis does not belong to this Quality Plan.', 'NOT_FOUND')
    assertProposalMatchesSnapshots(proposal, revision.requirementSnapshots)
    const blockingQueries = (revision.queries ?? []).filter(query => query.status === 'BLOCKING')
    if (input.decision === 'APPROVED' && (critique.length || blockingQueries.length))
      throw new ServiceError(
        'Critique blockers or unresolved requirement queries prevent approval.',
        'CONFLICT',
        undefined,
        {
          critique,
          blockingQueryIds: blockingQueries.map(query => query.id),
        },
      )
    const decidedAt = new Date()
    const approvalHash =
      input.decision === 'APPROVED'
        ? hashCanonical({
            analysisHash: analysis.analysisHash,
            decidedAt: decidedAt.toISOString(),
            decidedBy: input.decidedBy,
          })
        : null
    const decided = await transaction.requirementAnalysisRevision.update({
      where: { id: analysis.id },
      data: immutableDecisionData(input, decidedAt, approvalHash),
    })
    if (input.decision === 'APPROVED') {
      for (const obligation of proposal.obligations) {
        const requirementSnapshotId = obligation.requirementIds[0]
        await transaction.qualityObligationRevision.create({
          data: {
            qualityPlanRevisionId: revision.id,
            requirementAnalysisRevisionId: analysis.id,
            requirementSnapshotId,
            title: obligation.id,
            intent: obligation.intent,
            assertionScopeJson: canonicalContractJson({
              obligationId: obligation.id,
              requirementIds: obligation.requirementIds,
              provenance: obligation.provenance,
            }),
            minimumAssurance: obligation.minimumAssurance,
            contentHash: hashCanonical({ analysisHash: analysis.analysisHash, obligation }),
          },
        })
      }
      await transaction.qualityPlanRevision.update({
        where: { id: revision.id },
        data: { status: 'REQUIREMENTS_APPROVED' },
      })
    }
    return analysisPayload(decided)
  })
}

async function readAnalysis(client: PrismaLike, analysisRevisionId: string) {
  const analysis = await client.requirementAnalysisRevision.findFirst({ where: { id: analysisRevisionId } })
  if (!analysis) throw new ServiceError('Requirement analysis revision not found.', 'NOT_FOUND')
  return analysis
}

export async function proposeValidationDesign(
  input: {
    targetProjectId: string
    qualityPlanRevisionId: string
    requirementAnalysisRevisionId: string
    expectedAnalysisHash: string
    expectedObligationSetHash: string
    proposal: unknown
  },
  client: PrismaLike = qualityOsDb,
  provider: MethodologyProvider = builtInMethodologyProvider,
) {
  const proposal = designProposalOrThrow(input.proposal, provider)
  const [revision, analysis] = await Promise.all([
    readRevision(client, input.qualityPlanRevisionId),
    readAnalysis(client, input.requirementAnalysisRevisionId),
  ])
  if (revision.targetProjectId !== input.targetProjectId || analysis.targetProjectId !== input.targetProjectId)
    throw new ServiceError('Validation design crosses target boundaries.', 'CONFLICT')
  if (analysis.id.startsWith('legacy-analysis:'))
    throw new ServiceError(
      'Legacy projected analysis is read-only. Publish and review an explicit successor analysis before designing validation.',
      'CONFLICT',
    )
  if (analysis.qualityPlanRevisionId !== revision.id || analysis.decision !== 'APPROVED')
    throw new ServiceError('Validation design requires an approved analysis for this exact plan revision.', 'CONFLICT')
  if (analysis.analysisHash !== input.expectedAnalysisHash)
    throw new ServiceError('Approved analysis hash is stale.', 'CONFLICT')
  const obligations = (revision.obligations ?? []).filter(
    obligation => obligation.requirementAnalysisRevisionId === analysis.id,
  )
  const currentObligationSetHash = obligationSetHash(obligations)
  if (currentObligationSetHash !== input.expectedObligationSetHash)
    throw new ServiceError('Quality obligation set hash is stale.', 'CONFLICT')
  const expectedObligationIds = obligations.map(obligation => obligation.id)
  const unknown = proposal.scenarios
    .flatMap(scenario => scenario.obligationIds)
    .filter(id => !expectedObligationIds.includes(id))
  if (unknown.length) throw new ServiceError('Validation scenario references an unknown obligation.', 'CONFLICT')
  const designHash = validationDesignHash(proposal, analysis.analysisHash, currentObligationSetHash)
  const existing = await client.validationDesignRevision.findFirst({
    where: { qualityPlanRevisionId: revision.id, designHash },
  })
  if (existing) return { idempotent: true, design: designPayload(existing) }
  const critique = critiqueValidationDesign(proposal, expectedObligationIds)
  const created = await client.validationDesignRevision.create({
    data: {
      targetProjectId: revision.targetProjectId,
      qualityPlanRevisionId: revision.id,
      requirementAnalysisRevisionId: analysis.id,
      revision: await nextRevision(client, 'validationDesignRevision', revision.id),
      status: 'IN_REVIEW',
      decision: 'PENDING',
      strategyJson: canonicalContractJson({
        methodology: proposal.methodology,
        requiredAssurance: proposal.requiredAssurance,
      }),
      scenarioPortfolioJson: canonicalContractJson(proposal.scenarios),
      critiqueJson: canonicalContractJson(critique),
      provenanceJson: canonicalContractJson({
        approvedAnalysisHash: analysis.analysisHash,
        obligationSetHash: currentObligationSetHash,
      }),
      designHash,
    },
  })
  await client.qualityPlanRevision.update({ where: { id: revision.id }, data: { status: 'SCENARIO_REVIEW' } })
  return { idempotent: false, design: designPayload(created) }
}

function designPayload(design: DesignRecord) {
  return {
    id: design.id,
    qualityPlanRevisionId: design.qualityPlanRevisionId,
    requirementAnalysisRevisionId: design.requirementAnalysisRevisionId,
    revision: design.revision,
    status: design.status,
    decision: design.decision,
    strategy: parseJson<unknown>(design.strategyJson, 'Validation strategy'),
    scenarios: parseJson<unknown>(design.scenarioPortfolioJson, 'Validation scenario portfolio'),
    critique: design.critiqueJson ? parseJson<unknown>(design.critiqueJson, 'Validation design critique') : [],
    provenance: parseJson<unknown>(design.provenanceJson, 'Validation design provenance'),
    designHash: design.designHash,
    approvalHash: design.approvalHash,
    decidedAt: design.decidedAt,
    decidedBy: design.decidedBy,
  }
}

export async function readValidationDesign(
  input: { qualityPlanRevisionId?: string; qualityPlanId?: string; validationDesignRevisionId?: string },
  client: PrismaLike = qualityOsDb,
) {
  const design = await client.validationDesignRevision.findFirst({
    where: {
      ...(input.qualityPlanRevisionId ? { qualityPlanRevisionId: input.qualityPlanRevisionId } : {}),
      ...(input.validationDesignRevisionId ? { id: input.validationDesignRevisionId } : {}),
    },
    orderBy: { revision: 'desc' },
  })
  if (!design) throw new ServiceError('Validation design revision not found.', 'NOT_FOUND')
  if (input.qualityPlanId) {
    const scopedRevision = await client.qualityPlanRevision.findFirst({
      where: { id: design.qualityPlanRevisionId, qualityPlanId: input.qualityPlanId },
    })
    if (!scopedRevision)
      throw new ServiceError('Validation design revision not found for this Quality Plan.', 'NOT_FOUND')
  }
  return designPayload(design)
}

export async function decideValidationDesign(
  input: {
    validationDesignRevisionId: string
    qualityPlanId?: string
    expectedDesignHash: string
    decision: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED'
    decidedBy: string
    rationale: string
  },
  client: PrismaLike = qualityOsDb,
) {
  if (!terminalDesignDecisions.has(input.decision))
    throw new ServiceError('Invalid validation design decision.', 'VALIDATION')
  return client.$transaction(async transaction => {
    const design = await transaction.validationDesignRevision.findFirst({
      where: { id: input.validationDesignRevisionId },
    })
    if (!design) throw new ServiceError('Validation design revision not found.', 'NOT_FOUND')
    if (design.designHash !== input.expectedDesignHash)
      throw new ServiceError('Validation design hash is stale.', 'CONFLICT')
    if (design.decision !== 'PENDING') throw new ServiceError('Validation design decision is immutable.', 'CONFLICT')
    const analysis = await readAnalysis(transaction, design.requirementAnalysisRevisionId)
    if (analysis.decision !== 'APPROVED')
      throw new ServiceError('Validation design analysis is no longer approved.', 'CONFLICT')
    const revision = await readRevision(transaction, design.qualityPlanRevisionId)
    if (input.qualityPlanId && revision.qualityPlanId !== input.qualityPlanId)
      throw new ServiceError('Validation design does not belong to this Quality Plan.', 'NOT_FOUND')
    const obligations = (revision.obligations ?? []).filter(
      obligation => obligation.requirementAnalysisRevisionId === analysis.id,
    )
    const provenance = parseJson<{ approvedAnalysisHash: string; obligationSetHash: string }>(
      design.provenanceJson,
      'Validation design provenance',
    )
    if (
      provenance.approvedAnalysisHash !== analysis.analysisHash ||
      provenance.obligationSetHash !== obligationSetHash(obligations)
    )
      throw new ServiceError('Validation design inputs are stale.', 'CONFLICT')
    const strategy = parseJson<{ methodology: MethodologyRef; requiredAssurance: string }>(
      design.strategyJson,
      'Validation strategy',
    )
    const scenarios = parseJson<ValidationDesignProposal['scenarios']>(
      design.scenarioPortfolioJson,
      'Validation scenario portfolio',
    )
    const proposal = validationDesignProposalSchema.parse({ schemaVersion: '1', ...strategy, scenarios })
    const critique = critiqueValidationDesign(
      proposal,
      obligations.map(obligation => obligation.id),
    )
    if (input.decision === 'APPROVED' && critique.length)
      throw new ServiceError('Validation design critique blockers prevent approval.', 'CONFLICT', undefined, {
        critique,
      })
    const decidedAt = new Date()
    const approvalHash =
      input.decision === 'APPROVED'
        ? hashCanonical({
            designHash: design.designHash,
            decidedAt: decidedAt.toISOString(),
            decidedBy: input.decidedBy,
          })
        : null
    const decided = await transaction.validationDesignRevision.update({
      where: { id: design.id },
      data: immutableDecisionData(input, decidedAt, approvalHash),
    })
    if (input.decision === 'APPROVED') {
      for (const scenario of proposal.scenarios) {
        const canonicalAst = { ...scenario, designHash: design.designHash }
        const validation = await transaction.validationVersion.create({
          data: {
            targetProjectId: design.targetProjectId,
            qualityPlanRevisionId: design.qualityPlanRevisionId,
            validationDesignRevisionId: design.id,
            validationIdentity: `${design.id}:${scenario.id}`,
            version: 1,
            ...approvedValidationState(design.designHash, input.decidedBy, decidedAt),
            canonicalAstJson: canonicalContractJson(canonicalAst),
            canonicalHash: hashCanonical(canonicalAst),
          },
        })
        for (const obligationId of scenario.obligationIds) {
          await transaction.obligationValidationVersion.create({
            data: {
              qualityPlanRevisionId: design.qualityPlanRevisionId,
              qualityObligationRevisionId: obligationId,
              validationVersionId: validation.id,
              coverageIntentJson: canonicalContractJson({
                scenarioId: scenario.id,
                failureMeaning: scenario.failureMeaning,
              }),
            },
          })
        }
      }
      await transaction.qualityPlanRevision.update({
        where: { id: revision.id },
        data: { status: 'SCENARIOS_APPROVED' },
      })
    }
    return designPayload(decided)
  })
}

export function approvedValidationState(designHash: string, approvedBy: string, approvedAt: Date) {
  return {
    status: 'SCENARIO_APPROVED' as const,
    scenarioApprovedAt: approvedAt,
    scenarioApprovedBy: approvedBy,
    scenarioApprovalHash: designHash,
  }
}

export function consentPolicy(input: {
  projectMode: ExecutionConsentMode
  requestedMode?: ExecutionConsentMode
  credentialRequired: boolean
  materialEffects: readonly string[]
  riskClassification?: 'READ_ONLY' | 'REVERSIBLE_WRITE' | 'MATERIAL_EFFECT'
  manifestDrift?: boolean
}) {
  const requestedMode = input.requestedMode ?? input.projectMode
  if (consentRank[requestedMode] < consentRank[input.projectMode])
    throw new ServiceError('A run may request stricter consent but cannot lower target consent policy.', 'CONFLICT')
  const hardGate =
    input.credentialRequired ||
    input.materialEffects.length > 0 ||
    input.riskClassification === 'MATERIAL_EFFECT' ||
    input.manifestDrift === true
  return {
    effectiveMode: requestedMode,
    explicitConsentRequired:
      hardGate ||
      requestedMode === 'ALWAYS_ASK' ||
      (requestedMode === 'RISK_AWARE' && input.riskClassification === 'REVERSIBLE_WRITE'),
    hardGate,
  }
}

export async function decideExecutionConsent(
  input: {
    consentId: string
    assessmentId?: string
    expectedManifestHash: string
    grantedBy: string
    expiresAt?: Date
  },
  client: PrismaLike = qualityOsDb,
) {
  const consent = await client.executionConsent.findFirst({ where: { id: input.consentId } })
  if (!consent) throw new ServiceError('Execution consent not found.', 'NOT_FOUND')
  if (input.assessmentId && consent.assessmentId !== input.assessmentId)
    throw new ServiceError('Execution consent does not belong to this Assessment.', 'NOT_FOUND')
  if (consent.executionManifestHash !== input.expectedManifestHash)
    throw new ServiceError('Execution manifest hash is stale.', 'CONFLICT')
  if (consent.status !== 'REQUESTED')
    throw new ServiceError('Execution consent is no longer awaiting a decision.', 'CONFLICT')
  return client.executionConsent.update({
    where: { id: consent.id },
    data: { status: 'GRANTED', grantedBy: input.grantedBy, grantedAt: new Date(), expiresAt: input.expiresAt },
  })
}

export async function revokeExecutionConsent(
  input: { consentId: string; assessmentId?: string; reason: string },
  client: PrismaLike = qualityOsDb,
) {
  const consent = await client.executionConsent.findFirst({ where: { id: input.consentId } })
  if (!consent) throw new ServiceError('Execution consent not found.', 'NOT_FOUND')
  if (input.assessmentId && consent.assessmentId !== input.assessmentId)
    throw new ServiceError('Execution consent does not belong to this Assessment.', 'NOT_FOUND')
  if (consent.status === 'CONSUMED') throw new ServiceError('Consumed execution consent cannot be revoked.', 'CONFLICT')
  if (consent.status === 'REVOKED') return consent
  return client.executionConsent.update({
    where: { id: consent.id },
    data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: input.reason },
  })
}

/** The caller supplies durable-run creation so consent consumption and run
 * creation occur inside one transaction rather than being two replayable APIs. */
const attributionEnum: Record<EvidenceAttribution['kind'], string> = {
  target_defect: 'TARGET_DEFECT',
  requirement_ambiguity: 'REQUIREMENT_AMBIGUITY',
  validation_design_defect: 'VALIDATION_DESIGN_DEFECT',
  validation_realization_defect: 'VALIDATION_REALIZATION_DEFECT',
  appraise_runtime_defect: 'APPRAISE_RUNTIME_DEFECT',
  environment_or_data_defect: 'ENVIRONMENT_OR_DATA_DEFECT',
  automation_blocked: 'AUTOMATION_BLOCKED',
  inconclusive: 'INCONCLUSIVE',
}

export async function recordAssessmentFinding(
  input: {
    assessmentId: string
    qualityObligationRevisionId: string
    evidenceReceiptIds: string[]
    expectedEvidenceSetHash?: string
    finding: unknown
    limitations?: unknown
  },
  client: PrismaLike = qualityOsDb,
) {
  const finding = obligationFindingSchema.parse(input.finding)
  if (finding.obligationId !== input.qualityObligationRevisionId)
    throw new ServiceError('Finding obligation does not match the requested obligation.', 'CONFLICT')
  uniqueIds(input.evidenceReceiptIds, 'Finding evidence')
  if (!input.evidenceReceiptIds.length)
    throw new ServiceError('A finding requires sealed evidence receipts.', 'VALIDATION')
  return client.$transaction(async transaction => {
    const assessment = await transaction.assessment.findFirst({ where: { id: input.assessmentId } })
    if (!assessment) throw new ServiceError('Assessment not found.', 'NOT_FOUND')
    if (assessment.status === 'DECIDED')
      throw new ServiceError('Assessment findings are immutable after decision.', 'CONFLICT')
    const obligation = await transaction.qualityObligationRevision.findFirst({
      where: { id: input.qualityObligationRevisionId, qualityPlanRevisionId: assessment.qualityPlanRevisionId },
    })
    if (!obligation) throw new ServiceError('Quality obligation not found for this Assessment.', 'NOT_FOUND')
    const receipts =
      (await transaction.evidenceReceipt.findMany?.({ where: { id: { in: input.evidenceReceiptIds } } })) ?? []
    if (receipts.length !== input.evidenceReceiptIds.length)
      throw new ServiceError('One or more evidence receipts were not found.', 'NOT_FOUND')
    if (
      receipts.some(
        receipt =>
          receipt.assessmentId !== assessment.id ||
          receipt.targetProjectId !== assessment.targetProjectId ||
          receipt.qualityPlanRevisionId !== assessment.qualityPlanRevisionId,
      )
    )
      throw new ServiceError('Finding evidence crosses Assessment or target boundaries.', 'CONFLICT')
    const receiptHashes = receipts.map(receipt => receipt.receiptHash)
    if (finding.attribution) {
      const attribution = evidenceAttributionSchema.parse(finding.attribution)
      if (attribution.supportingEvidenceHashes.some(hash => !receiptHashes.includes(hash)))
        throw new ServiceError('Attribution supporting evidence is not in the sealed finding evidence set.', 'CONFLICT')
    }
    const evidenceSetHash = hashCanonical([...receiptHashes].sort())
    if (input.expectedEvidenceSetHash && input.expectedEvidenceSetHash !== evidenceSetHash)
      throw new ServiceError('Finding evidence set hash is stale.', 'CONFLICT')
    const attribution = finding.attribution
    const findingHash = hashCanonical({
      assessmentId: assessment.id,
      obligationId: obligation.id,
      outcome: finding.outcome,
      attribution: attribution ?? null,
      evidenceSetHash,
      limitations: input.limitations ?? null,
    })
    const created = await transaction.assessmentFinding.create({
      data: {
        assessmentId: assessment.id,
        targetProjectId: assessment.targetProjectId,
        qualityPlanRevisionId: assessment.qualityPlanRevisionId,
        qualityObligationRevisionId: obligation.id,
        outcome: finding.outcome,
        attribution: attribution ? attributionEnum[attribution.kind] : 'NOT_APPLICABLE',
        attributionJson: canonicalContractJson(attribution ?? { kind: 'not_applicable' }),
        limitationsJson: input.limitations === undefined ? null : canonicalContractJson(input.limitations),
        evidenceSetHash,
        findingHash,
      },
    })
    for (const receipt of receipts) {
      await transaction.assessmentFindingEvidenceReceipt.create({
        data: { assessmentFindingId: created.id, evidenceReceiptId: receipt.id },
      })
    }
    return {
      id: created.id,
      findingHash,
      evidenceSetHash,
      targetOutcome: finding.outcome === 'VIOLATED' ? 'failed' : 'not_evaluated',
    }
  })
}
