import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNativeQualificationDiagnostics, requireNativeDiagnostic } from './native-qualification-diagnostics'

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
