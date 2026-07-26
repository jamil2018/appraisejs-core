import crypto from 'node:crypto'
import fs from 'node:fs'

function processExists(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function createLock(lockPath, token) {
  fs.mkdirSync(lockPath, { mode: 0o700 })
  fs.writeFileSync(
    `${lockPath}/owner.json`,
    JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }),
    { encoding: 'utf8', mode: 0o600 },
  )
}

function staleLockAge(lockPath, owner) {
  const ownerTimestamp = owner && Number.isFinite(Date.parse(owner.acquiredAt)) ? owner.acquiredAt : null
  return Date.now() - (ownerTimestamp ? Date.parse(ownerTimestamp) : fs.statSync(lockPath).mtimeMs)
}

function readLockOwner(lockPath) {
  const owner = JSON.parse(fs.readFileSync(`${lockPath}/owner.json`, 'utf8'))
  return validLockOwner(owner) ? owner : null
}

function validLockOwner(owner) {
  return isLockOwnerRecord(owner) && validLockOwnerFields(owner)
}

function isLockOwnerRecord(owner) {
  return owner !== null && typeof owner === 'object'
}

function validLockOwnerFields(owner) {
  return Number.isInteger(owner.pid) && nonBlankString(owner.token) && Number.isFinite(Date.parse(owner.acquiredAt))
}

function nonBlankString(value) {
  return typeof value === 'string' && value.length > 0
}

function shouldReclaimLock(lockPath, staleMs, hardStaleMs) {
  try {
    return reclaimLockForOwner(lockPath, readLockOwner(lockPath), staleMs, hardStaleMs)
  } catch (error) {
    if (!recoverableLockInspectionError(error)) throw error
    return reclaimOwnerlessLock(lockPath, staleMs)
  }
}

function reclaimLockForOwner(lockPath, owner, staleMs, hardStaleMs) {
  return owner ? reclaimOwnedLock(lockPath, owner, staleMs, hardStaleMs) : reclaimOwnerlessLock(lockPath, staleMs)
}

function recoverableLockInspectionError(error) {
  return ['ENOENT', 'ENOTDIR'].includes(error.code) || error instanceof SyntaxError
}

function reclaimOwnerlessLock(lockPath, staleMs) {
  return staleLockAge(lockPath, null) > staleMs
}

function reclaimOwnedLock(lockPath, owner, staleMs, hardStaleMs) {
  const age = staleLockAge(lockPath, owner)
  if (age > hardStaleMs) return true
  return age > staleMs && !processExists(owner.pid)
}

function inspectExistingLock(lockPath, staleMs, hardStaleMs) {
  const state = existingLockState(lockPath)
  if (state === 'missing') return null
  if (state === 'symlink') throw new Error(`Refusing symbolic-link swarm lock: ${lockPath}`)
  return existingLockReclaim(lockPath, staleMs, hardStaleMs)
}

function existingLockState(lockPath) {
  try {
    return fs.lstatSync(lockPath).isSymbolicLink() ? 'symlink' : 'present'
  } catch (error) {
    if (error.code === 'ENOENT') return 'missing'
    throw error
  }
}

function existingLockReclaim(lockPath, staleMs, hardStaleMs) {
  try {
    return shouldReclaimLock(lockPath, staleMs, hardStaleMs)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function reclaimLock(lockPath, token) {
  const abandonedPath = `${lockPath}.abandoned.${process.pid}.${token}`
  try {
    fs.renameSync(lockPath, abandonedPath)
    fs.rmSync(abandonedPath, { recursive: true, force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

export function acquireLedgerLock(lockPath, { timeoutMs = 2000, staleMs = 1000, hardStaleMs = 30000 } = {}) {
  const startedAt = Date.now()
  const token = crypto.randomUUID()
  while (Date.now() - startedAt < timeoutMs) {
    if (attemptLockAcquisition(lockPath, token, staleMs, hardStaleMs)) return token
  }
  throw new Error(`Timed out acquiring swarm ledger lock: ${lockPath}`)
}

function attemptLockAcquisition(lockPath, token, staleMs, hardStaleMs) {
  if (tryCreateLock(lockPath, token)) return true
  const reclaim = inspectExistingLock(lockPath, staleMs, hardStaleMs)
  if (reclaim === null) return false
  if (reclaim) reclaimLock(lockPath, token)
  else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
  return false
}

function tryCreateLock(lockPath, token) {
  try {
    createLock(lockPath, token)
    return true
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
}

export function releaseLedgerLock(lockPath, token) {
  try {
    const owner = JSON.parse(fs.readFileSync(`${lockPath}/owner.json`, 'utf8'))
    if (owner.token === token) fs.rmSync(lockPath, { recursive: true, force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
