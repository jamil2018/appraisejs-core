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

// Lock acquisition keeps all recovery branches together so the retry loop owns every race decision.
// fallow-ignore-next-line complexity
export function acquireLedgerLock(lockPath, { timeoutMs = 2000, staleMs = 1000, hardStaleMs = 30000 } = {}) {
  const startedAt = Date.now()
  const token = crypto.randomUUID()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 })
      fs.writeFileSync(
        `${lockPath}/owner.json`,
        JSON.stringify({ pid: process.pid, token, acquiredAt: new Date().toISOString() }),
        { encoding: 'utf8', mode: 0o600 },
      )
      return token
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let lockStat
      try {
        lockStat = fs.lstatSync(lockPath)
      } catch (statError) {
        if (statError.code === 'ENOENT') continue
        throw statError
      }
      if (lockStat.isSymbolicLink()) throw new Error(`Refusing symbolic-link swarm lock: ${lockPath}`)
      let reclaim = false
      try {
        const owner = JSON.parse(fs.readFileSync(`${lockPath}/owner.json`, 'utf8'))
        const validOwner =
          owner !== null &&
          typeof owner === 'object' &&
          Number.isInteger(owner.pid) &&
          typeof owner.token === 'string' &&
          owner.token.length > 0 &&
          Number.isFinite(Date.parse(owner.acquiredAt))
        const age = validOwner ? Date.now() - Date.parse(owner.acquiredAt) : Date.now() - fs.statSync(lockPath).mtimeMs
        reclaim = validOwner ? age > hardStaleMs || (age > staleMs && !processExists(owner.pid)) : age > staleMs
      } catch (inspectionError) {
        if (!['ENOENT', 'ENOTDIR'].includes(inspectionError.code) && !(inspectionError instanceof SyntaxError)) {
          throw inspectionError
        }
        try {
          reclaim = Date.now() - fs.statSync(lockPath).mtimeMs > staleMs
        } catch (statError) {
          if (statError.code !== 'ENOENT') throw statError
          continue
        }
      }
      if (reclaim) {
        const abandonedPath = `${lockPath}.abandoned.${process.pid}.${token}`
        try {
          fs.renameSync(lockPath, abandonedPath)
          fs.rmSync(abandonedPath, { recursive: true, force: true })
        } catch (recoveryError) {
          if (recoveryError.code !== 'ENOENT') throw recoveryError
        }
        continue
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25)
    }
  }
  throw new Error(`Timed out acquiring swarm ledger lock: ${lockPath}`)
}

export function releaseLedgerLock(lockPath, token) {
  try {
    const owner = JSON.parse(fs.readFileSync(`${lockPath}/owner.json`, 'utf8'))
    if (owner.token === token) fs.rmSync(lockPath, { recursive: true, force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
