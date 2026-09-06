import { assertQualityJourneyMutable } from './quality-journey-terminal'
import { createHash, randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  QualityJourney,
  QualityJourneyCommand,
  QualityJourneyWorkAttempt,
  QualityJourneyWorkItem,
} from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  AgentFactoryDispatchNotStartedError,
  createQualityJourneyKernelState,
  createReplacementAssignment,
  createWorkerSpawnRequest,
  dispatchWorkerSpawnRequest,
  hashQualityJourneyState,
  journeyCommandResultSchema,
  journeyCommandSchema,
  journeyArtifactLinkSchema,
  qualityJourneyContractDigest,
  qualityJourneyRoleDefinitions,
  qualityJourneyRoleRegistryVersion,
  qualityJourneyWorkItemId,
  runnableQualityJourneyRoles,
  reconstructQualityJourneyRunner,
  resolveQualityJourneyCapabilityProfile,
  resolveQualityJourneyRoleDefinition,
  resolveAgentFactoryProviderAdapter,
  submitQualityJourneyCommand,
  validateWorkerResult,
  validateWorkerSpawnReceipt,
  workerResultEnvelopeSchema,
  type AssignmentManifest,
  type QualityJourneyKernelState,
  type QualityJourneyRole,
  type QualityJourneyStage,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import { getQualityJourneyDiscoveryBootstrap } from './quality-journey-discovery-bootstrap'

type Db = PrismaClient | Prisma.TransactionClient
const json = (value: unknown) => canonicalContractJson(value)
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')
const parseArray = (value: string): string[] => JSON.parse(value) as string[]
const parseRecord = (value: string): Record<string, string> => JSON.parse(value) as Record<string, string>

type FactoryAuthorization = Pick<
  AssignmentManifest,
  | 'schemaVersion'
  | 'journeyId'
  | 'targetProjectId'
  | 'workItemId'
  | 'roleDefinition'
  | 'capabilityProfile'
  | 'inputArtifacts'
  | 'allowedTargetRoutes'
  | 'allowedResourceIds'
  | 'targetEnvironmentBindings'
  | 'writableArtifactKinds'
  | 'scope'
  | 'completionCriteria'
> & { authorizationId: string }

function roleAuthority(role: QualityJourneyRole, version: string = qualityJourneyRoleRegistryVersion) {
  const roleDefinition = resolveQualityJourneyRoleDefinition(version, role)
  if (!roleDefinition) throw new ServiceError('Quality Journey role authority is unavailable.', 'CONFLICT')
  const capabilityProfile = resolveQualityJourneyCapabilityProfile(version, roleDefinition.capabilityProfileId)
  if (!capabilityProfile) throw new ServiceError('Quality Journey capability profile is unavailable.', 'CONFLICT')
  return { roleDefinition, capabilityProfile }
}

function factoryAuthorization(
  authorizationId: string,
  journey: Pick<QualityJourney, 'id' | 'targetProjectId'>,
  item: Pick<
    QualityJourneyWorkItem,
    'id' | 'role' | 'inputArtifactRefsJson' | 'allowedOutputsJson' | 'completionCriteriaJson' | 'authorizationScopeJson'
  >,
  registryVersion: string = qualityJourneyRoleRegistryVersion,
): FactoryAuthorization {
  const { roleDefinition, capabilityProfile } = roleAuthority(item.role as QualityJourneyRole, registryVersion)
  const persistedScope = JSON.parse(item.authorizationScopeJson) as Partial<
    Pick<FactoryAuthorization, 'allowedTargetRoutes' | 'allowedResourceIds' | 'targetEnvironmentBindings' | 'scope'>
  >
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    authorizationId,
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    workItemId: item.id,
    roleDefinition: {
      role: roleDefinition.role,
      version: registryVersion,
      digest: qualityJourneyContractDigest(roleDefinition),
    },
    capabilityProfile: {
      profileId: capabilityProfile.profileId,
      version: registryVersion,
      digest: qualityJourneyContractDigest(capabilityProfile),
    },
    inputArtifacts: JSON.parse(item.inputArtifactRefsJson),
    allowedTargetRoutes: persistedScope.allowedTargetRoutes ?? [],
    allowedResourceIds: persistedScope.allowedResourceIds ?? [],
    ...(persistedScope.targetEnvironmentBindings
      ? { targetEnvironmentBindings: persistedScope.targetEnvironmentBindings }
      : {}),
    writableArtifactKinds: JSON.parse(item.allowedOutputsJson),
    scope: persistedScope.scope ?? {
      permittedTools: [...roleDefinition.permittedTools],
      permittedCommands: [...roleDefinition.permittedCommands],
      filesystemPaths: [],
      networkOrigins: [],
      credentialGrantIds: [],
      targetAccess: item.role === 'SCOUT' ? 'READ_ONLY' : 'NONE',
    },
    completionCriteria: JSON.parse(item.completionCriteriaJson),
  }
}

function validateFactoryAuthorization(
  authorization: {
    id: string
    journeyId: string
    targetProjectId: string
    workItemId: string
    role: QualityJourneyRole
    roleContractDigest: string
    capabilityProfileId: string
    capabilityProfileHash: string
    authorizationJson: string
    authorizationHash: string
  },
  journey: Pick<QualityJourney, 'id' | 'targetProjectId'>,
  item: QualityJourneyWorkItem,
): FactoryAuthorization {
  const persisted = JSON.parse(authorization.authorizationJson) as FactoryAuthorization
  const canonical = factoryAuthorization(authorization.id, journey, item, persisted.roleDefinition.version)
  const bindings = [
    [authorization.authorizationHash, hash(persisted)],
    [json(persisted), json(canonical)],
    [authorization.journeyId, journey.id],
    [authorization.targetProjectId, journey.targetProjectId],
    [authorization.workItemId, item.id],
    [authorization.role, item.role],
    [authorization.roleContractDigest, canonical.roleDefinition.digest],
    [persisted.roleDefinition.digest, canonical.roleDefinition.digest],
    [persisted.roleDefinition.version, canonical.roleDefinition.version],
    [authorization.capabilityProfileId, canonical.capabilityProfile.profileId],
    [authorization.capabilityProfileHash, canonical.capabilityProfile.digest],
    [persisted.capabilityProfile.version, canonical.capabilityProfile.version],
  ]
  if (bindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality Journey work authorization is invalid.', 'UNAUTHORIZED')
  return canonical
}

function assignmentFromAuthorization(
  authorization: FactoryAuthorization,
  item: QualityJourneyWorkItem,
  attempt: { id: string; leaseId: string; leaseExpiresAt: Date; heartbeatSeconds: number },
  inputArtifacts = authorization.inputArtifacts,
): AssignmentManifest {
  return {
    schemaVersion: authorization.schemaVersion,
    journeyId: authorization.journeyId,
    targetProjectId: authorization.targetProjectId,
    workItemId: authorization.workItemId,
    roleDefinition: authorization.roleDefinition,
    capabilityProfile: authorization.capabilityProfile,
    inputArtifacts,
    allowedTargetRoutes: authorization.allowedTargetRoutes,
    allowedResourceIds: authorization.allowedResourceIds,
    ...(authorization.targetEnvironmentBindings
      ? { targetEnvironmentBindings: authorization.targetEnvironmentBindings }
      : {}),
    writableArtifactKinds: authorization.writableArtifactKinds,
    scope: authorization.scope,
    completionCriteria: authorization.completionCriteria,
    assignmentId: `qjma_${attempt.id}`,
    stateHash: item.inputHash,
    inputHash: item.inputHash,
    lease: {
      leaseId: attempt.leaseId,
      expiresAt: attempt.leaseExpiresAt.toISOString(),
      heartbeatSeconds: attempt.heartbeatSeconds,
    },
    idempotencyKey: `assignment_${attempt.id}`,
  }
}

function projection(row: QualityJourney) {
  const activeRevisionIds = parseRecord(row.activeRevisionIdsJson)
  const analysisReviewHash = row.analysisReviewHash ?? undefined
  const unresolvedQuestionIds = parseArray(row.unresolvedQuestionIdsJson)
  const blockerIds = parseArray(row.blockerIdsJson)
  const activeWorkItemIds = parseArray(row.activeWorkItemIdsJson)
  const permittedCommands = createQualityJourneyKernelState({
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    activeCycleId: row.activeCycleId,
    stage: row.stage as QualityJourneyStage,
    activeRevisionIds,
    analysisReviewHash,
    unresolvedQuestionIds,
    blockerIds,
    activeWorkItemIds,
  }).permittedCommands
  return {
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    stage: row.stage as QualityJourneyStage,
    status: row.status,
    activeCycleId: row.activeCycleId,
    activeRevisionIds,
    analysisReviewHash,
    unresolvedQuestionIds,
    blockerIds,
    activeWorkItemIds,
    permittedCommands,
    stateHash: row.stateHash,
    version: row.version,
  }
}

async function readJourney(journeyId: string, targetProjectId: string, db: Db) {
  const row = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!row) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  return row
}

async function createWorkAuthorization(
  row: Pick<QualityJourney, 'id' | 'targetProjectId'>,
  item: QualityJourneyWorkItem,
  db: Db,
  maxAttempts = 3,
  supersedesAuthorizationId?: string,
) {
  const authorizationId = `qjwa_${createHash('sha256')
    .update(`${row.id}:${item.id}:${supersedesAuthorizationId ?? 'initial'}`)
    .digest('hex')
    .slice(0, 24)}`
  const authorization = factoryAuthorization(authorizationId, row, item)
  await db.qualityJourneyWorkAuthorization.create({
    data: {
      id: authorizationId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      workItemId: item.id,
      ...(supersedesAuthorizationId ? { supersedesAuthorizationId } : {}),
      role: item.role,
      roleContractDigest: item.roleContractDigest,
      capabilityProfileId: authorization.capabilityProfile.profileId,
      capabilityProfileHash: authorization.capabilityProfile.digest,
      authorizationJson: json(authorization),
      authorizationHash: hash(authorization),
      maxAttempts,
    },
  })
}

async function currentWorkAuthorization(workItemId: string, db: Db) {
  return db.qualityJourneyWorkAuthorization.findFirst({
    where: { workItemId, successorAuthorization: { is: null } },
  })
}

/** Internal issuance repair for a specialized stage compiler that has just
 * persisted its bounded input artifacts and scope before the work is claimed. */
export async function refreshQualityJourneyWorkAuthorizationInTransaction(
  journeyId: string,
  workItemId: string,
  tx: Prisma.TransactionClient,
) {
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  assertQualityJourneyMutable(journey)
  const item = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: workItemId } })
  const predecessor = await currentWorkAuthorization(item.id, tx)
  if (!predecessor) throw new ServiceError('Specialized work issuance has no authorization to supersede.', 'CONFLICT')
  await createWorkAuthorization(journey, item, tx, 3, predecessor.id)
}

/** A revision request is a new, transcript-free Analyzer authorization. Its
 * input is derived only from immutable predecessor artifacts, not coordinator
 * memory or a prior worker's transcript. */
