import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createNativeQualificationDiagnostics,
  requireNativeDiagnostic,
  nativePassiveProtocolStage,
  nativePassiveOutcomeStage,
} from './native-qualification-diagnostics'

const io = vi.hoisted(() => ({ failure: '' as '' | 'write' | 'flush' | 'short' | 'close', closes: 0 }))
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    writeSync: (...args: Parameters<typeof fs.writeSync>) => {
      if (io.failure === 'write') throw new Error('hostile token /private/fake 123 provider content')
      if (io.failure === 'short') return 0
      return (fs.writeSync as (...values: Parameters<typeof fs.writeSync>) => number)(...args)
    },
    fsyncSync: (fd: number) => {
      if (io.failure === 'flush') throw new Error('hostile token /private/fake 123 provider content')
      return fs.fsyncSync(fd)
    },
    closeSync: (fd: number) => {
      io.closes++
      fs.closeSync(fd)
      if (io.failure === 'close') throw new Error('hostile close content')
    },
  }
})
const roots: string[] = []
afterEach(() => {
  io.failure = ''
  io.closes = 0
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'appraise-native-diagnostics-'))
  roots.push(root)
  const trace = createNativeQualificationDiagnostics(root, path.join(root, 'native'))
  const filename = path.join(root, 'c1-acquisition-diagnostics.jsonl')
  return {
    root,
    trace,
    filename,
    rows: () =>
      readFileSync(filename, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line)),
  }
}
describe('closed non-authoritative native diagnostics', () => {
  it('projects exactly five allowlisted fields with finite combinations and no producer content', () => {
    const f = fixture()
    expect(f.trace.observer.record('ACQUISITION', 'ENTERED')).toBe(true)
    expect(f.trace.observer.record('ACQUISITION', 'SETTLED')).toBe(true)
    f.trace.close()
    for (const [index, row] of f.rows().entries()) {
      expect(Object.keys(row)).toEqual(['version', 'sequence', 'stage', 'status', 'reason'])
      expect(row.sequence).toBe(index + 1)
      expect(row.version).toBe('M13_C1_DIAGNOSTIC_V1')
      expect(['ACQUISITION', 'CASE_CLOSE']).toContain(row.stage)
    }
    expect(statSync(f.filename).mode & 0o777).toBe(0o600)
    const invalid = [
      ['CONFIG_VALIDATE', 'SETTLED', 'NONE'],
      ['TURN_REQUEST', 'REFUSED', 'VALIDATION_REFUSED'],
      ['THREAD_REQUEST', 'TIMED_OUT', 'ACQUISITION_DEADLINE'],
      ['CASE_CLOSE', 'ENTERED', 'NONE'],
      ['CLEANUP', 'ACCEPTED', 'NONE'],
      ['unknown', 'ENTERED', 'NONE'],
    ]
    for (const [stage, status, reason] of invalid) {
      const next = fixture()
      expect(next.trace.observer.record(stage as never, status as never, reason as never)).toBe(false)
      next.trace.close()
    }
    for (const status of ['raw exception', 'CLOSED', 'SETTLED']) {
      const next = fixture()
      expect(next.trace.observer.record('CONFIG_VALIDATE', status as never, 'token path pid' as never)).toBe(false)
      next.trace.close()
    }
  })
  it('reserves closure rows under overflow and stays within both hard bounds', () => {
    const f = fixture(),
      fence = vi.fn()
    f.trace.observer.onFailure(fence)
    for (let index = 0; index < 126; index++) expect(f.trace.observer.record('ACQUISITION', 'ENTERED')).toBe(true)
    expect(f.trace.observer.record('ACQUISITION', 'ENTERED')).toBe(false)
    expect(f.trace.observer.failed()).toBe(true)
    expect(fence).toHaveBeenCalledOnce()
    expect(() => requireNativeDiagnostic(f.trace.observer, 'TURN_REQUEST')).toThrow(/diagnostic unavailable UNKNOWN/)
    f.trace.close()
    f.trace.close()
    expect(f.rows()).toHaveLength(128)
    expect(f.rows().slice(-2)).toMatchObject([
      { stage: 'CASE_FAILURE', reason: 'DIAGNOSTIC_UNAVAILABLE' },
      { stage: 'CASE_CLOSE', status: 'UNKNOWN' },
    ])
    expect(statSync(f.filename).size).toBeLessThanOrEqual(32768)
    expect(f.rows().every(row => Buffer.byteLength(JSON.stringify(row) + '\n') <= 256)).toBe(true)
    expect(io.closes).toBe(1)
  })
  it.each(['write', 'flush', 'short', 'close'] as const)(
    'fences once on %s failure and never serializes raw errors',
    failure => {
      const f = fixture(),
        fence = vi.fn()
      f.trace.observer.onFailure(fence)
      f.trace.observer.record('CASE_START', 'ENTERED')
      io.failure = failure
      if (failure === 'close') f.trace.close()
      else expect(f.trace.observer.record('ACQUISITION', 'ENTERED')).toBe(false)
      expect(f.trace.observer.failed()).toBe(true)
      expect(fence).toHaveBeenCalledOnce()
      expect(f.trace.observer.record('TURN_REQUEST', 'ENTERED')).toBe(false)
      io.failure = ''
      f.trace.close()
      expect(readFileSync(f.filename, 'utf8')).not.toMatch(/hostile|token|private|provider content/)
      expect(io.closes).toBe(1)
    },
  )
  it('refuses reuse, symlinks, identity replacement and a trace under the private root', () => {
    const f = fixture()
    expect(() => createNativeQualificationDiagnostics(f.root, path.join(f.root, 'native'))).toThrow()
    expect(() => createNativeQualificationDiagnostics(f.root, f.root)).toThrow(/directory refused/)
    const old = readFileSync(f.filename)
    rmSync(f.filename)
    writeFileSync(f.filename, 'replacement')
    expect(f.trace.observer.record('CASE_START', 'ENTERED')).toBe(false)
    f.trace.close()
    expect(readFileSync(f.filename, 'utf8')).toBe('replacement')
    rmSync(f.filename)
    symlinkSync(path.join(f.root, 'absent'), f.filename)
    expect(() => createNativeQualificationDiagnostics(f.root, path.join(f.root, 'native'))).toThrow()
    expect(old.length).toBe(0)
  })
})

