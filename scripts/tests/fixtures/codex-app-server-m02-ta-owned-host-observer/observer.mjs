import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'

export const PINNED_CODE_MODE_HOST = Object.freeze({
  path: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex-code-mode-host',
  sha256: 'ffc2b1e5c10c7f369ccc0fa755a712c5c2ba38d93246e7144111e4dd972ae938',
})

const identityKey = value => `${value.pid}:${value.birthSec}:${value.birthUsec}`
const sameIdentity = (a, b) => a?.pid === b?.pid && a?.birthSec === b?.birthSec && a?.birthUsec === b?.birthUsec
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

function uncertain(error, cleanupKnown) {
  const result = new Error(error.message, { cause: error })
  result.code = 'OWNED_HOST_OBSERVATION_UNKNOWN'
  result.status = 'UNKNOWN'
  result.cleanupKnown = cleanupKnown
  return result
}

async function requestOwnedStopAndWait(owned, child, lifecycle, maxStopPolls, pause) {
  let stopFailed = false
  try {
    if (typeof owned?.stopOwned !== 'function') throw new Error('owned stop port unavailable')
    await owned.stopOwned()
  } catch {
    stopFailed = true
  }
  for (let attempt = 0; attempt < maxStopPolls; attempt++) {
    if (child?.exitCode != null || child?.signalCode != null) lifecycle.exited = true
    if (lifecycle.exited && lifecycle.closed) return !stopFailed
    if (attempt + 1 < maxStopPolls) {
      try {
        await pause(25)
      } catch {
        return false
      }
    }
  }
  return false
}

/** Pin file bytes and inode metadata before an owned spawn. This is not process-image attestation. */
export async function verifyPinnedHostBinary({ fileSystem = fs, pin = PINNED_CODE_MODE_HOST } = {}) {
  if (pin.path !== PINNED_CODE_MODE_HOST.path || pin.sha256 !== PINNED_CODE_MODE_HOST.sha256)
    throw new Error('host pin drift')
  const handle = await fileSystem.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.nlink !== 1 || ![0, process.getuid()].includes(before.uid) || !(before.mode & 0o111))
      throw new Error('host file metadata rejected')
    const actual = createHash('sha256')
      .update(await handle.readFile())
      .digest('hex')
    const after = await handle.stat()
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.mode !== after.mode ||
      before.uid !== after.uid ||
      before.nlink !== after.nlink ||
      actual !== pin.sha256
    )
      throw new Error('host file pin mismatch')
    return Object.freeze({ path: pin.path, sha256: actual, dev: before.dev, ino: before.ino })
  } finally {
    await handle.close()
  }
}

/**
 * The only public PID input is the live child returned by this factory's trusted spawn port.
 * This is a trusted supervisor interface guard, not a sandbox or hostile-caller boundary.
 */
