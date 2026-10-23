import { describe, expect, it } from 'vitest'
import {
  assertOutcomeIdentity,
  OutcomeCleanupCell,
  captureOutcomeRequestPin,
  outcomeRequestPinMatches,
  canonicalOutcomeJson,
  outcomeEffectRouteInventory,
  outcomeSourceBounds,
  outcomeSafeInteger,
} from './outcome-source-contract'

const identity = {
  runId: 'run',
  intentId: 'intent',
  sendBoundaryId: 'boundary',
  claimEpoch: 1,
  providerNamespace: 'synthetic:local',
  configurationDigest: `sha256:${'a'.repeat(64)}`,
  transportId: 'transport',
  transportIncarnation: 'incarnation',
  threadId: null,
  turnId: null,
}
describe('fixed dormant candidate source contract', () => {
  it('enumerates all denied activation routes with unavailable terminal authority', () => {
    expect(outcomeEffectRouteInventory.map(entry => entry.route)).toEqual([
      'child',
      'auth',
      'network',
      'tool',
      'helper',
      'daemon',
      'inherited_descriptor',
    ])
    expect(
      outcomeEffectRouteInventory.every(
        entry => entry.enforcement === 'NO_PORT' && entry.terminalOwner === 'UNAVAILABLE',
      ),
    ).toBe(true)
    expect(outcomeSourceBounds).toMatchObject({
      envelopeBytes: 65536,
      allocations: 64,
      frames: 256,
      effects: 256,
      depth: 16,
      queries: 8,
    })
  })
  it.each([
    { providerNamespace: 'native:codex' },
    { configurationDigest: 'not_digest' },
    { claimEpoch: 0 },
    { claimEpoch: Number.MAX_SAFE_INTEGER + 1 },
    { threadId: 'thread' },
    { turnId: 'turn' },
    { transportIncarnation: '' },
    { runId: 'x'.repeat(201) },
  ])('rejects impossible candidate identity %o', change => {
    expect(() => assertOutcomeIdentity({ ...identity, ...change })).toThrow()
  })
  it('has canonical deterministic bytes and refuses unsupported numbers/values', () => {
    expect(canonicalOutcomeJson({ z: [1, true], a: { b: null } })).toBe('{"a":{"b":null},"z":[1,true]}')
    for (const invalid of [NaN, Infinity, -1, 0.5, undefined, () => {}])
      expect(() => canonicalOutcomeJson(invalid)).toThrow()
  })
})

