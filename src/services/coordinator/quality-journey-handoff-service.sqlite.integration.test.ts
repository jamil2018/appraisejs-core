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
        context: 'Checkout is being redesigned for returning shoppers.',
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
  expect(prepared.prompt).toContain('Context: Checkout is being redesigned for returning shoppers.')
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

it('invalidates an older unredeemed ticket when a replacement handoff is prepared', async () => {
  const { client, journeyId } = await fixture()
  const first = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  const firstTicket = first.prompt.match(/qjh_[A-Za-z0-9_-]{32}/)![0]

  const replacement = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )

  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket: firstTicket }, client),
  ).rejects.toThrow('invalid')
  const launch = vi.fn().mockResolvedValue({ outcome: 'LAUNCHED' as const })
  await expect(
    launchQualityJourneyHandoff(
      { handoffId: first.handoffId, journeyId, targetProjectId: 'target-handoff' },
      { id: 'codex', launch },
      client,
    ),
  ).rejects.toThrow('expired')
  expect(launch).not.toHaveBeenCalled()
  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: first.handoffId } }),
  ).resolves.toMatchObject({ status: 'EXPIRED', failureCode: 'HANDOFF_SUPERSEDED' })
  await expect(
    inspectQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff' }, client),
  ).resolves.toMatchObject({ handoff: { id: replacement.handoffId, status: 'PREPARED' } })
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

it('records rejected provider launches as retryable failures', async () => {
  const { client, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  const provider: CoordinatorProvider = { id: 'codex', launch: vi.fn().mockRejectedValue(new Error('spawn crashed')) }

  await expect(
    launchQualityJourneyHandoff(
      { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' },
      provider,
      client,
    ),
  ).resolves.toMatchObject({ status: 'FAILED', reason: 'spawn crashed' })
  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: prepared.handoffId } }),
  ).resolves.toMatchObject({ status: 'FAILED', failureCode: 'PROVIDER_UNAVAILABLE' })
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

it('preserves a connected handoff when its redeemed ticket later passes the TTL', async () => {
  const { client, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  const ticket = prepared.prompt.match(/qjh_[A-Za-z0-9_-]{32}/)![0]
  await redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket }, client)
  await client.qualityJourneyCoordinatorHandoff.update({
    where: { id: prepared.handoffId },
    data: { expiresAt: new Date(0) },
  })

  await expect(
    launchQualityJourneyHandoff(
      { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' },
      { id: 'codex', launch: vi.fn() },
      client,
    ),
  ).resolves.toMatchObject({ status: 'CONNECTED' })
  await expect(
    redeemQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', ticket }, client),
  ).rejects.toThrow('already been redeemed')
  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: prepared.handoffId } }),
  ).resolves.toMatchObject({ status: 'CONNECTED', failureCode: null })
})

it('preserves supersession when an older ticket passes its original TTL', async () => {
  const { client, journeyId } = await fixture()
  const first = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  await prepareQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', providerId: 'codex' }, client)
  await client.qualityJourneyCoordinatorHandoff.update({
    where: { id: first.handoffId },
    data: { expiresAt: new Date(0) },
  })

  await expect(
    launchQualityJourneyHandoff(
      { handoffId: first.handoffId, journeyId, targetProjectId: 'target-handoff' },
      { id: 'codex', launch: vi.fn() },
      client,
    ),
  ).rejects.toThrow('expired')
  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: first.handoffId } }),
  ).resolves.toMatchObject({ status: 'EXPIRED', failureCode: 'HANDOFF_SUPERSEDED' })
})

it('does not let a pending provider overwrite a replacement handoff', async () => {
  const { client, journeyId } = await fixture()
  const first = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  let finishLaunch!: () => void
  let signalLaunchStarted!: () => void
  const launchStarted = new Promise<void>(resolve => (signalLaunchStarted = resolve))
  const launching = launchQualityJourneyHandoff(
    { handoffId: first.handoffId, journeyId, targetProjectId: 'target-handoff' },
    {
      id: 'codex',
      launch: () => {
        signalLaunchStarted()
        return new Promise(resolve => (finishLaunch = () => resolve({ outcome: 'LAUNCHED' })))
      },
    },
    client,
  )
  await launchStarted
  await client.qualityJourneyCoordinatorHandoff.update({
    where: { id: first.handoffId },
    data: { expiresAt: new Date(0) },
  })
  await prepareQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', providerId: 'codex' }, client)
  finishLaunch()

  await expect(launching).rejects.toThrow('superseded')
  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: first.handoffId } }),
  ).resolves.toMatchObject({ status: 'EXPIRED', failureCode: 'HANDOFF_SUPERSEDED' })
})

it('does not launch a second coordinator while the same handoff is awaiting redemption', async () => {
  const { client, journeyId } = await fixture()
  const prepared = await prepareQualityJourneyHandoff(
    { journeyId, targetProjectId: 'target-handoff', providerId: 'codex' },
    client,
  )
  let finishLaunch!: () => void
  let signalLaunchStarted!: () => void
  const launchStarted = new Promise<void>(resolve => (signalLaunchStarted = resolve))
  const launch = vi.fn().mockImplementation(() => {
    signalLaunchStarted()
    return new Promise(resolve => (finishLaunch = () => resolve({ outcome: 'LAUNCHED' as const })))
  })
  const provider: CoordinatorProvider = { id: 'codex', launch }
  const input = { handoffId: prepared.handoffId, journeyId, targetProjectId: 'target-handoff' }

  const firstLaunch = launchQualityJourneyHandoff(input, provider, client)
  await launchStarted
  await expect(launchQualityJourneyHandoff(input, provider, client)).resolves.toMatchObject({ status: 'LAUNCHING' })
  expect(launch).toHaveBeenCalledTimes(1)
  finishLaunch()
  await expect(firstLaunch).resolves.toMatchObject({ status: 'LAUNCHED' })
})

it('prepares handoffs only while requirement analysis is active', async () => {
  const { client, journeyId } = await fixture()
  await client.qualityJourney.update({ where: { id: journeyId }, data: { stage: 'DISCOVERY' } })
  await expect(
    prepareQualityJourneyHandoff({ journeyId, targetProjectId: 'target-handoff', providerId: 'codex' }, client),
  ).rejects.toThrow('before or during requirement analysis')
})
