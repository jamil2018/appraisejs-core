import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { verifiedDatabaseMigrations } from '../lib/migration-inventory.mjs'

// Exercise the supported inventory, every predecessor SQL migration, and the
// actual M03 migration against structurally scoped released-schema rows.
// Payload/hash placeholders are synthetic preservation witnesses; migration
// classification does not attest their semantic integrity or execute their work. No current-schema Prisma
// fixture can accidentally supply the fields whose backfill is under test.
const migrationName = '20261019010000_add_host_neutral_journey_sessions'
const workspace = mkdtempSync(path.join(os.tmpdir(), 'appraise-m03-backfill-'))
const databasePath = path.join(workspace, 'upgrade.db')
let db = new DatabaseSync(databasePath)
const all = sql =>
  db
    .prepare(sql)
    .all()
    .map(row => ({ ...row }))
const insert = (table, row) => {
  const keys = Object.keys(row)
  db.prepare(
    `INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  ).run(...Object.values(row))
}
const now = '2026-10-01T00:00:00.000Z'
try {
  const inventory = verifiedDatabaseMigrations(process.cwd())
  const position = inventory.findIndex(entry => entry.name === migrationName)
  assert.ok(position > 0, 'M03 must be in the normal verified migration inventory')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(`CREATE TABLE "_prisma_migrations" (
    id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME,
    migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
    started_at DATETIME NOT NULL DEFAULT current_timestamp, applied_steps_count INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`)
  const apply = entry => {
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(path.join('prisma/migrations', entry.name, 'migration.sql'), 'utf8'))
      insert('_prisma_migrations', {
        id: entry.name,
        checksum: entry.checksum,
        migration_name: entry.name,
        finished_at: now,
        started_at: now,
        applied_steps_count: 1,
      })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  for (const entry of inventory.slice(0, position)) apply(entry)
  insert('TargetProject', {
    id: 'legacy-target',
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: 'path:/tmp/m03-backfill',
    canonicalPath: '/tmp/m03-backfill',
    displayName: 'M03 migration fixture',
    fingerprint: 'sha256:target',
    createdAt: now,
    updatedAt: now,
    lastDetectedAt: now,
  })
  const journey = id =>
    insert('QualityJourney', {
      id,
      targetProjectId: 'legacy-target',
      rootIdempotencyKey: id,
      rootRequestHash: `original-create-hash:${id}`,
      activeCycleId: `cycle:${id}`,
      stateHash: `state:${id}`,
      updatedAt: now,
    })
  const externalAttemptFields = (id, principalId, executionMode) =>
    executionMode === 'EXTERNAL_V1'
      ? {
          externalPrincipalId: principalId,
          externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
          externalAdmissionJson: `{ "originalAdmission": "${id}" }`,
          externalAdmissionHash: `admission-hash:${id}`,
          externalAdmissionRequestJson: `{ "originalAdmissionRequest": "${id}" }`,
          externalAdmissionRequestHash: `admission-request-hash:${id}`,
        }
      : {}
  const attempt = (journeyId, suffix, executionMode, status, extra = {}) => {
    const id = `${journeyId}:${suffix}`
    const { fixtureRole = 'REQUIREMENT_ANALYZER', ...attemptExtra } = extra
    const externalPrincipalId = attemptExtra.externalPrincipalId ?? 'project:legacy'
    insert('QualityJourneyWorkItem', {
      id: `work:${id}`,
      journeyId,
      targetProjectId: 'legacy-target',
      cycleId: `cycle:${journeyId}`,
      role: fixtureRole,
      status: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'].includes(status) ? 'IN_PROGRESS' : 'COMPLETED',
      currentAttempt: 1,
      inputHash: `input-hash:${id}`,
      roleContractDigest: `role-hash:${id}`,
      updatedAt: now,
    })
    insert('QualityJourneyWorkAuthorization', {
      id: `auth:${id}`,
      journeyId,
      targetProjectId: 'legacy-target',
      workItemId: `work:${id}`,
      role: fixtureRole,
      roleContractDigest: `role-hash:${id}`,
      capabilityProfileId: 'legacy-profile',
      capabilityProfileHash: `profile-hash:${id}`,
      authorizationJson: `{ "originalAuthorization": "${id}" }`,
      authorizationHash: `auth-hash:${id}`,
      ...(executionMode === 'EXTERNAL_V1'
        ? { externalPrincipalId, externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY' }
        : {}),
    })
    insert('QualityJourneyWorkAttempt', {
      id,
      workItemId: `work:${id}`,
      attempt: 1,
      status,
      leaseId: `lease:${id}`,
      ownerTokenHash: `unchanged-owner-token:${id}`,
      executionMode,
      assignmentGeneration: 7,
      leaseExpiresAt: '2040-01-01T00:00:00.000Z',
      heartbeatSeconds: 20,
      authorizationId: `auth:${id}`,
      assignmentId: `assignment:${id}`,
      assignmentJson: `{ "originalAssignment": "${id}", "inputHash": "input-hash:${id}" }`,
      assignmentHash: `assignment-hash:${id}`,
      spawnRequestJson: `{ "originalRequest": "${id}" }`,
      spawnRequestHash: `request-hash:${id}`,
      resultJson: `{ "originalResult": "${id}" }`,
      resultHash: `result-hash:${id}`,
      ...externalAttemptFields(id, externalPrincipalId, executionMode),
      ...attemptExtra,
    })
    return id
  }
  const handoff = (journeyId, id, generation, status, takeoverAt, fencedAt = null) =>
    insert('QualityJourneyCoordinatorHandoff', {
      id,
      journeyId,
      targetProjectId: 'legacy-target',
      providerId: 'legacy-desktop',
      generation,
      status,
      takeoverAt,
      fencedAt,
      ticketHash: `ticket:${id}`,
      promptHash: `prompt:${id}`,
      expiresAt: '2040-01-01T00:00:00.000Z',
      updatedAt: now,
      takeoverRequestHash: `takeover-request:${id}`,
      takeoverResultJson: `{ "historical": "${id}" }`,
    })
  for (const id of [
    'empty',
    'factory',
    'external',
    'mixed-history',
    'unknown-dispatch',
    'unknown-status',
    'concurrent-factory',
    'conflicting-external-principals',
    'mixed-live-no-handoff',
    'historical-input',
    'missing-historical-input',
    'effective-handoff',
    'terminal-cycle-live-run',
    'malformed-browser-stop',
    'mismatched-browser-stop',
    'structural-browser-stop',
  ])
    journey(id)
  attempt('factory', 'active', 'MANAGED', 'IN_PROGRESS')
  attempt('external', 'active', 'EXTERNAL_V1', 'IN_PROGRESS')
  attempt('mixed-history', 'factory-terminal', 'MANAGED', 'COMPLETED')
  attempt('mixed-history', 'external-active', 'EXTERNAL_V1', 'IN_PROGRESS')
  attempt('unknown-status', 'unknown', 'MANAGED', 'UNKNOWN')
  attempt('unknown-dispatch', 'unknown', 'MANAGED', 'DISPATCH_UNRESOLVED', { dispatchReservedAt: now })
  attempt('concurrent-factory', 'scout', 'MANAGED', 'IN_PROGRESS', { fixtureRole: 'SCOUT' })
  attempt('concurrent-factory', 'resource-explorer', 'MANAGED', 'IN_PROGRESS', { fixtureRole: 'RESOURCE_EXPLORER' })
  attempt('conflicting-external-principals', 'one', 'EXTERNAL_V1', 'IN_PROGRESS')
  attempt('conflicting-external-principals', 'two', 'EXTERNAL_V1', 'IN_PROGRESS', {
    externalPrincipalId: 'project:foreign',
  })
  attempt('mixed-live-no-handoff', 'factory', 'MANAGED', 'IN_PROGRESS')
  attempt('mixed-live-no-handoff', 'external', 'EXTERNAL_V1', 'IN_PROGRESS')
  attempt('historical-input', 'older-terminal', 'MANAGED', 'COMPLETED', {
    assignmentJson: '{ "inputHash": "immutable-older-input" }',
  })
  attempt('missing-historical-input', 'terminal', 'MANAGED', 'COMPLETED', {
    assignmentJson: '{ "originalAssignment": "no-input-field" }',
  })
  attempt('effective-handoff', 'terminal', 'EXTERNAL_V1', 'COMPLETED')
  attempt('effective-handoff', 'scout', 'MANAGED', 'IN_PROGRESS', { fixtureRole: 'SCOUT' })
  attempt('effective-handoff', 'resource-explorer', 'MANAGED', 'IN_PROGRESS', { fixtureRole: 'RESOURCE_EXPLORER' })
  attempt('effective-handoff', 'external', 'EXTERNAL_V1', 'IN_PROGRESS')
  handoff('effective-handoff', 'historical-fenced', 2, 'CONNECTED', now, now)
  handoff('effective-handoff', 'effective-owner', 4, 'CONNECTED', now)
  handoff('effective-handoff', 'newer-prepared', 9, 'PREPARED', null)
  handoff('effective-handoff', 'newer-connected-no-takeover', 10, 'CONNECTED', null)
  insert('Environment', {
    id: 'backfill-environment',
    name: 'Backfill environment',
    baseUrl: 'http://127.0.0.1.invalid',
    targetProjectId: 'legacy-target',
    updatedAt: now,
  })
  insert('TestRun', {
    id: 'backfill-live-run',
    name: 'Structurally terminal cycle with live actual run',
    runId: 'backfill-live-run-id',
    status: 'RUNNING',
    environmentSnapshotJson: '{}',
    environmentSnapshotHash: 'synthetic:environment',
    environmentSnapshotVersion: 1,
    intent: 'QUALITY_JOURNEY',
    environmentId: 'backfill-environment',
    targetProjectId: 'legacy-target',
    updatedAt: now,
  })
  insert('QualityJourneyCycle', {
    id: 'cycle:terminal-cycle-live-run',
    journeyId: 'terminal-cycle-live-run',
    sequence: 1,
  })
  insert('QualityJourneyExecutionCycle', {
    id: 'backfill-terminal-cycle',
    journeyId: 'terminal-cycle-live-run',
    targetProjectId: 'legacy-target',
    cycleId: 'cycle:terminal-cycle-live-run',
    preparedCapsulesJson: '[{"preparedCapsuleId":"synthetic:prepared"}]',
    preparedCapsulesHash: 'synthetic:prepared',
    environmentId: 'backfill-environment',
    environmentSnapshotJson: '{}',
    environmentSnapshotHash: 'synthetic:environment',
    environmentSnapshotVersion: 1,
    targetFingerprint: 'synthetic:target',
    stateHash: 'synthetic:state',
    idempotencyKey: 'backfill-execution',
    requestHash: 'synthetic:execution',
    status: 'COMPLETED',
  })
  insert('QualityJourneyExecutionTestRun', {
    id: 'backfill-run-binding',
    executionCycleId: 'backfill-terminal-cycle',
    preparedCapsuleId: 'synthetic:prepared',
    testRunId: 'backfill-live-run',
    runId: 'backfill-live-run-id',
    status: 'COMPLETED',
  })
  for (const journeyId of ['malformed-browser-stop', 'mismatched-browser-stop', 'structural-browser-stop']) {
    const receipt = {
      schemaVersion: 'appraise.quality-journey-owned-browser-stop/v1',
      journeyId,
      targetProjectId: 'legacy-target',
      sessionId: `browser-session:${journeyId}`,
      processInstanceId: `process:${journeyId}`,
      generation: 1,
      status: 'STOP_OBSERVED',
      observation: 'RUNTIME_CLOSE_CONFIRMED',
    }
    insert('QualityJourneyOwnedBrowser', {
      id: `browser:${journeyId}`,
      journeyId,
      targetProjectId: 'legacy-target',
      sessionId: receipt.sessionId,
      processInstanceId: receipt.processInstanceId,
      status: 'STOP_OBSERVED',
      stopReceiptJson:
        journeyId === 'malformed-browser-stop'
          ? '{corrupt-json'
          : JSON.stringify({
              ...receipt,
              ...(journeyId === 'mismatched-browser-stop' ? { sessionId: 'foreign-browser-session' } : {}),
            }),
      // Structural SQL preservation witness only; runtime digest verification
      // remains mandatory before any explicit managed ownership transition.
      stopReceiptHash: `synthetic:unverified-content:${journeyId}`,
      updatedAt: now,
    })
  }
  const historical = () => ({
    attempts: all('SELECT * FROM QualityJourneyWorkAttempt ORDER BY id'),
    work: all('SELECT * FROM QualityJourneyWorkItem ORDER BY id'),
    authorizations: all('SELECT * FROM QualityJourneyWorkAuthorization ORDER BY id'),
    handoffs: all('SELECT * FROM QualityJourneyCoordinatorHandoff ORDER BY id'),
    creationHashes: all('SELECT id, rootRequestHash, stateHash, version, updatedAt FROM QualityJourney ORDER BY id'),
  })
  const before = historical()
  for (const entry of inventory.slice(position)) apply(entry)
  assert.deepEqual(
    historical(),
    before,
    'M03 must preserve every legacy attempt, authorization, manifest, receipt, handoff and lifecycle byte',
  )
  const rows = Object.fromEntries(all('SELECT * FROM QualityJourney ORDER BY id').map(row => [row.id, row]))
  for (const id of [
    'empty',
    'factory',
    'external',
    'mixed-history',
    'concurrent-factory',
    'historical-input',
    'missing-historical-input',
    'structural-browser-stop',
  ]) {
    assert.equal(rows[id].hostingMode, 'EXTERNAL_LEGACY', id)
    assert.equal(rows[id].currentCoordinatorSessionId, null, id)
    assert.equal(
      rows[id].hostingProvenance,
      ['empty', 'structural-browser-stop'].includes(id)
        ? 'M03_SQL_V1:EMPTY_NO_SESSION'
        : 'M03_SQL_V1:BOUNDED_NO_SESSION_LINEAGE',
      id,
    )
  }
  for (const id of [
    'unknown-dispatch',
    'unknown-status',
    'conflicting-external-principals',
    'mixed-live-no-handoff',
    'terminal-cycle-live-run',
    'malformed-browser-stop',
    'mismatched-browser-stop',
  ]) {
    assert.equal(rows[id].hostingMode, 'LEGACY_UNRESOLVED', id)
    assert.equal(rows[id].currentCoordinatorSessionId, null, id)
    assert.equal(rows[id].hostingProvenance, 'M03_SQL_V1:UNPROVEN_OR_CONFLICTING_OWNERSHIP', id)
  }
  assert.equal(rows['effective-handoff'].hostingMode, 'EXTERNAL_LEGACY')
  const sessions = all('SELECT * FROM QualityJourneyCoordinatorSession')
  assert.equal(sessions.length, 1, 'Prepared or connected tickets without takeover never become owners')
  assert.equal(rows['effective-handoff'].currentCoordinatorSessionId, sessions[0].id)
  assert.equal(sessions[0].legacyHandoffId, 'effective-owner')
  assert.equal(sessions[0].generation, 4)
  assert.equal(sessions[0].status, 'ACTIVE')
  const bindings = all('SELECT * FROM QualityJourneyWorkAttemptSessionBinding ORDER BY attemptId')
  assert.equal(bindings.length, before.attempts.length)
  for (const binding of bindings) {
    const old = before.attempts.find(row => row.id === binding.attemptId)
    const immutableInputHash = JSON.parse(old.assignmentJson).inputHash
    assert.equal(binding.assignmentGeneration, old.assignmentGeneration)
    assert.equal(binding.assignmentId, old.assignmentId)
    assert.equal(binding.authorizationId, old.authorizationId)
    assert.equal(binding.leaseId, old.leaseId)
    assert.equal(
      binding.inputHash,
      typeof immutableInputHash === 'string' ? immutableInputHash : 'UNRESOLVED_LEGACY_INPUT_HASH',
    )
    assert.equal(binding.sessionId, null, 'Historical attempt proximity must not fabricate a handoff association')
    assert.equal(binding.coordinatorGeneration, null)
    assert.equal(
      binding.provenance,
      rows[binding.journeyId].hostingMode === 'EXTERNAL_LEGACY' &&
        !rows[binding.journeyId].currentCoordinatorSessionId &&
        typeof immutableInputHash === 'string'
        ? 'M03_SQL_V1:BOUNDED_NO_SESSION_LINEAGE'
        : 'M03_SQL_V1:UNRESOLVED_LEGACY_ATTEMPT_LINEAGE',
    )
  }
  assert.deepEqual(all('PRAGMA foreign_key_check'), [])
  const durable = all('SELECT * FROM QualityJourney ORDER BY id')
  db.close()
  // A normal migration-runner restart sees the applied inventory and does not
  // rerun classification, mint another owner, or change preserved evidence.
  execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: 'pipe',
  })
  db = new DatabaseSync(databasePath)
  assert.deepEqual(all('SELECT * FROM QualityJourney ORDER BY id'), durable)
  assert.deepEqual(all('SELECT * FROM QualityJourneyCoordinatorSession'), sessions)
  assert.deepEqual(all('SELECT * FROM QualityJourneyWorkAttemptSessionBinding ORDER BY attemptId'), bindings)
  assert.deepEqual(historical(), before)
  assert.deepEqual(all('PRAGMA foreign_key_check'), [])
  console.log(
    JSON.stringify({
      passed: true,
      predecessorMigrations: position,
      classifiedJourneys: durable.length,
      historicalAttemptsPreserved: before.attempts.length,
      compatibilitySessions: sessions.length,
      restartStable: true,
    }),
  )
} finally {
  db.close()
  rmSync(workspace, { recursive: true, force: true })
}
