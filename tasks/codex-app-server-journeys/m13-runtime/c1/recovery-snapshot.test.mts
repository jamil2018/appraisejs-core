import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdirSync,
  mkdtempSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  copyFileSync,
  readdirSync,
  renameSync,
  appendFileSync,
  realpathSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import {
  recoveryEvidenceRoot,
  recoveryBindingSchema,
  recoveryDigest,
  recoveryFileIdentity,
  assertRecoverySnapshot,
  recoveryLauncherFingerprint,
} from './recovery-read-binding.mts'
import { sealRecoverySnapshot, readRecoverySnapshotFresh, recoverySourceFingerprint } from './recovery-snapshot.mts'
import { createOriginalRecoveryReaderFlight, finalizeOriginalRecoveryReader } from './recovery-reader-flight.mts'

mkdirSync(recoveryEvidenceRoot, { recursive: true, mode: 0o700 })
const runRoot = mkdtempSync(path.join(recoveryEvidenceRoot, 'offline-proof-'))
chmodSync(runRoot, 0o700)
const database = path.join(runRoot, 'fixture.sqlite')
execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: `file:${database}` },
  stdio: 'pipe',
})

const templateDatabase = path.join(recoveryEvidenceRoot, `${path.basename(runRoot)}-template.sqlite`)
copyFileSync(database, templateDatabase)
process.env.DATABASE_URL = `file:${database}`
const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })
;(globalThis as typeof globalThis & { prisma?: unknown }).prisma = client
const { createTargetProjectFixture } = await import('../../../../src/test/migrated-test-database')
const { addManagedProviderAssignment } = await import('../../../../src/test/quality-journey-provider-fixture')
const { prepareQualityJourneyProviderRun, claimQualityJourneyProviderIntent, armQualityJourneyProviderIntent } =
  await import('../../../../src/services/coordinator/quality-journey-provider-run-service')
const { getQualityJourney } = await import('../../../../src/services/coordinator/quality-journey-service')
const { pauseQualityJourneyOperational } =
  await import('../../../../src/services/coordinator/quality-journey-recovery-service')
const { submitExternalQualityJourneyAnalysisSuccessor } =
  await import('../../../../src/services/coordinator/quality-journey-analysis-service')

