import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { clearAgentFactoryProviderAdaptersForTest, registerAgentFactoryProviderAdapter } from '@/lib/quality-journey'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  claimQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  resumeQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'
import {
  answerQualityJourneyAnalysisQuestion,
  decideQualityJourneyAnalysis,
  getQualityJourneyAnalysis,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
  submitQualityJourneyAnalysisSuccessor,
} from './quality-journey-analysis-service'
import {
  getQualityJourneyDiscovery,
  revalidateQualityJourneyDiscovery,
  retryQualityJourneyDiscovery,
  submitQualityJourneyResourceResolution,
  submitQualityJourneyTargetObservation,
} from './quality-journey-discovery-service'
import {
  commentQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
  disposeQualityJourneyScenarioComment,
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  requestQualityJourneyScenarioRevision,
  startQualityJourneyScenarioDesign,
  submitQualityJourneyScenarioPortfolio,
} from './quality-journey-scenario-service'
import { hashScenarioPortfolio } from '@/lib/quality-journey'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

afterEach(async () => {
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-analysis-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: 'target-analysis-1',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Analysis fixture',
      fingerprint: digest('a'),
    },
  })
  await client.environment.create({
    data: {
      id: 'environment-analysis-1',
      name: 'local',
      baseUrl: 'https://example.test',
      targetProjectId: 'target-analysis-1',
    },
  })
  await client.module.create({
    data: { id: 'module-analysis-1', name: 'Checkout', targetProjectId: 'target-analysis-1' },
  })
  await client.locatorGroup.create({
    data: {
      id: 'locator-group-analysis-1',
      name: 'Checkout route',
      route: '/checkout',
      moduleId: 'module-analysis-1',
      targetProjectId: 'target-analysis-1',
    },
  })
  return client
}

function charter(journeyId: string, cycleId: string, suffix = '1') {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    charterId: `analysis-charter-${suffix}`,
    analysisRevisionId: `analysis-revision-${suffix}`,
    journeyId,
    targetProjectId: 'target-analysis-1',
    cycleId,
    requirementRevisionId: 'requirement-revision-1',
    objectives: ['Allow checkout.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Shopper'],
    requirements: [
      { requirementId: 'REQ-CHECKOUT-1', statement: 'A shopper submits an order.', sourceRefs: ['brief:1'] },
    ],
    obligations: [
      {
        obligationId: 'OBL-CHECKOUT-1',
        requirementId: 'REQ-CHECKOUT-1',
        statement: 'A confirmation appears.',
        acceptanceSignals: ['Confirmation'],
      },
    ],
    constraints: [],
    assumptions: ['The user is authenticated.'],
    risks: [],
    acceptanceSignals: ['Confirmation'],
    retiredRequirementIds: [],
    questions: [
      {
        questionId: 'question-payment',
        prompt: 'Which payment method is in scope?',
        required: true,
        rationale: 'The scenario depends on it.',
      },
    ],
    resolvedQuestionAnswerIds: [],
  }
}

