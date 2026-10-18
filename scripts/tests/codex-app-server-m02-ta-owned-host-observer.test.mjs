import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  createOwnedHostObserver,
  PINNED_CODE_MODE_HOST,
  verifyPinnedHostBinary,
} from './fixtures/codex-app-server-m02-ta-owned-host-observer/observer.mjs'

function fixture({
  children = [711],
  paths = {},
  maxPolls = 12,
  maxStopPolls = 2,
  stopEmitsExit = true,
  stopEmitsClose = true,
  stopThrows = false,
  onSpawn = () => {},
} = {}) {
  const child = new EventEmitter()
  child.pid = 700
  child.exitCode = null
  child.signalCode = null
  const parent = { pid: 700, ppid: process.pid, birthSec: 101, birthUsec: 1 }
  const hosts = new Map([
    [711, { pid: 711, ppid: 700, birthSec: 102, birthUsec: 2, path: PINNED_CODE_MODE_HOST.path }],
    [712, { pid: 712, ppid: 700, birthSec: 103, birthUsec: 3, path: PINNED_CODE_MODE_HOST.path }],
  ])
  for (const [pid, path] of Object.entries(paths)) hosts.set(Number(pid), { ...hosts.get(Number(pid)), path })
  const calls = { pin: 0, spawn: 0, stop: 0, list: [], metadata: [], identities: [], signals: 0 }
  let currentChildren = children
  const os = {
    identity(pid) {
      calls.identities.push(pid)
      if (pid === parent.pid) return parent
      return hosts.get(pid) ?? null
    },
    listDirectChildren(pid) {
      calls.list.push(pid)
      return currentChildren
    },
    directChildMetadata(parentPid, pid) {
      calls.metadata.push([parentPid, pid])
      return hosts.get(pid) ?? null
    },
  }
  const observer = createOwnedHostObserver({
    spawnOwnedCodex: async () => {
      calls.spawn++
      onSpawn(child)
      return {
        child,
        stopOwned: async () => {
          calls.stop++
          if (stopThrows) throw new Error('owned stop failed')
          hosts.delete(711)
          if (stopEmitsExit) {
            child.exitCode = 0
            child.emit('exit', 0, null)
          }
          if (stopEmitsClose) child.emit('close', 0, null)
        },
      }
    },
    os,
    verifyHostPin: async () => {
      calls.pin++
      return PINNED_CODE_MODE_HOST
    },
    allowedDirectChildPaths: ['/opt/homebrew/Cellar/node/26.11.0/bin/node'],
    maxPolls,
    maxStopPolls,
    pause: async () => {},
  })
  return {
    observer,
    child,
    parent,
    hosts,
    os,
    calls,
    setChildren: value => {
      currentChildren = value
    },
  }
}

test('owned handle is the sole PID source; live host and original absence are required', async () => {
  const f = fixture()
  assert.equal('bindPid' in f.observer, false)
  const session = await f.observer.spawn({ caseId: 'B01' })
  assert.equal(session.assertLiveHostBeforeCaseComplete().pid, 711)
  assert.deepEqual(await session.stopAndVerify(), {
    originalHostGone: true,
    pidReused: false,
    observedHost: { pid: 711, ppid: 700, birthSec: 102, birthUsec: 2, path: PINNED_CODE_MODE_HOST.path },
  })
  assert.equal(f.calls.pin, 1)
  assert.equal(f.calls.spawn, 1)
  assert.equal(f.calls.stop, 1)
  assert.deepEqual(f.calls.list, [700])
  assert.deepEqual(f.calls.metadata, [[700, 711]])
  assert.equal(f.calls.signals, 0)
  assert.throws(() => session.observe(), /no longer live/)
})

test('missing host cannot complete or stop as a passing case', async () => {
  const f = fixture({ children: [] })
  const session = await f.observer.spawn()
  assert.throws(() => session.assertLiveHostBeforeCaseComplete(), /no observed live/)
  await assert.rejects(session.stopAndVerify(), /live host completion check required/)
  assert.equal(f.calls.stop, 1)
})