test('FULL canonical APIs and pure guards read a new paused sealed snapshot in a fresh credential-free Node process', async () => {
  await createTargetProjectFixture(client, {
    id: 'm13-recovery-offline',
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${runRoot}`,
    canonicalPath: runRoot,
    displayName: 'Offline recovery proof',
    fingerprint: `sha256:${'a'.repeat(64)}`,
  })
  const f = await addManagedProviderAssignment(client, 'm13-recovery-offline', `offline-${path.basename(runRoot)}`, 900)
  const prepared = await prepareQualityJourneyProviderRun(f.prepareInput, client)
  const request = { ...f.binding, intentId: prepared.intent.id, claimOwner: 'offline-inert-supervisor' }
  const claim = await claimQualityJourneyProviderIntent(request, client)
  await armQualityJourneyProviderIntent({ ...request, claimEpoch: claim.intent.claimEpoch }, client)
  // Synthetic armed uncertainty is deliberately retained. No permit is consumed, child launched or RPC sent.
  const analysis = await submitExternalQualityJourneyAnalysisSuccessor(
    {
      ...f.scope,
      workItemId: f.binding.workItemId,
      attemptId: f.binding.attemptId,
      assignmentId: f.binding.assignmentId,
      assignmentGeneration: f.binding.assignmentGeneration,
      assignmentSecret: f.binding.assignmentSecret,
      leaseId: f.binding.leaseId,
      idempotencyKey: 'offline-r3-accepted-analysis',
      charter: {
        schemaVersion: 'appraise.quality-journey/v1',
        charterId: 'offline-recovery-charter',
        analysisRevisionId: 'offline-recovery-analysis',
        ...f.scope,
        cycleId: f.created.journey.activeCycleId,
        requirementRevisionId: f.created.journey.activeRevisionIds.journey,
        objectives: ['Offline recovery proof'],
        scope: { included: ['Fixture'], excluded: [] },
        actors: ['Tester'],
        requirements: [{ requirementId: 'REQ-OFFLINE', statement: 'Read a closed snapshot.', sourceRefs: ['brief:1'] }],
        obligations: [
          {
            obligationId: 'OBL-OFFLINE',
            requirementId: 'REQ-OFFLINE',
            statement: 'Canonical snapshot remains immutable.',
            acceptanceSignals: ['PAUSED'],
          },
        ],
        constraints: [],
        assumptions: [],
        risks: [],
        acceptanceSignals: ['PAUSED'],
        retiredRequirementIds: [],
        questions: [],
        resolvedQuestionAnswerIds: [],
      },
    },
    f.principal,
    client,
    f.credentials,
  )
  const before = (await getQualityJourney(f.scope, client)).journey
  await assert.rejects(
    pauseQualityJourneyOperational(
      {
        ...f.scope,
        expectedVersion: before.version,
        expectedStateHash: `sha256:${'0'.repeat(64)}`,
        idempotencyKey: 'stale-pause',
        reason: 'SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R3',
      },
      client,
    ),
  )
  await assert.rejects(
    pauseQualityJourneyOperational(
      {
        ...f.scope,
        expectedVersion: before.version - 1,
        expectedStateHash: before.stateHash,
        idempotencyKey: 'stale-version-pause',
        reason: 'SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R3',
      },
      client,
    ),
  )
  const pause = await pauseQualityJourneyOperational(
    {
      ...f.scope,
      expectedVersion: before.version,
      expectedStateHash: before.stateHash,
      idempotencyKey: 'offline-canonical-pause',
      reason: 'SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R3',
    },
    client,
  )
  assert.equal(pause.operationalStatus, 'PAUSED')
  assert.equal(pause.cleanup.managedTurn, 'UNKNOWN')
  const actions: string[] = []
  const { binding, sourceWitness } = await sealRecoverySnapshot({
    binding: {
      version: 'M13_SENDER_FREE_RECOVERY_READ_V1',
      actor: 'BOUND_DISPOSABLE_PROJECT_READER',
      caseKind: 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS',
      ...f.scope,
      expectedVersion: pause.version,
      expectedStateHash: pause.stateHash,
      pauseEventId: pause.eventId,
      attemptId: f.binding.attemptId,
      expectedArtifact: {
        kind: 'ANALYSIS_REVISION',
        id: analysis.analysisRevision.id,
        contentHash: analysis.analysisRevision.contentHash,
      },
    },
    originalDatabasePath: database,
    evidenceRoot: recoveryEvidenceRoot,
    originalOwner: {
      async provePausedAndCleaned() {
        assert.equal((await getQualityJourney(f.scope, client)).journey.status, 'PAUSED')
        actions.push('canonical-pause-observed')
      },
      async closeOtherOriginalWriters() {
        actions.push('other-writers-closed')
      },
      async checkpointOriginalAndDisconnect() {
        const rows = await client.$queryRawUnsafe<Array<{ busy: number; log: number; checkpointed: number }>>(
          'PRAGMA wal_checkpoint(TRUNCATE)',
        )
        assert.equal(Number(rows[0].busy), 0)
        await client.$disconnect()
        actions.push('checkpointed-disconnected')
        return { busy: 0, activeTransactions: 0, disconnected: true }
      },
    },
  })
  assert.deepEqual(actions, ['canonical-pause-observed', 'other-writers-closed', 'checkpointed-disconnected'])
  const read = (input: unknown) => readRecoverySnapshotFresh(input, sourceWitness)
  const sourceBefore = recoveryFileIdentity(database)
  const sourceFingerprintBefore = recoverySourceFingerprint(database).fingerprint
  process.env.M13_FORBIDDEN_SENDER_SENTINEL = 'OFFLINE_SYNTHETIC_MUST_NOT_BE_INHERITED'
  let observation: Record<string, unknown>
  try {
    observation = await read(binding)
  } finally {
    delete process.env.M13_FORBIDDEN_SENDER_SENTINEL
  }
  assert.equal(observation.processBoundary, 'FRESH_NODE_PROCESS')
  assert.equal(observation.artifact, 'MATCHED')
  assert.equal(observation.providerEffects, 'UNRESOLVED')
  assert.equal(observation.replacementGuard, 'REFUSED')
  assert.equal(observation.transferGuard, 'REFUSED')
  assert.equal(observation.hostingCleanupGuard, 'REFUSED')
  assert.equal(observation.credentialsRestored, false)
  assert.equal(observation.mutationResumeInvoked, false)
  assert.equal(observation.snapshotIntegrityUnchanged, true)
  assert.deepEqual(recoveryFileIdentity(database), sourceBefore)
  const sacrificial = mkdtempSync(path.join(recoveryEvidenceRoot, 'write-probe-'))
  const probeDirectory = path.join(sacrificial, 'snapshot')
  mkdirSync(probeDirectory, { mode: 0o700 })
  const probeDatabase = path.join(probeDirectory, 'database.sqlite')
  copyFileSync(binding.snapshot.copyPath, probeDatabase)
  chmodSync(probeDatabase, 0o444)
  chmodSync(probeDirectory, 0o555)
  const probeBefore = recoveryFileIdentity(probeDatabase)
  const probeCode = `
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(path.join(process.cwd(), 'package.json'))});
    const { PrismaClient } = require('@prisma/client');
    const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    let outcome = 'WRITE_UNEXPECTEDLY_SUCCEEDED';
    try { await client.$executeRawUnsafe('UPDATE QualityJourney SET status = status'); }
    catch (error) { outcome = error?.code === 'P2010' ? 'WRITE_REFUSED_P2010' : 'UNEXPECTED_REFUSAL'; }
    await client.$disconnect(); console.log(JSON.stringify({ outcome }));
  `
  const probe = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', probeCode], {
      cwd: sacrificial,
      env: { DATABASE_URL: `file:${probeDatabase}`, HOME: sacrificial, NODE_ENV: 'test' },
      encoding: 'utf8',
    }),
  )
  assert.equal(probe.outcome, 'WRITE_REFUSED_P2010')
  assert.deepEqual(recoveryFileIdentity(probeDatabase), probeBefore)
  assert.deepEqual(readdirSync(probeDirectory), ['database.sqlite'])
  writeFileSync(
    path.join(sacrificial, 'proof.json'),
    JSON.stringify(
      {
        probe,
        before: probeBefore,
        after: recoveryFileIdentity(probeDatabase),
        directoryEntries: readdirSync(probeDirectory),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )

  for (const [key, value] of Object.entries({
    journeyId: 'wrong',
    targetProjectId: 'wrong',
    expectedVersion: pause.version + 1,
    expectedStateHash: `sha256:${'f'.repeat(64)}`,
    pauseEventId: 'wrong',
    attemptId: 'wrong',
  })) {
    await assert.rejects(read({ ...binding, [key]: value }), 'fresh scope mismatch must refuse')
  }
  assert.equal(
    (
      await read({
        ...binding,
        expectedArtifact: { ...binding.expectedArtifact, contentHash: `sha256:${'f'.repeat(64)}` },
      })
    ).artifact,
    'MISMATCH',
  )
  assert.equal(
    (await read({ ...binding, expectedArtifact: { ...binding.expectedArtifact, id: 'missing' } })).artifact,
    'MISSING',
  )
  assert.equal(
    (
      await read({
        ...binding,
        caseKind: 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION',
        expectedArtifact: undefined,
      })
    ).artifact,
    'NOT_REQUESTED',
  )
  for (const key of [
    'assignmentSecret',
    'coordinatorSessionId',
    'credentialSource',
    'grant',
    'permit',
    'pid',
    'sourceCustody',
    'childHandle',
  ])
    assert.equal(recoveryBindingSchema.safeParse({ ...binding, [key]: 'forbidden' }).success, false)
  assert.equal(recoveryBindingSchema.safeParse({ ...binding, caseKind: 'R2_LOST_NATIVE_START_ACK' }).success, false)
  assert.equal(recoveryBindingSchema.safeParse({ ...binding, actor: 'SCRIPTED_DISPOSABLE_TEST_HUMAN' }).success, false)
  for (const [key, value] of Object.entries({
    expectedFileMode: '0644',
    expectedDirectoryMode: '0755',
    expectedSidecars: 'WAL',
    credentialPath: '/forbidden',
  }))
    assert.equal(
      recoveryBindingSchema.safeParse({ ...binding, snapshot: { ...binding.snapshot, [key]: value } }).success,
      false,
    )
  for (const key of ['copySha256', 'sourceSha256', 'sourceDatabaseIdentityDigest', 'provenanceDigest'])
    assert.throws(() =>
      assertRecoverySnapshot({ ...binding, snapshot: { ...binding.snapshot, [key]: `sha256:${'0'.repeat(64)}` } }),
    )
  assert.throws(() => assertRecoverySnapshot({ ...binding, snapshot: { ...binding.snapshot, copyPath: database } }))
  assert.equal(recoverySourceFingerprint(database).fingerprint, sourceFingerprintBefore)
  writeFileSync(
    path.join(recoveryEvidenceRoot, `${path.basename(runRoot)}-proof.json`),
    JSON.stringify(
      {
        binding,
        observation,
        sourceBefore,
        sourceAfter: recoveryFileIdentity(database),
        sourceFingerprintBefore,
        sourceFingerprintAfter: recoverySourceFingerprint(database).fingerprint,
        actions,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  )

  const link = path.join(runRoot, 'linked.sqlite')
  symlinkSync(binding.snapshot.copyPath, link)
  assert.throws(() => assertRecoverySnapshot({ ...binding, snapshot: { ...binding.snapshot, copyPath: link } }))
  chmodSync(binding.snapshot.copyPath, 0o644)
  assert.throws(() => assertRecoverySnapshot(binding))
  // This is owner-side test teardown of a sacrificial proof, never a reader repair or qualification retry.
  chmodSync(binding.snapshot.copyPath, 0o444)
  assert.equal(recoveryDigest(readFileSync(binding.snapshot.copyPath)), binding.snapshot.copySha256)
})

async function newPausedSourceWitnessFixture() {
  const sourceRoot = mkdtempSync(path.join(recoveryEvidenceRoot, 'v3-source-drift-'))
  const databasePath = path.join(sourceRoot, 'fixture.sqlite')
  copyFileSync(templateDatabase, databasePath)
  const original = new PrismaClient({ datasourceUrl: `file:${databasePath}` })
  const targetProjectId = 'offline-source-witness'
  await createTargetProjectFixture(original, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${sourceRoot}`,
    canonicalPath: sourceRoot,
    displayName: 'Disposable source witness regression',
    fingerprint: `sha256:${'a'.repeat(64)}`,
  })
  const f = await addManagedProviderAssignment(original, targetProjectId, `v3-${path.basename(sourceRoot)}`, 900)
  const current = (await getQualityJourney(f.scope, original)).journey
  const pause = await pauseQualityJourneyOperational(
    {
      ...f.scope,
      expectedVersion: current.version,
      expectedStateHash: current.stateHash,
      idempotencyKey: 'v3-source-witness-pause',
      reason: 'SCRIPTED_DISPOSABLE_TEST_HUMAN:M13_R1',
    },
    original,
  )
  assert.equal(pause.operationalStatus, 'PAUSED')
  const modes = await original.$queryRawUnsafe<Array<{ journal_mode: string }>>('PRAGMA journal_mode')
  assert.equal(modes[0].journal_mode.toLowerCase(), 'delete')
  const sealed = await sealRecoverySnapshot({
    binding: {
      version: 'M13_SENDER_FREE_RECOVERY_READ_V1',
      actor: 'BOUND_DISPOSABLE_PROJECT_READER',
      caseKind: 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION',
      ...f.scope,
      expectedVersion: pause.version,
      expectedStateHash: pause.stateHash,
      pauseEventId: pause.eventId,
      attemptId: f.binding.attemptId,
    },
    originalDatabasePath: databasePath,
    evidenceRoot: recoveryEvidenceRoot,
    originalOwner: {
      async provePausedAndCleaned() {
        assert.equal((await getQualityJourney(f.scope, original)).journey.status, 'PAUSED')
      },
      async closeOtherOriginalWriters() {},
      async checkpointOriginalAndDisconnect() {
        const rows = await original.$queryRawUnsafe<Array<{ busy: number | bigint }>>('PRAGMA wal_checkpoint(TRUNCATE)')
        assert.equal(Number(rows[0].busy), 0)
        await original.$disconnect()
        return { busy: 0, activeTransactions: 0, disconnected: true }
      },
    },
  })
  return { ...sealed, sourceRoot, databasePath }
}

