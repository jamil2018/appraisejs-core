import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient, QualityJourney } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  hashResourceResolutionBundle,
  hashTargetObservationBundle,
  resourceResolutionBundleSchema,
  targetObservationBundleSchema,
  type AssignmentManifest,
} from '@/lib/quality-journey'
import { readVisibleResourceOwnerships } from '@/services/project-resource/project-resource-ownership-service'
import { ServiceError } from '@/services/shared/errors'
import { registerQualityJourneyDiscoveryBootstrap } from './quality-journey-discovery-bootstrap'
import { issueQualityJourneyDiscoveryWorkItems, setQualityJourneyActiveWorkItems } from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
function json(value: unknown) {
  return canonicalContractJson(value)
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
}
const idFor = (kind: string, ...parts: string[]) =>
  `qjd_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`

type FrozenResource = {
  id: string
  kind: 'OPERATION' | 'STEP_DEFINITION' | 'LOCATOR' | 'MODULE'
  contentHash: string
  sourceTargetProjectId: string | null
}

type FrozenScope = {
  environments: Array<{ id: string; baseUrl: string; scopeVersion: number }>
  locatorGroups: Array<{ id: string; route: string; moduleId: string }>
  resources: FrozenResource[]
  operationIds: string[]
}
type ResourceResolutionBundle = ReturnType<typeof resourceResolutionBundleSchema.parse>

function canonicalArtifacts(
  analysis: { artifactId: string; artifactRevisionId: string; contentHash: string },
  approval: { artifactId: string; contentHash: string },
): AssignmentManifest['inputArtifacts'] {
  return [
    {
      kind: 'ANALYSIS_CHARTER_REVISION' as const,
      artifactId: analysis.artifactId,
      revisionId: analysis.artifactRevisionId,
      contentHash: analysis.contentHash,
    },
    { kind: 'JOURNEY_APPROVAL' as const, artifactId: approval.artifactId, contentHash: approval.contentHash },
  ]
}

