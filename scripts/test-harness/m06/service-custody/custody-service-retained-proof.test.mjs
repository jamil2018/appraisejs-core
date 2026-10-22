import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import {
  assertServiceComplementRetainedOutcome,
  assertServiceRetainedAmbiguousResult,
  assertServiceRetainedComplementResult,
  dispatchServiceCaseResult,
} from './custody-service-retained-proof.ts'
const classifications = {
  'old-commit-other-key-retirement': 'KNOWN_COMMITTED_OTHER_REQUEST_RETIRED',
  'unrelated-pre-sql-retirement': 'KNOWN_COMMITTED_UNRELATED_PRE_SQL_RETIRED',
  'retired-release-sync-cleanup-throw': 'KNOWN_COMMITTED_CLEANUP_RETIRED_UNKNOWN',
}
function fixture(name) {
  const cleanup = name === 'retired-release-sync-cleanup-throw',
    source = { disposed: cleanup, held: !cleanup, retired: !cleanup, disposeRequested: true },
    database = {
      retired: true,
      held: !cleanup,
      canonical: {
        layers: { client: cleanup ? 'REJECTED' : 'UNREQUESTED', engine: 'UNREQUESTED', native: 'UNREQUESTED' },
      },
      resolver: { layers: { client: 'UNREQUESTED', engine: 'UNREQUESTED', native: 'UNREQUESTED' } },
    }
  const value = {
    classification: classifications[name],
    canonicalOutcome: 'KNOWN_COMMITTED',
    baseline: { source, database },
    resources: database,
  }
  if (name === 'old-commit-other-key-retirement')
    Object.assign(value, {
      retainedOperation: 'RECONCILE_B_FIRST_BARRIER_REJECTED',
      keyB: 'other-key-B',
      hashB: `sha256:${'a'.repeat(64)}`,
      callbackEntries: 1,
      barrierEntries: 1,
      outerRejected: true,
    })
  else if (cleanup)
    Object.assign(value, {
      cleanupOutcome: 'RETIRED_UNKNOWN_CONTROLLED_JS_CLIENT_THROW',
      resolverCleanup: 'UNREQUESTED',
      outerFulfilled: true,
      controlledCleanupCalls: 1,
      result: { receipt: {}, requestHash: 'A' },
    })
  else
    Object.assign(value, {
      retainedOperation: 'PRE_SQL_REFUSAL_WITH_ACTUAL_SOURCE_HOLD',
      publicMethod: 'observeEncodingHole',
      probeCalls: 1,
      newPersistenceEntries: 0,
    })
  return value
}
function inertExpect(actual) {
  return {
    toBe: expected => assert.equal(actual, expected),
    toEqual: expected => assert.deepEqual(actual, expected),
    toHaveLength: length => assert.equal(actual.length, length),
  }
}
for (const name of Object.keys(classifications)) {
  test(`actual complete ${name} retention proof requires all causal/held-layer assertions`, () => {
    const value = fixture(name)
    assertServiceComplementRetainedOutcome(name, value, classifications)
    const mutate = [
      v => {
        v.classification = 'foreign'
      },
      v => {
        v.canonicalOutcome = 'UNKNOWN'
      },
      v => {
        v.resources = {}
      },
      v => {
        v.baseline.database.retired = false
      },
      v => {
        v.baseline.source.held = !v.baseline.source.held
      },
    ]
    for (const change of mutate) {
      const bad = structuredClone(value)
      change(bad)
      assert.throws(() => assertServiceComplementRetainedOutcome(name, bad, classifications))
    }
  })
}
test('retained complement post-supervisor proof binds canonical A, exact B hash or cleanup result before liveness effect', () => {
  const expected = {
    receipt: {},
    requestHash: 'A',
    identity: { intentId: 'intent' },
    complementCanonical: {
      hub: { version: 2 },
      run: { turnsReserved: 1 },
      state: { lifecycle: 'COMMITTED' },
      observations: [{}],
    },
  }
  const calls = [],
    hash = (intent, key, receipt) => {
      calls.push(['hash', intent, key, receipt])
      return `sha256:${'a'.repeat(64)}`
    },
    alive = pid => calls.push(['alive', pid])
  for (const name of Object.keys(classifications))
    assertServiceRetainedComplementResult(
      name,
      { pid: 123, terminal: fixture(name) },
      expected,
      classifications,
      inertExpect,
      hash,
      alive,
    )
  assert.equal(calls.filter(row => row[0] === 'alive').length, 3)
  assert.deepEqual(calls[0], ['hash', 'intent', 'other-key-B', expected.receipt])
  const bad = structuredClone(expected)
  bad.complementCanonical.run.turnsReserved = 0
  assert.throws(() =>
    assertServiceRetainedComplementResult(
      'old-commit-other-key-retirement',
      { pid: 123, terminal: fixture('old-commit-other-key-retirement') },
      bad,
      classifications,
      inertExpect,
      hash,
      () => assert.fail('no liveness after failed proof'),
    ),
  )
})
test('retained ambiguous family proves classification and never enters inspector routing', () => {
  const calls = [],
    value = { classification: 'UNKNOWN_ACTUAL_OWNER_RETAINED' }
  assertServiceRetainedAmbiguousResult('paused-send', { pid: 123, terminal: value }, {}, inertExpect, pid =>
    calls.push(pid),
  )
  assert.deepEqual(calls, [123])
  assert.throws(() =>
    assertServiceRetainedAmbiguousResult(
      'paused-send',
      { pid: 123, terminal: { classification: 'foreign' } },
      {},
      inertExpect,
      () => assert.fail('forbidden liveness'),
    ),
  )
  const promise = Promise.resolve(),
    handlers = {
      'retained-ambiguous': () => promise,
      'retained-complement': () => promise,
      'exited-recovery': () => {
        throw new Error('inspector must stay separate')
      },
    }
  assert.equal(dispatchServiceCaseResult('retained-ambiguous', handlers), promise)
  assert.equal(dispatchServiceCaseResult('retained-complement', handlers), promise)
  assert.throws(() => dispatchServiceCaseResult('exited-recovery', handlers), /inspector/)
})

