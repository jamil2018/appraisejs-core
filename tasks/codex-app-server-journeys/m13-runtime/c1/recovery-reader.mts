import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  assertRecoverySnapshot,
  recoveryDigest,
  recoveryEvidenceRoot,
  recoveryRepositoryRoot,
  recoveryFileIdentity,
  recoveryLauncherFingerprint,
  recoveryObservationSchema,
  recoveryOwnedDirectory,
  type RecoveryBinding,
} from './recovery-read-binding.mts'

/** This entry point accepts a sealed task binding, never credentials, a live DB or a saved sender. */
let stage = 'BOOTSTRAP'
function assertFreshDirectories(cwd: string, home: string) {
  for (const directory of [cwd, home]) recoveryOwnedDirectory(directory, 0o700)
  if (fs.readdirSync(home).length || fs.readdirSync(cwd).sort().join(',') !== 'binding.json,home')
    throw new Error('Fresh reader directory is not closed')
}
function readClosedBinding() {
  stage = 'FRESH_DIRECTORY'
  const inputPath = process.argv[2]
  const cwd = process.cwd()
  if (
    path.dirname(cwd) !== recoveryEvidenceRoot ||
    !/^reader-[a-f0-9-]{36}$/.test(path.basename(cwd)) ||
    inputPath !== path.join(cwd, 'binding.json') ||
    process.env.HOME !== path.join(cwd, 'home')
  )
    throw new Error('Fresh reader scope refused')
  assertFreshDirectories(cwd, process.env.HOME)
  const inputIdentity = recoveryFileIdentity(inputPath, 16_384)
  stage = 'BINDING'
  if (inputIdentity.mode !== 0o400 || inputIdentity.sha256 !== process.argv[3])
    throw new Error('Fresh binding identity drifted')
  const bytes = fs.readFileSync(inputPath)
  const { binding, fingerprint } = assertRecoverySnapshot(JSON.parse(bytes.toString('utf8')))
  const url = `file:${binding.snapshot.copyPath}`
  return { binding, fingerprint, inputPath, bytes, url }
}

function assertClosedEnvironment(url: string) {
  stage = 'ENVIRONMENT'
  const expectedEnv = {
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    DATABASE_URL: url,
    TSX_DISABLE_CACHE: '1',
    TSX_TSCONFIG_PATH: path.join(recoveryRepositoryRoot, 'tsconfig.json'),
  }
  // Node/tsx may add these non-authority variables itself. No inherited credential environment is admitted.
  const ignored = new Set(['__CF_USER_TEXT_ENCODING']) // Added by macOS spawn, not inherited authority.
  if (
    process.env.__CF_USER_TEXT_ENCODING !== undefined &&
    !/^0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+:0x[0-9A-Fa-f]+$/.test(process.env.__CF_USER_TEXT_ENCODING)
  )
    throw new Error('Unexpected platform encoding metadata')
  if (
    Object.entries(expectedEnv).some(([key, value]) => process.env[key] !== value) ||
    Object.keys(process.env).some(key => !(key in expectedEnv) && !ignored.has(key))
  )
    throw new Error('Closed reader environment refused')
}

type CanonicalStatus = Awaited<
  ReturnType<
    typeof import('../../../../src/services/coordinator/quality-journey-query-service').getQualityJourneyStatusSnapshot
  >
>
type CanonicalJourney = Awaited<
  ReturnType<typeof import('../../../../src/services/coordinator/quality-journey-service').getQualityJourney>
>
type CanonicalFactory = Awaited<
  ReturnType<
    typeof import('../../../../src/services/coordinator/quality-journey-service').inspectQualityJourneyFactoryEvidence
  >