test('duplicate live hosts fail closed', async () => {
  const f = fixture({ children: [711, 712] })
  const session = await f.observer.spawn()
  assert.throws(() => session.observe(), /duplicate live/)
  assert.equal(f.calls.stop, 0)
})

test('wrong parent and unknown direct child fail without reading unrelated process metadata', async () => {
  const wrong = fixture()
  wrong.hosts.set(711, { ...wrong.hosts.get(711), ppid: 999 })
  const wrongSession = await wrong.observer.spawn()
  assert.throws(() => wrongSession.observe(), /parent or identity mismatch/)
  const unknown = fixture({ children: [711, 713] })
  unknown.hosts.set(713, { pid: 713, ppid: 700, birthSec: 104, birthUsec: 4, path: '/unknown/helper' })
  const unknownSession = await unknown.observer.spawn()
  assert.throws(() => unknownSession.observe(), /unreviewed direct child/)
  assert.deepEqual(unknown.calls.metadata, [
    [700, 711],
    [700, 713],
  ])
  assert.equal(unknown.calls.signals, 0)
})

test('a reused host PID proves original birth identity gone without treating replacement as owned', async () => {
  const f = fixture()
  const session = await f.observer.spawn()
  session.assertLiveHostBeforeCaseComplete()
  f.hosts.set(711, { ...f.hosts.get(711), birthSec: 333, path: '/foreign/process' })
  const identity = f.os.identity
  f.os.identity = pid => (pid === 711 ? { pid: 711, ppid: 1, birthSec: 333, birthUsec: 4 } : identity(pid))
  const result = await session.stopAndVerify()
  assert.equal(result.originalHostGone, true)
  assert.equal(result.pidReused, true)
  assert.deepEqual(f.calls.metadata, [[700, 711]])
})

test('post-stop inspection uncertainty and surviving original identity do not pass', async () => {
  const uncertain = fixture()
  const uncertainSession = await uncertain.observer.spawn()
  uncertainSession.assertLiveHostBeforeCaseComplete()
  const original = uncertain.os.identity
  uncertain.os.identity = pid => (pid === 711 ? { pid: 711, ppid: 700, birthSec: 0, birthUsec: 0 } : original(pid))
  await assert.rejects(uncertainSession.stopAndVerify(), /identity uncertain/)

  const live = fixture()
  const liveSession = await live.observer.spawn()
  liveSession.assertLiveHostBeforeCaseComplete()
  const host = { ...live.hosts.get(711) }
  const liveIdentity = live.os.identity
  live.os.identity = pid => (pid === 711 ? host : liveIdentity(pid))
  await assert.rejects(liveSession.stopAndVerify(), /host absence uncertain/)
})

test('a stop request without owned Codex exit cannot qualify host cleanup', async () => {
  const f = fixture({ stopEmitsExit: false, stopEmitsClose: false })
  const session = await f.observer.spawn()
  session.assertLiveHostBeforeCaseComplete()
  await assert.rejects(session.stopAndVerify(), error => error.status === 'UNKNOWN' && error.cleanupKnown === false)
  assert.deepEqual(f.calls.identities, [700, 700, 700])
})

test('exit without close and owned-stop failure leave cleanup unknown', async () => {
  const noClose = fixture({ stopEmitsClose: false })
  const noCloseSession = await noClose.observer.spawn()
  noCloseSession.assertLiveHostBeforeCaseComplete()
  await assert.rejects(noCloseSession.stopAndVerify(), error => error.status === 'UNKNOWN' && !error.cleanupKnown)
  assert.deepEqual(noClose.calls.identities, [700, 700, 700])

  const failedStop = fixture({ stopThrows: true })
  const failedSession = await failedStop.observer.spawn()
  failedSession.assertLiveHostBeforeCaseComplete()
  await assert.rejects(failedSession.stopAndVerify(), error => error.status === 'UNKNOWN' && !error.cleanupKnown)
  assert.equal(failedStop.calls.stop, 1)
})

