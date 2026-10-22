import assert from 'node:assert/strict'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { addManagedProviderAssignment } from './quality-journey-provider-fixture'
import { RetainedAnalysisLifetime } from './m06-analysis-retained-lifetime'
import {
  advanceQualityJourneyAnalysisFollowup,
  type AnalysisFollowupSchedulerInput,
} from '@/services/coordinator/quality-journey-analysis-scheduler'
import { createQualityJourneyAnalysisFixtureDelivery } from '@/services/coordinator/quality-journey-analysis-delivery'

/** Fresh preserved canonical fixture only. This never creates a source custodian or NONSTART proof. */
async function createRetainedAnalysisFixture(
  workspace: string,
  migratedDatabasePath: string,
  owner: RetainedAnalysisLifetime,
) {
  assert.ok(path.isAbsolute(workspace) && path.isAbsolute(migratedDatabasePath))
  await mkdir(workspace, { mode: 0o700 })
  const databasePath = path.join(workspace, 'canonical.db')
  await copyFile(migratedDatabasePath, databasePath, 1)
  const clients: PrismaClient[] = []
  const connect = () => {
    const actual = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
    owner.retainClient(actual)
    clients.push(actual)
    return actual
  }
  const client = connect()
  const targetProjectId = 'm06-retained-target'
  await client.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'Retained M06 canonical fixture',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const assignment = await addManagedProviderAssignment(client, targetProjectId)
  return { ...assignment, workspace, databasePath, client, connect, clients, owner }
}
export type RetainedAnalysisFixture = Awaited<ReturnType<typeof createRetainedAnalysisFixture>>
export type RetainedAnalysisScenarioContext = {
  rootDirectory: string
  migratedDatabasePath: string
  owner: RetainedAnalysisLifetime
  allocated: number
}

export function allocateRetainedAnalysisFixture(context: RetainedAnalysisScenarioContext) {
  const workspace = path.join(context.rootDirectory, `canonical-${++context.allocated}`)
  return context.owner.track('canonical-fixture-allocation', () =>
    createRetainedAnalysisFixture(workspace, context.migratedDatabasePath, context.owner),
  )
}

export function advanceRetainedAnalysis(
  context: RetainedAnalysisScenarioContext,
  input: AnalysisFollowupSchedulerInput,
  client: PrismaClient,
) {
  const { controller } = context.owner.reserveDelivery()
  return context.owner.track('bounded-scheduler-step', () =>
    advanceQualityJourneyAnalysisFollowup(input, client, controller),
  )
}

export async function createRetainedAnalysisDelivery(
  context: RetainedAnalysisScenarioContext,
  ...args: Parameters<typeof createQualityJourneyAnalysisFixtureDelivery>
) {
  const { controller } = context.owner.reserveDelivery()
  const actual = await context.owner.track('real-delivery-factory', () =>
    createQualityJourneyAnalysisFixtureDelivery(...args),
  )
  controller.retainDelivery(actual)
  return actual
}
