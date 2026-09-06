import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, expect, it, vi } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

import { createQualityJourney } from './quality-journey-service'
import {
  inspectQualityJourneyHandoff,
  launchQualityJourneyHandoff,
  prepareQualityJourneyHandoff,
  redeemQualityJourneyHandoff,
  type CoordinatorProvider,
} from './quality-journey-handoff-service'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journey-handoff-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  const client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  cleanups.push(async () => {
    await client.$disconnect()
    await rm(directory, { recursive: true, force: true })
  })
  await client.targetProject.create({
    data: {
      id: 'target-handoff',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: 'workspace:handoff',
      canonicalPath: directory,
      displayName: 'Handoff target',
      fingerprint: 'handoff',
    },
  })
  const created = await createQualityJourney(
    {
      targetProjectId: 'target-handoff',
      idempotencyKey: 'handoff-journey',
      requirement: {
        schemaVersion: 'appraise.quality-journey-requirement/v1',
        objective: 'Validate checkout',
        coverageRigor: 'STANDARD',
        testDimensions: ['FUNCTIONAL'],
        includedScope: ['Checkout'],
        desiredEvidenceSignals: ['Order ID is visible'],
      },
    },
    client,
  )
  return { client, directory, journeyId: created.journey.journeyId }
}

it('prepares a safe prompt, launches through the registered provider, and redeems exactly once', async () => {
  const { client, directory, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  expect(prepared.prompt).toContain('Coverage rigor: STANDARD')
  expect(prepared.prompt).toContain('quality_journey_handoff_redeem')
  const row = await client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: prepared.handoffId } })
  expect(JSON.stringify(row)).not.toContain(prepared.prompt)
  const ticket = prepared.prompt.match(/qjh_[A-Za-z0-9_-]{32}/)?.[0]
  expect(ticket).toBeDefined()

  const launch = vi.fn().mockResolvedValue({ outcome: 'LAUNCHED' as const })
  const provider: CoordinatorProvider = { id: 'codex', launch }
  await expect(
    launchQualityJourneyHandoff(
      { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' },
      provider,
      client,
    ),
  ).resolves.toMatchObject({ status: 'LAUNCHED' })
  expect(launch).toHaveBeenCalledWith(directory)

  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket: ticket! }, client),
  ).resolves.toMatchObject({ providerId: 'codex' })
  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket: ticket! }, client),
  ).rejects.toThrow('already been redeemed')
  await expect(
    inspectQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff' }, client),
  ).resolves.toMatchObject({
    handoff: { status: 'CONNECTED' },
  })
})

it('fails closed for unavailable providers, wrong targets, and expired tickets', async () => {
  const { client, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  const unavailable: CoordinatorProvider = {
    id: 'codex',
    launch: vi.fn().mockResolvedValue({ outcome: 'UNAVAILABLE', reason: 'missing client' }),
  }
  await expect(
    launchQualityJourneyHandoff(
      { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' },
      unavailable,
      client,
    ),
  ).resolves.toMatchObject({ status: 'FAILED', reason: 'missing client' })
  const ticket = prepared.prompt.match(/qjh_[A-Za-z0-9_-]{32}/)![0]
  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'wrong-target', ticket }, client),
  ).rejects.toThrow('invalid')
  await client.qualityJourneyCoordinatorHandoff.update({
    where: { id: prepared.handoffId },
    data: { expiresAt: new Date(0) },
  })
  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket }, client),
  ).rejects.toThrow('expired')
})

it('does not let a late launcher overwrite an already connected handoff', async () => {
  const { client, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  const ticket = prepared.prompt.match(/qjh_[A-Za-z0-9_-]{32}/)![0]
  let finishLaunch!: () => void
  let signalLaunchStarted!: () => void
  const launchStarted = new Promise<void>(resolve => (signalLaunchStarted = resolve))
  const provider: CoordinatorProvider = {
    id: 'codex',
    launch: () => {
      signalLaunchStarted()
      return new Promise(resolve => (finishLaunch = () => resolve({ outcome: 'LAUNCHED' })))
    },
  }
  const launching = launchQualityJourneyHandoff(
    { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' },
    provider,
    client,
  )
  await launchStarted
  await redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket }, client)
  finishLaunch()
  await expect(launching).resolves.toMatchObject({ status: 'CONNECTED' })
  await expect(
    inspectQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff' }, client),
  ).resolves.toMatchObject({
    handoff: { status: 'CONNECTED' },
  })
})

it('prepares handoffs only while requirement analysis is active', async () => {
  const { client, journeyId } = await fixture()
  await client.qualityJourney.update({ where: { id: journeyId }, data: { stage: 'DISCOVERY' } })
  await expect(
    prepareQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', providerId: 'codex' }, client),
  ).rejects.toThrow('before or during requirement analysis')
})
