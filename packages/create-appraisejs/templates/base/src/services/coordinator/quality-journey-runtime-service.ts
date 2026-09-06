import { assertQualityJourneyMutable } from './quality-journey-terminal'
import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import {
  hashRuntimeCapsuleBytes,
  hashRuntimeCapsuleValue,
  parseCanonicalRuntimeCapsuleManifest,
} from '@/lib/runtime-capsule'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { processManager } from '@/lib/test-run/process-manager'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import { ServiceError } from '@/services/shared/errors'
import { submitDurableQualityJourneyCommandInTransaction } from './quality-journey-service'

type RuntimeInput = { executionCycleId: string }
const terminal = (status: string) => ['COMPLETED', 'CANCELLED'].includes(status)
const conflict = (message: string) => new ServiceError(message, 'CONFLICT', 409)

type LaunchBinding = Prisma.QualityJourneyExecutionTestRunGetPayload<{ include: { testRun: true } }>
async function launchReservedRun(client: PrismaClient, input: RuntimeInput, binding: LaunchBinding) {
  if (terminal(binding.testRun.status)) return
  if (binding.status !== 'RESERVED') return
  const claimed = await client.qualityJourneyExecutionTestRun.updateMany({
    where: { id: binding.id, status: 'RESERVED' },
    data: { status: 'LAUNCHING' },
  })
  if (claimed.count !== 1) return
  try {
    await new RuntimeCapsuleTestRunService(client).startJourneyPrepared({
      testRunDbId: binding.testRunId,
      onTerminal: () => reconcileQualityJourneyExecutionRuntime(input, client),
    })
    await client.qualityJourneyExecutionTestRun.updateMany({
      where: { id: binding.id, status: 'LAUNCHING' },
      data: { status: 'RUNNING' },
    })
  } catch (error) {
    const run = await client.testRun.findUniqueOrThrow({ where: { id: binding.testRunId } })
    await client.qualityJourneyExecutionTestRun.update({
      where: { id: binding.id },
      data: { status: terminal(run.status) ? 'FAILED' : 'OWNERSHIP_LOST' },
    })
    if (!terminal(run.status)) throw error
  }
}

/** A durable launch claim precedes all process side effects. An interrupted
 * claim remains visible and is never interpreted as permission to respawn. */
export async function startQualityJourneyExecutionRuntime(input: RuntimeInput, client: PrismaClient = prisma) {
  const cycle = await client.qualityJourneyExecutionCycle.findUniqueOrThrow({
    where: { id: input.executionCycleId },
    include: { testRuns: { include: { testRun: true } } },
  })
  if (!['RESERVED', 'RUNNING'].includes(cycle.status)) return
  for (const binding of cycle.testRuns) {
    await launchReservedRun(client, input, binding)
  }
  await client.qualityJourneyExecutionCycle.updateMany({
    where: { id: cycle.id, status: 'RESERVED' },
    data: { status: 'RUNNING' },
  })
  await reconcileQualityJourneyExecutionRuntime(input, client)
}

export async function cancelQualityJourneyExecutionRuntime(
  input: { executionCycleId: string; testRunIds?: string[]; reason: string },
  client: PrismaClient = prisma,
) {
  const cycle = await client.qualityJourneyExecutionCycle.findUniqueOrThrow({
    where: { id: input.executionCycleId },
    include: { testRuns: { include: { testRun: true } } },
  })
  const selected = input.testRunIds ?? cycle.testRuns.map(item => item.testRunId)
  if (selected.some(id => !cycle.testRuns.some(run => run.testRunId === id)))
    throw conflict('Cancellation includes a run outside this cycle.')
  for (const binding of cycle.testRuns.filter(item => selected.includes(item.testRunId))) {
    if (terminal(binding.testRun.status)) continue
    if (binding.status !== 'RESERVED' && !processManager.get(binding.runId)) {
      await client.qualityJourneyExecutionTestRun.update({
        where: { id: binding.id },
        data: { status: 'OWNERSHIP_LOST' },
      })
      throw conflict('Execution process ownership is unavailable; duplicate launch and false cancellation are blocked.')
    }
    if (binding.status === 'RESERVED') {
      const reserved = await client.qualityJourneyExecutionTestRun.updateMany({
        where: { id: binding.id, status: 'RESERVED' },
        data: { status: 'CANCELLED' },
      })
      if (reserved.count !== 1) throw conflict('Execution launch ownership changed during cancellation.')
    }
    await new RuntimeCapsuleTestRunService(client).cancel(binding.testRunId, cycle.id)
  }
  await reconcileQualityJourneyExecutionRuntime(input, client)
}