export function createOwnedHostObserver({
  spawnOwnedCodex,
  os,
  verifyHostPin = verifyPinnedHostBinary,
  allowedDirectChildPaths = [],
  maxPolls = 12,
  maxStopPolls = 80,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (typeof spawnOwnedCodex !== 'function' || typeof verifyHostPin !== 'function')
    throw new Error('trusted spawn and host pin ports required')
  if (
    typeof os?.identity !== 'function' ||
    typeof os.listDirectChildren !== 'function' ||
    typeof os.directChildMetadata !== 'function'
  )
    throw new Error('bounded OS metadata port required')
  if (
    !Number.isSafeInteger(maxPolls) ||
    maxPolls < 1 ||
    maxPolls > 64 ||
    !Number.isSafeInteger(maxStopPolls) ||
    maxStopPolls < 1 ||
    maxStopPolls > 80
  )
    throw new Error('invalid polling limits')
  if (!Array.isArray(allowedDirectChildPaths) || allowedDirectChildPaths.some(path => typeof path !== 'string'))
    throw new Error('invalid direct child allowlist')
  const otherPaths = new Set(allowedDirectChildPaths)
  if (otherPaths.has(PINNED_CODE_MODE_HOST.path)) throw new Error('host cannot be an other child')

  return Object.freeze({
    async spawn(args) {
      const hostPin = await verifyHostPin()
      if (hostPin?.path !== PINNED_CODE_MODE_HOST.path || hostPin?.sha256 !== PINNED_CODE_MODE_HOST.sha256)
        throw new Error('host pin verification unavailable')
      const owned = await spawnOwnedCodex(args)
      const child = owned?.child
      const lifecycle = { exited: false, closed: false }
      let parent
      try {
        // Attach both listeners before reading PID, process state, or any OS metadata.
        if (typeof child?.once !== 'function') throw new Error('owned child event handle missing')
        child.once('exit', () => {
          lifecycle.exited = true
        })
        child.once('close', () => {
          lifecycle.closed = true
        })
        if (
          !Number.isSafeInteger(child.pid) ||
          child.pid < 1 ||
          child.exitCode !== null ||
          child.signalCode !== null ||
          typeof owned.stopOwned !== 'function'
        )
          throw new Error('live owned child handle and stop port required')
        parent = os.identity(child.pid)
        if (!validIdentity(parent) || parent.pid !== child.pid)
          throw new Error('owned child identity unavailable or inconsistent')
        if (parent.ppid !== process.pid) throw new Error('owned child has unexpected parent')
        if (lifecycle.exited || lifecycle.closed || child.exitCode !== null || child.signalCode !== null)
          throw new Error('owned child exited during binding')
      } catch (error) {
        const cleanupKnown = await requestOwnedStopAndWait(owned, child, lifecycle, maxStopPolls, pause)
        throw uncertain(error, cleanupKnown)
      }
      const observed = new Map()
      let polls = 0
      let liveObserved = false
      let caseCompleteCheck = false
      let stopped = false

      const inspect = () => {
        if (stopped || lifecycle.exited || lifecycle.closed || child.exitCode !== null || child.signalCode !== null)
          throw new Error('owned child no longer live')
        if (++polls > maxPolls) throw new Error('host poll quota exceeded')
        const before = os.identity(parent.pid)
        if (!sameIdentity(before, parent) || before.ppid !== parent.ppid)
          throw new Error('owned child identity changed')
        const pids = os.listDirectChildren(parent.pid)
        if (!Array.isArray(pids) || pids.length > 15 || new Set(pids).size !== pids.length)
          throw new Error('direct child enumeration invalid')
        let host = null
        for (const pid of pids) {
          if (!Number.isSafeInteger(pid) || pid < 1 || pid === parent.pid) throw new Error('direct child PID invalid')
          const metadata = os.directChildMetadata(parent.pid, pid)
          if (metadata === null) continue // child exited between list and inspection
          if (!validIdentity(metadata) || metadata.pid !== pid || metadata.ppid !== parent.pid)
            throw new Error('direct child parent or identity mismatch')
          if (metadata.path === PINNED_CODE_MODE_HOST.path) {
            if (host) throw new Error('duplicate live code mode hosts')
            host = metadata
          } else if (!otherPaths.has(metadata.path)) {
            throw new Error('unreviewed direct child observed')
          }
        }
        const after = os.identity(parent.pid)
        if (!sameIdentity(after, parent) || after.ppid !== parent.ppid)
          throw new Error('owned child identity changed during observation')
        if (host) {
          const key = identityKey(host)
          if (observed.size && !observed.has(key)) throw new Error('second code mode host identity')
          observed.set(key, Object.freeze({ ...host }))
          liveObserved = true
        }
        return Object.freeze({
          liveHost: host ? Object.freeze({ ...host }) : null,
          observedCount: observed.size,
          polls,
        })
      }
      const observe = () => {
        try {
          return inspect()
        } catch (error) {
          throw uncertain(error, false)
        }
      }

      return Object.freeze({
        child,
        observe,
        assertLiveHostBeforeCaseComplete() {
          const result = observe()
          if (!result.liveHost || !liveObserved) throw new Error('no observed live code mode host')
          caseCompleteCheck = true
          return result.liveHost
        },
        async stopAndVerify() {
          if (stopped) throw new Error('owned stop already requested')
          stopped = true
          const cleanupKnown = await requestOwnedStopAndWait(owned, child, lifecycle, maxStopPolls, pause)
          if (!cleanupKnown) throw uncertain(new Error('owned Codex exit and close uncertain'), false)
          if (!caseCompleteCheck || observed.size !== 1)
            throw uncertain(new Error('live host completion check required before qualified stop'), true)
          for (let attempt = 0; attempt < maxStopPolls; attempt++) {
            const original = [...observed.values()][0]
            let current
            try {
              current = os.identity(original.pid)
            } catch (error) {
              throw uncertain(error, true)
            }
            if (current === null || (validIdentity(current) && !sameIdentity(current, original)))
              return Object.freeze({ originalHostGone: true, pidReused: current !== null, observedHost: original })
            if (!validIdentity(current)) throw uncertain(new Error('post-stop host identity uncertain'), true)
            if (attempt + 1 < maxStopPolls) {
              try {
                await pause(25)
              } catch (error) {
                throw uncertain(error, true)
              }
            }
          }
          throw uncertain(new Error('original code mode host absence uncertain'), true)
        },
        snapshot: () =>
          Object.freeze({ observedHosts: [...observed.values()], polls, liveObserved, caseCompleteCheck, stopped }),
      })
    },
  })
}
