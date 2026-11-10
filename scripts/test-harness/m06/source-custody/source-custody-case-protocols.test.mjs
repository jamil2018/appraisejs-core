import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSourceCaseRuntime } from './source-custody-guard.mjs'
import {
  startSourceSendReservation,
  acceptSourceSendReservation,
  assertSourceFactoryRefusal,
  completeSourceCaseResult,
  assertSourceFinalizerHandoff,
  createSourceRefusalTransaction,
  completeSourceCaptureRefusal,
} from './source-custody-case-protocols.mjs'
function fixture() {
  return createSourceCaseRuntime({ connected: () => true, report() {} })
}
test('actual send start admits before original creation and keeps exact original return unconsumed', () => {
  const h = fixture(),
    permit = {},
    client = {},
    original = {
      get then() {
        assert.fail('ORIGINAL_CONSUMED')
      },
    }
  const returned = startSourceSendReservation(h.runtime, permit, client, function (p, c) {
    assert.equal(this, undefined)
    assert.equal(p, permit)
    assert.equal(c, client)
    assert.equal(h.state.current.phase, 'SEND_RESERVE')
    assert.equal(h.state.current.filled, false)
    return original
  })
  assert.equal(returned, original)
  assert.equal(h.state.current.original, original)
})
test('actual start failure precedes original creation and original synchronous throw stays original', () => {
  const h = fixture(),
    first = new Error('first')
  h.fail(first)
  assert.throws(() => startSourceSendReservation(h.runtime, {}, {}, () => assert.fail('failed creation')))
  const active = fixture()
  assert.throws(
    () =>
      startSourceSendReservation(active.runtime, {}, {}, () => {
        throw first
      }),
    error => error === first,
  )
  assert.equal(active.state.current.filled, false)
})
test('actual post-await acceptance retains exact handle between original guards and refuses late failure/absence', () => {
  const h = fixture(),
    operation = {}
  acceptSourceSendReservation(h.runtime, operation)
  assert.equal(h.state.references.get('sourceOperation'), operation)
  h.fail(new Error('late'))
  assert.throws(() => acceptSourceSendReservation(h.runtime, {}))
  assert.equal(h.state.references.get('sourceOperation'), operation)
  const missing = fixture()
  assert.throws(() => acceptSourceSendReservation(missing.runtime, undefined))
  assert.equal(missing.state.references.size, 0)
})
test('actual full factory-refusal protocol accepts only original expected refusal after auxiliary admission', () => {
  const h = fixture(),
    original = {},
    admission = h.runtime.begin('REAL_OPERATION')
  h.runtime.keep(admission, original)
  assertSourceFactoryRefusal(h.runtime, () => {
    assert.equal(h.state.admissions.at(-1), undefined)
    assert.equal(h.state.admissions[1].phase, 'EXPECTED_FACTORY_REFUSAL')
    throw new Error('source_custody_slot_unavailable')
  })
  assert.equal(h.state.current, admission)
  assert.equal(admission.original, original)
  const foreign = new Error('other')
  assert.throws(() =>
    assertSourceFactoryRefusal(h.runtime, () => {
      throw foreign
    }),
  )
})
test('unexpected factory pair is retained synchronously before missing-refusal assertion and no lazy ready consumer', () => {
  const h = fixture(),
    pair = {
      client: {},
      ready: {
        get then() {
          assert.fail('READY_CONSUMED')
        },
      },
    }
  assert.throws(() => assertSourceFactoryRefusal(h.runtime, () => pair), assert.AssertionError)
  assert.equal(h.state.admissions[0].original, pair)
  assert.equal(h.state.admissions[0].kind, 'auxiliary')
  h.fail(new Error('first'))
  assert.throws(() => assertSourceFactoryRefusal(h.runtime, () => assert.fail('failed creation')))
})

for (const retained of [false, true])
  test('actual complete case result preserves selected restoration/result policy retained=' + retained, () => {
    const h = fixture(),
      original = { retained },
      counts = { entries: 1, admissions: 2, rowReads: 3 },
      order = []
    const trace = {
      restore() {
        order.push('restore')
      },
      counts() {
        order.push('counts')
        return counts
      },
    }
    const result = completeSourceCaseResult(h.runtime, 'storage', original, trace)
    assert.equal(result.methodEntries, counts)
    assert.equal(result.retained, retained)
    assert.equal(result.schema, 'FULL_CANONICAL_93')
    assert.deepEqual(order, retained ? ['counts'] : ['restore', 'counts'])
    assert.equal(
      completeSourceCaseResult(h.runtime, 'other', original, trace).schema,
      'MINIMAL_COMPONENT_NO_CANONICAL_RELEASE',
    )
    h.fail(new Error('first'))
    assert.throws(() =>
      completeSourceCaseResult(h.runtime, 'storage', original, {
        restore() {
          assert.fail('failed restoration')
        },
        counts() {
          assert.fail('failed classification')
        },
      }),
    )
  })

