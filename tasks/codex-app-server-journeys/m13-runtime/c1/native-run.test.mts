import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs, { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { Writable } from 'node:stream'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describeNativeCredential } from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  createNativeRunInputBudget,
  createNativeRunEmitter,
  parseNativeRunCommand,
  readNativeRunPublic,
  runNativeQualificationParent,
} from './native-run.mts'
import { createAnonymousQualificationTarget } from './native-target.mts'

test('task entry import is inert and rejects implicit launch arguments', async () => {
  await assert.rejects(runNativeQualificationParent([]), /prepare-only/)
  assert.deepEqual(parseNativeRunCommand('{"op":"snapshot"}'), { op: 'snapshot' })
  for (const value of [
    { op: 'start-case' },
    { op: 'snapshot', start: true },
    { op: 'exec', command: 'anything' },
    { op: 'prepare-closure', choice: { decision: 'RISK_ACCEPTED' } },
  ])
    assert.throws(() => parseNativeRunCommand(JSON.stringify(value)))
  assert.throws(() => parseNativeRunCommand(' '.repeat(1_048_577)), /Bounded/)
})
test('public bootstrap is digest bound and credential aliases are refused before bytes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'm13-native-run-offline-'))
  try {
    const credential = path.join(root, 'synthetic-credential'),
      filename = path.join(root, 'public.json')
    writeFileSync(credential, 'OFFLINE_SYNTHETIC', { mode: 0o600 })
    writeFileSync(filename, '{"public":true}')
    const source = describeNativeCredential(credential),
      expected = nativeQualificationDigest('{"public":true}')
    assert.deepEqual(readNativeRunPublic(filename, expected, source), { public: true })
    assert.throws(() => readNativeRunPublic(filename, `sha256:${'0'.repeat(64)}`, source), /drift/)
    const alias = path.join(root, 'alias')
    symlinkSync(credential, alias)
    assert.throws(() => readNativeRunPublic(alias, expected, source), /topology/)
    writeFileSync(filename, ' '.repeat(1_048_577))
    assert.throws(() => readNativeRunPublic(filename, expected, source), /topology refused/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
test('stdin cannot retain an unbounded line, batch or pending command queue', () => {
  const input = createNativeRunInputBudget()
  assert.deepEqual(input.append(Buffer.from('{"op":')), [])
  assert.deepEqual(input.append(Buffer.from('"snapshot"}\n')), ['{"op":"snapshot"}'])
  for (let n = 0; n < 8; n++) input.reserve()
  assert.throws(() => input.reserve(), /pending command limit/)
  input.settled()
  input.reserve()
  assert.throws(() => input.append(Buffer.alloc(1_048_577)), /buffer limit/)
  const batch = createNativeRunInputBudget()
  assert.throws(() => batch.append(Buffer.from('{"op":"snapshot"}\n'.repeat(9))), /batch limit/)
})
test('output owner awaits the original write callback under backpressure', async () => {
  let originalCallback!: (error?: Error | null) => void
  const original = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, callback) {
      originalCallback = callback
    },
  })
  const emit = createNativeRunEmitter(original)
  let settled = false
  const write = emit('snapshot', { phase: 'OFFLINE_SYNTHETIC' }).then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)
  originalCallback()
  await write
  assert.equal(settled, true)
  original.destroy()
})
test('blocked original output is destroyed at its finite deadline and cannot manufacture completion', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const original = new Writable({ write() {} })
  try {
    const write = createNativeRunEmitter(original, 5)('snapshot', { phase: 'OFFLINE_SYNTHETIC' })
    const rejected = assert.rejects(write, /output deadline exceeded/)
    context.mock.timers.tick(5)
    await rejected
    assert.equal(original.destroyed, true)
  } finally {
    original.destroy()
    context.mock.timers.reset()
  }
})
test('descriptor check refuses a selected path replaced by credential hardlink before the open', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'm13-native-fd-offline-'))
  const originalOpen = fs.openSync
  let reads = 0
  try {
    const credential = path.join(root, 'synthetic-credential'),
      filename = path.join(root, 'public.json')
    writeFileSync(credential, 'OFFLINE_SYNTHETIC', { mode: 0o600 })
    writeFileSync(filename, '{}')
    const source = describeNativeCredential(credential)
    context.mock.method(fs, 'openSync', ((selected: string, flags: number) => {
      if (selected === filename) {
        fs.unlinkSync(filename)
        fs.linkSync(credential, filename)
      }
      return originalOpen(selected, flags)
    }) as typeof fs.openSync)
    context.mock.method(fs, 'readSync', () => {
      reads++
      throw new Error('Credential bytes must never be opened for reading')
    })
    syncBuiltinESMExports()
    assert.throws(() => readNativeRunPublic(filename, nativeQualificationDigest('{}'), source), /topology refused/)
    assert.equal(reads, 0)
  } finally {
    context.mock.restoreAll()
    syncBuiltinESMExports()
    rmSync(root, { recursive: true, force: true })
  }
})

test('anonymous target remains inert behind exact review and cannot reopen after original close', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'm13-native-target-offline-'))
  try {
    const credential = path.join(root, 'synthetic-credential')
    writeFileSync(credential, 'OFFLINE_SYNTHETIC', { mode: 0o600 })
    const options = {
      baseUrl: 'http://127.0.0.1:44081/checkout',
      requestLimit: 64,
      lifetimeMs: 100,
      source: describeNativeCredential(credential),
      onExpired() {
        assert.fail('No listener or timer is authorized')
      },
    }
    for (const baseUrl of [
      'https://example.com/checkout',
      'http://localhost:44081/checkout',
      'http://127.0.0.1:44081/checkout?x=1',
    ])
      assert.throws(() => createAnonymousQualificationTarget({ ...options, baseUrl }), /refused/)
    const target = createAnonymousQualificationTarget(options)
    assert.equal(target.snapshot().startEntered, false)
    const alias = path.join(root, 'alias')
    symlinkSync(credential, alias)
    await assert.rejects(
      target.startVerified({
        decisionPath: alias,
        decisionDigest: `sha256:${'0'.repeat(64)}`,
        actualReviewPath: alias,
      }),
      /control refused/,
    )
    assert.equal(target.snapshot().requests, 0)
    const second = createAnonymousQualificationTarget(options)
    const stop = second.closeOriginal()
    assert.equal(stop, second.closeOriginal())
    await stop
    await assert.rejects(
      second.startVerified({
        decisionPath: alias,
        decisionDigest: `sha256:${'0'.repeat(64)}`,
        actualReviewPath: alias,
      }),
      /One original/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
