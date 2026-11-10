// Launched by the supervisor only after the ordinary owner PID has exited.
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
const [filename, pidText, nativePidText, profile = 'ORIGINAL_C1'] = process.argv.slice(2)
const ownerPid = Number(pidText)
if (!['ORIGINAL_C1', 'GENUINE_LEGACY_FS', 'ORIGINAL_COMPOSITION16Z'].includes(profile))
  throw new Error('Unknown fixed inspection profile')
const legacy = profile === 'GENUINE_LEGACY_FS'
const composition = profile === 'ORIGINAL_COMPOSITION16Z'
const nativePid = nativePidText === 'NONE' && legacy ? null : Number(nativePidText)
if (
  !Number.isSafeInteger(ownerPid) ||
  ownerPid < 1 ||
  ownerPid === process.pid ||
  (nativePid !== null && (!Number.isSafeInteger(nativePid) || nativePid < 1)) ||
  (!legacy && nativePid === null)
)
  throw new Error('Invalid original owner PID')
for (const pid of nativePid === null ? [ownerPid] : [ownerPid, nativePid]) {
  try {
    process.kill(pid, 0)
    throw new Error('Original owner or native contender still exists; inspection forbidden')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}
const workspace = path.dirname(filename)
const preserved = path.join(workspace, 'before-recovery')
mkdirSync(preserved)
const artifacts = readdirSync(workspace)
  .filter(entry => entry.startsWith('canonical.db'))
  .map(name => {
    const full = path.join(workspace, name)
    copyFileSync(full, path.join(preserved, name))
    const bytes = readFileSync(full)
    return { name, byteCount: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
let recoveryLimitation = null
const recoveryDirectory = path.join(workspace, 'recovery-copy')
mkdirSync(recoveryDirectory)
for (const artifact of artifacts) {
  const target = path.join(recoveryDirectory, artifact.name)
  copyFileSync(path.join(preserved, artifact.name), target)
  if (createHash('sha256').update(readFileSync(target)).digest('hex') !== artifact.sha256)
    throw new Error('Recovery copy preimage mismatch')
}
const recoveredFilename = path.join(recoveryDirectory, path.basename(filename))
let db = new DatabaseSync(recoveredFilename, { readOnly: true })
try {
  db.prepare('SELECT count(*) FROM sqlite_master').get()
} catch (error) {
  recoveryLimitation = String(error)
  db.close()
  const recovery = new DatabaseSync(recoveredFilename)
  recovery.prepare('SELECT count(*) FROM sqlite_master').get()
  recovery.close()
  db = new DatabaseSync(recoveredFilename, { readOnly: true })
}
function boundedCount(table, maximum) {
  return db.prepare(`SELECT count(*) AS count FROM (SELECT 1 FROM "${table}" LIMIT ?)`).get(maximum + 1).count
}
const counts = {
  journeys: boundedCount('QualityJourney', 1),
  slots: boundedCount('QualityJourneyProviderSlot', 1),
  runs: boundedCount('QualityJourneyProviderRun', composition ? 2 : 1),
  intents: boundedCount('QualityJourneyProviderDispatchIntent', legacy ? 1 : composition ? 3 : 2),
  sources: boundedCount('QualityJourneyProviderSourceState', legacy ? 0 : 2),
  observations: boundedCount('QualityJourneyProviderObservation', legacy ? 1 : composition ? 6 : 2),
  ledger: boundedCount('QualityJourneyProviderSourceLedgerRecord', legacy ? 0 : 1024),
  ...(composition
    ? {
        attempts: boundedCount('QualityJourneyWorkAttempt', 2),
        authorizations: boundedCount('QualityJourneyWorkAuthorization', 2),
      }
    : {}),
}

if (
  (composition && (counts.attempts !== 2 || counts.authorizations !== 2)) ||
  counts.journeys !== 1 ||
  counts.slots !== 1 ||
  counts.runs !== (composition ? 2 : 1) ||
  counts.intents !== (legacy ? 1 : composition ? 3 : 2) ||
  counts.sources !== (legacy ? 0 : 2) ||
  counts.observations > (legacy ? 1 : composition ? 6 : 2) ||
  counts.ledger > (legacy ? 0 : 1024)
)
  throw new Error('Recovered fixture exceeds exact canonical row/count bounds')
const result = {
  profile,
  inspectorPid: process.pid,
  ownerPid,
  nativePid,
  ownerGone: true,
  artifacts,
  recoveryLimitation,
  recoveredFilename,
  counts,
  journeys: db.prepare('SELECT id,targetProjectId,ownershipVersion FROM QualityJourney LIMIT 2').all(),
  hub: db.prepare("SELECT * FROM QualityJourneyProviderSlot WHERE id='HUB'").get(),
  observations: db.prepare(`SELECT * FROM QualityJourneyProviderObservation LIMIT ${composition ? 7 : 3}`).all(),
  state: db.prepare('SELECT * FROM QualityJourneyProviderSourceState LIMIT 3').all(),
  intents: db.prepare(`SELECT * FROM QualityJourneyProviderDispatchIntent LIMIT ${composition ? 4 : 3}`).all(),
  runs: db.prepare(`SELECT * FROM QualityJourneyProviderRun LIMIT ${composition ? 3 : 2}`).all(),
  ledger: db
    .prepare(
      'SELECT sourceId,count(*) AS count,min(sequence) AS first,max(sequence) AS last,sum(byteCount) AS byteCount FROM QualityJourneyProviderSourceLedgerRecord GROUP BY sourceId LIMIT 3',
    )
    .all(),
  ...(composition
    ? {
        attempts: db
          .prepare(
            'SELECT id,workItemId,attempt,authorizationId FROM QualityJourneyWorkAttempt ORDER BY attempt LIMIT 3',
          )
          .all(),
      }
    : {}),
  receiptReservations: db
    .prepare("SELECT count(*) AS count FROM QualityJourneyProviderSourceLedgerRecord WHERE kind='RECEIPT_RESERVED'")
    .get().count,
  integrity: db.prepare('PRAGMA integrity_check').all(),
  foreignKeys: db.prepare('PRAGMA foreign_key_check').all(),
}

db.close()
for (const artifact of artifacts) {
  if (
    createHash('sha256')
      .update(readFileSync(path.join(workspace, artifact.name)))
      .digest('hex') !== artifact.sha256
  )
    throw new Error('Original consumed artifact changed')
}
process.stdout.write(
  JSON.stringify(result, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)) + '\n',
)
