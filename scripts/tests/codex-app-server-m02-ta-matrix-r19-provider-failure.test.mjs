import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createProviderFailureRecorder,
  FAILURE_CLASSES,
  FAILURE_STAGES,
} from './fixtures/codex-app-server-m02-ta-matrix-r19/provider-failure.mjs'

function fixture(caseId = 'B01') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-r19-provider-failure-'))
  const supervisor = path.join(root, 'cases', caseId, 'supervisor')
  for (const directory of [path.join(root, 'cases'), path.join(root, 'cases', caseId), supervisor])
    fs.mkdirSync(directory, { mode: 0o700 })
  const state = {
    activeCase: caseId,
    current: caseId,
    fenced: false,
    counts: { providerRequests: 0 },
    ids: [],
    pending: [],
  }
  const journal = { snapshot: () => structuredClone(state) }
  const file = path.join(supervisor, 'provider-failure.json')
  const reserve = (index, status = 'pending') => {
    const id = `${caseId}-listener-request-${index}`
    state.counts.providerRequests = index
    state.ids.push(id)
    if (status === 'pending') state.pending.push({ id, kind: 'providerRequests', caseId })
  }
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true })
  return { root, supervisor, state, journal, file, reserve, cleanup, caseId }
}

function read(file) {
  const stat = fs.lstatSync(file)
  assert.equal(stat.mode & 0o777, 0o600)
  assert.equal(stat.uid, process.getuid())
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

test('pre-reservation P00 records null without making a reservation, including after fence', () => {
  const f = fixture('P00')
  try {
    const recorder = createProviderFailureRecorder(f)
    const context = recorder.beginPreReservation()
    recorder.mark(context, 'LISTENER_ROUTE_HEADER')
    f.state.fenced = true
    recorder.record(context, 'TRUSTED_BOUNDARY_FAILURE')
    assert.deepEqual(read(f.file), {
      schema: 'appraise.m02-ta-matrix-r19-provider-failure/v1',
      caseId: 'P00',
      requestIndex: null,
      requestState: 'PRE_RESERVATION',
      stage: 'LISTENER_ROUTE_HEADER',
      failureClass: 'TRUSTED_BOUNDARY_FAILURE',
      evidenceClass: 'TRUSTED_SUPERVISOR_SANITIZED_FAILURE',
      authority: 'DIAGNOSTIC_ONLY_NO_EFFECT_AUTHORITY',
    })
    assert.equal(f.state.counts.providerRequests, 0)
    assert.deepEqual(f.state.ids, [])
    assert.throws(() => recorder.record(context, 'OTHER'), /already attempted|record contract/)
  } finally {
    f.cleanup()
  }
})

test('current pending and acknowledged reservations produce distinct receipt states', () => {
  for (const status of ['pending', 'acknowledged']) {
    const f = fixture()
    try {
      const recorder = createProviderFailureRecorder(f)
      const pre = recorder.beginPreReservation()
      f.reserve(1, status)
      const context = recorder.bindRequest(pre, 1)
      recorder.mark(context, 'RESPONSE_RECEIPT_WRITE')
      f.state.fenced = true
      recorder.record(context, 'TRUSTED_IO_FAILURE')
      assert.equal(read(f.file).requestState, status === 'pending' ? 'RESERVED_PENDING' : 'RESERVED_ACKNOWLEDGED')
      assert.equal(f.state.pending.length, status === 'pending' ? 1 : 0)
      assert.equal(f.state.ids.length, 1)
    } finally {
      f.cleanup()
    }
  }
})

test('binding rejects absent, older, forged, and foreign request correlations', () => {
  const f = fixture()
  try {
    const recorder = createProviderFailureRecorder(f)
    const pre = recorder.beginPreReservation()
    assert.throws(() => recorder.bindRequest(pre, 1), /latest request mismatch/)
    f.reserve(1)
    assert.throws(() => recorder.bindRequest(pre, 2), /request index mismatch/)
    assert.throws(() => recorder.bindRequest(Object.freeze({}), 1), /foreign context/)
    f.state.pending[0].caseId = 'B02'
    assert.throws(() => recorder.bindRequest(pre, 1), /reservation state ambiguous/)
    f.state.pending[0].caseId = 'B01'
    const context = recorder.bindRequest(pre, 1)
    assert.throws(() => recorder.bindRequest(pre, 1), /already bound/)
    f.state.counts.providerRequests = 2
    assert.throws(() => recorder.record(context, 'OTHER'), /latest request changed/)
    assert.equal(fs.existsSync(f.file), false)
  } finally {
    f.cleanup()
  }
})

test('pre-reservation proof rejects a reservation made before the failing operation was recorded', () => {
  const f = fixture()
  try {
    const recorder = createProviderFailureRecorder(f)
    const pre = recorder.beginPreReservation()
    f.reserve(1)
    assert.throws(() => recorder.record(pre, 'OTHER'), /pre-reservation correlation changed/)
    assert.equal(fs.existsSync(f.file), false)
  } finally {
    f.cleanup()
  }
})

test('fixed enums reject arbitrary values and never evaluate secret-bearing error getters', () => {
  const f = fixture()
  try {
    const recorder = createProviderFailureRecorder(f)
    const pre = recorder.beginPreReservation()
    let reads = 0
    const secret = Object.defineProperty({}, 'message', {
      get: () => {
        reads++
        return 'secret-value'
      },
    })
    assert.throws(() => recorder.mark(pre, secret), /stage contract/)
    assert.throws(() => recorder.record(pre, secret), /record contract/)
    recorder.mark(pre, 'OTHER', secret)
    recorder.record(pre, 'OTHER', secret)
    assert.equal(read(f.file).failureClass, 'OTHER')
    assert.equal(fs.readFileSync(f.file, 'utf8').includes('secret-value'), false)
    assert.equal(reads, 0)
    assert.ok(FAILURE_STAGES.includes('HTTP_RESPONSE_VALIDATION_WRITE'))
    assert.ok(FAILURE_CLASSES.includes('OTHER'))
  } finally {
    f.cleanup()
  }
})

test('existing receipt, symlink, and replaced ancestor refuse exclusive writes', () => {
  for (const kind of ['existing', 'symlink', 'ancestor']) {
    const f = fixture()
    try {
      const recorder = createProviderFailureRecorder(f)
      const pre = recorder.beginPreReservation()
      if (kind === 'existing') fs.writeFileSync(f.file, 'prior', { mode: 0o600 })
      if (kind === 'symlink') fs.symlinkSync(path.join(f.root, 'other'), f.file)
      if (kind === 'ancestor') {
        fs.renameSync(f.supervisor, `${f.supervisor}-old`)
        fs.mkdirSync(f.supervisor, { mode: 0o700 })
      }
      assert.throws(() => recorder.record(pre, 'OTHER'))
      if (kind === 'existing') assert.equal(fs.readFileSync(f.file, 'utf8'), 'prior')
      if (kind === 'symlink') assert.equal(fs.lstatSync(f.file).isSymbolicLink(), true)
      if (kind === 'ancestor') assert.equal(fs.existsSync(f.file), false)
    } finally {
      f.cleanup()
    }
  }
})

test('missing supervisor directory and a receipt replaced during write fail closed', () => {
  const missing = fixture()
  try {
    fs.rmdirSync(missing.supervisor)
    assert.throws(() => createProviderFailureRecorder(missing), /ENOENT/)
  } finally {
    missing.cleanup()
  }

  const changed = fixture()
  try {
    const io = {
      ...fs,
      writeFileSync(fd, bytes) {
        fs.writeFileSync(fd, bytes)
        fs.unlinkSync(changed.file)
        fs.writeFileSync(changed.file, 'replacement', { mode: 0o600 })
      },
    }
    const recorder = createProviderFailureRecorder({ ...changed, io })
    const pre = recorder.beginPreReservation()
    assert.throws(() => recorder.record(pre, 'TRUSTED_IO_FAILURE'), /file replaced/)
    assert.equal(fs.readFileSync(changed.file, 'utf8'), 'replacement')
  } finally {
    changed.cleanup()
  }
})

test('foreign owner and write or fsync failures refuse a second diagnostic attempt', () => {
  for (const kind of ['owner', 'write', 'fsync']) {
    const f = fixture()
    try {
      const io = { ...fs }
      if (kind === 'owner') {
        io.lstatSync = file => {
          const stat = fs.lstatSync(file)
          if (file === f.supervisor) return Object.assign(Object.create(stat), { uid: process.getuid() + 1 })
          return stat
        }
        assert.throws(() => createProviderFailureRecorder({ ...f, io }), /ownership or mode/)
        continue
      }
      if (kind === 'write')
        io.writeFileSync = () => {
          throw new Error('simulated write failure')
        }
      if (kind === 'fsync')
        io.fsyncSync = () => {
          throw new Error('simulated fsync failure')
        }
      const recorder = createProviderFailureRecorder({ ...f, io })
      const pre = recorder.beginPreReservation()
      assert.throws(() => recorder.record(pre, 'TRUSTED_IO_FAILURE'), /simulated/)
      assert.throws(() => recorder.record(pre, 'TRUSTED_IO_FAILURE'), /record contract/)
    } finally {
      f.cleanup()
    }
  }
})