async function readyAnalyzer(client: PrismaClient) {
  const created = await createQualityJourney(
    { targetProjectId: 'target-analysis-1', idempotencyKey: 'create-analysis', requirement: { objective: 'Checkout' } },
    client,
  )
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'submit-requirement',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'submit-requirement',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: 'requirement-revision-1', requirementHash: digest('b') },
    },
    client,
  )
  const state = await getQualityJourney(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
    client,
  )
  const claim = await claimQualityJourneyWork(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
    client,
  )
  registerAgentFactoryProviderAdapter({
    adapterId: 'analysis-test-adapter',
    supports: request => request.attemptId === claim.attempt.id,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `receipt-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'provider-selected',
        reasoningLevel: 'HIGH',
        latencyPreference: 'DELIBERATE',
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('f')],
      })),
      startedAt: '2026-09-01T00:00:00.000Z',
    }),
  })
  await dispatchQualityJourneyWork(
    {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      workItemId: claim.workItem.id,
      leaseId: claim.attempt.leaseId,
      ownerToken: claim.ownerToken,
    },
    client,
  )
  return { created, state, claim }
}

function registerStartedAnalyzerAdapter(
  attemptId: string,
  adapterId: string,
  latencyPreference: 'FAST' | 'DELIBERATE' = 'DELIBERATE',
) {
  registerAgentFactoryProviderAdapter({
    adapterId,
    supports: request => request.attemptId === attemptId,
    dispatch: async request => ({
      schemaVersion: 'appraise.quality-journey/v1',
      outcome: 'STARTED',
      spawnReceiptId: `receipt-${request.attemptId}`,
      assignmentId: request.assignmentId,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      roleDefinitionDigest: request.roleDefinitionDigest,
      capabilityProfileDigest: request.capabilityProfileDigest,
      effectiveWorker: {
        modelId: 'provider-selected',
        reasoningLevel: 'HIGH',
        latencyPreference,
        toolIds: request.scope.permittedTools,
      },
      boundaries: request.requiredBoundaries.map(boundary => ({
        boundary: boundary.boundary,
        requested: boundary.allowedValues,
        effective: boundary.allowedValues,
        status: 'VERIFIED',
        evidence: [digest('f')],
      })),
      startedAt: '2026-09-01T00:00:00.000Z',
    }),
  })
}

/** Builds the smallest real Phase 3/4 lineage needed by the Phase 5 successor
 * tests.  It deliberately goes through the public services: a revision
 * successor must not be tested against synthetic discovery authority. */
async function completedDiscovery(client: PrismaClient, suffix: string) {
  const { created, claim } = await readyAnalyzer(client)
  const submitted = await submitQualityJourneyAnalysisSuccessor(
    {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      workItemId: claim.workItem.id,
      attemptId: claim.attempt.id,
      leaseId: claim.attempt.leaseId,
      ownerToken: claim.ownerToken,
      idempotencyKey: `${suffix}-analysis-submit`,
      charter: charter(created.journey.journeyId, created.journey.activeCycleId, suffix),
    },
    client,
  )
  await answerQualityJourneyAnalysisQuestion(
    {
      idempotencyKey: `${suffix}-answer`,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        answerId: `${suffix}-answer`,
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        analysisRevisionId: submitted.analysisRevision.id,
        questionId: 'question-payment',
        answer: 'Card payment.',
        actor: 'USER',
      },
    },
    client,
  )
  const analysisRef = {
    kind: 'ANALYSIS_CHARTER_REVISION' as const,
    artifactId: `analysis-charter-${suffix}`,
    revisionId: `analysis-revision-${suffix}`,
    contentHash: submitted.analysisRevision.contentHash,
  }
  const readyForPublish = await getQualityJourney(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
    client,
  )
  await publishQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: `${suffix}-publish-analysis`,
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      actor: 'RUNNER',
      command: 'PUBLISH_ANALYSIS',
      expectedStateHash: readyForPublish.journey.stateHash,
      idempotencyKey: `${suffix}-publish-analysis`,
      inputArtifactRefs: [analysisRef],
      payload: {
        artifactRevisionId: submitted.analysisRevision.id,
        artifactHash: submitted.analysisRevision.contentHash,
      },
    },
    client,
  )
  const readyForDecision = await getQualityJourney(
    { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
    client,
  )
  await decideQualityJourneyAnalysis(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: `${suffix}-approve-analysis`,
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: readyForDecision.journey.stateHash,
      idempotencyKey: `${suffix}-approve-analysis`,
      inputArtifactRefs: [analysisRef],
      payload: {
        revisionId: submitted.analysisRevision.id,
        contentHash: submitted.analysisRevision.contentHash,
        decision: 'APPROVED',
      },
    },
    client,
  )
  const discovery = (
    await getQualityJourneyDiscovery(
      { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
      client,
    )
  ).revisions[0]
  const [scout, resource] = await Promise.all([
    claimQualityJourneyWork(
      { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'SCOUT' },
      client,
    ),
    claimQualityJourneyWork(
      { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'RESOURCE_EXPLORER' },
      client,
    ),
  ])
  registerStartedAnalyzerAdapter(scout.attempt.id, `${suffix}-scout-adapter`, 'FAST')
  registerStartedAnalyzerAdapter(resource.attempt.id, `${suffix}-resource-adapter`, 'FAST')
  await Promise.all(
    [scout, resource].map(work =>
      dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: work.workItem.id,
          leaseId: work.attempt.leaseId,
          ownerToken: work.ownerToken,
        },
        client,
      ),
    ),
  )
  const inputArtifacts = JSON.parse(discovery.scoutWorkItem.inputArtifactRefsJson)
  const baseBundle = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    journeyId: created.journey.journeyId,
    targetProjectId: 'target-analysis-1',
    cycleId: created.journey.activeCycleId,
    analysisRevision: {
      artifactId: discovery.analysisRevisionArtifactId,
      revisionId: submitted.analysisRevision.id,
      contentHash: discovery.analysisRevisionContentHash,
    },
    analysisApproval: {
      artifactId: discovery.analysisApprovalArtifactId,
      contentHash: discovery.analysisApprovalContentHash,
    },
    approvedRequirementSetHash: discovery.approvedRequirementSetHash,
    inputArtifacts,
    evidenceReceipts: [{ artifactId: `${suffix}-evidence`, contentHash: digest('e') }],
  }
  const scoutScope = JSON.parse(discovery.scoutWorkItem.authorizationScopeJson)
  await submitQualityJourneyTargetObservation(
    {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      discoveryRevisionId: discovery.id,
      workItemId: scout.workItem.id,
      attemptId: scout.attempt.id,
      leaseId: scout.attempt.leaseId,
      ownerToken: scout.ownerToken,
      idempotencyKey: `${suffix}-observation`,
      expectedInputHash: discovery.scoutInputHash,
      expectedScopeHash: hash(scoutScope),
      bundle: {
        ...baseBundle,
        bundleId: `${suffix}-observation-bundle`,
        workItemId: scout.workItem.id,
        attemptId: scout.attempt.id,
        authorizationId: scout.attempt.authorizationId!,
        inputHash: discovery.scoutInputHash,
        assignmentScopeHash: hash(scoutScope),
        observedAt: '2026-09-04T00:00:00.000Z',
        targetSnapshot: {
          snapshotId: `${suffix}-snapshot`,
          capturedAt: '2026-09-04T00:00:00.000Z',
          contentHash: digest('c'),
        },
        observations: [
          {
            observationId: `${suffix}-observation`,
            snapshotId: `${suffix}-snapshot`,
            routeId: '/checkout',
            environmentId: 'environment-analysis-1',
            fact: 'Checkout is visible.',
            evidenceReceiptIds: [`${suffix}-evidence`],
            confidence: 'HIGH' as const,
            confidenceRationale: 'The snapshot directly shows the checkout.',
            stability: 'STABLE' as const,
            stabilityRationale: 'The route is part of the registered target.',
            revalidationPolicy: { triggers: ['environment_registry_changed'] },
          },
        ],
      },
    },
    client,
  )
  const frozenResource = (JSON.parse(discovery.resourceScopeJson) as { resources: Array<{ id: string; kind: string }> })
    .resources[0]
  const resourceScope = JSON.parse(discovery.resourceWorkItem.authorizationScopeJson)
  await submitQualityJourneyResourceResolution(
    {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-analysis-1',
      discoveryRevisionId: discovery.id,
      workItemId: resource.workItem.id,
      attemptId: resource.attempt.id,
      leaseId: resource.attempt.leaseId,
      ownerToken: resource.ownerToken,
      idempotencyKey: `${suffix}-resource`,
      expectedInputHash: discovery.resourceInputHash,
      expectedScopeHash: hash(resourceScope),
      bundle: {
        ...baseBundle,
        bundleId: `${suffix}-resource-bundle`,
        workItemId: resource.workItem.id,
        attemptId: resource.attempt.id,
        authorizationId: resource.attempt.authorizationId!,
        inputHash: discovery.resourceInputHash,
        assignmentScopeHash: hash(resourceScope),
        resolvedAt: '2026-09-04T00:00:00.000Z',
        approvedRequirementIds: ['REQ-CHECKOUT-1'],
        reusable: [
          {
            resourceId: frozenResource.id,
            resourceKind: frozenResource.kind,
            requirementId: 'REQ-CHECKOUT-1',
            rank: 1,
            explanation: 'The frozen resource is compatible.',
            evidenceReceiptIds: [`${suffix}-evidence`],
            reasonCode: 'COMPATIBLE' as const,
          },
        ],
        incompatible: [],
        stale: [],
        crossTarget: [],
        missing: [],
      },
    },
    client,
  )
  const completed = await client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: discovery.id } })
  return { created, submitted, discovery: completed, frozenResource }
}

describe('Quality Journey Phase 3 through Phase 5 control plane', () => {
  it('keeps charter/question/answer lineage immutable and blocks approval until required Q&A resolves', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-submit-1',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId),
        },
        client,
      )
      expect(submitted.replayed).toBe(false)
      const afterSubmit = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(afterSubmit.journey.unresolvedQuestionIds).toEqual(['question-payment'])
      expect(afterSubmit.journey.activeRevisionIds).not.toHaveProperty('analysisReview')
      expect(afterSubmit.journey.analysisReviewHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      const contentHash = submitted.analysisRevision.contentHash
      const charterRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-1',
        revisionId: 'analysis-revision-1',
        contentHash,
      }
      const publish = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'publish-analysis-1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: afterSubmit.journey.stateHash,
        idempotencyKey: 'publish-analysis-1',
        inputArtifactRefs: [charterRef],
        payload: { artifactRevisionId: 'analysis-revision-1', artifactHash: contentHash },
      }
      await expect(publishQualityJourneyAnalysis(publish, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.qualityJourneyAnalysisPublication.count()).toBe(0)
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'answer-payment-1',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'answer-payment-1',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-1',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const answeredAnalysis = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(answeredAnalysis.journey.unresolvedQuestionIds).toEqual([])
      await publishQualityJourneyAnalysis({ ...publish, expectedStateHash: answeredAnalysis.journey.stateHash }, client)
      await expect(
        publishQualityJourneyAnalysis({ ...publish, expectedStateHash: answeredAnalysis.journey.stateHash }, client),
      ).resolves.toMatchObject({ outcome: 'COMMITTED', replayed: true })
      await expect(
        publishQualityJourneyAnalysis(
          {
            ...publish,
            commandId: 'publish-analysis-1-changed',
            expectedStateHash: answeredAnalysis.journey.stateHash,
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      expect(await client.qualityJourneyAnalysisPublication.count()).toBe(1)
      const review = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const decide = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'decide-analysis-1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'USER',
        command: 'DECIDE_ANALYSIS',
        expectedStateHash: review.journey.stateHash,
        idempotencyKey: 'decide-analysis-1',
        inputArtifactRefs: [charterRef],
        payload: { revisionId: 'analysis-revision-1', contentHash, decision: 'APPROVED' },
      }
      await expect(decideQualityJourneyAnalysis(decide, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        successorStage: 'DISCOVERY',
      })
      await expect(decideQualityJourneyAnalysis(decide, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
      })
      await expect(
        decideQualityJourneyAnalysis({ ...decide, commandId: 'decide-analysis-1-changed' }, client),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      expect(await client.qualityJourneyAnalysisDecision.count()).toBe(1)
      const discovery = await getQualityJourneyDiscovery(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(discovery.revisions).toHaveLength(1)
      const discoveryRevision = discovery.revisions[0]
      expect(discoveryRevision.status).toBe('COLLECTING')
      expect([discoveryRevision.scoutWorkItem.role, discoveryRevision.resourceWorkItem.role]).toEqual([
        'SCOUT',
        'RESOURCE_EXPLORER',
      ])
      const scoutClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'SCOUT' },
        client,
      )
      const resourceClaim = await claimQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          role: 'RESOURCE_EXPLORER',
        },
        client,
      )
      expect(scoutClaim.assignment.allowedResourceIds).toContain('environment-analysis-1')
      expect(scoutClaim.assignment.allowedTargetRoutes).toContain('/checkout')
      expect(scoutClaim.assignment.targetEnvironmentBindings).toEqual([
        { environmentId: 'environment-analysis-1', origin: 'https://example.test' },
      ])
      const collectingState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'premature-scenario-design',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'START_SCENARIO_DESIGN',
            expectedStateHash: collectingState.journey.stateHash,
            idempotencyKey: 'premature-scenario-design',
            inputArtifactRefs: [],
            payload: {},
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      registerStartedAnalyzerAdapter(scoutClaim.attempt.id, 'discovery-scout-adapter', 'FAST')
      registerStartedAnalyzerAdapter(resourceClaim.attempt.id, 'discovery-resource-adapter', 'FAST')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: scoutClaim.workItem.id,
          leaseId: scoutClaim.attempt.leaseId,
          ownerToken: scoutClaim.ownerToken,
        },
        client,
      )
      expect(
        await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: scoutClaim.attempt.id } }),
      ).toMatchObject({
        status: 'IN_PROGRESS',
        authorizationId: scoutClaim.attempt.authorizationId,
        leaseId: scoutClaim.attempt.leaseId,
      })
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: resourceClaim.workItem.id,
          leaseId: resourceClaim.attempt.leaseId,
          ownerToken: resourceClaim.ownerToken,
        },
        client,
      )
      const inputArtifacts = JSON.parse(discoveryRevision.scoutWorkItem.inputArtifactRefsJson)
      const bundleBase = {
        schemaVersion: 'appraise.quality-journey/v1' as const,
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        cycleId: created.journey.activeCycleId,
        analysisRevision: {
          artifactId: discoveryRevision.analysisRevisionArtifactId,
          revisionId: 'analysis-revision-1',
          contentHash: discoveryRevision.analysisRevisionContentHash,
        },
        analysisApproval: {
          artifactId: discoveryRevision.analysisApprovalArtifactId,
          contentHash: discoveryRevision.analysisApprovalContentHash,
        },
        approvedRequirementSetHash: discoveryRevision.approvedRequirementSetHash,
        inputArtifacts,
        evidenceReceipts: [{ artifactId: 'evidence-1', contentHash: digest('e') }],
      }
      const scoutScope = JSON.parse(discoveryRevision.scoutWorkItem.authorizationScopeJson)
      const scoutBundle = {
        ...bundleBase,
        bundleId: 'observation-bundle-1',
        workItemId: scoutClaim.workItem.id,
        attemptId: scoutClaim.attempt.id,
        authorizationId: scoutClaim.attempt.authorizationId!,
        inputHash: discoveryRevision.scoutInputHash,
        assignmentScopeHash: hash(scoutScope),
        observedAt: '2026-09-04T00:00:00.000Z',
        targetSnapshot: {
          snapshotId: 'snapshot-1',
          capturedAt: '2026-09-04T00:00:00.000Z',
          contentHash: digest('c'),
        },
        observations: [
          {
            observationId: 'observation-1',
            snapshotId: 'snapshot-1',
            routeId: '/checkout',
            environmentId: 'environment-analysis-1',
            fact: 'Checkout is visible.',
            evidenceReceiptIds: ['evidence-1'],
            confidence: 'HIGH' as const,
            confidenceRationale: 'The snapshot directly shows the checkout.',
            stability: 'STABLE' as const,
            stabilityRationale: 'The route is part of the registered target.',
            revalidationPolicy: { triggers: ['environment_registry_changed'] },
          },
        ],
      }
      await expect(
        submitQualityJourneyTargetObservation(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            discoveryRevisionId: discoveryRevision.id,
            workItemId: scoutClaim.workItem.id,
            attemptId: scoutClaim.attempt.id,
            leaseId: scoutClaim.attempt.leaseId,
            ownerToken: scoutClaim.ownerToken,
            idempotencyKey: 'submit-observation-1',
            expectedInputHash: discoveryRevision.scoutInputHash,
            expectedScopeHash: hash(scoutScope),
            bundle: scoutBundle,
          },
          client,
        ),
      ).resolves.toMatchObject({ replayed: false, discoveryRevision: { status: 'COLLECTING' } })
      await expect(
        submitQualityJourneyTargetObservation(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            discoveryRevisionId: discoveryRevision.id,
            workItemId: scoutClaim.workItem.id,
            attemptId: scoutClaim.attempt.id,
            leaseId: scoutClaim.attempt.leaseId,
            ownerToken: scoutClaim.ownerToken,
            idempotencyKey: 'submit-observation-1',
            expectedInputHash: discoveryRevision.scoutInputHash,
            expectedScopeHash: hash(scoutScope),
            bundle: scoutBundle,
          },
          client,
        ),
      ).resolves.toMatchObject({ replayed: true })
      await expect(
        submitQualityJourneyTargetObservation(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            discoveryRevisionId: discoveryRevision.id,
            workItemId: scoutClaim.workItem.id,
            attemptId: scoutClaim.attempt.id,
            leaseId: scoutClaim.attempt.leaseId,
            ownerToken: 'not-the-lease-owner',
            idempotencyKey: 'submit-observation-1',
            expectedInputHash: discoveryRevision.scoutInputHash,
            expectedScopeHash: hash(scoutScope),
            bundle: scoutBundle,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      const resourceScope = JSON.parse(discoveryRevision.resourceWorkItem.authorizationScopeJson)
      const frozenResource = (
        JSON.parse(discoveryRevision.resourceScopeJson) as { resources: Array<{ id: string; kind: string }> }
      ).resources[0]
      const resourceBundle = {
        ...bundleBase,
        bundleId: 'resource-bundle-1',
        workItemId: resourceClaim.workItem.id,
        attemptId: resourceClaim.attempt.id,
        authorizationId: resourceClaim.attempt.authorizationId!,
        inputHash: discoveryRevision.resourceInputHash,
        assignmentScopeHash: hash(resourceScope),
        resolvedAt: '2026-09-04T00:00:00.000Z',
        approvedRequirementIds: ['REQ-CHECKOUT-1'],
        reusable: [
          {
            resourceId: frozenResource.id,
            resourceKind: frozenResource.kind,
            requirementId: 'REQ-CHECKOUT-1',
            rank: 1,
            explanation: 'The frozen resource is compatible.',
            evidenceReceiptIds: ['evidence-1'],
            reasonCode: 'COMPATIBLE' as const,
          },
        ],
        incompatible: [],
        stale: [],
        crossTarget: [],
        missing: [],
      }
      await expect(
        submitQualityJourneyResourceResolution(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            discoveryRevisionId: discoveryRevision.id,
            workItemId: resourceClaim.workItem.id,
            attemptId: resourceClaim.attempt.id,
            leaseId: resourceClaim.attempt.leaseId,
            ownerToken: resourceClaim.ownerToken,
            idempotencyKey: 'submit-resource-wrong-kind',
            expectedInputHash: discoveryRevision.resourceInputHash,
            expectedScopeHash: hash(resourceScope),
            bundle: {
              ...resourceBundle,
              reusable: [{ ...resourceBundle.reusable[0], resourceKind: 'TEMPLATE' }],
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        submitQualityJourneyResourceResolution(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            discoveryRevisionId: discoveryRevision.id,
            workItemId: resourceClaim.workItem.id,
            attemptId: resourceClaim.attempt.id,
            leaseId: resourceClaim.attempt.leaseId,
            ownerToken: resourceClaim.ownerToken,
            idempotencyKey: 'submit-resource-1',
            expectedInputHash: discoveryRevision.resourceInputHash,
            expectedScopeHash: hash(resourceScope),
            bundle: resourceBundle,
          },
          client,
        ),
      ).resolves.toMatchObject({ replayed: false, discoveryRevision: { status: 'COMPLETED' } })
      expect(
        await client.qualityJourneyEvent.count({
          where: { journeyId: created.journey.journeyId, eventType: 'DISCOVERY_COMPLETED' },
        }),
      ).toBe(1)
      const scenarioStartState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        startQualityJourneyScenarioDesign(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'start-scenarios-1',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            expectedStateHash: scenarioStartState.journey.stateHash,
            idempotencyKey: 'start-scenarios-1',
            inputArtifactRefs: [],
            command: 'START_SCENARIO_DESIGN',
            payload: {},
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'COMMITTED', successorStage: 'SCENARIO_DESIGN' })
      const designerClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'TEST_SCENARIO_DESIGNER' },
        client,
      )
      registerStartedAnalyzerAdapter(designerClaim.attempt.id, 'scenario-designer-adapter')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: designerClaim.workItem.id,
          leaseId: designerClaim.attempt.leaseId,
          ownerToken: designerClaim.ownerToken,
        },
        client,
      )
      const scenarioPortfolio = {
        schemaVersion: 'appraise.quality-journey/v1' as const,
        portfolioId: 'portfolio-1',
        portfolioRevisionId: 'portfolio-r1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        cycleId: created.journey.activeCycleId,
        discoveryRevisionId: discoveryRevision.id,
        discoveryCompletionHash: (
          await client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: discoveryRevision.id } })
        ).completionHash!,
        coverageRationale: 'The set covers checkout confirmation while retaining an explicitly deferred branch.',
        graph: {
          edges: [
            {
              sourceScenarioRevisionId: 'scenario-1-r1',
              targetScenarioRevisionId: 'scenario-2-r1',
              relation: 'BRANCHES_TO' as const,
              rationale: 'A shopper can continue through the alternate checkout branch.',
            },
          ],
          sharedSetup: [
            {
              setupId: 'checkout-session',
              label: 'Authenticated checkout session',
              scenarioRevisionIds: ['scenario-1-r1', 'scenario-2-r1'],
            },
          ],
        },
        scenarios: ['scenario-1', 'scenario-2', 'scenario-3'].map((stableScenarioId, index) => ({
          stableScenarioId,
          scenarioRevisionId: `${stableScenarioId}-r1`,
          behavioralIntent: {
            title: `Checkout ${index + 1}`,
            narrative: 'A shopper completes checkout.',
            requirementIds: ['REQ-CHECKOUT-1'],
            expectedSignals: ['Confirmation'],
            steps: [{ stepId: `${stableScenarioId}-step`, action: 'Submit checkout', expected: 'Confirmation' }],
          },
          enrichment: {
            observationIds: ['observation-1'],
            resourceAssumptionIds: [frozenResource.id],
            feasibilityNotes: [],
          },
          layout: { x: index * 100, y: 0, sequence: index },
        })),
      }
      const portfolioHash = hashScenarioPortfolio(scenarioPortfolio)
      const scenarioOutputs = [
        {
          kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
          artifactId: 'portfolio-1',
          revisionId: 'portfolio-r1',
          contentHash: portfolioHash,
        },
        ...scenarioPortfolio.scenarios.map(scenario => ({
          kind: 'SCENARIO_REVISION' as const,
          artifactId: scenario.stableScenarioId,
          revisionId: scenario.scenarioRevisionId,
          contentHash: hash(scenario),
        })),
      ]
      const result = {
        schemaVersion: 'appraise.quality-journey/v1' as const,
        assignmentId: designerClaim.assignment.assignmentId,
        workItemId: designerClaim.workItem.id,
        attemptId: designerClaim.attempt.id,
        roleContractDigest: designerClaim.assignment.roleDefinition.digest,
        inputHash: designerClaim.assignment.inputHash,
        role: 'TEST_SCENARIO_DESIGNER' as const,
        status: 'COMPLETED' as const,
        outputs: scenarioOutputs,
        evidenceReceipts: [],
        assumptions: [],
        blockers: [],
        unresolvedQuestions: [],
        submittedAt: '2026-09-04T00:00:00.000Z',
      }
      const scenarioSubmission = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        workItemId: designerClaim.workItem.id,
        attemptId: designerClaim.attempt.id,
        leaseId: designerClaim.attempt.leaseId,
        ownerToken: designerClaim.ownerToken,
        idempotencyKey: 'scenario-submit-1',
        expectedInputHash: designerClaim.assignment.inputHash,
        expectedScopeHash: hash(JSON.parse(designerClaim.workItem.authorizationScopeJson)),
        portfolio: scenarioPortfolio,
        result,
      }
      await expect(submitQualityJourneyScenarioPortfolio(scenarioSubmission, client)).resolves.toMatchObject({
        replayed: false,
      })
      await expect(submitQualityJourneyScenarioPortfolio(scenarioSubmission, client)).resolves.toMatchObject({
        replayed: true,
      })
      await expect(
        submitQualityJourneyScenarioPortfolio(
          { ...scenarioSubmission, ownerToken: 'wrong-designer-owner-token' },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(
        submitQualityJourneyScenarioPortfolio({ ...scenarioSubmission, expectedInputHash: digest('a') }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const submittedScenarioState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const portfolioRef = {
        kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
        artifactId: 'portfolio-1',
        revisionId: 'portfolio-r1',
        contentHash: portfolioHash,
      }
      await publishQualityJourneyScenarioPortfolio(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'publish-scenarios-1',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_SCENARIO_PORTFOLIO',
          expectedStateHash: submittedScenarioState.journey.stateHash,
          idempotencyKey: 'publish-scenarios-1',
          inputArtifactRefs: [portfolioRef],
          payload: { artifactRevisionId: 'portfolio-r1', artifactHash: portfolioHash },
        },
        client,
      )
      await expect(submitQualityJourneyScenarioPortfolio(scenarioSubmission, client)).resolves.toMatchObject({
        replayed: true,
      })
      await client.qualityJourneyWorkAuthorization.update({
        where: { id: designerClaim.attempt.authorizationId! },
        data: { revokedAt: new Date(), revokedBy: 'RUNNER', revocationReason: 'Replay authorization withdrawn.' },
      })
      await expect(submitQualityJourneyScenarioPortfolio(scenarioSubmission, client)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
      await client.qualityJourneyWorkAuthorization.update({
        where: { id: designerClaim.attempt.authorizationId! },
        data: { revokedAt: null, revokedBy: null, revocationReason: null },
      })
      await client.qualityJourneyWorkAttempt.update({
        where: { id: designerClaim.attempt.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: 'RUNNER',
          cancellationReason: 'Replay cancelled.',
        },
      })
      await expect(submitQualityJourneyScenarioPortfolio(scenarioSubmission, client)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
      const reviewed = await getQualityJourneyScenarioPortfolio(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const commentInput = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        portfolioRevisionId: 'portfolio-r1',
        scenarioRevisionId: 'scenario-2-r1',
        comment: 'Resolve this before approval.',
        blocking: true,
        actor: 'USER',
        idempotencyKey: 'scenario-comment-1',
        expectedReviewHash: reviewed.portfolio.reviewHash,
      }
      const comment = await commentQualityJourneyScenarioPortfolio(commentInput, client)
      if (!comment.comment) throw new Error('Scenario comment creation did not return its durable record.')
      const commentId = comment.comment.id
      await expect(commentQualityJourneyScenarioPortfolio(commentInput, client)).resolves.toMatchObject({
        replayed: true,
      })
      await expect(
        commentQualityJourneyScenarioPortfolio({ ...commentInput, comment: 'Conflicting reuse.' }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioReviewComment" SET "disposedAt" = '2000-01-01T00:00:00.000Z' WHERE "id" = '${commentId}'`,
        ),
      ).rejects.toThrow('Scenario comment disposition is one-time and immutable')
      const dispositionInput = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        portfolioRevisionId: 'portfolio-r1',
        commentId,
        actor: 'USER',
        idempotencyKey: 'dispose-scenario-comment-1',
        expectedReviewHash: comment.reviewHash,
      }
      const disposedComment = await disposeQualityJourneyScenarioComment(dispositionInput, client)
      await expect(disposeQualityJourneyScenarioComment(dispositionInput, client)).resolves.toMatchObject({
        replayed: true,
      })
      await expect(
        disposeQualityJourneyScenarioComment({ ...dispositionInput, actor: 'OTHER' }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const laterComment = await commentQualityJourneyScenarioPortfolio(
        {
          ...commentInput,
          comment: 'A later review mutation must not rewrite the original receipt.',
          blocking: false,
          idempotencyKey: 'scenario-comment-2',
          expectedReviewHash: (
            await getQualityJourneyScenarioPortfolio(
              {
                journeyId: created.journey.journeyId,
                targetProjectId: 'target-analysis-1',
              },
              client,
            )
          ).portfolio.reviewHash,
        },
        client,
      )
      await expect(commentQualityJourneyScenarioPortfolio(commentInput, client)).resolves.toMatchObject({
        replayed: true,
        comment: { disposition: 'OPEN' },
        reviewHash: comment.reviewHash,
      })
      await expect(disposeQualityJourneyScenarioComment(dispositionInput, client)).resolves.toMatchObject({
        replayed: true,
        reviewHash: disposedComment.reviewHash,
      })
      const postComment = await getQualityJourneyScenarioPortfolio(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        client.$executeRawUnsafe(
          `INSERT INTO "QualityJourneyScenarioReviewComment" ("id", "portfolioRevisionId", "scenarioRevisionId", "comment", "actor", "idempotencyKey", "requestHash") VALUES ('cross-portfolio-comment', '${postComment.portfolio.id}', 'foreign-scenario-revision', 'Invalid cross-portfolio comment.', 'USER', 'cross-portfolio-comment', '${digest('c')}')`,
        ),
      ).rejects.toThrow('Scenario comment must reference a scenario in its portfolio')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioRevision" SET "stableScenarioId" = 'tampered-scenario' WHERE "scenarioRevisionId" = 'scenario-1-r1'`,
        ),
      ).rejects.toThrow('Scenario revisions are immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioPortfolioRevision" SET "graphJson" = '{"edges":[]}' WHERE "id" = '${postComment.portfolio.id}'`,
        ),
      ).rejects.toThrow('Scenario portfolio authority and graph are immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioPortfolioRevision" SET "createdAt" = '2000-01-01T00:00:00.000Z' WHERE "id" = '${postComment.portfolio.id}'`,
        ),
      ).rejects.toThrow('Scenario portfolio authority and graph are immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioPortfolioRevision" SET "reviewedAt" = '2000-01-01T00:00:00.000Z' WHERE "id" = '${postComment.portfolio.id}'`,
        ),
      ).rejects.toThrow('Scenario portfolio review transition is invalid or immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioPortfolioRevision" SET "supersededAt" = '2000-01-01T00:00:00.000Z' WHERE "id" = '${postComment.portfolio.id}'`,
        ),
      ).rejects.toThrow('Scenario portfolio review transition is invalid or immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioReviewComment" SET "comment" = 'tampered' WHERE "id" = '${commentId}'`,
        ),
      ).rejects.toThrow('Scenario comment evidence is immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioReviewComment" SET "disposedBy" = 'OTHER' WHERE "id" = '${commentId}'`,
        ),
      ).rejects.toThrow('Scenario comment disposition is one-time and immutable')
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioPortfolioRevision" SET "status" = 'PUBLISHED' WHERE "id" = '${postComment.portfolio.id}'`,
        ),
      ).rejects.toThrow('Scenario portfolio review transition is invalid or immutable')
      const decisionBase = {
        schemaVersion: 'appraise.quality-journey/v1' as const,
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'USER' as const,
        command: 'DECIDE_SCENARIOS' as const,
        expectedStateHash: (
          await getQualityJourney(
            { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
            client,
          )
        ).journey.stateHash,
        inputArtifactRefs: [portfolioRef],
        payload: {
          portfolioRevisionId: 'portfolio-r1',
          portfolioHash,
          approvedScenarioRevisionIds: ['scenario-1-r1', 'scenario-2-r1'],
          rejectedScenarioRevisionIds: [],
        },
      }
      await expect(
        decideQualityJourneyScenarios(
          {
            expectedReviewHash: postComment.portfolio.reviewHash,
            approvedScenarioRevisionIds: ['scenario-1-r1', 'scenario-2-r1'],
            rejectedScenarioRevisionIds: [],
            command: { ...decisionBase, commandId: 'decide-scenario-1', idempotencyKey: 'decide-scenario-1' },
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'PARTIAL' })
      const finalRejectedOnlyDecision = {
        expectedReviewHash: postComment.portfolio.reviewHash,
        approvedScenarioRevisionIds: [],
        rejectedScenarioRevisionIds: ['scenario-3-r1'],
        feedback: 'Scenario three is intentionally deferred for revision.',
        command: {
          ...decisionBase,
          commandId: 'decide-scenario-2',
          idempotencyKey: 'decide-scenario-2',
          payload: {
            ...decisionBase.payload,
            approvedScenarioRevisionIds: [],
            rejectedScenarioRevisionIds: ['scenario-3-r1'],
            feedback: 'Scenario three is intentionally deferred for revision.',
          },
        },
      }
      await expect(decideQualityJourneyScenarios(finalRejectedOnlyDecision, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        successorStage: 'AUTOMATION',
      })
      await expect(decideQualityJourneyScenarios(finalRejectedOnlyDecision, client)).resolves.toMatchObject({
        outcome: 'COMMITTED',
        successorStage: 'AUTOMATION',
        replayed: true,
      })
      await expect(
        client.$executeRawUnsafe(
          `UPDATE "QualityJourneyScenarioDecisionReceipt" SET "resultJson" = '{}' WHERE "journeyId" = '${created.journey.journeyId}' AND "idempotencyKey" = 'decide-scenario-2'`,
        ),
      ).rejects.toThrow('Scenario decision receipts are immutable')
      const phaseFiveTerminal = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(phaseFiveTerminal.journey.stage).toBe('AUTOMATION')
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('keeps completed discovery history immutable while a valid Discovery retry owns the stage', async () => {
    const client = await fixture()
    try {
      const { created, submitted, discovery } = await completedDiscovery(client, 'discovery-retry')
      await client.environment.update({
        where: { id: 'environment-analysis-1' },
        data: { scopeVersion: { increment: 1 } },
      })
      await expect(
        revalidateQualityJourneyDiscovery(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            expectedActiveDiscoveryRevisionId: discovery.id,
          },
          client,
        ),
      ).resolves.toMatchObject({ valid: false, discoveryRevision: { status: 'INVALIDATED' } })
      const invalidated = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'scenario-design-invalidated-discovery',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'START_SCENARIO_DESIGN',
            expectedStateHash: invalidated.journey.stateHash,
            idempotencyKey: 'scenario-design-invalidated-discovery',
            inputArtifactRefs: [],
            payload: {},
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      const retry = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        expectedActiveDiscoveryRevisionId: discovery.id,
        idempotencyKey: 'retry-discovery-1',
        reason: 'The environment registry changed.',
      }
      const retried = await retryQualityJourneyDiscovery(retry, client)
      expect(retried).toMatchObject({
        replayed: false,
        discoveryRevision: {
          status: 'COLLECTING',
          predecessorRevisionId: discovery.id,
          targetObservationHash: null,
          resourceResolutionHash: null,
        },
      })
      const retriedState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'premature-scenario-design-after-retry',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'START_SCENARIO_DESIGN',
            expectedStateHash: retriedState.journey.stateHash,
            idempotencyKey: 'premature-scenario-design-after-retry',
            inputArtifactRefs: [],
            payload: {},
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(retryQualityJourneyDiscovery(retry, client)).resolves.toMatchObject({
        replayed: true,
        discoveryRevision: { id: retried.discoveryRevision.id },
      })
      const analysis = await getQualityJourneyAnalysis(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(analysis.revisions[0].questions[0].answers).toHaveLength(1)
      await expect(
        client.qualityJourneyArtifact.update({
          where: { id: analysis.revisions[0].artifactRecordId },
          data: { artifactJson: '{}' },
        }),
      ).rejects.toThrow()
      await expect(
        client.qualityJourneyWorkAttempt.delete({ where: { id: submitted.analysisRevision.submittedAttemptId } }),
      ).rejects.toThrow()
      await expect(
        answerQualityJourneyAnalysisQuestion(
          {
            idempotencyKey: 'answer-payment-correction',
            answer: {
              schemaVersion: 'appraise.quality-journey/v1',
              answerId: 'answer-payment-2',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              analysisRevisionId: submitted.analysisRevision.id,
              questionId: 'question-payment',
              answer: 'Wallet payment.',
              actor: 'USER',
              correctionOfAnswerId: `${'discovery-retry'}-answer`,
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('reissues Scenario Designer with exact revision inputs and carries only unchanged behavioral decisions', async () => {
    const client = await fixture()
    try {
      const { created, discovery, frozenResource } = await completedDiscovery(client, 'scenario-revision')
      const startState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await startQualityJourneyScenarioDesign(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'scenario-revision-start',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'START_SCENARIO_DESIGN',
          expectedStateHash: startState.journey.stateHash,
          idempotencyKey: 'scenario-revision-start',
          inputArtifactRefs: [],
          payload: {},
        },
        client,
      )
      const initialDesigner = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'TEST_SCENARIO_DESIGNER' },
        client,
      )
      registerStartedAnalyzerAdapter(initialDesigner.attempt.id, 'scenario-revision-initial-designer')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: initialDesigner.workItem.id,
          leaseId: initialDesigner.attempt.leaseId,
          ownerToken: initialDesigner.ownerToken,
        },
        client,
      )
      const makePortfolio = (
        portfolioRevisionId: string,
        scenarioSuffix: string,
        predecessorPortfolioRevisionId?: string,
      ) => ({
        schemaVersion: 'appraise.quality-journey/v1' as const,
        portfolioId: 'scenario-revision-portfolio',
        portfolioRevisionId,
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        cycleId: created.journey.activeCycleId,
        discoveryRevisionId: discovery.id,
        discoveryCompletionHash: discovery.completionHash!,
        ...(predecessorPortfolioRevisionId ? { predecessorPortfolioRevisionId } : {}),
        coverageRationale: 'One scenario preserves approved checkout behavior while the other responds to review.',
        graph: { edges: [], sharedSetup: [] },
        scenarios: [
          {
            stableScenarioId: 'scenario-a-unchanged',
            scenarioRevisionId: `scenario-a-unchanged-${scenarioSuffix}`,
            behavioralIntent: {
              title: 'Checkout confirmation',
              narrative: 'A shopper completes checkout.',
              requirementIds: ['REQ-CHECKOUT-1'],
              expectedSignals: ['Confirmation'],
              steps: [{ stepId: 'confirmation', action: 'Submit checkout', expected: 'Confirmation' }],
            },
            enrichment: {
              observationIds: ['scenario-revision-observation'],
              resourceAssumptionIds: [frozenResource.id],
              feasibilityNotes: [`${scenarioSuffix} feasibility`],
            },
            layout: { x: 0, y: 0, sequence: 0 },
          },
          {
            stableScenarioId: 'scenario-b-revised',
            scenarioRevisionId: `scenario-b-revised-${scenarioSuffix}`,
            behavioralIntent: {
              title: scenarioSuffix === 'r1' ? 'Checkout receipt' : 'Checkout receipt and payment audit',
              narrative:
                scenarioSuffix === 'r1'
                  ? 'A shopper receives a receipt.'
                  : 'A shopper receives a receipt with payment audit details.',
              requirementIds: ['REQ-CHECKOUT-1'],
              expectedSignals: scenarioSuffix === 'r1' ? ['Receipt'] : ['Receipt', 'Payment audit'],
              steps: [
                {
                  stepId: 'receipt',
                  action: 'Complete checkout',
                  expected: scenarioSuffix === 'r1' ? 'Receipt' : 'Receipt and payment audit',
                },
              ],
            },
            enrichment: {
              observationIds: ['scenario-revision-observation'],
              resourceAssumptionIds: [frozenResource.id],
              feasibilityNotes: [`${scenarioSuffix} feasibility`],
            },
            layout: { x: 100, y: 0, sequence: 1 },
          },
        ],
      })
      const submitPortfolio = async (
        portfolio: ReturnType<typeof makePortfolio>,
        designer: Awaited<ReturnType<typeof claimQualityJourneyWork>>,
        idempotencyKey: string,
      ) => {
        const portfolioHash = hashScenarioPortfolio(portfolio)
        return submitQualityJourneyScenarioPortfolio(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            workItemId: designer.workItem.id,
            attemptId: designer.attempt.id,
            leaseId: designer.attempt.leaseId,
            ownerToken: designer.ownerToken,
            idempotencyKey,
            expectedInputHash: designer.assignment.inputHash,
            expectedScopeHash: hash(JSON.parse(designer.workItem.authorizationScopeJson)),
            portfolio,
            result: {
              schemaVersion: 'appraise.quality-journey/v1',
              assignmentId: designer.assignment.assignmentId,
              workItemId: designer.workItem.id,
              attemptId: designer.attempt.id,
              roleContractDigest: designer.assignment.roleDefinition.digest,
              inputHash: designer.assignment.inputHash,
              role: 'TEST_SCENARIO_DESIGNER',
              status: 'COMPLETED',
              outputs: [
                {
                  kind: 'SCENARIO_PORTFOLIO_REVISION',
                  artifactId: portfolio.portfolioId,
                  revisionId: portfolio.portfolioRevisionId,
                  contentHash: portfolioHash,
                },
                ...portfolio.scenarios.map(scenario => ({
                  kind: 'SCENARIO_REVISION' as const,
                  artifactId: scenario.stableScenarioId,
                  revisionId: scenario.scenarioRevisionId,
                  contentHash: hash(scenario),
                })),
              ],
              evidenceReceipts: [],
              assumptions: [],
              blockers: [],
              unresolvedQuestions: [],
              submittedAt: '2026-09-04T00:00:00.000Z',
            },
          },
          client,
        )
      }
      const initialPortfolio = makePortfolio('scenario-revision-r1', 'r1')
      const initialSubmission = await submitPortfolio(initialPortfolio, initialDesigner, 'scenario-revision-submit-r1')
      const initialHash = hashScenarioPortfolio(initialPortfolio)
      const portfolioRef = {
        kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
        artifactId: initialPortfolio.portfolioId,
        revisionId: initialPortfolio.portfolioRevisionId,
        contentHash: initialHash,
      }
      const submittedState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await publishQualityJourneyScenarioPortfolio(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'scenario-revision-publish-r1',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_SCENARIO_PORTFOLIO',
          expectedStateHash: submittedState.journey.stateHash,
          idempotencyKey: 'scenario-revision-publish-r1',
          inputArtifactRefs: [portfolioRef],
          payload: { artifactRevisionId: initialPortfolio.portfolioRevisionId, artifactHash: initialHash },
        },
        client,
      )
      const reviewed = await getQualityJourneyScenarioPortfolio(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await commentQualityJourneyScenarioPortfolio(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          portfolioRevisionId: initialPortfolio.portfolioRevisionId,
          scenarioRevisionId: 'scenario-b-revised-r1',
          comment: 'Include payment audit details in the revised scenario.',
          blocking: false,
          actor: 'USER',
          idempotencyKey: 'scenario-revision-comment',
          expectedReviewHash: reviewed.portfolio.reviewHash,
        },
        client,
      )
      const afterComment = await getQualityJourneyScenarioPortfolio(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const decisionState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        decideQualityJourneyScenarios(
          {
            expectedReviewHash: afterComment.portfolio.reviewHash,
            approvedScenarioRevisionIds: ['scenario-a-unchanged-r1'],
            rejectedScenarioRevisionIds: [],
            command: {
              schemaVersion: 'appraise.quality-journey/v1',
              commandId: 'scenario-revision-partial-decision',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              actor: 'USER',
              command: 'DECIDE_SCENARIOS',
              expectedStateHash: decisionState.journey.stateHash,
              idempotencyKey: 'scenario-revision-partial-decision',
              inputArtifactRefs: [portfolioRef],
              payload: {
                portfolioRevisionId: initialPortfolio.portfolioRevisionId,
                portfolioHash: initialHash,
                approvedScenarioRevisionIds: ['scenario-a-unchanged-r1'],
                rejectedScenarioRevisionIds: [],
              },
            },
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'PARTIAL' })
      const revisionState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await requestQualityJourneyScenarioRevision(
        {
          expectedReviewHash: afterComment.portfolio.reviewHash,
          command: {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'scenario-revision-request',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'REQUEST_SCENARIO_REVISION',
            expectedStateHash: revisionState.journey.stateHash,
            idempotencyKey: 'scenario-revision-request',
            inputArtifactRefs: [portfolioRef],
            payload: {
              reviewedRevisionId: initialPortfolio.portfolioRevisionId,
              reviewedHash: initialHash,
              feedback: 'Retain the confirmation scenario and revise receipt coverage.',
            },
          },
        },
        client,
      )
      await expect(
        requestQualityJourneyScenarioRevision(
          {
            expectedReviewHash: digest('f'),
            command: {
              schemaVersion: 'appraise.quality-journey/v1',
              commandId: 'scenario-revision-request',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              actor: 'USER',
              command: 'REQUEST_SCENARIO_REVISION',
              expectedStateHash: revisionState.journey.stateHash,
              idempotencyKey: 'scenario-revision-request',
              inputArtifactRefs: [portfolioRef],
              payload: {
                reviewedRevisionId: initialPortfolio.portfolioRevisionId,
                reviewedHash: initialHash,
                feedback: 'Retain the confirmation scenario and revise receipt coverage.',
              },
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        client.qualityJourneyScenarioPortfolioRevision.findUniqueOrThrow({
          where: { id: initialSubmission.portfolio.id },
        }),
      ).resolves.toMatchObject({ status: 'REVISION_REQUIRED' })
      const successorDesigner = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'TEST_SCENARIO_DESIGNER' },
        client,
      )
      const successorInputs = successorDesigner.assignment.inputArtifacts
      expect(successorInputs).toEqual(
        expect.arrayContaining([
          portfolioRef,
          {
            kind: 'SCENARIO_REVISION',
            artifactId: 'scenario-a-unchanged',
            revisionId: 'scenario-a-unchanged-r1',
            contentHash: hash(initialPortfolio.scenarios[0]),
          },
          {
            kind: 'SCENARIO_REVISION_FEEDBACK',
            artifactId: 'scenario-revision-feedback:scenario-revision-request',
            revisionId: initialPortfolio.portfolioRevisionId,
            contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
          },
        ]),
      )
      const feedbackReference = successorInputs.find(input => input.kind === 'SCENARIO_REVISION_FEEDBACK')
      if (!feedbackReference) throw new Error('Successor assignment omitted revision feedback.')
      const feedback = await client.qualityJourneyArtifact.findFirstOrThrow({
        where: {
          journeyId: created.journey.journeyId,
          kind: feedbackReference.kind,
          artifactId: feedbackReference.artifactId,
          revisionId: feedbackReference.revisionId,
          contentHash: feedbackReference.contentHash,
        },
      })
      expect(JSON.parse(feedback.artifactJson)).toMatchObject({
        feedback: 'Retain the confirmation scenario and revise receipt coverage.',
        decisions: [{ scenarioRevisionId: 'scenario-a-unchanged-r1', decision: 'APPROVED' }],
        comments: [
          {
            scenarioRevisionId: 'scenario-b-revised-r1',
            comment: 'Include payment audit details in the revised scenario.',
          },
        ],
      })
      registerStartedAnalyzerAdapter(successorDesigner.attempt.id, 'scenario-revision-successor-designer')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorDesigner.workItem.id,
          leaseId: successorDesigner.attempt.leaseId,
          ownerToken: successorDesigner.ownerToken,
        },
        client,
      )
      const successorDraft = makePortfolio('scenario-revision-r2', 'r2', initialPortfolio.portfolioRevisionId)
      const successorPortfolio = { ...successorDraft, scenarios: successorDraft.scenarios.slice(0, 1) }
      await expect(
        submitPortfolio(
          { ...successorPortfolio, portfolioId: 'foreign-successor-portfolio' },
          successorDesigner,
          'bad-successor-id',
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const successorSubmission = await submitPortfolio(
        successorPortfolio,
        successorDesigner,
        'scenario-revision-submit-r2',
      )
      expect(successorSubmission).toMatchObject({ replayed: false })
      const successorDecisions = await client.qualityJourneyScenarioDecision.findMany({
        where: { portfolioRevisionId: successorSubmission.portfolio.id },
        orderBy: { scenarioRevisionId: 'asc' },
      })
      expect(successorDecisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scenarioRevisionId: 'scenario-a-unchanged-r2',
            decision: 'APPROVED',
            actor: 'SYSTEM',
          }),
        ]),
      )
      const successorState = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const successorHash = hashScenarioPortfolio(successorPortfolio)
      await expect(
        publishQualityJourneyScenarioPortfolio(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'scenario-revision-publish-r2',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'PUBLISH_SCENARIO_PORTFOLIO',
            expectedStateHash: successorState.journey.stateHash,
            idempotencyKey: 'scenario-revision-publish-r2',
            inputArtifactRefs: [
              {
                kind: 'SCENARIO_PORTFOLIO_REVISION',
                artifactId: successorPortfolio.portfolioId,
                revisionId: successorPortfolio.portfolioRevisionId,
                contentHash: successorHash,
              },
            ],
            payload: { artifactRevisionId: successorPortfolio.portfolioRevisionId, artifactHash: successorHash },
          },
          client,
        ),
      ).resolves.toMatchObject({ successorStage: 'AUTOMATION' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('keeps each analysis-question answer lineage to one current head', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const first = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'answer-head-submit-first',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'answer-head-first'),
        },
        client,
      )
      const answer = (answerId: string, correctionOfAnswerId?: string) => ({
        idempotencyKey: `answer-head-${answerId}`,
        answer: {
          schemaVersion: 'appraise.quality-journey/v1' as const,
          answerId,
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          analysisRevisionId: first.analysisRevision.id,
          questionId: 'question-payment',
          answer: `Answer ${answerId}.`,
          actor: 'USER' as const,
          ...(correctionOfAnswerId ? { correctionOfAnswerId } : {}),
        },
      })
      await answerQualityJourneyAnalysisQuestion(answer('answer-head-1'), client)
      await expect(answerQualityJourneyAnalysisQuestion(answer('answer-head-root-2'), client)).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      await answerQualityJourneyAnalysisQuestion(answer('answer-head-2', 'answer-head-1'), client)
      await expect(
        answerQualityJourneyAnalysisQuestion(answer('answer-head-branch', 'answer-head-1'), client),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      })

      const reviewed = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const charterRef = {
        kind: 'ANALYSIS_CHARTER_REVISION' as const,
        artifactId: 'analysis-charter-answer-head-first',
        revisionId: 'analysis-revision-answer-head-first',
        contentHash: first.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'answer-head-publish',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: reviewed.journey.stateHash,
          idempotencyKey: 'answer-head-publish',
          inputArtifactRefs: [charterRef],
          payload: { artifactRevisionId: first.analysisRevision.id, artifactHash: first.analysisRevision.contentHash },
        },
        client,
      )
      const published = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await requestQualityJourneyAnalysisRevision(
        {
          expectedReviewHash: published.journey.analysisReviewHash,
          command: {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'answer-head-revision-request',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'REQUEST_ANALYSIS_REVISION',
            expectedStateHash: published.journey.stateHash,
            idempotencyKey: 'answer-head-revision-request',
            inputArtifactRefs: [charterRef],
            payload: {
              reviewedRevisionId: first.analysisRevision.id,
              reviewedHash: first.analysisRevision.contentHash,
              feedback: 'Carry the corrected answer forward.',
            },
          },
        },
        client,
      )
      await expect(
        answerQualityJourneyAnalysisQuestion(answer('answer-head-frozen', 'answer-head-2'), client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const successorClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      registerStartedAnalyzerAdapter(successorClaim.attempt.id, 'answer-head-successor-adapter')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorClaim.workItem.id,
          leaseId: successorClaim.attempt.leaseId,
          ownerToken: successorClaim.ownerToken,
        },
        client,
      )
      const successorInput = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        workItemId: successorClaim.workItem.id,
        attemptId: successorClaim.attempt.id,
        leaseId: successorClaim.attempt.leaseId,
        ownerToken: successorClaim.ownerToken,
        idempotencyKey: 'answer-head-successor',
        predecessorAnalysisRevisionId: first.analysisRevision.id,
      }
      await expect(
        submitQualityJourneyAnalysisSuccessor(
          {
            ...successorInput,
            charter: {
              ...charter(created.journey.journeyId, created.journey.activeCycleId, 'answer-head-historical'),
              questions: [],
              resolvedQuestionAnswerIds: ['answer-head-1'],
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const successor = await submitQualityJourneyAnalysisSuccessor(
        {
          ...successorInput,
          charter: {
            ...charter(created.journey.journeyId, created.journey.activeCycleId, 'answer-head-current'),
            questions: [
              {
                questionId: 'question-shipping',
                prompt: 'Which shipping method is in scope?',
                required: true,
                rationale: 'The successor charter must bound shipping coverage.',
              },
            ],
            resolvedQuestionAnswerIds: ['answer-head-2'],
          },
        },
        client,
      )
      await expect(
        answerQualityJourneyAnalysisQuestion(
          {
            idempotencyKey: 'answer-head-successor-question',
            answer: {
              schemaVersion: 'appraise.quality-journey/v1',
              answerId: 'answer-head-successor-question',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              analysisRevisionId: successor.analysisRevision.id,
              questionId: 'question-shipping',
              answer: 'Standard shipping.',
              actor: 'USER',
            },
          },
          client,
        ),
      ).resolves.toMatchObject({ replayed: false })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rolls back immutable analysis control rows when assigned-work completion cannot commit', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      await client.$executeRawUnsafe(`
        CREATE TRIGGER "QualityJourneyWorkItem_force_analysis_rollback"
        BEFORE UPDATE OF "status" ON "QualityJourneyWorkItem"
        WHEN NEW."status" = 'COMPLETED'
        BEGIN SELECT RAISE(ABORT, 'forced analysis completion rollback'); END;
      `)
      await expect(
        submitQualityJourneyAnalysisSuccessor(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            workItemId: claim.workItem.id,
            attemptId: claim.attempt.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            idempotencyKey: 'analysis-rollback',
            charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'rollback'),
          },
          client,
        ),
      ).rejects.toThrow()
      expect(await client.qualityJourneyAnalysisRevision.count()).toBe(0)
      expect(await client.qualityJourneyAnalysisQuestion.count()).toBe(0)
      expect(await client.qualityJourneyArtifact.count({ where: { kind: { startsWith: 'ANALYSIS_' } } })).toBe(0)
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('replays the original publication after a correction but fails closed against its stale review identity', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-review-hash-submit',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'review-hash'),
        },
        client,
      )
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-review-hash-answer',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-review-hash-answer',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-review-hash',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const answered = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const charterRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-review-hash',
        revisionId: 'analysis-revision-review-hash',
        contentHash: submitted.analysisRevision.contentHash,
      }
      const publish = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'analysis-review-hash-publish',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: answered.journey.stateHash,
        idempotencyKey: 'analysis-review-hash-publish',
        inputArtifactRefs: [charterRef],
        payload: {
          artifactRevisionId: 'analysis-revision-review-hash',
          artifactHash: submitted.analysisRevision.contentHash,
        },
      }
      const published = await publishQualityJourneyAnalysis(publish, client)
      if (
        !('publication' in published) ||
        !published.publication ||
        typeof published.publication !== 'object' ||
        !('reviewHash' in published.publication) ||
        typeof published.publication.reviewHash !== 'string'
      )
        throw new Error('Expected a persisted analysis publication.')
      const publishedReviewHash = published.publication.reviewHash
      const review = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-review-hash-correction',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-review-hash-correction',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-review-hash',
            questionId: 'question-payment',
            answer: 'Wallet payment.',
            actor: 'USER',
            correctionOfAnswerId: 'analysis-review-hash-answer',
          },
        },
        client,
      )
      const corrected = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      expect(corrected.journey.stateHash).not.toBe(review.journey.stateHash)
      expect(corrected.journey.analysisReviewHash).not.toBe(review.journey.analysisReviewHash)
      expect(corrected.journey.activeRevisionIds).not.toHaveProperty('analysisReview')
      const replay = await publishQualityJourneyAnalysis(publish, client)
      expect(replay).toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
        publication: { reviewHash: publishedReviewHash },
      })
      await expect(
        publishQualityJourneyAnalysis({ ...publish, commandId: 'analysis-review-hash-publish-changed' }, client),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      await expect(
        decideQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-review-hash-decide',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'DECIDE_ANALYSIS',
            expectedStateHash: corrected.journey.stateHash,
            idempotencyKey: 'analysis-review-hash-decide',
            inputArtifactRefs: [charterRef],
            payload: {
              revisionId: 'analysis-revision-review-hash',
              contentHash: submitted.analysisRevision.contentHash,
              decision: 'APPROVED',
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        requestQualityJourneyAnalysisRevision(
          {
            expectedReviewHash: corrected.journey.analysisReviewHash,
            command: {
              schemaVersion: 'appraise.quality-journey/v1',
              commandId: 'analysis-review-hash-revision-request',
              journeyId: created.journey.journeyId,
              targetProjectId: 'target-analysis-1',
              actor: 'USER',
              command: 'REQUEST_ANALYSIS_REVISION',
              expectedStateHash: corrected.journey.stateHash,
              idempotencyKey: 'analysis-review-hash-revision-request',
              inputArtifactRefs: [charterRef],
              payload: {
                reviewedRevisionId: 'analysis-revision-review-hash',
                reviewedHash: submitted.analysisRevision.contentHash,
                feedback: 'Update payment scope after the corrected answer.',
              },
            },
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'COMMITTED', successorStage: 'ANALYSIS' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects stale exact publication identity without adding a publication record', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const submitted = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-submit-2',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, '2'),
        },
        client,
      )
      const state = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await expect(
        publishQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'publish-analysis-stale',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'RUNNER',
            command: 'PUBLISH_ANALYSIS',
            expectedStateHash: state.journey.stateHash,
            idempotencyKey: 'publish-analysis-stale',
            inputArtifactRefs: [
              {
                kind: 'ANALYSIS_CHARTER_REVISION',
                artifactId: 'analysis-charter-2',
                revisionId: 'analysis-revision-2',
                contentHash: digest('e'),
              },
            ],
            payload: { artifactRevisionId: 'analysis-revision-2', artifactHash: digest('e') },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.qualityJourneyAnalysisPublication.count({ where: { journeyId: created.journey.journeyId } }),
      ).toBe(0)
      expect(
        await client.qualityJourneyArtifact.count({ where: { journeyId: created.journey.journeyId } }),
      ).toBeGreaterThan(0)
      expect(submitted.analysisRevision.contentHash).not.toBe(digest('e'))
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects an old published revision after an Analyzer successor becomes active', async () => {
    const client = await fixture()
    try {
      const { created, claim } = await readyAnalyzer(client)
      const first = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: claim.workItem.id,
          attemptId: claim.attempt.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
          idempotencyKey: 'analysis-successor-first',
          charter: charter(created.journey.journeyId, created.journey.activeCycleId, 'first'),
        },
        client,
      )
      const firstAnswer = await answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'analysis-successor-answer',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            answerId: 'analysis-successor-answer',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            analysisRevisionId: 'analysis-revision-first',
            questionId: 'question-payment',
            answer: 'Card payment.',
            actor: 'USER',
          },
        },
        client,
      )
      const afterAnswer = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const firstRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-first',
        revisionId: 'analysis-revision-first',
        contentHash: first.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-first',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: afterAnswer.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-first',
          inputArtifactRefs: [firstRef],
          payload: { artifactRevisionId: 'analysis-revision-first', artifactHash: first.analysisRevision.contentHash },
        },
        client,
      )
      const firstReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const firstRevisionRequest = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'analysis-successor-request',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-analysis-1',
        actor: 'USER',
        command: 'REQUEST_ANALYSIS_REVISION',
        expectedStateHash: firstReview.journey.stateHash,
        idempotencyKey: 'analysis-successor-request',
        inputArtifactRefs: [firstRef],
        payload: {
          reviewedRevisionId: 'analysis-revision-first',
          reviewedHash: first.analysisRevision.contentHash,
          feedback: 'Clarify the outcome.',
        },
      } as const
      await requestQualityJourneyAnalysisRevision(
        { command: firstRevisionRequest, expectedReviewHash: firstReview.journey.analysisReviewHash },
        client,
      )
      await expect(
        requestQualityJourneyAnalysisRevision(
          { command: firstRevisionRequest, expectedReviewHash: firstReview.journey.analysisReviewHash },
          client,
        ),
      ).resolves.toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
      })
      await expect(
        requestQualityJourneyAnalysisRevision(
          {
            command: {
              ...firstRevisionRequest,
              commandId: 'analysis-successor-request-changed',
              payload: { ...firstRevisionRequest.payload, feedback: 'Different hidden context.' },
            },
            expectedReviewHash: firstReview.journey.analysisReviewHash,
          },
          client,
        ),
      ).resolves.toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
      const successorClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      const predecessor = await getQualityJourneyAnalysis(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const predecessorRevision = predecessor.revisions[0]!
      const predecessorQuestion = predecessorRevision.questions[0]!
      const predecessorAnswer = predecessorQuestion.answers[0]!
      const feedbackArtifact = await client.qualityJourneyArtifact.findFirstOrThrow({
        where: {
          journeyId: created.journey.journeyId,
          kind: 'ANALYSIS_REVISION_FEEDBACK',
          revisionId: 'analysis-revision-first',
        },
      })
      expect(JSON.parse(feedbackArtifact.artifactJson)).toMatchObject({ feedback: 'Clarify the outcome.' })
      expect(
        await client.qualityJourneyArtifact.count({
          where: { journeyId: created.journey.journeyId, kind: 'ANALYSIS_REVISION_FEEDBACK' },
        }),
      ).toBe(1)
      expect(successorClaim.assignment.inputArtifacts).toEqual(
        expect.arrayContaining([
          {
            kind: predecessorRevision.artifact.kind,
            artifactId: predecessorRevision.artifact.artifactId,
            revisionId: predecessorRevision.artifact.revisionId,
            contentHash: predecessorRevision.artifact.contentHash,
          },
          {
            kind: predecessorQuestion.artifact.kind,
            artifactId: predecessorQuestion.artifact.artifactId,
            revisionId: predecessorQuestion.artifact.revisionId,
            contentHash: predecessorQuestion.artifact.contentHash,
          },
          {
            kind: predecessorAnswer.artifact.kind,
            artifactId: predecessorAnswer.artifact.artifactId,
            contentHash: predecessorAnswer.artifact.contentHash,
          },
          {
            kind: 'ANALYSIS_REVISION_FEEDBACK',
            artifactId: feedbackArtifact.artifactId,
            revisionId: 'analysis-revision-first',
            contentHash: feedbackArtifact.contentHash,
          },
        ]),
      )
      expect(JSON.stringify(successorClaim.assignment.inputArtifacts)).not.toContain(predecessorQuestion.id)
      expect(JSON.stringify(successorClaim.assignment.inputArtifacts)).not.toContain(predecessorAnswer.id)
      const originalAuthorization = await client.qualityJourneyWorkAuthorization.findFirstOrThrow({
        where: { workItemId: successorClaim.workItem.id, supersedesAuthorizationId: null },
      })
      const reauthorization = await client.qualityJourneyWorkAuthorization.findFirstOrThrow({
        where: { supersedesAuthorizationId: originalAuthorization.id },
      })
      expect(reauthorization.authorizationJson).not.toBe(originalAuthorization.authorizationJson)
      expect(JSON.parse(reauthorization.authorizationJson).inputArtifacts).toEqual(
        successorClaim.assignment.inputArtifacts,
      )
      expect(JSON.parse(reauthorization.authorizationJson).roleDefinition.version).toBe('4')
      registerAgentFactoryProviderAdapter({
        adapterId: 'analysis-successor-adapter',
        supports: request => request.attemptId === successorClaim.attempt.id,
        dispatch: async request => ({
          schemaVersion: 'appraise.quality-journey/v1',
          outcome: 'STARTED',
          spawnReceiptId: `receipt-${request.attemptId}`,
          assignmentId: request.assignmentId,
          workItemId: request.workItemId,
          attemptId: request.attemptId,
          roleDefinitionDigest: request.roleDefinitionDigest,
          capabilityProfileDigest: request.capabilityProfileDigest,
          effectiveWorker: {
            modelId: 'provider-selected',
            reasoningLevel: 'HIGH',
            latencyPreference: 'DELIBERATE',
            toolIds: request.scope.permittedTools,
          },
          boundaries: request.requiredBoundaries.map(boundary => ({
            boundary: boundary.boundary,
            requested: boundary.allowedValues,
            effective: boundary.allowedValues,
            status: 'VERIFIED',
            evidence: [digest('f')],
          })),
          startedAt: '2026-09-01T00:00:00.000Z',
        }),
      })
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorClaim.workItem.id,
          leaseId: successorClaim.attempt.leaseId,
          ownerToken: successorClaim.ownerToken,
        },
        client,
      )
      const secondCharter = {
        ...charter(created.journey.journeyId, created.journey.activeCycleId, 'second'),
        questions: [],
        resolvedQuestionAnswerIds: [firstAnswer.answer.answerId],
      }
      const second = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: successorClaim.workItem.id,
          attemptId: successorClaim.attempt.id,
          leaseId: successorClaim.attempt.leaseId,
          ownerToken: successorClaim.ownerToken,
          idempotencyKey: 'analysis-successor-second',
          predecessorAnalysisRevisionId: first.analysisRevision.id,
          charter: secondCharter,
        },
        client,
      )
      const secondDraft = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const secondRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-second',
        revisionId: 'analysis-revision-second',
        contentHash: second.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-second',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: secondDraft.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-second',
          inputArtifactRefs: [secondRef],
          payload: {
            artifactRevisionId: 'analysis-revision-second',
            artifactHash: second.analysisRevision.contentHash,
          },
        },
        client,
      )
      const secondReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await requestQualityJourneyAnalysisRevision(
        {
          command: {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-successor-request-second',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'REQUEST_ANALYSIS_REVISION',
            expectedStateHash: secondReview.journey.stateHash,
            idempotencyKey: 'analysis-successor-request-second',
            inputArtifactRefs: [secondRef],
            payload: {
              reviewedRevisionId: 'analysis-revision-second',
              reviewedHash: second.analysisRevision.contentHash,
              feedback: 'Clarify the next outcome.',
            },
          },
          expectedReviewHash: secondReview.journey.analysisReviewHash,
        },
        client,
      )
      const thirdClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      registerStartedAnalyzerAdapter(thirdClaim.attempt.id, 'analysis-third-adapter')
      await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: thirdClaim.workItem.id,
          leaseId: thirdClaim.attempt.leaseId,
          ownerToken: thirdClaim.ownerToken,
        },
        client,
      )
      const third = await submitQualityJourneyAnalysisSuccessor(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          workItemId: thirdClaim.workItem.id,
          attemptId: thirdClaim.attempt.id,
          leaseId: thirdClaim.attempt.leaseId,
          ownerToken: thirdClaim.ownerToken,
          idempotencyKey: 'analysis-successor-third',
          predecessorAnalysisRevisionId: second.analysisRevision.id,
          charter: { ...charter(created.journey.journeyId, created.journey.activeCycleId, 'third'), questions: [] },
        },
        client,
      )
      const thirdDraft = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      const thirdRef = {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-third',
        revisionId: 'analysis-revision-third',
        contentHash: third.analysisRevision.contentHash,
      }
      await publishQualityJourneyAnalysis(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'analysis-successor-publish-third',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-analysis-1',
          actor: 'RUNNER',
          command: 'PUBLISH_ANALYSIS',
          expectedStateHash: thirdDraft.journey.stateHash,
          idempotencyKey: 'analysis-successor-publish-third',
          inputArtifactRefs: [thirdRef],
          payload: { artifactRevisionId: 'analysis-revision-third', artifactHash: third.analysisRevision.contentHash },
        },
        client,
      )
      const thirdReview = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1' },
        client,
      )
      await requestQualityJourneyAnalysisRevision(
        {
          command: {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-successor-request-third',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'REQUEST_ANALYSIS_REVISION',
            expectedStateHash: thirdReview.journey.stateHash,
            idempotencyKey: 'analysis-successor-request-third',
            inputArtifactRefs: [thirdRef],
            payload: {
              reviewedRevisionId: 'analysis-revision-third',
              reviewedHash: third.analysisRevision.contentHash,
              feedback: 'One more authorized revision.',
            },
          },
          expectedReviewHash: thirdReview.journey.analysisReviewHash,
        },
        client,
      )
      const fourthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      expect(fourthClaim.attempt.attempt).toBeGreaterThan(3)
      const fourthAuthorization = await client.qualityJourneyWorkAuthorization.findUniqueOrThrow({
        where: { id: fourthClaim.attempt.authorizationId! },
      })
      expect(await client.qualityJourneyWorkAttempt.count({ where: { authorizationId: fourthAuthorization.id } })).toBe(
        1,
      )
      const expireFourthAuthorizationAttempt = async (attemptId: string) => {
        await client.qualityJourneyWorkAttempt.update({
          where: { id: attemptId },
          data: { leaseExpiresAt: new Date('2020-01-01T00:00:00.000Z') },
        })
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            now: new Date('2026-09-02'),
          },
          client,
        )
      }
      await expireFourthAuthorizationAttempt(fourthClaim.attempt.id)
      const fifthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      await expireFourthAuthorizationAttempt(fifthClaim.attempt.id)
      const sixthClaim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-analysis-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      await expireFourthAuthorizationAttempt(sixthClaim.attempt.id)
      const budgetBlocker = await client.qualityJourneyBlocker.findFirstOrThrow({
        where: { journeyId: created.journey.journeyId, reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED' },
      })
      expect(JSON.parse(budgetBlocker.evidenceJson)).toMatchObject({
        authorizationId: fourthAuthorization.id,
        authorizationAttemptCount: 3,
        attemptSequence: sixthClaim.attempt.attempt,
        maxAttempts: 3,
      })
      await expect(
        decideQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'analysis-successor-decide-old',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-analysis-1',
            actor: 'USER',
            command: 'DECIDE_ANALYSIS',
            expectedStateHash: secondReview.journey.stateHash,
            idempotencyKey: 'analysis-successor-decide-old',
            inputArtifactRefs: [firstRef],
            payload: {
              revisionId: 'analysis-revision-first',
              contentHash: first.analysisRevision.contentHash,
              decision: 'APPROVED',
            },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
