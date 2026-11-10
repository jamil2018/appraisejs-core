import { afterEach, describe, expect, it } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { inspectQualityJourneyAnalysisContinuation } from './quality-journey-analysis-continuation'
import {
  armQualityJourneyProviderIntent,
  claimQualityJourneyProviderIntent,
  prepareQualityJourneyProviderRun,
} from './quality-journey-provider-run-service'
import { pauseQualityJourneyOperational } from './quality-journey-recovery-service'

const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})
async function setup() {
  const fixture = await createProviderFixture()
  fixtures.push(fixture)
  return fixture
}

describe('internal Analysis continuation observations', () => {
  it('observes admitted work without creating a run, claim or turn', async () => {
    const f = await setup()
    const result = await inspectQualityJourneyAnalysisContinuation(f.credentials, f.client)
    expect(result).toMatchObject({
      outcome: 'CANONICAL_ANALYSIS_STATE_OBSERVED',
      dispatchAuthorized: false,
      runtimeQualified: false,
      physicalDependency: false,
      work: [{ id: f.binding.workItemId, currentAttempt: 1 }],
    })
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
  })

  it('duplicate concurrent and restarted observers retain the same occupied boundary without attempts', async () => {
    const f = await setup()
    const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, f.client)
    const input = { ...f.binding, intentId: prepared.intent.id, claimOwner: 'boundary-observation' }
    const claim = await claimQualityJourneyProviderIntent(input, f.client)
    const armed = await armQualityJourneyProviderIntent({ ...input, claimEpoch: claim.intent.claimEpoch }, f.client)
    const before = await f.client.qualityJourneyProviderDispatchIntent.findMany()
    const observations = await Promise.all(
      [f.client, f.connect(), f.connect()].map(c => inspectQualityJourneyAnalysisContinuation(f.credentials, c)),
    )
    expect(observations[1]).toEqual(observations[0])
    expect(observations[2]).toEqual(observations[0])
    expect(observations[0]).toMatchObject({
      outcome: 'PHYSICAL_RECONCILIATION_REQUIRED',
      occupiedIntentId: armed.intent.id,
      dispatchAuthorized: false,
      unresolved: [{ id: armed.intent.id, sendBoundaryId: armed.intent.sendBoundaryId }],
    })
    expect(await f.client.qualityJourneyProviderDispatchIntent.findMany()).toEqual(before)
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
    expect((await f.client.qualityJourneyProviderRun.findFirstOrThrow()).turnsReserved).toBe(1)
    expect(JSON.stringify(observations)).not.toContain(f.binding.assignmentSecret)
  })

  it('pause reports inactive and stale generations cannot inspect managed state', async () => {
    const f = await setup()
    const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    await pauseQualityJourneyOperational(
      {
        ...f.scope,
        expectedStateHash: row.stateHash,
        expectedVersion: row.version,
        idempotencyKey: 'pause-observation',
        reason: 'Disposable observation boundary',
      },
      f.client,
    )
    expect(await inspectQualityJourneyAnalysisContinuation(f.credentials, f.connect())).toMatchObject({
      outcome: 'INACTIVE',
      dispatchAuthorized: false,
    })
    await expect(
      inspectQualityJourneyAnalysisContinuation({ ...f.credentials, coordinatorGeneration: 99 }, f.client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(inspectQualityJourneyAnalysisContinuation(f.scope, f.client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  })
})
