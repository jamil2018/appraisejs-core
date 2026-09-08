import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCoordinatorClient } from '../../../../../../packages/appraisejs/src/coordinator-client'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { POST } from './route'
import { connectCollaboration, updateCollaborationPolicy } from '@/services/repository-collaboration/binding-service'
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

type WorkLease = { operationId: string; attemptId: string; fencingToken: number; leaseToken: string }

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
  it('proves expiry fencing, proposal-only completion, and single-use handoff through the public client', async () => {
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
      const replacementLease = publicLease(replacementClaim.work)

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

      const completed = (await api.collaborationWorkComplete({
        target: target.id,
        workerIdentity: 'worker-b',
        sessionNonce: registeredB.sessionNonce,
        ...replacementLease,
        proposal: { kind: 'RECONCILIATION_PROPOSAL', records: [], summary: 'Awaiting a decision.' },
      })) as { operation: { id: string; state: string } }
      expect(completed.operation).toEqual(expect.objectContaining({ id: operation.id, state: 'WAITING_FOR_DECISION' }))

      await expect(
        api.collaborationHandoffRedeem({ target: target.id, token: handoff.token, redeemedBy: 'worker-b' }),
      ).resolves.toMatchObject({ operationId: operation.id, scope: { operation: 'proposal' } })
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
