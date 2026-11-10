import {
  reportFields,
  findingFields,
  observationFields,
  resourceFieldsProjection,
  publicFields,
  stringList,
  scenarioFields,
  authoredArtifactProjection,
  closureProjection,
} from './quality-journey-artifact-projection'
import { qualityJourneyArtifactMetadataSql, type JourneyArtifactMetadata } from './quality-journey-artifact-metadata'
import { artifactReferenceContractSchema } from '@/lib/quality-journey'
import { createHash } from 'node:crypto'
import {
  automationTargetBindingSchema,
  hashAutomationMaterialization,
  hashAutomationTargetBinding,
} from '@/lib/quality-journey/automation-contracts'
import {
  MaterializationSourceContractError,
  reconstructMaterializationSource,
} from '@/lib/quality-journey/materialization-source-contract'
import { isE2Digest, isE2Uint } from '@/lib/quality-journey/provider-grant-contract'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey/contracts'

import { Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

type Db = PrismaClient | Prisma.TransactionClient

const defaultLimit = 40
const maxLimit = 100
export type QualityJourneyArtifactLibraryEntry = {
  entryId: string
  kind: string
  title: string
  artifactId: string
  revisionId: string | null
  contentHash: string | null
  sourceContentHash: string | null
  projectionHash: string
  cycleId: string | null
  createdAt: Date
  lineage: Record<string, string>
  data: unknown
}
type QualityJourneyArtifactLibraryEntrySeed = Omit<
  QualityJourneyArtifactLibraryEntry,
  'sourceContentHash' | 'projectionHash'
>

export type QualityJourneyArtifactLibrary = {
  journey: { id: string; targetProjectId: string; status: string; stage: string; activeCycleId: string }
  kinds: string[]
  total: number
  offset: number
  limit: number
  entries: QualityJourneyArtifactLibraryEntry[]
}

function entryId(kind: string, id: string) {
  return `${kind}:${id}`
}

function parsed(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new ServiceError('Quality Journey durable artifact JSON is corrupt.', 'CONFLICT', 409)
  }
}

function sourceJson(value: string) {
  return parsed(value)
}

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function triageReportProjection(value: string) {
  return publicFields(sourceJson(value), reportFields)
}
function triageFindings(value: string) {
  const findings = record(sourceJson(value))?.findings
  if (!Array.isArray(findings)) throw new ServiceError('Report findings are corrupt.', 'CONFLICT')
  return findings.map(value => {
    const item = publicFields(value, findingFields)
    if (typeof item.findingId !== 'string') throw new ServiceError('Report finding identity is corrupt.', 'CONFLICT')
    return { ...item, findingId: item.findingId }
  })
}

function evidenceProjection(value: string) {
  const evidence = record(sourceJson(value))
  if (!evidence) throw new ServiceError('Quality Journey sealed evidence JSON is corrupt.', 'CONFLICT', 409)
  return Object.fromEntries(
    [
      'status',
      'result',
      'evidenceHealth',
      'journeyId',
      'targetProjectId',
      'cycleId',
      'executionCycleId',
      'testRunId',
      'runId',
      'preparedCapsuleId',
      'scenarioRevisionId',
    ].flatMap(key => (typeof evidence[key] === 'string' ? [[key, evidence[key]]] : [])),
  )
}

function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

function normalizePage(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value ?? fallback), 0), maximum)
}

async function scopedJourney(input: { journeyId: string; targetProjectId: string }, db: Db) {
  const journey = await db.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: { id: true, targetProjectId: true, status: true, stage: true, activeCycleId: true },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  return journey
}

function sortEntries(entries: QualityJourneyArtifactLibraryEntrySeed[]): QualityJourneyArtifactLibraryEntry[] {
  return entries
    .map(entry => ({
      ...entry,
      sourceContentHash: entry.contentHash,
      projectionHash: hash({
        entryId: entry.entryId,
        kind: entry.kind,
        artifactId: entry.artifactId,
        revisionId: entry.revisionId,
        sourceContentHash: entry.contentHash,
        cycleId: entry.cycleId,
        lineage: entry.lineage,
        data: entry.data,
      }),
    }))
    .sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || left.entryId.localeCompare(right.entryId),
    )
}

// Immutable history is an inspection projection, never a source-use or effect capability.
const historyRepresentation = 'M06_MATERIALIZATION_HISTORY_V1'
const historyLimit = 4096
type HistoryKind = 'TEST_SUITE' | 'TEST_CASE'
type HistorySource = Prisma.QualityJourneyAutomationMaterializationGetPayload<object>
type HistoryBinding = Prisma.QualityJourneyAutomationTargetBindingGetPayload<object>
type HistoryRefusalReason =
  | 'HISTORICAL_LINEAGE_UNPROVEN'
  | 'ENROLLMENT_PROVENANCE_UNPROVEN'
  | 'FROZEN_SOURCE_MISSING_OR_UNSUPPORTED'
  | 'FROZEN_BINDING_CORRUPT_OR_HASH_MISMATCH'
  | 'AMBIGUOUS_FROZEN_VERSIONS'
  | 'HISTORY_SOURCE_BOUNDS_EXCEEDED'
  | 'HISTORY_QUERY_CAPABILITY_UNAVAILABLE'

class HistoryRefusal extends Error {
  constructor(readonly reasonCode: HistoryRefusalReason) {
    super(reasonCode)
  }
}

function refuseHistory(reasonCode: HistoryRefusalReason): never {
  throw new HistoryRefusal(reasonCode)
}

function validHistoryDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function historyMetadata(kind: HistoryKind, id: string, scope: { journeyId: string; targetProjectId: string }, sources: HistorySource[]) {
  if (!sources.length || sources.some(source =>
    source.journeyId !== scope.journeyId || source.targetProjectId !== scope.targetProjectId ||
    (kind === 'TEST_SUITE' ? source.suiteId : source.testCaseId) !== id ||
    typeof source.id !== 'string' || !source.id || !validHistoryDate(source.createdAt))) {
    throw new ServiceError('Quality Journey history scope metadata is unavailable.', 'CONFLICT', 409)
  }
  const lineage: Record<string, string> = { targetProjectId: scope.targetProjectId }
  if (sources.length <= historyLimit) lineage.materializedBy = [...new Set(sources.map(source => source.id))].sort().join(',')
  return {
    entryId: entryId(kind, id), kind, artifactId: id, revisionId: null, cycleId: null,
    createdAt: new Date(sources.reduce((earliest, source) => Math.min(earliest, source.createdAt.getTime()), Infinity)),
    lineage,
  }
}