async function compileFrozenScope(targetProjectId: string, db: Db): Promise<FrozenScope> {
  const [environments, allGroups, allLocators, modules, steps, ownerships] = await Promise.all([
    db.environment.findMany({ where: { targetProjectId }, select: { id: true, baseUrl: true, scopeVersion: true } }),
    db.locatorGroup.findMany({ where: { targetProjectId }, select: { id: true, route: true, moduleId: true } }),
    db.locator.findMany({ select: { id: true, value: true, updatedAt: true, targetProjectId: true } }),
    db.module.findMany({ where: { targetProjectId }, select: { id: true, name: true, updatedAt: true } }),
    db.stepDefinition.findMany({
      where: { status: 'ready' },
      select: { id: true, version: true, definitionHash: true },
    }),
    readVisibleResourceOwnerships(targetProjectId, ['locator-group', 'locator', 'step-definition'], db),
  ])
  const visible = (entityType: string, entityId: string, ownTarget = targetProjectId) =>
    ownerships === null || ownTarget === targetProjectId || ownerships.has(`${entityType}:${entityId}`)
  const sourceTarget = (entityType: string, entityId: string, fallback: string | null) =>
    ownerships?.get(`${entityType}:${entityId}`)?.targetProjectId ?? fallback
  const locatorGroups = allGroups
    .filter(group => visible('locator-group', group.id))
    .sort((left, right) => left.id.localeCompare(right.id))
  const locators = allLocators
    .filter(locator => visible('locator', locator.id, locator.targetProjectId))
    .map(locator => ({
      id: `locator:${locator.id}`,
      kind: 'LOCATOR' as const,
      contentHash: hash(locator),
      sourceTargetProjectId: sourceTarget('locator', locator.id, locator.targetProjectId),
    }))
  const readySteps = steps
    .filter(step => ownerships === null || ownerships.has(`step-definition:${step.id}`))
    .map(step => ({
      id: `step:${step.id}:${step.version}`,
      kind: 'STEP_DEFINITION' as const,
      contentHash: step.definitionHash,
      sourceTargetProjectId: sourceTarget('step-definition', step.id, null),
    }))
  const destinationModules = modules.map(module => ({
    id: `module:${module.id}`,
    kind: 'MODULE' as const,
    contentHash: hash(module),
    sourceTargetProjectId: targetProjectId,
  }))
  const operations = defaultOperationDefinitions
    .map(operation => ({
      id: `operation:${operation.id}:${operation.version}`,
      kind: 'OPERATION' as const,
      contentHash: hash(operation),
      sourceTargetProjectId: null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (
    !environments.length ||
    !locatorGroups.length ||
    !destinationModules.length ||
    ![...locators, ...readySteps, ...operations].length
  )
    throw new ServiceError(
      'Discovery cannot be issued until environment, locator-group, and resource inventory authority is available.',
      'CONFLICT',
    )
  return {
    environments: environments.sort((left, right) => left.id.localeCompare(right.id)),
    locatorGroups,
    resources: [...locators, ...destinationModules, ...readySteps, ...operations].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    operationIds: operations.map(operation => operation.id),
  }
}

async function approvedAnalysisOrThrow(journey: QualityJourney, db: Db) {
  const active = JSON.parse(journey.activeRevisionIdsJson) as Record<string, string>
  const analysis = active.analysis
    ? await db.qualityJourneyAnalysisRevision.findFirst({
        where: { journeyId: journey.id, artifactRevisionId: active.analysis },
      })
    : null
  if (!analysis) throw new ServiceError('Discovery requires the active approved analysis revision.', 'CONFLICT')
  const decision = await db.qualityJourneyAnalysisDecision.findUnique({
    where: { analysisRevisionId: analysis.id },
    include: { artifact: true },
  })
  if (!decision || decision.decision !== 'APPROVED')
    throw new ServiceError('Discovery requires an exact approved analysis decision.', 'CONFLICT')
  return { analysis, decision }
}

function approvedRequirementSetHash(analysisArtifactJson: string) {
  const charter = JSON.parse(analysisArtifactJson) as { requirements?: Array<{ requirementId: string }> }
  const requirementIds = (charter.requirements ?? []).map(requirement => requirement.requirementId).sort()
  if (!requirementIds.length) throw new ServiceError('Approved analysis has no requirements to discover.', 'CONFLICT')
  return { requirementIds, hash: hash({ requirementIds }) }
}

function scopes(
  scope: FrozenScope,
  requirementHash: string,
  artifacts: AssignmentManifest['inputArtifacts'],
  journey: QualityJourney,
) {
  const environmentRegistryHash = hash(scope.environments)
  const locatorRegistryHash = hash(scope.locatorGroups)
  const resourceRegistryHash = hash(scope.resources)
  const stepDefinitionRegistryHash = hash(scope.resources.filter(resource => resource.kind === 'STEP_DEFINITION'))
  const operationRegistryHash = hash(scope.resources.filter(resource => resource.kind === 'OPERATION'))
  const scoutScope = {
    environmentIds: scope.environments.map(environment => environment.id),
    routes: [...new Set(scope.locatorGroups.map(group => group.route))].sort(),
    locatorGroupIds: scope.locatorGroups.map(group => group.id),
  }
  const resourceScope = { resources: scope.resources, operationIds: scope.operationIds }
  const shared = {
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    cycleId: journey.activeCycleId,
    approvedRequirementSetHash: requirementHash,
    environmentRegistryHash,
    locatorRegistryHash,
    resourceRegistryHash,
    stepDefinitionRegistryHash,
    operationRegistryHash,
    inputArtifacts: artifacts,
  }
  return {
    environmentRegistryHash,
    locatorRegistryHash,
    resourceRegistryHash,
    stepDefinitionRegistryHash,
    operationRegistryHash,
    scoutScope,
    scoutInputHash: hash({ ...shared, role: 'SCOUT', scope: scoutScope }),
    resourceScope,
    resourceInputHash: hash({ ...shared, role: 'RESOURCE_EXPLORER', scope: resourceScope }),
    scopeHash: hash({ ...shared, scoutScope, resourceScope }),
  }
}

function assertResolvedResourcesAreFrozen(bundle: ResourceResolutionBundle, scope: { resources: FrozenResource[] }) {
  const resources = [...bundle.reusable, ...bundle.incompatible, ...bundle.stale, ...bundle.crossTarget]
  if (
    resources.some(
      resource =>
        !scope.resources.some(
          authorized => authorized.id === resource.resourceId && authorized.kind === resource.resourceKind,
        ),
    )
  )
    throw new ServiceError('Resource resolution exceeds the frozen inventory.', 'CONFLICT')
}

function frozenDestinationModule(
  bundle: ResourceResolutionBundle,
  scope: { resources: FrozenResource[] },
  targetProjectId: string,
) {
  const destination = scope.resources.find(resource => resource.id === `module:${bundle.destinationModuleId}`)
  if (!destination || destination.kind !== 'MODULE' || destination.sourceTargetProjectId !== targetProjectId)
    throw new ServiceError('Resource resolution destination module is outside the frozen target inventory.', 'CONFLICT')
  if (!bundle.reusable.some(resource => resource.resourceId === destination.id && resource.resourceKind === 'MODULE'))
    throw new ServiceError('Resource resolution destination module must be approved as compatible.', 'CONFLICT')
  return destination
}

function assertCrossTargetResourcesMatchFrozenOwnership(
  bundle: ResourceResolutionBundle,
  scope: { resources: FrozenResource[] },
) {
  if (
    bundle.crossTarget.some(entry => {
      const authorized = scope.resources.find(resource => resource.id === entry.resourceId)
      return !authorized?.sourceTargetProjectId || authorized.sourceTargetProjectId !== entry.sourceTargetProjectId
    })
  )
    throw new ServiceError('Cross-target resource provenance does not match frozen ownership.', 'CONFLICT')
}

function assertResourceResolutionWithinFrozenScope(
  bundle: ResourceResolutionBundle,
  scope: { resources: FrozenResource[] },
  targetProjectId: string,
) {
  assertResolvedResourcesAreFrozen(bundle, scope)
  frozenDestinationModule(bundle, scope, targetProjectId)
  assertCrossTargetResourcesMatchFrozenOwnership(bundle, scope)
}

/** Called by exact analysis approval inside the same transaction. */
export async function ensureQualityJourneyDiscoveryForApprovedAnalysis(
  input: {
    journeyId: string
    targetProjectId: string
    predecessorRevisionId?: string
    retryIdempotencyKey?: string
    retryRequestHash?: string
  },
  tx: Prisma.TransactionClient,
) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey || journey.stage !== 'DISCOVERY')
    throw new ServiceError('Discovery is not active for this journey.', 'CONFLICT')
  const current = journey.activeDiscoveryRevisionId
    ? await tx.qualityJourneyDiscoveryRevision.findUnique({ where: { id: journey.activeDiscoveryRevisionId } })
    : null
  if (current) return current
  const { analysis, decision } = await approvedAnalysisOrThrow(journey, tx)
  const analysisArtifact = await tx.qualityJourneyArtifact.findUnique({ where: { id: analysis.artifactRecordId } })
  if (!analysisArtifact) throw new ServiceError('Approved analysis artifact is missing.', 'CONFLICT')
  const requirements = approvedRequirementSetHash(analysisArtifact.artifactJson)
  const frozen = await compileFrozenScope(journey.targetProjectId, tx)
  const artifacts = canonicalArtifacts(analysis, {
    artifactId: decision.artifact.artifactId,
    contentHash: decision.artifact.contentHash,
  })
  const compiled = scopes(frozen, requirements.hash, artifacts, journey)
  const id = idFor('revision', journey.id, analysis.id, compiled.scopeHash, input.predecessorRevisionId ?? 'initial')
  const scoutWorkItemId = idFor('work', id, 'SCOUT')
  const resourceWorkItemId = idFor('work', id, 'RESOURCE_EXPLORER')
  const scoutAuthorizationScope = {
    allowedTargetRoutes: compiled.scoutScope.routes,
    allowedResourceIds: compiled.scoutScope.environmentIds,
    targetEnvironmentBindings: frozen.environments.map(environment => ({
      environmentId: environment.id,
      origin: environment.baseUrl,
    })),
    scope: {
      permittedTools: ['target.observe', 'evidence.publish'],
      permittedCommands: ['work.output.submit'],
      filesystemPaths: [],
      networkOrigins: frozen.environments.map(environment => environment.baseUrl).sort(),
      credentialGrantIds: [],
      targetAccess: 'READ_ONLY' as const,
    },
  }
  const resourceAuthorizationScope = {
    allowedTargetRoutes: [],
    allowedResourceIds: compiled.resourceScope.resources.map(resource => resource.id),
    scope: {
      permittedTools: ['catalog.search', 'artifact.read'],
      permittedCommands: ['work.output.submit'],
      filesystemPaths: [],
      networkOrigins: [],
      credentialGrantIds: [],
      targetAccess: 'NONE' as const,
    },
  }
  await issueQualityJourneyDiscoveryWorkItems(
    journey,
    [
      {
        id: scoutWorkItemId,
        role: 'SCOUT',
        inputHash: compiled.scoutInputHash,
        inputArtifacts: artifacts,
        authorizationScope: scoutAuthorizationScope,
        completionCriteria: ['Submit one provenance-bound Target Observation Bundle for the frozen scope.'],
      },
      {
        id: resourceWorkItemId,
        role: 'RESOURCE_EXPLORER',
        inputHash: compiled.resourceInputHash,
        inputArtifacts: artifacts,
        authorizationScope: resourceAuthorizationScope,
        completionCriteria: ['Submit one ranked Resource Resolution Bundle for the frozen scope.'],
      },
    ],
    tx,
  )
  const revision = await tx.qualityJourneyDiscoveryRevision.create({
    data: {
      id,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      cycleId: journey.activeCycleId,
      analysisRevisionId: analysis.id,
      analysisDecisionId: decision.id,
      analysisArtifactId: analysis.artifactRecordId,
      analysisRevisionArtifactId: analysis.artifactId,
      analysisRevisionContentHash: analysis.contentHash,
      analysisApprovalArtifactId: decision.artifact.artifactId,
      analysisApprovalContentHash: decision.artifact.contentHash,
      approvedRequirementSetHash: requirements.hash,
      environmentRegistryHash: compiled.environmentRegistryHash,
      locatorRegistryHash: compiled.locatorRegistryHash,
      resourceRegistryHash: compiled.resourceRegistryHash,
      stepDefinitionRegistryHash: compiled.stepDefinitionRegistryHash,
      operationRegistryHash: compiled.operationRegistryHash,
      scoutScopeJson: json(compiled.scoutScope),
      scoutInputHash: compiled.scoutInputHash,
      resourceScopeJson: json(compiled.resourceScope),
      resourceInputHash: compiled.resourceInputHash,
      scopeHash: compiled.scopeHash,
      scoutWorkItemId,
      resourceWorkItemId,
      predecessorRevisionId: input.predecessorRevisionId,
      retryIdempotencyKey: input.retryIdempotencyKey,
      retryRequestHash: input.retryRequestHash,
    },
  })
  await setQualityJourneyActiveWorkItems(journey.id, [scoutWorkItemId, resourceWorkItemId], tx)
  await tx.qualityJourney.update({ where: { id: journey.id }, data: { activeDiscoveryRevisionId: revision.id } })
  return revision
}

export async function getQualityJourneyDiscovery(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  const revisions = await client.qualityJourneyDiscoveryRevision.findMany({
    where: { journeyId: journey.id },
    orderBy: { createdAt: 'asc' },
    include: { scoutWorkItem: true, resourceWorkItem: true },
  })
  return { activeDiscoveryRevisionId: journey.activeDiscoveryRevisionId, revisions }
}

async function registryStillCurrent(revision: Awaited<ReturnType<typeof getDiscoveryRevision>>, db: Db) {
  const journey = await db.qualityJourney.findUniqueOrThrow({ where: { id: revision.journeyId } })
  const { analysis, decision } = await approvedAnalysisOrThrow(journey, db)
  if (analysis.id !== revision.analysisRevisionId || decision.id !== revision.analysisDecisionId)
    throw new ServiceError('Discovery analysis lineage is stale.', 'CONFLICT')
  const frozen = await compileFrozenScope(revision.targetProjectId, db)
  const artifacts = canonicalArtifacts(analysis, {
    artifactId: revision.analysisApprovalArtifactId,
    contentHash: revision.analysisApprovalContentHash,
  })
  const compiled = scopes(frozen, revision.approvedRequirementSetHash, artifacts, journey)
  const current = [
    [revision.environmentRegistryHash, compiled.environmentRegistryHash],
    [revision.locatorRegistryHash, compiled.locatorRegistryHash],
    [revision.resourceRegistryHash, compiled.resourceRegistryHash],
    [revision.stepDefinitionRegistryHash, compiled.stepDefinitionRegistryHash],
    [revision.operationRegistryHash, compiled.operationRegistryHash],
    [revision.scoutInputHash, compiled.scoutInputHash],
    [revision.resourceInputHash, compiled.resourceInputHash],
    [revision.scopeHash, compiled.scopeHash],
  ]
  if (current.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Discovery registry authority is stale; revalidate before using this revision.', 'CONFLICT')
  return { journey, analysis, decision, frozen }
}

async function getDiscoveryRevision(
  input: { journeyId: string; targetProjectId: string; discoveryRevisionId?: string },
  db: Db,
) {
  const journey = await db.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  const revisionId = input.discoveryRevisionId ?? journey.activeDiscoveryRevisionId
  if (!revisionId) throw new ServiceError('Quality Journey has no active discovery revision.', 'NOT_FOUND')
  const revision = await db.qualityJourneyDiscoveryRevision.findFirst({
    where: { id: revisionId, journeyId: journey.id },
  })
  if (!revision) throw new ServiceError('Discovery revision not found for the journey.', 'NOT_FOUND')
  return revision
}

function assertBundleBase(
  bundle: {
    journeyId: string
    targetProjectId: string
    cycleId: string
    analysisRevision: { artifactId: string; revisionId: string; contentHash: string }
    analysisApproval: { artifactId: string; contentHash: string }
    workItemId: string
    inputHash: string
    assignmentScopeHash: string
    approvedRequirementSetHash: string
    inputArtifacts: unknown
  },
  revision: Awaited<ReturnType<typeof getDiscoveryRevision>>,
  analysis: { artifactRevisionId: string },
  expectedWorkItemId: string,
  expectedInputHash: string,
) {
  const authorityBindings = [
    [bundle.journeyId, revision.journeyId],
    [bundle.targetProjectId, revision.targetProjectId],
    [bundle.cycleId, revision.cycleId],
    [bundle.workItemId, expectedWorkItemId],
    [bundle.inputHash, expectedInputHash],
    [bundle.approvedRequirementSetHash, revision.approvedRequirementSetHash],
    [bundle.analysisRevision.artifactId, revision.analysisRevisionArtifactId],
    [bundle.analysisRevision.revisionId, analysis.artifactRevisionId],
  ]
  if (authorityBindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Discovery bundle does not bind the frozen revision authority.', 'CONFLICT')
  const expectedArtifacts = canonicalArtifacts(
    {
      artifactId: revision.analysisRevisionArtifactId,
      artifactRevisionId: analysis.artifactRevisionId,
      contentHash: revision.analysisRevisionContentHash,
    },
    { artifactId: revision.analysisApprovalArtifactId, contentHash: revision.analysisApprovalContentHash },
  )
  if (json(bundle.inputArtifacts) !== json(expectedArtifacts))
    throw new ServiceError('Discovery bundle input artifacts do not match frozen lineage.', 'CONFLICT')
  // The relation is deliberately fetched below only where the revision ID is
  // needed; persisted content hashes are sufficient for immutable lineage.
  const provenanceBindings = [
    [bundle.analysisRevision.contentHash, revision.analysisRevisionContentHash],
    [bundle.analysisApproval.artifactId, revision.analysisApprovalArtifactId],
    [bundle.analysisApproval.contentHash, revision.analysisApprovalContentHash],
  ]
  if (provenanceBindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Discovery bundle analysis provenance is stale.', 'CONFLICT')
}

async function assertAttempt(
  bundle: { workItemId: string; attemptId: string; authorizationId: string; ownerToken: string; leaseId: string },
  expectedRole: 'SCOUT' | 'RESOURCE_EXPLORER',
  tx: Prisma.TransactionClient,
) {
  const item = await tx.qualityJourneyWorkItem.findUnique({ where: { id: bundle.workItemId } })
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: bundle.attemptId } })
  const authorization = await tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: bundle.authorizationId } })
  if (!item || !attempt || !authorization)
    throw new ServiceError('Discovery submission lease or authorization is invalid.', 'UNAUTHORIZED')
  const bindings = [
    [item.role, expectedRole],
    [attempt.workItemId, item.id],
    [attempt.leaseId, bundle.leaseId],
    [attempt.authorizationId, authorization.id],
    [authorization.workItemId, item.id],
    [attempt.ownerTokenHash, createHash('sha256').update(bundle.ownerToken).digest('hex')],
    [attempt.status, 'IN_PROGRESS'],
    [item.status, 'IN_PROGRESS'],
  ]
  if (
    bindings.some(([actual, expected]) => actual !== expected) ||
    authorization.revokedAt ||
    authorization.cancelledAt ||
    attempt.leaseExpiresAt <= new Date()
  )
    throw new ServiceError('Discovery submission lease or authorization is invalid.', 'UNAUTHORIZED')
  return { item, attempt }
}