// Extract only the actual local pure assertion; never evaluate the composition owner or its imports.
function compositionSnapshotAssertion() {
  const require = createRequire(import.meta.url)
  const ts = require('typescript')
  const filename = new URL('./custody-service-composition.ts', import.meta.url)
  const source = ts.createSourceFile(filename.pathname, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true)
  const helper = source.statements.find(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'assertSettledCompositionSnapshot',
  )
  assert.ok(helper)
  const javascript = ts.transpileModule(helper.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return vm.runInNewContext(javascript + '\nassertSettledCompositionSnapshot', { assert })
}
function settledCompositionSnapshots() {
  const delivered = {
    state: 'stopped',
    originalStartState: 'PENDING',
    childLaunchEntered: true,
    fenced: true,
    reason: 'LOGICAL_COMPLETION',
    transportId: 'original-transport',
    providerRunId: 'canonical-B',
    intentId: 'canonical-B-intent',
    sendBoundaryId: 'canonical-B-send',
    claimEpoch: 1,
    completed: true,
    cleanup: { status: 'stopped', groupExitObserved: true, privateRootRemoved: true },
    transport: { pendingRequests: 0, writing: false },
    providerTerminationProven: false,
    slotReleased: false,
  }
  return { delivered, actual: { ...structuredClone(delivered), originalStartState: 'FULFILLED' } }
}
test('composition accepts memoized pending or fulfilled diagnostics after the actual original start fulfills', () => {
  const compare = compositionSnapshotAssertion()
  const { actual, delivered } = settledCompositionSnapshots()
  assert.throws(() => assert.deepEqual(actual, delivered)) // Reproduces the old whole-snapshot assertion failure.
  compare(actual, delivered)
  compare(actual, { ...delivered, originalStartState: 'FULFILLED' })
})
test('composition preserves every authoritative and nested drain field in its settled snapshot comparison', () => {
  const compare = compositionSnapshotAssertion()
  for (const change of [
    value => {
      value.providerRunId = 'foreign-run'
    },
    value => {
      value.sendBoundaryId = 'foreign-send'
    },
    value => {
      value.claimEpoch = 2
    },
    value => {
      value.cleanup.status = 'unknown'
    },
    value => {
      value.cleanup.groupExitObserved = false
    },
    value => {
      value.cleanup.privateRootRemoved = false
    },
    value => {
      value.transport.pendingRequests = 1
    },
    value => {
      value.providerTerminationProven = true
    },
    value => {
      value.slotReleased = true
    },
    value => {
      value.unexpectedAuthority = 'must-not-be-ignored'
    },
  ]) {
    for (const side of ['actual', 'delivered']) {
      const pair = settledCompositionSnapshots()
      change(pair[side])
      assert.throws(() => compare(pair.actual, pair.delivered))
    }
  }
})
test('composition refuses unfulfilled starts, foreign memoized states, and launches never entered', () => {
  const compare = compositionSnapshotAssertion()
  for (const state of ['NOT_CALLED', 'PENDING', 'REJECTED', 'UNKNOWN', undefined]) {
    const pair = settledCompositionSnapshots()
    pair.actual.originalStartState = state
    assert.throws(() => compare(pair.actual, pair.delivered))
  }
  for (const state of ['NOT_CALLED', 'REJECTED', 'UNKNOWN', undefined]) {
    const pair = settledCompositionSnapshots()
    pair.delivered.originalStartState = state
    assert.throws(() => compare(pair.actual, pair.delivered))
  }
  for (const side of ['actual', 'delivered']) {
    const pair = settledCompositionSnapshots()
    pair[side].childLaunchEntered = false
    assert.throws(() => compare(pair.actual, pair.delivered))
  }
  const pair = settledCompositionSnapshots()
  pair.actual.childLaunchEntered = pair.delivered.childLaunchEntered = false
  assert.throws(() => compare(pair.actual, pair.delivered))
})
