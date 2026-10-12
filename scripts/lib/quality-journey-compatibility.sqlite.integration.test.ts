import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { expect, it } from 'vitest'
import {
  admitExternalQualityJourneyWork,
  claimExternalQualityJourneyWork,
  createQualityJourney,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from '@/services/coordinator/quality-journey-service'
import { assertDatabaseCompatibility } from './database-compatibility.mjs'

type SqlValue = string | number | null
type SqlRow = Record<string, SqlValue>
class SqlDatabase {
  constructor(private readonly filename: string) {}

  exec(sql: string): void {
    execFileSync('sqlite3', [this.filename], {
      input: `PRAGMA foreign_keys=ON;\n${sql}`,
      encoding: 'utf8',
    })
  }

  prepare(sql: string) {
    const statement = (...values: SqlValue[]) => {
      let index = 0
      const bound = sql.replace(/\?/g, () => {
        if (index >= values.length) throw new Error('Missing synthetic SQLite fixture value')
        const value = values[index++]
        if (value === null) return 'NULL'
        if (typeof value === 'number') {
          if (!Number.isFinite(value)) throw new Error('Invalid synthetic SQLite fixture number')
          return String(value)
        }
        return `'${value.replaceAll("'", "''")}'`
      })
      if (index !== values.length) throw new Error('Unused synthetic SQLite fixture value')
      return bound
    }
    return {
      all: (...values: SqlValue[]): SqlRow[] => {
        const output = execFileSync('sqlite3', ['-json', this.filename], {
          input: `PRAGMA foreign_keys=ON;\n${statement(...values)}`,
          encoding: 'utf8',
        })
        return output.trim() ? (JSON.parse(output) as SqlRow[]) : []
      },
      get: (...values: SqlValue[]): SqlRow | undefined => this.prepare(sql).all(...values)[0],
      run: (...values: SqlValue[]): void => this.exec(statement(...values)),
    }
  }

  close(): void {
    // Each sqlite3 invocation owns and closes its connection.
  }
}

const migrationRoot = path.join(process.cwd(), 'prisma/migrations')
const firstC31Migration = '20261002010000_add_capsule_stop_receipt'
const hash = (letter: string) => `sha256:${letter.repeat(64)}`
const timestamp = '2026-09-30T12:00:00.000Z'
const compatibilityOptions = (filename: string) => ({
  cwd: process.cwd(),
  env: { DATABASE_URL: `file:${filename}` },
})

function insert(db: SqlDatabase, table: string, values: Record<string, SqlValue>) {
  const columns = Object.keys(values)
  const statement = `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`
  db.prepare(statement).run(...Object.values(values))
}

function snapshot(db: SqlDatabase) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name",
    )
    .all()
  return new Map(
    tables.map(({ name }) => {
      const table = String(name)
      const columnInfo = db.prepare(`PRAGMA table_info("${table}")`).all()
      const columns = columnInfo.map(row => String(row.name))
      return [
        table,
        {
          columnInfo,
          columns,
          rows: db
            .prepare(`SELECT ${columns.map(column => `"${column}"`).join(',')} FROM "${table}" ORDER BY rowid`)
            .all(),
        },
      ] as const
    }),
  )
}

async function recordAppliedMigration(db: SqlDatabase, name: string) {
  const sql = await readFile(path.join(migrationRoot, name, 'migration.sql'))
  db.exec(sql.toString('utf8'))
  insert(db, '_prisma_migrations', {
    id: randomUUID(),
    checksum: createHash('sha256').update(sql).digest('hex'),
    migration_name: name,
    started_at: timestamp,
    finished_at: timestamp,
    applied_steps_count: 1,
  })
}

