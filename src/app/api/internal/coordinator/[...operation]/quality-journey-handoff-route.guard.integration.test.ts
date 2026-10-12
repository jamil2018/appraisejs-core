import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

const ticket = `qjh_${'a'.repeat(32)}`
const ticketHash = `sha256:${createHash('sha256').update(ticket).digest('hex')}`
const operation = ['quality', 'journeys', 'journey-handoff-route', 'handoff', 'redeem']
type RouteContext = { params: Promise<{ operation: string[] }> }
const context: RouteContext = { params: Promise.resolve({ operation }) }
let directory: string
let client: PrismaClient
let projectFingerprint: string
let originalCwd: string
let originalDatabaseUrl: string | undefined
let POST: (request: Request, context: RouteContext) => Promise<Response>

function request(input: { authorization?: string; project?: string } = {}) {
  const headers = new Headers({
    'content-type': 'application/json',
    host: '127.0.0.1:3000',
  })
  if (input.authorization !== undefined) headers.set('authorization', input.authorization)
  if (input.project !== undefined) headers.set('x-appraise-project', input.project)
  return new Request(
    'http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-handoff-route/handoff/redeem',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ target: 'target-handoff-route', ticket }),
    },
  )
}

function mutationRequest(operation: string[], body: Record<string, unknown>) {
  const headers = new Headers({
    'content-type': 'application/json',
    host: '127.0.0.1:3000',
    authorization: 'Bearer fixture-token',
    'x-appraise-project': projectFingerprint,
  })
  return new Request(`http://127.0.0.1:3000/api/internal/coordinator/${operation.join('/')}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'journey-handoff-route-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  await client.targetProject.create({
    data: {
      id: 'target-handoff-route',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: 'workspace:handoff-route',
      canonicalPath: directory,
      displayName: 'Route handoff target',
      fingerprint: 'handoff-route',
    },
  })
  await client.qualityJourney.create({
    data: {
      id: 'journey-handoff-route',
      targetProjectId: 'target-handoff-route',
      rootIdempotencyKey: 'route-handoff',
      rootRequestHash: `sha256:${'b'.repeat(64)}`,
      activeCycleId: 'cycle-handoff-route',
      activeRevisionIdsJson: '{}',
      stateHash: `sha256:${'c'.repeat(64)}`,
    },
  })
  await client.qualityJourneyCoordinatorHandoff.create({
    data: {
      id: 'handoff-route',
      journeyId: 'journey-handoff-route',
      targetProjectId: 'target-handoff-route',
      providerId: 'codex',
      journeyStateHash: `sha256:${'c'.repeat(64)}`,
      journeyStage: 'INTAKE',
      revisionSnapshotHash: `sha256:${createHash('sha256').update('{}').digest('hex')}`,
      workSnapshotHash: `sha256:${createHash('sha256').update('{"items":[],"authorizations":[],"attempts":[]}').digest('hex')}`,
      eventSequence: 0,
      targetReferenceHash: `sha256:${createHash('sha256').update('workspace:handoff-route').digest('hex')}`,
      ticketHash,
      promptHash: `sha256:${'d'.repeat(64)}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  })

  originalCwd = process.cwd()
  originalDatabaseUrl = process.env.DATABASE_URL
  process.chdir(directory)
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'route-guard-fixture' }))
  const identity = await deriveCoordinatorProjectIdentity(directory)
  projectFingerprint = identity.projectFingerprint
  await mkdir(path.join(directory, '.appraisejs'))
  await writeFile(
    path.join(directory, '.appraisejs', 'coordinator.json'),
    JSON.stringify({ projectFingerprint, token: 'fixture-token' }),
  )
  process.env.DATABASE_URL = `file:${database}`
  ;({ POST } = await import('./route'))
})

afterAll(async () => {
  const routeClient = (await import('@/config/db-config')).default
  await routeClient.$disconnect()
  await client.$disconnect()
  process.chdir(originalCwd)
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalDatabaseUrl
  await rm(directory, { recursive: true, force: true })
})