async function predecessorAnalysisInputArtifacts(
  row: QualityJourney,
  db: Db,
): Promise<AssignmentManifest['inputArtifacts']> {
  const predecessorRevisionId = parseRecord(row.activeRevisionIdsJson).analysis
  if (!predecessorRevisionId)
    throw new ServiceError(
      'Analysis revision work cannot be reissued without an active predecessor charter.',
      'CONFLICT',
    )
  const predecessor = await db.qualityJourneyAnalysisRevision.findFirst({
    where: { journeyId: row.id, artifactRevisionId: predecessorRevisionId },
    include: {
      artifact: true,
      questions: { include: { artifact: true, answers: { include: { artifact: true } } } },
    },
  })
  if (!predecessor)
    throw new ServiceError('Analysis revision work cannot be reissued without durable predecessor lineage.', 'CONFLICT')
  const feedback = await db.qualityJourneyArtifact.findFirst({
    where: {
      journeyId: row.id,
      kind: 'ANALYSIS_REVISION_FEEDBACK',
      revisionId: predecessorRevisionId,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!feedback)
    throw new ServiceError('Analysis revision work cannot be reissued without durable user feedback.', 'CONFLICT')
  const artifacts = [
    predecessor.artifact,
    ...predecessor.questions.flatMap(question => [
      question.artifact,
      ...question.answers.map(answer => answer.artifact),
    ]),
    feedback,
  ]
  return artifacts
    .map(artifact => ({
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      ...(artifact.revisionId ? { revisionId: artifact.revisionId } : {}),
      contentHash: artifact.contentHash,
    }))
    .sort((left, right) =>
      canonicalContractJson(left).localeCompare(canonicalContractJson(right)),
    ) as AssignmentManifest['inputArtifacts']
}

/** A successor Designer sees canonical predecessor revisions, accumulated
 * decisions and feedback—not a prior worker's private transcript. */
async function completedDiscoveryScenarioInputs(
  row: QualityJourney,
  db: Db,
): Promise<AssignmentManifest['inputArtifacts']> {
  const discovery = row.activeDiscoveryRevisionId
    ? await db.qualityJourneyDiscoveryRevision.findUnique({ where: { id: row.activeDiscoveryRevisionId } })
    : null
  if (
    !discovery ||
    discovery.status !== 'COMPLETED' ||
    !discovery.targetObservationHash ||
    !discovery.resourceResolutionHash
  )
    throw new ServiceError(
      'Scenario revision work cannot be reissued without exact completed discovery authority.',
      'CONFLICT',
    )
  return [
    {
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: discovery.analysisArtifactId,
      revisionId: discovery.analysisRevisionArtifactId,
      contentHash: discovery.analysisRevisionContentHash,
    },
    { kind: 'TARGET_OBSERVATION_BUNDLE', artifactId: discovery.id, contentHash: discovery.targetObservationHash },
    { kind: 'RESOURCE_RESOLUTION_BUNDLE', artifactId: discovery.id, contentHash: discovery.resourceResolutionHash },
  ] as AssignmentManifest['inputArtifacts']
}

async function predecessorScenarioPortfolioInputArtifacts(
  row: QualityJourney,
  db: Db,
): Promise<AssignmentManifest['inputArtifacts']> {
  const predecessorRevisionId = parseRecord(row.activeRevisionIdsJson).scenarioPortfolio
  if (!predecessorRevisionId)
    throw new ServiceError(
      'Scenario revision work cannot be reissued without an active predecessor portfolio.',
      'CONFLICT',
    )
  const predecessor = await db.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { journeyId: row.id, artifactRevisionId: predecessorRevisionId, status: 'REVISION_REQUIRED' },
    include: { scenarios: { include: { decisions: true } } },
  })
  if (!predecessor)
    throw new ServiceError('Scenario revision work cannot be reissued without durable predecessor lineage.', 'CONFLICT')
  const feedback = await db.qualityJourneyArtifact.findFirst({
    where: { journeyId: row.id, kind: 'SCENARIO_REVISION_FEEDBACK', revisionId: predecessorRevisionId },
    orderBy: { createdAt: 'desc' },
  })
  if (!feedback)
    throw new ServiceError('Scenario revision work cannot be reissued without durable user feedback.', 'CONFLICT')
  const discoveryInputs = await completedDiscoveryScenarioInputs(row, db)
  const artifacts = [
    ...discoveryInputs,
    {
      kind: 'SCENARIO_PORTFOLIO_REVISION',
      artifactId: predecessor.artifactId,
      revisionId: predecessor.artifactRevisionId,
      contentHash: predecessor.contentHash,
    },
    ...predecessor.scenarios.map(scenario => ({
      kind: 'SCENARIO_REVISION',
      artifactId: scenario.stableScenarioId,
      revisionId: scenario.scenarioRevisionId,
      contentHash: scenario.contentHash,
    })),
    {
      kind: feedback.kind,
      artifactId: feedback.artifactId,
      ...(feedback.revisionId ? { revisionId: feedback.revisionId } : {}),
      contentHash: feedback.contentHash,
    },
  ]
  return artifacts.sort((left, right) =>
    canonicalContractJson(left).localeCompare(canonicalContractJson(right)),
  ) as AssignmentManifest['inputArtifacts']
}

function isCompletedActiveWorkItem(
  item: QualityJourneyWorkItem | null,
  role: QualityJourneyRole,
  stage: QualityJourneyStage,
  row: QualityJourney,
  activeWorkItemIds: readonly string[],
): item is QualityJourneyWorkItem {
  return Boolean(
    item &&
    item.role === role &&
    row.stage === stage &&
    item.status === 'COMPLETED' &&
    activeWorkItemIds.includes(item.id),
  )
}

async function reissueCompletedAnalysisWorkItem(
  row: QualityJourney,
  item: QualityJourneyWorkItem | null,
  activeWorkItemIds: readonly string[],
  roleContractDigest: string,
  db: Db,
) {
  if (!isCompletedActiveWorkItem(item, 'REQUIREMENT_ANALYZER', 'ANALYSIS', row, activeWorkItemIds)) return item
  const [inputArtifacts, authorization] = await Promise.all([
    predecessorAnalysisInputArtifacts(row, db),
    currentWorkAuthorization(item.id, db),
  ])
  if (!authorization)
    throw new ServiceError('Analysis revision work has no predecessor Factory authorization to supersede.', 'CONFLICT')
  const reissued = await db.qualityJourneyWorkItem.update({
    where: { id: item.id },
    data: {
      status: 'ELIGIBLE',
      inputHash: row.stateHash,
      inputArtifactRefsJson: json(inputArtifacts),
      roleContractDigest,
      version: { increment: 1 },
    },
  })
  await createWorkAuthorization(row, reissued, db, 3, authorization.id)
  return reissued
}

async function reissueCompletedScenarioDesignerWorkItem(
  row: QualityJourney,
  item: QualityJourneyWorkItem | null,
  activeWorkItemIds: readonly string[],
  roleContractDigest: string,
  db: Db,
) {
  if (!isCompletedActiveWorkItem(item, 'TEST_SCENARIO_DESIGNER', 'SCENARIO_DESIGN', row, activeWorkItemIds)) return item
  const [inputArtifacts, authorization] = await Promise.all([
    predecessorScenarioPortfolioInputArtifacts(row, db),
    currentWorkAuthorization(item.id, db),
  ])
  if (!authorization)
    throw new ServiceError('Scenario revision work has no predecessor Factory authorization to supersede.', 'CONFLICT')
  const reissued = await db.qualityJourneyWorkItem.update({
    where: { id: item.id },
    data: {
      status: 'ELIGIBLE',
      inputHash: row.stateHash,
      inputArtifactRefsJson: json(inputArtifacts),
      roleContractDigest,
      version: { increment: 1 },
    },
  })
  await createWorkAuthorization(row, reissued, db, 3, authorization.id)
  return reissued
}

async function ensureEligibleWorkItems(row: QualityJourney, db: Db) {
  const roles = eligibleRolesForAutomaticIssuance(row.stage as QualityJourneyStage)
  const activeWorkItemIds = parseArray(row.activeWorkItemIdsJson)
  for (const role of roles) {
    const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
    const id = qualityJourneyWorkItemId(row.id, row.activeCycleId, role)
    const existingItem = await db.qualityJourneyWorkItem.findUnique({ where: { id } })
    let item = existingItem
    const roleContractDigest = qualityJourneyContractDigest(definition)
    item = await reissueCompletedAnalysisWorkItem(row, item, activeWorkItemIds, roleContractDigest, db)
    item = await reissueCompletedScenarioDesignerWorkItem(row, item, activeWorkItemIds, roleContractDigest, db)
    if (!item) {
      item = await db.qualityJourneyWorkItem.create({
        data: {
          id,
          journeyId: row.id,
          targetProjectId: row.targetProjectId,
          cycleId: row.activeCycleId,
          role,
          status: 'ELIGIBLE',
          inputHash: row.stateHash,
          roleContractDigest,
          allowedOutputsJson: json(definition.writableArtifacts),
          completionCriteriaJson: json([`Submit a contract-valid ${role} result envelope.`]),
        },
      })
      await createWorkAuthorization(row, item, db)
    }
  }
}

function eligibleRolesForAutomaticIssuance(stage: QualityJourneyStage) {
  // Discovery assignments have immutable, role-specific scopes compiled from
  // the approved analysis. They are issued only by the discovery service.
  // Discovery and Automation both have compiler-owned assignments. Their
  // scope must be frozen from approved artifacts before Factory authorization.
  return stage === 'DISCOVERY' || stage === 'AUTOMATION' || stage === 'TRIAGE'
    ? []
    : runnableQualityJourneyRoles(stage, [])
}

export type DiscoveryWorkItemSpec = {
  id: string
  role: Extract<QualityJourneyRole, 'SCOUT' | 'RESOURCE_EXPLORER'>
  inputHash: string
  inputArtifacts: AssignmentManifest['inputArtifacts']
  authorizationScope: Pick<
    FactoryAuthorization,
    'allowedTargetRoutes' | 'allowedResourceIds' | 'targetEnvironmentBindings' | 'scope'
  >
  completionCriteria: readonly string[]
}

/** Issued only after the discovery revision has frozen its authority.  Keeping
 * this beside Factory authorization creation makes a claim replay validate the
 * same persisted scope the discovery compiler issued. */
export async function issueQualityJourneyDiscoveryWorkItems(
  row: QualityJourney,
  specs: readonly DiscoveryWorkItemSpec[],
  tx: Prisma.TransactionClient,
) {
  for (const spec of specs)
    await issueQualityJourneySpecializedWorkItem(row, { ...spec, conflictLabel: 'Discovery' }, tx)
}

/** Creates a frozen specialized work item after its phase compiler has derived
 * input lineage.  Generic automatic issuance is intentionally not sufficient
 * for roles whose input is revision/hash bound. */
