import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtemp, chmod, rm, readdir, readFile, rename, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { PrismaClient, type Prisma } from '@prisma/client'
import {
  createAssignmentCredentialCustody,
  type AssignmentClaimRequest,
} from '@/lib/quality-journey/assignment-credential-custody'
import { createAssignmentCredentialFileStore } from '@/lib/quality-journey/assignment-credential-file-store'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { createQualityJourney, submitDurableQualityJourneyCommand } from './quality-journey-service'
import {
  registerQualityJourneyCoordinatorSession,
  activateQualityJourneyCoordinatorSession,
} from './quality-journey-session-service'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import { createQualityJourneyAssignmentCustodyService } from './quality-journey-assignment-custody-service'

type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
const fixtures: Fixture[] = [],
  roots: string[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
const databaseIdentity = `sha256:${'d'.repeat(64)}`,
  secret = 'synthetic-original-custody-secret-0123456789'
async function fixture() {
  const f = await createProviderFixture()
  fixtures.push(f)
  const created = await createQualityJourney(
    {
      targetProjectId: f.scope.targetProjectId,
      idempotencyKey: 'custody-fresh',
      hostingMode: 'APP_SERVER_LOCAL_V1',
      requirement: { objective: 'Custody synthetic claim' },
    },
    f.client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId: f.scope.targetProjectId },
    principal = { principalId: 'project:synthetic-custody', assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
  const registered = await registerQualityJourneyCoordinatorSession(
    {
      ...scope,
      ownerPrincipalId: principal.principalId,
      hostKind: 'APP_SERVER_LOCAL_V1',
      idempotencyKey: 'custody-session',
    },
    f.client,
  )
  await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      coordinatorPrincipalId: principal.principalId,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      coordinatorSessionId: registered.session.id,
      requestId: 'custody-activate',
      expectedOwnershipVersion: 0,
      expectedStateHash: created.journey.stateHash,
    },
    f.client,
  )
  const credentials = {
    ...scope,
    coordinatorSessionId: registered.session.id,
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principal.principalId,
  }
  const revision = await f.client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...scope,
      commandId: 'custody-submit',
      idempotencyKey: 'custody-submit',
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      inputArtifactRefs: [],
      payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
    },
    f.client,
    trustedHumanCoordinatorSession,
  )
  const request: AssignmentClaimRequest = {
    ...credentials,
    principal,
    role: 'REQUIREMENT_ANALYZER',
    idempotencyKey: 'original-custody-claim',
  }
  const root = await mkdtemp(path.join(tmpdir(), 'appraise-custody-synthetic-sqlite-'))
  roots.push(root)
  await chmod(root, 0o700)
  const key = randomBytes(32),
    store = await createAssignmentCredentialFileStore(root),
    custody = createAssignmentCredentialCustody({ store, keyProvider: async () => key })
  const service = createQualityJourneyAssignmentCustodyService({ custody, databaseIdentity, client: f.client })
  return { f, root, key, store, custody, service, request }
}
function loseCommittedReply(client: PrismaClient) {
  let dropped = false
  return new Proxy(client, {
    get(target, key) {
      if (key === '$transaction')
        return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          const result = await target.$transaction(callback)
          if (!dropped) {
            dropped = true
            throw new Error('synthetic lost committed reply')
          }
          return result
        }
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('same-original assignment custody across fresh SQLite restart boundaries', () => {
  it('persists before claim, binds original identity, explicitly admits and recovers admitted binding after restart', async () => {
    const f = await fixture()
    const before = await f.f.client.qualityJourneyWorkAttempt.count({
      where: { workItem: { journeyId: f.request.journeyId } },
    })
    await f.service.prepareOriginal({ ...f.request, assignmentSecret: secret })
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(before)
    const claimed = await f.service.recoverClaim(f.request)
    expect(claimed.receipt.stage).toBe('BOUND_ATTEMPT')
    await expect(f.service.withRecoveredBinding(f.request, async () => true)).rejects.toMatchObject({
      code: 'AUTHORITY_REFUSED',
    })
    await f.service.admitOriginal(f.request)
    const restarted = createQualityJourneyAssignmentCustodyService({
      custody: createAssignmentCredentialCustody({
        store: await createAssignmentCredentialFileStore(f.root),
        keyProvider: async () => f.key,
      }),
      databaseIdentity,
      client: f.f.connect(),
    })
    expect(
      await restarted.withRecoveredBinding(f.request, async b => ({
        attemptId: b.attemptId,
        secret: b.assignmentSecret,
      })),
    ).toEqual({ attemptId: claimed.receipt.boundAttempt!.attemptId, secret })
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(before + 1)
    for (const name of await readdir(f.root))
      expect(await readFile(path.join(f.root, name), 'utf8')).not.toContain(secret)
  })
  it('recovers a lost prepared-record reply before any canonical claim occurs', async () => {
    const f = await fixture()
    let lost = false
    const store = {
      read: f.store.read,
      async compareAndSwap(id: string, expected: string | null, value: string) {
        const result = await f.store.compareAndSwap(id, expected, value)
        if (!lost) {
          lost = true
          throw new Error('synthetic lost prepared reply')
        }
        return result
      },
    }
    const service = createQualityJourneyAssignmentCustodyService({
      custody: createAssignmentCredentialCustody({ store, keyProvider: async () => f.key }),
      databaseIdentity,
      client: f.f.client,
    })
    await expect(service.claimAndBind({ ...f.request, assignmentSecret: secret })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(0)
    await f.service.recoverClaim(f.request)
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(1)
  })

  it('recovers a committed claim with lost reply using only original persisted key and secret', async () => {
    const f = await fixture()
    const losing = createQualityJourneyAssignmentCustodyService({
      custody: f.custody,
      databaseIdentity,
      client: loseCommittedReply(f.f.client),
    })
    await expect(losing.claimAndBind({ ...f.request, assignmentSecret: secret })).rejects.toMatchObject({
      code: 'CLAIM_UNRESOLVED',
    })
    expect((await f.service.inspectOriginal(f.request)).stage).toBe('PREPARED_CLAIM')
    const existing = await f.f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.request.journeyId } },
    })
    const recovered = await f.service.recoverClaim(f.request)
    expect(recovered.receipt.boundAttempt!.attemptId).toBe(existing.id)
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(1)
  })
  it.each(['before', 'after'] as const)(
    'recovers a %s-commit custody-bind failure without replacing the claimed attempt',
    async phase => {
      const f = await fixture()
      let writes = 0
      const interruptedStore = {
        read: f.store.read,
        async compareAndSwap(id: string, expected: string | null, value: string) {
          writes++
          if (writes === 2 && phase === 'before') throw new Error('synthetic bind storage refusal')
          const result = await f.store.compareAndSwap(id, expected, value)
          if (writes === 2 && phase === 'after') throw new Error('synthetic lost bind reply')
          return result
        },
      }
      const interrupted = createQualityJourneyAssignmentCustodyService({
        custody: createAssignmentCredentialCustody({ store: interruptedStore, keyProvider: async () => f.key }),
        databaseIdentity,
        client: f.f.client,
      })
      await expect(interrupted.claimAndBind({ ...f.request, assignmentSecret: secret })).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      const before = await f.f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
        where: { workItem: { journeyId: f.request.journeyId } },
      })
      const recovered = await f.service.recoverClaim(f.request)
      expect(recovered.receipt.boundAttempt!.attemptId).toBe(before.id)
      expect(
        await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
      ).toBe(1)
    },
  )

  it('replays committed admission after lost reply without another claim, admission or attempt', async () => {
    const f = await fixture()
    await f.service.claimAndBind({ ...f.request, assignmentSecret: secret })
    const losing = createQualityJourneyAssignmentCustodyService({
      custody: f.custody,
      databaseIdentity,
      client: loseCommittedReply(f.f.client),
    })
    await expect(losing.admitOriginal(f.request)).rejects.toMatchObject({ code: 'ADMISSION_UNRESOLVED' })
    const before = await f.f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.request.journeyId } },
    })
    await f.service.admitOriginal(f.request)
    expect(await f.f.client.qualityJourneyWorkAttempt.findFirstOrThrow({ where: { id: before.id } })).toEqual(before)
    expect(await f.service.withRecoveredBinding(f.request, async b => b.attemptId)).toBe(before.id)
  })
  it('refuses a physical SQLite clone even with the same declared database identity and canonical rows', async () => {
    const f = await fixture()
    await f.service.claimAndBind({ ...f.request, assignmentSecret: secret })
    const clonePath = path.join(f.f.workspace, 'synthetic-clone.db')
    await f.f.client.$executeRawUnsafe(`VACUUM INTO '${clonePath.replaceAll("'", "''")}'`)
    const clone = new PrismaClient({ datasources: { db: { url: `file:${clonePath}` } } })
    try {
      const other = createQualityJourneyAssignmentCustodyService({
        custody: f.custody,
        databaseIdentity,
        client: clone,
      })
      await expect(other.recoverClaim(f.request)).rejects.toMatchObject({ code: 'MISSING' })
      expect(
        await clone.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
      ).toBe(1)
    } finally {
      await clone.$disconnect()
    }
  })
  it('fences a replaced canonical database path before any claim and keeps paths out of receipts', async () => {
    const f = await fixture()
    const receipt = await f.service.prepareOriginal({ ...f.request, assignmentSecret: secret })
    expect(JSON.stringify(receipt)).not.toContain(f.f.databasePath)
    const moved = path.join(f.f.workspace, 'original-synthetic-db.db')
    await rename(f.f.databasePath, moved)
    await copyFile(moved, f.f.databasePath)
    await expect(f.service.recoverClaim(f.request)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(0)
  })

  it('refuses missing original ciphertext, wrong database identity and revoked authority without replacement', async () => {
    const f = await fixture()
    await f.service.claimAndBind({ ...f.request, assignmentSecret: secret })
    await f.service.admitOriginal(f.request)
    const before = await f.f.client.qualityJourneyWorkAttempt.count({
      where: { workItem: { journeyId: f.request.journeyId } },
    })
    const other = createQualityJourneyAssignmentCustodyService({
      custody: f.custody,
      databaseIdentity: `sha256:${'e'.repeat(64)}`,
      client: f.f.client,
    })
    await expect(other.recoverClaim(f.request)).rejects.toMatchObject({ code: 'MISSING' })
    const attempt = await f.f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItem: { journeyId: f.request.journeyId } },
    })
    await f.f.client.qualityJourneyWorkAuthorization.update({
      where: { id: attempt.authorizationId! },
      data: { revokedAt: new Date() },
    })
    await expect(f.service.withRecoveredBinding(f.request, async () => true)).rejects.toMatchObject({
      code: 'AUTHORITY_REFUSED',
    })
    for (const name of await readdir(f.root)) await rm(path.join(f.root, name))
    await expect(f.service.recoverClaim(f.request)).rejects.toMatchObject({ code: 'MISSING' })
    expect(
      await f.f.client.qualityJourneyWorkAttempt.count({ where: { workItem: { journeyId: f.request.journeyId } } }),
    ).toBe(before)
  })
})
