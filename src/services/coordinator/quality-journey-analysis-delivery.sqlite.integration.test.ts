import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import * as journeyService from './quality-journey-service'
import * as library from './quality-journey-artifact-library-service'
import { createQualityJourneyAnalysisFixtureDelivery } from './quality-journey-analysis-delivery'

const replies = vi.hoisted(() => ({ loseReply: false, submissions: 0 }))
vi.mock('./quality-journey-analysis-service', async importOriginal => {
  const original = await importOriginal<typeof import('./quality-journey-analysis-service')>()
  return {
    ...original,
    async submitExternalQualityJourneyAnalysisSuccessor(
      ...args: Parameters<typeof original.submitExternalQualityJourneyAnalysisSuccessor>
    ) {
      replies.submissions++
      const result = await original.submitExternalQualityJourneyAnalysisSuccessor(...args)
      if (replies.loseReply) {
        replies.loseReply = false
        throw new Error('synthetic lost acceptance reply')
      }
      return result
    },
  }
})
type Fixture = Awaited<ReturnType<typeof createProviderFixture>>
type Delivery = Awaited<ReturnType<typeof createQualityJourneyAnalysisFixtureDelivery>>
const fixtures: Fixture[] = []
const deliveries: Delivery[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(deliveries.splice(0).map(delivery => delivery.cancel()))
  await Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup()))
  replies.loseReply = false
  replies.submissions = 0
})
async function setup(
  mode: NonNullable<Parameters<typeof createQualityJourneyAnalysisFixtureDelivery>[1]['mode']> = 'normal',
) {
  const fixture = await createProviderFixture()
  fixtures.push(fixture)
  const options = {
    fixturePath: path.resolve('scripts/tests/fixtures/m06-analysis-child.mjs'),
    submissionIdempotencyKey: 'm06-regression-submit',
    mode,
  }
  const delivery = await createQualityJourneyAnalysisFixtureDelivery(fixture.prepareInput, options, fixture.client)
  deliveries.push(delivery)
  return { fixture, delivery, options }
}
async function expectRetained(fixture: Fixture, delivery: Delivery) {
  const reopened = fixture.connect()
  const slot = await reopened.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
  expect(slot.intentId).toBe(delivery.snapshot().intentId)
  expect(delivery.snapshot().providerTerminationProven).toBe(false)
  expect(delivery.snapshot().slotReleased).toBe(false)
  const intent = await reopened.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
    where: { id: slot.intentId! },
  })
  expect(intent.reconciledAt).toBeNull()
  expect(await reopened.qualityJourneyProviderRun.count()).toBe(1)
  expect(await reopened.qualityJourneyProviderDispatchIntent.count()).toBe(1)
}

