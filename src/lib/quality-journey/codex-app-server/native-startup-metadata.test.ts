import { afterEach, describe, expect, it, vi } from 'vitest'
import schema from './native-qualification-schemas/ServerNotification.json'
import { NativeStartupMetadata, nativeStartupWarning } from './native-startup-metadata'

const warning = () => ({ summary: nativeStartupWarning })
const account = () => ({ authMode: 'chatgpt', planType: 'unknown' })
function opened() {
  const state = new NativeStartupMetadata()
  state.validatedInitialize()
  return state
}
function metadata(state: NativeStartupMetadata) {
  state.notification('configWarning', warning())
  state.notification('account/updated', account())
}
function ready() {
  const state = opened()
  metadata(state)
  state.settledInitialize()
  state.verifiedConfiguration()
  return state
}
afterEach(() => vi.useRealTimers())
describe('conditional original startup state', () => {
  it.each(['same-chunk', 'split-chunks', 'different-microtasks'] as const)(
    'finalizes provisional observations for %s only through original settlement',
    async mode => {
      const state = opened()
      state.notification('configWarning', { ...warning(), details: null, path: null, range: null })
      if (mode !== 'same-chunk') await Promise.resolve()
      state.notification('account/updated', account())
      const waiting = state.wait(Date.now() + 1000)
      let complete = false
      void waiting.then(() => {
        complete = true
      })
      await Promise.resolve()
      expect(complete).toBe(false)
      state.verifiedConfiguration()
      if (mode === 'different-microtasks') await Promise.resolve()
      expect(complete).toBe(false)
      state.settledInitialize()
      await waiting
      state.admit()
      expect(() => state.notification('account/updated', account())).toThrow(/metadata refused/)
    },
  )
  it.each([
    { summary: nativeStartupWarning + ' ' },
    { summary: 'private sentinel other warning' },
    { ...warning(), details: 'private sentinel' },
    { ...warning(), path: '/private/sentinel' },
    { ...warning(), range: {} },
    { ...warning(), extra: 'private sentinel' },
    {},
  ])('permanently rejects warning mutation %j', params => {
    const state = opened()
    expect(() => state.notification('configWarning', params)).toThrow(/metadata refused/)
    expect(() => metadata(state)).toThrow(/metadata refused/)
  })
  it.each([
    {},
    { authMode: null },
    { authMode: 'apikey', planType: 'unknown' },
    { authMode: 'chatgpt' },
    { authMode: 'chatgpt', planType: null },
    { authMode: 'chatgpt', planType: 'private sentinel' },
    { ...account(), accountId: 'private sentinel' },
  ])('rejects auth/category/key mismatch %j', params => {
    const state = opened()
    expect(() => state.notification('account/updated', params)).toThrow(/metadata refused/)
    expect(() => state.notification('account/updated', account())).toThrow(/metadata refused/)
  })
  it.each(schema.definitions.PlanType.enum)('uses schema plan value %s transiently', async planType => {
    const state = opened()
    state.notification('configWarning', warning())
    state.notification('account/updated', { authMode: 'chatgpt', planType })
    state.settledInitialize()
    state.verifiedConfiguration()
    await state.wait(Date.now() + 1000)
    expect(JSON.stringify(state)).toBe('{}')
    state.admit()
  })
  it.each(['configWarning', 'account/updated'] as const)('rejects identical duplicate %s', method => {
    const state = opened(),
      params = method === 'configWarning' ? warning() : account()
    state.notification(method, params)
    expect(() => state.notification(method, params)).toThrow()
  })
  it.each(['before-init', 'fence', 'cleanup', 'candidate', 'owner-revocation'])(
    'never accepts metadata at %s boundary',
    mode => {
      const state = mode === 'before-init' ? new NativeStartupMetadata() : opened()
      if (mode !== 'before-init') state.close()
      expect(() => state.notification('configWarning', warning())).toThrow()
      expect(() => state.validatedInitialize()).toThrow()
    },
  )
  it.each(['warning', 'account', 'initialize', 'configuration'])(
    'absence of %s expires the original absolute budget permanently',
    async missing => {
      vi.useFakeTimers()
      const state = opened(),
        deadline = Date.now() + 100
      if (missing !== 'warning') state.notification('configWarning', warning())
      if (missing !== 'account') state.notification('account/updated', account())
      if (missing !== 'initialize') state.settledInitialize()
      if (missing !== 'configuration') state.verifiedConfiguration()
      await vi.advanceTimersByTimeAsync(80)
      const waiting = expect(state.wait(deadline)).rejects.toThrow(/metadata refused/)
      await vi.advanceTimersByTimeAsync(20)
      await waiting
      expect(() => state.admit()).toThrow()
      expect(() => metadata(state)).toThrow()
    },
  )
  it('cancellation unblocks a real waiter and prevents repair', async () => {
    const state = opened(),
      controller = new AbortController()
    const waiting = expect(state.wait(Date.now() + 1000, controller.signal)).rejects.toThrow()
    controller.abort()
    await waiting
    expect(() => metadata(state)).toThrow()
  })
  it('rejects expired ready state and duplicate settlement before admission', async () => {
    vi.useFakeTimers()
    const state = ready()
    await state.wait(Date.now() + 10)
    await vi.advanceTimersByTimeAsync(10)
    expect(() => state.admit()).toThrow()
    const duplicate = ready()
    expect(() => duplicate.settledInitialize()).toThrow()
    await expect(duplicate.wait(Date.now() + 10)).rejects.toThrow()
  })
  it('cannot import copied state or serialized receipts', async () => {
    const original = ready(),
      copy = Object.assign(new NativeStartupMetadata(), JSON.parse(JSON.stringify(original)))
    expect(() => copy.admit()).toThrow()
    await expect(copy.wait(Date.now() + 10)).rejects.toThrow()
    expect(() => NativeStartupMetadata.prototype.admit.call({})).toThrow()
    await original.wait(Date.now() + 1000)
    original.admit()
  })
})