export async function issueQualityJourneySpecializedWorkItem(
  row: Pick<QualityJourney, 'id' | 'targetProjectId' | 'activeCycleId'>,
  spec: {
    id: string
    role: QualityJourneyRole
    inputHash: string
    inputArtifacts: AssignmentManifest['inputArtifacts']
    authorizationScope: Pick<
      FactoryAuthorization,
      'allowedTargetRoutes' | 'allowedResourceIds' | 'targetEnvironmentBindings' | 'scope'
    >
    completionCriteria: readonly string[]
    conflictLabel?: string
  },
  tx: Prisma.TransactionClient,
) {
  assertQualityJourneyMutable(await readJourney(row.id, row.targetProjectId, tx))
  const definition = qualityJourneyRoleDefinitions.find(candidate => candidate.role === spec.role)
  if (!definition) throw new ServiceError('Quality Journey role authority is unavailable.', 'CONFLICT')
  const existing = await tx.qualityJourneyWorkItem.findUnique({ where: { id: spec.id } })
  if (existing) {
    if (
      existing.journeyId !== row.id ||
      existing.role !== spec.role ||
      existing.inputHash !== spec.inputHash ||
      existing.inputArtifactRefsJson !== json(spec.inputArtifacts) ||
      existing.authorizationScopeJson !== json(spec.authorizationScope)
    )
      throw new ServiceError(
        `${spec.conflictLabel ?? 'Specialized'} work item identity conflicts with frozen authority.`,
        'CONFLICT',
      )
    return existing
  }
  const item = await tx.qualityJourneyWorkItem.create({
    data: {
      id: spec.id,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      cycleId: row.activeCycleId,
      role: spec.role,
      status: 'ELIGIBLE',
      inputHash: spec.inputHash,
      roleContractDigest: qualityJourneyContractDigest(definition),
      inputArtifactRefsJson: json(spec.inputArtifacts),
      allowedOutputsJson: json(definition.writableArtifacts),
      completionCriteriaJson: json(spec.completionCriteria),
      authorizationScopeJson: json(spec.authorizationScope),
    },
  })
  await createWorkAuthorization(row, item, tx)
  return item
}

export async function setQualityJourneyActiveWorkItems(
  journeyId: string,
  workItemIds: readonly string[],
  tx: Prisma.TransactionClient,
) {
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  assertQualityJourneyMutable(journey)
  const current = projection(journey)
  const activeWorkItemIds = [...workItemIds]
  const stateHash = hashQualityJourneyState({ ...current, activeWorkItemIds })
  await tx.qualityJourney.update({
    where: { id: journey.id },
    data: { activeWorkItemIdsJson: json(activeWorkItemIds), stateHash, version: { increment: 1 } },
  })
}

async function recoverLegacyFactoryAuthorizations(row: QualityJourney, db: Db) {
  const items = await db.qualityJourneyWorkItem.findMany({
    where: {
      journeyId: row.id,
      authorizations: { none: {} },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'SUPERSEDED'] },
    },
  })
  for (const item of items) await createWorkAuthorization(row, item, db, 1)
  return items.map(item => item.id)
}

export async function createQualityJourney(
  input: { targetProjectId: string; idempotencyKey: string; requirement: unknown; predecessorJourneyId?: string },
  client: PrismaClient = prisma,
) {
  const requestHash = hash(input)
  const existing = await client.qualityJourney.findUnique({
    where: {
      targetProjectId_rootIdempotencyKey: {
        targetProjectId: input.targetProjectId,
        rootIdempotencyKey: input.idempotencyKey,
      },
    },
  })
  if (existing) {
    if (existing.rootRequestHash !== requestHash)
      throw new ServiceError('Quality Journey idempotency key was reused with different input.', 'CONFLICT')
    return { replayed: true, journey: projection(existing) }
  }
  const journeyId = `qjy_${randomUUID()}`
  const cycleId = `qjc_${randomUUID()}`
  const revisionId = `qjr_${randomUUID()}`
  const revisionHash = hash(input.requirement)
  const initial = createQualityJourneyKernelState({
    journeyId,
    targetProjectId: input.targetProjectId,
    activeCycleId: cycleId,
    activeRevisionIds: { journey: revisionId },
  })
  const created = await client.$transaction(async tx => {
    const predecessor = input.predecessorJourneyId
      ? await tx.qualityJourneyClosure.findFirst({
          where: {
            journeyId: input.predecessorJourneyId,
            journey: { targetProjectId: input.targetProjectId, stage: 'CLOSED' },
          },
        })
      : null
    if (input.predecessorJourneyId && !predecessor)
      throw new ServiceError('Follow-up requires a closed journey in the same target.', 'CONFLICT')
    const row = await tx.qualityJourney.create({
      data: {
        id: journeyId,
        targetProjectId: input.targetProjectId,
        rootIdempotencyKey: input.idempotencyKey,
        rootRequestHash: requestHash,
        activeCycleId: cycleId,
        activeRevisionIdsJson: json(initial.activeRevisionIds),
        stateHash: initial.stateHash,
      },
    })
    await tx.qualityJourneyRevision.create({
      data: { id: revisionId, journeyId, revision: 1, contentJson: json(input.requirement), contentHash: revisionHash },
    })
    await tx.qualityJourneyCycle.create({ data: { id: cycleId, journeyId, sequence: 1 } })
    await tx.qualityJourneyEvent.create({
      data: {
        id: `qje_${randomUUID()}`,
        journeyId,
        targetProjectId: input.targetProjectId,
        sequence: 1,
        eventType: 'JOURNEY_CREATED',
        predecessorStateHash: initial.stateHash,
        successorStateHash: initial.stateHash,
        payloadJson: json({ revisionId, revisionHash }),
      },
    })
    if (predecessor) {
      const source = { kind: 'JOURNEY_REVISION', artifactId: revisionId, revisionId, contentHash: revisionHash }
      const target = { kind: 'JOURNEY_CLOSURE', artifactId: predecessor.id, contentHash: predecessor.contentHash }
      const link = journeyArtifactLinkSchema.parse({
        schemaVersion: 'appraise.quality-journey/v1',
        linkId: `qjl_${randomUUID()}`,
        journeyId,
        targetProjectId: input.targetProjectId,
        cycleId,
        relation: 'FOLLOWS',
        source,
        target,
      })
      await tx.qualityJourneyArtifactLink.create({
        data: {
          id: link.linkId,
          journeyId,
          targetProjectId: input.targetProjectId,
          cycleId,
          relation: 'FOLLOWS',
          linkHash: hash(link),
          sourceJson: json(source),
          targetJson: json(target),
        },
      })
    }
    return row
  })
  return { replayed: false, journey: projection(created) }
}

export async function getQualityJourney(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const row = await readJourney(input.journeyId, input.targetProjectId, client)
  const [workItems, blockers, events] = await Promise.all([
    client.qualityJourneyWorkItem.findMany({ where: { journeyId: row.id }, orderBy: { createdAt: 'asc' } }),
    client.qualityJourneyBlocker.findMany({
      where: { journeyId: row.id, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyEvent.findMany({ where: { journeyId: row.id }, orderBy: { sequence: 'asc' } }),
  ])
  return {
    journey: projection(row),
    runner: reconstructQualityJourneyRunner(
      row.stage as QualityJourneyStage,
      workItems.map(item => ({ workItemId: item.id, role: item.role, status: item.status })),
      blockers.map(item => item.id),
    ),
    workItems,
    blockers,
    events,
  }
}

type JourneyCommand = ReturnType<typeof journeyCommandSchema.parse>
type AppliedJourneyCommand = ReturnType<typeof submitQualityJourneyCommand>

function commandConflict(
  command: JourneyCommand,
  row: QualityJourney,
  code: 'IDEMPOTENCY_KEY_REUSED' | 'PRECONDITION_FAILED' | 'STALE_STATE_HASH',
  safeNextCommands = projection(row).permittedCommands,
) {
  return journeyCommandResultSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    outcome: 'CONFLICT',
    commandId: command.commandId,
    code,
    currentStateHash: row.stateHash,
    currentStage: row.stage,
    safeNextCommands,
  })
}

function replayCommand(command: JourneyCommand, row: QualityJourney, existing: QualityJourneyCommand) {
  if (existing.requestHash !== hash(command)) return commandConflict(command, row, 'IDEMPOTENCY_KEY_REUSED')
  const replay = journeyCommandResultSchema.parse(JSON.parse(existing.resultJson))
  return replay.outcome === 'COMMITTED' ? { ...replay, replayed: true } : replay
}

async function runnerPreconditionConflict(command: JourneyCommand, row: QualityJourney, tx: Prisma.TransactionClient) {
  if (command.actor !== 'RUNNER') return null
  if (['RETRY_DISCOVERY', 'RETRY_AUTOMATION'].includes(command.command)) return null
  if (command.command === 'START_SCENARIO_DESIGN') {
    const discovery = row.activeDiscoveryRevisionId
      ? await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: row.activeDiscoveryRevisionId } })
      : null
    if (!discovery || discovery.status !== 'COMPLETED') return commandConflict(command, row, 'PRECONDITION_FAILED')
  }
  const activeIds = parseArray(row.activeWorkItemIdsJson)
  if (activeIds.length === 0) return null
  const incomplete = await tx.qualityJourneyWorkItem.count({
    where: { id: { in: activeIds }, status: { not: 'COMPLETED' } },
  })
  return incomplete ? commandConflict(command, row, 'PRECONDITION_FAILED') : null
}

async function loadKernelState(row: QualityJourney, tx: Prisma.TransactionClient) {
  const [commands, events] = await Promise.all([
    tx.qualityJourneyCommand.findMany({ where: { journeyId: row.id } }),
    tx.qualityJourneyEvent.findMany({ where: { journeyId: row.id }, orderBy: { sequence: 'asc' } }),
  ])
  const state: QualityJourneyKernelState = {
    ...projection(row),
    events: events.filter(event => event.commandId).map(event => JSON.parse(event.payloadJson)),
    committedCommands: Object.fromEntries(
      commands.map(receipt => [
        receipt.idempotencyKey,
        { requestHash: receipt.requestHash.replace(/^sha256:/, ''), result: JSON.parse(receipt.resultJson) },
      ]),
    ),
  }
  return { state, eventCount: events.length }
}

async function commitAppliedCommand(
  command: JourneyCommand,
  row: QualityJourney,
  applied: AppliedJourneyCommand,
  eventCount: number,
  tx: Prisma.TransactionClient,
  issueEligibleWorkItems = true,
) {
  if (applied.result.outcome !== 'COMMITTED') return applied.result
  const claimed = await tx.qualityJourney.updateMany({
    where: { id: row.id, version: row.version, stateHash: row.stateHash },
    data: {
      stage: applied.state.stage,
      activeRevisionIdsJson: json(applied.state.activeRevisionIds),
      analysisReviewHash: applied.state.analysisReviewHash ?? null,
      blockerIdsJson: json(applied.state.blockerIds),
      activeWorkItemIdsJson: json(applied.state.activeWorkItemIds),
      activeCycleId: applied.state.activeCycleId,
      stateHash: applied.state.stateHash,
      version: { increment: 1 },
      status: applied.state.stage === 'CLOSED' ? 'CLOSED' : row.status,
    },
  })
  if (claimed.count !== 1) return commandConflict(command, row, 'STALE_STATE_HASH', projection(row).permittedCommands)
  const event = applied.state.events.at(-1)!
  await tx.qualityJourneyEvent.create({
    data: {
      id: event.eventId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      sequence: eventCount + 1,
      eventType: `COMMAND_${command.command}`,
      commandId: command.commandId,
      predecessorStateHash: event.predecessorStateHash,
      successorStateHash: event.successorStateHash,
      payloadJson: json(event),
    },
  })
  await tx.qualityJourneyCommand.create({
    data: {
      id: command.commandId,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      idempotencyKey: command.idempotencyKey,
      requestHash: hash(command),
      requestJson: json(command),
      resultJson: json(applied.result),
      eventId: event.eventId,
    },
  })
  await persistRevisionFeedbackArtifact(command, row, tx)
  const updated = await tx.qualityJourney.findUniqueOrThrow({ where: { id: row.id } })
  if (issueEligibleWorkItems) await ensureEligibleWorkItems(updated, tx)
  return applied.result
}