describe('internal owned Analysis fixture delivery', () => {
  it('accepts a real child candidate once across duplicate observers and canonical outcome replay', async () => {
    const { fixture, delivery } = await setup('duplicate')
    const [first, second] = await Promise.all([delivery.start(), delivery.start()])
    expect(first).toBe(second)
    expect(first.status).toBe('ACCEPTED')
    expect(await delivery.recoverSubmission()).toMatchObject({ replayed: true })
    expect(replies.submissions).toBe(1)
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(1)
    expect(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    const item = await fixture.client.qualityJourneyWorkItem.findUniqueOrThrow({
      where: { id: fixture.binding.workItemId },
    })
    expect(item.status).toBe('COMPLETED')
    await expectRetained(fixture, delivery)
  })

  it.each(['missing', 'invalid', 'wrong-thread', 'wrong-turn', 'conflicting'] as const)(
    'keeps work incomplete for %s output despite logical turn completion',
    async mode => {
      const { fixture, delivery } = await setup(mode)
      expect(await delivery.start()).toMatchObject({ status: 'INCOMPLETE', acceptance: null })
      expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(0)
      expect(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(0)
      const item = await fixture.client.qualityJourneyWorkItem.findUniqueOrThrow({
        where: { id: fixture.binding.workItemId },
      })
      expect(item.status).toBe('IN_PROGRESS')
      await expectRetained(fixture, delivery)
    },
  )

  it('lets canonical acceptance reject a schema-valid charter with a foreign requirement', async () => {
    const { fixture, delivery } = await setup('canonical-invalid')
    await expect(delivery.start()).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(0)
    expect(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(0)
    expect(
      (await fixture.client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: fixture.binding.workItemId } }))
        .status,
    ).toBe('IN_PROGRESS')
    await expectRetained(fixture, delivery)
  })

  it('recovers the original durable outcome after a lost reply without submitting again', async () => {
    const { fixture, delivery } = await setup()
    replies.loseReply = true
    await expect(delivery.start()).rejects.toThrow('synthetic lost acceptance reply')
    expect(await delivery.recoverSubmission()).toMatchObject({ replayed: true })
    expect(replies.submissions).toBe(1)
    expect(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(1)
    await expectRetained(fixture, delivery)
  })

  it('cancels before start without preparing an intent or accepting output', async () => {
    const { fixture, delivery } = await setup()
    await delivery.cancel()
    await expect(delivery.start()).rejects.toThrow()
    expect(await fixture.client.qualityJourneyProviderRun.count()).toBe(0)
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(0)
    await expect(delivery.recoverSubmission()).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('cancels during candidate wait and retains the consumed slot without canonical acceptance', async () => {
    const { fixture, delivery } = await setup('delayed')
    const flight = delivery.start()
    await vi.waitFor(() => expect(delivery.snapshot().state).toBe('active'))
    await delivery.cancel()
    expect(await flight).toMatchObject({ status: 'INCOMPLETE', acceptance: null })
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(0)
    await expectRetained(fixture, delivery)
  })

  it('keeps cancellation closed across a delayed negative outcome lookup', async () => {
    const { fixture, delivery } = await setup()
    const readOutcome = journeyService.readExternalQualityJourneySubmissionOutcome
    let entered!: () => void
    let release!: () => void
    const reading = new Promise<void>(resolve => {
      entered = resolve
    })
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    vi.spyOn(journeyService, 'readExternalQualityJourneySubmissionOutcome').mockImplementationOnce(async (...args) => {
      entered()
      await gate
      return readOutcome(...args)
    })
    const flight = delivery.start()
    await reading
    await delivery.cancel()
    release()
    await expect(flight).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(replies.submissions).toBe(0)
    expect(await fixture.client.qualityJourneyAnalysisRevision.count()).toBe(0)
    await expectRetained(fixture, delivery)
  })

  it('does not launch a replacement after reconnect while the original intent occupies the slot', async () => {
    const { fixture, delivery, options } = await setup()
    await delivery.start()
    const replacement = await createQualityJourneyAnalysisFixtureDelivery(
      fixture.prepareInput,
      options,
      fixture.connect(),
    )
    deliveries.push(replacement)
    await expect(replacement.start()).rejects.toThrow()
    expect(await fixture.client.qualityJourneyWorkAttempt.count()).toBe(1)
    await expectRetained(fixture, delivery)
  })

  it('refuses a changed exact requirement source hash before process preparation', async () => {
    const { fixture, options } = await setup()
    const descriptor = await library.getQualityJourneyLibraryArtifact(
      { ...fixture.scope, entryId: `REQUIREMENT_REVISION:${fixture.created.journey.activeRevisionIds.journey}` },
      fixture.client,
    )
    vi.spyOn(library, 'getQualityJourneyLibraryArtifact').mockResolvedValueOnce({
      ...descriptor,
      entry: { ...descriptor.entry, sourceContentHash: `sha256:${'f'.repeat(64)}` },
    })
    await expect(
      createQualityJourneyAnalysisFixtureDelivery(fixture.prepareInput, options, fixture.client),
    ).rejects.toThrow('Exact requirement descriptor changed')
    expect(await fixture.client.qualityJourneyProviderRun.count()).toBe(0)
  })
})