test('post-spawn binding failures request owned cleanup and report whether exit plus close were seen', async () => {
  const wrongParent = fixture()
  wrongParent.parent.ppid = 1
  await assert.rejects(
    wrongParent.observer.spawn(),
    error => error.status === 'UNKNOWN' && error.cleanupKnown === true && /unexpected parent/.test(error.message),
  )
  assert.equal(wrongParent.calls.stop, 1)
  assert.equal(wrongParent.calls.signals, 0)

  const osThrow = fixture()
  osThrow.os.identity = () => {
    throw new Error('OS inspection failed')
  }
  await assert.rejects(
    osThrow.observer.spawn(),
    error => error.status === 'UNKNOWN' && error.cleanupKnown === true && /OS inspection/.test(error.message),
  )
  assert.equal(osThrow.calls.stop, 1)

  const invalid = fixture({
    onSpawn: child => {
      child.pid = undefined
    },
  })
  await assert.rejects(invalid.observer.spawn(), error => error.status === 'UNKNOWN' && error.cleanupKnown === true)
  assert.equal(invalid.calls.stop, 1)

  const missing = fixture()
  const missingObserver = createOwnedHostObserver({
    spawnOwnedCodex: async () => ({
      child: null,
      stopOwned: async () => {
        missing.calls.stop++
      },
    }),
    os: missing.os,
    verifyHostPin: async () => PINNED_CODE_MODE_HOST,
    maxStopPolls: 2,
    pause: async () => {},
  })
  await assert.rejects(missingObserver.spawn(), error => error.status === 'UNKNOWN' && !error.cleanupKnown)
  assert.equal(missing.calls.stop, 1)

  const early = fixture({
    stopEmitsExit: false,
    stopEmitsClose: false,
    onSpawn: child => {
      child.exitCode = 0
      child.emit('exit', 0, null)
      child.emit('close', 0, null)
    },
  })
  await assert.rejects(early.observer.spawn(), error => error.status === 'UNKNOWN' && error.cleanupKnown === false)
  assert.equal(early.calls.stop, 1)
})

test('post-stop OS inspection throw does not qualify host absence', async () => {
  const f = fixture()
  const session = await f.observer.spawn()
  session.assertLiveHostBeforeCaseComplete()
  const identity = f.os.identity
  f.os.identity = pid => {
    if (pid === 711) throw new Error('post-stop OS inspection failed')
    return identity(pid)
  }
  await assert.rejects(
    session.stopAndVerify(),
    error => error.status === 'UNKNOWN' && error.cleanupKnown === true && /post-stop OS/.test(error.message),
  )
})

test('bounded polling, duplicate enumeration, and exited owner fail closed', async () => {
  const quota = fixture({ children: [], maxPolls: 1 })
  const quotaSession = await quota.observer.spawn()
  quotaSession.observe()
  assert.throws(() => quotaSession.observe(), /poll quota exceeded/)

  const duplicate = fixture({ children: [711, 711] })
  const duplicateSession = await duplicate.observer.spawn()
  assert.throws(() => duplicateSession.observe(), /enumeration invalid/)

  const exited = fixture()
  const exitedSession = await exited.observer.spawn()
  exited.child.emit('exit', 0, null)
  assert.throws(() => exitedSession.observe(), /no longer live/)
  assert.deepEqual(exited.calls.list, [])
})

test('unverified host pin and an arbitrary child PID cannot enter the observer', async () => {
  const f = fixture()
  const session = await f.observer.spawn({ pid: 999 })
  session.observe()
  assert.deepEqual(f.calls.list, [700])
  const rejected = createOwnedHostObserver({
    spawnOwnedCodex: async () => {
      f.calls.spawn++
      return { child: f.child, stopOwned: async () => {} }
    },
    os: f.os,
    verifyHostPin: async () => ({ path: PINNED_CODE_MODE_HOST.path, sha256: '0'.repeat(64) }),
  })
  await assert.rejects(rejected.spawn(), /pin verification unavailable/)
  assert.equal(f.calls.spawn, 1)
})

test('separate binary pin refuses altered path or hash before opening any file', async () => {
  let opened = false
  await assert.rejects(
    verifyPinnedHostBinary({
      pin: { ...PINNED_CODE_MODE_HOST, sha256: '0'.repeat(64) },
      fileSystem: {
        open: async () => {
          opened = true
        },
      },
    }),
    /host pin drift/,
  )
  assert.equal(opened, false)
})
