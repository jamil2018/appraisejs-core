/** Bounded owned-child readiness only; file pinning is not process-image or command attestation. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'

export const GIT_FILE_PIN = Object.freeze({
  path: '/opt/homebrew/Cellar/git/2.56.0/bin/git',
  sha256: '40163333061f7223ecb604ed0f12988cfc8096d57ca8b1db006d410d4aeb700e',
  dev: 16777233,
  ino: 66440903,
  uid: 502,
  mode: 0o555,
  nlink: 1,
  size: 3758960,
})

const failureNames = [
  'FILE_PIN_DRIFT',
  'FILE_INSPECTION_UNAVAILABLE',
  'CONFIGURATION_INVALID',
  'SUMMARY_INVALID',
  'WAIT_ALREADY_ATTEMPTED',
  'GATE_FENCED',
  'OWNED_CHILD_NOT_LIVE',
  'OWNED_CHILD_EVENT_HANDLE_INVALID',
  'PARENT_IDENTITY_INVALID',
  'PARENT_IDENTITY_CHANGED',
  'OS_IDENTITY_UNAVAILABLE',
  'CHILD_ENUMERATION_UNAVAILABLE',
  'CHILD_ENUMERATION_INVALID',
  'CHILD_METADATA_UNAVAILABLE',
  'CHILD_IDENTITY_INVALID',
  'HOST_MISSING',
  'DUPLICATE_HOST',
  'HOST_IDENTITY_CHANGED',
  'UNREVIEWED_CHILD_PATH',
  'DUPLICATE_GIT',
  'GIT_IDENTITY_CHANGED',
  'GIT_IDENTITY_INVALID',
  'GIT_IDENTITY_LIMIT',
  'GIT_LIVE_LIMIT',
  'GIT_PATH_CHANGED',
  'GIT_METADATA_MISSING',
  'GIT_IDENTITY_INCONSISTENT',
  'GIT_REPARENTED',
  'POLL_BUDGET_EXHAUSTED',
  'PAUSE_UNAVAILABLE',
  'FINAL_HOST_MISMATCH',
  'WAIT_NOT_COMPLETE',
  'UNEXPECTED_FAILURE',
]
export const GIT_READINESS_FAILURE_REASONS = Object.freeze(
  failureNames.map(name => Object.freeze([`M02_GIT_READINESS_${name}`, `GIT_READINESS_${name}`])),
)
const ownErrors = new WeakSet()
function fail(name) {
  const error = new Error(`M02_GIT_READINESS_${name}`)
  ownErrors.add(error)
  throw error
}

function pinnedFile(state) {
  return (
    state.isFile() &&
    !state.isSymbolicLink() &&
    ['dev', 'ino', 'uid', 'nlink', 'size'].every(key => state[key] === GIT_FILE_PIN[key]) &&
    (state.mode & 0o7777) === GIT_FILE_PIN.mode &&
    Number.isFinite(state.mtimeMs) &&
    Number.isFinite(state.ctimeMs)
  )
}

export async function verifyQualifiedGitFile({ fileSystem = fs } = {}) {
  try {
    const before = await fileSystem.lstat(GIT_FILE_PIN.path)
    if (!pinnedFile(before)) fail('FILE_PIN_DRIFT')
    const unchanged = state =>
      pinnedFile(state) &&
      state.mode === before.mode &&
      state.mtimeMs === before.mtimeMs &&
      state.ctimeMs === before.ctimeMs
    const held = await fileSystem.open(GIT_FILE_PIN.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!unchanged(await held.stat())) fail('FILE_PIN_DRIFT')
      const bytes = await held.readFile()
      if (
        bytes.length !== GIT_FILE_PIN.size ||
        createHash('sha256').update(bytes).digest('hex') !== GIT_FILE_PIN.sha256 ||
        !unchanged(await held.stat()) ||
        !unchanged(await fileSystem.lstat(GIT_FILE_PIN.path))
      )
        fail('FILE_PIN_DRIFT')
    } finally {
      await held.close()
    }
    return GIT_FILE_PIN
  } catch (error) {
    if (ownErrors.has(error)) throw error
    fail('FILE_INSPECTION_UNAVAILABLE')
  }
}

const summaryKeys = Object.freeze([
  'samples',
  'gitObserved',
  'gitIdentityCount',
  'gitGone',
  'gitPidReused',
  'hostObserved',
  'hostIdentityStable',
  'readinessComplete',
])

export function validateGitReadinessSummary(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SUMMARY_INVALID')
    const fields = Object.getOwnPropertyDescriptors(value)
    if (
      Reflect.ownKeys(fields).length !== summaryKeys.length ||
      Object.keys(fields).sort().join(',') !== [...summaryKeys].sort().join(',') ||
      summaryKeys.some(key => !Object.hasOwn(fields[key], 'value') || !fields[key].enumerable)
    )
      fail('SUMMARY_INVALID')
    const result = Object.fromEntries(summaryKeys.map(key => [key, fields[key].value]))
    if (
      !Number.isSafeInteger(result.samples) ||
      result.samples < 0 ||
      result.samples > 11 ||
      !Number.isSafeInteger(result.gitIdentityCount) ||
      result.gitIdentityCount < 0 ||
      result.gitIdentityCount > 4 ||
      summaryKeys
        .filter(key => !['samples', 'gitIdentityCount'].includes(key))
        .some(key => typeof result[key] !== 'boolean') ||
      result.gitObserved !== result.gitIdentityCount > 0 ||
      (result.gitGone && !result.gitObserved) ||
      (result.gitPidReused && !result.gitObserved) ||
      (result.hostIdentityStable && !result.hostObserved) ||
      ((result.hostObserved || result.gitObserved) && result.samples < 1) ||
      (result.readinessComplete &&
        (!result.hostObserved ||
          !result.hostIdentityStable ||
          result.samples < 1 ||
          (result.gitObserved && !result.gitGone)))
    )
      fail('SUMMARY_INVALID')
    return Object.freeze(result)
  } catch (error) {
    if (ownErrors.has(error)) throw error
    fail('SUMMARY_INVALID')
  }
}

const validIdentity = value =>
  Number.isSafeInteger(value?.pid) &&
  value.pid > 0 &&
  Number.isSafeInteger(value.ppid) &&
  value.ppid >= 0 &&
  Number.isSafeInteger(value.birthSec) &&
  value.birthSec > 0 &&
  Number.isSafeInteger(value.birthUsec) &&
  value.birthUsec >= 0 &&
  value.birthUsec < 1_000_000
const sameBirth = (a, b) => a?.pid === b?.pid && a?.birthSec === b?.birthSec && a?.birthUsec === b?.birthUsec
const sameParent = (a, b) => validIdentity(a) && sameBirth(a, b) && a.ppid === b.ppid
const captureIdentity = value =>
  Object.freeze({ pid: value.pid, ppid: value.ppid, birthSec: value.birthSec, birthUsec: value.birthUsec })
const pathInput = value => typeof value === 'string' && value.startsWith('/') && !value.includes('\0')

export function createGitReadinessGate({
  os,
  expectedHostPath,
  interpreterPath,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  try {
    if (
      typeof os?.identity !== 'function' ||
      typeof os.listDirectChildren !== 'function' ||
      typeof os.directChildMetadata !== 'function' ||
      typeof pause !== 'function' ||
      !pathInput(expectedHostPath) ||
      !pathInput(interpreterPath) ||
      expectedHostPath === interpreterPath ||
      [expectedHostPath, interpreterPath].includes(GIT_FILE_PIN.path)
    )
      fail('CONFIGURATION_INVALID')
  } catch (error) {
    if (ownErrors.has(error)) throw error
    fail('CONFIGURATION_INVALID')
  }
  const summary = {
    samples: 0,
    gitObserved: false,
    gitIdentityCount: 0,
    gitGone: false,
    gitPidReused: false,
    hostObserved: false,
    hostIdentityStable: false,
    readinessComplete: false,
  }
  let attempted = false
  let failed = false
  let ownedChild = null
  let parent = null
  let host = null
  const history = new Map()
  let exited = false
  let closed = false
  const snapshot = () => validateGitReadinessSummary(summary)
  const identity = pid => {
    try {
      return os.identity(pid)
    } catch {
      fail('OS_IDENTITY_UNAVAILABLE')
    }
  }
  const live = () => {
    if (failed) fail('GATE_FENCED')
    if (
      exited ||
      closed ||
      !ownedChild ||
      ownedChild.exitCode !== null ||
      ownedChild.signalCode !== null ||
      !Number.isSafeInteger(ownedChild.pid) ||
      ownedChild.pid < 1 ||
      (parent && ownedChild.pid !== parent.pid)
    )
      fail('OWNED_CHILD_NOT_LIVE')
  }
  const parentUnchanged = () => {
    live()
    if (!sameParent(identity(parent.pid), parent)) fail('PARENT_IDENTITY_CHANGED')
    live()
  }
  const inspect = () => {
    parentUnchanged()
    let pids
    try {
      pids = os.listDirectChildren(parent.pid)
    } catch {
      fail('CHILD_ENUMERATION_UNAVAILABLE')
    }
    if (
      !Array.isArray(pids) ||
      pids.length > 15 ||
      new Set(pids).size !== pids.length ||
      pids.some(pid => !Number.isSafeInteger(pid) || pid < 1 || pid === parent.pid)
    )
      fail('CHILD_ENUMERATION_INVALID')
    let sampledHost = null
    let sampledGitCount = 0
    const rows = new Map()
    for (const pid of pids) {
      let metadata
      try {
        metadata = os.directChildMetadata(parent.pid, pid)
      } catch {
        fail('CHILD_METADATA_UNAVAILABLE')
      }
      rows.set(pid, metadata)
      if (metadata === null) continue // Exit race; retained Git identities are still reconciled below.
      if (!validIdentity(metadata) || metadata.pid !== pid || metadata.ppid !== parent.pid)
        fail('CHILD_IDENTITY_INVALID')
      for (const tracked of history.values()) {
        if (sameBirth(metadata, tracked.original) && metadata.path !== GIT_FILE_PIN.path) fail('GIT_PATH_CHANGED')
      }
      if (metadata.path === expectedHostPath) {
        if (sampledHost) fail('DUPLICATE_HOST')
        sampledHost = captureIdentity(metadata)
        if (host && !sameParent(sampledHost, host)) {
          summary.hostIdentityStable = false
          fail('HOST_IDENTITY_CHANGED')
        }
        host ??= sampledHost
        summary.hostObserved = true
        summary.hostIdentityStable = true
      } else if (metadata.path === GIT_FILE_PIN.path) {
        if (++sampledGitCount > 3) fail('GIT_LIVE_LIMIT')
        const original = captureIdentity(metadata)
        const key = `${original.pid}:${original.birthSec}:${original.birthUsec}`
        const tracked = history.get(key)
        if (tracked?.gone) fail('GIT_IDENTITY_CHANGED')
        if (!tracked) {
          if (history.size >= 4) fail('GIT_IDENTITY_LIMIT')
          history.set(key, { original, gone: false })
          summary.gitObserved = true
          summary.gitIdentityCount = history.size
          summary.gitGone = false
        }
      } else if (metadata.path !== interpreterPath) fail('UNREVIEWED_CHILD_PATH')
    }
    if (!sampledHost) fail('HOST_MISSING')
    let liveGitCount = 0
    // Never delete an identity after list absence, path change, exit, or PID reuse.
    // At most four identity queries per sample, including identities already observed gone.
    for (const tracked of history.values()) {
      const { original } = tracked
      const current = identity(original.pid)
      const row = rows.get(original.pid)
      if (current === null) {
        tracked.gone = true
        continue
      }
      if (!validIdentity(current) || current.pid !== original.pid) fail('GIT_IDENTITY_INVALID')
      // A non-null current row must describe the same process as the identity query.
      if (row && !sameParent(current, row)) fail('GIT_IDENTITY_INCONSISTENT')
      if (!sameBirth(current, original)) {
        tracked.gone = true
        summary.gitPidReused = true
        if (current.ppid === parent.pid && !row) fail('GIT_METADATA_MISSING')
        continue
      }
      if (current.ppid !== parent.pid) fail('GIT_REPARENTED')
      if (tracked.gone) fail('GIT_IDENTITY_CHANGED')
      if (!row) fail('GIT_METADATA_MISSING')
      if (row.path !== GIT_FILE_PIN.path) fail('GIT_PATH_CHANGED')
      if (++liveGitCount > 3) fail('GIT_LIVE_LIMIT')
    }
    summary.gitGone = history.size > 0 && [...history.values()].every(tracked => tracked.gone)
    // A Git row that exited after its metadata read still prevents READY in this sample.
    const quiescent = sampledGitCount === 0 && (history.size === 0 || summary.gitGone)
    parentUnchanged()
    return quiescent
  }
  return Object.freeze({
    async waitForReady(child) {
      try {
        if (attempted) fail('WAIT_ALREADY_ATTEMPTED')
        attempted = true
        ownedChild = child
        if (typeof child?.once !== 'function') fail('OWNED_CHILD_EVENT_HANDLE_INVALID')
        child.once('exit', () => {
          exited = true
        })
        child.once('close', () => {
          closed = true
        })
        live()
        const initial = identity(child.pid)
        if (!validIdentity(initial) || initial.pid !== child.pid || initial.ppid !== process.pid)
          fail('PARENT_IDENTITY_INVALID')
        parent = captureIdentity(initial)
        live()
        for (let sample = 0; sample < 11; sample++) {
          summary.samples++
          if (inspect()) {
            summary.readinessComplete = true
            return snapshot()
          }
          if (sample < 10) {
            try {
              await pause(1000)
            } catch {
              fail('PAUSE_UNAVAILABLE')
            }
          }
        }
        fail('POLL_BUDGET_EXHAUSTED')
      } catch (error) {
        failed = true
        summary.readinessComplete = false
        if (ownErrors.has(error)) throw error
        fail('UNEXPECTED_FAILURE')
      }
    },
    assertFinalHost(finalHost) {
      try {
        if (!summary.readinessComplete || !host) fail('WAIT_NOT_COMPLETE')
        live()
        if (!sameParent(finalHost, host) || finalHost.path !== expectedHostPath) {
          summary.hostIdentityStable = false
          summary.readinessComplete = false
          fail('FINAL_HOST_MISMATCH')
        }
        return snapshot()
      } catch (error) {
        failed = true
        summary.readinessComplete = false
        if (ownErrors.has(error)) throw error
        fail('UNEXPECTED_FAILURE')
      }
    },
    snapshot,
  })
}