async function assertReplayAuthority(
  bundle: { workItemId: string; attemptId: string; authorizationId: string },
  request: { leaseId: string; ownerToken: string },
  expectedRole: 'SCOUT' | 'RESOURCE_EXPLORER',
  tx: Prisma.TransactionClient,
) {
  const [item, attempt, authorization] = await Promise.all([
    tx.qualityJourneyWorkItem.findUnique({ where: { id: bundle.workItemId } }),
    tx.qualityJourneyWorkAttempt.findUnique({ where: { id: bundle.attemptId } }),
    tx.qualityJourneyWorkAuthorization.findUnique({ where: { id: bundle.authorizationId } }),
  ])
  const ownerTokenHash = createHash('sha256').update(request.ownerToken).digest('hex')
  if (!item || !attempt || !authorization)
    throw new ServiceError('Discovery replay authority is invalid.', 'UNAUTHORIZED')
  const bindings = [
    [item.role, expectedRole],
    [attempt.workItemId, item.id],
    [attempt.authorizationId, authorization.id],
    [authorization.workItemId, item.id],
    [attempt.leaseId, request.leaseId],
    [attempt.ownerTokenHash, ownerTokenHash],
  ]
  if (
    bindings.some(([actual, expected]) => actual !== expected) ||
    authorization.revokedAt ||
    authorization.cancelledAt
  )
    throw new ServiceError('Discovery replay authority is invalid.', 'UNAUTHORIZED')
}

