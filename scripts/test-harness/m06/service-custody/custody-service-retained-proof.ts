// Complete retained-owner result proofs; no inspection/liveness/DB effect at import.
import assert from 'node:assert/strict'
import { assertActivationRetainedOutcome } from './custody-activation-proof.ts'
import type {
  ProviderReconciliationReceipt,
  providerReconciliationRequestHash,
} from '@/lib/quality-journey/provider-reconciliation-contract'
type Message = Record<string, unknown>
type Owner = { pid: number; terminal?: Message }
type Expect = import('./custody-service-expect').ServiceFixtureExpect
export function assertServiceComplementRetainedOutcome(
  name: string,
  value: Message,
  retainedComplements: Readonly<Record<string, string>>,
) {
  assert.equal(value.classification, retainedComplements[name])
  assert.equal(value.canonicalOutcome, 'KNOWN_COMMITTED')
  assert.ok(value.baseline && typeof value.baseline === 'object')
  const baseline = value.baseline as Message
  const source = baseline.source as Message
  const resources = baseline.database as Message
  assert.ok(source && resources)
  assert.deepEqual(value.resources, resources)
  assert.equal(resources.retired, true)
  if (name === 'retired-release-sync-cleanup-throw') {
    assert.equal(value.cleanupOutcome, 'RETIRED_UNKNOWN_CONTROLLED_JS_CLIENT_THROW')
    assert.equal(value.resolverCleanup, 'UNREQUESTED')
    assert.equal(value.outerFulfilled, true)
    assert.equal(value.controlledCleanupCalls, 1)
    assert.equal(source.disposed, true)
    assert.equal(source.held, false)
    assert.equal(source.retired, false)
    assert.equal(resources.held, false)
    assert.deepEqual((resources.canonical as Message).layers, {
      client: 'REJECTED',
      engine: 'UNREQUESTED',
      native: 'UNREQUESTED',
    })
    assert.deepEqual((resources.resolver as Message).layers, {
      client: 'UNREQUESTED',
      engine: 'UNREQUESTED',
      native: 'UNREQUESTED',
    })
    return
  }
  assert.equal(source.disposed, false)
  assert.equal(source.held, true)
  assert.equal(source.retired, true)
  assert.equal(resources.held, true)
  if (name === 'old-commit-other-key-retirement') {
    assert.equal(value.retainedOperation, 'RECONCILE_B_FIRST_BARRIER_REJECTED')
    assert.equal(value.keyB, 'other-key-B')
    assert.match(String(value.hashB), /^sha256:[0-9a-f]{64}$/)
    assert.equal(value.callbackEntries, 1)
    assert.equal(value.barrierEntries, 1)
    assert.equal(value.outerRejected, true)
    assert.equal(source.disposeRequested, true)
  } else {
    assert.equal(name, 'unrelated-pre-sql-retirement')
    assert.equal(value.retainedOperation, 'PRE_SQL_REFUSAL_WITH_ACTUAL_SOURCE_HOLD')
    assert.equal(value.publicMethod, 'observeEncodingHole')
    assert.equal(value.probeCalls, 1)
    assert.equal(value.newPersistenceEntries, 0)
  }
}

export function assertServiceRetainedAmbiguousResult(
  name: string,
  owner: Owner,
  expected: Message,
  expect: Expect,
  assertAlive: (pid: number) => void,
): void {
  expect(owner.terminal?.classification).toBe('UNKNOWN_ACTUAL_OWNER_RETAINED')
  if (name === 'activation-unknown') assertActivationRetainedOutcome(owner.terminal!, expected)
  assert.doesNotThrow(() => assertAlive(owner.pid))
}
export function assertServiceRetainedComplementResult(
  name: string,
  owner: Owner,
  expected: Message,
  retainedComplements: Readonly<Record<string, string>>,
  expect: Expect,
  requestHash: typeof providerReconciliationRequestHash,
  assertAlive: (pid: number) => void,
): void {
  assert.ok(owner.terminal)
  assertServiceComplementRetainedOutcome(name, owner.terminal, retainedComplements)
  if (name === 'retired-release-sync-cleanup-throw') {
    const result = owner.terminal.result as Message
    expect(result.receipt).toEqual(expected.receipt)
    expect(result.requestHash).toBe(expected.requestHash)
  } else {
    const canonical = expected.complementCanonical as Message
    expect((canonical.hub as Message).version).toBe(2)
    expect((canonical.run as Message).turnsReserved).toBe(1)
    expect((canonical.state as Message).lifecycle).toBe('COMMITTED')
    expect(canonical.observations).toHaveLength(1)
    if (name === 'old-commit-other-key-retirement')
      expect(owner.terminal.hashB).toBe(
        requestHash(
          String((expected.identity as Message).intentId),
          'other-key-B',
          expected.receipt as ProviderReconciliationReceipt,
        ),
      )
  }
  assert.doesNotThrow(() => assertAlive(owner.pid))
}
export function dispatchServiceCaseResult<T>(
  family: 'retained-ambiguous' | 'retained-complement' | 'exited-recovery',
  handlers: Readonly<Record<'retained-ambiguous' | 'retained-complement' | 'exited-recovery', () => T>>,
): T {
  return handlers[family]()
}
