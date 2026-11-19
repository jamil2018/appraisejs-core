import { createHash } from 'node:crypto'
import { lstatSync, realpathSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

/** Read-only binding and integrity checks, shared directly by the closed reader and its original host. */
const sha = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const id = z.string().min(1).max(200)
export const recoveryCaseSchema = z.enum([
  'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION',
  'R2_NATIVE_START_ACK_LOSS',
  'R3_ACCEPTED_ANALYSIS_REPLY_LOSS',
])
export type RecoveryCaseKind = z.infer<typeof recoveryCaseSchema>
export const recoveryBindingSchema = z
  .object({
    version: z.literal('M13_SENDER_FREE_RECOVERY_READ_V1'),
    actor: z.literal('BOUND_DISPOSABLE_PROJECT_READER'),
    caseKind: recoveryCaseSchema,
    journeyId: id,
    targetProjectId: id,
    expectedVersion: z.number().int().nonnegative(),
    expectedStateHash: sha,
    pauseEventId: id,
    attemptId: id,
    expectedArtifact: z
      .object({ kind: z.literal('ANALYSIS_REVISION'), id, contentHash: sha })
      .strict()
      .optional(),
    snapshot: z
      .object({
        kind: z.literal('CLOSED_CHECKPOINTED_CANONICAL_COPY'),
        sourceDatabaseIdentityDigest: sha,
        sourceSha256: sha,
        copyPath: z.string().min(1).max(4096),
        copySha256: sha,
        provenanceDigest: sha,
        expectedFileMode: z.literal('0444'),
        expectedDirectoryMode: z.literal('0555'),
        expectedSidecars: z.literal('NONE'),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.caseKind === 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS') !== !!value.expectedArtifact)
      ctx.addIssue({ code: 'custom', message: 'Exact R3 artifact binding required' })
  })
export type RecoveryBinding = z.infer<typeof recoveryBindingSchema>
const guardResult = z.enum(['REFUSED', 'PASSED'])
export const recoveryObservationSchema = z
  .object({
    version: z.literal('M13_SENDER_FREE_RECOVERY_OBSERVATION_V1'),
    actor: z.literal('BOUND_DISPOSABLE_PROJECT_READER'),
    processBoundary: z.literal('FRESH_NODE_PROCESS'),
    observationSurface: z.literal('FROZEN_CANONICAL_SNAPSHOT'),
    scopeMatched: z.literal(true),
    snapshotBindingMatched: z.literal(true),
    snapshotIntegrityUnchanged: z.literal(true),
    snapshotConsistency: z.literal('CLOSED_CHECKPOINTED_COPY'),
    liveStateObserved: z.literal(false),
    originalSenderAuthorityRestored: z.literal(false),
    lifecycle: z
      .object({ status: z.literal('PAUSED'), version: z.number().int().nonnegative(), stateHash: sha })
      .strict(),
    pauseReceiptMatched: z.literal(true),
    capturedAttemptMatched: z.literal(true),
    providerEffects: z.enum(['UNRESOLVED', 'QUIESCENT']),
    replacementGuard: guardResult,
    transferGuard: guardResult,
    hostingCleanupGuard: z.enum(['REFUSED', 'PASSED', 'NO_MATCHING_RECEIPT']),
    artifact: z.enum(['MATCHED', 'MISSING', 'MISMATCH', 'NOT_REQUESTED']),
    mutationResumeInvoked: z.literal(false),
    credentialsRestored: z.literal(false),
    senderReconstructed: z.literal(false),
    observedAt: z.string().datetime(),
  })
  .strict()
function canonicalRecoveryJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRecoveryJson).join(',')}]`
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  const record = value as Record<string, unknown>
  const entries: string[] = []
  for (const key of Object.keys(record).sort())
    entries.push(`${JSON.stringify(key)}:${canonicalRecoveryJson(record[key])}`)
  return `{${entries.join(',')}}`
}
export function recoveryDigest(value: unknown) {
  return `sha256:${createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalRecoveryJson(value))
    .digest('hex')}`
}
export const recoveryRepositoryRoot = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)))
export const recoveryEvidenceRoot = path.join(recoveryRepositoryRoot, '.appraisejs/recovery-task-candidate')
export function recoveryLauncherFingerprint() {
  const files = [
    process.execPath,
    path.join(recoveryRepositoryRoot, 'node_modules/tsx/dist/loader.mjs'),
    path.join(recoveryRepositoryRoot, 'tsconfig.json'),
    ...['recovery-reader.mts', 'recovery-read-binding.mts', 'recovery-snapshot.mts', 'recovery-reader-flight.mts'].map(
      name => path.join(path.dirname(fileURLToPath(import.meta.url)), name),
    ),
    ...[
      'config/db-config.ts',
      'services/coordinator/quality-journey-query-service.ts',
      'services/coordinator/quality-journey-service.ts',
      'services/coordinator/quality-journey-analysis-service.ts',
      'services/coordinator/quality-journey-provider-recovery.ts',
      'services/coordinator/quality-journey-recovery-service.ts',
    ].map(name => path.join(recoveryRepositoryRoot, 'src', name)),
  ]
  return recoveryDigest(
    files.map(filename => {
      const real = realpathSync(filename)
      return { path: real, sha256: recoveryDigest(readFileSync(real)) }
    }),
  )
}
export function recoveryFileIdentity(filename: string, maximumBytes = 512 * 1024 * 1024) {
  const s = lstatSync(filename, { bigint: true })
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== BigInt(1) ||
    s.uid !== BigInt(process.getuid!()) ||
    realpathSync(filename) !== filename ||
    s.size > BigInt(maximumBytes)
  )
    throw new Error('Recovery owned file identity refused')
  return {
    dev: String(s.dev),
    ino: String(s.ino),
    size: String(s.size),
    mtimeNs: String(s.mtimeNs),
    mode: Number(s.mode & BigInt(0o777)),
    nlink: String(s.nlink),
    sha256: recoveryDigest(readFileSync(filename)),
  }
}
export function recoveryOwnedDirectory(directory: string, mode?: number) {
  const s = lstatSync(directory)
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.uid !== process.getuid!() ||
    realpathSync(directory) !== directory ||
    (mode !== undefined && (s.mode & 0o777) !== mode)
  )
    throw new Error('Recovery owned directory refused')
  return { dev: String(s.dev), ino: String(s.ino), uid: s.uid, mode: s.mode & 0o777, nlink: s.nlink }
}
export function assertNoRecoverySidecars(database: string) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try {
      if (lstatSync(database + suffix).size !== 0) throw new Error('Recovery database has a live sidecar')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
export const recoveryProvenanceSchema = z
  .object({
    version: z.literal('M13_CLOSED_RECOVERY_COPY_V1'),
    directoryIdentity: z
      .object({ dev: z.string(), ino: z.string(), uid: z.number(), mode: z.literal(365), nlink: z.number() })
      .strict(),
    sourceIdentity: z
      .object({
        dev: z.string(),
        ino: z.string(),
        size: z.string(),
        mtimeNs: z.string(),
        mode: z.number(),
        nlink: z.string(),
        sha256: sha,
      })
      .strict(),
    copyIdentity: z
      .object({
        dev: z.string(),
        ino: z.string(),
        size: z.string(),
        mtimeNs: z.string(),
        mode: z.literal(292),
        nlink: z.literal('1'),
        sha256: sha,
      })
      .strict(),
    writerQuiescence: z.literal('ORIGINAL_OWNERS_CLOSED'),
    checkpoint: z.literal('VERIFIED'),
    activeTransactions: z.literal(0),
  })
  .strict()

/** No repair, chmod, checkpoint, fallback, or source database access occurs here. */
export function assertRecoverySnapshot(input: unknown) {
  const binding = recoveryBindingSchema.parse(input)
  recoveryOwnedDirectory(recoveryEvidenceRoot, 0o700)
  const directory = path.dirname(binding.snapshot.copyPath)
  if (
    path.dirname(directory) !== recoveryEvidenceRoot ||
    !/^snapshot-[a-f0-9-]{36}$/.test(path.basename(directory)) ||
    path.basename(binding.snapshot.copyPath) !== 'database.sqlite'
  )
    throw new Error('Closed recovery snapshot path refused')
  const directoryIdentity = recoveryOwnedDirectory(directory, 0o555)
  if (readdirSync(directory).sort().join(',') !== 'database.sqlite,provenance.json')
    throw new Error('Snapshot directory entries drifted')
  const provenancePath = path.join(directory, 'provenance.json')
  const provenanceIdentity = recoveryFileIdentity(provenancePath, 16_384)
  if (provenanceIdentity.mode !== 0o444 || provenanceIdentity.sha256 !== binding.snapshot.provenanceDigest)
    throw new Error('Snapshot provenance drifted')
  const provenance = recoveryProvenanceSchema.parse(JSON.parse(readFileSync(provenancePath, 'utf8')))
  if (recoveryDigest(directoryIdentity) !== recoveryDigest(provenance.directoryIdentity))
    throw new Error('Snapshot directory identity drifted')
  const copy = recoveryFileIdentity(binding.snapshot.copyPath)
  if (
    JSON.stringify(copy) !== JSON.stringify(provenance.copyIdentity) ||
    copy.sha256 !== binding.snapshot.copySha256 ||
    copy.sha256 !== binding.snapshot.sourceSha256 ||
    recoveryDigest(provenance.sourceIdentity) !== binding.snapshot.sourceDatabaseIdentityDigest
  )
    throw new Error('Snapshot binding or identity drifted')
  assertNoRecoverySidecars(binding.snapshot.copyPath)
  return {
    binding,
    fingerprint: recoveryDigest({
      copy,
      directoryIdentity,
      provenanceIdentity,
      entries: readdirSync(directory).sort(),
    }),
  }
}
