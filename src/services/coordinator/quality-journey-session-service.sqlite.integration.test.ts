import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  assertCoordinatorMutationSession,
  assertCurrentCoordinatorSession,
  trustedHumanCoordinatorSession,
} from './quality-journey-coordinator-session'
import { submitExternalQualityJourneyAnalysisSuccessor } from './quality-journey-analysis-service'
import {
  activateQualityJourneyCoordinatorSession as activate,
  registerQualityJourneyCoordinatorSession as register,
  transferQualityJourneyCoordinatorSession as transfer,
} from './quality-journey-session-service'
import {
  admitExternalQualityJourneyWork,
  claimExternalQualityJourneyWork,
  claimQualityJourneyWork,
  cancelQualityJourneyWork,
  createQualityJourney,
  submitDurableQualityJourneyCommand,
} from './quality-journey-service'

const workspaces: string[] = []
const clients: PrismaClient[] = []
const principalId = 'project:session-owner'
const principal = { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
afterEach(async () => {
  await Promise.all(clients.splice(0).map(client => client.$disconnect()))
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-session-regression-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'test.db')
  await copyMigratedTestDatabase(databasePath)
  const connect = () => {
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    clients.push(client)
    return client
  }
  const client = connect()
  await client.targetProject.create({
    data: {
      id: 'session-target',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Session regressions',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const create = (key = 'managed', hostingMode: 'EXTERNAL_LEGACY' | 'APP_SERVER_LOCAL_V1' = 'APP_SERVER_LOCAL_V1') =>
    createQualityJourney(
      { targetProjectId: 'session-target', idempotencyKey: key, requirement: { objective: key }, hostingMode },
      client,
    )
  return { client, connect, create }
}

async function managedFixture() {
  const f = await fixture()
  const created = await f.create()
  const scope = { journeyId: created.journey.journeyId, targetProjectId: 'session-target' }
  const registration = (key: string) =>
    register(
      { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: key },
      f.client,
    )
  const first = await registration('first')
  const approval = {
    ...scope,
    authority: trustedHumanCoordinatorSession as typeof trustedHumanCoordinatorSession,
    coordinatorPrincipalId: principalId,
    approvedBy: 'local-ui' as const,
    expectedStateHash: created.journey.stateHash,
  }
  const initial = {
    ...approval,
    coordinatorSessionId: first.session.id,
    requestId: 'initial',
    expectedOwnershipVersion: 0,
  }
  const credentials = {
    ...scope,
    coordinatorSessionId: first.session.id,
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principalId,
  }
  return { ...f, created, scope, registration, first, approval, initial, credentials }
}

async function submitRequirement(f: Awaited<ReturnType<typeof managedFixture>>) {
  const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
  const revision = await f.client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: f.created.journey.activeRevisionIds.journey },
  })
  const command = {
    schemaVersion: 'appraise.quality-journey/v1',
    ...f.scope,
    commandId: 'submit',
    idempotencyKey: 'submit',
    actor: 'USER',
    command: 'SUBMIT_REQUIREMENT',
    expectedStateHash: row.stateHash,
    inputArtifactRefs: [],
    payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
  }
  const result = await submitDurableQualityJourneyCommand(command, f.client, trustedHumanCoordinatorSession)
  return { command, result }
}

function claimInput(f: Awaited<ReturnType<typeof managedFixture>>) {
  return {
    ...f.scope,
    role: 'REQUIREMENT_ANALYZER' as const,
    principal,
    assignmentSecret: 's'.repeat(32),
    idempotencyKey: 'claim',
  }
}

describe('M03 persisted host-neutral coordinator sessions', () => {
  it('does not let foreign credential scope override the canonical Journey and target', async () => {
    const f = await managedFixture()
    await activate(f.initial, f.client)
    await f.client.targetProject.create({
      data: {
        id: 'foreign-target',
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: 'path:/tmp/m03-foreign-scope',
        canonicalPath: '/tmp/m03-foreign-scope',
        displayName: 'Foreign scope',
        fingerprint: `sha256:${'f'.repeat(64)}`,
      },
    })
    const foreign = await createQualityJourney(
      {
        targetProjectId: 'foreign-target',
        idempotencyKey: 'foreign',
        requirement: { objective: 'Foreign ownership' },
        hostingMode: 'APP_SERVER_LOCAL_V1',
      },
      f.client,
    )
    const foreignScope = { journeyId: foreign.journey.journeyId, targetProjectId: 'foreign-target' }
    const owner = await register(
      {
        ...foreignScope,
        ownerPrincipalId: principalId,
        hostKind: 'APP_SERVER_LOCAL_V1',
        idempotencyKey: 'foreign-owner',
      },
      f.client,
    )
    await activate(
      {
        ...f.approval,
        ...foreignScope,
        coordinatorSessionId: owner.session.id,
        requestId: 'foreign-activation',
        expectedOwnershipVersion: 0,
        expectedStateHash: foreign.journey.stateHash,
      },
      f.client,
    )
    const before = await f.client.qualityJourney.findMany({ orderBy: { id: 'asc' } })
    const sessions = await f.client.qualityJourneyCoordinatorSession.findMany({ orderBy: { id: 'asc' } })
    await expect(
      f.client.$transaction(tx =>
        assertCoordinatorMutationSession(
          { ...f.credentials, ...foreignScope, coordinatorSessionId: owner.session.id },
          f.scope,
          tx,
        ),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await f.client.qualityJourney.findMany({ orderBy: { id: 'asc' } })).toEqual(before)
    expect(await f.client.qualityJourneyCoordinatorSession.findMany({ orderBy: { id: 'asc' } })).toEqual(sessions)
  })

  it('replays an authenticated exact command without consuming ownership or changing its snapshot', async () => {
    const f = await managedFixture()
    await activate(f.initial, f.client)
    const { command, result } = await submitRequirement(f)
    const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    const commands = await f.client.qualityJourneyCommand.findMany()
    const events = await f.client.qualityJourneyEvent.findMany()
    await expect(submitDurableQualityJourneyCommand(command, f.client, f.credentials)).resolves.toEqual({
      ...result,
      replayed: true,
    })
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toEqual(before)
    expect(await f.client.qualityJourneyCommand.findMany()).toEqual(commands)
    expect(await f.client.qualityJourneyEvent.findMany()).toEqual(events)
  })

  it.each(['claim-first', 'transfer-first'])(
    'serializes a real external claim against exact-snapshot transfer (%s)',
    async order => {
      const f = await managedFixture()
      await activate(f.initial, f.client)
      await submitRequirement(f)
      const successor = await f.registration('claim-race-successor')
      const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      const secondClient = f.connect()
      const claim = () => claimExternalQualityJourneyWork({ ...claimInput(f), ...f.credentials }, f.client)
      const takeover = () =>
        transfer(
          {
            ...f.approval,
            expectedStateHash: before.stateHash,
            expectedOwnershipVersion: before.ownershipVersion,
            predecessorSessionId: f.first.session.id,
            predecessorGeneration: 1,
            successorSessionId: successor.session.id,
            requestId: 'claim-race-transfer',
            reconciliationReceiptId: 'human:empty-before-race',
          },
          secondClient,
        )
      const results =
        order === 'claim-first'
          ? await Promise.allSettled([claim(), takeover()])
          : await Promise.allSettled([takeover(), claim()])
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
      for (const result of results) {
        if (result.status === 'rejected') expect(['CONFLICT', 'UNAUTHORIZED']).toContain(result.reason.code)
      }
      const claimed = results[order === 'claim-first' ? 0 : 1]
      const current = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      const attempts = await f.client.qualityJourneyWorkAttempt.findMany()
      const bindings = await f.client.qualityJourneyWorkAttemptSessionBinding.findMany()
      const predecessor = await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({
        where: { id: f.first.session.id },
      })
      const next = await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({
        where: { id: successor.session.id },
      })
      expect(current.ownershipVersion).toBe(before.ownershipVersion + 1)
      if (claimed.status === 'fulfilled') {
        expect(attempts).toHaveLength(1)
        expect(bindings).toHaveLength(1)
        expect(bindings[0]).toMatchObject({
          attemptId: attempts[0].id,
          sessionId: f.first.session.id,
          coordinatorGeneration: 1,
        })
        expect(current.currentCoordinatorSessionId).toBe(f.first.session.id)
        expect(predecessor).toMatchObject({ status: 'ACTIVE', fencedAt: null })
        expect(next).toMatchObject({ status: 'REGISTERED', generation: null, transitionRequestId: null })
        expect(await f.client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(1)
      } else {
        expect(attempts).toHaveLength(0)
        expect(bindings).toHaveLength(0)
        expect(current.currentCoordinatorSessionId).toBe(successor.session.id)
        expect(predecessor.status).toBe('FENCED')
        expect(next).toMatchObject({ status: 'ACTIVE', generation: 2 })
        expect(await f.client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(0)
      }
    },
  )

  it.each(['write-first', 'transfer-first'])(
    'orders a canonical external Analysis acceptance and artifact write against transfer (%s)',
    async order => {
      const f = await managedFixture()
      await activate(f.initial, f.client)
      await submitRequirement(f)
      const claim = await claimExternalQualityJourneyWork({ ...claimInput(f), ...f.credentials }, f.client)
      const lineage = {
        ...f.scope,
        workItemId: claim.workItem.id,
        attemptId: claim.attempt.id,
        assignmentId: claim.assignment.assignmentId,
        assignmentGeneration: claim.assignmentGeneration,
        leaseId: claim.attempt.leaseId,
        assignmentSecret: claimInput(f).assignmentSecret,
      }
      await admitExternalQualityJourneyWork(
        { ...lineage, ...f.credentials, role: 'REQUIREMENT_ANALYZER', principal, idempotencyKey: 'race-admit' },
        f.client,
      )
      const successor = await f.registration('analysis-race-successor')
      const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      const submission = {
        ...lineage,
        idempotencyKey: 'analysis-race',
        charter: {
          schemaVersion: 'appraise.quality-journey/v1',
          ...f.scope,
          charterId: 'race-charter',
          analysisRevisionId: 'race-analysis',
          cycleId: f.created.journey.activeCycleId,
          requirementRevisionId: f.created.journey.activeRevisionIds.journey,
          objectives: ['Persist an accepted Analysis Charter.'],
          scope: { included: ['Session ownership'], excluded: [] },
          actors: [],
          requirements: [{ requirementId: 'REQ-1', statement: 'Ownership remains current.', sourceRefs: ['brief:1'] }],
          obligations: [
            {
              obligationId: 'OBL-1',
              requirementId: 'REQ-1',
              statement: 'Persist exactly one canonical successor.',
              acceptanceSignals: ['One durable receipt'],
            },
          ],
          constraints: [],
          assumptions: [],
          risks: [],
          acceptanceSignals: ['One durable receipt'],
          retiredRequirementIds: [],
          questions: [],
          resolvedQuestionAnswerIds: [],
        },
      }
      const secondClient = f.connect()
      const write = () => submitExternalQualityJourneyAnalysisSuccessor(submission, principal, f.client, f.credentials)
      const takeover = () =>
        transfer(
          {
            ...f.approval,
            expectedStateHash: before.stateHash,
            expectedOwnershipVersion: before.ownershipVersion,
            predecessorSessionId: f.first.session.id,
            predecessorGeneration: 1,
            successorSessionId: successor.session.id,
            requestId: 'analysis-race-transfer',
            reconciliationReceiptId: 'human:exact-pre-write-snapshot',
          },
          secondClient,
        )
      const results =
        order === 'write-first'
          ? await Promise.allSettled([write(), takeover()])
          : await Promise.allSettled([takeover(), write()])
      const written = results[order === 'write-first' ? 0 : 1]
      const transferred = results[order === 'write-first' ? 1 : 0]
      expect(written.status).toBe('fulfilled')
      expect(transferred.status).toBe('rejected')
      if (transferred.status === 'rejected') expect(transferred.reason).toMatchObject({ code: 'CONFLICT' })
      const current = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      expect(current.currentCoordinatorSessionId).toBe(f.first.session.id)
      expect(current.ownershipVersion).toBeGreaterThan(before.ownershipVersion)
      expect(
        await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: f.first.session.id } }),
      ).toMatchObject({ status: 'ACTIVE', fencedAt: null })
      expect(
        await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: successor.session.id } }),
      ).toMatchObject({ status: 'REGISTERED', generation: null, transitionRequestId: null })
      expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
      expect(await f.client.qualityJourneyAnalysisRevision.count()).toBe(1)
      expect(await f.client.qualityJourneyArtifact.count({ where: { artifactId: 'race-charter' } })).toBe(1)
      expect(
        await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } }),
      ).toMatchObject({ status: 'COMPLETED' })
      const after = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      await expect(write()).resolves.toMatchObject({ replayed: true })
      expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toEqual(after)
      expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    },
  )

  it('persists explicit and compatibility hosting while preserving the pre-M03 creation request hash and replay', async () => {
    const f = await fixture()
    const input = {
      targetProjectId: 'session-target',
      idempotencyKey: 'legacy',
      requirement: { objective: 'Legacy replay' },
    }
    const created = await createQualityJourney(input, f.client)
    const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: created.journey.journeyId } })
    const revision = await f.client.qualityJourneyRevision.findUniqueOrThrow({
      where: { id: created.journey.activeRevisionIds.journey },
    })
    expect(row).toMatchObject({
      hostingMode: 'EXTERNAL_LEGACY',
      hostingProvenance: 'CREATED_COMPATIBILITY_V1',
      currentCoordinatorSessionId: null,
    })
    expect(row.rootRequestHash).toBe(hash({ ...input, requirement: JSON.parse(revision.contentJson) }))
    await expect(createQualityJourney(input, f.client)).resolves.toMatchObject({ replayed: true })
    await expect(createQualityJourney({ ...input, hostingMode: 'EXTERNAL_LEGACY' }, f.client)).resolves.toMatchObject({
      replayed: true,
    })
    await expect(
      createQualityJourney({ ...input, hostingMode: 'APP_SERVER_LOCAL_V1' }, f.client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    const managed = await f.create()
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: managed.journey.journeyId } })).toMatchObject(
      { hostingMode: 'APP_SERVER_LOCAL_V1', currentCoordinatorSessionId: null },
    )
    await expect(
      register(
        {
          journeyId: row.id,
          targetProjectId: row.targetProjectId,
          ownerPrincipalId: principalId,
          hostKind: 'APP_SERVER_LOCAL_V1',
          idempotencyKey: 'no-adoption',
        },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('keeps registration non-authoritative and rejects untrusted or foreign activation without partial ownership', async () => {
    const f = await managedFixture()
    await expect(f.registration('first')).resolves.toMatchObject({
      replayed: true,
      session: { id: f.first.session.id },
    })
    await expect(
      register(
        { ...f.scope, ownerPrincipalId: 'foreign', hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'first' },
        f.client,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      activate({ ...f.initial, authority: Symbol('trusted human Journey decision') as never }, f.client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(activate({ ...f.initial, coordinatorPrincipalId: 'foreign' }, f.client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })).toMatchObject({
      currentCoordinatorSessionId: null,
      ownershipVersion: 0,
    })
    expect(
      await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: f.first.session.id } }),
    ).toMatchObject({ status: 'REGISTERED', generation: null, transitionRequestId: null })
  })

  it('refuses missing credentials before the first managed claim and rejects admission without the persisted current session', async () => {
    const f = await managedFixture()
    await submitRequirement(f)
    await expect(claimQualityJourneyWork({ ...f.scope, role: 'REQUIREMENT_ANALYZER' }, f.client)).rejects.toMatchObject(
      { code: 'UNAUTHORIZED' },
    )
    await expect(claimExternalQualityJourneyWork(claimInput(f), f.client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(0)
    expect(await f.client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(0)
    const snapshot = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await activate(
      { ...f.initial, expectedStateHash: snapshot.stateHash, expectedOwnershipVersion: snapshot.ownershipVersion },
      f.client,
    )
    const claim = await claimExternalQualityJourneyWork({ ...claimInput(f), ...f.credentials }, f.client)
    const admission = {
      ...claimInput(f),
      idempotencyKey: 'admit',
      workItemId: claim.workItem.id,
      attemptId: claim.attempt.id,
      assignmentId: claim.assignment.assignmentId,
      assignmentGeneration: claim.assignmentGeneration,
      leaseId: claim.attempt.leaseId,
    }
    const persisted = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } })
    await expect(admitExternalQualityJourneyWork(admission, f.client)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    for (const invalid of [
      { ...f.credentials, coordinatorPrincipalId: 'foreign' },
      { ...f.credentials, coordinatorSessionId: 'qjs_foreign' },
      { ...f.credentials, coordinatorGeneration: 99 },
      { ...f.credentials, coordinatorHandoffId: f.first.session.id },
    ]) {
      await expect(admitExternalQualityJourneyWork({ ...admission, ...invalid }, f.client)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    }
    expect(await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } })).toEqual(
      persisted,
    )
    await expect(admitExternalQualityJourneyWork({ ...admission, ...f.credentials }, f.client)).resolves.toMatchObject({
      replayed: false,
    })
    const binding = await f.client.qualityJourneyWorkAttemptSessionBinding.findUniqueOrThrow({
      where: { attemptId: claim.attempt.id },
    })
    expect(binding).toMatchObject({
      ...f.scope,
      sessionId: f.first.session.id,
      coordinatorGeneration: 1,
      assignmentGeneration: claim.assignmentGeneration,
      workItemId: claim.workItem.id,
      role: 'REQUIREMENT_ANALYZER',
      authorizationId: persisted.authorizationId,
      leaseId: claim.attempt.leaseId,
      assignmentId: claim.assignment.assignmentId,
      inputHash: claim.workItem.inputHash,
      provenance: 'CLAIM_SESSION_V1',
    })
    const durableAttempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: claim.attempt.id },
    })
    await f.client.$disconnect()
    const restarted = f.connect()
    expect(
      await restarted.qualityJourneyWorkAttemptSessionBinding.findUniqueOrThrow({
        where: { attemptId: claim.attempt.id },
      }),
    ).toEqual(binding)
    expect(await restarted.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } })).toEqual(
      durableAttempt,
    )
    await expect(admitExternalQualityJourneyWork({ ...admission, ...f.credentials }, restarted)).resolves.toMatchObject(
      { replayed: true },
    )
    await cancelQualityJourneyWork(
      {
        ...f.credentials,
        workItemId: claim.workItem.id,
        actor: 'USER',
        reason: 'Explicitly reconcile before transfer',
      },
      restarted,
    )
    const reconciled = await restarted.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    const next = await register(
      {
        ...f.scope,
        ownerPrincipalId: principalId,
        hostKind: 'APP_SERVER_LOCAL_V1',
        idempotencyKey: 'restart-successor',
      },
      restarted,
    )
    await transfer(
      {
        ...f.approval,
        expectedStateHash: reconciled.stateHash,
        expectedOwnershipVersion: reconciled.ownershipVersion,
        predecessorSessionId: f.first.session.id,
        predecessorGeneration: 1,
        successorSessionId: next.session.id,
        reconciliationReceiptId: 'human:cancelled-work',
        requestId: 'restart-transfer',
      },
      restarted,
    )
    const afterTransfer = await restarted.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: claim.attempt.id },
    })
    await expect(
      claimExternalQualityJourneyWork({ ...claimInput(f), ...f.credentials }, restarted),
    ).resolves.toMatchObject({ replayed: true, attempt: { id: claim.attempt.id } })
    await expect(admitExternalQualityJourneyWork({ ...admission, ...f.credentials }, restarted)).resolves.toMatchObject(
      { replayed: true },
    )
    await expect(
      claimExternalQualityJourneyWork(
        { ...claimInput(f), ...f.credentials, idempotencyKey: 'fresh-stale-claim' },
        restarted,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await restarted.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: claim.attempt.id } })).toEqual(
      afterTransfer,
    )
    expect(
      await restarted.qualityJourneyWorkAttemptSessionBinding.findUniqueOrThrow({
        where: { attemptId: claim.attempt.id },
      }),
    ).toEqual(binding)
  })

  it('activates generation one, explicitly transfers generation two, and makes historical replay distinguish currentness', async () => {
    const f = await managedFixture()
    const gen1 = await activate(f.initial, f.client)
    expect(gen1).toMatchObject({ coordinatorGeneration: 1, ownershipVersion: 1, current: true, replayed: false })
    await expect(activate(f.initial, f.client)).resolves.toMatchObject({ replayed: true, current: true })
    const successor = await f.registration('second')
    const input = {
      ...f.approval,
      successorSessionId: successor.session.id,
      predecessorSessionId: f.first.session.id,
      predecessorGeneration: 1,
      reconciliationReceiptId: 'human:quiescent',
      requestId: 'transfer',
      expectedOwnershipVersion: 1,
    }
    await expect(transfer({ ...input, expectedStateHash: 'stale' }, f.client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(transfer({ ...input, expectedOwnershipVersion: 0 }, f.client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    const gen2 = await transfer(input, f.client)
    expect(gen2).toMatchObject({
      coordinatorGeneration: 2,
      ownershipVersion: 2,
      predecessorSessionId: f.first.session.id,
    })
    await expect(transfer(input, f.client)).resolves.toMatchObject({ replayed: true, current: true })
    await expect(activate(f.initial, f.client)).resolves.toMatchObject({
      replayed: true,
      current: false,
      coordinatorGeneration: 1,
    })
    expect(
      await f.client.qualityJourneyCoordinatorSession.findUniqueOrThrow({ where: { id: f.first.session.id } }),
    ).toMatchObject({ status: 'FENCED', fenceReason: `EXPLICIT_TRANSFER:${successor.session.id}` })
    const current = { ...f.credentials, coordinatorSessionId: successor.session.id, coordinatorGeneration: 2 }
    const foreign = await f.create('foreign-journey')
    for (const credentials of [
      f.scope,
      f.credentials,
      { ...current, coordinatorGeneration: 1 },
      { ...current, coordinatorPrincipalId: 'foreign' },
      { ...current, coordinatorHandoffId: successor.session.id },
      { ...current, journeyId: foreign.journey.journeyId },
    ]) {
      await expect(assertCurrentCoordinatorSession(credentials, f.client)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    }
    await submitRequirement(f)
    const attemptsBefore = await f.client.qualityJourneyWorkAttempt.count()
    for (const invalid of [
      f.credentials,
      { ...current, coordinatorPrincipalId: 'foreign' },
      { ...current, coordinatorSessionId: 'qjs_foreign' },
      { ...current, coordinatorHandoffId: successor.session.id },
    ]) {
      await expect(claimExternalQualityJourneyWork({ ...claimInput(f), ...invalid }, f.client)).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    }
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(attemptsBefore)
    expect(await f.client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(0)
    await f.client.$disconnect()
    await expect(assertCurrentCoordinatorSession(current, f.connect())).resolves.toMatchObject({
      session: { id: successor.session.id, generation: 2 },
    })
  })

  it.each(['CLAIMED', 'DISPATCH_UNRESOLVED', 'COMPLETED_WITH_UNRESOLVED_DISPATCH'])(
    'refuses transfer with %s work and rolls back the complete ownership fence',
    async status => {
      const f = await managedFixture()
      await activate(f.initial, f.client)
      await submitRequirement(f)
      const claim = await claimExternalQualityJourneyWork({ ...claimInput(f), ...f.credentials }, f.client)
      if (status !== 'CLAIMED')
        await f.client.qualityJourneyWorkAttempt.update({
          where: { id: claim.attempt.id },
          data: {
            status: status === 'DISPATCH_UNRESOLVED' ? status : 'COMPLETED',
            dispatchReservedAt: new Date(),
            spawnReceiptId: null,
          },
        })
      const successor = await f.registration('blocked-successor')
      const before = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
      const sessionsBefore = await f.client.qualityJourneyCoordinatorSession.findMany({ orderBy: { id: 'asc' } })
      await expect(
        transfer(
          {
            ...f.approval,
            expectedStateHash: before.stateHash,
            expectedOwnershipVersion: before.ownershipVersion,
            successorSessionId: successor.session.id,
            predecessorSessionId: f.first.session.id,
            predecessorGeneration: 1,
            reconciliationReceiptId: 'cannot-adopt-active-or-unknown',
            requestId: 'blocked-transfer',
          },
          f.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await f.client.qualityJourney.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before)
      expect(await f.client.qualityJourneyCoordinatorSession.findMany({ orderBy: { id: 'asc' } })).toEqual(
        sessionsBefore,
      )
    },
  )

  it('allows one independently connected activation and transfer winner without a partial predecessor fence', async () => {
    const f = await managedFixture()
    const secondClient = f.connect()
    const other = await f.registration('activation-racer')
    const activations = await Promise.allSettled([
      activate(f.initial, f.client),
      activate({ ...f.initial, coordinatorSessionId: other.session.id, requestId: 'racing-initial' }, secondClient),
    ])
    expect(activations.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const winner = activations.find(result => result.status === 'fulfilled')!
    if (winner.status !== 'fulfilled') throw new Error('Missing activation winner')
    expect(await f.client.qualityJourneyCoordinatorSession.count({ where: { status: 'ACTIVE' } })).toBe(1)
    const left = await f.registration('left')
    const right = await f.registration('right')
    const transferInput = {
      ...f.approval,
      predecessorSessionId: winner.value.coordinatorSessionId,
      predecessorGeneration: 1,
      reconciliationReceiptId: 'human:empty',
      expectedOwnershipVersion: 1,
    }
    const transfers = await Promise.allSettled([
      transfer({ ...transferInput, successorSessionId: left.session.id, requestId: 'left-transfer' }, f.client),
      transfer({ ...transferInput, successorSessionId: right.session.id, requestId: 'right-transfer' }, secondClient),
    ])
    expect(transfers.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    expect(journey.ownershipVersion).toBe(2)
    const sessions = await f.client.qualityJourneyCoordinatorSession.findMany()
    expect(sessions.filter(session => session.status === 'ACTIVE')).toHaveLength(1)
    expect(sessions.filter(session => session.status === 'FENCED')).toHaveLength(1)
    const active = sessions.find(session => session.status === 'ACTIVE')!
    expect(active).toMatchObject({
      id: journey.currentCoordinatorSessionId,
      generation: 2,
      predecessorSessionId: winner.value.coordinatorSessionId,
    })
    expect(
      sessions.find(session => [left.session.id, right.session.id].includes(session.id) && session.id !== active.id),
    ).toMatchObject({ status: 'REGISTERED', generation: null, transitionRequestId: null, fencedAt: null })
  })
})
