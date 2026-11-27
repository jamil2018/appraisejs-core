import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { appendConversationTurn } from '../../src/services/conversation/conversation-service'
import { pauseQualityJourneyOperational } from '../../src/services/coordinator/quality-journey-recovery-service'
import { seedPreparedJourneyExecution } from '../../src/test/prepared-journey-execution-fixture'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl?.startsWith('file:') || databaseUrl.includes('project.db')) {
  throw new Error('The checkout fixture requires a disposable SQLite database.')
}

const client = new PrismaClient({ datasources: { db: { url: `${databaseUrl}?connection_limit=1` } } })
async function fixture(workspace: string, baseUrl: string, variant: 'failed' | 'passed' = 'failed') {
  const title = 'Guest checkout'
  const prepared = await seedPreparedJourneyExecution(client, workspace, {
    actualOperationId: 'browser.navigation.navigate.to.environment.base.url',
    realRuntime: true,
    baseUrl,
    label: title,
    managed: true,
    checkoutFailure: variant === 'failed',
    fixtureSuffix: variant === 'passed' ? 'passed' : '',
  })
  const { targetProjectId } = prepared
  const { conversation } = await appendConversationTurn(
    {
      targetProjectId,
      idempotencyKey: randomUUID(),
      content:
        variant === 'failed'
          ? 'Check that guest checkout succeeds and its confirmation includes an order number.'
          : 'Check that a guest can open checkout.',
      context: { kind: 'QUALITY_JOURNEY', id: prepared.journeyId, title },
    },
    client,
  )
  return { ...prepared, targetProjectId, conversationId: conversation.id }
}

async function pause(journeyId: string, targetProjectId: string) {
  const journey = await client.qualityJourney.findFirstOrThrow({ where: { id: journeyId, targetProjectId } })
  const { operationalStatus } = await pauseQualityJourneyOperational(
    {
      targetProjectId,
      journeyId,
      expectedStateHash: journey.stateHash,
      expectedVersion: journey.version,
      idempotencyKey: 'pause-checkout-browser-fixture',
      reason: 'Reopen the saved chat with the original run after pausing.',
    },
    client,
  )
  return { operationalStatus }
}

const [operation, ...args] = process.argv.slice(2)
void (operation === 'pause' ? pause(args[0]!, args[1]!) : fixture(args[0]!, args[1]!, args[2] as 'failed' | 'passed'))
  .then(result => process.stdout.write(`APPRAISE_E2E_FIXTURE=${JSON.stringify(result)}\n`))
  .finally(() => client.$disconnect())
