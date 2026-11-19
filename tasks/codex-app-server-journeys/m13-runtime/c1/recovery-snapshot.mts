import { randomUUID } from 'node:crypto'
import {
  constants,
  copyFileSync,
  lstatSync,
  realpathSync,
  readdirSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { createOriginalRecoveryReaderFlight, finalizeOriginalRecoveryReader } from './recovery-reader-flight.mts'

import {
  assertRecoverySnapshot,
  assertNoRecoverySidecars,
  recoveryBindingSchema,
  recoveryCaseSchema,
  recoveryDigest,
  recoveryEvidenceRoot,
  recoveryRepositoryRoot,
  recoveryFileIdentity,
  recoveryLauncherFingerprint,
  recoveryObservationSchema,
  recoveryOwnedDirectory,
  recoveryProvenanceSchema,
  type RecoveryBinding,
} from './recovery-read-binding.mts'

declare const retainedSourceWitnessBrand: unique symbol
export type RecoverySourceWitness = Readonly<{ [retainedSourceWitnessBrand]: true }>
type RetainedSource = {
  path: string
  fingerprint: string
  identityDigest: string
  sourceSha256: string
  provenanceDigest: string
  readerClosureUnknown: boolean
}
const retainedSources = new WeakMap<RecoverySourceWitness, RetainedSource>()

/** Parent-only filesystem witness. It grants no database, lifecycle, sender, or process authority. */
export function recoverySourceFingerprint(originalDatabasePath: string) {
  const sourceIdentity = recoveryFileIdentity(originalDatabasePath)
  const directory = path.dirname(originalDatabasePath)
  recoveryOwnedDirectory(directory)
  const metadata = lstatSync(directory, { bigint: true })
  const directoryIdentity = {
    dev: String(metadata.dev),
    ino: String(metadata.ino),
    uid: String(metadata.uid),
    mode: String(metadata.mode & BigInt(0o777)),
    nlink: String(metadata.nlink),
    mtimeNs: String(metadata.mtimeNs),
    ctimeNs: String(metadata.ctimeNs),
  }
  const sourceCtimeNs = String(lstatSync(originalDatabasePath, { bigint: true }).ctimeNs)
  const sidecars = ['-wal', '-shm', '-journal'].map(suffix => {
    const filename = originalDatabasePath + suffix
    try {
      const identity = recoveryFileIdentity(filename)
      if (identity.size !== '0') throw new Error('Retained original source has an active sidecar')
      return { suffix, identity }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { suffix, state: 'ABSENT' }
    }
  })
  return {
    sourceIdentity,
    fingerprint: recoveryDigest({
      sourceIdentity,
      sourceCtimeNs,
      directoryIdentity,
      entries: readdirSync(directory).sort(),
      sidecars,
    }),
  }
}
function assertRetainedSource(source: RetainedSource) {
  try {
    if (recoverySourceFingerprint(source.path).fingerprint === source.fingerprint) return
  } catch {
    /* Parent-facing refusals never expose the private source path or a raw filesystem error. */
  }
  throw new Error('Retained original source integrity drifted')
}
/** Preparation only. Caller must supply its still-original fixture owner, after canonical pause and cleanup. */
export async function sealRecoverySnapshot(options: {
  binding: Omit<RecoveryBinding, 'snapshot'>
  originalDatabasePath: string
  evidenceRoot: string
  originalOwner: {
    provePausedAndCleaned(): Promise<void>
    closeOtherOriginalWriters(): Promise<void>
    checkpointOriginalAndDisconnect(): Promise<{ busy: 0; activeTransactions: 0; disconnected: true }>
  }
}) {
  recoveryCaseSchema.parse(options.binding.caseKind)
  if (options.evidenceRoot !== recoveryEvidenceRoot) throw new Error('Closed recovery evidence root required')
  recoveryOwnedDirectory(options.evidenceRoot, 0o700)
  await options.originalOwner.provePausedAndCleaned()
  await options.originalOwner.closeOtherOriginalWriters()
  const checkpoint = await options.originalOwner.checkpointOriginalAndDisconnect()
  if (checkpoint.busy !== 0 || checkpoint.activeTransactions !== 0 || checkpoint.disconnected !== true)
    throw new Error('Writer quiescence unproven')
  assertNoRecoverySidecars(options.originalDatabasePath)
  const sourceBefore = recoverySourceFingerprint(options.originalDatabasePath)
  const sourceIdentity = sourceBefore.sourceIdentity
  if (path.dirname(options.originalDatabasePath) === recoveryEvidenceRoot)
    throw new Error('Separate original source directory required')
  const directory = path.join(options.evidenceRoot, `snapshot-${randomUUID()}`)
  mkdirSync(directory, { mode: 0o700 })
  const copyPath = path.join(directory, 'database.sqlite')
  copyFileSync(options.originalDatabasePath, copyPath, constants.COPYFILE_EXCL)
  const after = recoveryFileIdentity(options.originalDatabasePath)
  if (JSON.stringify(sourceIdentity) !== JSON.stringify(after))
    throw new Error('Original database changed while copying')
  assertNoRecoverySidecars(options.originalDatabasePath)
  if (recoverySourceFingerprint(options.originalDatabasePath).fingerprint !== sourceBefore.fingerprint)
    throw new Error('Original source directory or sidecars changed while copying')
  if (recoveryFileIdentity(copyPath).sha256 !== sourceIdentity.sha256) throw new Error('Snapshot hash mismatch')
  chmodSync(copyPath, 0o444)
  // Reserve the entry before capturing directory identity: APFS directory link counts include file entries.
  const provenanceFd = openSync(path.join(directory, 'provenance.json'), 'wx', 0o444)
  let bytes: string
  try {
    const provenance = recoveryProvenanceSchema.parse({
      version: 'M13_CLOSED_RECOVERY_COPY_V1',
      directoryIdentity: { ...recoveryOwnedDirectory(directory), mode: 0o555 },
      sourceIdentity,
      copyIdentity: recoveryFileIdentity(copyPath),
      writerQuiescence: 'ORIGINAL_OWNERS_CLOSED',
      checkpoint: 'VERIFIED',
      activeTransactions: 0,
    })
    bytes = JSON.stringify(provenance)
    writeSync(provenanceFd, bytes)
    fsyncSync(provenanceFd)
  } finally {
    closeSync(provenanceFd)
  }
  chmodSync(directory, 0o555)
  const binding = recoveryBindingSchema.parse({
    ...options.binding,
    snapshot: {
      kind: 'CLOSED_CHECKPOINTED_CANONICAL_COPY',
      sourceDatabaseIdentityDigest: recoveryDigest(sourceIdentity),
      sourceSha256: sourceIdentity.sha256,
      copyPath,
      copySha256: sourceIdentity.sha256,
      provenanceDigest: recoveryDigest(bytes),
      expectedFileMode: '0444',
      expectedDirectoryMode: '0555',
      expectedSidecars: 'NONE',
    },
  })
  assertRecoverySnapshot(binding)
  const sourceWitness = Object.freeze({}) as RecoverySourceWitness
  retainedSources.set(sourceWitness, {
    path: options.originalDatabasePath,
    fingerprint: sourceBefore.fingerprint,
    identityDigest: binding.snapshot.sourceDatabaseIdentityDigest,
    sourceSha256: binding.snapshot.sourceSha256,
    provenanceDigest: binding.snapshot.provenanceDigest,
    readerClosureUnknown: false,
  })
  assertRetainedSource(retainedSources.get(sourceWitness)!)
  return Object.freeze({ binding, sourceWitness })
}
/** Closed fresh-process launcher. Source evidence stays in the original parent, outside the child binding. */
export async function readRecoverySnapshotFresh(
  input: unknown,
  sourceWitness: RecoverySourceWitness,
  timeoutMs = 30_000,
  offlineAfterObservedClose?: Readonly<{
    classification: 'OFFLINE_SYNTHETIC_FIXTURE_ONLY'
    observe(closure: Readonly<{ exitObserved: boolean; closeObserved: true; code: number | null }>): void
  }>,
): Promise<Record<string, unknown>> {
  const source = retainedSources.get(sourceWitness)
  if (!source || source.readerClosureUnknown)
    throw new Error('Original retained source witness required; no replacement reader admitted')
  assertRetainedSource(source)
  if (offlineAfterObservedClose && offlineAfterObservedClose.classification !== 'OFFLINE_SYNTHETIC_FIXTURE_ONLY')
    throw new Error('Offline-only parent observation hook refused')
  let binding: RecoveryBinding | undefined, fingerprint: string | undefined, launcherFingerprint: string | undefined
  let flight: ReturnType<typeof createOriginalRecoveryReaderFlight> | undefined
  function finalIntegrity() {
    // Sample every retained surface even when another surface already drifted. No original DB connection is opened.
    let sourceMatches = false,
      snapshotMatches = false,
      launcherMatches = false
    try {
      assertRetainedSource(source!)
      sourceMatches = true
    } catch {
      /* Finite refusal below. */
    }
    try {
      snapshotMatches = !!binding && assertRecoverySnapshot(binding).fingerprint === fingerprint
    } catch {
      /* Finite refusal below. */
    }
    try {
      launcherMatches = recoveryLauncherFingerprint() === launcherFingerprint
    } catch {
      /* Finite refusal below. */
    }
    if (!sourceMatches || !snapshotMatches || !launcherMatches)
      throw new Error('Recovery reader final source/snapshot/launcher integrity refused')
  }
  try {
    const snapshot = assertRecoverySnapshot(input)
    binding = snapshot.binding
    fingerprint = snapshot.fingerprint
    if (
      binding.snapshot.sourceDatabaseIdentityDigest !== source.identityDigest ||
      binding.snapshot.sourceSha256 !== source.sourceSha256 ||
      binding.snapshot.provenanceDigest !== source.provenanceDigest
    )
      throw new Error('Original source witness does not bind this snapshot')
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
      throw new Error('Finite recovery deadline required')
    const directory = path.join(recoveryEvidenceRoot, `reader-${randomUUID()}`)
    mkdirSync(directory, { mode: 0o700 })
    const home = path.join(directory, 'home')
    mkdirSync(home, { mode: 0o700 })
    const inputPath = path.join(directory, 'binding.json')
    const bytes = JSON.stringify(binding)
    writeFileSync(inputPath, bytes, { flag: 'wx', mode: 0o400 })
    const childPath = fileURLToPath(new URL('./recovery-reader.mts', import.meta.url))
    launcherFingerprint = recoveryLauncherFingerprint()
    const child = spawn(
      process.execPath,
      [
        '--import',
        realpathSync(path.join(recoveryRepositoryRoot, 'node_modules/tsx/dist/loader.mjs')),
        childPath,
        inputPath,
        recoveryDigest(bytes),
        launcherFingerprint,
      ],
      {
        cwd: directory,
        env: {
          HOME: home,
          NODE_ENV: 'test',
          DATABASE_URL: `file:${binding.snapshot.copyPath}`,
          TSX_DISABLE_CACHE: '1',
          TSX_TSCONFIG_PATH: path.join(recoveryRepositoryRoot, 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    flight = createOriginalRecoveryReaderFlight(child, timeoutMs)
    const originalFlight = flight
    const chunks: Buffer[] = []
    let size = 0,
      failed = false
    child.stdout?.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 16_384) {
        failed = true
        originalFlight.requestOriginalStop()
      } else chunks.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      failed = true
      if (chunk.length > 16_384) originalFlight.requestOriginalStop()
    })
    const result = await finalizeOriginalRecoveryReader(originalFlight, closure => {
      // Tests may mutate only their new disposable source here, after the actual reader's exit AND close.
      let offlineHookFailed = false
      try {
        offlineAfterObservedClose?.observe({
          exitObserved: closure.exitObserved,
          closeObserved: true,
          code: closure.code,
        })
      } catch {
        offlineHookFailed = true
      } finally {
        finalIntegrity()
      }
      if (offlineHookFailed || closure.stopRequested || closure.launchErrorObserved || failed || closure.code !== 0) {
        const finite = Buffer.concat(chunks).toString('utf8')
        const refusal =
          /^\{"version":"M13_RECOVERY_READER_REFUSAL_V1","outcome":"REFUSED","stage":"([A-Z_]+)"\}\n$/.exec(finite)
        throw new Error(
          `Fresh recovery reader refused after observed closure; no fallback${refusal ? ` (${refusal[1]})` : ''}`,
        )
      }
      try {
        return recoveryObservationSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        throw new Error('Fresh recovery reader finite output refused after observed closure')
      }
    })
    if ('outcome' in result && result.outcome === 'UNKNOWN') {
      source.readerClosureUnknown = true
      return Object.freeze({
        version: 'M13_RECOVERY_READER_UNQUALIFIED_V1',
        outcome: 'UNKNOWN',
        reason: 'ORIGINAL_READER_CLOSURE_UNOBSERVED',
        processBoundary: 'FRESH_NODE_PROCESS',
        closureObserved: false,
        finalIntegrityProven: false,
        originalPendingFlightRetained: true,
        runtimeQualified: false,
        physicalQualified: false,
      })
    }
    return result
  } finally {
    // Before spawn there is no child to join. Once spawned, ONLY observed closure permits final sampling above.
    if (!flight) {
      if (binding && fingerprint && launcherFingerprint) finalIntegrity()
      else assertRetainedSource(source)
    }
  }
}
