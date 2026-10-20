/** The only active R14 operations. Importing this module performs no I/O. */
import fs from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import { PREFLIGHT, classify, sha256 } from './policy.mjs'

const STAGES = new Set([
  'PLIST_READ',
  'DIRECTORY_CREATE',
  'SYNTHETIC_WRITE',
  'SYNTHETIC_READ',
  'INTENT_WRITE',
  'LISTENER_BIND',
  'LISTENER_CLOSE',
  'RESULT_WRITE',
])
const fixedFile = (root, name) => join(root, name)
const ownedDirectories = new Map()

function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

function stableRoot(root) {
  const state = fs.lstatSync(root)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700
  )
    throw new Error('owned preflight root identity')
  const identity = { dev: state.dev, ino: state.ino }
  const expected = ownedDirectories.get(root)
  if (expected && (expected.dev !== identity.dev || expected.ino !== identity.ino))
    throw new Error('owned preflight directory replaced')
  return identity
}

function exclusiveWrite(root, name, bytes) {
  stableRoot(root)
  const file = fixedFile(root, name)
  const fd = fs.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const dirfd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    fs.fsyncSync(dirfd)
  } finally {
    fs.closeSync(dirfd)
  }
}

function stableRead(root, name) {
  const file = fixedFile(root, name)
  const before = fs.lstatSync(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== 0o600 ||
    before.size !== Buffer.byteLength(PREFLIGHT.syntheticBytes)
  )
    throw new Error('synthetic file identity')
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const held = fs.fstatSync(fd)
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      throw new Error('synthetic file changed')
    const bytes = fs.readFileSync(fd)
    const after = fs.fstatSync(fd)
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      bytes.length !== before.size
    )
      throw new Error('synthetic file changed during read')
    return bytes
  } finally {
    fs.closeSync(fd)
  }
}

export function createOwnedLoopbackAdapter(serverFactory = net.createServer) {
  let unexpectedInbound = false
  const server = serverFactory(socket => {
    unexpectedInbound = true
    socket.destroy()
  })
  let aborted = false
  let serverError = null
  let pendingReject = null
  server.on('error', error => {
    serverError = error
    pendingReject?.(error)
  })
  return {
    async bind() {
      return await new Promise((resolve, reject) => {
        pendingReject = reject
        server.listen({ host: PREFLIGHT.listenerHost, port: PREFLIGHT.listenerPort, exclusive: true }, () => {
          pendingReject = null
          if (aborted) {
            server.close(() => reject(new Error('listener bind arrived after deadline')))
            return
          }
          if (serverError) {
            reject(serverError)
            return
          }
          const address = server.address()
          if (
            !address ||
            typeof address !== 'object' ||
            address.address !== PREFLIGHT.listenerHost ||
            !Number.isInteger(address.port)
          )
            reject(new Error('listener address mismatch'))
          else resolve(address.port)
        })
      })
    },
    async close() {
      if (!server.listening) throw new Error('listener not observed live')
      await new Promise((resolve, reject) => {
        pendingReject = reject
        server.close(error => {
          pendingReject = null
          if (error || serverError) reject(error ?? serverError)
          else resolve()
        })
      })
      if (server.listening || server.address() !== null) throw new Error('listener close unproved')
      if (unexpectedInbound) throw new Error('unexpected inbound connection')
    },
    async bestEffortClose() {
      aborted = true
      if (!server.listening) return false
      await new Promise((resolve, reject) => {
        pendingReject = reject
        server.close(error => {
          pendingReject = null
          if (error || serverError) reject(error ?? serverError)
          else resolve()
        })
      })
      return !server.listening && server.address() === null
    },
    assertHealthy() {
      if (serverError || unexpectedInbound) throw new Error('listener error or unexpected inbound')
    },
    unref() {
      server.unref()
    },
  }
}