async function scenarioRevisionFeedbackReview(
  command: JourneyCommand,
  row: QualityJourney,
  tx: Prisma.TransactionClient,
) {
  if (command.command !== 'REQUEST_SCENARIO_REVISION') return null
  const review = await tx.qualityJourneyScenarioPortfolioRevision.findFirst({
    where: { journeyId: row.id, artifactRevisionId: command.payload.reviewedRevisionId },
    include: { scenarios: { include: { decisions: true } }, comments: true },
  })
  if (!review) throw new ServiceError('Scenario revision feedback requires the exact reviewed portfolio.', 'CONFLICT')
  return review
}

function carriedScenarioReviewInput(review: NonNullable<Awaited<ReturnType<typeof scenarioRevisionFeedbackReview>>>) {
  return {
    decisions: review.scenarios
      .flatMap(record => record.decisions)
      .map(decision => ({
        scenarioRevisionId: decision.scenarioRevisionId,
        decision: decision.decision,
        feedback: decision.feedback,
        contentHash: decision.contentHash,
      }))
      .sort((left, right) => left.scenarioRevisionId.localeCompare(right.scenarioRevisionId)),
    comments: review.comments
      .map(comment => ({
        id: comment.id,
        scenarioRevisionId: comment.scenarioRevisionId,
        comment: comment.comment,
        blocking: comment.blocking,
        disposition: comment.disposition,
        dispositionRequestHash: comment.dispositionRequestHash,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

function revisionFeedbackPayload(
  command: Extract<JourneyCommand, { command: 'REQUEST_ANALYSIS_REVISION' | 'REQUEST_SCENARIO_REVISION' }>,
  row: QualityJourney,
  scenarioReview: Awaited<ReturnType<typeof scenarioRevisionFeedbackReview>>,
) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    feedbackId: `${command.command === 'REQUEST_SCENARIO_REVISION' ? 'scenario' : 'analysis'}-revision-feedback:${command.commandId}`,
    journeyId: row.id,
    targetProjectId: row.targetProjectId,
    reviewedRevisionId: command.payload.reviewedRevisionId,
    reviewedHash: command.payload.reviewedHash,
    feedback: command.payload.feedback,
    commandId: command.commandId,
    ...(scenarioReview ? carriedScenarioReviewInput(scenarioReview) : {}),
  }
}

/** Revision feedback is Appraise-owned durable input: a fresh Analyzer gets a
 * reference it may read, never a prior worker transcript or hidden state. */
async function persistRevisionFeedbackArtifact(
  command: JourneyCommand,
  row: QualityJourney,
  tx: Prisma.TransactionClient,
) {
  if (command.command !== 'REQUEST_ANALYSIS_REVISION' && command.command !== 'REQUEST_SCENARIO_REVISION') return
  const scenario = command.command === 'REQUEST_SCENARIO_REVISION'
  const scenarioReview = await scenarioRevisionFeedbackReview(command, row, tx)
  const payload = revisionFeedbackPayload(command, row, scenarioReview)
  const identityKey = `${scenario ? 'SCENARIO' : 'ANALYSIS'}_REVISION_FEEDBACK:${command.commandId}:unrevisioned`
  const contentHash = hash(payload)
  const existing = await tx.qualityJourneyArtifact.findUnique({
    where: { journeyId_identityKey: { journeyId: row.id, identityKey } },
  })
  if (existing) {
    if (existing.contentHash !== contentHash || existing.artifactJson !== json(payload))
      throw new ServiceError(
        'Analysis revision feedback artifact conflicts with immutable command identity.',
        'CONFLICT',
      )
    return existing
  }
  return tx.qualityJourneyArtifact.create({
    data: {
      id: `qjar_${createHash('sha256').update(`${row.id}:${identityKey}`).digest('hex').slice(0, 24)}`,
      identityKey,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      cycleId: row.activeCycleId,
      kind: scenario ? 'SCENARIO_REVISION_FEEDBACK' : 'ANALYSIS_REVISION_FEEDBACK',
      artifactId: payload.feedbackId,
      revisionId: command.payload.reviewedRevisionId,
      contentHash,
      artifactJson: json(payload),
    },
  })
}

export async function submitDurableQualityJourneyCommandInTransaction(
  value: unknown,
  tx: Prisma.TransactionClient,
  allowSpecializedCommand = false,
  issueEligibleWorkItems = true,
) {
  const command = journeyCommandSchema.parse(value)
  if (
    !allowSpecializedCommand &&
    [
      'RETRY_DISCOVERY',
      'RETRY_AUTOMATION',
      'START_EXECUTION',
      'START_RERUN_CYCLE',
      'START_REMEDIATION_CYCLE',
      'PUBLISH_TRIAGE_REPORT',
      'REQUEST_REPORT_REVISION',
      'CLOSE_JOURNEY',
      'RISK_ACCEPT_AND_CLOSE',
      'PUBLISH_RUN_RESULT',
      'START_SCENARIO_DESIGN',
      'PUBLISH_SCENARIO_PORTFOLIO',
      'DECIDE_SCENARIOS',
      'REQUEST_SCENARIO_REVISION',
    ].includes(command.command)
  )
    throw new ServiceError('This Quality Journey command requires its specialized authority boundary.', 'UNAUTHORIZED')
  const row = await readJourney(command.journeyId, command.targetProjectId, tx)
  const existing = await tx.qualityJourneyCommand.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: row.id, idempotencyKey: command.idempotencyKey } },
  })
  if (existing) return replayCommand(command, row, existing)
  const preconditionConflict = await runnerPreconditionConflict(command, row, tx)
  if (preconditionConflict) return preconditionConflict
  const { state, eventCount } = await loadKernelState(row, tx)
  const applied = submitQualityJourneyCommand(state, command)
  return commitAppliedCommand(command, row, applied, eventCount, tx, issueEligibleWorkItems)
}

/** Specialized boundaries may update their durable projection before issuing a
 * newly eligible assignment. Both operations remain in one transaction. */
export async function ensureEligibleQualityJourneyWorkItemsInTransaction(
  journeyId: string,
  tx: Prisma.TransactionClient,
) {
  const row = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  await ensureEligibleWorkItems(row, tx)
}

export async function submitDurableQualityJourneyCommand(value: unknown, client: PrismaClient = prisma) {
  return client.$transaction(tx => submitDurableQualityJourneyCommandInTransaction(value, tx))
}

async function blockExpiredQualityJourneyWork(
  tx: Prisma.TransactionClient,
  attempt: QualityJourneyWorkAttempt,
  status: 'DISPATCH_UNRESOLVED' | 'LEASE_EXPIRED',
  completedAt: Date,
) {
  await tx.qualityJourneyWorkAttempt.update({
    where: { id: attempt.id },
    data: { status, completedAt },
  })
  await tx.qualityJourneyWorkItem.updateMany({
    where: { id: attempt.workItemId, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
    data: { status: 'BLOCKED', version: { increment: 1 } },
  })
}

async function createAttemptBudgetBlocker(
  tx: Prisma.TransactionClient,
  row: QualityJourney,
  attempt: QualityJourneyWorkAttempt,
) {
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId! } })
  if (!authorization) return
  const authorizationAttemptCount = await tx.qualityJourneyWorkAttempt.count({
    where: { authorizationId: authorization.id },
  })
  await tx.qualityJourneyBlocker.upsert({
    where: { id: `qjb_attempt_budget_${attempt.workItemId}` },
    update: {},
    create: {
      id: `qjb_attempt_budget_${attempt.workItemId}`,
      journeyId: row.id,
      targetProjectId: row.targetProjectId,
      reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED',
      summary: 'The work authorization exhausted its hard maximum attempt count.',
      evidenceJson: json({
        attemptId: attempt.id,
        attemptSequence: attempt.attempt,
        authorizationId: authorization.id,
        authorizationAttemptCount,
        maxAttempts: authorization.maxAttempts,
      }),
      responsibleActor: 'COORDINATOR',
      affectedNodeIdsJson: json([attempt.workItemId]),
      requiredResolution:
        'Start a new Quality Journey or use a future authorized re-authorization workflow; this exhausted authorization cannot be resumed.',
      safeResumeCommand: 'NONE',
    },
  })
}

async function resumeRefusedFactoryWork(row: QualityJourney, now: Date, tx: Prisma.TransactionClient) {
  const refused = await tx.qualityJourneyWorkAttempt.findMany({
    where: { workItem: { journeyId: row.id, targetProjectId: row.targetProjectId }, status: 'REFUSED' },
    include: { workItem: true, authorization: true },
  })
  const resumedAttemptIds: string[] = []
  for (const attempt of refused) {
    if (attempt.workItem.status !== 'BLOCKED' || attempt.workItem.currentAttempt !== attempt.attempt) continue
    const authorizationAttempts = attempt.authorization
      ? await tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: attempt.authorization.id } })
      : 0
    if (!attempt.authorization || authorizationAttempts >= attempt.authorization.maxAttempts) {
      if (attempt.authorization) {
        await tx.qualityJourneyBlocker.updateMany({
          where: { id: `qjb_factory_refused_${attempt.id}`, status: 'ACTIVE' },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            resolutionJson: json({ action: 'ATTEMPT_BUDGET_EXHAUSTED' }),
          },
        })
        await createAttemptBudgetBlocker(tx, row, attempt)
      }
      continue
    }
    const replaced = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: attempt.workItemId, status: 'BLOCKED', currentAttempt: attempt.attempt },
      data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
    })
    if (replaced.count !== 1) continue
    await tx.qualityJourneyBlocker.updateMany({
      where: { id: `qjb_factory_refused_${attempt.id}`, status: 'ACTIVE' },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        resolutionJson: json({ action: 'REPLACEMENT_REQUESTED', successorAttempt: attempt.attempt + 1 }),
      },
    })
    resumedAttemptIds.push(attempt.id)
  }
  return resumedAttemptIds
}

export async function resumeQualityJourney(
  input: { journeyId: string; targetProjectId: string; now?: Date },
  client: PrismaClient = prisma,
) {
  const now = input.now ?? new Date()
  return client.$transaction(async tx => {
    const row = await readJourney(input.journeyId, input.targetProjectId, tx)
    assertQualityJourneyMutable(row)
    const recoveredWorkItemIds = await recoverLegacyFactoryAuthorizations(row, tx)
    const expired = await tx.qualityJourneyWorkAttempt.findMany({
      where: {
        workItem: { journeyId: row.id },
        status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'] },
        leaseExpiresAt: { lte: now },
      },
    })
    for (const attempt of expired) {
      if (attempt.dispatchStartedAt && !attempt.spawnReceiptHash) {
        await blockExpiredQualityJourneyWork(tx, attempt, 'DISPATCH_UNRESOLVED', now)
        await tx.qualityJourneyBlocker.upsert({
          where: { id: `qjb_ambiguous_dispatch_${attempt.id}` },
          update: {},
          create: {
            id: `qjb_ambiguous_dispatch_${attempt.id}`,
            journeyId: row.id,
            targetProjectId: row.targetProjectId,
            reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH',
            summary:
              'A provider dispatch may have created a worker, but no durable receipt was returned before the lease expired.',
            evidenceJson: json({
              attemptId: attempt.id,
              dispatchKey: attempt.dispatchKey,
              adapterId: attempt.dispatchAdapterId,
            }),
            responsibleActor: 'COORDINATOR',
            affectedNodeIdsJson: json([attempt.workItemId]),
            requiredResolution:
              'Reconcile the persisted adapter dispatch key with the provider before any new worker is issued.',
            safeResumeCommand: 'adapter_reconciliation_required',
          },
        })
        continue
      }
      const authorization = attempt.authorizationId
        ? await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId } })
        : null
      const authorizationAttempts = authorization
        ? await tx.qualityJourneyWorkAttempt.count({ where: { authorizationId: authorization.id } })
        : 0
      if (authorization && authorizationAttempts >= authorization.maxAttempts) {
        await blockExpiredQualityJourneyWork(tx, attempt, 'LEASE_EXPIRED', now)
        await createAttemptBudgetBlocker(tx, row, attempt)
        continue
      }
      await tx.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { status: 'LEASE_EXPIRED', completedAt: now },
      })
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: attempt.workItemId, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
    }
    const resumedRefusedAttemptIds = await resumeRefusedFactoryWork(row, now, tx)
    await ensureEligibleWorkItems(row, tx)
    return {
      recoveredWorkItemIds,
      expiredAttemptIds: expired.map(item => item.id),
      resumedRefusedAttemptIds,
      journey: projection(row),
    }
  })
}

