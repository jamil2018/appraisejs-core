import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { copyMigratedTestDatabase, createTargetProjectFixture } from '@/test/migrated-test-database'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import {
  assertCoordinatorMutationSession,
  assertCurrentCoordinatorSession,
  trustedHumanCoordinatorSession,
} from './quality-journey-coordinator-session'
import {
  activateQualityJourneyCoordinatorSession as activate,
  registerQualityJourneyCoordinatorSession as register,
  transferQualityJourneyCoordinatorSession as transfer,
  type TransferQualityJourneyCoordinatorSessionInput,
} from './quality-journey-session-service'
import {
  createQualityJourney,
  cancelQualityJourneyWork,
  claimExternalQualityJourneyWork,
} from './quality-journey-service'
import {
  pauseQualityJourneyOperational as pause,
  resumeQualityJourneyOperational as resume,
} from './quality-journey-recovery-service'
import { readOwnedJourneyTurnDatabaseIdentity, registerOwnedQualityJourneyTurn } from './quality-journey-owned-turns'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
} from './quality-journey-provider-run-service'

type HostingMode = 'APP_SERVER_LOCAL_V1' | 'EXTERNAL_LEGACY'
type Scope = { journeyId: string; targetProjectId: string }
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const principalId = 'project:m12-human'
const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-m12-transfer-'))
  const databasePath = path.join(workspace, 'test.db')
  await copyMigratedTestDatabase(databasePath)
  const clients: PrismaClient[] = []
  const connect = () => {
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    clients.push(client)
    return client
  }
  const client = connect()
  cleanups.push(async () => {
    await Promise.all(clients.map(connection => connection.$disconnect()))
    await fs.rm(workspace, { recursive: true, force: true })
  })
  const targetProjectId = 'm12-target'
  await createTargetProjectFixture(client, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${workspace}`,
    canonicalPath: workspace,
    displayName: 'Mode transfer',
    fingerprint: hash(workspace),
  })
  const created = await createQualityJourney(
    {
      targetProjectId,
      idempotencyKey: 'managed',
      requirement: { objective: 'Transfer safely' },
      hostingMode: 'APP_SERVER_LOCAL_V1',
    },
    client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId }
  const initial = await register(
    { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'initial' },
    client,
  )
  const initialInput = {
    ...scope,
    authority: trustedHumanCoordinatorSession as typeof trustedHumanCoordinatorSession,
    approvedBy: 'local-ui' as const,
    coordinatorPrincipalId: principalId,
    requestId: 'activate',
    expectedOwnershipVersion: 0,
    expectedStateHash: created.journey.stateHash,
    coordinatorSessionId: initial.session.id,
  }
  await activate(initialInput, client)
  return { client, connect, databasePath, scope, initial, initialInput }
}

async function pauseCurrent(scope: Scope, client: PrismaClient, key = 'pause') {
  const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  await pause(
    {
      ...scope,
      expectedStateHash: journey.stateHash,
      expectedVersion: journey.version,
      idempotencyKey: key,
      reason: 'Mode transfer decision',
    },
    client,
  )
  return client.qualityJourneyEvent.findFirstOrThrow({
    where: { ...scope, eventType: 'OPERATIONAL_PAUSE_CLEANUP' },
    orderBy: { sequence: 'desc' },
  })
}

async function transferInput(
  scope: Scope,
  client: PrismaClient,
  targetHostingMode: HostingMode,
  key = 'transfer',
  owner = principalId,
): Promise<TransferQualityJourneyCoordinatorSessionInput> {
  const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  const predecessor = await client.qualityJourneyCoordinatorSession.findUniqueOrThrow({
    where: { id: journey.currentCoordinatorSessionId! },
  })
  const successor = await register(
    { ...scope, ownerPrincipalId: owner, hostKind: targetHostingMode, idempotencyKey: `${key}-successor` },
    client,
  )
  const receipt = await client.qualityJourneyEvent.findFirst({
    where: { ...scope, eventType: 'OPERATIONAL_PAUSE_CLEANUP' },
    orderBy: { sequence: 'desc' },
  })
  return {
    ...scope,
    authority: trustedHumanCoordinatorSession,
    approvedBy: 'local-ui',
    coordinatorPrincipalId: owner,
    expectedStateHash: journey.stateHash,
    expectedOwnershipVersion: journey.ownershipVersion,
    predecessorSessionId: predecessor.id,
    predecessorGeneration: predecessor.generation!,
    successorSessionId: successor.session.id,
    requestId: key,
    reconciliationReceiptId: receipt?.id ?? 'missing-cleanup',
    targetHostingMode,
  }
}

async function ownership(scope: Scope, client: PrismaClient) {
  return {
    journey: await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } }),
    sessions: await client.qualityJourneyCoordinatorSession.findMany({ where: scope, orderBy: { id: 'asc' } }),
  }
}

type CleanupPayload = {
  pauseEventId: string
  observationHash: string
  cleanup: {
    managedTurn: string
    managedTurnReceipts: Array<{
      attemptId: string
      transportId: string
      stopRequested: boolean
      senderFenced: boolean
      ownedProcessExitObserved: boolean
      privateRootRemoved: boolean
    }>
    browser: string
    execution: string
  }
}

async function appendCleanupFixture(scope: Scope, client: PrismaClient, rewrite: (payload: CleanupPayload) => void) {
  const event = await client.qualityJourneyEvent.findFirstOrThrow({
    where: { ...scope, eventType: 'OPERATIONAL_PAUSE_CLEANUP' },
    orderBy: { sequence: 'desc' },
  })
  const originalPause = await client.qualityJourneyEvent.findFirstOrThrow({
    where: { ...scope, eventType: 'OPERATIONAL_PAUSE' },
    orderBy: { sequence: 'desc' },
  })
  const payload = JSON.parse(event.payloadJson) as CleanupPayload
  rewrite(payload)
  const pausePayload = JSON.parse(originalPause.payloadJson)
  pausePayload.cleanupTargets.managedAttemptIds = payload.cleanup.managedTurnReceipts.map(receipt => receipt.attemptId)
  const pauseId = `fixture-pause:${event.id}`
  const sequence = await client.qualityJourneyEvent.count({ where: { journeyId: scope.journeyId } })
  // Immutable history stays intact; these appended rows model corrupt/missing imported observations.
  await client.qualityJourneyEvent.create({
    data: {
      ...originalPause,
      id: pauseId,
      sequence: sequence + 1,
      payloadJson: canonicalContractJson(pausePayload),
    },
  })
  payload.pauseEventId = pauseId
  await client.qualityJourneyEvent.create({
    data: {
      ...event,
      id: `fixture-cleanup:${event.id}`,
      sequence: sequence + 2,
      payloadJson: canonicalContractJson(payload),
    },
  })
}

describe('M12 explicit hosting mode transfer', () => {
  it('transfers both ways through fresh successors and replays lost replies after client reconstruction', async () => {
    const f = await fixture()
    await pauseCurrent(f.scope, f.client)
    const outward = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
    const before = await ownership(f.scope, f.client)
    expect(before.journey.hostingContractVersion).toBe(1)
    await transfer(outward, f.client) // Discard the first reply, then reconstruct the client.
    await f.client.$disconnect()
    const restarted = f.connect()
    await expect(transfer(outward, restarted)).resolves.toMatchObject({
      replayed: true,
      current: true,
      coordinatorGeneration: 2,
    })
    const externalCredentials = {
      ...f.scope,
      coordinatorSessionId: outward.successorSessionId,
      coordinatorGeneration: 2,
      coordinatorPrincipalId: principalId,
    }
    await expect(assertCurrentCoordinatorSession(externalCredentials, restarted)).resolves.toMatchObject({
      session: { hostKind: 'EXTERNAL_LEGACY' },
    })
    for (const coordinatorPrincipalId of [undefined, 'project:foreign']) {
      await expect(
        assertCurrentCoordinatorSession({ ...externalCredentials, coordinatorPrincipalId }, restarted),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    }
    const external = await restarted.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    expect(external).toMatchObject({
      hostingMode: 'EXTERNAL_LEGACY',
      hostingContractVersion: 2,
      status: 'PAUSED',
      stateHash: before.journey.stateHash,
      version: before.journey.version,
    })
    await resume(
      {
        ...f.scope,
        expectedStateHash: external.stateHash,
        expectedVersion: external.version,
        idempotencyKey: 'resume-external',
      },
      restarted,
    )
    await expect(
      assertCoordinatorMutationSession(
        { ...externalCredentials, coordinatorSessionId: f.initial.session.id, coordinatorGeneration: 1 },
        f.scope,
        restarted,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await pauseCurrent(f.scope, restarted, 'pause-reverse')
    const inward = await transferInput(f.scope, restarted, 'APP_SERVER_LOCAL_V1', 'reverse')
    await expect(transfer(inward, restarted)).resolves.toMatchObject({
      coordinatorGeneration: 3,
      predecessorSessionId: outward.successorSessionId,
    })
    expect(
      (await restarted.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).hostingContractVersion,
    ).toBe(2)
    await expect(transfer(outward, restarted)).resolves.toMatchObject({
      replayed: true,
      current: false,
      coordinatorGeneration: 2,
    })
    await expect(activate(f.initialInput, restarted)).resolves.toMatchObject({
      replayed: true,
      current: false,
      coordinatorGeneration: 1,
    })
    await expect(
      transfer({ ...outward, reconciliationReceiptId: inward.reconciliationReceiptId }, restarted),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const sessions = await restarted.qualityJourneyCoordinatorSession.findMany({ where: f.scope })
    expect(sessions.filter(session => session.status === 'FENCED')).toHaveLength(2)
    expect(sessions.find(session => session.id === inward.successorSessionId)).toMatchObject({
      status: 'ACTIVE',
      generation: 3,
    })
  })

  it('replays a committed mode change in a fresh process without a new generation or work', async () => {
    const f = await fixture()
    await pauseCurrent(f.scope, f.client)
    const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
    await transfer(input, f.client) // Simulate loss of the committed reply.
    const before = await ownership(f.scope, f.client)
    const script = `
      import { readFileSync } from 'node:fs';
      import { PrismaClient } from '@prisma/client';
      import { trustedHumanCoordinatorSession } from './src/services/coordinator/quality-journey-coordinator-session.ts';
      import { transferQualityJourneyCoordinatorSession } from './src/services/coordinator/quality-journey-session-service.ts';
      const { input, databaseUrl } = JSON.parse(readFileSync(0, 'utf8'));
      const client = new PrismaClient({datasources:{db:{url:databaseUrl}}});
      try {
        const result = await transferQualityJourneyCoordinatorSession({...input,authority:trustedHumanCoordinatorSession},client);
        console.log(JSON.stringify({result,attempts:await client.qualityJourneyWorkAttempt.count(),intents:await client.qualityJourneyProviderDispatchIntent.count()}));
      } finally { await client.$disconnect(); }
    `
    const result = JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30_000,
        input: JSON.stringify({ input, databaseUrl: `file:${f.databasePath}` }),
      })
        .trim()
        .split('\n')
        .at(-1)!,
    )
    expect(result).toMatchObject({
      result: { replayed: true, current: true, coordinatorGeneration: 2 },
      attempts: 0,
      intents: 0,
    })
    expect(await ownership(f.scope, f.client)).toEqual(before)
  })

  it.each(['ACTIVE', 'snapshot', 'ownership', 'human', 'principal', 'generation', 'receipt'])(
    'rejects stale or unapproved mode transfer (%s) without partial fencing',
    async kind => {
      const f = await fixture()
      if (kind !== 'ACTIVE') await pauseCurrent(f.scope, f.client)
      const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
      const invalid = {
        ...input,
        ...(kind === 'snapshot' ? { expectedStateHash: 'stale' } : {}),
        ...(kind === 'ownership' ? { expectedOwnershipVersion: 0 } : {}),
        ...(kind === 'human' ? { authority: Symbol('forged') as typeof trustedHumanCoordinatorSession } : {}),
        ...(kind === 'principal' ? { coordinatorPrincipalId: 'foreign' } : {}),
        ...(kind === 'generation' ? { predecessorGeneration: 0 } : {}),
        ...(kind === 'receipt' ? { reconciliationReceiptId: 'human:arbitrary' } : {}),
      }
      const before = await ownership(f.scope, f.client)
      await expect(transfer(invalid, f.client)).rejects.toMatchObject({
        code: ['human', 'principal', 'generation'].includes(kind) ? 'UNAUTHORIZED' : 'CONFLICT',
      })
      expect(await ownership(f.scope, f.client)).toEqual(before)
    },
  )

  it('rejects unsupported persisted hosting contracts across canonical services without writes', async () => {
    const f = await fixture()
    await pauseCurrent(f.scope, f.client)
    const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
    await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { hostingContractVersion: 99 } })
    const credentials = {
      ...f.scope,
      coordinatorSessionId: f.initial.session.id,
      coordinatorGeneration: 1,
      coordinatorPrincipalId: principalId,
    }
    const before = await ownership(f.scope, f.client)
    await expect(assertCurrentCoordinatorSession(credentials, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      f.client.$transaction(tx => assertCoordinatorMutationSession(credentials, f.scope, tx)),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(transfer(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(activate(f.initialInput, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      register(
        {
          ...f.scope,
          ownerPrincipalId: principalId,
          hostKind: 'APP_SERVER_LOCAL_V1',
          idempotencyKey: 'unknown-contract-registration',
        },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      pause(
        {
          ...f.scope,
          expectedStateHash: before.journey.stateHash,
          expectedVersion: before.journey.version,
          idempotencyKey: 'unknown-contract-pause',
          reason: 'No compatible contract',
        },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      resume(
        {
          ...f.scope,
          expectedStateHash: before.journey.stateHash,
          expectedVersion: before.journey.version,
          idempotencyKey: 'unknown-contract-resume',
        },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await ownership(f.scope, f.client)).toEqual(before)
  })

  it('selects one transfer winner across independent SQLite clients', async () => {
    const f = await fixture()
    await pauseCurrent(f.scope, f.client)
    const left = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY', 'left')
    const right = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY', 'right')
    const outcomes = await Promise.allSettled([transfer(left, f.client), transfer(right, f.connect())])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const state = await ownership(f.scope, f.client)
    expect(state.journey.ownershipVersion).toBe(2)
    expect(state.sessions.filter(session => session.status === 'ACTIVE')).toHaveLength(1)
    expect(state.sessions.filter(session => session.status === 'FENCED')).toHaveLength(1)
    expect(state.sessions.filter(session => session.status === 'REGISTERED')).toHaveLength(1)
  })

  it.each([
    'missing',
    'hash',
    'managed-unknown',
    'empty-observed',
    'sender',
    'process',
    'private-root',
    'captured-none',
    'browser',
    'execution',
  ])('blocks incomplete durable cleanup (%s)', async kind => {
    const f = await fixture()
    if (kind === 'missing')
      await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { status: 'PAUSED' } })
    else {
      await pauseCurrent(f.scope, f.client)
      await appendCleanupFixture(f.scope, f.client, payload => {
        if (kind === 'hash') payload.observationHash = hash('wrong')
        else {
          if (kind === 'managed-unknown') payload.cleanup.managedTurn = 'UNKNOWN'
          else if (kind === 'empty-observed') payload.cleanup.managedTurn = 'OBSERVED'
          else if (kind === 'browser') payload.cleanup.browser = 'UNKNOWN'
          else if (kind === 'execution') payload.cleanup.execution = 'REQUESTED'
          else {
            payload.cleanup.managedTurn = kind === 'captured-none' ? 'NONE_REGISTERED' : 'OBSERVED'
            payload.cleanup.managedTurnReceipts = [
              {
                attemptId: 'captured',
                transportId: 'original-turn',
                stopRequested: true,
                senderFenced: kind !== 'sender',
                ownedProcessExitObserved: kind !== 'process',
                privateRootRemoved: kind !== 'private-root',
              },
            ]
          }
          payload.observationHash = hash(payload.cleanup)
        }
      })
    }
    const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
    const before = await ownership(f.scope, f.client)
    await expect(transfer(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await ownership(f.scope, f.client)).toEqual(before)
  })

  it.each(['cleanup', 'global-slot', 'orphan-slot', 'operational-version'])(
    'does not bypass cleanup or global exclusion using the older same-host API (%s)',
    async kind => {
      const f = await fixture()
      if (kind !== 'global-slot' && kind !== 'orphan-slot') await pauseCurrent(f.scope, f.client)
      if (kind === 'cleanup')
        await appendCleanupFixture(f.scope, f.client, payload => {
          payload.cleanup.managedTurn = 'UNKNOWN'
          payload.observationHash = hash(payload.cleanup)
        })
      if (kind === 'global-slot')
        await f.client.qualityJourneyProviderSlot.create({ data: { id: 'HUB', sendBoundaryId: 'global-unknown' } })
      if (kind === 'orphan-slot')
        await f.client.qualityJourneyProviderSlot.create({ data: { id: 'HUB', reservedAt: new Date() } })
      if (kind === 'operational-version')
        await f.client.qualityJourney.update({ where: { id: f.scope.journeyId }, data: { version: { increment: 1 } } })
      const input = await transferInput(f.scope, f.client, 'APP_SERVER_LOCAL_V1')
      delete input.targetHostingMode
      const before = await ownership(f.scope, f.client)
      await expect(transfer(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await ownership(f.scope, f.client)).toEqual(before)
    },
  )

  it('fences every old Desktop handoff and advances beyond all historical generations', async () => {
    const f = await fixture()
    await f.client.qualityJourneyCoordinatorHandoff.create({
      data: {
        id: 'old-desktop',
        ...f.scope,
        providerId: 'codex',
        generation: 7,
        ticketHash: hash('ticket'),
        promptHash: hash('prompt'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await pauseCurrent(f.scope, f.client)
    const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY')
    await expect(transfer(input, f.client)).resolves.toMatchObject({ coordinatorGeneration: 8 })
    expect(
      await f.client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: 'old-desktop' } }),
    ).toMatchObject({ status: 'FENCED', fenceReason: `EXPLICIT_HOSTING_TRANSFER:${input.successorSessionId}` })
  })

  it('supports a human transfer from an authenticated current mapped legacy owner without adopting its synthetic principal', async () => {
    const f = await fixture()
    // Model the pre-M12 durable handoff representation, including its synthetic session owner.
    await f.client.qualityJourneyCoordinatorHandoff.create({
      data: {
        id: 'mapped-desktop',
        ...f.scope,
        providerId: 'codex',
        generation: 1,
        status: 'CONNECTED',
        takeoverAt: new Date(),
        ticketHash: hash('mapped-ticket'),
        promptHash: hash('mapped-prompt'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await f.client.qualityJourneyCoordinatorSession.update({
      where: { id: f.initial.session.id },
      data: {
        hostKind: 'EXTERNAL_LEGACY',
        legacyHandoffId: 'mapped-desktop',
        ownerPrincipalId: 'legacy-handoff:mapped-desktop',
        provenance: 'EXPLICIT_LEGACY_HANDOFF_TAKEOVER_V1',
      },
    })
    await f.client.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { hostingMode: 'EXTERNAL_LEGACY', hostingProvenance: 'EXPLICIT_LEGACY_HANDOFF_TAKEOVER_V1' },
    })
    await pauseCurrent(f.scope, f.client)
    const input = await transferInput(f.scope, f.client, 'APP_SERVER_LOCAL_V1')
    await expect(transfer(input, f.client)).resolves.toMatchObject({ coordinatorGeneration: 2 })
    expect(
      await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: input.successorSessionId } }),
    ).toMatchObject({ ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1' })
  })

  it('does not let a foreign principal take over a nonmapped external successor', async () => {
    const f = await fixture()
    await pauseCurrent(f.scope, f.client)
    await transfer(await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY'), f.client)
    const foreign = await transferInput(f.scope, f.client, 'APP_SERVER_LOCAL_V1', 'foreign-reverse', 'project:foreign')
    await expect(transfer(foreign, f.client)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('preserves authorization budgets, consumed attempts and immutable session bindings', async () => {
    const f = await createProviderFixture()
    cleanups.push(f.cleanup)
    await cancelQualityJourneyWork(
      { ...f.credentials, workItemId: f.binding.workItemId, actor: 'USER', reason: 'Reconcile before mode transfer' },
      f.client,
    )
    await pauseCurrent(f.scope, f.client)
    const input = await transferInput(f.scope, f.client, 'EXTERNAL_LEGACY', 'budget-transfer', f.principal.principalId)
    const snapshot = async () => ({
      authorizations: await f.client.qualityJourneyWorkAuthorization.findMany(),
      attempts: await f.client.qualityJourneyWorkAttempt.findMany(),
      bindings: await f.client.qualityJourneyWorkAttemptSessionBinding.findMany(),
    })
    const before = await snapshot()
    expect(before.attempts).toHaveLength(1)
    expect(before.bindings).toHaveLength(1)
    await transfer(input, f.client)
    expect(await snapshot()).toEqual(before)
    const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await resume(
      {
        ...f.scope,
        expectedStateHash: journey.stateHash,
        expectedVersion: journey.version,
        idempotencyKey: 'resume-budget',
      },
      f.client,
    )
    await expect(
      claimExternalQualityJourneyWork({ ...f.claimRequest, idempotencyKey: 'stale-predecessor-new-claim' }, f.client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await snapshot()).toEqual(before)
  })

  it.each([true, false])(
    'requires the original captured supervisor cleanup, including after handle loss (retained=%s)',
    async retained => {
      const f = await createProviderFixture()
      cleanups.push(f.cleanup)
      await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
      const owned = {
        ...f.scope,
        attemptId: f.binding.attemptId,
        transportId: 'original-supervisor',
        databaseIdentity: await readOwnedJourneyTurnDatabaseIdentity(f.client),
        cancel: async () => ({
          fenced: true,
          completed: true,
          cleanup: { groupExitObserved: true, privateRootRemoved: true },
        }),
      }
      if (retained) registerOwnedQualityJourneyTurn(owned)
      const observation = await pauseCurrent(f.scope, f.client)
      expect(JSON.parse(observation.payloadJson).cleanup.managedTurn).toBe(retained ? 'OBSERVED' : 'UNKNOWN')
      const input = await transferInput(
        f.scope,
        f.client,
        'EXTERNAL_LEGACY',
        'captured-transfer',
        f.principal.principalId,
      )
      if (retained)
        await expect(transfer(input, f.client)).resolves.toMatchObject({ current: true, coordinatorGeneration: 2 })
      else await expect(transfer(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(owned.transportId).toBe('original-supervisor')
    },
  )

  it.each(['missing-handle', 'sender', 'process', 'private-root', 'observed'])(
    'keeps the canonical pause fence until captured managed cleanup is proven on resume (%s)',
    async kind => {
      const f = await createProviderFixture()
      cleanups.push(f.cleanup)
      const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
      const owned = {
        ...f.scope,
        attemptId: f.binding.attemptId,
        transportId: 'resume-original-supervisor',
        databaseIdentity: await readOwnedJourneyTurnDatabaseIdentity(f.client),
        cancel: async () => ({
          fenced: kind !== 'sender',
          completed: true,
          cleanup: { groupExitObserved: kind !== 'process', privateRootRemoved: kind !== 'private-root' },
        }),
      }
      if (kind !== 'missing-handle') registerOwnedQualityJourneyTurn(owned)
      const observation = await pauseCurrent(f.scope, f.client)
      expect(JSON.parse(observation.payloadJson).cleanup.managedTurn).toBe(kind === 'observed' ? 'OBSERVED' : 'UNKNOWN')
      const before = await ownership(f.scope, f.client)
      const intentBefore = await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
        where: { id: prepared.intent.id },
      })
      const runBefore = await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: prepared.run.id } })
      expect(intentBefore).toMatchObject({ status: 'INVALIDATED', armedAt: null })
      const request = {
        ...f.scope,
        expectedStateHash: before.journey.stateHash,
        expectedVersion: before.journey.version,
        idempotencyKey: `resume-${kind}`,
      }
      if (kind === 'observed')
        await expect(resume(request, f.client)).resolves.toMatchObject({
          operationalStatus: 'ACTIVE',
          cleanup: { managedTurn: 'OBSERVED' },
        })
      else {
        await expect(resume(request, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
        expect(await ownership(f.scope, f.client)).toEqual(before)
        expect(
          await f.client.qualityJourneyEvent.count({ where: { ...f.scope, eventType: 'OPERATIONAL_RESUME' } }),
        ).toBe(0)
      }
      expect(
        await f.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({ where: { id: prepared.intent.id } }),
      ).toEqual(intentBefore)
      expect(await f.client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: prepared.run.id } })).toEqual(
        runBefore,
      )
      expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(1)
      expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
      expect(owned.transportId).toBe('resume-original-supervisor')
    },
  )

  it('resumes mixed external and provider captures using complete owned-provider receipts while external cleanup stays UNKNOWN', async () => {
    const f = await createProviderFixture()
    cleanups.push(f.cleanup)
    await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const externalWork = await f.client.qualityJourneyWorkItem.create({
      data: {
        id: 'mixed-external-work',
        ...f.scope,
        cycleId: f.created.journey.activeCycleId,
        role: 'REQUIREMENT_ANALYZER',
        status: 'IN_PROGRESS',
        inputHash: hash('mixed-input'),
        roleContractDigest: hash('mixed-role'),
      },
    })
    await f.client.qualityJourneyWorkAttempt.create({
      data: {
        id: 'mixed-external-attempt',
        workItemId: externalWork.id,
        attempt: 1,
        status: 'IN_PROGRESS',
        executionMode: 'EXTERNAL_V1',
        leaseId: 'mixed-external-lease',
        ownerTokenHash: hash('mixed-owner'),
        leaseExpiresAt: new Date(Date.now() + 60_000),
        heartbeatSeconds: 30,
      },
    })
    const owned = {
      ...f.scope,
      attemptId: f.binding.attemptId,
      transportId: 'mixed-original-provider',
      databaseIdentity: await readOwnedJourneyTurnDatabaseIdentity(f.client),
      cancel: async () => ({
        fenced: true,
        completed: true,
        cleanup: { groupExitObserved: true, privateRootRemoved: true },
      }),
    }
    registerOwnedQualityJourneyTurn(owned)
    const observation = await pauseCurrent(f.scope, f.client)
    const cleanup = JSON.parse(observation.payloadJson).cleanup
    expect(cleanup.managedTurn).toBe('UNKNOWN')
    expect(cleanup.managedTurnReceipts).toHaveLength(1)
    expect(cleanup.managedTurnReceipts[0].attemptId).toBe(f.binding.attemptId)
    const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await expect(
      resume(
        {
          ...f.scope,
          expectedStateHash: journey.stateHash,
          expectedVersion: journey.version,
          idempotencyKey: 'mixed-resume',
        },
        f.client,
      ),
    ).resolves.toMatchObject({
      operationalStatus: 'ACTIVE',
      cleanup: { managedTurn: 'UNKNOWN', externalCodex: 'UNKNOWN' },
    })
    expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(1)
    expect((await f.client.qualityJourneyProviderDispatchIntent.findFirstOrThrow()).armedAt).toBeNull()
    expect(owned.transportId).toBe('mixed-original-provider')
  })

  it.each(['pending', 'armed', 'global-slot', 'historical-unknown', 'browser'])(
    'retains unresolved provider and browser evidence (%s)',
    async kind => {
      const f = await createProviderFixture()
      cleanups.push(f.cleanup)
      if (kind === 'pending' || kind === 'armed') {
        const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
        if (kind === 'armed') {
          const claimed = await claimQualityJourneyProviderIntent(
            { ...f.binding, intentId: prepared.intent.id, claimOwner: 'owner' },
            f.client,
          )
          await armQualityJourneyProviderIntent(
            { ...f.binding, intentId: prepared.intent.id, claimOwner: 'owner', claimEpoch: claimed.intent.claimEpoch },
            f.client,
          )
        }
        // This handle is a disposable supervisor fixture, not a reconstructed process identity.
        const owned = {
          ...f.scope,
          attemptId: f.binding.attemptId,
          transportId: 'test-owned-turn',
          databaseIdentity: await readOwnedJourneyTurnDatabaseIdentity(f.client),
          cancel: async () => ({
            fenced: true,
            completed: true,
            cleanup: { groupExitObserved: true, privateRootRemoved: true },
          }),
        }
        registerOwnedQualityJourneyTurn(owned)
        await pauseCurrent(f.scope, f.client)
        expect(owned.transportId).toBe('test-owned-turn') // Keep the original weakly registered fixture alive.
        if (kind === 'pending') {
          // A new unsent intent appearing after pause must still block transfer.
          await f.client.qualityJourneyProviderDispatchIntent.update({
            where: { id: prepared.intent.id },
            data: { reconciledAt: null, invalidatedAt: null },
          })
        }
      } else {
        await cancelQualityJourneyWork(
          { ...f.credentials, workItemId: f.binding.workItemId, actor: 'USER', reason: 'Reconcile attempt' },
          f.client,
        )
        await pauseCurrent(f.scope, f.client)
        if (kind === 'global-slot')
          await f.client.qualityJourneyProviderSlot.create({
            data: { id: 'HUB', sendBoundaryId: 'unresolved-global-boundary' },
          })
        if (kind === 'historical-unknown')
          await f.client.qualityJourneyWorkAttempt.update({
            where: { id: f.binding.attemptId },
            data: { status: 'COMPLETED', dispatchReservedAt: new Date(), spawnReceiptId: 'unverified-receipt' },
          })
        if (kind === 'browser')
          await f.client.qualityJourneyOwnedBrowser.create({
            data: {
              ...f.scope,
              id: 'unresolved-browser',
              sessionId: 'unresolved-browser',
              processInstanceId: 'unresolved-process',
              generation: 1,
              status: 'UNKNOWN',
            },
          })
      }
      const input = await transferInput(
        f.scope,
        f.client,
        'EXTERNAL_LEGACY',
        `blocked-${kind}`,
        f.principal.principalId,
      )
      const before = await ownership(f.scope, f.client)
      await expect(transfer(input, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await ownership(f.scope, f.client)).toEqual(before)
    },
  )
})