function assertSubmissionEnvelopeMatchesBundle(
  request: z.infer<typeof submissionEnvelopeSchema>,
  bundle: {
    journeyId: string
    targetProjectId: string
    workItemId: string
    attemptId: string
    inputHash: string
    assignmentScopeHash: string
  },
  label: string,
) {
  const bindings = [
    [bundle.journeyId, request.journeyId],
    [bundle.targetProjectId, request.targetProjectId],
    [bundle.workItemId, request.workItemId],
    [bundle.attemptId, request.attemptId],
    [bundle.inputHash, request.expectedInputHash],
    [bundle.assignmentScopeHash, request.expectedScopeHash],
  ]
  if (bindings.some(([actual, expected]) => actual !== expected))
    throw new ServiceError(`${label} submission envelope does not match its strict bundle.`, 'CONFLICT')
}

async function completeDiscoveryAttempt(
  input: { leaseId: string; itemId: string; bundle: unknown; bundleHash: string },
  tx: Prisma.TransactionClient,
) {
  await tx.qualityJourneyWorkAttempt.update({
    where: { leaseId: input.leaseId },
    data: {
      status: 'COMPLETED',
      resultJson: json(input.bundle),
      resultHash: input.bundleHash,
      completedAt: new Date(),
    },
  })
  await tx.qualityJourneyWorkItem.update({
    where: { id: input.itemId },
    data: { status: 'COMPLETED', version: { increment: 1 } },
  })
}

