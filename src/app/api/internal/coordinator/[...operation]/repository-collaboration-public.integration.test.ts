import { execFile as execFileCallback } from 'node:child_process'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoordinatorClient } from '../../../../../../packages/appraisejs/src/coordinator-client'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  buildCollaborationSnapshotFiles,
  readCollaborationSnapshot,
  type CollaborationRecord,
} from '@/lib/repository-collaboration'
import { POST } from './route'
import { connectCollaboration, updateCollaborationPolicy } from '@/services/repository-collaboration/binding-service'
import { issueCollaborationAuthorityReceipt } from '@/services/repository-collaboration/authority-receipt-service'
import {
  recoverExpiredCollaborationLeases,
  scheduleCollaborationOperation,
} from '@/services/repository-collaboration/queue-service'
import { createCollaborationHandoffTicket } from '@/services/repository-collaboration/worker-service'

const prismaState = vi.hoisted(() => ({ client: undefined as Record<PropertyKey, unknown> | undefined }))

vi.mock('@/config/db-config', () => ({
  default: new Proxy(Object.create(null), {
    get(_target, property) {
      const client = prismaState.client
      if (!client) throw new Error('The public collaboration integration database is not ready.')
      const value = client[property]
      return typeof value === 'function' ? value.bind(client) : value
    },
  }),
}))

const workspaces: string[] = []
const originalCwd = process.cwd()
let server: Server | undefined
let routeNow: Date | undefined
const execFile = promisify(execFileCallback)

type WorkLease = { operationId: string; attemptId: string; fencingToken: number; leaseToken: string }

function moduleRecord(portableId: string, name: string): CollaborationRecord {
  return {
    format: 'appraise.repository-collaboration/v1',
    portableProjectId: 'portable-project',
    portableId,
    version: 1,
    archived: false,
    kind: 'module',
    payload: { name, parentPortableId: null },
  }
}

async function git(repositoryRoot: string, ...args: string[]) {
  const result = await execFile('git', ['-C', repositoryRoot, ...args], { maxBuffer: 1024 * 1024 })
  return result.stdout.trim()
}

async function writeSnapshot(repositoryRoot: string, records: CollaborationRecord[]) {
  const snapshot = buildCollaborationSnapshotFiles(records, 'portable-project')
  await Promise.all(
    [...snapshot.files].map(async ([relativePath, content]) => {
      const destination = path.join(repositoryRoot, 'appraise', 'collaboration', relativePath)
      await fs.mkdir(path.dirname(destination), { recursive: true })
      await fs.writeFile(destination, content)
    }),
  )
  return snapshot
}

async function commitSnapshot(repositoryRoot: string, message: string) {
  await git(repositoryRoot, 'add', 'appraise/collaboration')
  await git(repositoryRoot, 'commit', '-m', message)
  return git(repositoryRoot, 'rev-parse', 'HEAD')
}

function publicLease(work: WorkLease): WorkLease {
  return {
    operationId: work.operationId,
    attemptId: work.attemptId,
    fencingToken: work.fencingToken,
    leaseToken: work.leaseToken,
  }
}

