import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { registerAgentFactoryProviderAdapter } from '@/lib/quality-journey'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  publishQualityJourneyAnalysis,
  submitQualityJourneyAnalysisSuccessor,
} from '@/services/coordinator/quality-journey-analysis-service'
import {
  getQualityJourneyDiscovery,
  submitQualityJourneyTargetObservation,
} from '@/services/coordinator/quality-journey-discovery-service'
import {
  claimQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from '@/services/coordinator/quality-journey-service'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const digest = (character: string) => `sha256:${character.repeat(64)}`

export type QualifiedScout = {
  journeyId: string
  targetProjectId: string
  discoveryRevisionId: string
  cycleId: string
  workItemId: string
  attemptId: string
  leaseId: string
  ownerToken: string
  authorizationId: string
  inputHash: string
  scopeHash: string
  analysisRevision: { artifactId: string; revisionId: string; contentHash: string }
  analysisApproval: { artifactId: string; contentHash: string }
  approvedRequirementSetHash: string
  inputArtifacts: unknown[]
}

type C233CapturedReceipt = {
  artifactId: string
  contentHash: string
  receipt: { snapshotId: string; observationFacts: string[] }
}

function registerLiveAdapter(attemptId: string) {
  registerAgentFactoryProviderAdapter({
    adapterId: `c233-live-${attemptId}`,
    supports: request => request.attemptId === attemptId,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `opaque-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'qualification-harness',
        reasoningLevel: 'HIGH',
        latencyPreference: 'FAST',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('b')],
      })),
      startedAt: new Date().toISOString(),
    }),
  })
}

/** Creates the persisted requirement-to-Scout lineage through public lifecycle services. */
export async function createC233ApprovedScoutLineage(
  client: PrismaClient,
  input: { baseUrl: string; canonicalAuthTransitPolicyJson: string },
): Promise<QualifiedScout> {
  const targetProjectId = `c233-target-${randomUUID()}`
  await client.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `live:${targetProjectId}`,
      canonicalPath: process.cwd(),
      displayName: 'C2.3.3 disposable live qualification',
      fingerprint: digest('p'),
    },
  })
  await client.environment.create({
    data: {
      id: 'c233-environment',
      name: 'live-local',
      baseUrl: input.baseUrl,
      targetProjectId,
      discoveryAuthTransitPolicyJson: input.canonicalAuthTransitPolicyJson,
    },
  })
  await client.module.create({ data: { id: 'c233-module', name: 'Checkout', targetProjectId } })
  await client.locatorGroup.create({
    data: { id: 'c233-locator', name: 'Checkout', route: '/checkout', moduleId: 'c233-module', targetProjectId },
  })
  const created = await createQualityJourney(
    { targetProjectId, idempotencyKey: 'c233-create', requirement: { objective: 'Disposable checkout qualification' } },
    client,
  )
  const requirement = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-submit-requirement',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'c233-submit-requirement',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: requirement.id, requirementHash: requirement.contentHash },
    },
    client,
  )
  const analysis = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId, role: 'REQUIREMENT_ANALYZER' },
    client,
  )
  registerLiveAdapter(analysis.attempt.id)
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: analysis.workItem.id,
      leaseId: analysis.attempt.leaseId,
      ownerToken: analysis.ownerToken,
    },
    client,
  )
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    charterId: 'c233-charter',
    analysisRevisionId: 'c233-analysis',
    journeyId: created.journey.journeyId,
    targetProjectId,
    cycleId: created.journey.activeCycleId,
    requirementRevisionId: requirement.id,
    objectives: ['Qualify scoped checkout access.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Human'],
    requirements: [
      { requirementId: 'C233-REQ', statement: 'Human confirms scoped checkout access.', sourceRefs: ['live-harness'] },
    ],
    obligations: [
      {
        obligationId: 'C233-OBL',
        requirementId: 'C233-REQ',
        statement: 'Checkout is reachable.',
        acceptanceSignals: ['Checkout'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Checkout'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'c233-question',
        prompt: 'Is the disposable account authorized?',
        required: true,
        rationale: 'Human-only live qualification.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
  const submitted = await submitQualityJourneyAnalysisSuccessor(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: analysis.workItem.id,
      attemptId: analysis.attempt.id,
      leaseId: analysis.attempt.leaseId,
      ownerToken: analysis.ownerToken,
      idempotencyKey: 'c233-analysis-submit',
      charter,
    },
    client,
  )
  await answerQualityJourneyAnalysisQuestion(
    {
      idempotencyKey: 'c233-answer',
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        answerId: 'c233-answer',
        journeyId: created.journey.journeyId,
        targetProjectId,
        analysisRevisionId: submitted.analysisRevision.id,
        questionId: 'c233-question',
        answer: 'Yes, operated only in the headed browser.',
        actor: 'USER',
      },
    },
    client,
  )
  const analysisRef = {
    kind: 'ANALYSIS_CHARTER_REVISION' as const,
    artifactId: 'c233-charter',
    revisionId: 'c233-analysis',
    contentHash: submitted.analysisRevision.contentHash,
  }
  const publishState = await getQualityJourney({ journeyId: created.journey.journeyId, targetProjectId }, client)
  await publishQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-publish',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'RUNNER',
      command: 'PUBLISH_ANALYSIS',
      expectedStateHash: publishState.journey.stateHash,
      idempotencyKey: 'c233-publish',
      inputArtifactRefs: [analysisRef],
      payload: {
        artifactRevisionId: submitted.analysisRevision.id,
        artifactHash: submitted.analysisRevision.contentHash,
      },
    },
    client,
  )
  const decisionState = await getQualityJourney({ journeyId: created.journey.journeyId, targetProjectId }, client)
  await decideQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'c233-approve',
      journeyId: created.journey.journeyId,
      targetProjectId,
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: decisionState.journey.stateHash,
      idempotencyKey: 'c233-approve',
      inputArtifactRefs: [analysisRef],
      payload: {
        revisionId: submitted.analysisRevision.id,
        contentHash: submitted.analysisRevision.contentHash,
        decision: 'APPROVED',
      },
    },
    client,
  )
  const revision = (await getQualityJourneyDiscovery({ journeyId: created.journey.journeyId, targetProjectId }, client))
    .revisions[0]!
  const scout = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId, role: 'SCOUT' },
    client,
  )
  registerLiveAdapter(scout.attempt.id)
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId,
      workItemId: scout.workItem.id,
      leaseId: scout.attempt.leaseId,
      ownerToken: scout.ownerToken,
    },
    client,
  )
  const scope = JSON.parse(revision.scoutWorkItem.authorizationScopeJson)
  return {
    journeyId: created.journey.journeyId,
    targetProjectId,
    discoveryRevisionId: revision.id,
    cycleId: created.journey.activeCycleId,
    workItemId: scout.workItem.id,
    attemptId: scout.attempt.id,
    leaseId: scout.attempt.leaseId,
    ownerToken: scout.ownerToken,
    authorizationId: scout.attempt.authorizationId!,
    inputHash: revision.scoutInputHash,
    scopeHash: hash(scope),
    analysisRevision: {
      artifactId: revision.analysisRevisionArtifactId,
      revisionId: submitted.analysisRevision.id,
      contentHash: revision.analysisRevisionContentHash,
    },
    analysisApproval: {
      artifactId: revision.analysisApprovalArtifactId,
      contentHash: revision.analysisApprovalContentHash,
    },
    approvedRequirementSetHash: revision.approvedRequirementSetHash,
    inputArtifacts: JSON.parse(revision.scoutWorkItem.inputArtifactRefsJson),
  }
}

/** Builds and submits the same sealed-receipt observation bundle used by live qualification. */
export async function admitC233ScoutReceipt(
  client: PrismaClient,
  input: {
    scout: QualifiedScout
    captured: C233CapturedReceipt
    environmentId?: string
    routeId?: string
    idempotencyKey?: string
  },
) {
  const admittedFact = input.captured.receipt.observationFacts.find(fact =>
    fact.includes('Appraise observed access outcome ACCESS_CONFIRMED.'),
  )
  if (!admittedFact) throw new Error('The sealed receipt omitted its authenticated access outcome fact.')
  const { scout, captured } = input
  return submitQualityJourneyTargetObservation(
    {
      journeyId: scout.journeyId,
      targetProjectId: scout.targetProjectId,
      discoveryRevisionId: scout.discoveryRevisionId,
      workItemId: scout.workItemId,
      attemptId: scout.attemptId,
      leaseId: scout.leaseId,
      ownerToken: scout.ownerToken,
      idempotencyKey: input.idempotencyKey ?? 'c233-live-observation',
      expectedInputHash: scout.inputHash,
      expectedScopeHash: scout.scopeHash,
      bundle: {
        schemaVersion: 'appraise.quality-journey/v1',
        bundleId: `bundle-${randomUUID()}`,
        journeyId: scout.journeyId,
        targetProjectId: scout.targetProjectId,
        cycleId: scout.cycleId,
        workItemId: scout.workItemId,
        attemptId: scout.attemptId,
        authorizationId: scout.authorizationId,
        inputHash: scout.inputHash,
        assignmentScopeHash: scout.scopeHash,
        analysisRevision: scout.analysisRevision,
        analysisApproval: scout.analysisApproval,
        approvedRequirementSetHash: scout.approvedRequirementSetHash,
        inputArtifacts: scout.inputArtifacts,
        evidenceReceipts: [{ artifactId: captured.artifactId, contentHash: captured.contentHash }],
        observedAt: new Date().toISOString(),
        targetSnapshot: {
          snapshotId: captured.receipt.snapshotId,
          capturedAt: new Date().toISOString(),
          contentHash: hash({
            snapshotId: captured.receipt.snapshotId,
            observationFacts: captured.receipt.observationFacts,
          }),
        },
        observations: [
          {
            observationId: `observation-${randomUUID()}`,
            snapshotId: captured.receipt.snapshotId,
            routeId: input.routeId ?? '/checkout',
            environmentId: input.environmentId ?? 'c233-environment',
            fact: admittedFact,
            evidenceReceiptIds: [captured.artifactId],
            confidence: 'HIGH',
            confidenceRationale: 'Appraise-issued sealed browser receipt.',
            stability: 'STABLE',
            stabilityRationale: 'Frozen selected route.',
            revalidationPolicy: { triggers: ['environment_registry_changed'] },
          },
        ],
      },
    },
    client,
  )
}