type EvidenceCycle = Prisma.QualityJourneyExecutionCycleGetPayload<{
  include: {
    testRuns: {
      include: { testRun: { include: { runtimeCapsule: true; runtimeCapsuleExecutionAttempt: true; testCases: true } } }
    }
  }
}>
type EvidenceBinding = EvidenceCycle['testRuns'][number]
function verifyEvidencePreparedMembership(cycle: EvidenceCycle, binding: EvidenceBinding) {
  const sources = JSON.parse(cycle.preparedCapsulesJson) as Array<{ preparedCapsuleId: string }>
  if (
    hashRuntimeCapsuleValue(sources) !== cycle.preparedCapsulesHash ||
    !sources.some(source => source.preparedCapsuleId === binding.preparedCapsuleId)
  )
    throw conflict('Runtime evidence prepared capsule is outside its frozen execution scope.')
}

function verifiedEvidenceCapsule(cycle: EvidenceCycle, binding: EvidenceBinding) {
  const run = binding.testRun
  verifyEvidencePreparedMembership(cycle, binding)
  if (
    run.targetProjectId !== cycle.targetProjectId ||
    run.environmentSnapshotHash !== cycle.environmentSnapshotHash ||
    run.environmentSnapshotJson !== cycle.environmentSnapshotJson
  )
    throw conflict('Runtime evidence environment or target differs from its execution reservation.')
  const capsule = run.runtimeCapsule
  if (capsule) verifyManifestBinding(cycle, binding, capsule)
  return capsule
}

function verifyManifestBinding(
  cycle: EvidenceCycle,
  binding: EvidenceBinding,
  capsule: NonNullable<EvidenceBinding['testRun']['runtimeCapsule']>,
) {
  const manifest = parseCanonicalRuntimeCapsuleManifest(capsule.manifestJson)
  if (
    !manifest ||
    manifest.projectId !== cycle.targetProjectId ||
    manifest.runId !== binding.runId ||
    capsule.testRunId !== binding.testRunId ||
    hashRuntimeCapsuleValue(manifest) !== capsule.manifestHash
  )
    throw conflict('Execution capsule evidence identity is invalid.')
  verifyManifestJourneySource(manifest, cycle.id, binding.preparedCapsuleId)
}

function verifyManifestJourneySource(
  manifest: ReturnType<typeof parseCanonicalRuntimeCapsuleManifest>,
  executionCycleId: string,
  preparedCapsuleId: string,
) {
  const source =
    manifest?.source.kind === 'AUTHORED_TEST_SNAPSHOT'
      ? (manifest.source.snapshot as { journey?: { executionCycleId?: string; preparedCapsuleId?: string } })
      : null
  if (source?.journey?.executionCycleId !== executionCycleId || source.journey.preparedCapsuleId !== preparedCapsuleId)
    throw conflict('Runtime capsule does not bind this exact Journey execution.')
}

async function readEvidenceArtifacts(
  access: TestRunArtifactAccessService,
  targetProjectId: string,
  run: EvidenceBinding['testRun'],
) {
  const artifacts: Array<{ kind: string; testCaseId?: string; contentHash: string; size: number }> = []
  const missing: string[] = []
  const requests = [
    { kind: 'report' as const, storedPath: run.reportPath },
    { kind: 'log' as const, storedPath: run.logPath },
    ...run.testCases
      .filter(item => item.tracePath)
      .map(item => ({ kind: 'trace' as const, testCaseId: item.testCaseId, storedPath: item.tracePath })),
  ]
  for (const request of requests) {
    if (!request.storedPath || !run.runtimeCapsule) {
      missing.push(request.kind)
      continue
    }
    const { bytes } = await access.readBytes({
      ...request,
      runId: run.runId,
      expectedTargetProjectId: targetProjectId,
    })
    artifacts.push({
      kind: request.kind,
      ...('testCaseId' in request ? { testCaseId: request.testCaseId } : {}),
      contentHash: hashRuntimeCapsuleBytes(bytes),
      size: bytes.length,
    })
  }
  return { artifacts, missing }
}

function capsuleEvidenceIdentity(capsule: EvidenceBinding['testRun']['runtimeCapsule']) {
  return {
    runtimeCapsuleId: capsule?.id ?? null,
    runtimeCapsuleHash: capsule?.capsuleHash ?? null,
    manifestHash: capsule?.manifestHash ?? null,
  }
}