function seedHistoricalRows(db: SqlDatabase) {
  // Synthetic stored-data fixture only. These rows are not live Journey qualification evidence.
  insert(db, 'TargetProject', {
    id: 'target',
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: 'path:/tmp/c32-synthetic',
    canonicalPath: '/tmp/c32-synthetic',
    displayName: 'Synthetic C3.2 target',
    fingerprint: hash('a'),
    updatedAt: timestamp,
  })
  for (const [id, status, cycle, revision] of [
    ['active', 'ACTIVE', 'active-cycle', 'active-revision'],
    ['interrupted', 'PAUSED', 'interrupted-cycle', 'interrupted-revision'],
  ]) {
    insert(db, 'QualityJourney', {
      id,
      targetProjectId: 'target',
      rootIdempotencyKey: `${id}-root`,
      rootRequestHash: hash('b'),
      status,
      activeCycleId: cycle,
      activeRevisionIdsJson: JSON.stringify({ journey: revision }),
      stateHash: hash('c'),
      updatedAt: timestamp,
    })
    insert(db, 'QualityJourneyRevision', {
      id: revision,
      journeyId: id,
      revision: 1,
      contentJson: '{"schemaVersion":"synthetic/v1"}',
      contentHash: hash('d'),
    })
    insert(db, 'QualityJourneyCycle', { id: cycle, journeyId: id, sequence: 1 })
  }
  insert(db, 'QualityJourneyEvent', {
    id: 'historical-interruption',
    journeyId: 'interrupted',
    targetProjectId: 'target',
    sequence: 1,
    eventType: 'OPERATIONAL_PAUSE',
    predecessorStateHash: hash('c'),
    successorStateHash: hash('c'),
    payloadJson: '{"reason":"synthetic interruption"}',
  })

  insert(db, 'QualityJourneyWorkItem', {
    id: 'external-work',
    journeyId: 'active',
    targetProjectId: 'target',
    cycleId: 'active-cycle',
    role: 'REQUIREMENT_ANALYZER',
    status: 'IN_PROGRESS',
    inputHash: hash('e'),
    roleContractDigest: hash('f'),
    currentAttempt: 1,
    updatedAt: timestamp,
  })
  insert(db, 'QualityJourneyWorkAuthorization', {
    id: 'external-authorization',
    journeyId: 'active',
    targetProjectId: 'target',
    workItemId: 'external-work',
    role: 'REQUIREMENT_ANALYZER',
    roleContractDigest: hash('f'),
    capabilityProfileId: 'synthetic-profile',
    capabilityProfileHash: hash('0'),
    authorizationJson: '{"synthetic":true}',
    authorizationHash: hash('1'),
    externalAdmissionProtocol: 'EXTERNAL_V1',
    externalPrincipalId: 'synthetic-principal',
    externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
  })
  insert(db, 'QualityJourneyWorkAttempt', {
    id: 'external-attempt',
    workItemId: 'external-work',
    attempt: 1,
    status: 'IN_PROGRESS',
    leaseId: 'synthetic-lease',
    ownerTokenHash: hash('2'),
    executionMode: 'EXTERNAL',
    externalPrincipalId: 'synthetic-principal',
    externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
    assignmentGeneration: 1,
    leaseExpiresAt: '2026-09-30T13:00:00.000Z',
    heartbeatSeconds: 30,
    authorizationId: 'external-authorization',
    assignmentId: 'synthetic-assignment',
    assignmentJson: '{"synthetic":true}',
    assignmentHash: hash('3'),
    externalAdmissionId: 'synthetic-admission',
    externalAdmissionJson: '{"synthetic":true}',
    externalAdmissionHash: hash('4'),
  })
  insert(db, 'QualityJourneyExternalWorkClaimReceipt', {
    id: 'external-claim',
    journeyId: 'active',
    targetProjectId: 'target',
    workItemId: 'external-work',
    attemptId: 'external-attempt',
    authorizationId: 'external-authorization',
    protocol: 'EXTERNAL_V1',
    role: 'REQUIREMENT_ANALYZER',
    principalId: 'synthetic-principal',
    principalAssurance: 'PROJECT_CREDENTIAL_ONLY',
    assignmentSecretVerifier: hash('5'),
    assignmentGeneration: 1,
    leaseId: 'synthetic-lease',
    leaseRequestSeconds: 30,
    idempotencyKey: 'claim-key',
    requestJson: '{}',
    requestHash: hash('6'),
    receiptJson: '{}',
    receiptHash: hash('7'),
  })

  insert(db, 'QualityJourneyArtifact', {
    id: 'analysis-artifact',
    identityKey: 'analysis-revision',
    journeyId: 'active',
    targetProjectId: 'target',
    cycleId: 'active-cycle',
    kind: 'ANALYSIS_CHARTER_REVISION',
    artifactId: 'analysis',
    revisionId: 'analysis-v1',
    contentHash: hash('8'),
    artifactJson: '{"sealed":"synthetic"}',
  })
  insert(db, 'QualityJourneyAnalysisRevision', {
    id: 'analysis-revision',
    journeyId: 'active',
    targetProjectId: 'target',
    cycleId: 'active-cycle',
    artifactRecordId: 'analysis-artifact',
    artifactId: 'analysis',
    artifactRevisionId: 'analysis-v1',
    revision: 1,
    contentHash: hash('8'),
    submissionIdempotencyKey: 'analysis-submit',
    submissionHash: hash('9'),
    submittedWorkItemId: 'external-work',
    submittedAttemptId: 'external-attempt',
    inputHash: hash('e'),
  })
  insert(db, 'QualityJourneyArtifact', {
    id: 'approval-artifact',
    identityKey: 'analysis-approval',
    journeyId: 'active',
    targetProjectId: 'target',
    cycleId: 'active-cycle',
    kind: 'ANALYSIS_APPROVAL',
    artifactId: 'approval',
    contentHash: hash('a'),
    artifactJson: '{"decision":"APPROVED"}',
  })
  insert(db, 'QualityJourneyAnalysisDecision', {
    id: 'analysis-approval',
    journeyId: 'active',
    analysisRevisionId: 'analysis-revision',
    artifactRecordId: 'approval-artifact',
    commandId: 'approval-command',
    contentHash: hash('8'),
    reviewHash: hash('b'),
    decision: 'APPROVED',
    actor: 'synthetic-human-review',
  })

  insert(db, 'Environment', {
    id: 'environment',
    name: 'Synthetic local environment',
    baseUrl: 'http://127.0.0.1.invalid',
    targetProjectId: 'target',
    updatedAt: timestamp,
  })
  insert(db, 'TestRun', {
    id: 'run',
    name: 'Synthetic sealed run',
    runId: 'run-id',
    status: 'COMPLETED',
    result: 'PASSED',
    intent: 'QUALITY_JOURNEY',
    environmentSnapshotJson: '{}',
    environmentSnapshotHash: hash('2'),
    environmentSnapshotVersion: 1,
    environmentId: 'environment',
    targetProjectId: 'target',
    updatedAt: timestamp,
  })
  insert(db, 'RuntimeCapsule', {
    id: 'capsule',
    targetProjectId: 'target',
    testRunId: 'run',
    validationHash: hash('c'),
    capsuleHash: hash('d'),
    manifestHash: hash('e'),
    manifestJson: '{}',
    storagePath: '/tmp/c32-synthetic-capsule',
    updatedAt: timestamp,
  })
  insert(db, 'RuntimeCapsuleExecutionAttempt', {
    id: 'capsule-attempt',
    testRunId: 'run',
    capsuleId: 'capsule',
    receiptHash: hash('f'),
    preflightResultJson: '{}',
    preflightResultHash: hash('0'),
    preflightCheckedAt: timestamp,
    state: 'COMPLETED',
    ownerToken: 'synthetic-owner',
    updatedAt: timestamp,
  })
  insert(db, 'QualityJourneyExecutionCycle', {
    id: 'execution-cycle',
    journeyId: 'active',
    targetProjectId: 'target',
    cycleId: 'active-cycle',
    preparedCapsulesJson: '[{"preparedCapsuleId":"capsule"}]',
    preparedCapsulesHash: hash('1'),
    environmentId: 'environment',
    environmentSnapshotJson: '{}',
    environmentSnapshotHash: hash('2'),
    environmentSnapshotVersion: 1,
    targetFingerprint: hash('a'),
    stateHash: hash('c'),
    idempotencyKey: 'execution-key',
    requestHash: hash('3'),
    status: 'COMPLETED',
  })
  insert(db, 'QualityJourneyExecutionTestRun', {
    id: 'execution-run',
    executionCycleId: 'execution-cycle',
    preparedCapsuleId: 'capsule',
    testRunId: 'run',
    runId: 'run-id',
    status: 'COMPLETED',
  })
  insert(db, 'QualityJourneyExecutionConsent', {
    id: 'consent',
    journeyId: 'active',
    targetProjectId: 'target',
    executionCycleId: 'execution-cycle',
    scopeJson: '{"run":"run"}',
    scopeHash: hash('4'),
    grantSource: 'APPRAISE_UI',
    status: 'USED',
    grantedAt: timestamp,
    usedAt: timestamp,
  })
  insert(db, 'QualityJourneyExecutionEvidenceReceipt', {
    id: 'sealed-evidence',
    executionCycleId: 'execution-cycle',
    testRunId: 'run',
    runtimeBytesHash: hash('5'),
    receiptHash: hash('6'),
    evidenceJson: '{"sealed":"synthetic"}',
  })
}