export const realPreflightIo = Object.freeze({
  async readPlist() {
    const before = fs.lstatSync(PREFLIGHT.plist)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      (before.mode & 0o022) !== 0 ||
      before.size < 1 ||
      before.size > 65536
    )
      throw new Error('system plist identity')
    const fd = fs.openSync(PREFLIGHT.plist, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      const held = fs.fstatSync(fd)
      if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
        throw new Error('system plist changed before read')
      const bytes = fs.readFileSync(fd)
      const after = fs.fstatSync(fd)
      if (
        bytes.length !== before.size ||
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.size !== before.size
      )
        throw new Error('system plist changed during read')
      return bytes.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  },
  async createRoot() {
    if (fs.existsSync(PREFLIGHT.root)) throw Object.assign(new Error('one-shot root exists'), { code: 'EEXIST' })
    process.umask(0o077)
    if (process.umask() !== 0o077) throw new Error('private umask unavailable')
    fs.mkdirSync(PREFLIGHT.root, { mode: 0o700 })
    let identity
    try {
      identity = stableRoot(PREFLIGHT.root)
      ownedDirectories.set(PREFLIGHT.root, identity)
      syncDirectory(dirname(PREFLIGHT.root))
      syncDirectory(PREFLIGHT.root)
      return identity
    } catch (error) {
      error.rootCreated = true
      error.rootIdentity = identity ?? null
      throw error
    }
  },
  async createDirectory(relative, index) {
    if (PREFLIGHT.directories[index] !== relative || index < 1) throw new Error('unreviewed directory')
    const parent = relative.slice(0, relative.lastIndexOf('/')) || '.'
    const parentPath = parent === '.' ? PREFLIGHT.root : join(PREFLIGHT.root, parent)
    const parentState = fs.lstatSync(parentPath)
    if (
      !parentState.isDirectory() ||
      parentState.isSymbolicLink() ||
      parentState.uid !== process.getuid() ||
      (parentState.mode & 0o777) !== 0o700
    )
      throw new Error('directory parent identity')
    stableRoot(parentPath)
    const directory = join(PREFLIGHT.root, relative)
    fs.mkdirSync(directory, { mode: 0o700 })
    const state = fs.lstatSync(directory)
    if (
      !state.isDirectory() ||
      state.isSymbolicLink() ||
      state.uid !== process.getuid() ||
      (state.mode & 0o777) !== 0o700
    )
      throw new Error('new directory identity')
    ownedDirectories.set(directory, { dev: state.dev, ino: state.ino })
    syncDirectory(parentPath)
    syncDirectory(directory)
  },
  async write(name, bytes) {
    if (!['synthetic.txt', 'listener-intent.json', 'result.json'].includes(name)) throw new Error('unreviewed file')
    const parent = name === 'synthetic.txt' ? join(PREFLIGHT.root, 'cases/B01/workspace') : PREFLIGHT.root
    stableRoot(parent)
    exclusiveWrite(parent, name, bytes)
  },
  async read(name) {
    if (name !== 'synthetic.txt') throw new Error('unreviewed read')
    const parent = join(PREFLIGHT.root, 'cases/B01/workspace')
    stableRoot(parent)
    return stableRead(parent, name)
  },
  makeListener: createOwnedLoopbackAdapter,
  now: () => Date.now(),
  async withDeadline(promise, remainingMs) {
    if (remainingMs <= 0) throw Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' })
    let timer
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' })), remainingMs)
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  },
})

const boundedError = (stage, error) =>
  Object.freeze({
    stage: STAGES.has(stage) ? stage : 'RESULT_WRITE',
    errno: classify(error),
  })