async function replacementArtifactProjection(
  item: QualityJourneyWorkItem,
  db: Db,
): Promise<{ inputArtifacts: AssignmentManifest['inputArtifacts']; projectionHash: string }> {
  const declared = JSON.parse(item.inputArtifactRefsJson) as AssignmentManifest['inputArtifacts']
  if (item.role === 'TRIAGER')
    return {
      inputArtifacts: declared,
      projectionHash: hash({ workItemId: item.id, cycleId: item.cycleId, inputArtifacts: declared }),
    }
  const { roleDefinition } = roleAuthority(item.role as QualityJourneyRole)
  const journey = await readJourney(item.journeyId, item.targetProjectId, db)
  const activeRevisionIds = Object.values(parseRecord(journey.activeRevisionIdsJson))
  const durable = await db.qualityJourneyArtifact.findMany({
    where: {
      journeyId: item.journeyId,
      cycleId: item.cycleId,
      kind: { in: [...roleDefinition.readableArtifacts] },
      OR: [{ revisionId: { in: activeRevisionIds } }, { revisionId: null }],
    },
    orderBy: [{ kind: 'asc' }, { artifactId: 'asc' }, { revisionId: 'asc' }],
  })
  const entries = [
    ...declared,
    ...durable.map(artifact => ({
      kind: artifact.kind,
      artifactId: artifact.artifactId,
      ...(artifact.revisionId ? { revisionId: artifact.revisionId } : {}),
      contentHash: artifact.contentHash,
    })),
  ] as AssignmentManifest['inputArtifacts']
  const inputArtifacts = Object.values(
    Object.fromEntries(
      entries.map(reference => [`${reference.kind}:${reference.artifactId}:${reference.revisionId ?? ''}`, reference]),
    ),
  ).sort((left, right) =>
    canonicalContractJson(left).localeCompare(canonicalContractJson(right)),
  ) as AssignmentManifest['inputArtifacts']
  return {
    inputArtifacts,
    projectionHash: hash({ workItemId: item.id, cycleId: item.cycleId, activeRevisionIds, inputArtifacts }),
  }
}

function assertClaimableAuthorization(authorization: { revokedAt: Date | null; cancelledAt: Date | null }) {
  if (authorization.revokedAt)
    throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
  if (authorization.cancelledAt)
    throw new ServiceError('Quality Journey work authorization has been cancelled.', 'CONFLICT')
}

async function deriveClaimInput(item: QualityJourneyWorkItem, authorization: FactoryAuthorization, db: Db) {
  if (item.status !== 'REPLACEMENT_REQUESTED')
    return { inputArtifacts: authorization.inputArtifacts, inputHash: item.inputHash, projectionHash: null }
  const projection = await replacementArtifactProjection(item, db)
  return { ...projection, inputHash: hash({ workItemId: item.id, projectionHash: projection.projectionHash }) }
}

async function persistWorkClaim(item: QualityJourneyWorkItem, inputHash: string, tx: Prisma.TransactionClient) {
  const attempt = item.currentAttempt + 1
  const claimed = await tx.qualityJourneyWorkItem.updateMany({
    where: { id: item.id, version: item.version, status: item.status },
    data: { status: 'WORKER_REQUESTED', currentAttempt: attempt, inputHash, version: { increment: 1 } },
  })
  if (claimed.count !== 1) throw new ServiceError('Quality Journey work item was claimed concurrently.', 'CONFLICT')
  return attempt
}

async function priorWorkAttempt(item: QualityJourneyWorkItem, tx: Prisma.TransactionClient) {
  if (item.status !== 'REPLACEMENT_REQUESTED') return null
  return tx.qualityJourneyWorkAttempt.findFirst({ where: { workItemId: item.id }, orderBy: { attempt: 'desc' } })
}

function manifestForClaim(
  authorization: FactoryAuthorization,
  item: QualityJourneyWorkItem,
  attempt: { id: string; leaseId: string; leaseExpiresAt: Date; heartbeatSeconds: number },
  inputArtifacts: AssignmentManifest['inputArtifacts'],
  replacement: AssignmentManifest['replacement'],
) {
  const manifest = assignmentFromAuthorization(authorization, item, attempt, inputArtifacts)
  if (item.status !== 'REPLACEMENT_REQUESTED') return manifest
  return createReplacementAssignment(manifest, {
    assignmentId: manifest.assignmentId,
    stateHash: manifest.stateHash,
    inputHash: manifest.inputHash,
    inputArtifacts,
    lease: manifest.lease,
    idempotencyKey: manifest.idempotencyKey,
    replacement: replacement!,
  })
}

function predecessorDiagnostics(prior: QualityJourneyWorkAttempt | null, projectionHash: string | null) {
  if (!prior || !projectionHash) return null
  return {
    projectionHash,
    predecessorAttemptId: prior.id,
    diagnostics: {
      status: prior.status,
      ...(prior.completedAt ? { completedAt: prior.completedAt.toISOString() } : {}),
      ...(prior.resultHash ? { resultHash: prior.resultHash } : {}),
      ...(prior.failureJson ? { failureHash: hash(JSON.parse(prior.failureJson)) } : {}),
    },
  } satisfies NonNullable<AssignmentManifest['replacement']>
}

async function retireLegacyDiscoveryAuthority(journeyId: string, tx: Prisma.TransactionClient) {
  const legacyItems = await tx.qualityJourneyWorkItem.findMany({
    where: { journeyId, role: { in: ['SCOUT', 'RESOURCE_EXPLORER'] } },
    select: { id: true },
  })
  const legacyIds = legacyItems.map(item => item.id)
  if (!legacyIds.length) return
  const retiredAt = new Date()
  await tx.qualityJourneyWorkAttempt.updateMany({
    where: {
      workItemId: { in: legacyIds },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUSED', 'FAILED', 'EXPIRED'] },
    },
    data: {
      status: 'CANCELLED',
      cancelledAt: retiredAt,
      cancelledBy: 'RUNNER',
      cancellationReason: 'Superseded by the Phase 4 discovery control-plane upgrade.',
    },
  })
  await tx.qualityJourneyWorkAuthorization.updateMany({
    where: { workItemId: { in: legacyIds }, revokedAt: null },
    data: {
      revokedAt: retiredAt,
      revokedBy: 'RUNNER',
      revocationReason: 'Superseded by the Phase 4 discovery control-plane upgrade.',
    },
  })
  await tx.qualityJourneyWorkItem.updateMany({
    where: { id: { in: legacyIds }, status: { not: 'COMPLETED' } },
    data: { status: 'SUPERSEDED', version: { increment: 1 } },
  })
}

async function upgradeLegacyDiscoveryOnClaim(journey: QualityJourney, tx: Prisma.TransactionClient) {
  if (journey.stage !== 'DISCOVERY' || journey.activeDiscoveryRevisionId) return journey
  await retireLegacyDiscoveryAuthority(journey.id, tx)
  const bootstrap = getQualityJourneyDiscoveryBootstrap()
  if (!bootstrap) throw new ServiceError('Quality Journey discovery bootstrap is unavailable.', 'CONFLICT')
  await bootstrap({ journeyId: journey.id, targetProjectId: journey.targetProjectId }, tx)
  return readJourney(journey.id, journey.targetProjectId, tx)
}

type WorkClaimInput = {
  journeyId: string
  targetProjectId: string
  role: QualityJourneyRole
  leaseSeconds?: number
}

async function findClaimableWorkItem(journey: QualityJourney, input: WorkClaimInput, tx: Prisma.TransactionClient) {
  const activeTriagerScope =
    input.role === 'TRIAGER'
      ? { cycleId: journey.activeCycleId, id: { in: parseArray(journey.activeWorkItemIdsJson) } }
      : {}
  return tx.qualityJourneyWorkItem.findFirst({
    where: {
      journeyId: journey.id,
      role: input.role,
      status: { in: ['ELIGIBLE', 'REPLACEMENT_REQUESTED'] },
      ...activeTriagerScope,
    },
    orderBy: { createdAt: 'asc' },
  })
}

async function assertSpecializedTriagerClaim(
  item: Pick<QualityJourneyWorkItem, 'id' | 'role' | 'cycleId'>,
  journey: QualityJourney,
  tx: Prisma.TransactionClient,
) {
  if (item.role !== 'TRIAGER') return
  const assignment = await tx.qualityJourneyTriageAssignment.findUnique({ where: { workItemId: item.id } })
  if (journey.stage !== 'TRIAGE' || item.cycleId !== journey.activeCycleId || !assignment)
    throw new ServiceError(
      'Triager requires a specialized sealed-evidence assignment for the active cycle.',
      'UNAUTHORIZED',
    )
}

