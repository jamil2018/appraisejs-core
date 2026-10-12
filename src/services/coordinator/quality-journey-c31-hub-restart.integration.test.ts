import { fork, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { createQualityJourney } from './quality-journey-service'

function host(database: string, mode: string) {
  return fork(fileURLToPath(new URL('../../test/c31-recovery-hub.ts', import.meta.url)), [database, mode], {
    execArgv: ['--import', 'tsx/esm'],
    env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '' },
    silent: true,
  })
}
async function exit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await once(child, 'exit')
}

it('recovers a committed pause after a lost reply and service-host process restart without repeating its effect', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-c31-hub-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  const client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  const children: ChildProcess[] = []
  try {
    await client.targetProject.create({
      data: {
        id: 'c31-restart-target',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `path:${directory}`,
        canonicalPath: directory,
        displayName: 'C3.1 restart fixture',
        fingerprint: 'c31-restart',
      },
    })
    const created = await createQualityJourney(
      {
        targetProjectId: 'c31-restart-target',
        idempotencyKey: 'c31-restart-journey',
        requirement: {
          schemaVersion: 'appraise.quality-journey-requirement/v1',
          objective: 'Qualify operational recovery',
          context: 'Disposable service-host process restart.',
          coverageRigor: 'STANDARD',
          testDimensions: ['FUNCTIONAL'],
          includedScope: ['Recovery'],
          desiredEvidenceSignals: ['Durable pause is recovered'],
        },
      },
      client,
    )
    const request = {
      journeyId: created.journey.journeyId,
      targetProjectId: 'c31-restart-target',
      expectedStateHash: created.journey.stateHash,
      expectedVersion: created.journey.version,
      idempotencyKey: 'c31-lost-pause-reply',
      reason: 'Injected stopped/offline external task; no host termination claim.',
    }
    const first = host(database, 'drop-reply')
    children.push(first)
    expect((await once(first, 'message'))[0]).toEqual({ phase: 'READY' })
    const exited = exit(first)
    first.send(request)
    await exited
    expect(first.exitCode).toBe(0)
    const paused = await client.qualityJourney.findUniqueOrThrow({ where: { id: request.journeyId } })
    expect(paused.status).toBe('PAUSED')
    expect(paused.stateHash).toBe(request.expectedStateHash)
    const eventCount = await client.qualityJourneyEvent.count({ where: { journeyId: request.journeyId } })
    const second = host(database, 'recover')
    children.push(second)
    expect((await once(second, 'message'))[0]).toEqual({ phase: 'READY' })
    const reply = once(second, 'message')
    const recoveredExit = exit(second)
    second.send(request)
    expect((await reply)[0]).toMatchObject({
      phase: 'RECOVERED',
      result: { operationalStatus: 'PAUSED', replayed: true },
    })
    await recoveredExit
    expect(second.exitCode).toBe(0)
    expect(await client.qualityJourneyEvent.count({ where: { journeyId: request.journeyId } })).toBe(eventCount)
    expect(
      await client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: request.journeyId } } }),
    ).toBe(0)
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exit(child)
    }
    await client.$disconnect()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