it('permits exactly the added passive stage/reason families and keeps the same closed five-field rows', () => {
  const f = fixture()
  const protocol = ['REPLY', 'FRAME', 'ACCOUNT_UPDATED', 'REMOTE_STATUS', 'MCP_STARTUP', 'OTHER']
  const common = [
    'OUTCOME_OBSERVER_REFUSED',
    'NOTIFICATION_AFTER_CLEANUP',
    'NOTIFICATION_AFTER_CANDIDATE',
    'NOTIFICATION_LIMIT_EXCEEDED',
    'SOURCE_NOTIFICATION_REFUSED',
  ]
  const scoped = ['THREAD_SCOPE_MISMATCH', 'TURN_SCOPE_MISMATCH']
  const pairs = protocol.map(suffix => [`PASSIVE_PROTOCOL_${suffix}`, 'PROTOCOL_REFUSED'])
  pairs.push(['PASSIVE_STREAM', 'STREAM_PARSE_OR_IO_REFUSED'], ['PASSIVE_PRECLAIM', 'PRECLAIM_CAPTURE_LIMIT'])
  for (const [suffix, reasons] of [
    ['ACCOUNT_UPDATED', [...common, ...scoped, 'UNCLASSIFIED_NOTIFICATION']],
    [
      'REMOTE_STATUS',
      [...common, 'REMOTE_STATUS_NOT_DISABLED', 'REMOTE_ENVIRONMENT_PRESENT', 'REMOTE_STATUS_LIMIT_EXCEEDED'],
    ],
    ['MCP_STARTUP', [...common, ...scoped]],
    ['OTHER', [...common, ...scoped, 'UNCLASSIFIED_NOTIFICATION']],
  ] as const)
    for (const reason of reasons) pairs.push([`PASSIVE_OUTCOME_${suffix}`, reason])
  for (const [stage, reason] of pairs)
    expect(f.trace.observer.record(stage as never, 'REFUSED', reason as never)).toBe(true)
  f.trace.close()
  expect(f.rows()).toHaveLength(pairs.length + 1)
  for (const row of f.rows()) expect(Object.keys(row)).toEqual(['version', 'sequence', 'stage', 'status', 'reason'])
  for (const stage of new Set(pairs.map(([stage]) => stage))) {
    for (const [status, reason] of [
      ['ENTERED', 'NONE'],
      ['REFUSED', 'account/updated secret'],
      ['REFUSED', 'UNKNOWN_PREDICATE'],
    ]) {
      const invalid = fixture()
      expect(invalid.trace.observer.record(stage as never, status as never, reason as never)).toBe(false)
      invalid.trace.close()
    }
  }
  for (const [stage, reason] of [
    ['PASSIVE_OUTCOME_MCP_STARTUP', 'UNCLASSIFIED_NOTIFICATION'],
    ['PASSIVE_OUTCOME_OTHER', 'REMOTE_STATUS_NOT_DISABLED'],
    ['PASSIVE_PROTOCOL_REPLY', 'SOURCE_NOTIFICATION_REFUSED'],
  ]) {
    const invalid = fixture()
    expect(invalid.trace.observer.record(stage as never, 'REFUSED', reason as never)).toBe(false)
    invalid.trace.close()
  }
})
it('classifies only parsed frame shape and literal method classes without reading payload or error getters', () => {
  const reads = vi.fn(() => {
    throw new Error('fake token /private/path pid provider content')
  })
  const hostile = Object.create(null)
  for (const key of ['message', 'stack', 'cause', 'name', 'code', 'method', 'params'])
    Object.defineProperty(hostile, key, { enumerable: true, get: reads })
  expect(nativePassiveProtocolStage(hostile)).toBe('PASSIVE_PROTOCOL_FRAME')
  expect(nativePassiveProtocolStage(null)).toBe('PASSIVE_PROTOCOL_FRAME')
  expect(nativePassiveProtocolStage({ id: 1, error: hostile })).toBe('PASSIVE_PROTOCOL_REPLY')
  const f = fixture()
  for (const [method, suffix] of [
    ['account/updated', 'ACCOUNT_UPDATED'],
    ['remoteControl/status/changed', 'REMOTE_STATUS'],
    ['mcpServer/startupStatus/updated', 'MCP_STARTUP'],
    ['secret /private/provider pid', 'OTHER'],
  ]) {
    const frame = { method, params: { privatePayload: hostile } }
    const stage = nativePassiveProtocolStage(frame)
    expect(stage).toBe(`PASSIVE_PROTOCOL_${suffix}`)
    expect(nativePassiveOutcomeStage(method)).toBe(`PASSIVE_OUTCOME_${suffix}`)
    Reflect.apply(f.trace.observer.record, undefined, [stage, 'REFUSED', 'PROTOCOL_REFUSED', { extra: hostile }])
  }
  f.trace.close()
  expect(reads).not.toHaveBeenCalled()
  const bytes = readFileSync(f.filename, 'utf8')
  expect(bytes).not.toMatch(/secret|privatePayload|private\/|provider|extra|pid/)
})
