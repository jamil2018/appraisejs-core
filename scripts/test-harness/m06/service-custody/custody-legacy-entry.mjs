import { serviceOwnerNonce, createServiceOwnerBootstrap } from './custody-owner-bootstrap'
import {
  sendFixtureTerminalHandoff,
  fixtureRetainedFailureReport,
  persistFixtureRetainedFailure,
  notifyFixtureRetainedFailure,
  disconnectFixtureRetainedOwner,
} from './custody-fixture-transport'
import {
  encodeFixtureTerminalCallbackReceipt,
  publishFixtureTerminalCallbackReceipt,
} from './custody-fixture-terminal-receipt'
import { assertFixtureDatabaseClosed } from './custody-fixture-cleanup'
// Fixed ordinary offline legacy owner. No native SQLite canonical opener or provider process.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  createProviderSourcePrismaClient,
  disposeProviderSourceDatabase,
} from '@/lib/quality-journey/provider-source-database'
import { legacyCases, runLegacyCase } from './custody-legacy-owner.mjs'
const [name, workspace] = process.argv.slice(2)
const databasePath = path.join(workspace, 'canonical.db')
const nonce = serviceOwnerNonce(process.argv)
/** @type {unknown[]} */
const retained = []
let completed = false
let failureReported = false
let sequence = 0
const {
  lifetime: keepalive,
  admission,
  terminal,
} = createServiceOwnerBootstrap(retained, reportUnexpectedFailure, name, nonce, sendTerminalHandoff, {
  validateFinish(type) {
    assertFixtureActive('terminal-finish-preconditions')
    if (type !== 'case-known-closed') throw new Error('Legacy owner cannot report expected retirement')
    if (!completed) throw new Error('Legacy terminal continuation incomplete')
    if (typeof process.disconnect !== 'function') throw new Error('Original disconnect unavailable')
  },
  prepareCommit(handoff) {
    const prepared = admission.keepActual(
      'terminal-encoded-callback-commit',
      encodeFixtureTerminalCallbackReceipt({
        case: name,
        pid: process.pid,
        nonce,
        ownerScript: process.argv[1],
        terminalType: 'case-known-closed',
        terminalSequence: Number(handoff.terminalSequence),
        handoffSequence: Number(handoff.sequence),
        expectedFixtureSha256: String(handoff.expectedFixtureSha256),
      }),
    )
    return () => publishFixtureTerminalCallbackReceipt(workspace, prepared.encoded)
  },
  finish() {
    process.disconnect()
    clearInterval(keepalive)
  },
})
const { assertActive: assertFixtureActive, admitActual, afterActual } = admission

/** @param {Record<string,unknown>} value @param {(handoff:Record<string,unknown>)=>void} delivered */
function sendTerminalHandoff(value, delivered) {
  sendFixtureTerminalHandoff(
    admission,
    process,
    () => path.join(workspace, 'owner-events.jsonl'),
    () => ++sequence,
    retain,
    value,
    delivered,
  )
}

/** @param {unknown} error @param {string} phase */
function reportUnexpectedFailure(error, phase) {
  rememberRetentionFailure(error)
  if (failureReported) return
  failureReported = true
  const value = {
    ...retainedFailureReport(error),
    classification: 'UNEXPECTED_FIXTURE_FAILURE',
    version: 1,
    phase,
    operationPhase: admission.currentPhase,
    referenceSummary: admission.referenceSummary(),
  }
  persistRetainedFailure(value)
  notifyRetainedFailure(value)
  disconnectRetainedOwner()
}
/** @param {string} phase */
function assertActive(phase) {
  assertFixtureActive(phase)
}
/** @param {string} type @param {Record<string,unknown>} [detail] @returns {Promise<void>} */
function event(type, detail = {}) {
  assertActive('report:' + type)
  const value = admission.keepActual('normal-report-object', {
    sequence: ++sequence,
    type,
    case: name,
    pid: process.pid,
    nonce,
    ...detail,
  })
  let reporting
  try {
    const encoded = JSON.stringify(value)
    assert.ok(Buffer.byteLength(encoded) <= 128 * 1024)
    appendFileSync(path.join(workspace, 'owner-events.jsonl'), encoded + '\n')
    if (type === 'case-known-closed') terminal.register(value)
    reporting = new Promise((resolve, reject) => {
      try {
        if (!process.connected || !process.send) throw new Error('Legacy report lost original supervisor IPC')
        const sent = process.send(value, error => {
          if (error) {
            retain(error)
            reject(error)
          } else {
            try {
              assertFixtureActive('normal-report-delivered:' + type)
              resolve(undefined)
            } catch (failure) {
              retain(failure)
              reject(failure)
            }
          }
        })
        admission.keepActual('normal-report-send-result', sent)
      } catch (error) {
        retain(error)
        reject(error)
      }
    })
  } catch (error) {
    retain(error)
    throw error
  }
  admission.keepActual('normal-report-promise', reporting)
  admission.keepActual('normal-report-observer', reporting.catch(retain))
  return reporting
}
/** @param {unknown} error */
function rememberRetentionFailure(error) {
  try {
    retained.push(error)
  } catch {}
}
/** @param {unknown} error */
function retainedFailureReport(error) {
  return fixtureRetainedFailureReport(
    { case: name, pid: process.pid, nonce },
    error,
    undefined,
    rememberRetentionFailure,
  )
}
/** @param {Record<string, unknown>} failure */
function persistRetainedFailure(failure) {
  persistFixtureRetainedFailure(
    workspace,
    () => path.join(workspace, 'owner-events.jsonl'),
    failure,
    rememberRetentionFailure,
  )
}
/** @param {Record<string, unknown>} failure */
function notifyRetainedFailure(failure) {
  notifyFixtureRetainedFailure(process, failure, rememberRetentionFailure)
}
function disconnectRetainedOwner() {
  disconnectFixtureRetainedOwner(process, rememberRetentionFailure)
}