afterEach(async () => {
  vi.useRealTimers()
  if (server?.listening)
    await new Promise<void>((resolve, reject) => server!.close(error => (error ? reject(error) : resolve())))
  server = undefined
  prismaState.client = undefined
  routeNow = undefined
  process.chdir(originalCwd)
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

function requestHeaders(headers: IncomingHttpHeaders) {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    result.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  return result
}

async function requestBody(request: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function withRouteClock<T>(operation: () => Promise<T>) {
  if (!routeNow) return operation()
  const ActualDate = globalThis.Date
  const current = routeNow
  class CoordinatorRouteDate extends ActualDate {
    constructor(value?: string | number | Date) {
      super(value ?? current.getTime())
    }

    static override now() {
      return current.getTime()
    }
  }
  globalThis.Date = CoordinatorRouteDate as DateConstructor
  try {
    return await operation()
  } finally {
    globalThis.Date = ActualDate
  }
}

async function startCoordinatorRouteServer() {
  server = createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host ?? '127.0.0.1'
      const request = new Request(`http://${host}${incoming.url ?? '/'}`, {
        method: incoming.method,
        headers: requestHeaders(incoming.headers),
        body: ['GET', 'HEAD'].includes(incoming.method ?? '') ? undefined : await requestBody(incoming),
      })
      const operation = new URL(request.url).pathname.split('/').slice(4).map(decodeURIComponent)
      const response = await withRouteClock(() => POST(request, { params: Promise.resolve({ operation }) }))
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()))
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      outgoing.writeHead(500, { 'content-type': 'application/json' })
      outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Coordinator adapter did not bind a TCP port.')
  return `http://127.0.0.1:${address.port}`
}

describe('repository collaboration public worker ingress', () => {
  it('drives a divergent receive from the public client through proposal, exact authorized acceptance, terminal replay, and cleanup', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-public-divergent-receive-'))
    workspaces.push(workspace)
    const remote = path.join(workspace, 'remote.git')
    const local = path.join(workspace, 'local')
    const incoming = path.join(workspace, 'incoming')
    const hub = path.join(workspace, 'hub')
    const databasePath = path.join(workspace, 'appraise.db')
    await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', remote])
    await execFile('git', ['clone', remote, local])
    await Promise.all([
      fs.mkdir(hub),
      fs.writeFile(path.join(hub, 'package.json'), '{"name":"public-divergent-hub"}\n'),
    ])
    await git(local, 'config', 'user.email', 'collaboration@example.test')
    await git(local, 'config', 'user.name', 'Collaboration Test')

    const baseline = [moduleRecord('module-base', 'Base')]
    await writeSnapshot(local, baseline)
    await commitSnapshot(local, 'baseline collaboration snapshot')
    await git(local, 'push', 'origin', 'appraise-0.5')

    const targetRecords = [...baseline, moduleRecord('module-target', 'Target only')]
    await writeSnapshot(local, targetRecords)
    const targetRevision = await commitSnapshot(local, 'local collaboration change')

    await execFile('git', ['clone', remote, incoming])
    await git(incoming, 'config', 'user.email', 'collaboration@example.test')
    await git(incoming, 'config', 'user.name', 'Collaboration Test')
    const sourceRecords = [...baseline, moduleRecord('module-source', 'Source only')]
    await writeSnapshot(incoming, sourceRecords)
    const sourceRevision = await commitSnapshot(incoming, 'remote collaboration change')
    await git(incoming, 'push', 'origin', 'appraise-0.5')
    await git(local, 'fetch', 'origin', 'appraise-0.5')
    const reviewedRecords = [...baseline, ...targetRecords.slice(1), ...sourceRecords.slice(1)]
    const reviewedSnapshot = buildCollaborationSnapshotFiles(reviewedRecords, 'portable-project')

    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    prismaState.client = client as unknown as Record<PropertyKey, unknown>
    try {
      const target = await client.targetProject.create({
        data: {
          id: 'public-divergent-target',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${local}`,
          canonicalPath: local,
          displayName: 'Public divergent receive target',
          fingerprint: `sha256:${'d'.repeat(64)}`,
        },
      })
      const connected = await connectCollaboration(
        {
          targetProjectId: target.id,
          repositoryRoot: local,
          trackedBranch: 'appraise-0.5',
          portableProjectId: 'portable-project',
          trustedPrincipalId: 'system-seed',
          provenance: 'authenticated-host',
        },
        client,
      )
      const binding = await updateCollaborationPolicy(
        {
          bindingId: connected.id,
          changes: { INTEGRATE: true, RESOLVE: true, PUSH: true },
          trustedPrincipalId: 'system-seed',
          provenance: 'authenticated-host',
        },
        client,
      )
      process.chdir(hub)
      const api = await createCoordinatorClient({
        cwd: hub,
        baseUrl: await startCoordinatorRouteServer(),
        coordinatorId: 'public-divergent-proof',
      })

      const prepared = (await api.collaborationPrepare({
        target: target.id,
        intent: 'RECEIVE',
        idempotencyKey: 'public-divergent-receive',
        expectedPolicyVersion: binding.policyVersion,
      })) as { operation: { id: string; state: string; version: number; preparedDigest: string } }
      expect(prepared.operation).toMatchObject({ state: 'QUEUED', preparedDigest: expect.stringMatching(/^sha256:/) })
      const preparedReplay = (await api.collaborationPrepare({
        target: target.id,
        intent: 'RECEIVE',
        idempotencyKey: 'public-divergent-receive',
        expectedPolicyVersion: binding.policyVersion,
      })) as { operation: { id: string; state: string } }
      expect(preparedReplay.operation).toMatchObject({ id: prepared.operation.id, state: 'QUEUED' })
      expect(
        await client.collaborationOperation.findUniqueOrThrow({
          where: { id: prepared.operation.id },
          select: { intent: true, steps: { orderBy: { ordinal: 'asc' }, select: { kind: true } } },
        }),
      ).toEqual({
        intent: 'RECONCILE',
        steps: [
          { kind: 'CREATE_MERGE_COMMIT' },
          { kind: 'FAST_FORWARD_LOCAL' },
          { kind: 'APPLY_DATABASE' },
          { kind: 'PUSH_REMOTE' },
          { kind: 'CLEANUP_WORKTREE' },
          { kind: 'FINALIZE' },
        ],
      })

      // Preparation intentionally debounces a handoff. Advance only the route
      // clock, rather than sleeping, so the one-time interactive handoff can
      // atomically create its bounded worker session and claim a due job.
      routeNow = new Date(Date.now() + 5_000)
      const handoff = await createCollaborationHandoffTicket(
        {
          bindingId: binding.id,
          operationId: prepared.operation.id,
          // Scope is intentionally never echoed through public redemption;
          // the worker receives only the durable sanitized assignment below.
          scope: { repositoryRoot: local, credential: 'must-not-leak' },
        },
        client,
      )
      const redeemed = (await api.collaborationHandoffRedeem({
        target: target.id,
        token: handoff.token,
        redeemedBy: 'public-interactive-agent',
      })) as {
        worker: { workerIdentity: string; sessionNonce: string; expiresAt: string }
        work: WorkLease & { assignment: { operationId: string; records: CollaborationRecord[] } }
      }
      expect(JSON.stringify(redeemed)).not.toContain(local)
      expect(redeemed.work.assignment).toMatchObject({ operationId: prepared.operation.id, records: sourceRecords })
      await expect(
        api.collaborationHandoffRedeem({ target: target.id, token: handoff.token, redeemedBy: 'replay-agent' }),
      ).rejects.toMatchObject({
        status: 409,
        envelope: { classification: 'state_conflict', code: 'CONFLICT' },
      })
      const claimedOperation = await client.collaborationOperation.findUnique({
        where: { id: prepared.operation.id },
        select: { state: true, nextAttemptAt: true, artifacts: { select: { kind: true } } },
      })
      expect(claimedOperation).toMatchObject({
        state: 'WAITING_FOR_AGENT',
        nextAttemptAt: null,
        artifacts: expect.arrayContaining([expect.objectContaining({ kind: 'DIVERGENT_PREPARATION' })]),
      })
      const claimed = redeemed
      expect(claimed.work).not.toBeNull()

      // The credentials returned by redemption are sufficient for exactly the
      // existing public completion boundary, and no reviewer authority.
      const proposed = (await api.collaborationWorkComplete({
        target: target.id,
        workerIdentity: redeemed.worker.workerIdentity,
        sessionNonce: redeemed.worker.sessionNonce,
        ...publicLease(claimed.work),
        proposal: { records: reviewedRecords },
      })) as { operation: { id: string; state: string; version: number; preparedDigest: string } }
      expect(proposed.operation).toMatchObject({ id: prepared.operation.id, state: 'WAITING_FOR_DECISION' })

      const proposalArtifact = await client.collaborationOperationArtifact.findFirstOrThrow({
        where: { operationId: prepared.operation.id, kind: 'DIVERGENT_PROPOSAL_REVIEW' },
        orderBy: { revision: 'desc' },
      })
      const proposalPayload = JSON.parse(proposalArtifact.payloadJson) as { review: { reviewDigest: string } }
      const decisionRequest = {
        target: target.id,
        operationId: prepared.operation.id,
        expectedVersion: proposed.operation.version,
        preparedDigest: proposed.operation.preparedDigest,
        reviewDigest: `sha256:${proposalPayload.review.reviewDigest}`,
        decision: 'ACCEPT' as const,
      }
      const receipt = await issueCollaborationAuthorityReceipt(
        {
          bindingId: binding.id,
          action: 'DECIDE',
          operationId: prepared.operation.id,
          expectedPolicyVersion: binding.policyVersion,
          request: decisionRequest,
          trustedPrincipalId: 'local-ui-proof',
          provenance: 'local-ui',
        },
        client,
      )
      const accepted = (await api.collaborationDecide(decisionRequest, receipt.token)) as {
        operation: { id: string; state: string; version: number; preparedDigest: string; sourceRevision: string }
      }
      // An exact public acceptance advances the whole persisted, authorized
      // operation plan. The coordinator never receives a caller-selected Git
      // step, and the UI/public caller does not need six execute requests.
      expect(accepted.operation).toMatchObject({ id: prepared.operation.id, state: 'COMPLETED' })

      const finalStep = await client.collaborationOperationStep.findFirstOrThrow({
        where: { operationId: prepared.operation.id, kind: 'FINALIZE' },
        select: { requestVersion: true },
      })
      const replay = (await api.collaborationExecute({
        target: target.id,
        operationId: accepted.operation.id,
        expectedVersion: finalStep.requestVersion!,
        preparedDigest: accepted.operation.preparedDigest,
        idempotencyKey: 'public-divergent-receive',
      })) as {
        operation: { id: string; state: string; version: number; preparedDigest: string; sourceRevision: string }
      }
      // A dropped public terminal response must replay from the request's
      // original pre-completion version, rather than from terminal status.
      expect(replay.operation).toMatchObject({ id: accepted.operation.id, state: 'COMPLETED' })

      const mergeCommit = accepted.operation.sourceRevision
      expect((await git(local, 'rev-list', '--parents', '-n', '1', mergeCommit)).split(' ')).toEqual([
        mergeCommit,
        sourceRevision,
        targetRevision,
      ])
      expect((await readCollaborationSnapshot(path.join(local, 'appraise', 'collaboration'))).snapshotHash).toBe(
        reviewedSnapshot.snapshotHash,
      )
      expect(await git(local, 'ls-remote', 'origin', 'refs/heads/appraise-0.5')).toContain(mergeCommit)
      expect(await client.module.findMany({ where: { targetProjectId: target.id }, orderBy: { name: 'asc' } })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Base', collaborationManaged: true }),
          expect.objectContaining({ name: 'Source only', collaborationManaged: true }),
          expect.objectContaining({ name: 'Target only', collaborationManaged: true }),
        ]),
      )
      expect(await client.collaborationBaseline.count({ where: { repositoryRevision: mergeCommit } })).toBe(3)
      const worktrees = await git(local, 'worktree', 'list', '--porcelain')
      expect(worktrees).not.toContain(`appraise-collaboration-${prepared.operation.id}-`)
    } finally {
      await client.$disconnect()
    }
  }, 30_000)

  it('rejects local-ahead, unrelated-history, and foreign-path receives through the public client', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-public-receive-rejections-'))
    workspaces.push(workspace)
    const hub = path.join(workspace, 'hub')
    const databasePath = path.join(workspace, 'appraise.db')
    await fs.mkdir(hub)
    await fs.writeFile(path.join(hub, 'package.json'), '{"name":"public-rejections-hub"}\n')
    await copyMigratedTestDatabase(databasePath)
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    prismaState.client = client as unknown as Record<PropertyKey, unknown>
    try {
      process.chdir(hub)
      const api = await createCoordinatorClient({
        cwd: hub,
        baseUrl: await startCoordinatorRouteServer(),
        coordinatorId: 'public-rejections-proof',
      })
      const bind = async (id: string, repositoryRoot: string) => {
        const target = await client.targetProject.create({
          data: {
            id,
            kind: 'LOCAL_WORKSPACE',
            canonicalIdentity: `path:${repositoryRoot}`,
            canonicalPath: repositoryRoot,
            displayName: `${id} target`,
            fingerprint: `sha256:${id.padEnd(64, 'e').slice(0, 64)}`,
          },
        })
        const binding = await connectCollaboration(
          {
            targetProjectId: target.id,
            repositoryRoot,
            trackedBranch: 'appraise-0.5',
            portableProjectId: 'portable-project',
            trustedPrincipalId: 'system-seed',
            provenance: 'authenticated-host',
          },
          client,
        )
        return { target, binding }
      }
      const initializeClone = async (name: string) => {
        const remote = path.join(workspace, `${name}.git`)
        const local = path.join(workspace, `${name}-local`)
        await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', remote])
        await execFile('git', ['clone', remote, local])
        await git(local, 'config', 'user.email', 'collaboration@example.test')
        await git(local, 'config', 'user.name', 'Collaboration Test')
        await writeSnapshot(local, [moduleRecord(`${name}-base`, 'Base')])
        await commitSnapshot(local, `${name} baseline`)
        await git(local, 'push', 'origin', 'appraise-0.5')
        return { remote, local }
      }
      const publicReceive = async (target: { id: string }, policyVersion: number, idempotencyKey: string) =>
        (await api.collaborationPrepare({
          target: target.id,
          intent: 'RECEIVE',
          idempotencyKey,
          expectedPolicyVersion: policyVersion,
        })) as { operation: { id: string; state: string } }

      const localAhead = await initializeClone('local-ahead')
      await writeSnapshot(localAhead.local, [
        moduleRecord('local-ahead-base', 'Base'),
        moduleRecord('local-ahead-only', 'Local only'),
      ])
      await commitSnapshot(localAhead.local, 'local ahead collaboration change')
      const localAheadBinding = await bind('public-local-ahead', localAhead.local)
      const localAheadResult = await publicReceive(
        localAheadBinding.target,
        localAheadBinding.binding.policyVersion,
        'public-local-ahead',
      )
      expect(localAheadResult.operation.state).toBe('BLOCKED')
      expect(
        await client.collaborationOperation.findUniqueOrThrow({ where: { id: localAheadResult.operation.id } }),
      ).toMatchObject({
        intent: 'RECEIVE',
        state: 'BLOCKED',
        blockerJson: expect.stringContaining('LOCAL_AHEAD'),
      })

      const foreign = await initializeClone('foreign-path')
      const foreignIncoming = path.join(workspace, 'foreign-path-incoming')
      await writeSnapshot(foreign.local, [
        moduleRecord('foreign-path-base', 'Base'),
        moduleRecord('foreign-path-local', 'Local only'),
      ])
      await commitSnapshot(foreign.local, 'local collaboration change')
      await execFile('git', ['clone', foreign.remote, foreignIncoming])
      await git(foreignIncoming, 'config', 'user.email', 'collaboration@example.test')
      await git(foreignIncoming, 'config', 'user.name', 'Collaboration Test')
      await writeSnapshot(foreignIncoming, [
        moduleRecord('foreign-path-base', 'Base'),
        moduleRecord('foreign-path-remote', 'Remote only'),
      ])
      await fs.writeFile(path.join(foreignIncoming, 'foreign-code.txt'), 'not collaboration data\n')
      await git(foreignIncoming, 'add', 'appraise/collaboration', 'foreign-code.txt')
      await git(foreignIncoming, 'commit', '-m', 'remote change with foreign path')
      await git(foreignIncoming, 'push', 'origin', 'appraise-0.5')
      await git(foreign.local, 'fetch', 'origin', 'appraise-0.5')
      const foreignBinding = await bind('public-foreign-path', foreign.local)
      const foreignResult = await publicReceive(
        foreignBinding.target,
        foreignBinding.binding.policyVersion,
        'public-foreign-path',
      )
      expect(foreignResult.operation.state).toBe('BLOCKED')
      expect(
        await client.collaborationOperation.findUniqueOrThrow({ where: { id: foreignResult.operation.id } }),
      ).toMatchObject({
        intent: 'RECEIVE',
        state: 'BLOCKED',
        blockerJson: expect.stringContaining('FOREIGN_PATH_DIVERGENCE'),
      })
      expect(
        await client.collaborationOperationArtifact.count({
          where: { operationId: foreignResult.operation.id, kind: 'DIVERGENT_PREPARATION' },
        }),
      ).toBe(0)

      const unrelatedRemote = path.join(workspace, 'unrelated.git')
      const unrelatedLocal = path.join(workspace, 'unrelated-local')
      const unrelatedIncoming = path.join(workspace, 'unrelated-incoming')
      await execFile('git', ['init', '--bare', '--initial-branch=appraise-0.5', unrelatedRemote])
      await execFile('git', ['init', '--initial-branch=appraise-0.5', unrelatedLocal])
      await git(unrelatedLocal, 'config', 'user.email', 'collaboration@example.test')
      await git(unrelatedLocal, 'config', 'user.name', 'Collaboration Test')
      await git(unrelatedLocal, 'remote', 'add', 'origin', unrelatedRemote)
      await writeSnapshot(unrelatedLocal, [moduleRecord('unrelated-local', 'Local')])
      await commitSnapshot(unrelatedLocal, 'unrelated local root')
      await execFile('git', ['clone', unrelatedRemote, unrelatedIncoming])
      await git(unrelatedIncoming, 'config', 'user.email', 'collaboration@example.test')
      await git(unrelatedIncoming, 'config', 'user.name', 'Collaboration Test')
      await writeSnapshot(unrelatedIncoming, [moduleRecord('unrelated-remote', 'Remote')])
      await commitSnapshot(unrelatedIncoming, 'unrelated remote root')
      await git(unrelatedIncoming, 'push', 'origin', 'appraise-0.5')
      const unrelatedBinding = await bind('public-unrelated', unrelatedLocal)
      const unrelatedResult = await publicReceive(
        unrelatedBinding.target,
        unrelatedBinding.binding.policyVersion,
        'public-unrelated',
      )
      expect(unrelatedResult.operation.state).toBe('BLOCKED')
      expect(
        await client.collaborationOperation.findUniqueOrThrow({ where: { id: unrelatedResult.operation.id } }),
      ).toMatchObject({
        intent: 'RECEIVE',
        state: 'BLOCKED',
        blockerJson: expect.stringContaining('UNRELATED_HISTORY'),
      })
    } finally {
      await client.$disconnect()
    }
  }, 30_000)

  it('proves expiry fencing and single-use handoff through the public client', async () => {
    const beginning = new Date('2026-09-09T00:00:00.000Z')

    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-public-collaboration-'))
    workspaces.push(workspace)
    const hub = path.join(workspace, 'hub')
    const targetWorkspace = path.join(workspace, 'target')
    const databasePath = path.join(workspace, 'appraise.db')
    await Promise.all([fs.mkdir(hub), fs.mkdir(path.join(targetWorkspace, '.git'), { recursive: true })])
    await fs.writeFile(path.join(hub, 'package.json'), '{"name":"public-collaboration-hub"}\n')
    await copyMigratedTestDatabase(databasePath)

    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
    prismaState.client = client as unknown as Record<PropertyKey, unknown>

    try {
      const target = await client.targetProject.create({
        data: {
          id: 'public-target',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: `path:${targetWorkspace}`,
          canonicalPath: targetWorkspace,
          displayName: 'Public worker target',
          fingerprint: `sha256:${'a'.repeat(64)}`,
        },
      })
      const connected = await connectCollaboration(
        {
          targetProjectId: target.id,
          repositoryRoot: targetWorkspace,
          trackedBranch: 'appraise-0.5',
          portableProjectId: 'public-worker-proof',
          trustedPrincipalId: 'system-seed',
          provenance: 'authenticated-host',
        },
        client,
      )
      const binding = await updateCollaborationPolicy(
        {
          bindingId: connected.id,
          changes: { INTEGRATE: true },
          trustedPrincipalId: 'system-seed',
          provenance: 'authenticated-host',
        },
        client,
      )
      const operation = await scheduleCollaborationOperation(
        {
          bindingId: binding.id,
          intent: 'RECONCILE',
          idempotencyKey: 'public-worker-proof',
          trigger: 'system-seed',
          policyVersion: binding.policyVersion,
          sourceRevision: 'seeded-source-revision',
          now: beginning,
        },
        client,
      )
      // The first test proves that a normal public RECEIVE creates this exact
      // durable reconciliation assignment. This focused fencing test starts
      // after that preparation boundary so it can isolate lease replacement.
      await client.collaborationOperation.update({
        where: { id: operation.id },
        data: {
          preparedJson: JSON.stringify({ incoming: [] }),
          preparedDigest: 'a'.repeat(64),
          targetRevision: 'b'.repeat(40),
        },
      })
      await client.collaborationOperationArtifact.create({
        data: {
          operationId: operation.id,
          kind: 'DIVERGENT_PREPARATION',
          revision: 1,
          payloadJson: '{}',
          payloadHash: 'c'.repeat(64),
        },
      })
      const handoff = await createCollaborationHandoffTicket(
        {
          bindingId: binding.id,
          operationId: operation.id,
          scope: { operation: 'proposal' },
          now: beginning,
        },
        client,
      )

      process.chdir(hub)
      const api = await createCoordinatorClient({
        cwd: hub,
        baseUrl: await startCoordinatorRouteServer(),
        coordinatorId: 'proof',
      })

      routeNow = new Date(beginning.getTime() + 2_000)
      const registeredA = (await api.collaborationWorkerRegister({
        target: target.id,
        workerIdentity: 'worker-a',
        capabilities: ['proposal'],
        ttlMs: 60_000,
      })) as { sessionNonce: string }
      const firstClaim = (await api.collaborationWorkClaim({
        target: target.id,
        workerIdentity: 'worker-a',
        sessionNonce: registeredA.sessionNonce,
        leaseMs: 1_000,
      })) as { work: { operationId: string; attemptId: string; fencingToken: number; leaseToken: string } }
      expect(firstClaim.work).toMatchObject({ operationId: operation.id, fencingToken: 1 })
      const firstLease = publicLease(firstClaim.work)

      await api.collaborationWorkHeartbeat({
        target: target.id,
        workerIdentity: 'worker-a',
        sessionNonce: registeredA.sessionNonce,
        ...firstLease,
        leaseMs: 1_000,
      })
      const registeredB = (await api.collaborationWorkerRegister({
        target: target.id,
        workerIdentity: 'worker-b',
        capabilities: ['proposal'],
        ttlMs: 60_000,
      })) as { sessionNonce: string }
      await expect(
        api.collaborationWorkClaim({
          target: target.id,
          workerIdentity: 'worker-b',
          sessionNonce: registeredB.sessionNonce,
        }),
      ).resolves.toMatchObject({ targetProjectId: target.id, work: null })

      routeNow = new Date(beginning.getTime() + 4_000)
      await recoverExpiredCollaborationLeases(routeNow, client)

      const replacementClaim = (await api.collaborationWorkClaim({
        target: target.id,
        workerIdentity: 'worker-b',
        sessionNonce: registeredB.sessionNonce,
      })) as { work: { operationId: string; attemptId: string; fencingToken: number; leaseToken: string } }
      expect(replacementClaim.work.fencingToken).toBeGreaterThan(firstClaim.work.fencingToken)
      await expect(
        api.collaborationWorkHeartbeat({
          target: target.id,
          workerIdentity: 'worker-a',
          sessionNonce: registeredA.sessionNonce,
          ...firstLease,
        }),
      ).rejects.toMatchObject({
        status: 409,
        envelope: { classification: 'state_conflict', code: 'CONFLICT' },
      })

      await expect(
        api.collaborationHandoffRedeem({ target: target.id, token: handoff.token, redeemedBy: 'worker-b' }),
      ).rejects.toMatchObject({
        status: 409,
        envelope: { classification: 'state_conflict', code: 'CONFLICT' },
      })
      // A failed competing redemption must not consume the ticket. It remains
      // bound to this operation but cannot bypass the active replacement lease.
      await expect(
        api.collaborationHandoffRedeem({ target: target.id, token: handoff.token, redeemedBy: 'worker-replay' }),
      ).rejects.toMatchObject({
        status: 409,
        envelope: { classification: 'state_conflict', code: 'CONFLICT' },
      })
    } finally {
      await client.$disconnect()
    }
  }, 15_000)
})
