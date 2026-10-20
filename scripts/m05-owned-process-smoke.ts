import path from 'node:path'
import assert from 'node:assert/strict'
import { createProviderFixture } from '../src/test/quality-journey-provider-fixture'
import {
  createQualityJourneyFixtureSupervisor,
  startQualityJourneyProductionProvider,
} from '../src/services/coordinator/quality-journey-process-supervisor'

const fixture = await createProviderFixture()
const supervisor = createQualityJourneyFixtureSupervisor(
  fixture.prepareInput,
  {
    fixturePath: path.resolve('src/test/m05-owned-child.mjs'),
  },
  fixture.client,
)
try {
  const started = await supervisor.start()
  assert.equal(started.threadId, 'm05-fixture-thread')
  assert.equal(started.turnId, 'm05-fixture-turn')
  const stopped = await supervisor.cancel()
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.cleanup?.groupExitObserved, true)
  assert.equal(stopped.cleanup?.privateRootRemoved, true)
  const reopened = fixture.connect()
  const slot = await reopened.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
  assert.equal(slot.intentId, stopped.intentId)
  const intent = await reopened.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
    where: { id: slot.intentId! },
  })
  assert.equal(intent.status, 'ACKNOWLEDGED')
  assert.equal(intent.reconciledAt, null)
  assert.equal(await reopened.qualityJourneyProviderRun.count(), 1)
  assert.equal(await reopened.qualityJourneyProviderDispatchIntent.count(), 1)
  assert.equal(await reopened.qualityJourneyExternalSubmissionAcceptance.count(), 0)
  assert.throws(startQualityJourneyProductionProvider, /blocked/)
  console.log(
    JSON.stringify({
      status: 'PASS',
      evidenceClass: 'owned-fixture-process-and-SQLite',
      started,
      stopped,
      occupiedAfterReconnect: true,
      providerTerminationProven: false,
    }),
  )
} finally {
  await supervisor.cancel()
  await fixture.cleanup()
}
