import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { B1Transport, loadValidators } from '../b1/transport.mjs'
import { casePaths } from '../b1/runner.mts'
import {
  notificationDiagnosticEvent,
  loadNotificationMethods,
  notificationInputPaths,
  runNotificationDiagnosticProtocol,
  verifyNotificationManifest,
} from './runner.mts'

const schemaRoot = resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
  '.appraisejs/m13-runtime-evidence/native-introspection-20261114-01/schema/schemas',
)
const methods = loadNotificationMethods(schemaRoot)
const validate = loadValidators(schemaRoot)
const initialized = (codexHome: string) => ({
  codexHome,
  platformFamily: 'unix',
  platformOs: 'macos',
  userAgent: 'synthetic',
})
const config = {
  config: {
    model: 'gpt-6.1-sol',
    model_reasoning_effort: 'medium',
    approval_policy: 'never',
    sandbox_mode: 'read-only',
    analytics: { enabled: false },
    features: { hooks: false, remote_plugin: false },
  },
  origins: {},
}
function temporary(run: (root: string) => Promise<void> | void) {
  const root = mkdtempSync('/private/tmp/m13-d0-source-test-')
  const paths = casePaths(root, 'healthy')
  mkdirSync(paths.root)
  mkdirSync(paths.codexHome)
  return Promise.resolve()
    .then(() => run(root))
    .finally(() => rmSync(root, { recursive: true }))
}

test('diagnostic event retains only declared method/sequence/phase, dropping hashes and payloads', () => {
  assert.equal(methods.has('warning'), true)
  const retained = notificationDiagnosticEvent(
    {
      category: 'notification_method',
      method: 'warning',
      sequence: 1,
      phase: 'CONFIGURATION',
      hash: 'forbidden-hash',
      params: { email: 'private' },
      error: 'private-error',
    },
    methods,
  )
  assert.deepEqual(retained, {
    category: 'notification_method',
    method: 'warning',
    sequence: 1,
    phase: 'CONFIGURATION',
  })
  assert.equal(JSON.stringify(retained).includes('private'), false)
  assert.equal(Object.hasOwn(retained!, 'hash'), false)
})

test('unknown methods, malformed metadata and all hash-bearing event categories are dropped', () => {
  for (const event of [
    { category: 'native_notification', hash: 'forbidden' },
    { category: 'notification_method', method: 'guessed/alias', sequence: 1, phase: 'CONFIGURATION' },
    { category: 'notification_method', method: 'warning', sequence: 0, phase: 'CONFIGURATION' },
    { category: 'notification_method', method: 'warning', sequence: 1, phase: 'THREAD_START' },
  ])
    assert.equal(notificationDiagnosticEvent(event, methods), undefined)
})

test('input freeze covers shared public inputs, D0 runner and transitive diagnostic helper', () => {
  const paths = notificationInputPaths(schemaRoot)
  assert.equal(paths.length, 35)
  assert.equal(new Set(paths).size, 35)
  assert.ok(paths.some(path => path.endsWith('/m13-runtime/d0/runner.mts')))
  assert.ok(paths.some(path => path.endsWith('/m13-runtime/diagnostic-common.mts')))
  assert.equal(
    paths.some(path => path.endsWith('/auth.json')),
    false,
  )
})

test('manifest hash mismatch refuses before reservation or native launch', () =>
  temporary(root => {
    const path = join(root, 'manifest.json')
    writeFileSync(path, '{}')
    assert.throws(() => verifyNotificationManifest(path, '0'.repeat(64)), { category: 'manifest_hash_mismatch' })
  }))

test('strict shared codec observes public method before refusal and sends no config after coalesced init refusal', () =>
  temporary(async root => {
    const paths = casePaths(root, 'healthy')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const sent: { method: string }[] = []
    const retained: unknown[] = []
    stdin.on('data', chunk => sent.push(JSON.parse(chunk.toString())))
    const client = new B1Transport({
      stdin,
      stdout,
      stderr,
      validate,
      event: value => {
        const selected = notificationDiagnosticEvent(value, methods)
        if (selected) retained.push(selected)
      },
    })
    const pending = runNotificationDiagnosticProtocol(client, root)
    stdout.write(
      `${JSON.stringify({ id: 1, result: initialized(paths.codexHome) })}\n${JSON.stringify({ method: 'warning', params: { message: 'private warning text' } })}\n`,
    )
    await assert.rejects(pending, { category: 'notification_refused' })
    assert.deepEqual(
      sent.map(row => row.method),
      ['initialize'],
    )
    assert.deepEqual(retained, [
      { category: 'notification_method', method: 'warning', sequence: 1, phase: 'INITIALIZATION' },
    ])
    assert.equal(client.counts.configRead, 0)
    assert.equal(client.counts.threadStart, 0)
    assert.equal(client.counts.statusList, 0)
    stdout.end()
    stderr.end()
    await assert.rejects(client.waitForDrain(), { category: 'notification_refused' })
  }))

test('normal diagnostic sequence sends only initialize/initialized/config with no subsequent RPC', () =>
  temporary(async root => {
    const paths = casePaths(root, 'healthy')
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const sent: { method: string }[] = []
    stdin.on('data', chunk => {
      const request = JSON.parse(chunk.toString())
      sent.push(request)
      if (request.method === 'initialize')
        queueMicrotask(() =>
          stdout.write(`${JSON.stringify({ id: request.id, result: initialized(paths.codexHome) })}\n`),
        )
      if (request.method === 'config/read')
        queueMicrotask(() => stdout.write(`${JSON.stringify({ id: request.id, result: config })}\n`))
    })
    const client = new B1Transport({ stdin, stdout, stderr, validate })
    await runNotificationDiagnosticProtocol(client, root)
    assert.deepEqual(
      sent.map(row => row.method),
      ['initialize', 'initialized', 'config/read'],
    )
    assert.equal(client.counts.threadStart, 0)
    assert.equal(client.counts.statusList, 0)
    stdout.end()
    stderr.end()
    await client.waitForDrain()
  }))