export async function claimQualityJourneyWork(input: WorkClaimInput, client: PrismaClient = prisma) {
  const leaseSeconds = Math.min(Math.max(input.leaseSeconds ?? 120, 30), 900)
  return client.$transaction(async tx => {
    const persistedJourney = await readJourney(input.journeyId, input.targetProjectId, tx)
    assertQualityJourneyMutable(persistedJourney)
    // Frozen target/catalog authority cannot be synthesized safely in SQL.
    // Upgrade pre-Phase-4 DISCOVERY rows transactionally on their first claim.
    const journey = await upgradeLegacyDiscoveryOnClaim(persistedJourney, tx)
    await ensureEligibleWorkItems(journey, tx)
    const item = await findClaimableWorkItem(journey, input, tx)
    if (!item) throw new ServiceError('No eligible Quality Journey work item is available.', 'CONFLICT')
    await assertSpecializedTriagerClaim(item, journey, tx)
    const authorization = await currentWorkAuthorization(item.id, tx)
    if (!authorization)
      throw new ServiceError('Quality Journey work has no issued Factory authorization.', 'UNAUTHORIZED')
    assertClaimableAuthorization(authorization)
    const authorizationAttemptCount = await tx.qualityJourneyWorkAttempt.count({
      where: { authorizationId: authorization.id },
    })
    if (authorizationAttemptCount >= authorization.maxAttempts)
      throw new ServiceError('Quality Journey work has exhausted its maximum attempt budget.', 'CONFLICT')
    const authorizationPayload = validateFactoryAuthorization(authorization, journey, item)
    const { inputArtifacts, inputHash, projectionHash } = await deriveClaimInput(item, authorizationPayload, tx)
    const attempt = await persistWorkClaim(item, inputHash, tx)
    const ownerToken = randomUUID()
    const leaseId = `qjl_${randomUUID()}`
    const leaseExpiresAt = new Date(Date.now() + leaseSeconds * 1000)
    const attemptId = `qja_${randomUUID()}`
    const prior = await priorWorkAttempt(item, tx)
    const replacement = predecessorDiagnostics(prior, projectionHash)
    const heartbeatSeconds = Math.max(10, Math.floor(leaseSeconds / 3))
    const claimedItem = { ...item, inputHash }
    const manifest = manifestForClaim(
      authorizationPayload,
      claimedItem,
      { id: attemptId, leaseId, leaseExpiresAt, heartbeatSeconds },
      inputArtifacts,
      replacement ?? undefined,
    )
    const spawnRequest = createWorkerSpawnRequest({
      requestId: `qjsr_${randomUUID()}`,
      attemptId,
      manifest,
    })
    const workAttempt = await tx.qualityJourneyWorkAttempt.create({
      data: {
        id: attemptId,
        workItemId: item.id,
        attempt,
        status: 'WORKER_REQUESTED',
        leaseId,
        ownerTokenHash: tokenHash(ownerToken),
        leaseExpiresAt,
        heartbeatSeconds,
        authorizationId: authorization.id,
        assignmentId: manifest.assignmentId,
        assignmentJson: json(manifest),
        assignmentHash: hash(manifest),
        spawnRequestId: spawnRequest.requestId,
        spawnRequestJson: json(spawnRequest),
        spawnRequestHash: hash(spawnRequest),
        dispatchKey: `qjd_${createHash('sha256').update(attemptId).digest('hex').slice(0, 24)}`,
        replacesAttemptId: prior?.id,
        replacementProjectionHash: replacement?.projectionHash,
        predecessorDiagnosticsJson: replacement ? json(replacement.diagnostics) : null,
      },
    })
    return {
      workItem: { ...claimedItem, status: 'WORKER_REQUESTED' as const, currentAttempt: attempt },
      attempt: workAttempt,
      assignment: manifest,
      spawnRequest,
      ownerToken,
    }
  })
}

export type WorkCompletionInput = {
  journeyId: string
  targetProjectId: string
  workItemId: string
  leaseId: string
  ownerToken: string
  result: unknown
}
type WorkerResult = ReturnType<typeof workerResultEnvelopeSchema.parse>

type WorkLeaseInput = Omit<WorkCompletionInput, 'result'>
type WorkSpawnReceiptInput = WorkLeaseInput & { receipt: unknown }

function assertLeaseAuthority(
  input: Pick<WorkCompletionInput, 'ownerToken'>,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt | null,
) {
  if (!attempt || attempt.workItemId !== item.id || attempt.ownerTokenHash !== tokenHash(input.ownerToken))
    throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  return attempt
}

async function readWorkAttempt(input: WorkLeaseInput, tx: Prisma.TransactionClient) {
  assertQualityJourneyMutable(await readJourney(input.journeyId, input.targetProjectId, tx))
  const item = await readScopedWorkItem(input, tx)
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { leaseId: input.leaseId } })
  const authorization = attempt?.authorizationId
    ? await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: attempt.authorizationId } })
    : null
  return { item, attempt, authorization }
}

async function readScopedWorkItem(
  input: Pick<WorkLeaseInput, 'journeyId' | 'targetProjectId' | 'workItemId'>,
  tx: Prisma.TransactionClient,
) {
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: { id: input.workItemId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!item) throw new ServiceError('Quality Journey work item not found.', 'NOT_FOUND')
  return item
}

function assertFactoryAuthorityCurrent(
  item: QualityJourneyWorkItem,
  authorization: { revokedAt: Date | null; cancelledAt: Date | null } | null,
) {
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  if (authorization.revokedAt)
    throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
  if (authorization.cancelledAt || item.status === 'CANCELLED')
    throw new ServiceError('Quality Journey work has been cancelled.', 'CONFLICT')
}

function validatedSpawnReceipt(input: WorkSpawnReceiptInput, attempt: QualityJourneyWorkAttempt) {
  if (!attempt.spawnRequestJson || !attempt.spawnRequestHash)
    throw new ServiceError('Quality Journey worker request was not durably issued.', 'UNAUTHORIZED')
  const spawnRequest = JSON.parse(attempt.spawnRequestJson)
  if (attempt.spawnRequestHash !== hash(spawnRequest))
    throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
  let receipt: ReturnType<typeof validateWorkerSpawnReceipt>
  try {
    receipt = validateWorkerSpawnReceipt(input.receipt, spawnRequest)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown spawn receipt validation error.'
    throw new ServiceError(`Quality Journey worker receipt is invalid: ${message}`, 'VALIDATION')
  }
  return { receipt, receiptHash: hash(receipt) }
}

function replayedSpawnReceipt(item: QualityJourneyWorkItem, attempt: QualityJourneyWorkAttempt, receiptHash: string) {
  if (!attempt.spawnReceiptHash) return null
  if (attempt.spawnReceiptHash !== receiptHash)
    throw new ServiceError('Quality Journey worker receipt was replayed with different input.', 'CONFLICT')
  return { replayed: true, workItemId: item.id, status: item.status }
}

function assertSpawnReceiptCurrent(item: QualityJourneyWorkItem, attempt: QualityJourneyWorkAttempt) {
  if (attempt.leaseExpiresAt <= new Date()) throw new ServiceError('Quality Journey work lease expired.', 'CONFLICT')
  if (item.currentAttempt !== attempt.attempt || item.status !== 'WORKER_REQUESTED')
    throw new ServiceError('Quality Journey worker receipt is stale.', 'CONFLICT')
}

function assertDispatchReservation(attempt: QualityJourneyWorkAttempt) {
  if (!attempt.dispatchKey || !attempt.dispatchReservedAt || !attempt.dispatchStartedAt)
    throw new ServiceError('Quality Journey worker receipt has no durable dispatch reservation.', 'UNAUTHORIZED')
}

/** Adapter-only ingress. This is intentionally private: an MCP caller with a
 * lease token must not be able to manufacture Factory evidence. */
async function recordAdapterSpawnReceipt(input: WorkSpawnReceiptInput, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const loaded = await readWorkAttempt(input, tx)
    const { item } = loaded
    assertFactoryAuthorityCurrent(item, loaded.authorization)
    const attempt = assertLeaseAuthority(input, item, loaded.attempt)
    assertDispatchReservation(attempt)
    const { receipt, receiptHash } = validatedSpawnReceipt(input, attempt)
    const replay = replayedSpawnReceipt(item, attempt, receiptHash)
    if (replay) return replay
    assertSpawnReceiptCurrent(item, attempt)
    const refused = receipt.outcome === 'REFUSED'
    const recorded = await tx.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, spawnReceiptId: null, status: 'WORKER_REQUESTED' },
      data: {
        status: refused ? 'REFUSED' : 'IN_PROGRESS',
        spawnReceiptId: receipt.spawnReceiptId,
        spawnReceiptJson: json(receipt),
        spawnReceiptHash: receiptHash,
      },
    })
    if (recorded.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    const started = await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, version: item.version, currentAttempt: attempt.attempt, status: 'WORKER_REQUESTED' },
      data: { status: refused ? 'BLOCKED' : 'IN_PROGRESS', version: { increment: 1 } },
    })
    if (started.count !== 1) throw new ServiceError('Quality Journey worker receipt changed concurrently.', 'CONFLICT')
    if (refused) {
      await tx.qualityJourneyBlocker.create({
        data: {
          id: `qjb_factory_refused_${attempt.id}`,
          journeyId: input.journeyId,
          targetProjectId: input.targetProjectId,
          reasonCode: receipt.refusalCode,
          summary: 'The selected Factory adapter refused the requested worker capability boundary.',
          evidenceJson: json({ attemptId: attempt.id, receiptHash, refusalCode: receipt.refusalCode }),
          responsibleActor: 'COORDINATOR',
          affectedNodeIdsJson: json([item.id]),
          requiredResolution: 'Select or configure an adapter that can satisfy the required runtime boundary.',
          safeResumeCommand: 'quality_journey_resume',
        },
      })
    }
    return refused
      ? { replayed: false, workItemId: item.id, status: 'BLOCKED' as const, outcome: 'REFUSED' as const }
      : { replayed: false, workItemId: item.id, status: 'IN_PROGRESS' as const, outcome: 'STARTED' as const }
  })
}

async function releaseFailedDispatchReservation(input: WorkLeaseInput, adapterId: string, client: PrismaClient) {
  await client.qualityJourneyWorkAttempt.updateMany({
    where: {
      leaseId: input.leaseId,
      workItemId: input.workItemId,
      status: 'WORKER_REQUESTED',
      spawnReceiptId: null,
      workItem: { journey: { stage: { not: 'CLOSED' }, status: { not: 'CLOSED' } } },
      dispatchAdapterId: adapterId,
    },
    data: { dispatchReservedAt: null, dispatchStartedAt: null },
  })
}

async function markDispatchUnresolved(input: WorkLeaseInput, adapterId: string, client: PrismaClient) {
  await client.$transaction(async tx => {
    const attempt = await tx.qualityJourneyWorkAttempt.findFirst({
      where: {
        leaseId: input.leaseId,
        workItemId: input.workItemId,
        status: 'WORKER_REQUESTED',
        spawnReceiptId: null,
        dispatchAdapterId: adapterId,
        dispatchStartedAt: { not: null },
      },
    })
    if (!attempt) return
    assertQualityJourneyMutable(await readJourney(input.journeyId, input.targetProjectId, tx))
    await tx.qualityJourneyWorkAttempt.update({ where: { id: attempt.id }, data: { status: 'DISPATCH_UNRESOLVED' } })
    await tx.qualityJourneyWorkItem.updateMany({
      where: { id: attempt.workItemId, status: 'WORKER_REQUESTED' },
      data: { status: 'BLOCKED', version: { increment: 1 } },
    })
    await tx.qualityJourneyBlocker.upsert({
      where: { id: `qjb_ambiguous_dispatch_${attempt.id}` },
      update: {},
      create: {
        id: `qjb_ambiguous_dispatch_${attempt.id}`,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH',
        summary: 'A provider dispatch may have created a worker, but its response was not durably received.',
        evidenceJson: json({ attemptId: attempt.id, dispatchKey: attempt.dispatchKey, adapterId }),
        responsibleActor: 'COORDINATOR',
        affectedNodeIdsJson: json([attempt.workItemId]),
        requiredResolution:
          'Reconcile the persisted adapter dispatch key with the provider before any new worker is issued.',
        safeResumeCommand: 'adapter_reconciliation_required',
      },
    })
  })
}

/** Dispatch is an Appraise-owned handoff. The selected adapter identity and
 * idempotency key are durable, while a failed call releases only the in-flight
 * reservation so that the same adapter may retry the exact request. */
function publicDispatchProjection(input: {
  replayed: boolean
  status: string
  workItemId: string
  attemptId: string
  spawnReceiptId?: string | null
  spawnReceiptHash?: string | null
  adapterId?: string | null
}) {
  return {
    replayed: input.replayed,
    status: input.status,
    workItemId: input.workItemId,
    attemptId: input.attemptId,
    ...(input.spawnReceiptId ? { spawnReceiptId: input.spawnReceiptId } : {}),
    ...(input.spawnReceiptHash ? { spawnReceiptHash: input.spawnReceiptHash } : {}),
    ...(input.adapterId ? { adapterId: input.adapterId } : {}),
  }
}

