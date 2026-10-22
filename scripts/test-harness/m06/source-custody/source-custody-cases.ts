import assert from 'node:assert/strict'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  acquireProviderSourceDatabaseHold,
  assertProviderSourceDatabaseClient,
  assertProviderSourceTransactionSettingsForClient,
  createProviderSourcePrismaClient,
  disposeProviderSourceDatabase,
  providerSourceDatabaseFor,
  providerSourceDatabaseSnapshot,
} from '../../../../src/lib/quality-journey/provider-source-database'
import {
  OutcomeSourceSqliteJournal,
  readProviderSourceLedgerRecords,
  sqliteOutcomeSourceProtocolDigest,
  type DiscardWindowTicket,
} from '../../../../src/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal'
import {
  beginOriginalSqliteDiscardSend,
  createSyntheticOutcomeCustodian,
} from '../../../../src/lib/quality-journey/codex-app-server/outcome-source'
import {
  outcomeDigest,
  outcomeSourceBounds,
} from '../../../../src/lib/quality-journey/codex-app-server/outcome-source-contract'
import {
  bindProviderSendPermitTransport,
  consumeProviderSendPermit,
  createProviderSendPermit,
  sealConsumedProviderSender,
  trustedProviderArm,
} from '../../../../src/lib/quality-journey/provider-intent-contract'
import { validateProviderReconciliationEvidence } from '../../../../src/lib/quality-journey/provider-reconciliation-contract'
import { instrumentSourcePersistence, type SourceCaseRuntime } from './source-custody-instrumentation'
import type { createSourceIpcFault } from './source-custody-ipc-fault.mjs'
import { forwardSourceClientFinalizer } from './source-custody-passive-forwarding.mjs'
import {
  startSourceSendReservation,
  acceptSourceSendReservation,
  assertSourceFactoryRefusal,
  completeSourceCaseResult,
  assertSourceFinalizerHandoff,
  createSourceRefusalTransaction,
  completeSourceCaptureRefusal,
} from './source-custody-case-protocols.mjs'
type Runtime = SourceCaseRuntime
type Instrumentation = ReturnType<typeof instrumentSourcePersistence>
type Source = Awaited<ReturnType<typeof createSyntheticOutcomeCustodian>>
async function factory(directory: string, runtime: Runtime, name = 'tested') {
  try {
    runtime.assertActive()
    const factoryAdmission = runtime.begin('FACTORY_READY')
    const pair = createProviderSourcePrismaClient(`file:${path.join(directory, name + '.db')}`)
    runtime.observation.capture(pair, factoryAdmission, 'factory-pair')
    const ready = runtime.keep(factoryAdmission, pair.ready)
    runtime.retain('factory:' + name, pair)
    const database = await ready
    runtime.assertActive()
    return { client: pair.client, database }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
function options(database: Awaited<ReturnType<typeof factory>>['database']) {
  return {
    database,
    sourceId: 'source',
    sourceIncarnation: 'incarnation',
    identity: {
      runId: 'run',
      intentId: 'intent',
      sendBoundaryId: 'boundary',
      claimEpoch: 1,
      providerNamespace: 'synthetic:source-regression',
      configurationDigest: outcomeDigest('configuration'),
    },
  }
}
async function sourceFixture(directory: string, runtime: Runtime) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('FACTORY_HELPER_2420', 'auxiliary'), factory(directory, runtime))
    runtime.assertActive()
    const source = await runtime.keep(
      runtime.begin('SOURCE_INITIALIZE'),
      createSyntheticOutcomeCustodian(options(f.database)),
    )
    runtime.assertActive()
    runtime.retain('source', source)
    runtime.assertActive()
    const permit = createProviderSendPermit(options(f.database).identity, trustedProviderArm)
    runtime.retain('permit', permit)
    runtime.assertActive()
    bindProviderSendPermitTransport(permit, source.transport.owner, options(f.database).identity)
    runtime.assertActive()
    runtime.retain('permit', permit)
    runtime.assertActive()
    return { ...f, source, permit }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
type Fixture = Awaited<ReturnType<typeof sourceFixture>>
async function send(f: Fixture, runtime: Runtime, trace: Instrumentation) {
  try {
    runtime.assertActive()
    const operation = await startSourceSendReservation(runtime, f.permit, f.client, beginOriginalSqliteDiscardSend)
    acceptSourceSendReservation(runtime, operation)
    const engineAdmission = runtime.begin('SEND_ENGINE')
    const engine = runtime.keep(
      engineAdmission,
      f.client.$transaction(async tx => {
        try {
          runtime.assertActive()
          trace.genuineTx(tx)
          runtime.assertActive()
          const actualRowCount1 = await runtime.keep(
            runtime.begin('CANONICAL_UPDATE_3364', 'auxiliary'),
            tx.$executeRawUnsafe('UPDATE QualityJourneyProviderRun SET id=id WHERE id=?', 'run'),
          )
          runtime.assertActive()
          // Exact actual first writer barrier, then the original operation's private settings continuation.
          assert.equal(actualRowCount1, 1)
          runtime.assertActive()
          await runtime.keep(
            runtime.begin('CANONICAL_SETTINGS_3458', 'auxiliary'),
            operation.assertTransactionSettings(tx),
          )
          runtime.assertActive()
          return trace.capture(() => {
            runtime.assertActive()
            return operation.capture(() => {
              runtime.assertActive()
              consumeProviderSendPermit(f.permit)
              runtime.assertActive()
              return f.source.transport.request('thread/start', {})
            })
          })
        } catch (fixtureError) {
          runtime.assertActive()
          throw fixtureError
        }
      }),
    )
    runtime.assertActive()
    try {
      runtime.assertActive()
      const box = await engine
      runtime.assertActive()
      await runtime.keep(
        runtime.begin('EXPECTED_REJECTION_3764', 'auxiliary'),
        assert.rejects(runtime.keep(runtime.begin('ORIGINAL_REPLY', 'auxiliary'), box.reply)),
      )
      runtime.assertActive()
      return { operation, engine }
    } catch (error) {
      runtime.assertActive()
      operation.retire(engine)
      throw error
    }
    runtime.assertActive()
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
function assertRetained(
  source: Source,
  database: Fixture['database'],
  before: ReturnType<Source['snapshot']>['diagnostics'],
) {
  assert.equal(source.snapshot().held, true)
  assert.equal(source.snapshot().retired, true)
  assert.deepEqual(source.snapshot().diagnostics, before)
  const state = providerSourceDatabaseSnapshot(database)
  assert.equal(state.held, true)
  assert.equal(state.retired, true)
  assert.equal(state.canonical.nativeCalls, 0)
  assert.equal(state.resolver.nativeCalls, 0)
  return state
}
async function cleanup(f: Awaited<ReturnType<typeof factory>>, source: Source | undefined, runtime: Runtime) {
  try {
    runtime.assertActive()
    source?.dispose()
    runtime.assertActive()
    await runtime.keep(runtime.begin('FULL_BINDING_CLEANUP'), disposeProviderSourceDatabase(f.database))
    runtime.assertActive()
    const closed = providerSourceDatabaseSnapshot(f.database)
    runtime.assertActive()
    assert.equal(closed.cleanupPending, false)
    runtime.assertActive()
    assert.equal(closed.retired, false)
    runtime.assertActive()
    for (const mint of [closed.canonical, closed.resolver]) {
      runtime.assertActive()
      assert.equal(mint.closed, true)
      runtime.assertActive()
      assert.equal(mint.stopCalls, 1)
      runtime.assertActive()
      assert.equal(mint.nativeCalls, 1)
      runtime.assertActive()
    }
    runtime.assertActive()
    return closed
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function sourceHappy(directory: string, runtime: Runtime, trace: Instrumentation) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_5084', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    await runtime.keep(runtime.begin('ORIGINAL_ENCODING_HOLE'), f.source.observeEncodingHole())
    runtime.assertActive()
    const sent = await runtime.keep(runtime.begin('SEND_HELPER_5218', 'auxiliary'), send(f, runtime, trace))
    runtime.assertActive()
    const beforeLate = trace.counts()
    runtime.assertActive()
    let lateCalled = false
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return sent.operation.capture(() => {
        runtime.assertActive()
        lateCalled = true
        runtime.assertActive()
        return Promise.resolve()
      })
    }, /discard_window_already_entered/)
    runtime.assertActive()
    assert.equal(lateCalled, false)
    runtime.assertActive()
    assert.deepEqual(trace.counts(), beforeLate, 'Late capture cannot schedule source persistence')
    runtime.assertActive()
    await runtime.keep(runtime.begin('SEND_FLUSH'), sent.operation.completeFulfilled())
    runtime.assertActive()
    await runtime.keep(runtime.begin('SOURCE_CLOSE'), f.source.close())
    runtime.assertActive()
    const seal = f.source.transport.sealSender()
    runtime.assertActive()
    const exclusion = sealConsumedProviderSender(f.permit, seal, { threadId: null, turnId: null })
    runtime.assertActive()
    const physical = await runtime.keep(runtime.begin('SOURCE_SEAL'), f.source.issueNonstart(exclusion, seal))
    runtime.assertActive()
    const receipt = validateProviderReconciliationEvidence(exclusion, physical, f.source.context)
    runtime.assertActive()
    assert.equal(receipt.physical.outcome, 'NONSTART')
    runtime.assertActive()
    assert.equal(receipt.finalWatermark.issuedRequests, 2)
    runtime.assertActive()
    assert(receipt.finalWatermark.writtenBytes > 0)
    runtime.assertActive()
    const rows = await runtime.keep(
      runtime.begin('LEDGER_READ_6251'),
      f.client.$transaction(tx => {
        runtime.assertActive()
        return readProviderSourceLedgerRecords(tx, receipt.physical.sourceId)
      }),
    )
    runtime.assertActive()
    assert(
      rows.some(row => {
        runtime.assertActive()
        return row.kind === 'NOT_EMITTED'
      }),
    )
    runtime.assertActive()
    assert(
      rows.some(row => {
        runtime.assertActive()
        return row.kind === 'DISCARDED'
      }),
    )
    runtime.assertActive()
    assert.equal(
      rows.filter(row => {
        runtime.assertActive()
        return row.kind === 'LOCAL_DISCARD_WINDOW_RESERVED'
      }).length,
      4,
    )
    runtime.assertActive()
    assert.equal(
      rows.filter(row => {
        runtime.assertActive()
        return row.kind === 'LOCAL_DISCARD_WINDOW_FLUSHED'
      }).length,
      4,
    )
    runtime.assertActive()
    const before = f.source.snapshot()
    runtime.assertActive()
    f.source.dispose()
    runtime.assertActive()
    assert.equal(f.source.snapshot().resources.keyNonzeroBytes, 0)
    runtime.assertActive()
    assert.equal(f.source.snapshot().diagnostics.source.replayTombstoneContainsOriginal, true)
    runtime.assertActive()
    const closed = await runtime.keep(runtime.begin('CLEANUP_HELPER_6854', 'auxiliary'), cleanup(f, f.source, runtime))
    runtime.assertActive()
    return { before, after: f.source.snapshot(), closed, captureSqlEntries: 0, canonicalRelease: false }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function sourceRejection(directory: string, runtime: Runtime, trace: Instrumentation, reserve: boolean) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_7119', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    let oldSend: Promise<unknown> | undefined
    runtime.assertActive()
    if (reserve) {
      runtime.assertActive()
      trace.rejectNextOuter('SEND_RESERVE')
      runtime.assertActive()
      await runtime.keep(
        runtime.begin('EXPECTED_REJECTION_7262', 'auxiliary'),
        assert.rejects(runtime.keep(runtime.begin('SEND_RESERVE'), beginOriginalSqliteDiscardSend(f.permit, f.client))),
      )
      runtime.assertActive()
    } else {
      runtime.assertActive()
      const sent = await runtime.keep(runtime.begin('SEND_HELPER_7399', 'auxiliary'), send(f, runtime, trace))
      runtime.assertActive()
      oldSend = sent.engine
      runtime.assertActive()
      const original = OutcomeSourceSqliteJournal.prototype.commitObservedDiscardWindow
      runtime.assertActive()
      Object.defineProperty(OutcomeSourceSqliteJournal.prototype, 'commitObservedDiscardWindow', {
        configurable: true,
        writable: true,
        value: function (this: OutcomeSourceSqliteJournal, ...args: Parameters<typeof original>) {
          const actual = Reflect.apply(original, this, args)
          runtime.observation.capture(actual, runtime.observation.origin(), 'first-flush')
          return actual
        },
      })
      runtime.assertActive()
      trace.rejectNextOuter('SEND_FLUSH')
      runtime.assertActive()
      await runtime.keep(
        runtime.begin('EXPECTED_REJECTION_7978', 'auxiliary'),
        assert.rejects(runtime.keep(runtime.begin('SEND_FLUSH'), sent.operation.completeFulfilled())),
      )
      runtime.assertActive()
      // Attempt the historical overwrite only AFTER actual flush rejection. Private stored identity is not exposed.
      sent.operation.retire(oldSend)
      runtime.assertActive()
      runtime.retain('olderFulfilledSendPromise', oldSend)
      runtime.assertActive()
    }
    runtime.assertActive()
    const before = f.source.snapshot().diagnostics
    runtime.assertActive()
    f.source.dispose()
    runtime.assertActive()
    const pending = runtime.keep(runtime.begin('RETIRED_CLEANUP_REQUEST'), disposeProviderSourceDatabase(f.database))
    runtime.assertActive()
    let fulfilled = false
    runtime.assertActive()
    runtime.keep(
      runtime.begin('PENDING_SETTLEMENT_OBSERVER', 'auxiliary'),
      pending.then(
        () => {
          runtime.assertActive()
          fulfilled = true
          runtime.assertActive()
        },
        () => {
          runtime.assertActive()
          fulfilled = true
          runtime.assertActive()
        },
      ),
    )
    runtime.assertActive()
    for (let n = 0; n < 8; n++) {
      await runtime.keep(runtime.begin('MICROTASK_8614', 'auxiliary'), Promise.resolve())
      runtime.assertActive()
    }
    runtime.assertActive()
    assert.equal(fulfilled, false)
    runtime.assertActive()
    assertRetained(f.source, f.database, before)
    runtime.assertActive()
    assertSourceFactoryRefusal(runtime, () =>
      createProviderSourcePrismaClient(`file:${path.join(directory, 'postcontrol.db')}`),
    )
    runtime.assertActive()
    return {
      retained: true,
      expected: 'ACTUAL_CALLBACK_OUTER_REJECTION',
      source: f.source.snapshot(),
      database: providerSourceDatabaseSnapshot(f.database),
      firstFlushHarnessReferenceRetained: !reserve,
      privateStoredPromiseIdentity: 'RUNTIME_UNOBSERVABLE_STATIC_CATCH_CHAIN_REQUIRED',
      olderFulfilledOverwriteAttempt: !!oldSend,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function originalRefusalFixture(directory: string, runtime: Runtime, overflow: boolean) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_9340', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    if (overflow) {
      runtime.assertActive()
      for (let index = 0; index < outcomeSourceBounds.allocations; index++) {
        await runtime.keep(runtime.begin('LEGITIMATE_PRE_SEND_ENCODING_HOLE'), f.source.observeEncodingHole())
        runtime.assertActive()
      }
      runtime.assertActive()
      assert.equal(f.source.snapshot().allocations, outcomeSourceBounds.allocations)
      runtime.assertActive()
    }
    runtime.assertActive()
    return f
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function originalCaptureRefusal(directory: string, runtime: Runtime, trace: Instrumentation, overflow: boolean) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(
      runtime.begin('REFUSAL_PREPARATION_9798', 'auxiliary'),
      originalRefusalFixture(directory, runtime, overflow),
    )
    runtime.assertActive()
    const operation = await startSourceSendReservation(runtime, f.permit, f.client, beginOriginalSqliteDiscardSend)
    acceptSourceSendReservation(runtime, operation)
    runtime.assertActive()
    const engineAdmission = runtime.begin('SEND_ENGINE')
    const refusal = createSourceRefusalTransaction(runtime, trace, f, operation, overflow, consumeProviderSendPermit)
    const engine = runtime.keep(engineAdmission, f.client.$transaction(refusal.callback))
    runtime.assertActive()
    runtime.assertActive()
    let rejected = false
    runtime.assertActive()
    try {
      runtime.assertActive()
      await runtime.keep(runtime.begin('FIXTURE_AWAIT_10796', 'auxiliary'), engine)
      runtime.assertActive()
    } catch (error) {
      runtime.assertActive()
      operation.retire(engine)
      runtime.retain('actualCaptureError', error)
      rejected = true
    }
    runtime.assertActive()
    assert(rejected, 'Capture fault must reject its actual Prisma outer')
    runtime.assertActive()
    if (refusal.delayed)
      await runtime.keep(runtime.begin('EXPECTED_REJECTION_11021', 'auxiliary'), assert.rejects(refusal.delayed))
    runtime.assertActive()
    return completeSourceCaptureRefusal(runtime, f, overflow, disposeProviderSourceDatabase, assertRetained)
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function journalFixture(directory: string, runtime: Runtime) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('FACTORY_HELPER_11519', 'auxiliary'), factory(directory, runtime))
    runtime.assertActive()
    const base = options(f.database)
    runtime.assertActive()
    runtime.assertActive()
    const journal = new OutcomeSourceSqliteJournal({
      ...base,
      identity: {
        ...base.identity,
        transportId: 'journal-transport',
        transportIncarnation: 'journal-incarnation',
        threadId: null,
        turnId: null,
      },
      protocolDigest: sqliteOutcomeSourceProtocolDigest,
      qualificationDigest: outcomeDigest('unqualified'),
    })

    runtime.retain('journal', journal)
    runtime.assertActive()
    const hold = acquireProviderSourceDatabaseHold(f.database, 'INITIALIZE')

    runtime.retain('initializeHold', hold)
    runtime.assertActive()
    await runtime.keep(runtime.begin('JOURNAL_INITIALIZE'), journal.initialize(hold))
    runtime.assertActive()
    hold.complete(() => {
      runtime.assertActive()
    })
    runtime.assertActive()
    return { ...f, journal }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function journalBinding(directory: string, runtime: Runtime, trace: Instrumentation) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(
      runtime.begin('JOURNAL_FIXTURE_12326', 'auxiliary'),
      journalFixture(directory, runtime),
    )
    runtime.assertActive()
    const hold = acquireProviderSourceDatabaseHold(f.database, 'SEND')

    runtime.retain('sendHold', hold)
    runtime.assertActive()
    const ticket = await runtime.keep(
      runtime.begin('JOURNAL_RESERVE'),
      f.journal.reserveDiscardWindow(hold, outcomeDigest('original')),
    )
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.runReservedSynchronousDiscard({} as DiscardWindowTicket, () => {
        runtime.assertActive()
      })
    }, /original_discard_window_required/)
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_12740', 'auxiliary'),
      assert.rejects(
        runtime.keep(
          runtime.begin('EXPECTED_ORIGINAL_12764'),
          f.journal.reserveDiscardWindow(hold, outcomeDigest('duplicate')),
        ),
        /discard_window_pending/,
      ),
    )
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('JOURNAL_CANONICAL'),
      f.client.$transaction(async tx => {
        try {
          runtime.assertActive()
          const actualRowCount3 = await runtime.keep(
            runtime.begin('CANONICAL_UPDATE_12937', 'auxiliary'),
            tx.$executeRawUnsafe('UPDATE QualityJourneyProviderRun SET id=id WHERE id=?', 'run'),
          )
          runtime.assertActive()
          assert.equal(actualRowCount3, 1)
          runtime.assertActive()
          await runtime.keep(
            runtime.begin('CANONICAL_SETTINGS_13031', 'auxiliary'),
            assertProviderSourceTransactionSettingsForClient(f.client, tx, hold, 'SEND_CANONICAL'),
          )
          runtime.assertActive()
          trace.capture(() => {
            runtime.assertActive()
            return f.journal.runReservedSynchronousDiscard(ticket, () => {
              runtime.assertActive()
              return f.journal.append('TEST_RECORD', { utf8: 'é' })
            })
          })
          runtime.assertActive()
        } catch (fixtureError) {
          runtime.assertActive()
          throw fixtureError
        }
      }),
    )
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.assertObservationAdmission()
    }, /source_observation_admission_closed/)
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.runReservedSynchronousDiscard(ticket, () => {
        runtime.assertActive()
      })
    }, /discard_window_already_entered/)
    runtime.assertActive()
    await runtime.keep(runtime.begin('JOURNAL_FLUSH'), f.journal.commitObservedDiscardWindow(hold, ticket))
    runtime.assertActive()
    hold.complete(() => {
      runtime.assertActive()
    })
    runtime.assertActive()
    const rows = await runtime.keep(
      runtime.begin('LEDGER_READ_13660'),
      f.client.$transaction(tx => {
        runtime.assertActive()
        return readProviderSourceLedgerRecords(tx, 'source')
      }),
    )
    runtime.assertActive()
    assert.deepEqual(
      rows.map(row => {
        runtime.assertActive()
        return row.kind
      }),
      ['CREATED', 'LOCAL_DISCARD_WINDOW_RESERVED', 'TEST_RECORD', 'LOCAL_DISCARD_WINDOW_FLUSHED'],
    )
    runtime.assertActive()
    assert.equal(f.journal.snapshot().sequence, rows.length)
    runtime.assertActive()
    assert.equal(f.journal.snapshot().head, rows.at(-1)!.head)
    runtime.assertActive()
    assert.equal(
      f.journal.snapshot().byteCount,
      rows.reduce((sum, row) => {
        runtime.assertActive()
        return sum + row.byteCount
      }, 0),
    )
    runtime.assertActive()
    const receiptHold = acquireProviderSourceDatabaseHold(f.database, 'RECEIPT')

    runtime.retain('receiptHold', receiptHold)
    runtime.assertActive()
    const receiptTicket = await runtime.keep(
      runtime.begin('RECEIPT_RESERVE_14272'),
      f.journal.reserveDiscardWindow(receiptHold, outcomeDigest('receipt'), 'RECEIPT'),
    )
    runtime.assertActive()
    f.journal.runReservedSynchronousDiscard(receiptTicket, () => {
      runtime.assertActive()
      return f.journal.append('RECEIPT_RESERVED', {})
    })
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('RECEIPT_FLUSH_14464'),
      f.journal.commitObservedDiscardWindow(receiptHold, receiptTicket),
    )
    runtime.assertActive()
    const sealed = await runtime.keep(
      runtime.begin('RECEIPT_SEAL_14555'),
      f.journal.seal(receiptHold, outcomeDigest('sealed')),
    )
    runtime.assertActive()
    receiptHold.complete(() => {
      runtime.assertActive()
    })
    runtime.assertActive()
    const sealedRows = await runtime.keep(
      runtime.begin('LEDGER_READ_14668'),
      f.client.$transaction(tx => {
        runtime.assertActive()
        return readProviderSourceLedgerRecords(tx, 'source')
      }),
    )
    runtime.assertActive()
    const locked = { ...sealed, commitFenceVersion: 1 }
    runtime.assertActive()
    f.journal.verifyLocked(locked, sealedRows)
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.verifyLocked({ ...locked, sourceIncarnation: 'foreign' }, sealedRows)
    })
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.verifyLocked({ ...locked, pendingBatchId: 'foreign' }, sealedRows)
    })
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return f.journal.verifyLocked(
        locked,
        sealedRows.map((row, index) => {
          runtime.assertActive()
          return index === 2 ? { ...row, dataJson: '{"utf8":"other"}' } : row
        }),
      )
    })
    runtime.assertActive()
    f.journal.dispose()
    runtime.assertActive()
    const closedResult = await runtime.keep(
      runtime.begin('CLEANUP_HELPER_15269', 'auxiliary'),
      cleanup(f, undefined, runtime),
    )
    runtime.assertActive()
    return {
      closed: closedResult,
      originalTicketOnly: true,
      actualUtf8Ledger: rows[2].dataJson,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function ledgerBounds(directory: string, runtime: Runtime, trace: Instrumentation, selected: string) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('FACTORY_HELPER_15493', 'auxiliary'), factory(directory, runtime))
    runtime.assertActive()
    const before = trace.counts().rowReads
    runtime.assertActive()
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_15565', 'auxiliary'),
      assert.rejects(
        runtime.keep(
          runtime.begin('EXPECTED_ORIGINAL_15589'),
          f.client.$transaction(tx => {
            runtime.assertActive()
            return readProviderSourceLedgerRecords(tx, 'corrupt')
          }),
        ),
      ),
    )
    runtime.assertActive()
    assert.equal(
      trace.counts().rowReads - before,
      selected === 'ledger-type' ? 1 : 0,
      'Count/UTF8 bound must refuse BEFORE full variable payload SELECT',
    )
    runtime.assertActive()
    const closedResult = await runtime.keep(
      runtime.begin('CLEANUP_HELPER_15919', 'auxiliary'),
      cleanup(f, undefined, runtime),
    )
    runtime.assertActive()
    return {
      boundedFullRowSelects: trace.counts().rowReads - before,
      closed: closedResult,
      fixture: 'EXPLICIT_PREOWNER_CORRUPT_LEDGER',
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function foreignClient(directory: string, runtime: Runtime, trace: Instrumentation) {
  try {
    runtime.assertActive()
    const foreign = await runtime.keep(
      runtime.begin('FACTORY_HELPER_16122', 'auxiliary'),
      factory(directory, runtime, 'warmup'),
    )
    runtime.assertActive()
    await runtime.keep(runtime.begin('CLEANUP_HELPER_16166', 'auxiliary'), cleanup(foreign, undefined, runtime))
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_16223', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    const before = trace.counts()
    runtime.assertActive()
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_16292', 'auxiliary'),
      assert.rejects(
        runtime.keep(
          runtime.begin('EXPECTED_ORIGINAL_16316'),
          beginOriginalSqliteDiscardSend(f.permit, foreign.client),
        ),
        /source_database_binding/,
      ),
    )
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_16400', 'auxiliary'),
      assert.rejects(
        runtime.keep(
          runtime.begin('EXPECTED_ORIGINAL_16424'),
          beginOriginalSqliteDiscardSend(f.permit, {} as PrismaClient),
        ),
        /source_database_binding/,
      ),
    )
    runtime.assertActive()
    assert.deepEqual(trace.counts(), before)
    runtime.assertActive()
    assert.equal(f.source.snapshot().held, false)
    runtime.assertActive()
    const closedResult = await runtime.keep(
      runtime.begin('CLEANUP_HELPER_16659', 'auxiliary'),
      cleanup(f, f.source, runtime),
    )
    runtime.assertActive()
    return {
      foreignClientRefusedBeforeSql: true,
      closed: closedResult,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function adoptionRefusal(directory: string, runtime: Runtime) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(
      runtime.begin('JOURNAL_FIXTURE_16781', 'auxiliary'),
      journalFixture(directory, runtime),
    )
    runtime.assertActive()
    const adopted = new OutcomeSourceSqliteJournal({
      ...options(f.database),
      identity: {
        ...options(f.database).identity,
        transportId: 'journal-transport',
        transportIncarnation: 'journal-incarnation',
        threadId: null,
        turnId: null,
      },
      protocolDigest: sqliteOutcomeSourceProtocolDigest,
      qualificationDigest: outcomeDigest('unqualified'),
    })
    runtime.assertActive()
    const hold = acquireProviderSourceDatabaseHold(f.database, 'INITIALIZE')

    runtime.retain('refusedAdoptionJournal', adopted)

    runtime.retain('refusedAdoptionHold', hold)
    runtime.assertActive()
    const actual = runtime.keep(runtime.begin('DUPLICATE_ORIGINAL_NAMESPACE_INITIALIZE'), adopted.initialize(hold))
    runtime.assertActive()
    let rejected = false
    runtime.assertActive()
    try {
      runtime.assertActive()
      await runtime.keep(runtime.begin('FIXTURE_AWAIT_17514'), actual)
      runtime.assertActive()
    } catch (error) {
      runtime.assertActive()
      hold.retire(actual)
      runtime.retain('actualAdoptionError', error)
      rejected = true
    }
    runtime.assertActive()
    assert(rejected)
    runtime.assertActive()
    assert.equal(adopted.snapshot().sequence, 0)
    runtime.assertActive()
    assert.equal(f.journal.snapshot().sequence, 1)
    runtime.assertActive()
    assert.equal(providerSourceDatabaseSnapshot(f.database).retired, true)
    runtime.assertActive()
    runtime.keep(runtime.begin('ADOPTION_REFUSAL_CLEANUP'), disposeProviderSourceDatabase(f.database))
    runtime.assertActive()
    return {
      retained: true,
      expected: 'DUPLICATE_NAMESPACE_REFUSED_NO_ADOPTION',
      originalLocalSequence: 1,
      refusedLocalSequence: 0,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function finalizerBeforeThrow(directory: string, runtime: Runtime, trace: Instrumentation, asynchronous = false) {
  try {
    runtime.assertActive()
    const descriptor = Object.getOwnPropertyDescriptor(PrismaClient.prototype, '$disconnect')!
    runtime.assertActive()
    assert.equal(typeof descriptor.value, 'function')
    runtime.assertActive()
    const target: {
      fixture?: Fixture
    } = {}
    runtime.assertActive()
    const finalizer = { calls: 0, atThrow: undefined as ReturnType<Source['snapshot']> | undefined }
    runtime.assertActive()
    const controlledError = new Error('CONTROLLED_SYNCHRONOUS_CLIENT_CLEANUP_THROW')
    runtime.assertActive()
    runtime.retain('controlledCleanupError', controlledError)
    runtime.assertActive()
    Object.defineProperty(PrismaClient.prototype, '$disconnect', {
      ...descriptor,
      value: function (...args: unknown[]) {
        return forwardSourceClientFinalizer(
          runtime,
          descriptor.value,
          this,
          args,
          target,
          finalizer,
          asynchronous,
          controlledError,
        )
      },
    })
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_19631', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    target.fixture = f
    runtime.assertActive()
    const sent = await runtime.keep(runtime.begin('SEND_HELPER_19707', 'auxiliary'), send(f, runtime, trace))
    runtime.assertActive()
    const before = f.source.snapshot()
    runtime.assertActive()
    f.source.dispose()
    runtime.assertActive()
    const closing = runtime.keep(
      runtime.begin('QUEUED_CLEANUP_WHILE_SEND_HELD'),
      disposeProviderSourceDatabase(f.database),
    )
    runtime.assertActive()
    assert.equal(finalizer.calls, 0)
    runtime.assertActive()
    assert.equal(f.source.snapshot().disposed, false)
    runtime.assertActive()
    assert.deepEqual(f.source.snapshot().diagnostics, before.diagnostics)
    runtime.assertActive()
    await runtime.keep(runtime.begin('FLUSH_AND_SOURCE_FINALIZER'), sent.operation.completeFulfilled())
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_20139', 'auxiliary'),
      assert.rejects(closing, error => {
        runtime.assertActive()
        return error === controlledError
      }),
    )
    runtime.assertActive()
    assert.equal(finalizer.calls, 1)
    runtime.assertActive()
    assert(finalizer.atThrow)
    runtime.assertActive()
    const after = f.source.snapshot()
    assertSourceFinalizerHandoff(runtime, after)
    assert.equal(after.diagnostics.source.keyZeroCalls, before.diagnostics.source.keyZeroCalls + 1)
    runtime.assertActive()
    assert.equal(after.diagnostics.source.journalDisposeCalls, before.diagnostics.source.journalDisposeCalls + 1)
    runtime.assertActive()
    const database = providerSourceDatabaseSnapshot(f.database)
    runtime.assertActive()
    assert.equal(database.retired, true)
    runtime.assertActive()
    assert.equal(database.canonical.layers.client, 'REJECTED')
    runtime.assertActive()
    assert.equal(database.canonical.stopCalls, asynchronous ? 1 : 0)
    runtime.assertActive()
    return {
      retained: true,
      expected: asynchronous
        ? 'CONTROLLED_JS_OUTER_REJECTION_AFTER_ACTUAL_CLIENT_CLEANUP'
        : 'CONTROLLED_JS_CLEANUP_THROW_AFTER_REAL_FLUSH_FULFILLMENT',
      before,
      atThrow: finalizer.atThrow,
      after,
      database,
      retiredReconciliationComplement: 'EXISTING_GENUINE_SERVICE_FIXTURE_REQUIRED',
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function finalizerHelperThrow(directory: string, runtime: Runtime, trace: Instrumentation) {
  try {
    runtime.assertActive()
    const prototype = OutcomeSourceSqliteJournal.prototype
    runtime.assertActive()
    const initialize = Object.getOwnPropertyDescriptor(prototype, 'initialize')!
    runtime.assertActive()
    const dispose = Object.getOwnPropertyDescriptor(prototype, 'dispose')!
    runtime.assertActive()
    const target: {
      journal?: OutcomeSourceSqliteJournal
    } = {}
    runtime.assertActive()
    const controlledError = new Error('CONTROLLED_TRUSTED_JOURNAL_DISPOSE_HELPER_THROW')
    runtime.assertActive()
    let calls = 0
    runtime.assertActive()
    Object.defineProperty(prototype, 'initialize', {
      ...initialize,
      value: function (this: OutcomeSourceSqliteJournal, ...args: unknown[]) {
        const passive = runtime.observation,
          origin = passive.origin()
        const actual = Reflect.apply(initialize.value, this, args)
        passive.capture(actual, origin, 'journal-initialize')
        if (!runtime.failed) {
          try {
            assert(!target.journal, 'Exactly original product-created journal')
            target.journal = this
          } catch (error) {
            passive.fail(error)
          }
        }
        return actual
      },
    })
    runtime.assertActive()
    Object.defineProperty(prototype, 'dispose', {
      ...dispose,
      value: function (this: OutcomeSourceSqliteJournal, ...args: unknown[]) {
        const passive = runtime.observation,
          origin = passive.origin()
        if (passive.eligible()) {
          try {
            assert.equal(this, target.journal)
            assert.equal(args.length, 0)
            calls++
          } catch (error) {
            passive.fail(error)
          }
          if (passive.eligible()) {
            passive.capture(controlledError, origin, 'helper-fault')
            throw controlledError
          }
        }
        const actual = Reflect.apply(dispose.value, this, args)
        passive.capture(actual, origin, 'journal-dispose-transparent')
        return actual
      },
    })
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('SOURCE_FIXTURE_22396', 'auxiliary'), sourceFixture(directory, runtime))
    runtime.assertActive()
    const sent = await runtime.keep(runtime.begin('SEND_HELPER_22448', 'auxiliary'), send(f, runtime, trace))
    runtime.assertActive()
    runtime.assertActive()
    const before = f.source.snapshot()
    runtime.assertActive()
    f.source.dispose()
    runtime.assertActive()
    runtime.keep(runtime.begin('QUEUED_BEFORE_TRUSTED_HELPER_THROW'), disposeProviderSourceDatabase(f.database))
    runtime.assertActive()
    await runtime.keep(
      runtime.begin('EXPECTED_REJECTION_22632', 'auxiliary'),
      assert.rejects(
        runtime.keep(runtime.begin('FLUSH_THEN_TRUSTED_HELPER_THROW'), sent.operation.completeFulfilled()),
        error => {
          runtime.assertActive()
          return error === controlledError
        },
      ),
    )
    runtime.assertActive()
    assert.equal(calls, 1)
    runtime.assertActive()
    const after = f.source.snapshot(),
      database = providerSourceDatabaseSnapshot(f.database)
    assertSourceFinalizerHandoff(runtime, after)
    assert.equal(after.resources.keyNonzeroBytes, 0)
    runtime.assertActive()
    assert.equal(after.diagnostics.source.journalDisposeCalls, before.diagnostics.source.journalDisposeCalls)
    runtime.assertActive()
    assert.equal(after.diagnostics.source.journalOpen, true)
    runtime.assertActive()
    assert.deepEqual(
      after.diagnostics.custody,
      before.diagnostics.custody,
      'Remaining actual maps must survive partial finalizer failure',
    )
    runtime.assertActive()
    assert.equal(database.held, true)
    runtime.assertActive()
    assert.equal(database.retired, true)
    runtime.assertActive()
    for (const mint of [database.canonical, database.resolver]) {
      runtime.assertActive()
      assert.equal(mint.holds, 1)
      runtime.assertActive()
      assert.equal(mint.stopCalls, 0)
      runtime.assertActive()
      assert.equal(mint.nativeCalls, 0)
      runtime.assertActive()
      assert.equal(mint.layers.client, 'QUEUED')
      runtime.assertActive()
    }
    runtime.assertActive()
    f.source.dispose() // Already-disposed source must not retry the failed trusted helper or pump cleanup.
    runtime.assertActive()
    assert.equal(calls, 1)
    runtime.assertActive()
    assert.deepEqual(providerSourceDatabaseSnapshot(f.database), database)
    runtime.assertActive()
    assertSourceFactoryRefusal(runtime, () =>
      createProviderSourcePrismaClient(`file:${path.join(directory, 'postcontrol.db')}`),
    )
    runtime.assertActive()
    return {
      retained: true,
      expected: 'TRUSTED_FINALIZER_HELPER_THROW_PARTIAL_RESOURCES_RETAINED_NO_RESTORATION',
      before,
      after,
      database,
      sourcePrivateOperationClosed: true,
      actualDatabaseOriginalHoldStillHeld: true,
      helperCalls: calls,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
async function storage(directory: string, runtime: Runtime) {
  try {
    runtime.assertActive()
    const f = await runtime.keep(runtime.begin('FACTORY_HELPER_24357', 'auxiliary'), factory(directory, runtime))
    runtime.assertActive()
    assert.equal(providerSourceDatabaseFor(f.client), f.database)
    runtime.assertActive()
    assert.throws(() => {
      runtime.assertActive()
      return assertProviderSourceDatabaseClient(f.database, {} as PrismaClient)
    }, /source_database_binding/)
    runtime.assertActive()
    const rows = await runtime.keep(
      runtime.begin('SETTINGS_QUERY_24587'),
      f.client.$queryRawUnsafe<
        Array<{
          foreignKeys: bigint
          synchronous: bigint
          timeout: bigint
          mode: string
        }>
      >(
        'SELECT f.foreign_keys AS foreignKeys,s.synchronous AS synchronous,b.timeout,j.journal_mode AS mode FROM pragma_foreign_keys f CROSS JOIN pragma_synchronous s CROSS JOIN pragma_busy_timeout b CROSS JOIN pragma_journal_mode j',
      ),
    )
    runtime.assertActive()
    assert.equal(rows.length, 1)
    runtime.assertActive()
    assert.deepEqual(
      [Number(rows[0].foreignKeys), Number(rows[0].synchronous), Number(rows[0].timeout), rows[0].mode],
      [1, 2, 0, 'delete'],
    )
    runtime.assertActive()
    const closedResult = await runtime.keep(
      runtime.begin('CLEANUP_HELPER_25148', 'auxiliary'),
      cleanup(f, undefined, runtime),
    )
    runtime.assertActive()
    return {
      closed: closedResult,
      fullCanonicalMigrations: 93,
    }
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
const cases = {
  storage,
  'source-happy': sourceHappy,
  'journal-binding': journalBinding,
  'foreign-client': foreignClient,
  'source-finalizer-throw': (d: string, r: Runtime, t: Instrumentation) => finalizerBeforeThrow(d, r, t),
  'source-finalizer-async-rejection': (d: string, r: Runtime, t: Instrumentation) =>
    finalizerBeforeThrow(d, r, t, true),
  'source-finalizer-helper-throw': finalizerHelperThrow,
  'namespace-adoption': adoptionRefusal,
  'late-observer': (d: string, r: Runtime, t: Instrumentation) => originalCaptureRefusal(d, r, t, false),
  'allocation-overflow': (d: string, r: Runtime, t: Instrumentation) => originalCaptureRefusal(d, r, t, true),
  'reserve-rejection': (d: string, r: Runtime, t: Instrumentation) => sourceRejection(d, r, t, true),
  'flush-rejection': (d: string, r: Runtime, t: Instrumentation) => sourceRejection(d, r, t, false),
  'ledger-count': (d: string, r: Runtime, t: Instrumentation) => ledgerBounds(d, r, t, 'ledger-count'),
  'ledger-utf8': (d: string, r: Runtime, t: Instrumentation) => ledgerBounds(d, r, t, 'ledger-utf8'),
  'ledger-null-utf8': (d: string, r: Runtime, t: Instrumentation) => ledgerBounds(d, r, t, 'ledger-null-utf8'),
  'ledger-type': (d: string, r: Runtime, t: Instrumentation) => ledgerBounds(d, r, t, 'ledger-type'),
}
export async function runSourceCase(selected: string, directory: string, runtime: Runtime) {
  try {
    runtime.assertActive()
    assert(Object.hasOwn(cases, selected), 'Unknown source regression case')
    runtime.assertActive()
    const trace = instrumentSourcePersistence(runtime)
    runtime.assertActive()
    const result = await runtime.keep(
      runtime.begin('FIXTURE_AWAIT_26759', 'auxiliary'),
      cases[selected as keyof typeof cases](directory, runtime, trace),
    )
    return completeSourceCaseResult(runtime, selected, result, trace)
  } catch (fixtureError) {
    runtime.assertActive()
    throw fixtureError
  }
}
export { PrismaClient, createProviderSourcePrismaClient, disposeProviderSourceDatabase, providerSourceDatabaseSnapshot }

// Separate fixed fault driver: no normal registry/default, send, permit, transport or post-failure cleanup.
export async function runSourceIpcFaultCase(
  directory: string,
  runtime: Runtime,
  fault: ReturnType<typeof createSourceIpcFault>,
) {
  runtime.assertActive()
  assert.equal(fault.selector, 'ipc-reserve-controlled')
  const trace = instrumentSourcePersistence(runtime, fault)
  const f = await runtime.keep(runtime.begin('IPC_JOURNAL_FIXTURE', 'auxiliary'), journalFixture(directory, runtime))
  runtime.assertActive()
  runtime.retain('ipcFaultFixture', f)
  const hold = acquireProviderSourceDatabaseHold(f.database, 'SEND')
  runtime.retain('ipcFaultSendHold', hold)
  fault.window(providerSourceDatabaseSnapshot(f.database))
  const admission = runtime.begin('IPC_RESERVE_CONTROLLED')
  fault.arm(admission)
  trace.rejectNextOuter(admission.phase)
  const original = f.journal.reserveDiscardWindow(hold, outcomeDigest('original'))
  runtime.keep(admission, original)
  fault.rootReturned(original)
  fault.waiter()
  await fault.gate // Await reaction is installed while ACTIVE, before the asynchronous product callback hook.
  fault.entered()
  runtime.assertActive()
  throw new Error('Fault fixture must stop at its first post-gate guard')
}
