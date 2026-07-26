import fs from 'node:fs'
import path from 'node:path'
import { acquireLedgerLock, releaseLedgerLock } from './swarm-ledger-lock.mjs'
import { readJournal } from './swarm-ledger-store.mjs'

export function withLockedSwarmJournal(callback) {
  const stateDir = path.join(process.cwd(), '.appraisejs')
  const journalPath = path.join(stateDir, 'swarm-events.jsonl')
  const lockPath = `${journalPath}.lock`
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  const lockToken = acquireLedgerLock(lockPath)
  try {
    return callback(readJournal(journalPath), journalPath)
  } finally {
    releaseLedgerLock(lockPath, lockToken)
  }
}