export async function dispatchQualityJourneyWork(input: WorkLeaseInput, client: PrismaClient = prisma) {
  const pending = await client.$transaction(async tx => {
    const loaded = await readWorkAttempt(input, tx)
    assertFactoryAuthorityCurrent(loaded.item, loaded.authorization)
    const attempt = assertLeaseAuthority(input, loaded.item, loaded.attempt)
    if (attempt.spawnReceiptJson && attempt.spawnReceiptHash) {
      if (attempt.spawnReceiptHash !== hash(JSON.parse(attempt.spawnReceiptJson)))
        throw new ServiceError('Quality Journey worker receipt lineage is invalid.', 'UNAUTHORIZED')
      return {
        replay: true as const,
        status: loaded.item.status,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        spawnReceiptId: attempt.spawnReceiptId,
        spawnReceiptHash: attempt.spawnReceiptHash,
        adapterId: attempt.dispatchAdapterId,
      }
    }
    if (attempt.status === 'DISPATCH_UNRESOLVED')
      return {
        replay: true as const,
        unresolved: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId: attempt.dispatchAdapterId,
      }
    if (attempt.status !== 'WORKER_REQUESTED' || attempt.leaseExpiresAt <= new Date())
      throw new ServiceError('Quality Journey worker dispatch is stale.', 'CONFLICT')
    if (!attempt.spawnRequestJson || attempt.spawnRequestHash !== hash(JSON.parse(attempt.spawnRequestJson ?? 'null')))
      throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
    if (!attempt.dispatchKey)
      throw new ServiceError('Quality Journey worker dispatch key is unavailable.', 'UNAUTHORIZED')
    const request = JSON.parse(attempt.spawnRequestJson)
    let adapterId: string
    try {
      adapterId = resolveAgentFactoryProviderAdapter(request, attempt.dispatchAdapterId ?? undefined).adapter.adapterId
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No compatible provider adapter is available.'
      throw new ServiceError(`Quality Journey worker dispatch was blocked: ${message}`, 'CONFLICT')
    }
    if (attempt.dispatchStartedAt)
      return {
        replay: true as const,
        pending: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId,
      }
    const now = new Date()
    const reserved = await tx.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchReservedAt: null, dispatchStartedAt: null, status: 'WORKER_REQUESTED' },
      data: { dispatchAdapterId: adapterId, dispatchReservedAt: now, dispatchStartedAt: now },
    })
    if (reserved.count !== 1) {
      return {
        replay: true as const,
        pending: true as const,
        workItemId: loaded.item.id,
        attemptId: attempt.id,
        adapterId,
      }
    }
    return {
      replay: false as const,
      request,
      dispatchKey: attempt.dispatchKey,
      adapterId,
      workItemId: loaded.item.id,
      attemptId: attempt.id,
    }
  })
  if ('unresolved' in pending)
    return publicDispatchProjection({
      replayed: true,
      status: 'DISPATCH_UNRESOLVED',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  if ('pending' in pending)
    return publicDispatchProjection({
      replayed: true,
      status: 'DISPATCH_PENDING',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  if (pending.replay)
    return publicDispatchProjection({
      replayed: true,
      status: pending.status,
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      spawnReceiptId: pending.spawnReceiptId,
      spawnReceiptHash: pending.spawnReceiptHash,
      adapterId: pending.adapterId,
    })
  let dispatched: Awaited<ReturnType<typeof dispatchWorkerSpawnRequest>>
  try {
    dispatched = await dispatchWorkerSpawnRequest(pending.request, pending.dispatchKey, pending.adapterId)
  } catch (error) {
    if (error instanceof AgentFactoryDispatchNotStartedError) {
      await releaseFailedDispatchReservation(input, pending.adapterId, client)
      const message = error.message
      throw new ServiceError(`Quality Journey worker dispatch was blocked: ${message}`, 'CONFLICT')
    }
    await markDispatchUnresolved(input, pending.adapterId, client)
    return publicDispatchProjection({
      replayed: false,
      status: 'DISPATCH_UNRESOLVED',
      workItemId: pending.workItemId,
      attemptId: pending.attemptId,
      adapterId: pending.adapterId,
    })
  }
  const recorded = await recordAdapterSpawnReceipt({ ...input, receipt: dispatched.receipt }, client)
  return publicDispatchProjection({
    replayed: recorded.replayed,
    status: recorded.status,
    workItemId: recorded.workItemId,
    attemptId: pending.attemptId,
    spawnReceiptId: dispatched.receipt.spawnReceiptId,
    spawnReceiptHash: hash(dispatched.receipt),
    adapterId: dispatched.adapterId,
  })
}

type FactoryControlActor = 'USER' | 'COORDINATOR' | 'RUNNER'
type WorkTerminationInput = {
  journeyId: string
  targetProjectId: string
  workItemId: string
  actor: FactoryControlActor
  reason: string
}

async function readWorkAuthorizationForControl(input: WorkTerminationInput, tx: Prisma.TransactionClient) {
  assertQualityJourneyMutable(await readJourney(input.journeyId, input.targetProjectId, tx))
  const item = await readScopedWorkItem(input, tx)
  const authorization = await currentWorkAuthorization(item.id, tx)
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  return { item, authorization }
}

async function cancelActiveWorkAttempts(
  workItemId: string,
  actor: FactoryControlActor,
  reason: string,
  tx: Prisma.TransactionClient,
) {
  await tx.qualityJourneyWorkAttempt.updateMany({
    where: { workItemId, status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'] } },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: actor,
      cancellationReason: reason,
      completedAt: new Date(),
    },
  })
}

export async function cancelQualityJourneyWork(input: WorkTerminationInput, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const { item, authorization } = await readWorkAuthorizationForControl(input, tx)
    if (authorization.revokedAt)
      throw new ServiceError('Quality Journey work authorization has been revoked.', 'UNAUTHORIZED')
    if (authorization.cancelledAt || item.status === 'CANCELLED')
      return { replayed: true, workItemId: item.id, status: 'CANCELLED' as const }
    if (item.status === 'COMPLETED')
      throw new ServiceError('Completed Quality Journey work cannot be cancelled.', 'CONFLICT')
    const cancelled = await tx.qualityJourneyWorkAuthorization.updateMany({
      where: { id: authorization.id, cancelledAt: null, revokedAt: null },
      data: { cancelledAt: new Date(), cancelledBy: input.actor, cancellationReason: input.reason },
    })
    if (cancelled.count !== 1)
      throw new ServiceError('Quality Journey work cancellation changed concurrently.', 'CONFLICT')
    await cancelActiveWorkAttempts(item.id, input.actor, input.reason, tx)
    await tx.qualityJourneyWorkItem.updateMany({
      where: { id: item.id, status: { not: 'COMPLETED' } },
      data: { status: 'CANCELLED', version: { increment: 1 } },
    })
    return { replayed: false, workItemId: item.id, status: 'CANCELLED' as const }
  })
}

export async function revokeQualityJourneyWorkAuthorization(
  input: WorkTerminationInput,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const { item, authorization } = await readWorkAuthorizationForControl(input, tx)
    if (authorization.revokedAt) return { replayed: true, workItemId: item.id, status: item.status }
    const revoked = await tx.qualityJourneyWorkAuthorization.updateMany({
      where: { id: authorization.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: input.actor, revocationReason: input.reason },
    })
    if (revoked.count !== 1) throw new ServiceError('Quality Journey work revocation changed concurrently.', 'CONFLICT')
    await cancelActiveWorkAttempts(item.id, input.actor, input.reason, tx)
    if (item.status !== 'COMPLETED')
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: item.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      })
    return { replayed: false, workItemId: item.id, status: item.status === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED' }
  })
}

function validateWorkAttempt(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt | null,
  result: WorkerResult,
) {
  const authorizedAttempt = assertLeaseAuthority(input, item, attempt)
  if (authorizedAttempt.status === 'COMPLETED') {
    if (authorizedAttempt.resultHash !== hash(result))
      throw new ServiceError('Quality Journey work completion was replayed with a different result.', 'CONFLICT')
    return { replayed: true, workItemId: item.id, status: item.status }
  }
  if (authorizedAttempt.leaseExpiresAt <= new Date())
    throw new ServiceError('Quality Journey work lease expired.', 'CONFLICT')
  if (item.currentAttempt !== authorizedAttempt.attempt || item.status !== 'IN_PROGRESS')
    throw new ServiceError('Quality Journey work completion is stale.', 'CONFLICT')
  const claimedValues = [item.id, authorizedAttempt.id, item.inputHash, item.role, item.roleContractDigest]
  const resultValues = [result.workItemId, result.attemptId, result.inputHash, result.role, result.roleContractDigest]
  if (claimedValues.some((value, index) => value !== resultValues[index]))
    throw new ServiceError('Worker result does not match the claimed Quality Journey work item.', 'CONFLICT')
  return null
}

async function persistWorkerOutputs(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  for (const output of result.outputs) {
    const identityKey = `${output.kind}:${output.artifactId}:${output.revisionId ?? 'unrevisioned'}`
    const existing = await tx.qualityJourneyArtifact.findUnique({
      where: { journeyId_identityKey: { journeyId: input.journeyId, identityKey } },
    })
    if (existing && existing.contentHash !== output.contentHash)
      throw new ServiceError('Quality Journey artifact identity already has different immutable content.', 'CONFLICT')
    if (existing) continue
    await tx.qualityJourneyArtifact.create({
      data: {
        id: `qja_${createHash('sha256').update(`${input.journeyId}:${identityKey}`).digest('hex').slice(0, 24)}`,
        identityKey,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: item.cycleId,
        kind: output.kind,
        artifactId: output.artifactId,
        revisionId: output.revisionId,
        contentHash: output.contentHash,
        artifactJson: json(output),
      },
    })
  }
}

async function advanceAfterWorkCompletion(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  const journey = await readJourney(input.journeyId, input.targetProjectId, tx)
  const predecessorStateHash = journey.stateHash
  const activeWorkItemIds = parseArray(journey.activeWorkItemIdsJson).filter(id => id !== item.id)
  const current = projection(journey)
  const successorStateHash = hashQualityJourneyState({ ...current, activeWorkItemIds })
  const advanced = await tx.qualityJourney.updateMany({
    where: { id: journey.id, version: journey.version, stateHash: predecessorStateHash },
    data: { activeWorkItemIdsJson: json(activeWorkItemIds), stateHash: successorStateHash, version: { increment: 1 } },
  })
  if (advanced.count !== 1) throw new ServiceError('Quality Journey changed during work completion.', 'CONFLICT')
  const sequence = (await tx.qualityJourneyEvent.count({ where: { journeyId: journey.id } })) + 1
  await tx.qualityJourneyEvent.create({
    data: {
      id: `qje_${randomUUID()}`,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      sequence,
      eventType: 'WORK_COMPLETED',
      predecessorStateHash,
      successorStateHash,
      payloadJson: json({ workItemId: item.id, attemptId: attempt.id, resultHash: hash(result) }),
    },
  })
}

