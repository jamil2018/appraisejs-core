// Passive actual fixture forwarding. No product/client import or execution at module load.
import assert from 'node:assert/strict'
import type { createFixtureAdmission } from './custody-fixture-admission'
import {
  assertEligibleSourceDestruction,
  originalSourceResources,
  type OriginalSourceResourceDiagnostics,
} from './custody-source-resource-diagnostics.ts'
type Admission = ReturnType<typeof createFixtureAdmission>
export type ComplementMethod = '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction' | '$disconnect'
export type ComplementObservationState = {
  receivers: Map<object, { raw: number; transactions: number; disconnects: number }>
  transactions: WeakSet<object>
  entries: number
  barriers: number
  discoveryComplete: boolean
}
export function observeComplementAction(admission: Admission, action: () => void): void {
  if (admission.unexpectedFailure) return
  try {
    action()
  } catch (error) {
    admission.fail(error, '16h:passive-persistence-observation')
  }
}
export function countComplementPersistence(
  admission: Admission,
  state: ComplementObservationState,
  name: string,
  receiver: object,
  method: ComplementMethod,
  args: unknown[] = [],
): void {
  observeComplementAction(admission, () => {
    assert.ok(++state.entries <= 2048, '16h ordinary persistence entry bound')
    if (state.transactions.has(receiver)) {
      if (
        method === '$executeRawUnsafe' &&
        typeof args[0] === 'string' &&
        args[0].startsWith('UPDATE "QualityJourneyProviderSourceState"')
      )
        state.barriers++
      return
    }
    let row = state.receivers.get(receiver)
    if (!row) {
      assert.equal(state.discoveryComplete, false, 'Unknown receiver after exact factory discovery')
      assert.ok(state.receivers.size < (name === 'wrong-original-client' ? 4 : 2), 'Extra genuine persistence receiver')
      row = { raw: 0, transactions: 0, disconnects: 0 }
      state.receivers.set(receiver, row)
      admission.keepActual('16h:ordinary-receiver', receiver)
    }
    if (method === '$transaction') row.transactions++
    else if (method === '$disconnect') row.disconnects++
    else row.raw++
  })
}
export function forwardComplementRaw(
  admission: Admission,
  count: (receiver: object, method: ComplementMethod, args?: unknown[]) => void,
  receiver: object,
  method: '$queryRawUnsafe' | '$executeRawUnsafe',
  original: (...args: unknown[]) => unknown,
  args: unknown[],
): unknown {
  const actual = Reflect.apply(original, receiver, args)
  admission.keepActual(`16h:actual-${method}`, actual)
  count(receiver, method, args)
  return actual
}
export function forwardComplementTransaction(
  admission: Admission,
  state: ComplementObservationState,
  count: (receiver: object, method: ComplementMethod, args?: unknown[]) => void,
  receiver: object,
  original: (...args: unknown[]) => unknown,
  action: unknown,
  args: unknown[],
): unknown {
  const callback = function (this: unknown, ...callbackArgs: unknown[]) {
    observeComplementAction(admission, () => {
      assert.equal(typeof callbackArgs[0], 'object')
      state.transactions.add(callbackArgs[0] as object)
    })
    const actual = Reflect.apply(action as (...args: unknown[]) => unknown, this, callbackArgs)
    return admission.keepActual('16h:actual-persistence-callback', actual)
  }
  const actual = Reflect.apply(original, receiver, [typeof action === 'function' ? callback : action, ...args])
  admission.keepActual('16h:actual-persistence-outer', actual)
  count(receiver, '$transaction')
  return actual
}
export type ComplementCleanupState<Snapshot extends { disposed: boolean; held: boolean }> = {
  target: { client: object; source: { snapshot(): Snapshot } } | undefined
  cleanupThrow: boolean
  controlledCalls: number
  sourceAtCleanup: Snapshot | undefined
  cleanupError: Error
  cleanupBefore: OriginalSourceResourceDiagnostics | undefined
}
export function forwardComplementDisconnect<Snapshot extends { disposed: boolean; held: boolean }>(
  admission: Admission,
  state: ComplementCleanupState<Snapshot>,
  count: (receiver: object, method: ComplementMethod, args?: unknown[]) => void,
  receiver: object,
  original: (...args: unknown[]) => unknown,
  args: unknown[],
): unknown {
  count(receiver, '$disconnect')
  if (state.cleanupThrow && state.target && receiver === state.target.client && !admission.unexpectedFailure) {
    observeComplementAction(admission, () => {
      state.controlledCalls++
      state.sourceAtCleanup = admission.keepActual('16h:source-at-cleanup', state.target!.source.snapshot())
      assert.equal(state.sourceAtCleanup.disposed, true)
      assert.equal(state.sourceAtCleanup.held, false)
      assertEligibleSourceDestruction(state.cleanupBefore!, originalSourceResources(state.sourceAtCleanup))
    })
    if (!admission.unexpectedFailure) throw state.cleanupError
  }
  return admission.keepActual('16h:actual-client-cleanup', Reflect.apply(original, receiver, args))
}

// Shared complete held/retired baseline invariant; each caller retains its own causal/request proof.
export function assertComplementHeldBaseline<
  T extends { source: { held: boolean; retired: boolean }; database: { held: boolean; retired: boolean } },
>(baseline: T): T {
  assert.equal(baseline.source.held, true)
  assert.equal(baseline.source.retired, true)
  assert.equal(baseline.database.held, true)
  assert.equal(baseline.database.retired, true)
  return baseline
}