/** @param {unknown} error */
function retain(error) {
  admission.fail(error)
}
process.on('error', retain)
process.on('uncaughtException', retain)
process.on('unhandledRejection', retain)
process.on('message', raw => {
  try {
    terminal.acknowledge(raw)
  } catch (error) {
    retain(error)
  }
})
process.on('disconnect', () => {
  if (!admission.expectedTerminalHandoff)
    admission.fail(new Error('Unexpected supervisor disconnect; owner retained'), 'supervisor-disconnect')
})
/** @type {Record<string,unknown>} */
let expected = {}
/** @type {string|undefined} */
let expectedFixtureSha256
/** @param {Record<string,unknown>} update */
function writeExpectation(update) {
  assertFixtureActive('custody-legacy-entry.mjs:114:1:entry')
  assertActive('expected-metadata')
  expected = { ...expected, ...update }
  const encoded =
    admitActual('custody-legacy-entry.mjs:117:19:operation', () => JSON.stringify(expected, null, 2)) + '\n'
  admitActual('custody-legacy-entry.mjs:118:3:operation', () =>
    assert.ok(admitActual('custody-legacy-entry.mjs:118:13:operation', () => Buffer.byteLength(encoded)) <= 128 * 1024),
  )
  admitActual('custody-legacy-entry.mjs:119:3:operation', () =>
    writeFileSync(
      admitActual('custody-legacy-entry.mjs:119:17:operation', () => path.join(workspace, 'expected-fixture.json')),
      encoded,
    ),
  )
  expectedFixtureSha256 = admitActual('custody-legacy-entry.mjs:120:27:operation', () =>
    admitActual('custody-legacy-entry.mjs:120:27:operation', () =>
      admitActual('custody-legacy-entry.mjs:120:27:operation', () => createHash('sha256')).update(encoded),
    ).digest('hex'),
  )
}
async function main() {
  assertFixtureActive('custody-legacy-entry.mjs:122:1:entry')
  admitActual('custody-legacy-entry.mjs:123:3:operation', () =>
    assert.ok(admitActual('custody-legacy-entry.mjs:123:13:operation', () => legacyCases.includes(name))),
  )
  admitActual('custody-legacy-entry.mjs:124:3:operation', () =>
    assert.ok(admitActual('custody-legacy-entry.mjs:124:13:operation', () => existsSync(workspace))),
  )
  admitActual('custody-legacy-entry.mjs:125:3:operation', () =>
    assert.equal(process.env.DATABASE_URL, `file:${databasePath}`),
  )
  assertActive('owner-start')
  afterActual(
    'custody-legacy-entry.mjs:127:3:await',
    await admitActual('custody-legacy-entry.mjs:127:3:await-operation', () =>
      admitActual('custody-legacy-entry.mjs:127:9:operation', () =>
        event('owner-start', { databasePath, profile: 'GENUINE_LEGACY_FS' }),
      ),
    ),
  )
  assertActive('migrations')
  admitActual('custody-legacy-entry.mjs:129:3:operation', () =>
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: admitActual('custody-legacy-entry.mjs:130:10:operation', () => process.cwd()),
      env: { PATH: process.env.PATH, DATABASE_URL: `file:${databasePath}` },
      stdio: 'pipe',
    }),
  )
  assertActive('factory-create')
  const { client, ready } = admitActual('custody-legacy-entry.mjs:135:29:operation', () =>
    createProviderSourcePrismaClient(`file:${databasePath}`),
  )
  retained.push(client, ready)
  const database = afterActual(
    'custody-legacy-entry.mjs:137:20:await',
    await admitActual('custody-legacy-entry.mjs:137:20:await-operation', () => ready),
  )
  retained.push(database)
  assertActive('factory-ready-continuation')
  const operation = admitActual('custody-legacy-entry.mjs:140:21:operation', () =>
    runLegacyCase({ name, workspace, nonce, client, retained, event, writeExpectation, assertActive, admission }),
  )
  retained.push(operation)
  afterActual(
    'custody-legacy-entry.mjs:142:3:await',
    await admitActual('custody-legacy-entry.mjs:142:3:await-operation', () => operation),
  )
  assertActive('binding-cleanup')
  const cleanup = admitActual('custody-legacy-entry.mjs:144:19:operation', () =>
    disposeProviderSourceDatabase(database),
  )
  retained.push(cleanup)
  afterActual(
    'custody-legacy-entry.mjs:146:3:await',
    await admitActual('custody-legacy-entry.mjs:146:3:await-operation', () => cleanup),
  )
  assertActive('binding-cleanup-continuation')
  const resources = admitActual('custody-legacy-entry.mjs:148:21:operation', () =>
    assertFixtureDatabaseClosed(database),
  )
  assertActive('known-closed-report')
  afterActual(
    'custody-legacy-entry.mjs:150:3:await',
    await admitActual('custody-legacy-entry.mjs:150:3:await-operation', () =>
      admitActual('custody-legacy-entry.mjs:150:9:operation', () =>
        event('case-known-closed', { databasePath, expectedFixtureSha256, resources, profile: 'GENUINE_LEGACY_FS' }),
      ),
    ),
  )
  assertActive('known-closed-completion')
  completed = true
  terminal.allowHandoff()
}
admitActual('workspace-directory', () => mkdirSync(workspace, { recursive: true }))
admission.keepActual('main-observer', admitActual('main', () => main()).catch(retain))