async function createPreChangeExternalAssignment(filename: string) {
  // The current canonical writer emits a real authority/hash lineage into the
  // pre-C3.1 schema; the resulting data remains a disposable synthetic fixture.
  const client = new PrismaClient({ datasources: { db: { url: `file:${filename}` } } })
  const assignmentSecret = 'u'.repeat(32)
  const principal = { principalId: 'synthetic-unexpired-principal', assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
  try {
    const created = await createQualityJourney(
      {
        targetProjectId: 'target',
        idempotencyKey: 'synthetic-unexpired-root',
        requirement: { objective: 'Verify stored unexpired external assignment upgrade.' },
      },
      client,
    )
    const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
      where: { id: created.journey.activeRevisionIds.journey },
    })
    const submitted = await submitDurableQualityJourneyCommand(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        commandId: 'synthetic-unexpired-submit',
        journeyId: created.journey.journeyId,
        targetProjectId: 'target',
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        expectedStateHash: created.journey.stateHash,
        idempotencyKey: 'synthetic-unexpired-submit',
        inputArtifactRefs: [],
        payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
      },
      client,
    )
    expect(submitted.outcome).toBe('COMMITTED')
    const claimed = await claimExternalQualityJourneyWork(
      {
        journeyId: created.journey.journeyId,
        targetProjectId: 'target',
        role: 'REQUIREMENT_ANALYZER',
        principal,
        assignmentSecret,
        idempotencyKey: 'synthetic-unexpired-claim',
        leaseSeconds: 900,
      },
      client,
    )
    expect(claimed.attempt.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now())
    return {
      journeyId: created.journey.journeyId,
      targetProjectId: 'target',
      role: 'REQUIREMENT_ANALYZER' as const,
      workItemId: claimed.workItem.id,
      attemptId: claimed.attempt.id,
      assignmentId: claimed.assignment.assignmentId,
      assignmentGeneration: claimed.assignmentGeneration,
      leaseId: claimed.attempt.leaseId,
      assignmentSecret,
      idempotencyKey: 'synthetic-post-upgrade-admit',
      principal,
    }
  } finally {
    await client.$disconnect()
  }
}

