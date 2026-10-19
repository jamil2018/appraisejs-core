import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PrismaClient } from '@prisma/client'
import { copyMigratedTestDatabase } from './migrated-test-database'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  registerQualityJourneyCoordinatorSession,
  activateQualityJourneyCoordinatorSession,
} from '@/services/coordinator/quality-journey-session-service'
import {
  createQualityJourney,
  submitDurableQualityJourneyCommand,
  claimExternalQualityJourneyWork,
  admitExternalQualityJourneyWork,
} from '@/services/coordinator/quality-journey-service'

/** Real canonical claim/admission fixture. It supplies no provider transport. */
export async function addManagedProviderAssignment(client: PrismaClient, targetProjectId: string, key = 'primary') {
  const principalId = `project:m04-${key}`
  const principal = { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
  const assignmentSecret = `synthetic-m04-${key}-${'s'.repeat(32)}`
  const created = await createQualityJourney(
    {
      targetProjectId,
      idempotencyKey: key,
      requirement: { objective: `M04 ${key}` },
      hostingMode: 'APP_SERVER_LOCAL_V1',
    },
    client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId }
  const registered = await registerQualityJourneyCoordinatorSession(
    { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: `${key}-session` },
    client,
  )
  await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      coordinatorPrincipalId: principalId,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      coordinatorSessionId: registered.session.id,
      requestId: `${key}-activate`,
      expectedOwnershipVersion: 0,
      expectedStateHash: created.journey.stateHash,
    },
    client,
  )
  const credentials = {
    ...scope,
    coordinatorSessionId: registered.session.id,
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principalId,
  }
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...scope,
      commandId: `${key}-submit`,
      idempotencyKey: `${key}-submit`,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      expectedStateHash: created.journey.stateHash,
      inputArtifactRefs: [],
      payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
    },
    client,
    trustedHumanCoordinatorSession,
  )
  const claimRequest = {
    ...credentials,
    role: 'REQUIREMENT_ANALYZER' as const,
    principal,
    assignmentSecret,
    idempotencyKey: `${key}-claim`,
  }
  const claimed = await claimExternalQualityJourneyWork(claimRequest, client)
  const binding = {
    ...credentials,
    role: claimRequest.role,
    principal,
    assignmentSecret,
    workItemId: claimed.workItem.id,
    attemptId: claimed.attempt.id,
    assignmentId: claimed.assignment.assignmentId,
    assignmentGeneration: claimed.assignmentGeneration,
    leaseId: claimed.attempt.leaseId,
  }
  await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: `${key}-admit` }, client)
  const prepareInput = {
    ...binding,
    idempotencyKey: `${key}-prepare`,
    providerNamespace: `synthetic:m04:${key}:incarnation-1`,
    configurationDigest: `sha256:${'c'.repeat(64)}`,
    envelopeDigest: `sha256:${'e'.repeat(64)}`,
  }
  return { created, scope, registered, credentials, principal, binding, prepareInput, claimRequest, claimed }
}

export async function createProviderFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-m04-regression-'))
  const databasePath = path.join(workspace, 'test.db')
  await copyMigratedTestDatabase(databasePath)
  const clients: PrismaClient[] = []
  const connect = () => {
    const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    clients.push(client)
    return client
  }
  const client = connect()
  const targetProjectId = 'm04-target'
  await client.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'M04 SQLite regressions',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  try {
    const assignment = await addManagedProviderAssignment(client, targetProjectId)
    return {
      ...assignment,
      workspace,
      databasePath,
      client,
      connect,
      cleanup: async () => {
        await Promise.all(clients.map(c => c.$disconnect()))
        await fs.rm(workspace, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await Promise.all(clients.map(c => c.$disconnect()))
    await fs.rm(workspace, { recursive: true, force: true })
    throw error
  }
}