it('rejects invalid bearer and project credentials before redemption, then accepts the untouched ticket', async () => {
  const invalidBearer = await POST(
    request({ authorization: 'Bearer wrong-token', project: projectFingerprint }),
    context,
  )
  expect(invalidBearer.status).toBe(401)
  await expect(invalidBearer.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    classification: 'authorization_failure',
    operationOutcome: 'not_started',
  })

  const missingProject = await POST(request({ authorization: 'Bearer fixture-token' }), context)
  expect(missingProject.status).toBe(401)
  await expect(missingProject.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    classification: 'authorization_failure',
    operationOutcome: 'not_started',
  })

  const mismatchedProject = await POST(
    request({ authorization: 'Bearer fixture-token', project: `sha256:${'e'.repeat(64)}` }),
    context,
  )
  expect(mismatchedProject.status).toBe(409)
  await expect(mismatchedProject.json()).resolves.toMatchObject({
    code: 'CONFLICT',
    classification: 'state_conflict',
    operationOutcome: 'not_started',
    targetOutcome: 'not_committed',
    details: { boundary: 'project_identity' },
  })

  await expect(
    client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: 'handoff-route' } }),
  ).resolves.toMatchObject({
    status: 'PREPARED',
    connectedAt: null,
  })

  const redemption = await POST(
    request({ authorization: 'Bearer fixture-token', project: projectFingerprint }),
    context,
  )
  expect(redemption.status).toBe(200)
  await expect(redemption.json()).resolves.toMatchObject({ handoffId: 'handoff-route', providerId: 'codex' })
})

it('rejects every stale coordinator-facing Journey mutation before it can mutate state', async () => {
  await client.qualityJourneyCoordinatorHandoff.create({
    data: {
      id: 'handoff-effective',
      journeyId: 'journey-handoff-route',
      targetProjectId: 'target-handoff-route',
      providerId: 'codex',
      generation: 2,
      ticketHash: `sha256:${'e'.repeat(64)}`,
      promptHash: `sha256:${'f'.repeat(64)}`,
      expiresAt: new Date(Date.now() + 60_000),
      status: 'CONNECTED',
      connectedAt: new Date(),
      takeoverAt: new Date(),
    },
  })
  const staleSession = { coordinatorHandoffId: 'handoff-route', coordinatorGeneration: 1 }
  const operations = [
    ['quality', 'journeys', 'journey-handoff-route', 'resume'],
    ['quality', 'journeys', 'journey-handoff-route', 'commands'],
    ['quality', 'journeys', 'journey-handoff-route', 'work', 'work-missing', 'cancel'],
    ['quality', 'journeys', 'journey-handoff-route', 'work', 'work-missing', 'revoke'],
    ['quality', 'journeys', 'journey-handoff-route', 'work', 'work-missing', 'complete'],
    ['quality', 'journeys', 'journey-handoff-route', 'analysis', 'answers'],
    ['quality', 'journeys', 'journey-handoff-route', 'execution', 'start'],
    ['quality', 'journeys', 'journey-handoff-route', 'triage', 'prepare'],
  ]
  const before = await client.qualityJourney.findUniqueOrThrow({ where: { id: 'journey-handoff-route' } })
  for (const operation of operations) {
    const response = await POST(mutationRequest(operation, { target: 'target-handoff-route', ...staleSession }), {
      params: Promise.resolve({ operation }),
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', operationOutcome: 'not_started' })
  }
  const locatorRowsBefore = await client.locator.count({ where: { targetProjectId: 'target-handoff-route' } })
  const locatorResponse = await POST(
    mutationRequest(['locators', 'ensure'], {
      target: 'target-handoff-route',
      journeyId: 'journey-handoff-route',
      ...staleSession,
      group: { mode: 'existing', id: 'group-missing' },
      locator: { name: 'Checkout', selector: '[data-test=checkout]' },
    }),
    { params: Promise.resolve({ operation: ['locators', 'ensure'] }) },
  )
  expect(locatorResponse.status).toBe(403)
  await expect(locatorResponse.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', operationOutcome: 'not_started' })
  await expect(client.locator.count({ where: { targetProjectId: 'target-handoff-route' } })).resolves.toBe(
    locatorRowsBefore,
  )
  await expect(
    client.qualityJourney.findUniqueOrThrow({ where: { id: 'journey-handoff-route' } }),
  ).resolves.toMatchObject({
    version: before.version,
    stateHash: before.stateHash,
  })
})