it('upgrades synthetic pre-C3.1 stored Journeys without rewriting linked authority', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-c32-compat-'))
  const filename = path.join(directory, 'compat.sqlite')
  let db: SqlDatabase | undefined
  let client: PrismaClient | undefined
  try {
    db = new SqlDatabase(filename)
    db.exec('PRAGMA foreign_keys=ON')
    db.exec(`CREATE TABLE "_prisma_migrations" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`)
    const migrations = (await readdir(migrationRoot)).filter(name => /^\d{14}_/.test(name)).sort()
    expect(migrations).toContain(firstC31Migration)
    for (const name of migrations.filter(name => name < firstC31Migration)) await recordAppliedMigration(db, name)
    seedHistoricalRows(db)
    const unexpired = await createPreChangeExternalAssignment(filename)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    const before = snapshot(db)
    const priorLedger = db.prepare('SELECT * FROM _prisma_migrations ORDER BY rowid').all()
    db.close()
    db = undefined
    const options = compatibilityOptions(filename)
    await expect(assertDatabaseCompatibility(options)).rejects.toThrow('Storage upgrade required')
    const startup = spawnSync(process.execPath, ['scripts/start-local.mjs', 'start'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${filename}` },
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(startup.error).toBeUndefined()
    expect(startup.status).toBe(1)
    expect(startup.stderr).toContain('Storage upgrade required')
    expect(await assertDatabaseCompatibility({ ...options, allowPending: true })).toEqual({
      status: 'UPGRADE_REQUIRED',
      pending: migrations.filter(name => name >= firstC31Migration).length,
    })
    const upgrade = spawnSync(process.execPath, ['scripts/migrate-compatible.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${filename}` },
      encoding: 'utf8',
      timeout: 60_000,
    })
    expect(upgrade.error).toBeUndefined()
    expect(upgrade.status, `${upgrade.stdout}\n${upgrade.stderr}`).toBe(0)
    expect(await assertDatabaseCompatibility(options)).toEqual({ status: 'COMPATIBLE', pending: 0 })
    db = new SqlDatabase(filename)
    db.exec('PRAGMA foreign_keys=ON')
    const upgradedLedger = db.prepare('SELECT * FROM _prisma_migrations ORDER BY rowid').all()
    expect(upgradedLedger.slice(0, priorLedger.length)).toEqual(priorLedger)
    expect(upgradedLedger.map(row => row.migration_name)).toEqual(migrations)
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    for (const [table, prior] of before) {
      const currentInfo = db.prepare(`PRAGMA table_info("${table}")`).all()
      const currentColumns = currentInfo.map(row => String(row.name))
      expect(currentColumns).toEqual(expect.arrayContaining(prior.columns))
      expect(currentInfo.filter(row => prior.columns.includes(String(row.name)))).toEqual(prior.columnInfo)
      expect(
        db
          .prepare(`SELECT ${prior.columns.map(column => `"${column}"`).join(',')} FROM "${table}" ORDER BY rowid`)
          .all(),
      ).toEqual(prior.rows)
    }
    expect(
      db
        .prepare(
          'SELECT stopReceiptJson,stopReceiptHash,outputCompletedAt FROM RuntimeCapsuleExecutionAttempt WHERE id=?',
        )
        .get('capsule-attempt'),
    ).toEqual({ stopReceiptJson: null, stopReceiptHash: null, outputCompletedAt: null })
    expect(
      db
        .prepare('PRAGMA table_info("RuntimeCapsuleExecutionAttempt")')
        .all()
        .filter(row => ['stopReceiptJson', 'stopReceiptHash', 'outputCompletedAt'].includes(String(row.name)))
        .map(row => ({ name: row.name, notnull: row.notnull, dflt_value: row.dflt_value })),
    ).toEqual([
      { name: 'stopReceiptJson', notnull: 0, dflt_value: null },
      { name: 'stopReceiptHash', notnull: 0, dflt_value: null },
      { name: 'outputCompletedAt', notnull: 0, dflt_value: null },
    ])
    expect(db.prepare('SELECT * FROM QualityJourneyOwnedBrowser').all()).toEqual([])
    db.close()
    db = undefined

    client = new PrismaClient({ datasources: { db: { url: `file:${filename}` } } })
    const active = await getQualityJourney({ journeyId: 'active', targetProjectId: 'target' }, client)
    const interrupted = await getQualityJourney({ journeyId: 'interrupted', targetProjectId: 'target' }, client)
    expect(active.journey).toMatchObject({ journeyId: 'active', status: 'ACTIVE', stateHash: hash('c') })
    expect(interrupted.journey).toMatchObject({ journeyId: 'interrupted', status: 'PAUSED', stateHash: hash('c') })
    expect(
      await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: 'external-attempt' } }),
    ).toMatchObject({ assignmentId: 'synthetic-assignment', leaseId: 'synthetic-lease', status: 'IN_PROGRESS' })
    expect(
      await client.qualityJourneyExecutionEvidenceReceipt.findUniqueOrThrow({ where: { id: 'sealed-evidence' } }),
    ).toMatchObject({ runtimeBytesHash: hash('5'), receiptHash: hash('6') })
    expect(await client.qualityJourneyOwnedBrowser.count()).toBe(0)
    expect(await client.qualityJourneyWorkAttempt.count()).toBe(2)
    expect(await client.qualityJourneyWorkAuthorization.count()).toBe(2)
    expect(await client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(2)
    await client.$disconnect()
    client = undefined

    const bytesAfterUpgrade = await readFile(filename)
    const rowsAfterUpgrade = snapshot(new SqlDatabase(filename))
    const isolatedBin = path.join(directory, 'bin')
    await mkdir(isolatedBin)
    await writeFile(
      path.join(isolatedBin, 'codex'),
      '#!/bin/sh\nif [ "$1" = plugin ] && [ "$2" = list ] && [ "$3" = --marketplace ] && [ "$4" = appraise-local ] && [ "$5" = --json ] && [ "$#" -eq 5 ]; then\n  printf \'{"installed":[]}\\n\'\nelse\n  exit 76\nfi\n',
      { mode: 0o755 },
    )
    for (const [args, access] of [
      [['agent', 'disconnect'], 'disabled'],
      [['agent', 'plugin', 'uninstall'], 'disabled'],
      [['agent', 'reconnect'], 'enabled'],
    ] as const) {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'packages/appraisejs/src/cli.ts', ...args, '--cwd', directory, '--json'],
        {
          cwd: process.cwd(),
          env: { ...process.env, PATH: `${isolatedBin}${path.delimiter}${process.env.PATH ?? ''}` },
          encoding: 'utf8',
          timeout: 15_000,
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(result.stdout).not.toMatch(/Bearer |"token"/)
      const output = JSON.parse(result.stdout) as Record<string, unknown>
      if (args[1] === 'plugin') {
        expect(output).toMatchObject({ action: 'uninstall', localAccessDisabled: true, successful: true })
        expect(output.checks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'plugin', status: 'ok' })]))
      } else expect(output.localAccess).toBe(access)
      expect(await readFile(filename)).toEqual(bytesAfterUpgrade)
      expect(snapshot(new SqlDatabase(filename))).toEqual(rowsAfterUpgrade)
    }

    client = new PrismaClient({ datasources: { db: { url: `file:${filename}` } } })
    const originalAttempt = await client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: unexpired.attemptId },
    })
    const expiredAttempt = await client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: 'external-attempt' },
    })
    expect(originalAttempt.status).toBe('WORKER_REQUESTED')
    expect(originalAttempt.leaseExpiresAt.getTime()).toBeGreaterThan(Date.now())
    const beforeRejectedAdmissions = snapshot(new SqlDatabase(filename))
    await expect(
      admitExternalQualityJourneyWork(
        { ...unexpired, principal: { ...unexpired.principal, principalId: 'wrong-principal' } },
        client,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      admitExternalQualityJourneyWork({ ...unexpired, assignmentSecret: 'x'.repeat(32) }, client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      admitExternalQualityJourneyWork({ ...unexpired, leaseId: 'stale-owner-lease' }, client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      admitExternalQualityJourneyWork({ ...unexpired, assignmentGeneration: 0 }, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(snapshot(new SqlDatabase(filename))).toEqual(beforeRejectedAdmissions)

    const admitted = await admitExternalQualityJourneyWork(unexpired, client)
    expect(admitted).toMatchObject({
      replayed: false,
      receipt: {
        attemptId: unexpired.attemptId,
        workItemId: unexpired.workItemId,
        assignmentId: unexpired.assignmentId,
        assignmentGeneration: unexpired.assignmentGeneration,
        leaseId: unexpired.leaseId,
        principal: unexpired.principal,
      },
    })
    expect(await admitExternalQualityJourneyWork(unexpired, client)).toMatchObject({ replayed: true })
    expect(
      await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: unexpired.attemptId } }),
    ).toMatchObject({
      id: originalAttempt.id,
      status: 'IN_PROGRESS',
      assignmentId: originalAttempt.assignmentId,
      assignmentGeneration: originalAttempt.assignmentGeneration,
      leaseId: originalAttempt.leaseId,
      leaseExpiresAt: originalAttempt.leaseExpiresAt,
      ownerTokenHash: originalAttempt.ownerTokenHash,
      authorizationId: originalAttempt.authorizationId,
    })
    expect(await client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: 'external-attempt' } })).toEqual(
      expiredAttempt,
    )
    expect(await client.qualityJourneyWorkAttempt.count()).toBe(2)
    expect(await client.qualityJourneyExternalWorkClaimReceipt.count()).toBe(2)
    expect(await client.qualityJourneyOwnedBrowser.count()).toBe(0)
  } finally {
    await client?.$disconnect()
    db?.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 90_000)
