import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  qualityJourneyContractDigest,
  qualityJourneyRoleDefinitions,
  qualityJourneyWorkItemId,
} from '@/lib/quality-journey'
import {
  claimQualityJourneyWork,
  completeQualityJourneyWork,
  createQualityJourney,
  getQualityJourney,
  listQualityJourneyArtifacts,
  recordQualityJourneyWorkerSpawnReceipt,
  resumeQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`

afterEach(async () => {
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
      reasoningLevel: 'medium',
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

describe('Quality Journey Phase 1 durable service', () => {
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
      expect(await client.qualityJourneyWorkAuthorization.findUnique({ where: { workItemId } })).toBeNull()
      expect(
        await resumeQualityJourney(
          { journeyId: created.journey.journeyId, targetProjectId: 'target-journey-1' },
          client,
        ),
      ).toMatchObject({ recoveredWorkItemIds: [workItemId] })
      const recovered = await client.qualityJourneyWorkAuthorization.findUniqueOrThrow({ where: { workItemId } })
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
        payload: { journeyRevisionId: 'revision-command-1', requirementHash: digest('b') },
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
        payload: { journeyRevisionId: 'revision-race', requirementHash: digest('c') },
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
          payload: { journeyRevisionId: 'revision-analysis', requirementHash: digest('b') },
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
      expect(
        await recordQualityJourneyWorkerSpawnReceipt(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            receipt: startedReceipt(claim),
          },
          client,
        ),
      ).toMatchObject({ status: 'IN_PROGRESS', replayed: false })
      expect(
        await recordQualityJourneyWorkerSpawnReceipt(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            receipt: startedReceipt(claim),
          },
          client,
        ),
      ).toMatchObject({ replayed: true })
      await expect(
        recordQualityJourneyWorkerSpawnReceipt(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            receipt: { ...startedReceipt(claim), spawnReceiptId: 'conflicting-receipt' },
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
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
        await recordQualityJourneyWorkerSpawnReceipt(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: claim.workItem.id,
            leaseId: claim.attempt.leaseId,
            ownerToken: claim.ownerToken,
            receipt: startedReceipt(claim),
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
          payload: { journeyRevisionId: 'revision-replacement-analysis', requirementHash: digest('c') },
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
      await expect(
        client.qualityJourneyWorkAttempt.update({
          where: { id: replacement.attempt.id },
          data: { replacesAttemptId: null },
        }),
      ).rejects.toThrow()
      expect(
        await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: replacement.attempt.id } }),
      ).toMatchObject({ replacesAttemptId: predecessor.attempt.id })
      await expect(
        recordQualityJourneyWorkerSpawnReceipt(
          {
            journeyId: created.journey.journeyId,
            targetProjectId: 'target-journey-1',
            workItemId: predecessor.workItem.id,
            leaseId: predecessor.attempt.leaseId,
            ownerToken: predecessor.ownerToken,
            receipt: startedReceipt(predecessor),
          },
          client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  }, 60_000)
})
