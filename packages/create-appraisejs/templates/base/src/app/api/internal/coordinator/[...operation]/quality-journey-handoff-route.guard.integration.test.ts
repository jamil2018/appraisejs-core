import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
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
      hostingMode: 'EXTERNAL_LEGACY',
      hostingProvenance: 'CREATED_COMPATIBILITY_V1',
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

it('reads a managed accepted outcome after transfer without current-session authority and refuses forged secrets', async () => {
  const {
    createQualityJourney,
    submitDurableQualityJourneyCommand,
    claimExternalQualityJourneyWork,
    admitExternalQualityJourneyWork,
    acceptExternalQualityJourneySubmissionInTransaction,
    cancelQualityJourneyWork,
  } = await import('@/services/coordinator/quality-journey-service')
  const {
    registerQualityJourneyCoordinatorSession: register,
    activateQualityJourneyCoordinatorSession: activate,
    transferQualityJourneyCoordinatorSession: transfer,
  } = await import('@/services/coordinator/quality-journey-session-service')
  const created = await createQualityJourney(
    {
      targetProjectId: 'target-handoff-route',
      idempotencyKey: 'managed-outcome-route',
      requirement: { objective: 'Read a durable outcome across managed transfer.' },
      hostingMode: 'APP_SERVER_LOCAL_V1',
    },
    client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId: 'target-handoff-route' }
  const principal = { principalId: `coordinator:${projectFingerprint}`, assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
  const candidate = await register(
    { ...scope, ownerPrincipalId: principal.principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'first' },
    client,
  )
  const first = await activate(
    {
      ...scope,
      authority: trustedHumanCoordinatorSession,
      coordinatorPrincipalId: principal.principalId,
      coordinatorSessionId: candidate.session.id,
      requestId: 'activate',
      expectedOwnershipVersion: 0,
      expectedStateHash: created.journey.stateHash,
      approvedBy: 'local-ui',
    },
    client,
  )
  const credentials = {
    coordinatorSessionId: first.coordinatorSessionId,
    coordinatorGeneration: first.coordinatorGeneration,
    coordinatorPrincipalId: principal.principalId,
  }
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'route-managed-confirm',
      ...scope,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      idempotencyKey: 'route-managed-confirm',
      inputArtifactRefs: [],
      payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
    },
    client,
    trustedHumanCoordinatorSession,
  )
  const assignmentSecret = 'route-managed-assignment-secret-0123456789'
  const claimed = await claimExternalQualityJourneyWork(
    {
      ...scope,
      ...credentials,
      role: 'REQUIREMENT_ANALYZER',
      principal,
      assignmentSecret,
      idempotencyKey: 'route-managed-claim',
    },
    client,
  )
  const binding = {
    ...scope,
    ...credentials,
    role: 'REQUIREMENT_ANALYZER' as const,
    principal,
    assignmentSecret,
    workItemId: claimed.attempt.workItemId,
    attemptId: claimed.attempt.id,
    assignmentId: claimed.attempt.assignmentId!,
    assignmentGeneration: claimed.attempt.assignmentGeneration,
    leaseId: claimed.attempt.leaseId,
  }
  await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: 'route-managed-admit' }, client)
  const outcome = { artifactId: 'route-accepted-artifact', accepted: true }
  await client.$transaction(tx =>
    acceptExternalQualityJourneySubmissionInTransaction(
      {
        ...binding,
        operation: 'ANALYSIS_SUBMIT',
        idempotencyKey: 'route-managed-accepted',
        payload: { fixture: 'route-only-outcome' },
      },
      tx,
      async () => {
        await tx.qualityJourneyArtifact.create({
          data: {
            id: outcome.artifactId,
            identityKey: outcome.artifactId,
            ...scope,
            cycleId: created.journey.activeCycleId,
            kind: 'ROUTE_FIXTURE',
            artifactId: outcome.artifactId,
            contentHash: `sha256:${'a'.repeat(64)}`,
            artifactJson: JSON.stringify(outcome),
          },
        })
        return outcome
      },
    ),
  )
  await cancelQualityJourneyWork(
    {
      ...scope,
      ...credentials,
      workItemId: claimed.attempt.workItemId,
      actor: 'USER',
      reason: 'Explicitly quiesce the disposable route fixture.',
    },
    client,
  )
  const successor = await register(
    { ...scope, ownerPrincipalId: principal.principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: 'second' },
    client,
  )
  const current = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  await transfer(
    {
      ...scope,
      authority: trustedHumanCoordinatorSession,
      coordinatorPrincipalId: principal.principalId,
      successorSessionId: successor.session.id,
      predecessorSessionId: first.coordinatorSessionId,
      predecessorGeneration: first.coordinatorGeneration,
      requestId: 'transfer',
      expectedOwnershipVersion: current.ownershipVersion,
      expectedStateHash: current.stateHash,
      approvedBy: 'local-ui',
      reconciliationReceiptId: 'route-fixture-quiescent',
    },
    client,
  )
  const path = ['quality', 'journeys', scope.journeyId, 'external-work', 'outcomes']
  const body = {
    target: scope.targetProjectId,
    role: binding.role,
    operation: 'ANALYSIS_SUBMIT',
    workItemId: binding.workItemId,
    attemptId: binding.attemptId,
    assignmentId: binding.assignmentId,
    assignmentGeneration: binding.assignmentGeneration,
    leaseId: binding.leaseId,
    assignmentSecret,
    idempotencyKey: 'route-managed-accepted',
  }
  const before = await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })
  const result = await POST(mutationRequest(path, body), { params: Promise.resolve({ operation: path }) })
  expect(result.status).toBe(200)
  await expect(result.json()).resolves.toMatchObject({ replayed: true, outcome })
  for (const [action, payload] of [
    [
      'claim',
      {
        target: scope.targetProjectId,
        role: binding.role,
        assignmentSecret,
        idempotencyKey: 'route-managed-claim',
        coordinatorSessionId: first.coordinatorSessionId,
        coordinatorGeneration: first.coordinatorGeneration,
      },
    ],
    [
      'admissions',
      {
        target: scope.targetProjectId,
        role: binding.role,
        assignmentSecret,
        idempotencyKey: 'route-managed-admit',
        workItemId: binding.workItemId,
        attemptId: binding.attemptId,
        assignmentId: binding.assignmentId,
        assignmentGeneration: binding.assignmentGeneration,
        leaseId: binding.leaseId,
        coordinatorSessionId: first.coordinatorSessionId,
        coordinatorGeneration: first.coordinatorGeneration,
      },
    ],
  ] as const) {
    const replayPath = ['quality', 'journeys', scope.journeyId, 'external-work', action]
    const replay = await POST(mutationRequest(replayPath, payload), {
      params: Promise.resolve({ operation: replayPath }),
    })
    expect(replay.status).toBe(200)
    await expect(replay.json()).resolves.toMatchObject({ replayed: true })
    const fresh = await POST(mutationRequest(replayPath, { ...payload, idempotencyKey: 'new-fenced-write' }), {
      params: Promise.resolve({ operation: replayPath }),
    })
    expect(fresh.status).toBe(action === 'claim' ? 403 : 409)
  }
  const invalid = await POST(
    mutationRequest(path, { ...body, assignmentSecret: 'wrong-secret-0123456789012345678901' }),
    { params: Promise.resolve({ operation: path }) },
  )
  expect(invalid.status).toBe(401)
  const wrongPrincipal = mutationRequest(path, body)
  wrongPrincipal.headers.set('x-appraise-project', 'foreign-project')
  expect((await POST(wrongPrincipal, { params: Promise.resolve({ operation: path }) })).status).toBe(409)
  expect(await client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } })).toEqual(before)
})