async function validateDurableWorkerLineage(
  input: WorkCompletionInput,
  item: QualityJourneyWorkItem,
  attempt: QualityJourneyWorkAttempt,
  result: WorkerResult,
  tx: Prisma.TransactionClient,
) {
  const lineage = [
    attempt.authorizationId,
    attempt.assignmentJson,
    attempt.assignmentHash,
    attempt.spawnRequestJson,
    attempt.spawnRequestHash,
    attempt.spawnReceiptJson,
    attempt.spawnReceiptHash,
  ]
  if (lineage.some(value => !value))
    throw new ServiceError('Quality Journey work completion has no validated Factory receipt.', 'UNAUTHORIZED')
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({
    where: { id: attempt.authorizationId! },
  })
  if (!authorization) throw new ServiceError('Quality Journey work authorization is unavailable.', 'UNAUTHORIZED')
  const journey = await readJourney(input.journeyId, input.targetProjectId, tx)
  const authorizationPayload = validateFactoryAuthorization(authorization, journey, item)
  const persistedAssignment = JSON.parse(attempt.assignmentJson!)
  const expectedAssignment = assignmentFromAuthorization(authorizationPayload, item, attempt)
  const assignmentBindings = [
    [persistedAssignment.assignmentId, expectedAssignment.assignmentId],
    [persistedAssignment.journeyId, expectedAssignment.journeyId],
    [persistedAssignment.targetProjectId, expectedAssignment.targetProjectId],
    [persistedAssignment.workItemId, expectedAssignment.workItemId],
    [json(persistedAssignment.roleDefinition), json(expectedAssignment.roleDefinition)],
    [json(persistedAssignment.capabilityProfile), json(expectedAssignment.capabilityProfile)],
    [json(persistedAssignment.allowedTargetRoutes), json(expectedAssignment.allowedTargetRoutes)],
    [json(persistedAssignment.allowedResourceIds), json(expectedAssignment.allowedResourceIds)],
    [json(persistedAssignment.targetEnvironmentBindings), json(expectedAssignment.targetEnvironmentBindings)],
    [json(persistedAssignment.writableArtifactKinds), json(expectedAssignment.writableArtifactKinds)],
    [json(persistedAssignment.scope), json(expectedAssignment.scope)],
    [json(persistedAssignment.completionCriteria), json(expectedAssignment.completionCriteria)],
    [persistedAssignment.inputHash, item.inputHash],
    [persistedAssignment.stateHash, item.inputHash],
    [json(persistedAssignment.lease), json(expectedAssignment.lease)],
    [persistedAssignment.idempotencyKey, expectedAssignment.idempotencyKey],
  ]
  if (
    attempt.assignmentHash !== hash(persistedAssignment) ||
    assignmentBindings.some(([actual, expected]) => actual !== expected)
  )
    throw new ServiceError('Quality Journey assignment lineage is invalid.', 'UNAUTHORIZED')
  if (attempt.replacementProjectionHash) {
    const replacement = persistedAssignment.replacement
    if (
      !replacement ||
      replacement.projectionHash !== attempt.replacementProjectionHash ||
      !attempt.predecessorDiagnosticsJson ||
      json(replacement.diagnostics) !== json(JSON.parse(attempt.predecessorDiagnosticsJson))
    )
      throw new ServiceError('Quality Journey replacement assignment lineage is invalid.', 'UNAUTHORIZED')
  } else if (
    persistedAssignment.replacement ||
    json(persistedAssignment.inputArtifacts) !== json(expectedAssignment.inputArtifacts)
  )
    throw new ServiceError('Quality Journey assignment lineage is invalid.', 'UNAUTHORIZED')
  const spawnRequest = JSON.parse(attempt.spawnRequestJson!)
  const spawnReceipt = JSON.parse(attempt.spawnReceiptJson!)
  const requestBindings = [
    [attempt.spawnRequestHash, hash(spawnRequest)],
    [attempt.spawnReceiptHash, hash(spawnReceipt)],
    [spawnRequest.assignmentId, attempt.assignmentId],
    [spawnRequest.requestId, attempt.spawnRequestId],
  ]
  if (requestBindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality Journey worker request lineage is invalid.', 'UNAUTHORIZED')
  try {
    validateWorkerResult(result, { spawnRequest, spawnReceipt, currentInputHash: item.inputHash })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error.'
    throw new ServiceError(`Quality Journey worker result is invalid: ${message}`, 'CONFLICT')
  }
}

function assertWorkCompletionRole(
  role: QualityJourneyRole,
  allowScenarioDesignerCompletion: boolean,
  allowAutomatorCompletion: boolean,
  allowTriagerCompletion: boolean,
) {
  if (role === 'TRIAGER' && !allowTriagerCompletion)
    throw new ServiceError('Triager work requires the specialized sealed-evidence report boundary.', 'UNAUTHORIZED')
  if (role === 'SCOUT' || role === 'RESOURCE_EXPLORER')
    throw new ServiceError(
      'Discovery roles must submit through their specialized discovery bundle boundary.',
      'UNAUTHORIZED',
    )
  if (!allowScenarioDesignerCompletion && role === 'TEST_SCENARIO_DESIGNER')
    throw new ServiceError(
      'Scenario Designer work must submit through the specialized Scenario Portfolio boundary.',
      'UNAUTHORIZED',
    )
  if (role === 'AUTOMATOR' && !allowAutomatorCompletion)
    throw new ServiceError(
      'Automator work must submit through the specialized approved-scenario materialization boundary.',
      'UNAUTHORIZED',
    )
}

async function completeQualityJourneyWorkWithAuthorityInTransaction(
  input: WorkCompletionInput,
  tx: Prisma.TransactionClient,
  allowScenarioDesignerCompletion: boolean,
  allowAutomatorCompletion = false,
  allowTriagerCompletion = false,
) {
  const result = workerResultEnvelopeSchema.parse(input.result)
  const { item, attempt, authorization } = await readWorkAttempt(input, tx)
  assertWorkCompletionRole(item.role, allowScenarioDesignerCompletion, allowAutomatorCompletion, allowTriagerCompletion)
  assertFactoryAuthorityCurrent(item, authorization)
  if (attempt && attempt.status !== 'COMPLETED' && (!attempt.spawnReceiptJson || !attempt.spawnReceiptHash))
    throw new ServiceError('Quality Journey work completion has no validated Factory receipt.', 'UNAUTHORIZED')
  const replay = validateWorkAttempt(input, item, attempt, result)
  if (replay) return replay
  if (!attempt) throw new ServiceError('Quality Journey lease authority is invalid.', 'UNAUTHORIZED')
  await validateDurableWorkerLineage(input, item, attempt, result, tx)
  await persistWorkerOutputs(input, item, result, tx)
  await tx.qualityJourneyWorkAttempt.update({
    where: { id: attempt.id },
    data: { status: 'COMPLETED', completedAt: new Date(), resultJson: json(result), resultHash: hash(result) },
  })
  await tx.qualityJourneyWorkItem.update({
    where: { id: item.id },
    data: { status: 'COMPLETED', version: { increment: 1 } },
  })
  await advanceAfterWorkCompletion(input, item, attempt, result, tx)
  return { replayed: false, workItemId: item.id, status: 'COMPLETED' as const }
}

/** Generic work completion must not bypass a role's specialized semantic ingress. */
export function completeQualityJourneyWorkInTransaction(input: WorkCompletionInput, tx: Prisma.TransactionClient) {
  return completeQualityJourneyWorkWithAuthorityInTransaction(input, tx, false)
}

/** Scenario Portfolio ingress has already validated the Designer-specific submission contract. */
export function completeScenarioDesignerWorkInTransaction(input: WorkCompletionInput, tx: Prisma.TransactionClient) {
  return completeQualityJourneyWorkWithAuthorityInTransaction(input, tx, true)
}

/** Automator output is valid only after the specialized materializer has
 * persisted and cross-checked its concrete artifact lineage. */
export function completeAutomatorWorkInTransaction(input: WorkCompletionInput, tx: Prisma.TransactionClient) {
  return completeQualityJourneyWorkWithAuthorityInTransaction(input, tx, false, true)
}

export function completeTriagerWorkInTransaction(input: WorkCompletionInput, tx: Prisma.TransactionClient) {
  return completeQualityJourneyWorkWithAuthorityInTransaction(input, tx, false, false, true)
}

export async function completeQualityJourneyWork(input: WorkCompletionInput, client: PrismaClient = prisma) {
  return client.$transaction(tx => completeQualityJourneyWorkInTransaction(input, tx))
}

export async function listQualityJourneyArtifacts(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  await readJourney(input.journeyId, input.targetProjectId, client)
  const [revisions, cycles, artifacts, links] = await Promise.all([
    client.qualityJourneyRevision.findMany({ where: { journeyId: input.journeyId }, orderBy: { revision: 'asc' } }),
    client.qualityJourneyCycle.findMany({ where: { journeyId: input.journeyId }, orderBy: { sequence: 'asc' } }),
    client.qualityJourneyArtifact.findMany({ where: { journeyId: input.journeyId }, orderBy: { createdAt: 'asc' } }),
    client.qualityJourneyArtifactLink.findMany({
      where: { journeyId: input.journeyId },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return { revisions, cycles, artifacts, links }
}

/** Read-only Factory evidence deliberately exposes hashes and enforcement state,
 * not lease secrets, provider prompts, worker transcripts, or credentials. */
export async function inspectQualityJourneyFactoryEvidence(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  await readJourney(input.journeyId, input.targetProjectId, client)
  const [authorizations, attempts] = await Promise.all([
    client.qualityJourneyWorkAuthorization.findMany({
      where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyWorkAttempt.findMany({
      where: { workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId } },
      orderBy: [{ workItemId: 'asc' }, { attempt: 'asc' }],
    }),
  ])
  return {
    authorizations: authorizations.map(authorization => ({
      authorizationId: authorization.id,
      workItemId: authorization.workItemId,
      role: authorization.role,
      roleContractDigest: authorization.roleContractDigest,
      capabilityProfileId: authorization.capabilityProfileId,
      capabilityProfileHash: authorization.capabilityProfileHash,
      authorizationHash: authorization.authorizationHash,
      maxAttempts: authorization.maxAttempts,
      cancelledAt: authorization.cancelledAt,
      cancelledBy: authorization.cancelledBy,
      revokedAt: authorization.revokedAt,
      revokedBy: authorization.revokedBy,
    })),
    attempts: attempts.map(attempt => ({
      attemptId: attempt.id,
      workItemId: attempt.workItemId,
      attempt: attempt.attempt,
      status: attempt.status,
      authorizationId: attempt.authorizationId,
      assignmentId: attempt.assignmentId,
      assignmentHash: attempt.assignmentHash,
      spawnRequestId: attempt.spawnRequestId,
      spawnRequestHash: attempt.spawnRequestHash,
      dispatchKey: attempt.dispatchKey,
      dispatchAdapterId: attempt.dispatchAdapterId,
      dispatchReservedAt: attempt.dispatchReservedAt,
      dispatchStartedAt: attempt.dispatchStartedAt,
      spawnReceiptId: attempt.spawnReceiptId,
      spawnReceiptHash: attempt.spawnReceiptHash,
      resultHash: attempt.resultHash,
      replacesAttemptId: attempt.replacesAttemptId,
      replacementProjectionHash: attempt.replacementProjectionHash,
      predecessorDiagnosticsHash: attempt.predecessorDiagnosticsJson
        ? hash(JSON.parse(attempt.predecessorDiagnosticsJson))
        : null,
      cancelledAt: attempt.cancelledAt,
      cancelledBy: attempt.cancelledBy,
      completedAt: attempt.completedAt,
    })),
  }
}