/** The entrypoint supplies a rechecking authority port; fake ports are confined to offline tests. */
export async function runHostPreflight({ verifyAuthorization, io = realPreflightIo, deadline, now } = {}) {
  const clock = now ?? io.now
  const cutoff = deadline ?? clock() + PREFLIGHT.deadlineMs
  const withinDeadline = () => {
    if (clock() >= cutoff) throw Object.assign(new Error('deadline'), { code: 'ETIMEDOUT' })
  }
  withinDeadline()
  if (typeof verifyAuthorization !== 'function' || (await verifyAuthorization('INITIAL')) !== true)
    throw new Error('exact R14 approval unavailable')
  withinDeadline()
  let stage = 'PLIST_READ'
  let rooted = false
  let intentWritten = false
  let listener = null
  let listenerOpened = false
  let listenerClosed = false
  let port = null
  let directoryIndex = 0
  let directoriesCreated = 0
  let rootIdentity = null
  let resultWriteAttempted = false
  try {
    withinDeadline()
    const plist = await io.readPlist()
    withinDeadline()
    const build = plist.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
    if (build !== PREFLIGHT.osBuild) throw new Error('host build changed')
    withinDeadline()
    stage = 'DIRECTORY_CREATE'
    withinDeadline()
    rootIdentity = await io.createRoot()
    rooted = true
    withinDeadline()
    if (!Number.isSafeInteger(rootIdentity?.dev) || !Number.isSafeInteger(rootIdentity?.ino))
      throw new Error('owned root identity observation absent')
    directoriesCreated = 1
    for (directoryIndex = 1; directoryIndex < PREFLIGHT.directories.length; directoryIndex++) {
      withinDeadline()
      await io.createDirectory(PREFLIGHT.directories[directoryIndex], directoryIndex)
      directoriesCreated++
      withinDeadline()
    }
    withinDeadline()
    stage = 'SYNTHETIC_WRITE'
    withinDeadline()
    await io.write('synthetic.txt', Buffer.from(PREFLIGHT.syntheticBytes))
    withinDeadline()
    stage = 'SYNTHETIC_READ'
    withinDeadline()
    const observedMarker = await io.read('synthetic.txt')
    withinDeadline()
    if (sha256(observedMarker) !== sha256(PREFLIGHT.syntheticBytes)) throw new Error('synthetic byte mismatch')
    withinDeadline()
    stage = 'INTENT_WRITE'
    withinDeadline()
    await io.write(
      'listener-intent.json',
      Buffer.from(
        `${JSON.stringify({ schema: 'appraise.m02-ta-host-preflight-r14-intent/v1', listenerStarts: 1, host: PREFLIGHT.listenerHost, port: 0 })}\n`,
      ),
    )
    intentWritten = true
    withinDeadline()
    if ((await verifyAuthorization('PRE_BIND')) !== true) throw new Error('exact R14 approval changed before listener')
    withinDeadline()
    stage = 'LISTENER_BIND'
    listener = io.makeListener()
    withinDeadline()
    port = await (io.withDeadline ? io.withDeadline(listener.bind(), cutoff - clock()) : listener.bind())
    listenerOpened = true
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('listener port invalid')
    withinDeadline()
    stage = 'LISTENER_CLOSE'
    withinDeadline()
    await (io.withDeadline ? io.withDeadline(listener.close(), cutoff - clock()) : listener.close())
    listenerClosed = true
    withinDeadline()
    listener.assertHealthy?.()
    stage = 'RESULT_WRITE'
    const result = Object.freeze({
      schema: 'appraise.m02-ta-host-preflight-r14-result/v1',
      status: 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE',
      listenerStarts: 1,
      directoriesCreated: PREFLIGHT.directoryCreates,
      rootOwnedObserved: true,
      rootIdentity,
      listenerPort: port,
      listenerCloseObserved: true,
      childExitObservation: 'NOT_APPLICABLE_NO_CHILD',
      rootRetainedForEvidence: true,
      runtimeQualified: false,
      t2Authorized: false,
    })
    resultWriteAttempted = true
    withinDeadline()
    await io.write('result.json', Buffer.from(`${JSON.stringify(result)}\n`))
    withinDeadline()
    listener.assertHealthy?.()
    return Object.freeze({
      ...result,
      status: 'OBSERVED_PERMISSION_CHECK_ONLY',
      resultFileCandidateOnly: true,
      completionGate: 'POST_FLUSH_WITHIN_SHARED_DEADLINE_AND_CLI_RECEIPT',
    })
  } catch (error) {
    if (error?.rootCreated === true) {
      rooted = true
      rootIdentity = error.rootIdentity
    }
    const failure =
      error?.safeReceipt?.stage === 'PIN_READ'
        ? error.safeReceipt
        : Object.freeze({
            ...boundedError(stage, error),
            operationIndex: stage === 'DIRECTORY_CREATE' ? directoryIndex : null,
          })
    let cleanupObserved = listenerClosed
    if (listener && !listenerClosed) {
      try {
        const remaining = Math.max(1, Math.min(250, cutoff - clock()))
        cleanupObserved =
          (await (io.withDeadline
            ? io.withDeadline(listener.bestEffortClose(), remaining)
            : listener.bestEffortClose())) === true
      } catch {
        cleanupObserved = false
      }
      if (!cleanupObserved) {
        try {
          listener.unref?.()
        } catch {
          /* uncertainty is already recorded */
        }
      }
    }
    const result = Object.freeze({
      schema: 'appraise.m02-ta-host-preflight-r14-result/v1',
      status: 'UNKNOWN',
      resultFileAuthoritative: false,
      failure,
      intentWritten,
      listenerOpenObserved: listenerOpened,
      listenerCloseObserved: listenerClosed,
      cleanupObserved,
      childExitObservation: 'NOT_APPLICABLE_NO_CHILD',
      rootRetainedForEvidence: rooted,
      directoriesCreated,
      rootOwnedObserved: rooted && Number.isSafeInteger(rootIdentity?.dev) && Number.isSafeInteger(rootIdentity?.ino),
      rootIdentity:
        Number.isSafeInteger(rootIdentity?.dev) && Number.isSafeInteger(rootIdentity?.ino) ? rootIdentity : null,
      runtimeQualified: false,
      t2Authorized: false,
    })
    if (rooted && !resultWriteAttempted && clock() < cutoff) {
      try {
        resultWriteAttempted = true
        await io.write('result.json', Buffer.from(`${JSON.stringify(result)}\n`))
        if (clock() >= cutoff) return Object.freeze({ ...result, resultFileAuthoritative: false })
      } catch {
        return Object.freeze({ ...result, resultFileAuthoritative: false })
      }
    }
    return resultWriteAttempted && stage === 'RESULT_WRITE'
      ? Object.freeze({ ...result, resultFileCandidateOnly: true, resultFileAuthoritative: false })
      : result
  }
}