function scopeHashForAuthorization(authorizationScopeJson: string) {
  return hash(JSON.parse(authorizationScopeJson))
}

function replayOrAssertCollecting(
  revision: { status: string },
  persistedKey: string | null,
  persistedHash: string | null,
  requestKey: string,
  bundleHash: string,
  label: string,
) {
  if (persistedKey === requestKey) {
    if (persistedHash !== bundleHash)
      throw new ServiceError('Discovery idempotency key was reused with different input.', 'CONFLICT')
    return true
  }
  if (persistedKey) throw new ServiceError(`${label} output is already immutable for this revision.`, 'CONFLICT')
  if (revision.status !== 'COLLECTING')
    throw new ServiceError('Discovery revision cannot accept additional output.', 'CONFLICT')
  return false
}

async function prepareDiscoverySubmission(
  request: z.infer<typeof submissionEnvelopeSchema>,
  bundleHash: string,
  output: 'TARGET_OBSERVATION' | 'RESOURCE_RESOLUTION',
  tx: Prisma.TransactionClient,
) {
  const revision = await getDiscoveryRevision(request, tx)
  const targetObservation = output === 'TARGET_OBSERVATION'
  const replayed = replayOrAssertCollecting(
    revision,
    targetObservation ? revision.targetObservationIdempotencyKey : revision.resourceResolutionIdempotencyKey,
    targetObservation ? revision.targetObservationHash : revision.resourceResolutionHash,
    request.idempotencyKey,
    bundleHash,
    targetObservation ? 'Scout' : 'Resource',
  )
  if (replayed) return { revision, replayed, analysis: null }
  await registryStillCurrent(revision, tx)
  const analysis = await tx.qualityJourneyAnalysisRevision.findUniqueOrThrow({
    where: { id: revision.analysisRevisionId },
  })
  return { revision, replayed, analysis }
}

