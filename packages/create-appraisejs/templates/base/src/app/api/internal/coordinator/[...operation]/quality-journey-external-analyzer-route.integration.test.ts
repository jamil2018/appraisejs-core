import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'

let directory: string
let client: PrismaClient
let projectFingerprint: string
let journeyId: string
let originalCwd: string
let originalDatabaseUrl: string | undefined
let POST: (request: Request, context: { params: Promise<{ operation: string[] }> }) => Promise<Response>

function routeContext() {
  return { params: Promise.resolve({ operation: ['quality', 'journeys', journeyId, 'external-analyzer', 'claim'] }) }
}

function request(body: unknown, project = projectFingerprint) {
  return new Request(
    'http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-external-route/external-analyzer/claim',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: '127.0.0.1:3000',
        authorization: 'Bearer fixture-token',
        'x-appraise-project': project,
      },
      body: JSON.stringify(body),
    },
  )
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'journey-external-route-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  await client.targetProject.create({
    data: {
      id: 'target-external-route',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: 'workspace:external-route',
      canonicalPath: directory,
      displayName: 'External Analyzer route target',
      fingerprint: 'external-route',
    },
  })
  originalCwd = process.cwd()
  originalDatabaseUrl = process.env.DATABASE_URL
  process.chdir(directory)
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'external-route-guard-fixture' }))
  const identity = await deriveCoordinatorProjectIdentity(directory)
  projectFingerprint = identity.projectFingerprint
  await mkdir(path.join(directory, '.appraisejs'))
  await writeFile(
    path.join(directory, '.appraisejs', 'coordinator.json'),
    JSON.stringify({ projectFingerprint, token: 'fixture-token' }),
  )
  process.env.DATABASE_URL = `file:${database}`
  const { createQualityJourney, submitDurableQualityJourneyCommand } =
    await import('@/services/coordinator/quality-journey-service')
  const created = await createQualityJourney(
    {
      targetProjectId: 'target-external-route',
      idempotencyKey: 'external-route-create',
      requirement: { objective: 'Verify external Analyzer ingress.' },
    },
    client,
  )
  journeyId = created.journey.journeyId
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'external-route-submit',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-external-route',
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'external-route-submit',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
    },
    client,
  )
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

it('rejects a client principal and derives the only external principal from the guarded project credential', async () => {
  const forged = await POST(
    request({ target: 'target-external-route', principalId: 'forged-principal' }),
    routeContext(),
  )
  expect(forged.status).toBe(400)
  await expect(forged.json()).resolves.toMatchObject({
    code: 'VALIDATION',
    classification: 'request_invalid',
    operationOutcome: 'not_started',
  })
  expect(await client.qualityJourneyWorkAttempt.count()).toBe(0)

  const forgedRole = await POST(request({ target: 'target-external-route', role: 'SCOUT' }), routeContext())
  expect(forgedRole.status).toBe(400)
  await expect(forgedRole.json()).resolves.toMatchObject({ code: 'VALIDATION', operationOutcome: 'not_started' })
  expect(await client.qualityJourneyWorkAttempt.count()).toBe(0)

  const accepted = await POST(
    request({
      target: 'target-external-route',
      assignmentSecret: 'x'.repeat(32),
      idempotencyKey: 'external-route-claim',
    }),
    routeContext(),
  )
  expect(accepted.status).toBe(200)
  await expect(accepted.json()).resolves.toMatchObject({
    executionMode: 'EXTERNAL_V1',
    attempt: {
      externalPrincipalId: `coordinator:${projectFingerprint}`,
      externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
      spawnRequestId: null,
      spawnReceiptId: null,
    },
  })
})
