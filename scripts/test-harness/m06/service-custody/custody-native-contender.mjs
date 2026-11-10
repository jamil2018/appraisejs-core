// Ordinary offline contender process only. Never import this module into a Prisma owner.
import { DatabaseSync } from 'node:sqlite'
import { appendFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
const filename = realpathSync(process.argv[2])
const lifetimeFile = path.join(path.dirname(filename), 'native-lifetime.jsonl')
function receipt(type) {
  appendFileSync(lifetimeFile, JSON.stringify({ type, pid: process.pid, filename }) + '\n')
}
const db = new DatabaseSync(filename)
db.exec('PRAGMA busy_timeout=0; PRAGMA read_uncommitted=OFF; PRAGMA foreign_keys=ON;')
const setting = name => Object.values(db.prepare(`PRAGMA ${name}`).get())[0]
const metadata = statSync(filename)
let messages = 0
let failed = false
let closed = false
const lifetime = setInterval(() => void db, 60_000)
function send(value) {
  if (!process.connected) throw new Error('Contender disconnected before known close')
  process.send({ ...value, pid: process.pid })
}
function fail(error, id) {
  failed = true
  try {
    send({ type: 'fatal', id, message: String(error) })
  } catch {}
}
process.on('uncaughtException', fail)
process.on('unhandledRejection', fail)
process.on('disconnect', () => {
  // This protocol has no BEGIN/held transaction API, and every SQLite call is synchronous.
  // The disconnect event runs only after the last callback and autocommit statement settled.
  if (!closed && !failed) {
    db.close()
    closed = true
    receipt('OWNER_IPC_DISCONNECTED_KNOWN_NO_HELD_OPERATION_CLOSED')
    clearInterval(lifetime)
  }
})
function assertExactControlMutation(result, before, after) {
  if (Number(result.changes) !== 1 || Number(after.value) !== Number(before.value) + 1)
    throw new Error('Contender control did not change one exact row')
}
function update(table, key, column, rowId) {
  const before = db.prepare(`SELECT "${column}" AS value FROM "${table}" WHERE "${key}"=?`).get(rowId)
  if (!before) throw new Error('Exact existing contender row missing')
  try {
    const result = db.prepare(`UPDATE "${table}" SET "${column}"="${column}"+1 WHERE "${key}"=?`).run(rowId)
    const after = db.prepare(`SELECT "${column}" AS value FROM "${table}" WHERE "${key}"=?`).get(rowId)
    assertExactControlMutation(result, before, after)
    return { table, ok: true, before: before.value, after: after.value, changes: Number(result.changes) }
  } catch (error) {
    return { table, ok: false, code: error.code, errcode: error.errcode, message: error.message }
  }
}
receipt('PREOPENED_NO_HELD_OPERATION')
send({
  type: 'ready',
  filename,
  device: metadata.dev,
  inode: metadata.ino,
  busyTimeout: setting('busy_timeout'),
  queryOnly: setting('query_only'),
})
function probeOrControlExactRows(message) {
  const rows = [update('QualityJourney', 'id', 'ownershipVersion', message.journeyId)]
  // A successful writer in a held window is terminal evidence; do not run another mutation.
  if (message.type === 'control' || !rows[0].ok)
    rows.push(update('QualityJourneyProviderSourceState', 'sourceId', 'commitFenceVersion', message.sourceId))
  send({ type: 'result', id: message.id, rows })
}
function snapshotExactState(message) {
  const hub = db.prepare("SELECT * FROM QualityJourneyProviderSlot WHERE id='HUB'").get()
  const state = db.prepare('SELECT * FROM QualityJourneyProviderSourceState WHERE sourceId=?').get(message.sourceId)
  const observations = db.prepare('SELECT count(*) AS count FROM QualityJourneyProviderObservation').get().count
  const nonstarts = db
    .prepare("SELECT count(*) AS count FROM QualityJourneyProviderObservation WHERE kind='NONSTART'")
    .get().count
  send({ type: 'snapshot', id: message.id, hub, state, observations, nonstarts })
}
function revokeExactSource(message) {
  const result = db
    .prepare('UPDATE "QualityJourneyProviderSourceState" SET "lifecycle"=\'REVOKED\' WHERE "sourceId"=?')
    .run(message.sourceId)
  if (Number(result.changes) !== 1) throw new Error('Contender revoke exact row missing')
  send({ type: 'revoked', id: message.id, changes: Number(result.changes) })
}
function closeKnownSettledDatabase(message) {
  db.close()
  closed = true
  receipt('EXPLICIT_KNOWN_CLOSE')
  process.send({ type: 'closed', id: message.id, pid: process.pid }, error => {
    if (error) return fail(error, message.id)
    clearInterval(lifetime)
    process.disconnect()
  })
}
function dispatchStateOrLifetimeRequest(message) {
  if (message.type === 'snapshot') {
    snapshotExactState(message)
  } else if (message.type === 'revoke') {
    revokeExactSource(message)
  } else if (message.type === 'close') {
    closeKnownSettledDatabase(message)
  } else throw new Error('Unknown contender message')
}
function dispatchExactDatabaseRequest(message) {
  if (message.type === 'probe' || message.type === 'control') {
    probeOrControlExactRows(message)
  } else dispatchStateOrLifetimeRequest(message)
}
function assertBoundedProtocolMessage(message) {
  if (++messages > 24 || JSON.stringify(message).length > 4096) throw new Error('Contender protocol cap')
}
process.on('message', message => {
  if (failed) return
  try {
    assertBoundedProtocolMessage(message)
    dispatchExactDatabaseRequest(message)
  } catch (error) {
    fail(error, message.id)
  }
})