async function completeIfReady(revisionId: string, tx: Prisma.TransactionClient) {
  const revision = await tx.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: revisionId } })
  if (!revision.targetObservationHash || !revision.resourceResolutionHash) return revision
  const completionHash = hash({
    discoveryRevisionId: revision.id,
    targetObservationHash: revision.targetObservationHash,
    resourceResolutionHash: revision.resourceResolutionHash,
    scopeHash: revision.scopeHash,
  })
  const completed = await tx.qualityJourneyDiscoveryRevision.updateMany({
    where: { id: revision.id, status: 'COLLECTING', completionHash: null },
    data: { status: 'COMPLETED', completionHash, completedAt: new Date(), rowVersion: { increment: 1 } },
  })
  if (completed.count) {
    const sequence = await tx.qualityJourneyEvent.count({ where: { journeyId: revision.journeyId } })
    await tx.qualityJourneyEvent.create({
      data: {
        id: idFor('event', revision.id, completionHash),
        journeyId: revision.journeyId,
        targetProjectId: revision.targetProjectId,
        sequence: sequence + 1,
        eventType: 'DISCOVERY_COMPLETED',
        predecessorStateHash: revision.scopeHash,
        successorStateHash: completionHash,
        payloadJson: json({ discoveryRevisionId: revision.id, completionHash }),
      },
    })
  }
  return tx.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: revision.id } })
}

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const submissionEnvelopeSchema = z
  .object({
    journeyId: z.string().min(1),
    targetProjectId: z.string().min(1),
    discoveryRevisionId: z.string().min(1),
    workItemId: z.string().min(1),
    attemptId: z.string().min(1),
    leaseId: z.string().min(1),
    ownerToken: z.string().min(1),
    idempotencyKey: z.string().min(1),
    expectedInputHash: digestSchema,
    expectedScopeHash: digestSchema,
    bundle: z.unknown(),
  })
  .strict()