>
function assertCanonicalLifecycle(binding: RecoveryBinding, status: CanonicalStatus, journey: CanonicalJourney) {
  if (status.journeyId !== binding.journeyId || status.targetProjectId !== binding.targetProjectId)
    throw new Error('Canonical snapshot scope mismatch')
  for (const lifecycle of [status.lifecycle, journey.journey]) {
    if (
      lifecycle.status !== 'PAUSED' ||
      lifecycle.version !== binding.expectedVersion ||
      lifecycle.stateHash !== binding.expectedStateHash
    )
      throw new Error('Canonical snapshot scope mismatch')
  }
}
function assertPauseTargets(binding: RecoveryBinding, payloadJson: string, factory: CanonicalFactory) {
  const payload = JSON.parse(payloadJson)
  if (payload?.version !== binding.expectedVersion || !Array.isArray(payload?.cleanupTargets?.managedAttemptIds))
    throw new Error('Canonical pause or captured attempt mismatch')
  if (
    !payload.cleanupTargets.managedAttemptIds.includes(binding.attemptId) ||
    !factory.attempts.some(attempt => attempt.attemptId === binding.attemptId)
  )
    throw new Error('Canonical pause or captured attempt mismatch')
}
function validateCanonicalObservation(
  binding: RecoveryBinding,
  status: CanonicalStatus,
  journey: CanonicalJourney,
  factory: CanonicalFactory,
) {
  const scope = { journeyId: binding.journeyId, targetProjectId: binding.targetProjectId }
  assertCanonicalLifecycle(binding, status, journey)
  stage = 'PAUSE_BINDING'
  const pause = journey.events.find(
    event => event.id === binding.pauseEventId && event.eventType === 'OPERATIONAL_PAUSE',
  )
  if (!pause) throw new Error('Canonical pause or captured attempt mismatch')
  if (
    pause.journeyId !== scope.journeyId ||
    pause.targetProjectId !== scope.targetProjectId ||
    pause.successorStateHash !== binding.expectedStateHash
  )
    throw new Error('Canonical pause or captured attempt mismatch')
  assertPauseTargets(binding, pause.payloadJson, factory)
  const cleanup = journey.events
    .filter(event => event.eventType === 'OPERATIONAL_PAUSE_CLEANUP' && event.sequence > pause.sequence)
    .at(-1)
  return cleanup
}

const classifyGuard = async (operation: () => Promise<void>): Promise<'REFUSED' | 'PASSED'> => {
  try {
    await operation()
    return 'PASSED'
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'CONFLICT') throw error
    return 'REFUSED'
  }
}

async function readPureGuards(
  binding: RecoveryBinding,
  client: import('@prisma/client').PrismaClient,
  cleanupEventId?: string,
) {
  const { hasUnreconciledProviderEffects, assertProviderEffectsQuiescent, assertProviderReplacementSafe } =
    await import('../../../../src/services/coordinator/quality-journey-provider-recovery')
  const { assertQualityJourneyHostingTransferCleanup } =
    await import('../../../../src/services/coordinator/quality-journey-recovery-service')
  const scope = { journeyId: binding.journeyId, targetProjectId: binding.targetProjectId }
  stage = 'PURE_GUARDS'
  return client.$transaction(async tx => {
    const effects = await hasUnreconciledProviderEffects({ ...scope, attemptId: binding.attemptId }, tx)
    const transferGuard = await classifyGuard(() => assertProviderEffectsQuiescent(scope, tx))
    return {
      providerEffects: effects || transferGuard === 'REFUSED' ? 'UNRESOLVED' : 'QUIESCENT',
      replacementGuard: await classifyGuard(() =>
        assertProviderReplacementSafe({ ...scope, attemptId: binding.attemptId }, tx),
      ),
      transferGuard,
      hostingCleanupGuard: cleanupEventId
        ? await classifyGuard(() =>
            assertQualityJourneyHostingTransferCleanup(
              { ...scope, version: binding.expectedVersion, stateHash: binding.expectedStateHash },
              cleanupEventId,
              tx,
            ),
          )
        : 'NO_MATCHING_RECEIPT',
    }
  })
}
async function readArtifactObservation(binding: RecoveryBinding, client: import('@prisma/client').PrismaClient) {
  let artifact: 'MATCHED' | 'MISSING' | 'MISMATCH' | 'NOT_REQUESTED' = 'NOT_REQUESTED'
  if (binding.expectedArtifact) {
    const { getQualityJourneyAnalysis } =
      await import('../../../../src/services/coordinator/quality-journey-analysis-service')
    const analysis = await getQualityJourneyAnalysis(
      { journeyId: binding.journeyId, targetProjectId: binding.targetProjectId },
      client,
    )
    const found = analysis.revisions.find(revision => revision.id === binding.expectedArtifact!.id)
    artifact = !found ? 'MISSING' : found.contentHash === binding.expectedArtifact.contentHash ? 'MATCHED' : 'MISMATCH'
  }
  return artifact
}
async function readCanonicalObservation(binding: RecoveryBinding, client: import('@prisma/client').PrismaClient) {
  stage = 'CANONICAL_IMPORTS'
  const { getQualityJourneyStatusSnapshot } =
    await import('../../../../src/services/coordinator/quality-journey-query-service')
  const { getQualityJourney, inspectQualityJourneyFactoryEvidence } =
    await import('../../../../src/services/coordinator/quality-journey-service')
  const scope = { journeyId: binding.journeyId, targetProjectId: binding.targetProjectId }
  stage = 'CANONICAL_READS'
  const status = await getQualityJourneyStatusSnapshot(scope)
  const journey = await getQualityJourney(scope, client)
  const factory = await inspectQualityJourneyFactoryEvidence(scope, client)
  const cleanup = validateCanonicalObservation(binding, status, journey, factory)
  const guards = await readPureGuards(binding, client, cleanup?.id)
  stage = 'ARTIFACT'
  const artifact = await readArtifactObservation(binding, client)
  return { status, guards, artifact }
}

