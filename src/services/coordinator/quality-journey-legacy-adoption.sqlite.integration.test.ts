import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { copyMigratedTestDatabase, createTargetProjectFixture } from '@/test/migrated-test-database'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import {
  adoptUnownedLegacyQualityJourneyCoordinatorSession as adopt,
  readUnownedLegacyQualityJourneyAdoptionSnapshot as review,
  registerQualityJourneyCoordinatorSession as register,
  type AdoptUnownedLegacyQualityJourneyCoordinatorSessionInput,
} from './quality-journey-session-service'
import { createQualityJourney, submitDurableQualityJourneyCommand } from './quality-journey-service'
import { pauseQualityJourneyOperational as pause } from './quality-journey-recovery-service'
import { approveQualityJourneyHandoffTakeover, redeemQualityJourneyHandoff } from './quality-journey-handoff-service'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const principalId = 'project:legacy-adoption'
const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

async function fixture(ownershipVersion = 0) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-legacy-adoption-'))
  const databasePath = path.join(workspace, 'test.db')
  await copyMigratedTestDatabase(databasePath)
  const connections: PrismaClient[] = []
  const connect = () => {
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    connections.push(client)
    return client
  }
  const client = connect()
  cleanups.push(async () => {
    await Promise.all(connections.map(connection => connection.$disconnect()))
    await fs.rm(workspace, { recursive: true, force: true })
  })
  const targetProjectId = 'blogen-target'
  await createTargetProjectFixture(client, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${workspace}`,
    canonicalPath: workspace,
    displayName: 'Blogen',
    fingerprint: hash(workspace),
  })
  const created = await createQualityJourney(
    { targetProjectId, idempotencyKey: 'blogen-legacy', requirement: { objective: 'Assess Blogen' } },
    client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId }
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...scope,
      commandId: 'submit-legacy',
      idempotencyKey: 'submit-legacy',
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      inputArtifactRefs: [],
      payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
    },
    client,
  )
  // Imported M03 no-session classification, with an unredeemed launch-requested Desktop ticket.
  await client.qualityJourney.update({
    where: { id: scope.journeyId },
    data: { hostingProvenance: 'M03_SQL_V1:EMPTY_NO_SESSION', ownershipVersion },
  })
  const ticket = 'unredeemed-blogen-ticket'
  await client.qualityJourneyCoordinatorHandoff.create({
    data: {
      id: 'blogen-desktop',
      ...scope,
      providerId: 'codex',
      generation: 7,
      status: 'LAUNCHED',
      ticketHash: `sha256:${createHash('sha256').update(ticket).digest('hex')}`,
      promptHash: hash('historical-prompt'),
      takeoverApprovalHash: `sha256:${createHash('sha256').update('old-approval').digest('hex')}`,
      takeoverRequestHash: `sha256:${createHash('sha256').update('old-request').digest('hex')}`,
      takeoverApprovalExpiresAt: new Date(Date.now() + 60_000),
      expiresAt: new Date(Date.now() + 60_000),
      launchedAt: new Date(),
    },
  })
  const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  await pause(
    {
      ...scope,
      expectedStateHash: journey.stateHash,
      expectedVersion: journey.version,
      idempotencyKey: 'pause',
      reason: 'Adopt Blogen',
    },
    client,
  )
  const input = async (key = 'adopt'): Promise<AdoptUnownedLegacyQualityJourneyCoordinatorSessionInput> => {
    const snapshot = await review(scope, client)
    const successor = await register(
      { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: key },
      client,
    )
    return {
      ...scope,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      coordinatorPrincipalId: principalId,
      requestId: key,
      successorSessionId: successor.session.id,
      expectedVersion: snapshot.expectedVersion,
      expectedStateHash: snapshot.expectedStateHash,
      expectedOwnershipVersion: snapshot.expectedOwnershipVersion,
      reconciliationReceiptId: snapshot.reconciliationReceiptId!,
      expectedAdoptionSnapshotHash: snapshot.adoptionSnapshotHash,
      approvedAt: new Date().toISOString(),
      approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
  }
  return { client, connect, scope, input, ticket }
}

async function history(client: PrismaClient) {
  return {
    revisions: await client.qualityJourneyRevision.findMany(),
    cycles: await client.qualityJourneyCycle.findMany(),
    commands: await client.qualityJourneyCommand.findMany(),
    events: await client.qualityJourneyEvent.findMany(),
    artifacts: await client.qualityJourneyArtifact.findMany(),
    work: await client.qualityJourneyWorkItem.findMany(),
    authorizations: await client.qualityJourneyWorkAuthorization.findMany(),
    attempts: await client.qualityJourneyWorkAttempt.findMany(),
    bindings: await client.qualityJourneyWorkAttemptSessionBinding.findMany(),
    runs: await client.qualityJourneyProviderRun.findMany(),
    intents: await client.qualityJourneyProviderDispatchIntent.findMany(),
  }
}
async function state(client: PrismaClient) {
  return {
    history: await history(client),
    journeys: await client.qualityJourney.findMany(),
    sessions: await client.qualityJourneyCoordinatorSession.findMany(),
    handoffs: await client.qualityJourneyCoordinatorHandoff.findMany(),
  }
}

describe('explicit unowned legacy Journey adoption', () => {
  it('adopts the paused Blogen shape, preserves all history and fences the old launch-requested ticket', async () => {
    const f = await fixture()
    const input = await f.input()
    const before = await history(f.client)
    const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    expect(journey).toMatchObject({ stage: 'ANALYSIS', status: 'PAUSED', ownershipVersion: 0 })
    expect(before.work).toHaveLength(1)
    expect(before.work[0]).toMatchObject({ currentAttempt: 0, status: 'REPLACEMENT_REQUESTED' })
    expect(before.authorizations).toHaveLength(1)
    expect(before.attempts).toHaveLength(0)
    const result = await adopt(input, f.client)
    expect(result).toMatchObject({
      coordinatorGeneration: 8,
      ownershipVersion: 1,
      predecessorSessionId: null,
      current: true,
      replayed: false,
    })
    expect(await history(f.client)).toEqual(before)
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toEqual({
      ...journey,
      hostingMode: 'APP_SERVER_LOCAL_V1',
      hostingProvenance: 'EXPLICIT_UNOWNED_LEGACY_ADOPTION_V1',
      hostingContractVersion: 2,
      currentCoordinatorSessionId: input.successorSessionId,
      ownershipVersion: 1,
      e2AdmissionVersion: journey.e2AdmissionVersion + 1,
    })
    await expect(redeemQualityJourneyHandoff({ ...f.scope, ticket: f.ticket }, f.client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(
      approveQualityJourneyHandoffTakeover(
        {
          ...f.scope,
          handoffId: 'blogen-desktop',
          generation: 7,
          takeoverApproval: 'old-approval',
          takeoverRequestId: 'old-request',
          approvedBy: 'local-ui',
        },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await f.client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: 'blogen-desktop' } }),
    ).toMatchObject({ status: 'FENCED', fenceReason: `EXPLICIT_HOSTING_TRANSFER:${input.successorSessionId}` })
    const committed = await state(f.client)
    await expect(adopt(input, f.client)).resolves.toEqual({ ...result, replayed: true })
    expect(await state(f.client)).toEqual(committed)
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    try {
      await expect(adopt(input, f.client)).resolves.toEqual({ ...result, replayed: true })
    } finally {
      now.mockRestore()
    }
    await expect(adopt({ ...input, requestId: 'changed' }, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await state(f.client)).toEqual(committed)
  })

  it.each([
    'state',
    'version',
    'ownership',
    'receipt',
    'handoff',
    'handoff-expiry',
    'new-handoff',
    'snapshot',
    'expired',
    'long-window',
    'authority',
    'principal',
  ])('rejects stale or unauthorized review without mutating state (%s)', async kind => {
    const f = await fixture()
    const input = await f.input()
    if (kind === 'state') input.expectedStateHash = hash('stale')
    if (kind === 'version') input.expectedVersion--
    if (kind === 'ownership') input.expectedOwnershipVersion++
    if (kind === 'receipt') input.reconciliationReceiptId = 'old-cleanup'
    if (kind === 'snapshot') input.expectedAdoptionSnapshotHash = hash('stale-snapshot')
    if (kind === 'expired') input.approvalExpiresAt = new Date(Date.now() - 1).toISOString()
    if (kind === 'long-window') input.approvalExpiresAt = new Date(Date.now() + 600_000).toISOString()
    if (kind === 'authority') input.authority = Symbol('forged') as typeof trustedHumanCoordinatorSession
    if (kind === 'principal') input.coordinatorPrincipalId = 'project:foreign'
    if (kind === 'handoff')
      await f.client.qualityJourneyCoordinatorHandoff.update({
        where: { id: 'blogen-desktop' },
        data: { status: 'EXPIRED' },
      })
    if (kind === 'handoff-expiry')
      await f.client.qualityJourneyCoordinatorHandoff.update({
        where: { id: 'blogen-desktop' },
        data: { expiresAt: new Date(Date.now() + 120_000) },
      })
    if (kind === 'new-handoff') {
      const old = await f.client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: 'blogen-desktop' } })
      await f.client.qualityJourneyCoordinatorHandoff.create({
        data: { ...old, id: 'new-desktop', generation: 9, ticketHash: hash('new-ticket') },
      })
    }
    const before = await state(f.client)
    await expect(adopt(input, f.client)).rejects.toMatchObject({
      code: ['authority', 'principal'].includes(kind) ? 'UNAUTHORIZED' : 'CONFLICT',
    })
    expect(await state(f.client)).toEqual(before)
  })

  it.each([
    'active',
    'unresolved',
    'reserved-native',
    'owned-session',
    'connected',
    'approved',
    'unknown-handoff',
    'attempt',
    'consumed-work',
    'global-slot',
    'browser',
    'cleanup',
  ])('refuses unsafe adoption with unchanged history (%s)', async kind => {
    const f = await fixture()
    if (kind === 'active')
      await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { status: 'ACTIVE' } })
    if (kind === 'unresolved')
      await f.client.qualityJourney.update({
        where: { id: f.scope.journeyId },
        data: { hostingMode: 'LEGACY_UNRESOLVED' },
      })
    if (kind === 'reserved-native')
      await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { e2NativeStartsReserved: 1 } })
    if (kind === 'connected')
      await f.client.qualityJourneyCoordinatorHandoff.update({
        where: { id: 'blogen-desktop' },
        data: { status: 'CONNECTED', connectedAt: new Date() },
      })
    if (kind === 'approved')
      await f.client.qualityJourneyCoordinatorHandoff.update({
        where: { id: 'blogen-desktop' },
        data: { takeoverApprovedAt: new Date(), takeoverApprovedBy: 'local-ui' },
      })
    if (kind === 'unknown-handoff')
      await f.client.qualityJourneyCoordinatorHandoff.update({
        where: { id: 'blogen-desktop' },
        data: { status: 'UNKNOWN' },
      })
    if (kind === 'attempt') {
      const work = await f.client.qualityJourneyWorkItem.findFirstOrThrow()
      await f.client.qualityJourneyWorkAttempt.create({
        data: {
          id: 'spent-attempt',
          workItemId: work.id,
          attempt: 1,
          status: 'CANCELLED',
          leaseId: 'spent-lease',
          ownerTokenHash: hash('owner'),
          leaseExpiresAt: new Date(),
          heartbeatSeconds: 30,
        },
      })
    }
    if (kind === 'consumed-work') {
      const work = await f.client.qualityJourneyWorkItem.findFirstOrThrow()
      await f.client.qualityJourneyWorkItem.update({ where: { id: work.id }, data: { currentAttempt: 1 } })
    }
    if (kind === 'global-slot')
      await f.client.qualityJourneyProviderSlot.create({ data: { id: 'HUB', reservedAt: new Date() } })
    if (kind === 'browser')
      await f.client.qualityJourneyOwnedBrowser.create({
        data: {
          id: 'unknown-browser',
          ...f.scope,
          sessionId: 'unknown-browser',
          processInstanceId: 'old-process',
          generation: 1,
          status: 'UNKNOWN',
        },
      })
    if (kind === 'cleanup') {
      const event = await f.client.qualityJourneyEvent.findFirstOrThrow({
        where: { ...f.scope, eventType: 'OPERATIONAL_PAUSE_CLEANUP' },
      })
      const payload = JSON.parse(event.payloadJson)
      payload.cleanup.managedTurn = 'UNKNOWN'
      payload.observationHash = hash(payload.cleanup)
      await f.client.qualityJourneyEvent.create({
        data: {
          ...event,
          id: 'unknown-cleanup',
          sequence: event.sequence + 1,
          payloadJson: canonicalContractJson(payload),
        },
      })
    }
    // Unresolved hosting cannot register a successor, so prepare it before setting that mode.
    if (kind === 'unresolved')
      await f.client.qualityJourney.update({
        where: { id: f.scope.journeyId },
        data: { hostingMode: 'EXTERNAL_LEGACY' },
      })
    let input = await f.input()
    if (kind === 'unresolved') {
      await f.client.qualityJourney.update({
        where: { id: f.scope.journeyId },
        data: { hostingMode: 'LEGACY_UNRESOLVED' },
      })
      const snapshot = await review(f.scope, f.client)
      input = { ...input, expectedAdoptionSnapshotHash: snapshot.adoptionSnapshotHash }
    }
    if (kind === 'owned-session') {
      await f.client.qualityJourneyCoordinatorSession.update({
        where: { id: input.successorSessionId },
        data: { generation: 3, status: 'FENCED', fencedAt: new Date() },
      })
    }
    const before = await state(f.client)
    await expect(adopt(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await state(f.client)).toEqual(before)
  })

  it('selects one atomic adoption winner across independent SQLite clients', async () => {
    const f = await fixture()
    const left = await f.input('left')
    const right = await f.input('right')
    const before = await history(f.client)
    const results = await Promise.allSettled([adopt(left, f.client), adopt(right, f.connect())])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await history(f.client)).toEqual(before)
    expect(await f.client.qualityJourneyCoordinatorSession.count({ where: { status: 'ACTIVE' } })).toBe(1)
    expect(await f.client.qualityJourneyCoordinatorSession.count({ where: { status: 'REGISTERED' } })).toBe(1)
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toMatchObject({
      ownershipVersion: 1,
    })
  })

  it('does not mistake a compatibility mutation ownership counter for prior session ownership', async () => {
    const f = await fixture(1)
    await expect(adopt(await f.input(), f.client)).resolves.toMatchObject({
      ownershipVersion: 2,
      coordinatorGeneration: 8,
    })
  })
})
