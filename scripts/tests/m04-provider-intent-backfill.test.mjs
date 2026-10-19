import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { verifiedDatabaseMigrations } from '../lib/migration-inventory.mjs'

// Apply real predecessor SQL to a released-schema fixture, then upgrade. These
// synthetic payload bytes are preservation witnesses, never proof of a send.
const workspace = mkdtempSync(path.join(os.tmpdir(), 'appraise-m04-upgrade-'))
const dbPath = path.join(workspace, 'upgrade.db')
let db = new DatabaseSync(dbPath)
const insert = (table, row) => {
  const keys = Object.keys(row)
  db.prepare(
    `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  ).run(...Object.values(row))
}
const now = '2026-10-19T00:00:00.000Z'
const tables = [
  'QualityJourney',
  'QualityJourneyWorkItem',
  'QualityJourneyWorkAuthorization',
  'QualityJourneyWorkAttempt',
  'QualityJourneyCoordinatorSession',
  'QualityJourneyWorkAttemptSessionBinding',
]
const snapshot = () => Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()]))
try {
  db.exec('PRAGMA foreign_keys=ON')
  const migrations = verifiedDatabaseMigrations(process.cwd())
  const cut = migrations.findIndex(m => m.name === '20261019020000_add_provider_dispatch_wake_intents')
  assert.equal(cut, 89)
  for (const m of migrations.slice(0, cut))
    db.exec(readFileSync(path.join('prisma/migrations', m.name, 'migration.sql'), 'utf8'))
  insert('TargetProject', {
    id: 'm04-upgrade-target',
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: 'path:/synthetic/m04',
    canonicalPath: '/synthetic/m04',
    displayName: 'Synthetic upgrade',
    fingerprint: 'sha256:fixture',
    createdAt: now,
    updatedAt: now,
    lastDetectedAt: now,
  })
  for (const [key, mode, status] of [
    ['legacy', 'MANAGED', 'IN_PROGRESS'],
    ['external', 'EXTERNAL_V1', 'IN_PROGRESS'],
    ['unknown', 'MANAGED', 'DISPATCH_UNRESOLVED'],
  ]) {
    insert('QualityJourney', {
      id: key,
      targetProjectId: 'm04-upgrade-target',
      rootIdempotencyKey: key,
      rootRequestHash: `raw-create:${key}`,
      activeCycleId: `cycle:${key}`,
      stateHash: `state:${key}`,
      hostingMode: 'EXTERNAL_LEGACY',
      hostingProvenance: 'CREATED_COMPATIBILITY_V1',
      updatedAt: now,
    })
    insert('QualityJourneyWorkItem', {
      id: `work:${key}`,
      journeyId: key,
      targetProjectId: 'm04-upgrade-target',
      cycleId: `cycle:${key}`,
      role: 'REQUIREMENT_ANALYZER',
      status: 'IN_PROGRESS',
      currentAttempt: 1,
      inputHash: `input:${key}`,
      roleContractDigest: 'role:fixture',
      updatedAt: now,
    })
    insert('QualityJourneyWorkAuthorization', {
      id: `auth:${key}`,
      journeyId: key,
      targetProjectId: 'm04-upgrade-target',
      workItemId: `work:${key}`,
      role: 'REQUIREMENT_ANALYZER',
      roleContractDigest: 'role:fixture',
      capabilityProfileId: 'profile',
      capabilityProfileHash: 'profile:hash',
      authorizationJson: `{ "original": "${key}" }`,
      authorizationHash: `hash:${key}`,
      maxAttempts: 3,
    })
    insert('QualityJourneyWorkAttempt', {
      id: `attempt:${key}`,
      workItemId: `work:${key}`,
      attempt: 1,
      status,
      leaseId: `lease:${key}`,
      ownerTokenHash: `owner:${key}`,
      executionMode: mode,
      leaseExpiresAt: now,
      heartbeatSeconds: 40,
      authorizationId: `auth:${key}`,
      assignmentJson: `{ "originalAssignment": "${key}" }`,
      assignmentHash: `assignment:${key}`,
      ...(key === 'unknown'
        ? { dispatchKey: 'legacy-unknown-key', dispatchReservedAt: now, dispatchStartedAt: now }
        : {}),
      ...(mode === 'EXTERNAL_V1'
        ? {
            externalPrincipalId: 'project:synthetic',
            externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
            externalAdmissionJson: '{ "oldAdmission": true }',
            externalAdmissionHash: 'old-admission-hash',
          }
        : {}),
    })
  }
  const before = snapshot()
  for (const m of migrations.slice(cut))
    db.exec(readFileSync(path.join('prisma/migrations', m.name, 'migration.sql'), 'utf8'))
  assert.deepEqual(snapshot(), before)
  for (const table of [
    'QualityJourneyProviderRun',
    'QualityJourneyProviderDispatchIntent',
    'QualityJourneyProviderObservation',
    'QualityJourneyProviderSlot',
    'QualityJourneyWakeIntent',
  ])
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n, 0)
  db.close()
  db = new DatabaseSync(dbPath)
  assert.deepEqual(snapshot(), before)
  assert.equal(
    db.prepare('SELECT status FROM QualityJourneyWorkAttempt WHERE id=?').get('attempt:unknown').status,
    'DISPATCH_UNRESOLVED',
  )
  console.log(
    JSON.stringify({
      outcome: 'PASS',
      predecessorMigrations: cut,
      newMigrations: migrations.length - cut,
      preservedJourneys: 3,
      preservedAttempts: 3,
      inventedProviderRows: 0,
      restartStable: true,
    }),
  )
} finally {
  db.close()
  rmSync(workspace, { recursive: true, force: true })
}