test('private parent source witness detects replacement, content, sidecar, and directory drift after success AND wrong-scope refusal', async context => {
  const records: unknown[] = []
  for (const outcome of ['SUCCESS', 'WRONG_SCOPE_REFUSAL'] as const)
    for (const drift of ['REPLACEMENT', 'CONTENT', 'SIDECAR', 'DIRECTORY'] as const) {
      await context.test(`${outcome}:${drift}`, async () => {
        const f = await newPausedSourceWitnessFixture()
        assert.equal(JSON.stringify(f.sourceWitness), '{}')
        assert.equal(JSON.stringify(f.binding).includes(f.databasePath), false)
        const copyBefore = assertRecoverySnapshot(f.binding).fingerprint
        const sourceBefore = recoverySourceFingerprint(f.databasePath).fingerprint
        const input = outcome === 'SUCCESS' ? f.binding : { ...f.binding, journeyId: 'wrong-scope-v3' }
        let closed = 0
        await assert.rejects(
          readRecoverySnapshotFresh(input, f.sourceWitness, 30_000, {
            classification: 'OFFLINE_SYNTHETIC_FIXTURE_ONLY',
            observe(closure) {
              assert.equal(closure.exitObserved, true)
              assert.equal(closure.closeObserved, true)
              assert.equal(closure.code, outcome === 'SUCCESS' ? 0 : 1)
              closed++
              if (drift === 'REPLACEMENT') {
                copyFileSync(f.databasePath, `${f.databasePath}.replacement`)
                renameSync(`${f.databasePath}.replacement`, f.databasePath)
              } else if (drift === 'CONTENT') appendFileSync(f.databasePath, '\nOFFLINE_SOURCE_DRIFT_ONLY\n')
              else if (drift === 'SIDECAR')
                writeFileSync(`${f.databasePath}-wal`, 'OFFLINE_INVALID_SIDECAR_NOT_WAL_SUPPORT')
              else chmodSync(f.sourceRoot, 0o755)
            },
          }),
          /final source\/snapshot\/launcher integrity refused/,
        )
        assert.equal(closed, 1)
        assert.equal(assertRecoverySnapshot(f.binding).fingerprint, copyBefore)
        const readerEntriesBefore = readdirSync(recoveryEvidenceRoot)
          .filter(name => name.startsWith('reader-'))
          .sort()
        await assert.rejects(readRecoverySnapshotFresh(input, f.sourceWitness), /source|sidecar/)
        assert.deepEqual(
          readdirSync(recoveryEvidenceRoot)
            .filter(name => name.startsWith('reader-'))
            .sort(),
          readerEntriesBefore,
        )
        records.push({
          outcome,
          drift,
          sourceBefore,
          originalExitAndCloseObserved: true,
          sourceDriftRefused: true,
          copyIntegrityUnchanged: true,
          subsequentReadRefusedBeforeSpawn: true,
          journalMode: 'DELETE_ONLY',
          failedSourcePreserved: true,
        })
      })
    }
  writeFileSync(
    path.join(recoveryEvidenceRoot, `${path.basename(runRoot)}-v3-source-witness-proof.json`),
    JSON.stringify({ version: 'M13_V3_PARENT_SOURCE_WITNESS_PROOF', records, nativeRuntimeQualified: false }, null, 2),
    { flag: 'wx', mode: 0o600 },
  )
})

