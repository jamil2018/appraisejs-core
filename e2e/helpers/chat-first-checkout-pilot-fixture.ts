import { PrismaClient } from '@prisma/client'
import { createInterface } from 'node:readline/promises'

import { pauseQualityJourneyOperational } from '../../src/services/coordinator/quality-journey-recovery-service'
import {
  continueM10AutomationFixture,
  prepareM10ExistingRegistry,
  publishM10CheckoutReportFixture,
} from '../../src/test/m10-journey-fixture'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl?.startsWith('file:') || databaseUrl.includes('project.db'))
  throw new Error('The checkout pilot requires a disposable SQLite database.')
const validatedDatabaseUrl = databaseUrl

const client = new PrismaClient({ datasources: { db: { url: `${validatedDatabaseUrl}?connection_limit=1` } } })
async function run() {
  const [mode, workspace, baseUrl, journeyId, targetProjectId] = process.argv.slice(2)
  if (mode === 'registry') {
    await prepareM10ExistingRegistry(client)
    return { registryReady: true }
  }
  if (mode === 'triage' && workspace && baseUrl && journeyId) {
    return publishM10CheckoutReportFixture(
      { journeyId: workspace, targetProjectId: baseUrl, executionCycleId: journeyId },
      client,
    )
  }
  if (mode === 'pause') {
    const pausedJourneyId = workspace
    const pausedProjectId = baseUrl
    if (!pausedJourneyId || !pausedProjectId) throw new Error('Pause requires the exact Journey and project.')
    const journey = await client.qualityJourney.findFirstOrThrow({
      where: { id: pausedJourneyId, targetProjectId: pausedProjectId },
    })
    const paused = await pauseQualityJourneyOperational(
      {
        journeyId: pausedJourneyId,
        targetProjectId: pausedProjectId,
        expectedStateHash: journey.stateHash,
        expectedVersion: journey.version,
        idempotencyKey: `cf06-pause:${pausedJourneyId}`,
        reason: 'Check saved chat result after interruption.',
      },
      client,
    )
    return { operationalStatus: paused.operationalStatus }
  }
  if (mode !== 'continue-reviewed' || !workspace || !baseUrl || !journeyId || !targetProjectId)
    throw new Error('The checkout pilot continuation is missing its exact saved Journey scope.')
  const result = await continueM10AutomationFixture(
    {
      client,
      workspace,
      databasePath: validatedDatabaseUrl.slice('file:'.length),
      journeyId,
      targetProjectId,
      requirementId: 'REQ-CHECKOUT',
      expectedPageTitle: 'Order number: LOCAL-123',
      reviewScenario: async () => {
        const input = createInterface({ input: process.stdin, output: process.stdout, terminal: false })
        try {
          if ((await input.question('APPRAISE_E2E_SCENARIO_READY\n')) !== 'continue')
            throw new Error('The browser did not confirm the review.')
        } finally {
          input.close()
        }
      },
    },
    baseUrl,
  )
  return {
    journeyId,
    targetProjectId,
    environmentId: result.environmentId,
    scenarioRevisionId: result.scenarioRevisionId,
    preparedRuntimeCapsuleIds: result.prepared.map(item => item.id),
  }
}
void run()
  .then(result => process.stdout.write(`APPRAISE_E2E_FIXTURE=${JSON.stringify(result)}\n`))
  .finally(() => client.$disconnect())
