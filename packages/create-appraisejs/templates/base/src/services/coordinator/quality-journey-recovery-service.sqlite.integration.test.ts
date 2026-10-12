import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { createQualityJourneyKernelState } from '@/lib/quality-journey'
import { assertCoordinatorMutationSession } from './quality-journey-coordinator-session'
import { pauseQualityJourneyOperational, resumeQualityJourneyOperational } from './quality-journey-recovery-service'
import { claimQualityJourneyWork, resumeQualityJourney } from './quality-journey-service'

const workspaces: string[] = []
const stateHash = `sha256:${'a'.repeat(64)}`
const scope = { journeyId: 'qjy_recovery', targetProjectId: 'project_recovery' }

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(item => fs.rm(item, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-journey-recovery-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  await client.targetProject.create({
    data: {
      id: scope.targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Recovery fixture',
      fingerprint: stateHash,
    },
  })
  await client.qualityJourney.create({
    data: {
      id: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      rootIdempotencyKey: 'root-recovery',
      rootRequestHash: stateHash,
      activeCycleId: 'cycle_recovery',
      stateHash,
    },
  })
  return { client, databasePath }
}

const pauseInput = {
  ...scope,
  expectedStateHash: stateHash,
  expectedVersion: 0,
  idempotencyKey: 'pause-1',
  reason: 'Operator requested pause.',
}

describe('operational Quality Journey pause and recovery', () => {
  it('keeps lifecycle identity stable and replays a lost pause reply after a client reconnect', async () => {
    const { client, databasePath } = await fixture()
    try {
      const first = await pauseQualityJourneyOperational(pauseInput, client)
      expect(first).toMatchObject({ operationalStatus: 'PAUSED', version: 1, stateHash, replayed: false })
      expect(first.cleanup).toMatchObject({
        browser: 'NONE_REGISTERED',
        execution: 'NONE_REGISTERED',
        externalCodex: 'UNKNOWN',
      })
      await expect(assertCoordinatorMutationSession(undefined, scope, client)).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      await client.$disconnect()
      const reconnected = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
      try {
        const replay = await pauseQualityJourneyOperational(pauseInput, reconnected)
        expect(replay).toMatchObject({
          operationalStatus: 'PAUSED',
          version: 1,
          stateHash,
          replayed: true,
          eventId: first.eventId,
        })
        const row = await reconnected.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
        expect(row).toMatchObject({ status: 'PAUSED', version: 1, stage: 'INTAKE', stateHash })
        expect(
          await reconnected.qualityJourneyEvent.count({
            where: { journeyId: scope.journeyId, eventType: 'OPERATIONAL_PAUSE' },
          }),
        ).toBe(1)
        expect(
          await reconnected.qualityJourneyEvent.count({
            where: { journeyId: scope.journeyId, eventType: 'OPERATIONAL_PAUSE_CLEANUP' },
          }),
        ).toBe(1)
        const pauseEvent = await reconnected.qualityJourneyEvent.findUniqueOrThrow({ where: { id: first.eventId } })
        expect(pauseEvent.payloadJson).not.toContain(pauseInput.reason)
      } finally {
        await reconnected.$disconnect()
      }
    } finally {
      await client.$disconnect()
    }
  })

  it('recovers a committed pause after an injected pre-cleanup crash using a fresh client and resume key', async () => {
    const { client, databasePath } = await fixture()
    const crashingClient = new Proxy(client, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property)
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          await target.$transaction(callback)
          throw new Error('Injected process crash after pause commit, before cleanup')
        }
      },
    })
    try {
      await expect(pauseQualityJourneyOperational(pauseInput, crashingClient)).rejects.toThrow('Injected process crash')
      expect(await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).toMatchObject({
        status: 'PAUSED',
        version: 1,
        stateHash,
      })
      expect(await client.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_PAUSE_CLEANUP' } })).toBe(0)
      await client.$disconnect()
      const restarted = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
      try {
        const resume = {
          ...scope,
          expectedStateHash: stateHash,
          expectedVersion: 1,
          idempotencyKey: 'fresh-resume-key',
        }
        expect(await resumeQualityJourneyOperational(resume, restarted)).toMatchObject({
          operationalStatus: 'ACTIVE',
          version: 2,
          cleanup: { browser: 'NONE_REGISTERED', execution: 'NONE_REGISTERED' },
        })
        expect(await resumeQualityJourneyOperational(resume, restarted)).toMatchObject({ replayed: true })
        expect(await restarted.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_PAUSE' } })).toBe(1)
        expect(await restarted.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_PAUSE_CLEANUP' } })).toBe(1)
        expect(await restarted.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_RESUME' } })).toBe(1)
      } finally {
        await restarted.$disconnect()
      }
    } finally {
      await client.$disconnect()
    }
  })

  it('keeps an earlier pause cleanup inside its captured epoch after concurrent resume and new admission', async () => {
    const { client } = await fixture()
    let signalCommitted!: () => void
    let releasePause!: () => void
    const committed = new Promise<void>(resolve => {
      signalCommitted = resolve
    })
    const release = new Promise<void>(resolve => {
      releasePause = resolve
    })
    const delayedClient = new Proxy(client, {
      get(target, property) {
        if (property !== '$transaction') return Reflect.get(target, property)
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          const result = await target.$transaction(callback)
          signalCommitted()
          await release
          return result
        }
      },
    })
    const originalPause = pauseQualityJourneyOperational(pauseInput, delayedClient)
    try {
      await Promise.race([
        committed,
        originalPause.then(() => Promise.reject(new Error('Pause did not wait after commit.'))),
      ])
      const pauseEvent = await client.qualityJourneyEvent.findFirstOrThrow({
        where: { eventType: 'OPERATIONAL_PAUSE', journeyId: scope.journeyId },
      })
      expect(JSON.parse(pauseEvent.payloadJson)).toMatchObject({
        cleanupTargets: { browserSessionIds: [], executionCycleIds: [] },
      })
      const resumed = await resumeQualityJourneyOperational(
        { ...scope, expectedStateHash: stateHash, expectedVersion: 1, idempotencyKey: 'resume-racing-pause' },
        client,
      )
      expect(resumed.operationalStatus).toBe('ACTIVE')
      await client.qualityJourneyOwnedBrowser.create({
        data: {
          id: 'new-epoch-browser',
          sessionId: 'new-epoch-browser',
          journeyId: scope.journeyId,
          targetProjectId: scope.targetProjectId,
          processInstanceId: 'new-epoch-process',
          status: 'LIVE',
        },
      })
      await client.environment.create({
        data: {
          id: 'new-epoch-environment',
          name: 'New epoch environment',
          baseUrl: 'https://example.test',
          targetProjectId: scope.targetProjectId,
        },
      })
      const run = await client.testRun.create({
        data: {
          id: 'new-epoch-run',
          name: 'New epoch run',
          environmentId: 'new-epoch-environment',
          targetProjectId: scope.targetProjectId,
          intent: 'QUALITY_JOURNEY',
          status: 'QUEUED',
          environmentSnapshotJson: '{}',
          environmentSnapshotHash: stateHash,
          environmentSnapshotVersion: 1,
        },
      })
      await client.qualityJourneyCycle.create({
        data: { id: 'cycle_recovery', journeyId: scope.journeyId, sequence: 1 },
      })
      await client.qualityJourneyExecutionCycle.create({
        data: {
          id: 'new-epoch-execution',
          journeyId: scope.journeyId,
          targetProjectId: scope.targetProjectId,
          cycleId: 'cycle_recovery',
          preparedCapsulesJson: '[{"preparedCapsuleId":"new-epoch-capsule"}]',
          preparedCapsulesHash: stateHash,
          environmentId: 'new-epoch-environment',
          environmentSnapshotJson: '{}',
          environmentSnapshotHash: stateHash,
          environmentSnapshotVersion: 1,
          targetFingerprint: stateHash,
          stateHash,
          idempotencyKey: 'new-epoch-execution-key',
          requestHash: stateHash,
          status: 'RESERVED',
          testRuns: {
            create: {
              id: 'new-epoch-binding',
              preparedCapsuleId: 'new-epoch-capsule',
              testRunId: run.id,
              runId: run.runId,
            },
          },
        },
      })
      releasePause()
      const delayed = await originalPause
      expect(delayed.cleanup.browser).toBe('NONE_REGISTERED')
      expect(
        (await client.qualityJourneyOwnedBrowser.findUniqueOrThrow({ where: { id: 'new-epoch-browser' } })).status,
      ).toBe('LIVE')
      expect(
        (await client.qualityJourneyExecutionTestRun.findUniqueOrThrow({ where: { id: 'new-epoch-binding' } })).status,
      ).toBe('RESERVED')
      expect((await client.testRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe('QUEUED')
      expect(await client.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_PAUSE_CLEANUP' } })).toBe(1)
    } finally {
      releasePause()
      await originalPause.catch(() => undefined)
      await client.$disconnect()
    }
  })

  it('rolls back admission until delayed sealed evidence can publish in the resume transaction', async () => {
    const { client } = await fixture()
    try {
      const executionState = createQualityJourneyKernelState({
        ...scope,
        activeCycleId: 'cycle_recovery',
        stage: 'EXECUTION',
      })
      await client.qualityJourney.update({
        where: { id: scope.journeyId },
        data: { stage: 'EXECUTION', stateHash: executionState.stateHash },
      })
      await client.qualityJourneyCycle.create({
        data: { id: 'cycle_recovery', journeyId: scope.journeyId, sequence: 1 },
      })
      await client.environment.create({
        data: {
          id: 'environment-recovery',
          name: 'Recovery environment',
          baseUrl: 'https://example.test',
          targetProjectId: scope.targetProjectId,
        },
      })
      const testRun = await client.testRun.create({
        data: {
          id: 'run-recovery',
          name: 'Cancelled run',
          environmentId: 'environment-recovery',
          targetProjectId: scope.targetProjectId,
          intent: 'QUALITY_JOURNEY',
          status: 'CANCELLED',
          environmentSnapshotJson: '{}',
          environmentSnapshotHash: stateHash,
          environmentSnapshotVersion: 1,
        },
      })
      await client.qualityJourneyExecutionCycle.create({
        data: {
          id: 'execution-recovery',
          journeyId: scope.journeyId,
          targetProjectId: scope.targetProjectId,
          cycleId: 'cycle_recovery',
          preparedCapsulesJson: '[{"preparedCapsuleId":"capsule-recovery"}]',
          preparedCapsulesHash: stateHash,
          environmentId: 'environment-recovery',
          environmentSnapshotJson: '{}',
          environmentSnapshotHash: stateHash,
          environmentSnapshotVersion: 1,
          targetFingerprint: stateHash,
          stateHash: executionState.stateHash,
          idempotencyKey: 'execution-recovery-key',
          requestHash: stateHash,
          status: 'CANCELLED',
          testRuns: {
            create: {
              id: 'binding-recovery',
              preparedCapsuleId: 'capsule-recovery',
              testRunId: testRun.id,
              runId: testRun.runId,
              status: 'CANCELLED',
            },
          },
        },
      })
      const pause = { ...pauseInput, expectedStateHash: executionState.stateHash }
      await pauseQualityJourneyOperational(pause, client)
      const resume = {
        ...scope,
        expectedStateHash: executionState.stateHash,
        expectedVersion: 1,
        idempotencyKey: 'resume-delayed-evidence',
      }
      await expect(resumeQualityJourneyOperational(resume, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).toMatchObject({
        status: 'PAUSED',
        version: 1,
        stage: 'EXECUTION',
      })
      expect(await client.qualityJourneyEvent.count({ where: { eventType: 'OPERATIONAL_RESUME' } })).toBe(0)
      await client.qualityJourneyExecutionEvidenceReceipt.create({
        data: {
          id: 'evidence-recovery',
          executionCycleId: 'execution-recovery',
          testRunId: testRun.id,
          runtimeBytesHash: stateHash,
          receiptHash: `sha256:${'b'.repeat(64)}`,
          evidenceJson: '{}',
        },
      })
      expect(await resumeQualityJourneyOperational(resume, client)).toMatchObject({
        operationalStatus: 'ACTIVE',
        version: 3,
      })
      expect(await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).toMatchObject({
        status: 'ACTIVE',
        stage: 'TRIAGE',
        version: 3,
      })
      expect(await client.qualityJourneyEvent.count({ where: { eventType: 'COMMAND_PUBLISH_RUN_RESULT' } })).toBe(1)
    } finally {
      await client.$disconnect()
    }
  })

  it('fences external attempts, preserves human waits, and refuses ambiguous managed dispatch', async () => {
    const { client } = await fixture()
    try {
      for (const [id, status] of [
        ['external', 'IN_PROGRESS'],
        ['managed', 'IN_PROGRESS'],
        ['human', 'WAITING_FOR_INPUT'],
      ] as const) {
        await client.qualityJourneyWorkItem.create({
          data: {
            id,
            journeyId: scope.journeyId,
            targetProjectId: scope.targetProjectId,
            cycleId: 'cycle_recovery',
            role: 'REQUIREMENT_ANALYZER',
            status,
            inputHash: stateHash,
            roleContractDigest: stateHash,
          },
        })
      }
      const leaseExpiresAt = new Date(Date.now() + 60_000)
      await client.qualityJourneyWorkAttempt.createMany({
        data: [
          {
            id: 'attempt-external',
            workItemId: 'external',
            attempt: 1,
            status: 'IN_PROGRESS',
            executionMode: 'EXTERNAL_V1',
            leaseId: 'lease-external',
            ownerTokenHash: stateHash,
            leaseExpiresAt,
            heartbeatSeconds: 30,
          },
          {
            id: 'attempt-managed',
            workItemId: 'managed',
            attempt: 1,
            status: 'IN_PROGRESS',
            executionMode: 'MANAGED',
            leaseId: 'lease-managed',
            ownerTokenHash: stateHash,
            leaseExpiresAt,
            heartbeatSeconds: 30,
            dispatchReservedAt: new Date(),
          },
        ],
      })
      await pauseQualityJourneyOperational(pauseInput, client)
      await expect(claimQualityJourneyWork({ ...scope, role: 'REQUIREMENT_ANALYZER' }, client)).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      expect(
        (await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: 'attempt-external' } })).status,
      ).toBe('EXPIRED')
      expect((await client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: 'external' } })).status).toBe(
        'REPLACEMENT_REQUESTED',
      )
      expect((await client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: 'managed' } })).status).toBe(
        'IN_PROGRESS',
      )
      expect((await client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: 'human' } })).status).toBe(
        'WAITING_FOR_INPUT',
      )
      const resume = { ...scope, expectedStateHash: stateHash, expectedVersion: 1, idempotencyKey: 'resume-1' }
      await expect(resumeQualityJourneyOperational(resume, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      const recovered = await resumeQualityJourney({ ...scope, now: new Date(Date.now() + 120_000) }, client)
      expect(recovered.expiredAttemptIds).toContain('attempt-managed')
      expect(
        (await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: 'attempt-managed' } })).status,
      ).toBe('DISPATCH_UNRESOLVED')
      await expect(resumeQualityJourneyOperational(resume, client)).rejects.toMatchObject({ code: 'CONFLICT' })
      await client.qualityJourneyWorkAttempt.update({ where: { id: 'attempt-managed' }, data: { status: 'EXPIRED' } })
      expect(await resumeQualityJourneyOperational(resume, client)).toMatchObject({
        operationalStatus: 'ACTIVE',
        version: 2,
        replayed: false,
      })
      const latePauseReplay = await pauseQualityJourneyOperational(pauseInput, client)
      expect(latePauseReplay).toMatchObject({ operationalStatus: 'ACTIVE', version: 2, replayed: true })
      expect((await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).status).toBe('ACTIVE')
    } finally {
      await client.$disconnect()
    }
  })

  it('rejects stale expected versions and conflicting idempotency input', async () => {
    const { client } = await fixture()
    try {
      await expect(pauseQualityJourneyOperational({ ...pauseInput, expectedVersion: 4 }, client)).rejects.toMatchObject(
        { code: 'CONFLICT' },
      )
      await pauseQualityJourneyOperational(pauseInput, client)
      await expect(
        pauseQualityJourneyOperational({ ...pauseInput, reason: 'Different reason.' }, client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await client.$disconnect()
    }
  })

  it.each(['CODEX_STOP_NO_REPLY', 'CODEX_OFFLINE_NO_REPLY', 'CODEX_QUOTA_NO_REPLY'] as const)(
    'keeps admission closed for modeled %s transport silence',
    async failureMode => {
      const { client } = await fixture()
      try {
        const input = { ...pauseInput, idempotencyKey: `pause-${failureMode}`, reason: `Modeled ${failureMode}` }
        const paused = await pauseQualityJourneyOperational(input, client)
        expect(paused).toMatchObject({ operationalStatus: 'PAUSED', cleanup: { externalCodex: 'UNKNOWN' } })
        expect(await pauseQualityJourneyOperational(input, client)).toMatchObject({
          replayed: true,
          eventId: paused.eventId,
        })
        await expect(claimQualityJourneyWork({ ...scope, role: 'REQUIREMENT_ANALYZER' }, client)).rejects.toMatchObject(
          { code: 'CONFLICT' },
        )
        expect(
          await client.qualityJourneyEvent.count({
            where: { journeyId: scope.journeyId, eventType: 'OPERATIONAL_PAUSE' },
          }),
        ).toBe(1)
      } finally {
        await client.$disconnect()
      }
    },
  )
})