test('test-only sentinels observe zero environment/default-database/credential/network/native effects on the reviewed canonical reader path', async () => {
  const fixture = await newPausedSourceWitnessFixture()
  const directory = path.join(recoveryEvidenceRoot, `reader-${randomUUID()}`),
    home = path.join(directory, 'home')
  mkdirSync(directory, { mode: 0o700 })
  mkdirSync(home, { mode: 0o700 })
  const input = path.join(directory, 'binding.json'),
    bytes = JSON.stringify(fixture.binding)
  writeFileSync(input, bytes, { flag: 'wx', mode: 0o400 })
  const sourceBefore = recoverySourceFingerprint(fixture.databasePath).fingerprint
  const copyBefore = assertRecoverySnapshot(fixture.binding).fingerprint
  const taskRoot = path.join(process.cwd(), 'tasks/codex-app-server-journeys/m13-runtime/c1')
  const child = spawn(
    process.execPath,
    [
      '--import',
      path.join(taskRoot, 'recovery-reader-test-sentinel.mjs'),
      '--import',
      realpathSync(path.join(process.cwd(), 'node_modules/tsx/dist/loader.mjs')),
      path.join(taskRoot, 'recovery-reader.mts'),
      input,
      recoveryDigest(bytes),
      recoveryLauncherFingerprint(),
    ],
    {
      cwd: directory,
      env: {
        HOME: home,
        NODE_ENV: 'test',
        DATABASE_URL: `file:${fixture.binding.snapshot.copyPath}`,
        TSX_DISABLE_CACHE: '1',
        TSX_TSCONFIG_PATH: path.join(process.cwd(), 'tsconfig.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const flight = createOriginalRecoveryReaderFlight(child, 30_000)
  const chunks: Buffer[] = []
  let outputBytes = 0,
    stderr = false
  child.stdout.on('data', (chunk: Buffer) => {
    outputBytes += chunk.length
    if (outputBytes <= 16_384) chunks.push(chunk)
    else flight.requestOriginalStop()
  })
  child.stderr.on('data', () => {
    stderr = true
  })
  const result = await finalizeOriginalRecoveryReader(flight, closure => {
    assert.equal(closure.code, 0)
    assert.equal(closure.stopRequested, false)
    assert.equal(stderr, false)
    assert.equal(recoverySourceFingerprint(fixture.databasePath).fingerprint, sourceBefore)
    assert.equal(assertRecoverySnapshot(fixture.binding).fingerprint, copyBefore)
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  })
  assert.equal('outcome' in result, false)
  const report = JSON.parse(
    readFileSync(path.join(recoveryEvidenceRoot, `${path.basename(directory)}-test-sentinel.json`), 'utf8'),
  )
  assert.deepEqual(report, {
    injectedBeforeCanonicalImport: true,
    dotenv: 0,
    credentials: 0,
    otherDatabase: 0,
    canonicalFileWrites: 0,
    canonicalNetwork: 0,
    canonicalNative: 0,
  })
})