export async function submitQualityJourneyTargetObservation(input: unknown, client: PrismaClient = prisma) {
  const request = submissionEnvelopeSchema.parse(input)
  const bundle = targetObservationBundleSchema.parse(request.bundle)
  const bundleHash = hashTargetObservationBundle(bundle)
  return client.$transaction(async tx => {
    assertSubmissionEnvelopeMatchesBundle(request, bundle, 'Scout')
    const { revision, replayed, analysis } = await prepareDiscoverySubmission(
      request,
      bundleHash,
      'TARGET_OBSERVATION',
      tx,
    )
    if (replayed) {
      await assertReplayAuthority(bundle, request, 'SCOUT', tx)
      return { replayed: true, discoveryRevision: revision }
    }
    if (!analysis) throw new ServiceError('Discovery analysis authority is unavailable.', 'CONFLICT')
    assertBundleBase(bundle, revision, analysis, revision.scoutWorkItemId, revision.scoutInputHash)
    const { item } = await assertAttempt(
      { ...bundle, ownerToken: request.ownerToken, leaseId: request.leaseId },
      'SCOUT',
      tx,
    )
    if (request.expectedScopeHash !== scopeHashForAuthorization(item.authorizationScopeJson))
      throw new ServiceError('Scout assignment scope hash is stale.', 'CONFLICT')
    const scope = JSON.parse(revision.scoutScopeJson) as { environmentIds: string[]; routes: string[] }
    if (
      bundle.observations.some(
        observation =>
          !scope.environmentIds.includes(observation.environmentId) || !scope.routes.includes(observation.routeId),
      )
    )
      throw new ServiceError('Scout observations exceed the frozen target scope.', 'CONFLICT')
    const updated = await tx.qualityJourneyDiscoveryRevision.updateMany({
      where: { id: revision.id, status: 'COLLECTING', targetObservationHash: null },
      data: {
        targetObservationJson: json(bundle),
        targetObservationHash: bundleHash,
        targetObservationIdempotencyKey: request.idempotencyKey,
        targetObservationSubmittedAt: new Date(),
        rowVersion: { increment: 1 },
      },
    })
    if (!updated.count) throw new ServiceError('Scout output raced with another submission.', 'CONFLICT')
    await completeDiscoveryAttempt({ leaseId: request.leaseId, itemId: item.id, bundle, bundleHash }, tx)
    return { replayed: false, discoveryRevision: await completeIfReady(revision.id, tx) }
  })
}

export async function submitQualityJourneyResourceResolution(input: unknown, client: PrismaClient = prisma) {
  const request = submissionEnvelopeSchema.parse(input)
  const bundle = resourceResolutionBundleSchema.parse(request.bundle)
  const bundleHash = hashResourceResolutionBundle(bundle)
  return client.$transaction(async tx => {
    assertSubmissionEnvelopeMatchesBundle(request, bundle, 'Resource')
    const { revision, replayed, analysis } = await prepareDiscoverySubmission(
      request,
      bundleHash,
      'RESOURCE_RESOLUTION',
      tx,
    )
    if (replayed) {
      await assertReplayAuthority(bundle, request, 'RESOURCE_EXPLORER', tx)
      return { replayed: true, discoveryRevision: revision }
    }
    if (!analysis) throw new ServiceError('Discovery analysis authority is unavailable.', 'CONFLICT')
    assertBundleBase(bundle, revision, analysis, revision.resourceWorkItemId, revision.resourceInputHash)
    const { item } = await assertAttempt(
      { ...bundle, ownerToken: request.ownerToken, leaseId: request.leaseId },
      'RESOURCE_EXPLORER',
      tx,
    )
    if (request.expectedScopeHash !== scopeHashForAuthorization(item.authorizationScopeJson))
      throw new ServiceError('Resource Explorer assignment scope hash is stale.', 'CONFLICT')
    const scope = JSON.parse(revision.resourceScopeJson) as { resources: FrozenResource[] }
    assertResourceResolutionWithinFrozenScope(bundle, scope, request.targetProjectId)
    const updated = await tx.qualityJourneyDiscoveryRevision.updateMany({
      where: { id: revision.id, status: 'COLLECTING', resourceResolutionHash: null },
      data: {
        resourceResolutionJson: json(bundle),
        resourceResolutionHash: bundleHash,
        resourceResolutionIdempotencyKey: request.idempotencyKey,
        resourceResolutionSubmittedAt: new Date(),
        rowVersion: { increment: 1 },
      },
    })
    if (!updated.count) throw new ServiceError('Resource output raced with another submission.', 'CONFLICT')
    await completeDiscoveryAttempt({ leaseId: request.leaseId, itemId: item.id, bundle, bundleHash }, tx)
    return { replayed: false, discoveryRevision: await completeIfReady(revision.id, tx) }
  })
}