async function historicalEnrollment(source: HistorySource, db: Db): Promise<'LEGACY' | 'E2'> {
  if (![source.journeyId, source.targetProjectId, source.cycleId, source.workItemId, source.attemptId, source.leaseId]
    .every(value => qualityJourneyIdentifierSchema.safeParse(value).success) ||
    typeof source.inputHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(source.inputHash)) {
    return refuseHistory('HISTORICAL_LINEAGE_UNPROVEN')
  }
  if (typeof db.qualityJourneyWorkAttempt?.findUnique !== 'function' ||
    typeof db.qualityJourneyWorkItem?.findUnique !== 'function' ||
    typeof db.qualityJourneyWorkAuthorization?.findUnique !== 'function' ||
    typeof db.qualityJourneyWorkAttemptSessionBinding?.findUnique !== 'function') {
    return refuseHistory('HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
  }
  const [attempt, work, binding] = await Promise.all([
    db.qualityJourneyWorkAttempt.findUnique({
      where: { id: source.attemptId },
      select: { id: true, workItemId: true, leaseId: true, authorizationId: true, assignmentId: true, assignmentGeneration: true },
    }),
    db.qualityJourneyWorkItem.findUnique({
      where: { id: source.workItemId },
      select: { id: true, journeyId: true, targetProjectId: true, cycleId: true, role: true, inputHash: true },
    }),
    db.qualityJourneyWorkAttemptSessionBinding.findUnique({
      where: { attemptId: source.attemptId },
      select: {
        attemptId: true, journeyId: true, targetProjectId: true, sessionId: true, coordinatorGeneration: true,
        assignmentGeneration: true, workItemId: true, role: true, authorizationId: true, leaseId: true,
        inputHash: true, assignmentId: true, provenance: true,
      },
    }),
  ])
  if (!attempt || !work || !binding ||
    !qualityJourneyIdentifierSchema.safeParse(attempt.authorizationId).success ||
    !isE2Uint(attempt.assignmentGeneration) || !attempt.assignmentGeneration ||
    !(attempt.assignmentId === null || qualityJourneyIdentifierSchema.safeParse(attempt.assignmentId).success) ||
    attempt.id !== source.attemptId || attempt.workItemId !== source.workItemId || attempt.leaseId !== source.leaseId ||
    work.id !== source.workItemId || work.journeyId !== source.journeyId || work.targetProjectId !== source.targetProjectId ||
    work.cycleId !== source.cycleId || work.role !== 'AUTOMATOR' || work.inputHash !== source.inputHash ||
    binding.attemptId !== attempt.id || binding.workItemId !== work.id || binding.journeyId !== source.journeyId ||
    binding.targetProjectId !== source.targetProjectId || binding.role !== 'AUTOMATOR' ||
    binding.authorizationId !== attempt.authorizationId || binding.leaseId !== attempt.leaseId ||
    binding.assignmentId !== attempt.assignmentId || binding.assignmentGeneration !== attempt.assignmentGeneration ||
    binding.inputHash !== source.inputHash) return refuseHistory('HISTORICAL_LINEAGE_UNPROVEN')
  // The schema permits a null authorization; that absence cannot prove complete historical lineage.
  if (!attempt.authorizationId) return refuseHistory('HISTORICAL_LINEAGE_UNPROVEN')
  const authorization = await db.qualityJourneyWorkAuthorization.findUnique({
    where: { id: attempt.authorizationId },
    select: { id: true, journeyId: true, targetProjectId: true, workItemId: true, role: true },
  })
  if (!authorization || authorization.id !== attempt.authorizationId || authorization.workItemId !== work.id ||
    authorization.journeyId !== source.journeyId || authorization.targetProjectId !== source.targetProjectId ||
    authorization.role !== 'AUTOMATOR') return refuseHistory('HISTORICAL_LINEAGE_UNPROVEN')
  if (binding.sessionId === null && binding.coordinatorGeneration === null) {
    if (binding.provenance === 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1') return 'LEGACY'
    return refuseHistory('ENROLLMENT_PROVENANCE_UNPROVEN')
  }
  if (!qualityJourneyIdentifierSchema.safeParse(binding.sessionId).success ||
    !isE2Uint(binding.coordinatorGeneration) || !binding.coordinatorGeneration ||
    binding.provenance !== 'CLAIM_SESSION_V1') return refuseHistory('ENROLLMENT_PROVENANCE_UNPROVEN')
  if (typeof db.qualityJourneyCoordinatorSession?.findUnique !== 'function') {
    return refuseHistory('HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
  }
  const session = await db.qualityJourneyCoordinatorSession.findUnique({
    where: { id: binding.sessionId! },
    select: { id: true, journeyId: true, targetProjectId: true, generation: true,
      e2EnrollmentKind: true, e2EnrollmentDigest: true, e2EnrolledAt: true },
  })
  if (!session || session.id !== binding.sessionId || session.journeyId !== source.journeyId ||
    session.targetProjectId !== source.targetProjectId || session.generation !== binding.coordinatorGeneration) {
    return refuseHistory('ENROLLMENT_PROVENANCE_UNPROVEN')
  }
  if ([session.e2EnrollmentKind, session.e2EnrollmentDigest, session.e2EnrolledAt].every(value => value === null)) {
    if (typeof db.qualityJourneyE2Retirement?.findFirst !== 'function') {
      return refuseHistory('HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
    }
    const orphan = await db.qualityJourneyE2Retirement.findFirst({
      where: { coordinatorSessionId: session.id }, select: { id: true },
    })
    if (orphan) return refuseHistory('ENROLLMENT_PROVENANCE_UNPROVEN')
    return 'LEGACY'
  }
  if (session.e2EnrollmentKind !== 'E2_V1' || !isE2Digest(session.e2EnrollmentDigest) ||
    !validHistoryDate(session.e2EnrolledAt) || !isE2Uint(session.generation) || !session.generation) {
    return refuseHistory('ENROLLMENT_PROVENANCE_UNPROVEN')
  }
  return 'E2'
}

function verifiedHistoryPacket(binding: HistoryBinding, source: HistorySource) {
  const corrupt = (): never => refuseHistory('FROZEN_BINDING_CORRUPT_OR_HASH_MISMATCH')
  if (typeof binding.bindingJson !== 'string') return corrupt()
  if (Buffer.byteLength(binding.bindingJson, 'utf8') > 1_048_576) return refuseHistory('HISTORY_SOURCE_BOUNDS_EXCEEDED')
  let value: unknown
  try { value = JSON.parse(binding.bindingJson) } catch { return corrupt() }
  let nodes = 0
  const visit = (node: unknown, depth: number): void => {
    if (++nodes > 65_536 || depth > 32) refuseHistory('HISTORY_SOURCE_BOUNDS_EXCEEDED')
    if (Array.isArray(node)) for (const item of node) visit(item, depth + 1)
    else if (node && typeof node === 'object') for (const item of Object.values(node)) visit(item, depth + 1)
  }
  visit(value, 0)
  const parsedBinding = automationTargetBindingSchema.safeParse(value)
  if (!parsedBinding.success) return corrupt()
  const packet = parsedBinding.data
  if (canonicalContractJson(packet) !== binding.bindingJson || packet.targetProjectId !== source.targetProjectId ||
    binding.targetProjectId !== packet.targetProjectId || binding.suiteId !== packet.suite.id ||
    binding.testCaseId !== packet.testCase.id || packet.suite.id !== source.suiteId || packet.testCase.id !== source.testCaseId ||
    binding.stepHash !== hashAutomationMaterialization(packet.testCase.steps) ||
    binding.suiteHash !== hashAutomationMaterialization({ targetProjectId: packet.targetProjectId, moduleId: packet.moduleId, suite: packet.suite }) ||
    binding.testCaseHash !== hashAutomationTargetBinding(packet) ||
    binding.semanticHash !== hashAutomationMaterialization({
      schemaVersion: packet.schemaVersion, targetProjectId: packet.targetProjectId, moduleId: packet.moduleId,
      suite: { name: packet.suite.name, description: packet.suite.description },
      testCase: { title: packet.testCase.title, description: packet.testCase.description, steps: packet.testCase.steps },
    })) return corrupt()
  return packet
}

async function materializedHistoryEntry(
  kind: HistoryKind,
  id: string,
  scope: { journeyId: string; targetProjectId: string },
  seeds: HistorySource[],
  db: Db,
): Promise<QualityJourneyArtifactLibraryEntrySeed | null> {
  // Null means positively proven legacy; only that result may enter the live inspection branch.
  let metadata = historyMetadata(kind, id, scope, seeds)
  try {
    if (typeof db.qualityJourneyAutomationMaterialization?.findMany !== 'function') {
      return refuseHistory('HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
    }
    const sources = await db.qualityJourneyAutomationMaterialization.findMany({
      where: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
        ...(kind === 'TEST_SUITE' ? { suiteId: id } : { testCaseId: id }) },
      orderBy: { id: 'asc' }, take: historyLimit + 1,
    })
    // A disappearing set or invalid scope/time is an infrastructure/integrity error, not an empty successful history.
    metadata = historyMetadata(kind, id, scope, sources)
    if (sources.length > historyLimit || new Set(sources.map(source => source.id)).size !== sources.length) {
      return refuseHistory('HISTORY_SOURCE_BOUNDS_EXCEEDED')
    }
    const enrollments: Array<'LEGACY' | 'E2'> = []
    for (const source of sources) enrollments.push(await historicalEnrollment(source, db))
    if (enrollments.every(enrollment => enrollment === 'LEGACY')) return null
    if (typeof db.qualityJourneyAutomationMaterializationSourceProof?.findUnique !== 'function' ||
      typeof db.qualityJourneyArtifact?.findUnique !== 'function' ||
      typeof db.qualityJourneyAutomationMaterializationBinding?.findMany !== 'function' ||
      typeof db.qualityJourneyAutomationTargetBinding?.findUnique !== 'function') {
      return refuseHistory('HISTORY_QUERY_CAPABILITY_UNAVAILABLE')
    }
    const associationIds = new Set<string>()
    const bindingIds = new Set<string>()
    const projections = []
    let sourceBytes: string | undefined
    let selectedPacket: ReturnType<typeof verifiedHistoryPacket> | undefined
    let sourceContentHash: string | undefined
    for (const source of sources) {
      if (!qualityJourneyIdentifierSchema.safeParse(source.artifactRecordId).success) {
        return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
      }
      const associations = await db.qualityJourneyAutomationMaterializationBinding.findMany({
        where: { materializationId: source.id }, orderBy: { bindingId: 'asc' }, take: historyLimit + 1,
      })
      if (associations.length > historyLimit) return refuseHistory('HISTORY_SOURCE_BOUNDS_EXCEEDED')
      for (const association of associations) {
        if (association.materializationId !== source.id || !qualityJourneyIdentifierSchema.safeParse(association.bindingId).success) {
          return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
        }
        const identity = canonicalContractJson([association.materializationId, association.bindingId])
        if (associationIds.has(identity)) return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
        associationIds.add(identity)
        bindingIds.add(association.bindingId)
      }
      if (associationIds.size > historyLimit || bindingIds.size > historyLimit) {
        return refuseHistory('HISTORY_SOURCE_BOUNDS_EXCEEDED')
      }
      // Read every returned endpoint, without filtering by its owning Journey or current live resources.
      const [proof, artifact, bindings] = await Promise.all([
        db.qualityJourneyAutomationMaterializationSourceProof.findUnique({ where: { materializationId: source.id } }),
        db.qualityJourneyArtifact.findUnique({ where: { id: source.artifactRecordId } }),
        Promise.all(associations.map(association =>
          db.qualityJourneyAutomationTargetBinding.findUnique({ where: { id: association.bindingId } }))),
      ])
      if (!proof || !artifact || bindings.some(binding => !binding) ||
        associations.length !== 1 || bindings.length !== 1 ||
        bindings.some((binding, index) => binding?.id !== associations[index].bindingId)) {
        return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
      }
      const binding = bindings[0]!
      try {
        reconstructMaterializationSource({ materialization: source, proof, artifact,
          materializationBindings: associations, targetBindings: [binding] })
      } catch (error) {
        if (error instanceof MaterializationSourceContractError) return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
        throw error
      }
      const packet = verifiedHistoryPacket(binding, source)
      const bytes = kind === 'TEST_SUITE'
        ? canonicalContractJson({ targetProjectId: packet.targetProjectId, moduleId: packet.moduleId, suite: packet.suite })
        : binding.bindingJson
      if (sourceBytes !== undefined && sourceBytes !== bytes) return refuseHistory('AMBIGUOUS_FROZEN_VERSIONS')
      sourceBytes = bytes
      selectedPacket = packet
      sourceContentHash = kind === 'TEST_SUITE' ? binding.suiteHash : binding.testCaseHash
      projections.push({ materializationId: source.id, bindingId: binding.id, cycleId: source.cycleId,
        scenarioRevisionId: source.scenarioRevisionId, materializationHash: source.materializationHash,
        bindingHash: binding.testCaseHash, suiteHash: binding.suiteHash, stepHash: binding.stepHash })
    }
    if (!selectedPacket || !sourceContentHash) return refuseHistory('FROZEN_SOURCE_MISSING_OR_UNSUPPORTED')
    return { ...metadata,
      title: kind === 'TEST_SUITE' ? selectedPacket.suite.name : selectedPacket.testCase.title,
      contentHash: sourceContentHash,
      data: { status: 'FROZEN_HISTORY', representation: historyRepresentation,
        description: kind === 'TEST_SUITE' ? selectedPacket.suite.description : selectedPacket.testCase.description,
        sourceRepresentation: kind === 'TEST_SUITE' ? 'SUITE_CANONICAL_PACKET' : 'CANONICAL_TARGET_BINDING_PACKET',
        timestampBasis: 'EARLIEST_SCOPED_MATERIALIZATION',
        sources: projections.sort((left, right) => left.materializationId.localeCompare(right.materializationId) ||
          left.bindingId.localeCompare(right.bindingId)),
      },
    }
  } catch (error) {
    if (!(error instanceof HistoryRefusal)) throw error
    return { ...metadata,
      title: kind === 'TEST_SUITE' ? 'Test suite history unavailable' : 'Test case history unavailable',
      contentHash: null,
      data: { status: 'REFUSED_FROZEN_HISTORY', representation: historyRepresentation,
        reasonCode: error.reasonCode, sourceRepresentation: 'UNAVAILABLE' },
    }
  }
}

async function collect(
  input: { journeyId: string; targetProjectId: string; source?: string; recordId?: string },
  db: Db,
) {
  const journey = await scopedJourney(input, db)
  const where = { journeyId: input.journeyId, targetProjectId: input.targetProjectId }
  const readSource = <T>(sources: string[], read: () => Promise<T[]>): Promise<T[]> =>
    !input.source || sources.includes(input.source) ? read() : Promise.resolve([])
  const recordFilter = input.recordId ? { id: input.recordId } : {}
  const [
    requirements,
    artifacts,
    artifactLinks,
    cycles,
    analyses,
    discoveries,
    portfolios,
    scenarios,
    scenarioDecisions,
    scenarioComments,
    scenarioDecisionReceipts,
    analysisDecisions,
    analysisPublications,
    materializations,
    capsules,
    executionCycles,
    executionRuns,
    evidence,
    reports,
    reviews,
    reruns,
    consents,
    cancellations,
    blockers,
    closures,
  ] = await Promise.all([
    readSource(['REQUIREMENT_REVISION'], () =>
      db.qualityJourneyRevision.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { revision: 'asc' },
      }),
    ),
    readSource(['ARTIFACT'], () =>
      db.qualityJourneyArtifact.findMany({ where: { ...where, ...recordFilter }, orderBy: { createdAt: 'asc' } }),
    ),
    readSource(['ARTIFACT_LINK'], () =>
      db.qualityJourneyArtifactLink.findMany({ where: { ...where, ...recordFilter }, orderBy: { createdAt: 'asc' } }),
    ),
    readSource(['CYCLE'], () =>
      db.qualityJourneyCycle.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { sequence: 'asc' },
      }),
    ),
    readSource(['ANALYSIS_REVISION'], () =>
      db.qualityJourneyAnalysisRevision.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { revision: 'asc' },
      }),
    ),
    readSource(['DISCOVERY_REVISION'], () =>
      db.qualityJourneyDiscoveryRevision.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['SCENARIO_PORTFOLIO'], () =>
      db.qualityJourneyScenarioPortfolioRevision.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { revision: 'asc' },
      }),
    ),
    readSource(['SCENARIO_REVISION'], () =>
      db.qualityJourneyScenarioRevision.findMany({
        where: {
          ...recordFilter,
          portfolioRevision: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        },
        include: { portfolioRevision: { select: { cycleId: true, artifactRevisionId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['SCENARIO_DECISION'], () =>
      db.qualityJourneyScenarioDecision.findMany({
        where: {
          ...recordFilter,
          portfolioRevision: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        },
        include: { portfolioRevision: { select: { cycleId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['SCENARIO_REVIEW_COMMENT'], () =>
      db.qualityJourneyScenarioReviewComment.findMany({
        where: {
          ...recordFilter,
          portfolioRevision: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['SCENARIO_DECISION_RECEIPT'], () =>
      db.qualityJourneyScenarioDecisionReceipt.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['ANALYSIS_DECISION'], () =>
      db.qualityJourneyAnalysisDecision.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['ANALYSIS_PUBLICATION'], () =>
      db.qualityJourneyAnalysisPublication.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { publishedAt: 'asc' },
      }),
    ),
    readSource(['MATERIALIZATION', 'TEST_SUITE', 'TEST_CASE'], () =>
      db.qualityJourneyAutomationMaterialization.findMany({
        where: {
          ...where,
          ...(input.source === 'TEST_SUITE'
            ? { suiteId: input.recordId }
            : input.source === 'TEST_CASE'
              ? { testCaseId: input.recordId }
              : recordFilter),
        },
        orderBy: input.source === 'TEST_SUITE' || input.source === 'TEST_CASE' ? { id: 'asc' } : { createdAt: 'asc' },
        ...(input.source === 'TEST_SUITE' || input.source === 'TEST_CASE' ? { take: historyLimit + 1 } : {}),
      }),
    ),
    readSource(['PREPARED_RUNTIME_CAPSULE'], () =>
      db.qualityJourneyPreparedRuntimeCapsule.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['EXECUTION_CYCLE'], () =>
      db.qualityJourneyExecutionCycle.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { startedAt: 'asc' },
      }),
    ),
    readSource(['TEST_RUN'], () =>
      db.qualityJourneyExecutionTestRun.findMany({
        where: { ...recordFilter, executionCycle: where },
        include: {
          executionCycle: { select: { cycleId: true } },
          testRun: {
            select: {
              id: true,
              runId: true,
              name: true,
              status: true,
              result: true,
              startedAt: true,
              completedAt: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['SEALED_EVIDENCE'], () =>
      db.qualityJourneyExecutionEvidenceReceipt.findMany({
        where: { ...recordFilter, executionCycle: where },
        include: { executionCycle: { select: { cycleId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['TRIAGE_REPORT'], () =>
      db.qualityJourneyTriageReport.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['REPORT_REVIEW'], () =>
      db.qualityJourneyReportReview.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['RERUN_PROPOSAL'], () =>
      db.qualityJourneyExecutionRerunProposal.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['EXECUTION_CONSENT'], () =>
      db.qualityJourneyExecutionConsent.findMany({
        where: { ...where, ...recordFilter },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['EXECUTION_CANCELLATION'], () =>
      db.qualityJourneyExecutionCancellationReceipt.findMany({
        where: { ...recordFilter, journeyId: input.journeyId },
        orderBy: { createdAt: 'asc' },
      }),
    ),
    readSource(['BLOCKER'], () =>
      db.qualityJourneyBlocker.findMany({ where: { ...where, ...recordFilter }, orderBy: { createdAt: 'asc' } }),
    ),
    readSource(['CLOSURE'], () =>
      db.qualityJourneyClosure.findMany({ where: { journeyId: input.journeyId, ...recordFilter } }),
    ),
  ])

  const materializedSuiteIds = input.source && input.source !== 'TEST_SUITE'
    ? [] : [...new Set(materializations.flatMap(item => item.suiteId ? [item.suiteId] : []))].sort()
  const materializedCaseIds = input.source && input.source !== 'TEST_CASE'
    ? [] : [...new Set(materializations.flatMap(item => item.testCaseId ? [item.testCaseId] : []))].sort()
  const historyEntries: QualityJourneyArtifactLibraryEntrySeed[] = []
  const legacySuiteIds: string[] = []
  const legacyCaseIds: string[] = []
  for (const id of materializedSuiteIds) {
    const entry = await materializedHistoryEntry('TEST_SUITE', id, input,
      materializations.filter(source => source.suiteId === id), db)
    if (entry) historyEntries.push(entry)
    else legacySuiteIds.push(id)
  }
  for (const id of materializedCaseIds) {
    const entry = await materializedHistoryEntry('TEST_CASE', id, input,
      materializations.filter(source => source.testCaseId === id), db)
    if (entry) historyEntries.push(entry)
    else legacyCaseIds.push(id)
  }
  const [suites, cases] = await Promise.all([
    legacySuiteIds.length
      ? db.testSuite.findMany({ where: { id: { in: legacySuiteIds }, targetProjectId: input.targetProjectId } })
      : Promise.resolve([]),
    legacyCaseIds.length
      ? db.testCase.findMany({ where: { id: { in: legacyCaseIds }, targetProjectId: input.targetProjectId } })
      : Promise.resolve([]),
  ])

  const entries: QualityJourneyArtifactLibraryEntrySeed[] = [
    ...historyEntries,
    ...closures.map(item => ({
      entryId: entryId('CLOSURE', item.id),
      kind: 'JOURNEY_CLOSURE',
      title: 'Immutable journey closure',
      artifactId: item.id,
      revisionId: item.reportRevisionId,
      contentHash: item.contentHash,
      cycleId: item.cycleId,
      createdAt: item.closedAt,
      lineage: { journeyId: item.journeyId, reportRevisionId: item.reportRevisionId },
      data: closureProjection(item.closureJson, item.contentHash),
    })),
    ...requirements.map(item => ({
      entryId: entryId('REQUIREMENT_REVISION', item.id),
      kind: 'REQUIREMENT_REVISION',
      title: `Requirement revision ${item.revision}`,
      artifactId: item.id,
      revisionId: String(item.revision),
      contentHash: item.contentHash,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, revision: String(item.revision) },
      data: publicFields(sourceJson(item.contentJson), {
        schemaVersion: true,
        objective: true,
        context: true,
        coverageRigor: true,
        testDimensions: true,
        includedScope: true,
        excludedScope: true,
        environmentIds: true,
        actors: true,
        testDataNeeds: true,
        constraints: true,
        risks: true,
        desiredEvidenceSignals: true,
      }),
    })),
    ...artifacts.map(item => ({
      entryId: entryId('ARTIFACT', item.id),
      kind: item.kind,
      title: item.kind.replaceAll('_', ' '),
      artifactId: item.artifactId,
      revisionId: item.revisionId,
      contentHash: item.contentHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, artifactRecordId: item.id },
      // Generic artifacts can originate at specialized worker boundaries. Parse
      // them for integrity, but expose only their durable identity; each known
      // artifact family has its own explicit library projection below.
      data: authoredArtifactProjection(item.kind, sourceJson(item.artifactJson)),
    })),
    ...artifactLinks.map(item => ({
      entryId: entryId('ARTIFACT_LINK', item.id),
      kind: 'ARTIFACT_LINK',
      title: `Artifact link: ${item.relation}`,
      artifactId: item.id,
      revisionId: null,
      contentHash: item.linkHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, cycleId: item.cycleId, relation: item.relation },
      data: {
        source: artifactReferenceContractSchema.parse(sourceJson(item.sourceJson)),
        target: artifactReferenceContractSchema.parse(sourceJson(item.targetJson)),
      },
    })),
    ...cycles.map(item => ({
      entryId: entryId('CYCLE', item.id),
      kind: 'CYCLE',
      title: `Journey cycle ${item.sequence}`,
      artifactId: item.id,
      revisionId: String(item.sequence),
      contentHash: null,
      cycleId: item.id,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        ...(item.predecessorCycleId ? { predecessorCycleId: item.predecessorCycleId } : {}),
      },
      data: publicFields(sourceJson(item.scopeJson), {
        reason: true,
        reportRevisionId: true,
        remediationScope: true,
        predecessorCycleId: true,
        scenarioRevisionIds: [true],
      }),
    })),
    ...analyses.map(item => ({
      entryId: entryId('ANALYSIS_REVISION', item.id),
      kind: 'ANALYSIS_REVISION',
      title: `Analysis revision ${item.revision}`,
      artifactId: item.artifactRevisionId,
      revisionId: item.artifactRevisionId,
      contentHash: item.contentHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        artifactRecordId: item.artifactRecordId,
        ...(item.predecessorRevisionId ? { predecessorRevisionId: item.predecessorRevisionId } : {}),
      },
      data: { submissionHash: item.submissionHash, inputHash: item.inputHash },
    })),
    ...discoveries.map(item => ({
      entryId: entryId('DISCOVERY_REVISION', item.id),
      kind: 'DISCOVERY_REVISION',
      title: 'Discovery revision',
      artifactId: item.id,
      revisionId: item.id,
      contentHash: item.completionHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        analysisRevisionId: item.analysisRevisionId,
        ...(item.predecessorRevisionId ? { predecessorRevisionId: item.predecessorRevisionId } : {}),
      },
      data: {
        status: item.status,
        scopeHash: item.scopeHash,
        completionHash: item.completionHash,
        targetObservations: item.targetObservationJson
          ? publicFields(sourceJson(item.targetObservationJson), observationFields)
          : null,
        resourceResolution: item.resourceResolutionJson
          ? publicFields(sourceJson(item.resourceResolutionJson), resourceFieldsProjection)
          : null,
      },
    })),
    ...portfolios.map(item => ({
      entryId: entryId('SCENARIO_PORTFOLIO', item.id),
      kind: 'SCENARIO_PORTFOLIO',
      title: `Scenario portfolio revision ${item.revision}`,
      artifactId: item.artifactRevisionId,
      revisionId: item.artifactRevisionId,
      contentHash: item.contentHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        discoveryRevisionId: item.discoveryRevisionId,
        ...(item.predecessorPortfolioRevisionId
          ? { predecessorPortfolioRevisionId: item.predecessorPortfolioRevisionId }
          : {}),
      },
      data: {
        status: item.status,
        behavioralIntentHash: item.behavioralIntentHash,
        approvedIntentHash: item.approvedIntentHash,
        approvedCoverageHash: item.approvedCoverageHash,
        decisionSetHash: item.decisionSetHash,
      },
    })),
    ...scenarios.map(item => ({
      entryId: entryId('SCENARIO_REVISION', item.id),
      kind: 'SCENARIO_REVISION',
      title: `Scenario ${item.stableScenarioId}`,
      artifactId: item.stableScenarioId,
      revisionId: item.scenarioRevisionId,
      contentHash: item.contentHash,
      cycleId: item.portfolioRevision.cycleId,
      createdAt: item.createdAt,
      lineage: {
        scenarioRevisionId: item.scenarioRevisionId,
        portfolioRevisionId: item.portfolioRevision.artifactRevisionId,
      },
      data: {
        behavioralIntent: publicFields(sourceJson(item.behavioralIntentJson), scenarioFields),
        enrichment: publicFields(sourceJson(item.enrichmentJson), {
          observationIds: [true],
          resourceAssumptionIds: [true],
          feasibilityNotes: [true],
        }),
        layout: publicFields(sourceJson(item.layoutJson), { x: true, y: true, sequence: true }),
      },
    })),
    ...scenarioDecisions.map(item => ({
      entryId: entryId('SCENARIO_DECISION', item.id),
      kind: 'SCENARIO_DECISION',
      title: `Scenario decision: ${item.decision}`,
      artifactId: item.id,
      revisionId: item.scenarioRevisionId,
      contentHash: item.contentHash,
      cycleId: item.portfolioRevision.cycleId,
      createdAt: item.createdAt,
      lineage: {
        portfolioRevisionId: item.portfolioRevisionId,
        scenarioRevisionId: item.scenarioRevisionId,
        ...(item.carriedFromDecisionId ? { carriedFromDecisionId: item.carriedFromDecisionId } : {}),
      },
      data: { decision: item.decision, feedback: item.feedback, actor: item.actor },
    })),
    ...analysisDecisions.map(item => ({
      entryId: entryId('ANALYSIS_DECISION', item.id),
      kind: 'ANALYSIS_DECISION',
      title: `Analysis decision: ${item.decision}`,
      artifactId: item.id,
      revisionId: item.analysisRevisionId,
      contentHash: item.contentHash,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        analysisRevisionId: item.analysisRevisionId,
        artifactRecordId: item.artifactRecordId,
      },
      data: { decision: item.decision, actor: item.actor, reviewHash: item.reviewHash },
    })),
    ...analysisPublications.map(item => ({
      entryId: entryId('ANALYSIS_PUBLICATION', item.id),
      kind: 'ANALYSIS_PUBLICATION',
      title: 'Analysis publication',
      artifactId: item.id,
      revisionId: item.analysisRevisionId,
      contentHash: item.artifactHash,
      cycleId: null,
      createdAt: item.publishedAt,
      lineage: { journeyId: item.journeyId, analysisRevisionId: item.analysisRevisionId, commandId: item.commandId },
      data: { reviewHash: item.reviewHash },
    })),
    ...scenarioComments.map(item => ({
      entryId: entryId('SCENARIO_REVIEW_COMMENT', item.id),
      kind: 'SCENARIO_REVIEW_COMMENT',
      title: 'Scenario review comment',
      artifactId: item.id,
      revisionId: item.scenarioRevisionId,
      contentHash: null,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: { portfolioRevisionId: item.portfolioRevisionId },
      data: { comment: item.comment, blocking: item.blocking, disposition: item.disposition, actor: item.actor },
    })),
    ...scenarioDecisionReceipts.map(item => ({
      entryId: entryId('SCENARIO_DECISION_RECEIPT', item.id),
      kind: 'SCENARIO_DECISION_RECEIPT',
      title: 'Scenario decision receipt',
      artifactId: item.id,
      revisionId: item.portfolioRevisionId,
      contentHash: item.requestHash,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, portfolioRevisionId: item.portfolioRevisionId },
      data: { immutable: true },
    })),
    ...materializations.map(item => ({
      entryId: entryId('MATERIALIZATION', item.id),
      kind: 'MATERIALIZATION',
      title: `Automator materialization: ${item.status}`,
      artifactId: item.id,
      revisionId: item.scenarioRevisionId,
      contentHash: item.materializationHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: {
        scenarioRevisionId: item.scenarioRevisionId,
        portfolioRevisionId: item.portfolioRevisionId,
        decisionId: item.decisionId,
        artifactRecordId: item.artifactRecordId,
        ...(item.suiteId ? { suiteId: item.suiteId } : {}),
        ...(item.testCaseId ? { testCaseId: item.testCaseId } : {}),
      },
      data: {
        status: item.status,
        failureKind: item.failureKind,
        scenarioContentHash: item.scenarioContentHash,
        portfolioContentHash: item.portfolioContentHash,
        decisionHash: item.decisionHash,
      },
    })),
    ...capsules.map(item => ({
      entryId: entryId('PREPARED_RUNTIME_CAPSULE', item.id),
      kind: 'PREPARED_RUNTIME_CAPSULE',
      title: 'Prepared runtime capsule',
      artifactId: item.id,
      revisionId: item.materializationId,
      contentHash: item.capsuleHash,
      cycleId: item.cycleId,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, materializationId: item.materializationId },
      data: {
        status: item.status,
        inputHash: item.inputHash,
        manifestHash: item.manifestHash,
        // Runtime invocation and data values are deliberately outside the public projection.
      },
    })),
    ...suites.map(item => ({
      entryId: entryId('TEST_SUITE', item.id),
      kind: 'TEST_SUITE',
      title: item.name,
      artifactId: item.id,
      revisionId: null,
      contentHash: null,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: {
        targetProjectId: item.targetProjectId,
        materializedBy: materializations
          .filter(materialization => materialization.suiteId === item.id)
          .map(materialization => materialization.id)
          .join(','),
      },
      data: { description: item.description },
    })),
    ...cases.map(item => ({
      entryId: entryId('TEST_CASE', item.id),
      kind: 'TEST_CASE',
      title: item.title,
      artifactId: item.id,
      revisionId: null,
      contentHash: null,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: {
        targetProjectId: item.targetProjectId,
        materializedBy: materializations
          .filter(materialization => materialization.testCaseId === item.id)
          .map(materialization => materialization.id)
          .join(','),
      },
      data: { description: item.description },
    })),
    ...executionCycles.map(item => ({
      entryId: entryId('EXECUTION_CYCLE', item.id),
      kind: 'EXECUTION_CYCLE',
      title: `Execution cycle: ${item.status}`,
      artifactId: item.id,
      revisionId: null,
      contentHash: item.stateHash,
      cycleId: item.cycleId,
      createdAt: item.startedAt,
      lineage: {
        journeyId: item.journeyId,
        cycleId: item.cycleId,
        ...(item.predecessorExecutionCycleId ? { predecessorExecutionCycleId: item.predecessorExecutionCycleId } : {}),
      },
      data: {
        status: item.status,
        preparedCapsulesHash: item.preparedCapsulesHash,
        targetFingerprint: item.targetFingerprint,
        browserEngine: item.browserEngine,
        completedAt: item.completedAt,
      },
    })),
    ...executionRuns.map(item => ({
      entryId: entryId('TEST_RUN', item.id),
      kind: 'TEST_RUN',
      title: item.testRun.name,
      artifactId: item.testRun.runId,
      revisionId: item.preparedCapsuleId,
      contentHash: null,
      cycleId: item.executionCycle.cycleId,
      createdAt: item.createdAt,
      lineage: {
        executionCycleId: item.executionCycleId,
        preparedCapsuleId: item.preparedCapsuleId,
        testRunId: item.testRunId,
      },
      data: {
        status: item.status,
        runStatus: item.testRun.status,
        result: item.testRun.result,
        startedAt: item.testRun.startedAt,
        completedAt: item.testRun.completedAt,
      },
    })),
    ...evidence.map(item => ({
      entryId: entryId('SEALED_EVIDENCE', item.id),
      kind: 'SEALED_EVIDENCE',
      title: 'Sealed execution evidence',
      artifactId: item.id,
      revisionId: item.testRunId,
      contentHash: item.receiptHash,
      cycleId: item.executionCycle.cycleId,
      createdAt: item.createdAt,
      lineage: {
        executionCycleId: item.executionCycleId,
        testRunId: item.testRunId,
        runtimeBytesHash: item.runtimeBytesHash,
      },
      data: evidenceProjection(item.evidenceJson),
    })),
    ...reports.map(item => ({
      entryId: entryId('TRIAGE_REPORT', item.id),
      kind: 'TRIAGE_REPORT',
      title: 'Triage report revision',
      artifactId: item.id,
      revisionId: item.id,
      contentHash: item.contentHash,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, assignmentId: item.assignmentId },
      data: triageReportProjection(item.reportJson),
    })),
    ...reports.flatMap(item =>
      triageFindings(item.reportJson).map(finding => ({
        entryId: entryId('TRIAGE_FINDING', `${item.id}:${finding.findingId}`),
        kind: 'TRIAGE_FINDING',
        title: `Triage finding: ${finding.findingId}`,
        artifactId: finding.findingId,
        revisionId: item.id,
        contentHash: item.contentHash,
        cycleId: null,
        createdAt: item.createdAt,
        lineage: { journeyId: item.journeyId, reportRevisionId: item.id, findingId: finding.findingId },
        data: finding,
      })),
    ),
    ...reviews.map(item => ({
      entryId: entryId('REPORT_REVIEW', item.id),
      kind: 'REPORT_REVIEW',
      title: `Report review: ${item.kind}`,
      artifactId: item.id,
      revisionId: item.reportRevisionId,
      contentHash: null,
      cycleId: item.successorCycleId,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        reportRevisionId: item.reportRevisionId,
        ...(item.successorCycleId ? { successorCycleId: item.successorCycleId } : {}),
      },
      data: { kind: item.kind, feedback: item.feedback },
    })),
    ...reruns.map(item => ({
      entryId: entryId('RERUN_PROPOSAL', item.id),
      kind: 'RERUN_PROPOSAL',
      title: `Rerun proposal: ${item.status}`,
      artifactId: item.id,
      revisionId: item.reportRevisionId,
      contentHash: item.proposalHash,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        sourceExecutionCycleId: item.sourceExecutionCycleId,
        ...(item.successorExecutionCycleId ? { successorExecutionCycleId: item.successorExecutionCycleId } : {}),
      },
      data: {
        status: item.status,
        reason: item.reason,
        reportHash: item.reportHash,
        approvedAt: item.approvedAt,
        selectedScenarios: stringList(sourceJson(item.selectedScenariosJson)),
        // Source evidence is individually addressable through sealed receipt entries.
      },
    })),
    ...consents.map(item => ({
      entryId: entryId('EXECUTION_CONSENT', item.id),
      kind: 'EXECUTION_CONSENT',
      title: `Execution consent: ${item.status}`,
      artifactId: item.id,
      revisionId: null,
      contentHash: item.scopeHash,
      cycleId: item.executionCycleId,
      createdAt: item.createdAt,
      lineage: {
        journeyId: item.journeyId,
        ...(item.executionCycleId ? { executionCycleId: item.executionCycleId } : {}),
      },
      data: {
        status: item.status,
        grantSource: item.grantSource,
        grantedAt: item.grantedAt,
        expiresAt: item.expiresAt,
        usedAt: item.usedAt,
        revokedAt: item.revokedAt,
      },
    })),
    ...cancellations.map(item => ({
      entryId: entryId('EXECUTION_CANCELLATION', item.id),
      kind: 'EXECUTION_CANCELLATION',
      title: 'Execution cancellation receipt',
      artifactId: item.id,
      revisionId: null,
      contentHash: item.requestHash,
      cycleId: item.executionCycleId,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId, executionCycleId: item.executionCycleId },
      data: { immutable: true },
    })),
    ...blockers.map(item => ({
      entryId: entryId('BLOCKER', item.id),
      kind: 'BLOCKER',
      title: item.summary,
      artifactId: item.id,
      revisionId: null,
      contentHash: null,
      cycleId: null,
      createdAt: item.createdAt,
      lineage: { journeyId: item.journeyId },
      data: {
        reasonCode: item.reasonCode,
        status: item.status,
        responsibleActor: item.responsibleActor,
        requiredResolution: item.requiredResolution,
      },
    })),
  ]

  return { journey, entries: sortEntries(entries) }
}

/** SQL projects only metadata and paginates the complete cross-source library. */
export async function listQualityJourneyArtifactLibrary(
  input: { journeyId: string; targetProjectId: string; kind?: string; query?: string; offset?: number; limit?: number },
  client: Db = prisma,
): Promise<QualityJourneyArtifactLibrary> {
  const journey = await scopedJourney(input, client)
  const offset = normalizePage(input.offset, 0, Number.MAX_SAFE_INTEGER)
  const limit = normalizePage(input.limit, defaultLimit, maxLimit) || defaultLimit
  const sql = qualityJourneyArtifactMetadataSql(input)
  const kind = input.kind ?? null
  const query = input.query?.trim().slice(0, 200) || null
  const filter = Prisma.sql`WHERE (${kind} IS NULL OR kind=${kind})
    AND (${query} IS NULL
      OR instr(lower(title), lower(${query})) > 0
      OR instr(lower(entryId), lower(${query})) > 0
      OR instr(lower(artifactId), lower(${query})) > 0
      OR instr(lower(COALESCE(revisionId, '')), lower(${query})) > 0
      OR instr(lower(COALESCE(contentHash, '')), lower(${query})) > 0)`
  const [rows, counts] = await Promise.all([
    client.$queryRaw<JourneyArtifactMetadata[]>(
      Prisma.sql`WITH metadata AS (${sql}) SELECT * FROM metadata ${filter} ORDER BY createdAt DESC, entryId ASC LIMIT ${limit} OFFSET ${offset}`,
    ),
    client.$queryRaw<Array<{ kind: string; total: bigint }>>(
      Prisma.sql`WITH metadata AS (${sql}) SELECT kind, COUNT(*) AS total FROM metadata ${filter} GROUP BY kind`,
    ),
  ])
  return {
    journey,
    offset,
    limit,
    kinds: counts.map(item => item.kind).sort(),
    total: counts.reduce((sum, item) => sum + Number(item.total), 0),
    entries: sortEntries(
      rows.map(({ source, recordId, createdAt, ...row }) => ({
        ...row,
        createdAt: new Date(createdAt),
        lineage: { source, recordId },
        data: null,
      })),
    ),
  }
}

export async function getQualityJourneyLibraryArtifact(
  input: { journeyId: string; targetProjectId: string; entryId: string },
  client: Db = prisma,
) {
  await scopedJourney(input, client)
  const typedRoot = /^(TEST_SUITE|TEST_CASE):(.+)$/.exec(input.entryId)
  if (typedRoot && qualityJourneyIdentifierSchema.safeParse(typedRoot[2]).success) {
    const { journey, entries } = await collect({ ...input, source: typedRoot[1], recordId: typedRoot[2] }, client)
    const entry = entries.find(candidate => candidate.entryId === input.entryId)
    if (!entry) throw new ServiceError('Quality Journey artifact was not found.', 'NOT_FOUND', 404)
    return { journey, entry }
  }
  const sql = qualityJourneyArtifactMetadataSql(input)
  const [metadata] = await client.$queryRaw<JourneyArtifactMetadata[]>(
    Prisma.sql`WITH metadata AS (${sql}) SELECT * FROM metadata WHERE entryId=${input.entryId} LIMIT 1`,
  )
  if (!metadata) throw new ServiceError('Quality Journey artifact was not found.', 'NOT_FOUND', 404)
  const { journey, entries } = await collect({ ...input, source: metadata.source, recordId: metadata.recordId }, client)
  const entry = entries.find(candidate => candidate.entryId === input.entryId)
  if (!entry) throw new ServiceError('Quality Journey artifact was not found.', 'NOT_FOUND', 404)
  return { journey, entry }
}

export async function exportQualityJourney(input: { journeyId: string; targetProjectId: string }, client: Db = prisma) {
  const { journey, entries } = await collect(input, client)
  const manifest = { format: 'appraise.quality-journey-artifact-library/v1', journey, artifacts: entries }
  return { ...manifest, contentHash: hash(manifest) }
}
