import { afterEach, expect, it, vi } from 'vitest'
import { registerOwnedQualityJourneyTurn, stopOwnedQualityJourneyTurns } from './quality-journey-owned-turns'

const databaseIdentity = 'test-database'
const scope = { journeyId: 'owned-turn-test', targetProjectId: 'project' }
afterEach(() => vi.useRealTimers())

it('enters all original fences before awaiting drain, including competing supervisors; ignores foreign and later attempts', async () => {
  let release!: () => void
  const drain = new Promise<void>(resolve => {
    release = resolve
  })
  const order: string[] = []
  const owner = (attemptId: string, transportId: string) => ({
    ...scope,
    databaseIdentity,
    attemptId,
    transportId,
    cancel: async () => {
      order.push(transportId)
      await drain
      return { fenced: true, completed: false, cleanup: { groupExitObserved: true, privateRootRemoved: true } }
    },
  })
  const first = owner('captured', 'first')
  const competitor = owner('captured', 'competitor')
  const later = owner('later', 'later')
  const copiedHub = { ...owner('captured', 'copied'), databaseIdentity: 'copied-database' }
  const foreign = { ...owner('captured', 'foreign'), targetProjectId: 'other' }
  for (const turn of [first, competitor, later, foreign, copiedHub]) registerOwnedQualityJourneyTurn(turn)
  const stopping = stopOwnedQualityJourneyTurns(scope, ['captured'], databaseIdentity)
  expect(order).toEqual(['first', 'competitor'])
  release()
  const result = await stopping
  expect(result.managedTurn).toBe('OBSERVED')
  expect(result.managedTurnReceipts).toHaveLength(2)
  expect(result.managedTurnReceipts.every(receipt => !receipt.turnCompleted)).toBe(true)
})

it('keeps missing handles, thrown cleanup and a bounded pending original stop UNKNOWN', async () => {
  vi.useFakeTimers()
  const pending = {
    ...scope,
    databaseIdentity,
    attemptId: 'pending',
    transportId: 'pending',
    cancel: () => new Promise<never>(() => {}),
  }
  const rejected = {
    ...scope,
    databaseIdentity,
    attemptId: 'rejected',
    transportId: 'rejected',
    cancel: () => {
      throw new Error('lost cleanup')
    },
  }
  registerOwnedQualityJourneyTurn(pending)
  registerOwnedQualityJourneyTurn(rejected)
  const stopping = stopOwnedQualityJourneyTurns(scope, ['pending', 'rejected', 'lost-process'], databaseIdentity)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(await stopping).toMatchObject({ managedTurn: 'UNKNOWN' })
  expect((await stopping).managedTurnReceipts.every(receipt => !receipt.ownedProcessExitObserved)).toBe(true)
  expect(await stopOwnedQualityJourneyTurns(scope, [])).toEqual({
    managedTurn: 'NONE_REGISTERED',
    managedTurnReceipts: [],
  })
})