const retrySchema = z
  .object({
    journeyId: z.string().min(1),
    targetProjectId: z.string().min(1),
    expectedActiveDiscoveryRevisionId: z.string().min(1),
    idempotencyKey: z.string().min(1),
    reason: z.string().trim().min(1).max(8_000),
  })
  .strict()

export async function retryQualityJourneyDiscovery(input: unknown, client: PrismaClient = prisma) {
  const request = retrySchema.parse(input)
  const requestHash = hash(request)
  return client.$transaction(async tx => {
    const predecessor = await getDiscoveryRevision(
      { ...request, discoveryRevisionId: request.expectedActiveDiscoveryRevisionId },
      tx,
    )
    const replay = await tx.qualityJourneyDiscoveryRevision.findFirst({
      where: { predecessorRevisionId: predecessor.id },
    })
    if (replay) {
      if (replay.retryIdempotencyKey === request.idempotencyKey && replay.retryRequestHash === requestHash)
        return { replayed: true, discoveryRevision: replay }
      throw new ServiceError('Discovery retry already has a competing successor.', 'CONFLICT')
    }
    const journeyState = await tx.qualityJourney.findUniqueOrThrow({ where: { id: predecessor.journeyId } })
    if (journeyState.activeDiscoveryRevisionId !== predecessor.id)
      throw new ServiceError('Discovery retry does not bind the active discovery revision.', 'CONFLICT')
    if (predecessor.status === 'COLLECTING')
      throw new ServiceError('Discovery retry requires a terminal or invalidated predecessor.', 'CONFLICT')
    const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: predecessor.journeyId } })
    await tx.qualityJourney.update({ where: { id: journey.id }, data: { activeDiscoveryRevisionId: null } })
    await tx.qualityJourneyDiscoveryRevision.update({
      where: { id: predecessor.id },
      data: { status: 'SUPERSEDED', supersededAt: new Date(), rowVersion: { increment: 1 } },
    })
    const predecessorWorkItemIds = [predecessor.scoutWorkItemId, predecessor.resourceWorkItemId]
    const cancelledAt = new Date()
    await tx.qualityJourneyWorkAttempt.updateMany({
      where: {
        workItemId: { in: predecessorWorkItemIds },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'REFUSED', 'FAILED', 'EXPIRED'] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt,
        cancelledBy: 'RUNNER',
        cancellationReason: 'Discovery revision superseded by an authorized retry.',
      },
    })
    await tx.qualityJourneyWorkAuthorization.updateMany({
      where: { workItemId: { in: predecessorWorkItemIds }, revokedAt: null },
      data: {
        revokedAt: cancelledAt,
        revokedBy: 'RUNNER',
        revocationReason: 'Discovery revision superseded by an authorized retry.',
      },
    })
    await tx.qualityJourneyWorkItem.updateMany({
      where: { id: { in: predecessorWorkItemIds }, status: { not: 'COMPLETED' } },
      data: { status: 'SUPERSEDED', version: { increment: 1 } },
    })
    const fresh = await ensureQualityJourneyDiscoveryForApprovedAnalysis(
      {
        journeyId: journey.id,
        targetProjectId: journey.targetProjectId,
        predecessorRevisionId: predecessor.id,
        retryIdempotencyKey: request.idempotencyKey,
        retryRequestHash: requestHash,
      },
      tx,
    )
    return { replayed: false, discoveryRevision: fresh }
  })
}

registerQualityJourneyDiscoveryBootstrap(ensureQualityJourneyDiscoveryForApprovedAnalysis)

export async function revalidateQualityJourneyDiscovery(
  input: { journeyId: string; targetProjectId: string; expectedActiveDiscoveryRevisionId: string },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const revision = await getDiscoveryRevision(
      { ...input, discoveryRevisionId: input.expectedActiveDiscoveryRevisionId },
      tx,
    )
    const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: revision.journeyId } })
    if (journey.activeDiscoveryRevisionId !== revision.id)
      throw new ServiceError('Discovery revalidation does not bind the active discovery revision.', 'CONFLICT')
    try {
      await registryStillCurrent(revision, tx)
      return { valid: true, discoveryRevision: revision }
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error
      const invalidated = await tx.qualityJourneyDiscoveryRevision.update({
        where: { id: revision.id },
        data: { status: 'INVALIDATED', invalidatedAt: new Date(), rowVersion: { increment: 1 } },
      })
      return { valid: false, discoveryRevision: invalidated, reason: error.message }
    }
  })
}
