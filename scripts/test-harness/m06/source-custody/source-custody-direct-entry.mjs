// OS-main fallback only. Imported tests and wrapper workers never call this bootstrap.
import assert from 'node:assert/strict'
import { sourceControllerEffects } from './source-custody-controller-effects.mjs'
import {
  createSourceLaunchCustody,
  assertSourceLaunchActive,
  failSourceLaunch,
  publishSourceLaunchFailure,
} from './source-custody-launch.mjs'
const { process: originalProcess, setInterval, clearInterval } = sourceControllerEffects
const invocations = new Map()
export function createSourceDirectGuard() {
  const state = Object.seal({
    failed: false,
    firstError: undefined,
    custody: undefined,
    interval: undefined,
    completed: false,
  })
  function fail(error) {
    if (!state.failed) {
      state.firstError = state.custody?.failed ? state.custody.firstError : error
      state.failed = true
    }
    // A process callback never throws into an admitted continuation or EventEmitter.
    try {
      if (state.custody) {
        failSourceLaunch(state.custody, state.custody.currentRole ?? 'supervisor', 'direct-process', state.firstError)
        publishSourceLaunchFailure(state.custody, state.custody.identity.directory)
      }
    } catch {}
    try {
      originalProcess.exitCode = 1
    } catch {}
  }
  function assertActive() {
    if (state.failed) throw state.firstError
    assert(!state.completed, 'Direct invocation already completed')
    if (state.custody?.failed) throw state.custody.firstError
  }
  const guard = Object.freeze({
    get failed() {
      return state.failed
    },
    get firstError() {
      return state.firstError
    },
    fail,
    assertActive,
    bind(custody) {
      assertActive()
      assert.equal(state.custody, undefined, 'One exact direct-controller context')
      assertSourceLaunchActive(custody)
      state.custody = custody
      assertActive()
    },
    complete() {
      assertActive()
      if (state.custody) assert.equal(state.custody.completed, true, 'Actual context lifecycle completion required')
      clearInterval(state.interval)
      assertActive()
      state.completed = true
    },
  })
  invocations.set(guard, state)
  // The referenced anchor and both callbacks are preowned before any controller operation.
  try {
    state.interval = setInterval(() => void state.custody, 60_000)
    originalProcess.on('uncaughtException', fail)
    originalProcess.on('unhandledRejection', fail)
  } catch (error) {
    fail(error)
  }
  return guard
}
export function runSourceDirectEntry(operation) {
  const guard = createSourceDirectGuard()
  try {
    guard.assertActive()
    Promise.resolve(operation(guard)).then(() => {
      try {
        guard.complete()
      } catch (error) {
        guard.fail(error)
      }
    }, guard.fail)
  } catch (error) {
    guard.fail(error)
  }
  return guard
}

export function createSourceControllerBoundary(guard, identity) {
  guard.assertActive()
  const custody = createSourceLaunchCustody(identity)
  guard.bind(custody)
  const records = Object.seal({ setup: undefined, owner: undefined, inspector: undefined, supervisor: undefined })
  return Object.freeze({ custody, records })
}