describe('actual SQLite integer normalization', () => {
  it.each([0, BigInt(0), 1, BigInt(1), Number.MAX_SAFE_INTEGER, BigInt(Number.MAX_SAFE_INTEGER)])(
    'retains the exact safe integer %s',
    value => {
      expect(outcomeSafeInteger(value, Number.MAX_SAFE_INTEGER)).toBe(Number(value))
    },
  )
  it.each([
    -1,
    BigInt(-1),
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
    '1',
    null,
    undefined,
    {},
    Object(BigInt(1)),
  ])('rejects unsafe or coerced SQLite scalar %s', value => {
    expect(() => outcomeSafeInteger(value, Number.MAX_SAFE_INTEGER)).toThrow()
  })
  it('enforces each protocol cap after native bigint normalization', () => {
    expect(outcomeSafeInteger(BigInt(outcomeSourceBounds.journalBytes), outcomeSourceBounds.journalBytes)).toBe(
      outcomeSourceBounds.journalBytes,
    )
    expect(() =>
      outcomeSafeInteger(BigInt(outcomeSourceBounds.journalBytes) + BigInt(1), outcomeSourceBounds.journalBytes),
    ).toThrow()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}
describe('fixed original cleanup completion cells (pure)', () => {
  it('observes published completion without admission or state changes in every requested state', async () => {
    const queued = new OutcomeCleanupCell<void>()
    expect(queued.publishedPromise).toBeUndefined()
    expect(queued.state).toBe('UNREQUESTED')
    const completion = queued.request(false)
    expect(queued.publishedPromise).toBe(completion)
    expect(queued.state).toBe('QUEUED')
    const actual = deferred<void>()
    queued.admit(
      () => actual.promise,
      () => {},
    )
    expect(queued.publishedPromise).toBe(completion)
    expect(queued.state).toBe('ADMITTED')
    actual.resolve()
    await completion
    expect(queued.publishedPromise).toBe(completion)
    expect(queued.state).toBe('FULFILLED')
    const blocked = new OutcomeCleanupCell<void>()
    const leaf = blocked.request(true)
    expect(blocked.publishedPromise).toBe(leaf)
    expect(blocked.state).toBe('RETAINED_BLOCKED')
    const rejected = new OutcomeCleanupCell<void>(),
      error = new Error('controlled pure throw')
    const failure = rejected.request(false)
    rejected.admit(
      () => {
        throw error
      },
      () => {},
    )
    await expect(failure).rejects.toBe(error)
    expect(rejected.publishedPromise).toBe(failure)
    expect(rejected.state).toBe('REJECTED')
  })

  it('publishes its stable own promise before synchronous invocation and invokes once', async () => {
    const cell = new OutcomeCleanupCell<string>()
    const actual = deferred<string>()
    const completion = cell.request(false)
    let calls = 0
    cell.admit(
      () => {
        calls++
        expect(cell.state).toBe('ADMITTED')
        expect(cell.request(false)).toBe(completion)
        return actual.promise
      },
      () => {},
    )
    expect(cell.operation).toBe(actual.promise)
    expect(completion).not.toBe(actual.promise)
    cell.admit(
      () => {
        calls++
        return Promise.resolve('wrong')
      },
      () => {},
    )
    expect(calls).toBe(1)
    actual.resolve('actual')
    await expect(completion).resolves.toBe('actual')
    expect(cell.state).toBe('FULFILLED')
    expect(cell.request(true)).toBe(completion)
  })
  it('defers held queued work, then admits exactly once on known eligible release', async () => {
    const cell = new OutcomeCleanupCell<void>()
    const completion = cell.request(false)
    let calls = 0
    expect(cell.state).toBe('QUEUED')
    await Promise.resolve()
    expect(calls).toBe(0)
    // Admission is an explicit owner action after known release, never a timer/parent completion.
    cell.admit(
      () => {
        calls++
        return Promise.resolve()
      },
      () => {},
    )
    await completion
    expect(calls).toBe(1)
  })
  it('keeps an independently blocked requested leaf pending with no parent dependency', async () => {
    const parent = new OutcomeCleanupCell<void>()
    const native = new OutcomeCleanupCell<void>()
    const outer = parent.request(false)
    const leaf = native.request(true)
    let called = false,
      settled = false
    parent.admit(
      () => leaf,
      () => {},
    )
    native.admit(
      () => {
        called = true
        return Promise.resolve()
      },
      () => {},
    )
    expect(leaf).not.toBe(outer)
    expect(parent.operation).toBe(leaf)
    expect(native.operation).toBeUndefined()
    expect(native.request(false)).toBe(leaf)
    void leaf.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(called).toBe(false)
    expect(settled).toBe(false)
    expect(native.state).toBe('RETAINED_BLOCKED')
    expect(parent.state).toBe('ADMITTED')
  })
  it.each(['native', 'engine', 'client'] as const)('preserves downward scope when %s is first', async first => {
    const client = new OutcomeCleanupCell<void>(),
      engine = new OutcomeCleanupCell<void>(),
      native = new OutcomeCleanupCell<void>()
    const actual = deferred<void>()
    const calls = { native: 0, engine: 0, client: 0 }
    const nativeCall = () => {
      const p = native.request(false)
      native.admit(
        () => {
          calls.native++
          return actual.promise
        },
        () => {},
      )
      return p
    }
    const engineCall = () => {
      const p = engine.request(false)
      engine.admit(
        () => {
          calls.engine++
          return nativeCall()
        },
        () => {},
      )
      return p
    }
    const clientCall = () => {
      const p = client.request(false)
      client.admit(
        () => {
          calls.client++
          return engineCall()
        },
        () => {},
      )
      return p
    }
    const firstResult = { native: nativeCall, engine: engineCall, client: clientCall }[first]()
    const full = clientCall()
    expect({ native: nativeCall, engine: engineCall, client: clientCall }[first]()).toBe(firstResult)
    expect(client.operation).toBe(engine.request(false))
    expect(engine.operation).toBe(native.request(false))
    expect(native.operation).toBe(actual.promise)
    expect(calls).toEqual({ native: 1, engine: 1, client: 1 })
    actual.resolve()
    await full
    expect([client.state, engine.state, native.state]).toEqual(['FULFILLED', 'FULFILLED', 'FULFILLED'])
  })
  it.each(['throw', 'reject'] as const)(
    'retains %s and reports its cause before public rejection without retry',
    async mode => {
      const cell = new OutcomeCleanupCell<void>(),
        error = new Error(mode)
      const completion = cell.request(false),
        actual = deferred<void>()
      const order: string[] = []
      const observed = completion.catch(value => {
        order.push('public')
        expect(value).toBe(error)
      })
      let calls = 0
      cell.admit(
        () => {
          calls++
          if (mode === 'throw') throw error
          return actual.promise
        },
        rejected => {
          expect(rejected).toBe(true)
          order.push('retired')
        },
      )
      if (mode === 'reject') actual.reject(error)
      await observed
      expect(order).toEqual(['retired', 'public'])
      expect(cell.error).toBe(error)
      expect(cell.state).toBe('REJECTED')
      expect(cell.request(false)).toBe(completion)
      cell.admit(
        () => {
          calls++
          return Promise.resolve()
        },
        () => {},
      )
      expect(calls).toBe(1)
      if (mode === 'reject') expect(cell.operation).toBe(actual.promise)
    },
  )
  it('keeps an admitted native result stable after independent retirement', async () => {
    const cell = new OutcomeCleanupCell<void>(),
      actual = deferred<void>()
    const completion = cell.request(false)
    cell.admit(
      () => actual.promise,
      () => {},
    )
    expect(cell.request(true)).toBe(completion)
    expect(cell.state).toBe('ADMITTED')
    actual.resolve()
    await completion
    expect(cell.state).toBe('FULFILLED')
  })
})
describe('immutable original reconciliation request pins (pure data, no live authority)', () => {
  const hash = `sha256:${'a'.repeat(64)}`,
    otherHash = `sha256:${'b'.repeat(64)}`
  it('captures primitives once and refuses a supplied hash different from independently derived hash', () => {
    const pin = captureOutcomeRequestPin('intent', 'keyB', hash, hash, '{"receipt":1}')
    expect(Object.isFrozen(pin)).toBe(true)
    expect(pin.requestHash).toBe(hash)
    expect(() => captureOutcomeRequestPin('intent', 'keyB', hash, otherHash, '{}')).toThrow()
  })
  it.each(['', 'x'.repeat(201), 'wrong key', null, {}])('rejects a nonbounded original key %s', key => {
    expect(() => captureOutcomeRequestPin('intent', key, hash, hash, '{}')).toThrow()
  })
  it('does not let old keyA substitute for keyB even with the same full receipt and hash', () => {
    const pin = captureOutcomeRequestPin('intent', 'keyB', hash, hash, '{"receipt":1}')
    expect(outcomeRequestPinMatches(pin, { ...pin, observationKey: 'keyA' })).toBe(false)
    for (const change of [{ intentId: 'foreign' }, { requestHash: otherHash }, { receiptJson: '{"receipt":2}' }])
      expect(outcomeRequestPinMatches(pin, { ...pin, ...change })).toBe(false)
    expect(outcomeRequestPinMatches(pin, { ...pin })).toBe(true)
  })
})
