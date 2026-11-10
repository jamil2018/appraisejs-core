// Actual source fixture protocols; no product imports. Original reservation remains synchronous.
import assert from 'node:assert/strict'
export function startSourceSendReservation(runtime, permit, client, beginOriginal) {
  return runtime.keep(runtime.begin('SEND_RESERVE'), beginOriginal(permit, client))
}
export function acceptSourceSendReservation(runtime, operation) {
  runtime.assertActive()
  assert(operation)
  runtime.assertActive()
  runtime.retain('sourceOperation', operation)
  runtime.assertActive()
}
export function assertSourceFactoryRefusal(runtime, createOriginal) {
  assert.throws(() => {
    runtime.assertActive()
    return runtime.keep(runtime.begin('EXPECTED_FACTORY_REFUSAL', 'auxiliary'), createOriginal())
  }, /source_custody_slot_unavailable/)
}

export function completeSourceCaseResult(runtime, selected, result, trace) {
  runtime.assertActive()
  if (!('retained' in result && result.retained)) trace.restore()
  runtime.assertActive()
  return {
    ...result,
    methodEntries: trace.counts(),
    engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED',
    schema: selected === 'storage' ? 'FULL_CANONICAL_93' : 'MINIMAL_COMPONENT_NO_CANONICAL_RELEASE',
  }
}

export function assertSourceFinalizerHandoff(runtime, after) {
  runtime.assertActive()
  assert.equal(after.disposed, true)
  runtime.assertActive()
  assert.equal(after.held, false)
  runtime.assertActive()
}

// The actual complete original transaction callback, including its existing delayed microtask.
export function createSourceRefusalTransaction(runtime, trace, fixture, operation, overflow, consumePermit) {
  let delayed
  const f = fixture
  const callback = async tx => {
    try {
      runtime.assertActive()
      const actualRowCount2 = await runtime.keep(
        runtime.begin('CANONICAL_UPDATE_10146', 'auxiliary'),
        tx.$executeRawUnsafe('UPDATE QualityJourneyProviderRun SET id=id WHERE id=?', 'run'),
      )
      runtime.assertActive()
      assert.equal(actualRowCount2, 1)
      runtime.assertActive()
      await runtime.keep(
        runtime.begin('CANONICAL_SETTINGS_10240', 'auxiliary'),
        operation.assertTransactionSettings(tx),
      )
      runtime.assertActive()
      return trace.capture(() => {
        runtime.assertActive()
        return operation.capture(() => {
          runtime.assertActive()
          consumePermit(f.permit)
          runtime.assertActive()
          if (overflow) return f.source.transport.request('thread/start', {})
          runtime.assertActive()
          const delayedAdmission = runtime.begin('DELAYED_ORIGINAL', 'auxiliary')
          delayed = runtime.keep(
            delayedAdmission,
            Promise.resolve().then(() => {
              runtime.assertActive()
              return f.source.transport.request('thread/start', {})
            }),
          )
          runtime.assertActive()
          runtime.keep(
            runtime.begin('DELAYED_CATCH', 'auxiliary'),
            delayed.catch(() => {
              runtime.assertActive()
            }),
          )
          runtime.assertActive()
          runtime.retain('actualDelayedOriginalCallback', delayed)
          runtime.assertActive()
          return delayed
        })
      })
    } catch (fixtureError) {
      runtime.assertActive()
      throw fixtureError
    }
  }
  return Object.freeze({
    callback,
    get delayed() {
      return delayed
    },
  })
}

// Whole retained capture cleanup/proof phase, synchronous at its original post-await position.
export function completeSourceCaptureRefusal(runtime, f, overflow, disposeDatabase, assertRetained) {
  const before = f.source.snapshot().diagnostics
  runtime.assertActive()
  f.source.dispose()
  runtime.assertActive()
  runtime.keep(runtime.begin('RETIRED_CAPTURE_CLEANUP'), disposeDatabase(f.database))
  runtime.assertActive()
  assertRetained(f.source, f.database, before)
  runtime.assertActive()
  return {
    retained: true,
    expected: overflow ? 'ORIGINAL_ALLOCATION_BOUND' : 'ORIGINAL_LATE_OBSERVER_REFUSED',
    source: f.source.snapshot(),
    captureSqlEntries: 0,
  }
}