for (const overflow of [true, false]) {
  test(
    'actual complete refusal transaction preserves SQL/settings/capture/permit/delayed order overflow=' + overflow,
    async () => {
      const h = fixture(),
        order = [],
        permit = {},
        expected = new Error('original refusal')
      const tx = {
        $executeRawUnsafe(...args) {
          order.push(['sql', ...args])
          return Promise.resolve(1)
        },
      }
      const f = {
        permit,
        source: {
          transport: {
            request(...args) {
              order.push(['request', ...args])
              throw expected
            },
          },
        },
      }
      const operation = {
        assertTransactionSettings(actual) {
          assert.equal(actual, tx)
          order.push(['settings'])
          return Promise.resolve()
        },
        capture(callback) {
          order.push(['capture'])
          return callback()
        },
      }
      const refusal = createSourceRefusalTransaction(
        h.runtime,
        {
          capture(callback) {
            order.push(['trace'])
            return callback()
          },
        },
        f,
        operation,
        overflow,
        actual => {
          assert.equal(actual, permit)
          order.push(['permit'])
        },
      )
      assert.deepEqual(order, [])
      assert.equal(refusal.delayed, undefined)
      const original = refusal.callback(tx)
      assert(original instanceof Promise)
      await assert.rejects(original, error => error === expected)
      assert.deepEqual(order, [
        ['sql', 'UPDATE QualityJourneyProviderRun SET id=id WHERE id=?', 'run'],
        ['settings'],
        ['trace'],
        ['capture'],
        ['permit'],
        ['request', 'thread/start', {}],
      ])
      if (overflow) assert.equal(refusal.delayed, undefined)
      else {
        assert.equal(refusal.delayed, h.state.references.get('actualDelayedOriginalCallback'))
        await assert.rejects(refusal.delayed, error => error === expected)
      }
    },
  )
}
test('actual refusal transaction refuses failed admission before any original SQL or permit', async () => {
  const h = fixture(),
    first = new Error('latched')
  h.fail(first)
  const refusal = createSourceRefusalTransaction(
    h.runtime,
    { capture: () => assert.fail('trace') },
    {},
    {},
    false,
    () => assert.fail('permit'),
  )
  await assert.rejects(
    refusal.callback({
      $executeRawUnsafe() {
        assert.fail('SQL')
      },
    }),
    /SOURCE_FIXTURE_FAILED/,
  )
  assert.equal(h.state.error, first)
})
test('actual full finalizer handoff invariant retains original guard/assert ordering and rejects each missing obligation', () => {
  const h = fixture()
  assertSourceFinalizerHandoff(h.runtime, { disposed: true, held: false })
  for (const after of [
    { disposed: false, held: false },
    { disposed: true, held: true },
  ])
    assert.throws(() => assertSourceFinalizerHandoff(h.runtime, after))
  const first = new Error('failed')
  h.fail(first)
  assert.throws(
    () =>
      assertSourceFinalizerHandoff(
        h.runtime,
        new Proxy(
          {},
          {
            get() {
              assert.fail('post-failure snapshot read')
            },
          },
        ),
      ),
    /SOURCE_FIXTURE_FAILED/,
  )
  assert.equal(h.state.error, first)
})

for (const overflow of [false, true]) {
  test(
    'actual retained refusal completion keeps dispose/capture/proof order and original cleanup reference ' + overflow,
    () => {
      const h = fixture(),
        order = [],
        diagnostics = {},
        before = { diagnostics },
        after = { diagnostics },
        actual = {
          get then() {
            assert.fail('cleanup consumed')
          },
        }
      let snapshots = 0
      const source = {
        snapshot() {
          order.push('snapshot')
          return ++snapshots === 1 ? before : after
        },
        dispose() {
          order.push('source-dispose')
        },
      }
      const database = {}
      const result = completeSourceCaptureRefusal(
        h.runtime,
        { source, database },
        overflow,
        current => {
          assert.equal(current, database)
          order.push('database-dispose')
          return actual
        },
        (s, d, old) => {
          assert.equal(s, source)
          assert.equal(d, database)
          assert.equal(old, diagnostics)
          order.push('retained-proof')
        },
      )
      assert.deepEqual(order, ['snapshot', 'source-dispose', 'database-dispose', 'retained-proof', 'snapshot'])
      assert.equal(h.state.current.original, actual)
      assert.equal(result.source, after)
      assert.equal(result.expected, overflow ? 'ORIGINAL_ALLOCATION_BOUND' : 'ORIGINAL_LATE_OBSERVER_REFUSED')
      assert.equal(result.retained, true)
      assert.equal(result.captureSqlEntries, 0)
    },
  )
}
test('actual transaction callback returns exact capture envelope without consuming its lazy reply', async () => {
  const h = fixture(),
    reply = {
      get then() {
        assert.fail('lazy reply consumed')
      },
    },
    envelope = { reply }
  const f = {
    permit: {},
    source: {
      transport: {
        request() {
          return reply
        },
      },
    },
  }
  const callback = createSourceRefusalTransaction(
    h.runtime,
    { capture: fn => fn() },
    f,
    {
      assertTransactionSettings() {
        return Promise.resolve()
      },
      capture(fn) {
        assert.equal(fn(), reply)
        return envelope
      },
    },
    true,
    () => {},
  ).callback
  assert.equal(
    await callback({
      $executeRawUnsafe() {
        return Promise.resolve(1)
      },
    }),
    envelope,
  )
})