async function main() {
  if (process.argv.length !== 5 || recoveryLauncherFingerprint() !== process.argv[4])
    throw new Error('Pinned closed reader arguments required')
  const { binding, fingerprint, inputPath, bytes, url } = readClosedBinding()
  assertClosedEnvironment(url)
  stage = 'PRISMA_INJECTION'
  const require = createRequire(path.join(recoveryRepositoryRoot, 'package.json'))
  const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client')
  const client = new PrismaClient({ datasourceUrl: url })
  ;(globalThis as typeof globalThis & { prisma?: unknown }).prisma = client
  try {
    const { default: canonicalClient } = await import('../../../../src/config/db-config')
    if (canonicalClient !== client) throw new Error('Canonical Prisma injection refused')
    const { status, guards, artifact } = await readCanonicalObservation(binding, client)
    stage = 'INTEGRITY'
    await client.$disconnect()
    if (
      assertRecoverySnapshot(binding).fingerprint !== fingerprint ||
      recoveryFileIdentity(inputPath).sha256 !== recoveryDigest(bytes)
    )
      throw new Error('Snapshot integrity or closed access guard failed')
    process.stdout.write(
      JSON.stringify(
        recoveryObservationSchema.parse({
          version: 'M13_SENDER_FREE_RECOVERY_OBSERVATION_V1',
          actor: binding.actor,
          processBoundary: 'FRESH_NODE_PROCESS',
          observationSurface: 'FROZEN_CANONICAL_SNAPSHOT',
          scopeMatched: true,
          snapshotBindingMatched: true,
          snapshotIntegrityUnchanged: true,
          snapshotConsistency: 'CLOSED_CHECKPOINTED_COPY',
          liveStateObserved: false,
          originalSenderAuthorityRestored: false,
          lifecycle: { status: 'PAUSED', version: status.lifecycle.version, stateHash: status.lifecycle.stateHash },
          pauseReceiptMatched: true,
          capturedAttemptMatched: true,
          ...guards,
          artifact,
          mutationResumeInvoked: false,
          credentialsRestored: false,
          senderReconstructed: false,
          observedAt: status.observedAt,
        }),
      ) + '\n',
    )
  } finally {
    await client.$disconnect()
  }
}
main().catch(() => {
  process.stdout.write(JSON.stringify({ version: 'M13_RECOVERY_READER_REFUSAL_V1', outcome: 'REFUSED', stage }) + '\n')
  process.exitCode = 1
})
