import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  AgentFactoryDispatchNotStartedError,
  clearAgentFactoryProviderAdaptersForTest,
  qualityJourneyContractDigest,
  qualityJourneyRoleDefinitions,
  qualityJourneyWorkItemId,
  registerAgentFactoryProviderAdapter,
  hashQualityJourneyRequirement,
} from '@/lib/quality-journey'
import {
  claimQualityJourneyWork,
  cancelQualityJourneyWork,
  completeQualityJourneyWork,
  createQualityJourney,
  dispatchQualityJourneyWork,
  getQualityJourney,
  inspectQualityJourneyFactoryEvidence,
  listQualityJourneyArtifacts,
  revokeQualityJourneyWorkAuthorization,
  resumeQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`

afterEach(async () => {
  clearAgentFactoryProviderAdaptersForTest()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: 'target-journey-1',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Quality Journey fixture',
      fingerprint: digest('a'),
    },
  })
  return client
}

async function requirementPayload(
  client: PrismaClient,
  created: { journey: { journeyId: string; activeRevisionIds: Record<string, string> } },
) {
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  return { journeyRevisionId: revision.id, requirementHash: revision.contentHash }
}

async function dispatchReceiptForTest(
  claim: Awaited<ReturnType<typeof claimQualityJourneyWork>>,
  receipt: unknown,
  client: PrismaClient,
) {
  registerAgentFactoryProviderAdapter({
    adapterId: `test-receipt-${claim.attempt.id}`,
    supports: request => request.attemptId === claim.attempt.id,
    dispatch: async () => receipt as never,
  })
  return dispatchQualityJourneyWork(
    {
      journeyId: claim.spawnRequest.journeyId,
      targetProjectId: claim.spawnRequest.targetProjectId,
      workItemId: claim.workItem.id,
      leaseId: claim.attempt.leaseId,
      ownerToken: claim.ownerToken,
    },
    client,
  )
}

function startedReceipt(claim: Awaited<ReturnType<typeof claimQualityJourneyWork>>) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    outcome: 'STARTED' as const,
    spawnReceiptId: `receipt-${claim.attempt.id}`,
    assignmentId: claim.spawnRequest.assignmentId,
    workItemId: claim.spawnRequest.workItemId,
    attemptId: claim.spawnRequest.attemptId,
    roleDefinitionDigest: claim.spawnRequest.roleDefinitionDigest,
    capabilityProfileDigest: claim.spawnRequest.capabilityProfileDigest,
    effectiveWorker: {
      modelId: 'provider-selected-worker',
      reasoningLevel: 'HIGH',
      latencyPreference: 'DELIBERATE',
      toolIds: claim.spawnRequest.scope.permittedTools,
    },
    boundaries: claim.spawnRequest.requiredBoundaries.map(boundary => ({
      boundary: boundary.boundary,
      requested: boundary.allowedValues,
      effective: boundary.allowedValues,
      status: 'VERIFIED' as const,
      evidence: [digest('f')],
    })),
    startedAt: '2026-08-28T15:00:00.000Z',
  }
}

function startedReceiptForRequest(request: Awaited<ReturnType<typeof claimQualityJourneyWork>>['spawnRequest']) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    outcome: 'STARTED' as const,
    spawnReceiptId: `receipt-${request.attemptId}`,
    assignmentId: request.assignmentId,
    workItemId: request.workItemId,
    attemptId: request.attemptId,
    roleDefinitionDigest: request.roleDefinitionDigest,
    capabilityProfileDigest: request.capabilityProfileDigest,
    effectiveWorker: {
      modelId: 'provider-selected-worker',
      reasoningLevel: 'HIGH' as const,
      latencyPreference: 'DELIBERATE' as const,
      toolIds: request.scope.permittedTools,
    },
    boundaries: request.requiredBoundaries.map(boundary => ({
      boundary: boundary.boundary,
      requested: boundary.allowedValues,
      effective: boundary.allowedValues,
      status: 'VERIFIED' as const,
      evidence: [digest('f')],
    })),
    startedAt: '2026-08-28T15:00:00.000Z',
  }
}

function completedResult(claim: Awaited<ReturnType<typeof claimQualityJourneyWork>>, suffix: string) {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    assignmentId: claim.assignment.assignmentId,
    workItemId: claim.workItem.id,
    attemptId: claim.attempt.id,
    roleContractDigest: claim.workItem.roleContractDigest,
    inputHash: claim.workItem.inputHash,
    role: 'REQUIREMENT_ANALYZER' as const,
    status: 'COMPLETED' as const,
    outputs: [
      {
        kind: 'ANALYSIS_CHARTER_REVISION' as const,
        artifactId: `analysis-charter-${suffix}`,
        revisionId: `analysis-charter-revision-${suffix}`,
        contentHash: digest('e'),
      },
    ],
    evidenceReceipts: [],
    assumptions: [],
    blockers: [],
    unresolvedQuestions: [],
    submittedAt: new Date().toISOString(),
  }
}

describe('Quality Journey Phase 2 durable Factory service', () => {
  it('persists a complete canonical structured requirement and binds the exact revision into Analyzer work', async () => {
    const client = await fixture()
    try {
      await client.environment.createMany({
        data: [
          {
            id: 'environment-a',
            name: 'Environment A',
            baseUrl: 'https://environment-a.example.test',
            targetProjectId: 'target-journey-1',
          },
          {
            id: 'environment-z',
            name: 'Environment Z',
            baseUrl: 'https://environment-z.example.test',
            targetProjectId: 'target-journey-1',
          },
        ],
      })
      const requirement = {
        schemaVersion: 'appraise.quality-journey-requirement/v1' as const,
        objective: 'A shopper can complete checkout with a saved payment method.',
        coverageRigor: 'COMPREHENSIVE' as const,
        testDimensions: ['VISUAL', 'FUNCTIONAL', 'END_TO_END'] as Array<'VISUAL' | 'FUNCTIONAL' | 'END_TO_END'>,
        includedScope: ['Saved payment method', 'Payment confirmation'],
        environmentIds: ['environment-z', 'environment-a'],
        desiredEvidenceSignals: ['Confirmation is visible'],
      }
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'structured-intake', requirement },
        client,
      )
      const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
        where: { id: created.journey.activeRevisionIds.journey },
      })
      const persisted = JSON.parse(revision.contentJson)
      expect(persisted).toEqual({
        ...requirement,
        environmentIds: ['environment-a', 'environment-z'],
        includedScope: ['Payment confirmation', 'Saved payment method'],
        testDimensions: ['END_TO_END', 'FUNCTIONAL', 'VISUAL'],
      })
      expect(revision.contentHash).toBe(hashQualityJourneyRequirement(requirement))

      const submitted = await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'structured-intake-submit',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'structured-intake-submit',
          inputArtifactRefs: [],
          payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
        },
        client,
      )
      expect(submitted).toMatchObject({ outcome: 'COMMITTED', successorStage: 'ANALYSIS' })

      const analyzer = await client.qualityJourneyWorkItem.findUniqueOrThrow({
        where: {
          id: qualityJourneyWorkItemId(
            created.journey.journeyId,
            created.journey.activeCycleId,
            'REQUIREMENT_ANALYZER',
          ),
        },
      })
      expect(JSON.parse(analyzer.inputArtifactRefsJson)).toEqual([
        {
          kind: 'JOURNEY_REVISION',
          artifactId: revision.id,
          revisionId: revision.id,
          contentHash: revision.contentHash,
        },
      ])
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('rejects generic Scenario Designer completion without mutating the attempt, item, or artifacts', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'create-designer-boundary',
          requirement: { objective: 'Checkout' },
        },
        client,
      )
      const role = 'TEST_SCENARIO_DESIGNER' as const
      const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
      const workItemId = qualityJourneyWorkItemId(created.journey.journeyId, created.journey.activeCycleId, role)
      const item = await client.qualityJourneyWorkItem.create({
        data: {
          id: workItemId,
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          cycleId: created.journey.activeCycleId,
          role,
          status: 'IN_PROGRESS',
          inputHash: digest('b'),
          roleContractDigest: qualityJourneyContractDigest(definition),
          allowedOutputsJson: JSON.stringify(definition.writableArtifacts),
          completionCriteriaJson: JSON.stringify(['Submit through the Scenario Portfolio boundary.']),
        },
      })
      const attempt = await client.qualityJourneyWorkAttempt.create({
        data: {
          id: 'designer-attempt-1',
          workItemId,
          attempt: 1,
          status: 'IN_PROGRESS',
          leaseId: 'designer-lease-1',
          ownerTokenHash: 'owner-token-hash',
          leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
          heartbeatSeconds: 60,
        },
      })
      const before = await Promise.all([
        client.qualityJourneyArtifact.count({ where: { journeyId: created.journey.journeyId } }),
        client.qualityJourneyWorkItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { status: true, version: true, currentAttempt: true },
        }),
        client.qualityJourneyWorkAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
          select: { status: true, resultJson: true, resultHash: true, completedAt: true },
        }),
      ])
      await expect(
        completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId,
            leaseId: attempt.leaseId,
            ownerToken: 'owner-token',
            result: {
              schemaVersion: 'appraise.quality-journey/v1',
              assignmentId: 'designer-assignment-1',
              workItemId,
              attemptId: attempt.id,
              roleContractDigest: item.roleContractDigest,
              inputHash: item.inputHash,
              role,
              status: 'COMPLETED',
              outputs: [],
              evidenceReceipts: [],
              assumptions: [],
              blockers: [],
              unresolvedQuestions: [],
              submittedAt: new Date().toISOString(),
            },
          },
          client,
        ),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Scenario Designer work must submit through the specialized Scenario Portfolio boundary.',
      })
      await expect(
        Promise.all([
          client.qualityJourneyArtifact.count({ where: { journeyId: created.journey.journeyId } }),
          client.qualityJourneyWorkItem.findUniqueOrThrow({
            where: { id: item.id },
            select: { status: true, version: true, currentAttempt: true },
          }),
          client.qualityJourneyWorkAttempt.findUniqueOrThrow({
            where: { id: attempt.id },
            select: { status: true, resultJson: true, resultHash: true, completedAt: true },
          }),
        ]),
      ).resolves.toEqual(before)
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('recovers conservative Factory authorization for a pre-existing unassigned work item only on resume', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'create-legacy', requirement: { objective: 'Legacy' } },
        client,
      )
      const role = 'REQUIREMENT_ANALYZER' as const
      const definition = qualityJourneyRoleDefinitions.find(item => item.role === role)!
      const workItemId = qualityJourneyWorkItemId(created.journey.journeyId, created.journey.activeCycleId, role)
      await client.qualityJourneyWorkItem.create({
        data: {
          id: workItemId,
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          cycleId: created.journey.activeCycleId,
          role,
          inputHash: created.journey.stateHash,
          roleContractDigest: qualityJourneyContractDigest(definition),
          allowedOutputsJson: JSON.stringify(definition.writableArtifacts),
          completionCriteriaJson: JSON.stringify(['Legacy unassigned work item.']),
        },
      })
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'command-legacy-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'legacy-analysis-1',
          inputArtifactRefs: [],
          payload: { journeyRevisionId: 'revision-legacy-analysis', requirementHash: digest('b') },
        },
        client,
      )

      await expect(
        claimQualityJourneyWork(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      expect(await client.qualityJourneyWorkAttempt.count({ where: { workItemId } })).toBe(0)
      expect(await client.qualityJourneyWorkAuthorization.findFirst({ where: { workItemId } })).toBeNull()
      expect(
        await resumeQualityJourney(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({ recoveredWorkItemIds: [workItemId] })
      const recovered = await client.qualityJourneyWorkAuthorization.findFirstOrThrow({ where: { workItemId } })
      expect(JSON.parse(recovered.authorizationJson)).toMatchObject({
        authorizationId: recovered.id,
        allowedTargetRoutes: [],
        allowedResourceIds: [],
        scope: { filesystemPaths: [], networkOrigins: [], credentialGrantIds: [] },
      })
      expect(
        await claimQualityJourneyWork(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role },
          client,
        ),
      ).toMatchObject({ attempt: { attempt: 1 }, assignment: { workItemId } })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('persists idempotent creation, one CAS successor, and immutable events', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'create-1', requirement: { objective: 'Checkout' } },
        client,
      )
      const replay = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'create-1', requirement: { objective: 'Checkout' } },
        client,
      )
      expect(replay).toMatchObject({ replayed: true, journey: { journeyId: created.journey.journeyId } })

      const request = {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'command-1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-journey-1',
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        expectedStateHash: created.journey.stateHash,
        idempotencyKey: 'submit-1',
        inputArtifactRefs: [],
        payload: await requirementPayload(client, created),
      }
      expect(await submitDurableQualityJourneyCommand(request, client)).toMatchObject({
        outcome: 'COMMITTED',
        successorStage: 'ANALYSIS',
      })
      expect(await submitDurableQualityJourneyCommand(request, client)).toMatchObject({
        outcome: 'COMMITTED',
        replayed: true,
      })
      expect(
        await submitDurableQualityJourneyCommand(
          { ...request, commandId: 'command-2', idempotencyKey: 'submit-2' },
          client,
        ),
      ).toMatchObject({ outcome: 'CONFLICT', code: 'STALE_STATE_HASH' })

      const snapshot = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
        client,
      )
      expect(snapshot.journey).toMatchObject({ stage: 'ANALYSIS', version: 1 })
      expect(snapshot.workItems).toHaveLength(1)
      expect(snapshot.events.map(event => event.eventType)).toEqual(['JOURNEY_CREATED', 'COMMAND_SUBMIT_REQUIREMENT'])
      await expect(
        client.qualityJourneyEvent.update({ where: { id: snapshot.events[0]!.id }, data: { eventType: 'TAMPERED' } }),
      ).rejects.toThrow()
      expect(
        await client.qualityJourneyEvent.findUniqueOrThrow({ where: { id: snapshot.events[0]!.id } }),
      ).toMatchObject({
        eventType: 'JOURNEY_CREATED',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('commits exactly one authoritative successor when two clients race from the same state', async () => {
    const firstClient = await fixture()
    const target = await firstClient.targetProject.findUniqueOrThrow({ where: { id: 'target-journey-1' } })
    const secondClient = new PrismaClient({
      datasources: { db: { url: `file:${path.join(target.canonicalPath!, 'appraise.db')}` } },
    })
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'create-race', requirement: { objective: 'Race' } },
        firstClient,
      )
      const command = {
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-journey-1',
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        expectedStateHash: created.journey.stateHash,
        inputArtifactRefs: [],
        payload: await requirementPayload(firstClient, created),
      }
      const outcomes = await Promise.all([
        submitDurableQualityJourneyCommand(
          { ...command, commandId: 'race-command-1', idempotencyKey: 'race-1' },
          firstClient,
        ),
        submitDurableQualityJourneyCommand(
          { ...command, commandId: 'race-command-2', idempotencyKey: 'race-2' },
          secondClient,
        ),
      ])

      expect(outcomes.map(result => result.outcome).sort()).toEqual(['COMMITTED', 'CONFLICT'])
      const snapshot = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
        firstClient,
      )
      expect(snapshot.journey).toMatchObject({ stage: 'ANALYSIS', version: 1 })
      expect(snapshot.events.filter(event => event.eventType === 'COMMAND_SUBMIT_REQUIREMENT')).toHaveLength(1)
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()])
    }
  }, 60_000)

  it('claims, completes, and safely replaces expired worker attempts', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'create-2', requirement: { objective: 'Search' } },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'command-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'analysis-1',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      const claim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      const beforeCompletion = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
        client,
      )
      expect(
        await submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'publish-too-early',
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            actor: 'RUNNER',
            command: 'PUBLISH_ANALYSIS',
            expectedStateHash: beforeCompletion.journey.stateHash,
            idempotencyKey: 'publish-too-early',
            inputArtifactRefs: [],
            payload: { artifactRevisionId: 'analysis-charter-revision-1', artifactHash: digest('d') },
          },
          client,
        ),
      ).toMatchObject({ outcome: 'CONFLICT', code: 'PRECONDITION_FAILED' })
      const result = {
        schemaVersion: 'appraise.quality-journey/v1',
        assignmentId: claim.assignment.assignmentId,
        workItemId: claim.workItem.id,
        attemptId: claim.attempt.id,
        roleContractDigest: claim.workItem.roleContractDigest,
        inputHash: claim.workItem.inputHash,
        role: 'REQUIREMENT_ANALYZER',
        status: 'COMPLETED',
        outputs: [
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: 'analysis-charter-1',
            revisionId: 'analysis-charter-revision-1',
            contentHash: digest('d'),
          },
        ],
        evidenceReceipts: [],
        assumptions: [],
        blockers: [],
        unresolvedQuestions: [],
        submittedAt: new Date().toISOString(),
      }
      await expect(
        completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            result,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } }),
      ).toMatchObject({
        dispatchReservedAt: null,
        dispatchStartedAt: null,
      })
      const initialDispatch = await dispatchReceiptForTest(claim, startedReceipt(claim), client)
      expect(initialDispatch).toMatchObject({
        status: 'IN_PROGRESS',
        replayed: false,
      })
      expect(Object.keys(initialDispatch).sort()).toEqual([
        'adapterId',
        'attemptId',
        'replayed',
        'spawnReceiptHash',
        'spawnReceiptId',
        'status',
        'workItemId',
      ])
      expect(initialDispatch).not.toHaveProperty('receipt')
      expect(initialDispatch).not.toHaveProperty('effectiveWorker')
      expect(initialDispatch).not.toHaveProperty('boundaries')
      const replayDispatch = await dispatchQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          workItemId: claim.workItem.id,
          leaseId: claim.attempt.leaseId,
          ownerToken: claim.ownerToken,
        },
        client,
      )
      expect(replayDispatch).toMatchObject({ replayed: true, status: 'IN_PROGRESS' })
      expect(Object.keys(replayDispatch).sort()).toEqual([
        'adapterId',
        'attemptId',
        'replayed',
        'spawnReceiptHash',
        'spawnReceiptId',
        'status',
        'workItemId',
      ])
      expect(replayDispatch).not.toHaveProperty('receipt')
      expect(replayDispatch).not.toHaveProperty('effectiveWorker')
      expect(replayDispatch).not.toHaveProperty('boundaries')
      expect(
        await completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            result,
          },
          client,
        ),
      ).toMatchObject({ status: 'COMPLETED', replayed: false })
      expect(
        await completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            result,
          },
          client,
        ),
      ).toMatchObject({ status: 'COMPLETED', replayed: true })
      await client.qualityJourneyWorkAttempt.update({
        where: { id: claim.attempt.id },
        data: { leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z') },
      })
      expect(
        await dispatchQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
          },
          client,
        ),
      ).toMatchObject({ replayed: true })
      expect(
        await listQualityJourneyArtifacts(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({ artifacts: [{ artifactId: 'analysis-charter-1', contentHash: digest('d') }] })
      const afterCompletion = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
        client,
      )
      expect(afterCompletion.journey.activeWorkItemIds).toEqual([])
      expect(afterCompletion.journey.stateHash).not.toBe(beforeCompletion.journey.stateHash)
      expect(afterCompletion.events.at(-1)).toMatchObject({ eventType: 'WORK_COMPLETED' })

      await client.qualityJourneyWorkItem.update({ where: { id: claim.workItem.id }, data: { status: 'IN_PROGRESS' } })
      await client.qualityJourneyWorkAttempt.create({
        data: {
          id: 'expired-attempt',
          workItemId: claim.workItem.id,
          attempt: 2,
          leaseId: 'expired-lease',
          ownerTokenHash: 'expired',
          status: 'IN_PROGRESS',
          leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z'),
          heartbeatSeconds: 30,
        },
      })
      expect(
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-28T00:00:00.000Z'),
          },
          client,
        ),
      ).toMatchObject({ expiredAttemptIds: ['expired-attempt'] })
      expect(await client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: claim.workItem.id } })).toMatchObject(
        {
          status: 'REPLACEMENT_REQUESTED',
        },
      )
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('links replacement attempts and rejects late predecessor receipts', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'create-replacement',
          requirement: { objective: 'Replace' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'command-replacement-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'replacement-analysis-1',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      const predecessor = await claimQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      await client.qualityJourneyWorkAttempt.update({
        where: { id: predecessor.attempt.id },
        data: { leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z') },
      })
      await client.qualityJourneyArtifact.create({
        data: {
          id: 'replacement-current-artifact',
          identityKey: 'JOURNEY_REVISION:current-journey-revision:revision-current',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          cycleId: created.journey.activeCycleId,
          kind: 'JOURNEY_REVISION',
          artifactId: 'current-journey-revision',
          revisionId: 'revision-current',
          contentHash: digest('e'),
          artifactJson: JSON.stringify({ safe: 'current-artifact-only' }),
        },
      })
      await client.qualityJourneyArtifact.create({
        data: {
          id: 'replacement-historical-artifact',
          identityKey: 'JOURNEY_REVISION:historical-journey-revision:revision-historical',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          cycleId: created.journey.activeCycleId,
          kind: 'JOURNEY_REVISION',
          artifactId: 'historical-journey-revision',
          revisionId: 'revision-historical',
          contentHash: digest('f'),
          artifactJson: JSON.stringify({ safe: 'historical' }),
        },
      })
      await client.qualityJourney.update({
        where: { id: created.journey.journeyId },
        data: { activeRevisionIdsJson: JSON.stringify({ journey: 'revision-current' }) },
      })
      await client.qualityJourneyArtifact.create({
        data: {
          id: 'replacement-out-of-scope-artifact',
          identityKey: 'TEST_REPORT_ANALYSIS:private-triage-output:revision-private',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          cycleId: created.journey.activeCycleId,
          kind: 'TEST_REPORT_ANALYSIS',
          artifactId: 'private-triage-output',
          revisionId: 'revision-private',
          contentHash: digest('f'),
          artifactJson: JSON.stringify({ mustNotReachRequirementAnalyzer: true }),
        },
      })
      await resumeQualityJourney(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          now: new Date('2026-08-28T00:00:00.000Z'),
        },
        client,
      )
      const replacement = await claimQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )

      expect(replacement.attempt).toMatchObject({ attempt: 2, replacesAttemptId: predecessor.attempt.id })
      expect(replacement.assignment.assignmentId).not.toBe(predecessor.assignment.assignmentId)
      expect(replacement.assignment.inputArtifacts).toEqual(
        expect.arrayContaining([
          {
            kind: 'JOURNEY_REVISION',
            artifactId: 'current-journey-revision',
            revisionId: 'revision-current',
            contentHash: digest('e'),
          },
          {
            kind: 'JOURNEY_REVISION',
            artifactId: created.journey.activeRevisionIds.journey,
            revisionId: created.journey.activeRevisionIds.journey,
            contentHash: hashQualityJourneyRequirement({ objective: 'Replace' }),
          },
        ]),
      )
      expect(replacement.assignment.inputArtifacts).not.toContainEqual(
        expect.objectContaining({ artifactId: 'private-triage-output' }),
      )
      expect(replacement.assignment.inputArtifacts).not.toContainEqual(
        expect.objectContaining({ artifactId: 'historical-journey-revision' }),
      )
      expect(replacement.assignment.replacement).toMatchObject({ predecessorAttemptId: predecessor.attempt.id })
      await expect(
        client.qualityJourneyWorkAttempt.update({
          where: { id: replacement.attempt.id },
          data: { replacesAttemptId: null },
        }),
      ).rejects.toThrow()
      expect(
        await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: replacement.attempt.id } }),
      ).toMatchObject({ replacesAttemptId: predecessor.attempt.id })
      expect(await dispatchReceiptForTest(replacement, startedReceipt(replacement), client)).toMatchObject({
        status: 'IN_PROGRESS',
      })
      expect(
        await completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: replacement.workItem.id,
            leaseId: replacement.attempt.leaseId,
            ownerToken: replacement.ownerToken,
            result: {
              schemaVersion: 'appraise.quality-journey/v1',
              assignmentId: replacement.assignment.assignmentId,
              workItemId: replacement.workItem.id,
              attemptId: replacement.attempt.id,
              roleContractDigest: replacement.workItem.roleContractDigest,
              inputHash: replacement.workItem.inputHash,
              role: 'REQUIREMENT_ANALYZER',
              status: 'COMPLETED',
              outputs: [
                {
                  kind: 'ANALYSIS_CHARTER_REVISION',
                  artifactId: 'replacement-analysis-charter',
                  revisionId: 'replacement-analysis-charter-revision',
                  contentHash: digest('a'),
                },
              ],
              evidenceReceipts: [],
              assumptions: [],
              blockers: [],
              unresolvedQuestions: [],
              submittedAt: new Date().toISOString(),
            },
          },
          client,
        ),
      ).toMatchObject({ status: 'COMPLETED' })
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: predecessor.workItem.id,
            leaseId: predecessor.attempt.leaseId,
            ownerToken: predecessor.ownerToken,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('atomically consumes the hard attempt budget and prevents a fourth claim', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'attempt-budget', requirement: { objective: 'Budget' } },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'attempt-budget-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'attempt-budget-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      for (const attemptNumber of [1, 2, 3]) {
        const claim = await claimQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            role: 'REQUIREMENT_ANALYZER',
          },
          client,
        )
        expect(claim.attempt.attempt).toBe(attemptNumber)
        await client.qualityJourneyWorkAttempt.update({
          where: { id: claim.attempt.id },
          data: { leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z') },
        })
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-28T00:00:00.000Z'),
          },
          client,
        )
      }
      const exhausted = await getQualityJourney(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
        client,
      )
      expect(exhausted).toMatchObject({
        workItems: [{ role: 'REQUIREMENT_ANALYZER', status: 'BLOCKED' }],
        blockers: [
          {
            reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED',
            safeResumeCommand: 'NONE',
            requiredResolution: expect.stringContaining('new Quality Journey'),
          },
        ],
      })
      await expect(
        resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-29T00:00:00.000Z'),
          },
          client,
        ),
      ).resolves.toBeDefined()
      await expect(
        claimQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            role: 'REQUIREMENT_ANALYZER',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('cancels and revokes Appraise-side authority before late worker ingress', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'terminal-authority',
          requirement: { objective: 'Stop' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'terminal-authority-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'terminal-authority-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      const cancelled = await claimQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      await expect(dispatchReceiptForTest(cancelled, startedReceipt(cancelled), client)).resolves.toMatchObject({
        status: 'IN_PROGRESS',
      })
      await expect(
        cancelQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: cancelled.workItem.id,
            actor: 'USER',
            reason: 'User stopped the work.',
          },
          client,
        ),
      ).resolves.toMatchObject({ replayed: false, status: 'CANCELLED' })
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: cancelled.workItem.id,
            leaseId: cancelled.attempt.leaseId,
            ownerToken: cancelled.ownerToken,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        completeQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: cancelled.workItem.id,
            leaseId: cancelled.attempt.leaseId,
            ownerToken: cancelled.ownerToken,
            result: completedResult(cancelled, 'cancelled'),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      const createdRevocation = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'revoke-authority',
          requirement: { objective: 'Revoke' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'revoke-authority-analysis',
          journeyId: createdRevocation.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: createdRevocation.journey.stateHash,
          idempotencyKey: 'revoke-authority-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, createdRevocation),
        },
        client,
      )
      const revoked = await claimQualityJourneyWork(
        {
          journeyId: createdRevocation.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      await expect(dispatchReceiptForTest(revoked, startedReceipt(revoked), client)).resolves.toMatchObject({
        status: 'IN_PROGRESS',
      })
      await revokeQualityJourneyWorkAuthorization(
        {
          journeyId: createdRevocation.journey.journeyId,
          targetProjectId: 'target-journey-1',
          workItemId: revoked.workItem.id,
          actor: 'COORDINATOR',
          reason: 'Coordinator revoked authority.',
        },
        client,
      )
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: createdRevocation.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: revoked.workItem.id,
            leaseId: revoked.attempt.leaseId,
            ownerToken: revoked.ownerToken,
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(
        completeQualityJourneyWork(
          {
            journeyId: createdRevocation.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: revoked.workItem.id,
            leaseId: revoked.attempt.leaseId,
            ownerToken: revoked.ownerToken,
            result: completedResult(revoked, 'revoked'),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('does not expose Factory evidence across target-project boundaries', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'factory-evidence-isolation',
          requirement: { objective: 'Evidence isolation' },
        },
        client,
      )
      await client.targetProject.create({
        data: {
          id: 'target-journey-2',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: 'path:/quality-journey-isolation-target',
          canonicalPath: '/quality-journey-isolation-target',
          displayName: 'Other Quality Journey fixture',
          fingerprint: digest('z'),
        },
      })
      await expect(
        inspectQualityJourneyFactoryEvidence(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-2' },
          client,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('stops safely and idempotently when restart recovery finds an unresolved provider dispatch', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'restart-unresolved-dispatch',
          requirement: { objective: 'Recover an ambiguous provider dispatch' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'restart-unresolved-dispatch-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'restart-unresolved-dispatch-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      const claim = await claimQualityJourneyWork(
        {
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      await client.qualityJourneyWorkAttempt.update({
        where: { id: claim.attempt.id },
        data: {
          dispatchAdapterId: 'persisted-lost-response-adapter',
          dispatchReservedAt: new Date('2026-08-27T00:00:00.000Z'),
          dispatchStartedAt: new Date('2026-08-27T00:00:00.000Z'),
          leaseExpiresAt: new Date('2026-08-28T00:00:00.000Z'),
        },
      })
      expect(
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-29T00:00:00.000Z'),
          },
          client,
        ),
      ).toMatchObject({ expiredAttemptIds: [claim.attempt.id] })
      expect(
        await resumeQualityJourney(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-30T00:00:00.000Z'),
          },
          client,
        ),
      ).toMatchObject({ expiredAttemptIds: [] })
      expect(
        await getQualityJourney({ journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' }, client),
      ).toMatchObject({
        workItems: [{ id: claim.workItem.id, status: 'BLOCKED' }],
        blockers: [{ reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH' }],
      })
      await expect(
        claimQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            role: 'REQUIREMENT_ANALYZER',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)

  it('allows one concurrent claim and leaves terminal cancellation/revocation races fail-closed', async () => {
    const firstClient = await fixture()
    const target = await firstClient.targetProject.findUniqueOrThrow({ where: { id: 'target-journey-1' } })
    const secondClient = new PrismaClient({
      datasources: { db: { url: `file:${path.join(target.canonicalPath!, 'appraise.db')}` } },
    })
    try {
      const created = await createQualityJourney(
        { targetProjectId: 'target-journey-1', idempotencyKey: 'terminal-race', requirement: { objective: 'Race' } },
        firstClient,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'terminal-race-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'terminal-race-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(firstClient, created),
        },
        firstClient,
      )
      const claims = await Promise.allSettled([
        claimQualityJourneyWork(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role: 'REQUIREMENT_ANALYZER' },
          firstClient,
        ),
        claimQualityJourneyWork(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role: 'REQUIREMENT_ANALYZER' },
          secondClient,
        ),
      ])
      const claimed = claims.filter(
        (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof claimQualityJourneyWork>>> =>
          outcome.status === 'fulfilled',
      )
      expect(claimed).toHaveLength(1)
      const workItemId = claimed[0]!.value.workItem.id
      const terminal = await Promise.allSettled([
        cancelQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId,
            actor: 'USER',
            reason: 'Concurrent cancellation.',
          },
          firstClient,
        ),
        revokeQualityJourneyWorkAuthorization(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId,
            actor: 'COORDINATOR',
            reason: 'Concurrent revocation.',
          },
          secondClient,
        ),
      ])
      expect(terminal.some(outcome => outcome.status === 'fulfilled')).toBe(true)
      const authorization = await firstClient.qualityJourneyWorkAuthorization.findFirstOrThrow({
        where: { workItemId },
      })
      expect(authorization.revokedAt).not.toBeNull()
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId,
            leaseId: claimed[0]!.value.attempt.leaseId,
            ownerToken: claimed[0]!.value.ownerToken,
          },
          firstClient,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    } finally {
      await Promise.all([firstClient.$disconnect(), secondClient.$disconnect()])
    }
  }, 60_000)

  it('dispatches a lease at most once and persists a refused Factory receipt as blocked evidence', async () => {
    const client = await fixture()
    try {
      const created = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'dispatch-idempotency',
          requirement: { objective: 'Dispatch' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'dispatch-idempotency-analysis',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: created.journey.stateHash,
          idempotencyKey: 'dispatch-idempotency-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, created),
        },
        client,
      )
      const claim = await claimQualityJourneyWork(
        { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1', role: 'REQUIREMENT_ANALYZER' },
        client,
      )
      const dispatchKeys: string[] = []
      let failOnce = true
      let signalAdapterEntered!: () => void
      let releaseAdapter!: () => void
      const adapterEntered = new Promise<void>(resolve => {
        signalAdapterEntered = resolve
      })
      const adapterRelease = new Promise<void>(resolve => {
        releaseAdapter = resolve
      })
      registerAgentFactoryProviderAdapter({
        adapterId: 'deterministic-started',
        supports: () => true,
        dispatch: async (request, dispatchKey) => {
          dispatchKeys.push(dispatchKey)
          if (failOnce) throw new AgentFactoryDispatchNotStartedError('adapter confirmed no worker was started')
          signalAdapterEntered()
          await adapterRelease
          return startedReceiptForRequest(request)
        },
      })
      const input = {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target-journey-1',
        workItemId: claim.workItem.id,
        leaseId: claim.attempt.leaseId,
        ownerToken: claim.ownerToken,
      }
      await expect(dispatchQualityJourneyWork(input, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } }),
      ).toMatchObject({
        dispatchAdapterId: 'deterministic-started',
        dispatchReservedAt: null,
        dispatchStartedAt: null,
      })
      failOnce = false
      const firstDispatch = dispatchQualityJourneyWork(input, client)
      await adapterEntered
      expect(await dispatchQualityJourneyWork(input, client)).toMatchObject({
        replayed: true,
        status: 'DISPATCH_PENDING',
        adapterId: 'deterministic-started',
      })
      releaseAdapter()
      const completedDispatch = await firstDispatch
      expect(completedDispatch).toMatchObject({ status: 'IN_PROGRESS', adapterId: 'deterministic-started' })
      expect(completedDispatch).not.toHaveProperty('receipt')
      expect(await dispatchQualityJourneyWork(input, client)).toMatchObject({ replayed: true })
      expect(dispatchKeys).toEqual([claim.attempt.dispatchKey, claim.attempt.dispatchKey])

      const refusedJourney = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'dispatch-refused',
          requirement: { objective: 'Refuse' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'dispatch-refused-analysis',
          journeyId: refusedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: refusedJourney.journey.stateHash,
          idempotencyKey: 'dispatch-refused-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, refusedJourney),
        },
        client,
      )
      const refusedClaim = await claimQualityJourneyWork(
        {
          journeyId: refusedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      clearAgentFactoryProviderAdaptersForTest()
      registerAgentFactoryProviderAdapter({
        adapterId: 'deterministic-refused',
        supports: () => true,
        dispatch: async request => ({
          schemaVersion: 'appraise.quality-journey/v1',
          outcome: 'REFUSED',
          refusalCode: 'REQUIRED_BOUNDARY_UNSUPPORTED',
          spawnReceiptId: `refused-${request.attemptId}`,
          assignmentId: request.assignmentId,
          workItemId: request.workItemId,
          attemptId: request.attemptId,
          roleDefinitionDigest: request.roleDefinitionDigest,
          capabilityProfileDigest: request.capabilityProfileDigest,
          boundaries: request.requiredBoundaries.map(boundary => ({
            boundary: boundary.boundary,
            requested: boundary.allowedValues,
            status: boundary.boundary === request.requiredBoundaries[0]?.boundary ? 'UNSUPPORTED' : 'ENFORCED',
            evidence: boundary.boundary === request.requiredBoundaries[0]?.boundary ? [digest('f')] : [],
          })),
          refusedAt: '2026-08-28T15:00:00.000Z',
        }),
      })
      expect(
        await dispatchQualityJourneyWork(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: refusedClaim.workItem.id,
            leaseId: refusedClaim.attempt.leaseId,
            ownerToken: refusedClaim.ownerToken,
          },
          client,
        ),
      ).toMatchObject({ status: 'BLOCKED', adapterId: 'deterministic-refused' })
      expect(
        await inspectQualityJourneyFactoryEvidence(
          { journeyId: refusedJourney.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({ attempts: [{ status: 'REFUSED', spawnReceiptHash: expect.stringMatching(/^sha256:/) }] })
      expect(
        await getQualityJourney(
          { journeyId: refusedJourney.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({
        workItems: [{ id: refusedClaim.workItem.id, status: 'BLOCKED' }],
        blockers: [{ reasonCode: 'REQUIRED_BOUNDARY_UNSUPPORTED', responsibleActor: 'COORDINATOR' }],
      })
      expect(
        await resumeQualityJourney(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-29T00:00:00.000Z'),
          },
          client,
        ),
      ).toMatchObject({ resumedRefusedAttemptIds: [refusedClaim.attempt.id] })
      expect(
        await resumeQualityJourney(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-30T00:00:00.000Z'),
          },
          client,
        ),
      ).toMatchObject({ resumedRefusedAttemptIds: [] })
      expect(
        await getQualityJourney(
          { journeyId: refusedJourney.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({ workItems: [{ id: refusedClaim.workItem.id, status: 'REPLACEMENT_REQUESTED' }], blockers: [] })
      const refusedReplacement = await claimQualityJourneyWork(
        {
          journeyId: refusedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      expect(refusedReplacement.attempt).toMatchObject({ attempt: 2, replacesAttemptId: refusedClaim.attempt.id })
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: refusedReplacement.workItem.id,
            leaseId: refusedReplacement.attempt.leaseId,
            ownerToken: refusedReplacement.ownerToken,
          },
          client,
        ),
      ).resolves.toMatchObject({ status: 'BLOCKED', adapterId: 'deterministic-refused' })
      await expect(
        resumeQualityJourney(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-08-31T00:00:00.000Z'),
          },
          client,
        ),
      ).resolves.toMatchObject({ resumedRefusedAttemptIds: [refusedReplacement.attempt.id] })
      const finalRefusedClaim = await claimQualityJourneyWork(
        {
          journeyId: refusedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      expect(finalRefusedClaim.attempt).toMatchObject({ attempt: 3, replacesAttemptId: refusedReplacement.attempt.id })
      await expect(
        dispatchQualityJourneyWork(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: finalRefusedClaim.workItem.id,
            leaseId: finalRefusedClaim.attempt.leaseId,
            ownerToken: finalRefusedClaim.ownerToken,
          },
          client,
        ),
      ).resolves.toMatchObject({ status: 'BLOCKED', adapterId: 'deterministic-refused' })
      await expect(
        resumeQualityJourney(
          {
            journeyId: refusedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            now: new Date('2026-09-01T00:00:00.000Z'),
          },
          client,
        ),
      ).resolves.toMatchObject({ resumedRefusedAttemptIds: [] })
      expect(
        await getQualityJourney(
          { journeyId: refusedJourney.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({
        workItems: [{ id: refusedClaim.workItem.id, status: 'BLOCKED' }],
        blockers: [{ reasonCode: 'ATTEMPT_BUDGET_EXHAUSTED', safeResumeCommand: 'NONE' }],
      })

      const unresolvedJourney = await createQualityJourney(
        {
          targetProjectId: 'target-journey-1',
          idempotencyKey: 'dispatch-unresolved',
          requirement: { objective: 'Unresolved dispatch' },
        },
        client,
      )
      await submitDurableQualityJourneyCommand(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          commandId: 'dispatch-unresolved-analysis',
          journeyId: unresolvedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          actor: 'USER',
          command: 'SUBMIT_REQUIREMENT',
          expectedStateHash: unresolvedJourney.journey.stateHash,
          idempotencyKey: 'dispatch-unresolved-analysis',
          inputArtifactRefs: [],
          payload: await requirementPayload(client, unresolvedJourney),
        },
        client,
      )
      const unresolvedClaim = await claimQualityJourneyWork(
        {
          journeyId: unresolvedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          role: 'REQUIREMENT_ANALYZER',
        },
        client,
      )
      clearAgentFactoryProviderAdaptersForTest()
      registerAgentFactoryProviderAdapter({
        adapterId: 'lost-response-adapter',
        supports: () => true,
        dispatch: async () => {
          throw new Error('provider connection closed after dispatch request')
        },
      })
      expect(
        await dispatchQualityJourneyWork(
          {
            journeyId: unresolvedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: unresolvedClaim.workItem.id,
            leaseId: unresolvedClaim.attempt.leaseId,
            ownerToken: unresolvedClaim.ownerToken,
          },
          client,
        ),
      ).toMatchObject({
        status: 'DISPATCH_UNRESOLVED',
        attemptId: unresolvedClaim.attempt.id,
        adapterId: 'lost-response-adapter',
      })
      await client.qualityJourneyWorkAttempt.update({
        where: { id: unresolvedClaim.attempt.id },
        data: {
          leaseExpiresAt: new Date('2026-08-28T00:00:00.000Z'),
        },
      })
      await resumeQualityJourney(
        {
          journeyId: unresolvedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          now: new Date('2026-08-29T00:00:00.000Z'),
        },
        client,
      )
      const repeatedResume = await resumeQualityJourney(
        {
          journeyId: unresolvedJourney.journey.journeyId,
          targetProjectId: 'target-journey-1',
          now: new Date('2026-08-30T00:00:00.000Z'),
        },
        client,
      )
      expect(repeatedResume.expiredAttemptIds).toEqual([])
      await expect(
        claimQualityJourneyWork(
          {
            journeyId: unresolvedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            role: 'REQUIREMENT_ANALYZER',
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await getQualityJourney(
          { journeyId: unresolvedJourney.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({
        workItems: [{ id: unresolvedClaim.workItem.id, status: 'BLOCKED' }],
        blockers: [{ reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH' }],
      })
      expect(
        await client.qualityJourneyBlocker.count({
          where: { journeyId: unresolvedJourney.journey.journeyId, reasonCode: 'AMBIGUOUS_PROVIDER_DISPATCH' },
        }),
      ).toBe(1)
      expect(
        await dispatchQualityJourneyWork(
          {
            journeyId: unresolvedJourney.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: unresolvedClaim.workItem.id,
            leaseId: unresolvedClaim.attempt.leaseId,
            ownerToken: unresolvedClaim.ownerToken,
          },
          client,
        ),
      ).toMatchObject({
        status: 'DISPATCH_UNRESOLVED',
        attemptId: unresolvedClaim.attempt.id,
        adapterId: 'lost-response-adapter',
      })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