async function collectRunEvidence(
  access: TestRunArtifactAccessService,
  cycle: EvidenceCycle,
  binding: EvidenceBinding,
) {
  const run = binding.testRun
  const capsule = verifiedEvidenceCapsule(cycle, binding)
  const { artifacts, missing } = await readEvidenceArtifacts(access, cycle.targetProjectId, run)
  if (run.result === 'PASSED' && (missing.length || run.evidenceHealth !== 'valid'))
    throw conflict('A successful execution requires complete valid runtime evidence.')
  const evidence = {
    schemaVersion: 'appraise.quality-journey/v1',
    journeyId: cycle.journeyId,
    targetProjectId: cycle.targetProjectId,
    executionCycleId: cycle.id,
    cycleId: cycle.cycleId,
    preparedCapsuleId: binding.preparedCapsuleId,
    preparedCapsulesHash: cycle.preparedCapsulesHash,
    testRunId: run.id,
    runId: run.runId,
    ...capsuleEvidenceIdentity(capsule),
    environmentSnapshotHash: run.environmentSnapshotHash,
    status: run.status,
    result: run.result,
    evidenceHealth: run.evidenceHealth,
    attemptId: run.runtimeCapsuleExecutionAttempt?.id ?? null,
    artifacts,
    missingArtifacts: missing,
  }
  const receiptHash = hashRuntimeCapsuleValue(evidence)
  return {
    id: `qjeer_${receiptHash.slice(7, 31)}`,
    executionCycleId: cycle.id,
    testRunId: run.id,
    runtimeBytesHash: hashRuntimeCapsuleValue(artifacts),
    receiptHash,
    evidenceJson: canonicalContractJson(evidence),
  }
}

async function collectEvidence(client: PrismaClient, executionCycleId: string) {
  const cycle = await client.qualityJourneyExecutionCycle.findUniqueOrThrow({
    where: { id: executionCycleId },
    include: {
      testRuns: {
        include: {
          testRun: { include: { runtimeCapsule: true, runtimeCapsuleExecutionAttempt: true, testCases: true } },
        },
      },
    },
  })
  if (!cycle.testRuns.length || cycle.testRuns.some(binding => !terminal(binding.testRun.status))) return null
  // Cancellation marks the DB first; wait until the managed process has exited
  // and final output collection has finished before sealing bytes.
  if (cycle.testRuns.some(binding => processManager.get(binding.runId))) return null
  const access = new TestRunArtifactAccessService(client)
  const receipts = []
  for (const binding of cycle.testRuns) {
    receipts.push(await collectRunEvidence(access, cycle, binding))
  }
  return { cycle, receipts }
}

/** Only verified terminal output bytes can become an immutable evidence receipt. */
export async function reconcileQualityJourneyExecutionRuntime(input: RuntimeInput, client: PrismaClient = prisma) {
  const existing = await client.qualityJourneyExecutionEvidenceReceipt.count({
    where: { executionCycleId: input.executionCycleId },
  })
  if (existing) return
  const result = await collectEvidence(client, input.executionCycleId)
  if (!result) return
  await client.$transaction(async tx => {
    if (await tx.qualityJourneyExecutionEvidenceReceipt.count({ where: { executionCycleId: result.cycle.id } })) return
    const state = await tx.qualityJourney.findUniqueOrThrow({ where: { id: result.cycle.journeyId } })
    assertQualityJourneyMutable(state)
    for (const receipt of result.receipts) await tx.qualityJourneyExecutionEvidenceReceipt.create({ data: receipt })
    if (state.stage === 'EXECUTION' && state.activeCycleId === result.cycle.cycleId) {
      const published = await submitDurableQualityJourneyCommandInTransaction(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          command: 'PUBLISH_RUN_RESULT',
          commandId: `qjc_result_${result.cycle.id.slice(-24)}`,
          journeyId: state.id,
          targetProjectId: state.targetProjectId,
          actor: 'MANAGED_RUNTIME',
          expectedStateHash: state.stateHash,
          idempotencyKey: `execution-result:${result.cycle.id}`,
          inputArtifactRefs: [],
          payload: {
            testRunIds: result.cycle.testRuns.map(item => item.testRunId).sort(),
            evidenceReceiptIds: result.receipts.map(item => item.id).sort(),
          },
        },
        tx,
        true,
        false,
      )
      if (published.outcome !== 'COMMITTED') throw conflict('Runtime result publication did not commit.')
    }
    await tx.qualityJourneyExecutionCycle.update({
      where: { id: result.cycle.id },
      data: {
        status: result.cycle.testRuns.every(item => item.testRun.status === 'CANCELLED') ? 'CANCELLED' : 'COMPLETED',
        completedAt: new Date(),
      },
    })
  })
}
