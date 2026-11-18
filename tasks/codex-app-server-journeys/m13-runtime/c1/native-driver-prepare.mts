import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { mkdirSync, openSync, closeSync, fsyncSync, writeSync, lstatSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { canonicalContractJson } from '../../../../src/lib/catalog-contracts'
import {
  createProviderSourceNativePrismaClient,
  disposeProviderSourceDatabase,
} from '../../../../src/lib/quality-journey/provider-source-database'
import { createManagedQualityJourneyRoleDelivery } from '../../../../src/services/coordinator/quality-journey-managed-role-delivery'
import {
  assertNativePublicInput,
  verifyNativeCredential,
  readNativePublicBytes,
  type NativeCredentialDescriptor,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import {
  captureNativeQualificationPlan,
  nativeQualificationDigest,
  renderNativeQualificationConfiguration,
  type NativeQualificationManifest,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  captureNativeOutcomeProfile,
  inspectNativeOutcomeProfile,
} from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-profile'
import type { NativeOutcomeReviewControl } from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-source'
import { nativeQualificationModel } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-configuration'
import { prepareReviewedC1Task, requiredC1TaskInputPaths } from './runner.mts'
import {
  createOriginalNativeCaseControl,
  driverDigest,
  type OriginalNativeDriverTask,
} from './native-driver-control.mts'
import { scriptedDisposableHuman, type NativeLineageEvent } from './native-lineage.mts'
import { requireSupportedRecoveryPreparation, createTaskRecoveryDelivery } from './recovery-case.mts'
import type { RecoveryCaseKind } from './recovery-read-binding.mts'
import {
  createNativeQualificationLossControl,
  type NativeQualificationLossControl,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-loss'
import { getQualityJourney } from '../../../../src/services/coordinator/quality-journey-service'

const installedSha256 = '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b'
export type NativeCasePreparation = Readonly<{
  recoveryCase?: Readonly<{ caseKind: RecoveryCaseKind }>
  campaignId: string
  candidateTree: string
  native: NativeQualificationManifest['native']
  prerequisites: NativeQualificationManifest['prerequisites']
  credentialSource: NativeCredentialDescriptor
  dossierRoot: string
  port: number
  limits: NativeQualificationManifest['limits']
  reviewControl: NativeOutcomeReviewControl
}>
export function persistNativeDriverPublic(filename: string, body: unknown) {
  const fd = openSync(filename, 'wx', 0o600)
  try {
    writeSync(fd, JSON.stringify(body, null, 2) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
function publicFileDigest(filename: string, source: NativeCredentialDescriptor) {
  assertNativePublicInput(filename, source)
  return nativeQualificationDigest(readNativePublicBytes(filename, source)).slice(7)
}
function closedEnvelope(event: NativeLineageEvent) {
  return [
    {
      type: 'text',
      text: [
        `You are the ${event.original.binding.role} for one disposable AppraiseJS qualification case.`,
        'Submit exactly the frozen tool call below once. Preserve every argument and the idempotency key. Use no shell, browser, helper, sign-in, account, resume, additional thread, correction turn or unlisted tool.',
        `Scripted human persona: ${scriptedDisposableHuman}. This does not attest real human review or human-wait latency.`,
        JSON.stringify({ toolName: event.original.toolName, arguments: event.arguments }),
        'After the successful submission result, return a brief confirmation and finish the ordinary turn.',
      ].join('\n'),
    },
  ]
}
function bindingManifest(event: NativeLineageEvent): NativeQualificationManifest['binding'] {
  const b = event.original.binding
  if (!b.coordinatorSessionId || !b.coordinatorGeneration) throw new Error('Original managed session required')
  return {
    journeyId: b.journeyId,
    targetProjectId: b.targetProjectId,
    coordinatorSessionId: b.coordinatorSessionId,
    coordinatorGeneration: b.coordinatorGeneration,
    workItemId: b.workItemId,
    attemptId: b.attemptId,
    assignmentId: b.assignmentId,
    assignmentGeneration: b.assignmentGeneration,
    leaseId: b.leaseId,
    role: b.role,
  }
}
const reviewControlSchema = z
  .object({
    reviewerId: z.string().regex(/^[A-Za-z0-9_.:/-]{1,200}$/),
    nonce: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i),
    reviewMs: z.number().int().min(1).max(300_000),
    reconciliationMs: z.number().int().min(1).max(300_000),
  })
  .strict()
/** Nonissuing task validation only; no preparation, source client, credential access or native acquisition. */
export function validatePreparation(packet: NativeCasePreparation, evidenceRoot: string) {
  if (packet.recoveryCase !== undefined) requireSupportedRecoveryPreparation(packet.recoveryCase)
  if (
    !/^[A-Za-z0-9._:-]{1,160}$/.test(packet.campaignId) ||
    packet.native.sha256 !== installedSha256 ||
    !path.isAbsolute(evidenceRoot) ||
    realpathSync(evidenceRoot) !== evidenceRoot
  )
    throw new Error('Exact native case preparation refused')
  reviewControlSchema.parse(packet.reviewControl)
}
function exactReconciliation(value: unknown): value is { conflicted: false; observation: { intentId: string } } {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return (
    result.conflicted === false &&
    !!result.observation &&
    typeof result.observation === 'object' &&
    typeof (result.observation as Record<string, unknown>).intentId === 'string'
  )
}

/** Preparation performs local canonical/metadata work only. No C1 task is started or native resource acquired. */
export async function prepareOriginalNativeDriverCase(
  event: NativeLineageEvent,
  packetInput: NativeCasePreparation,
  options: {
    repositoryRoot: string
    evidenceRoot: string
    retainOriginalSource: (pair: ReturnType<typeof createProviderSourceNativePrismaClient>) => void
    sourceDisposed: () => void
    assertParentCurrent: () => void
  },
) {
  options.assertParentCurrent()
  const packet = structuredClone(packetInput)
  validatePreparation(packet, options.evidenceRoot)
  const recoveryDelivery =
    packet.recoveryCase?.caseKind === 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION'
      ? createTaskRecoveryDelivery(packet.recoveryCase.caseKind, {
          toolName: event.original.toolName,
          arguments: event.arguments,
        })
      : undefined
  verifyNativeCredential(packet.credentialSource)
  const originalEvent = event
  let originalLossControl: NativeQualificationLossControl | undefined
  const directory = path.join(options.evidenceRoot, packet.campaignId)
  mkdirSync(directory, { mode: 0o700 })
  const databasePath = realpathSync(event.original.databasePath)
  const pair = createProviderSourceNativePrismaClient(`file:${databasePath}`)
  options.retainOriginalSource(pair)
  const database = await pair.ready
  options.assertParentCurrent()
  try {
    const delivery = await createManagedQualityJourneyRoleDelivery({
      binding: event.original.binding,
      canonicalDefinitions: event.original.canonicalDefinitions,
      client: pair.client,
    })
    options.assertParentCurrent()
    const attempt = await pair.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: event.original.binding.attemptId },
    })
    options.assertParentCurrent()
    const envelope = closedEnvelope(event)
    const capability = randomBytes(32).toString('hex')
    if (canonicalContractJson(envelope).includes(event.original.binding.assignmentSecret))
      throw new Error('Private assignment material in producer envelope')
    const identity = lstatSync(databasePath, { bigint: true })
    const required = requiredC1TaskInputPaths(options.repositoryRoot)
    // Guard the entire public inventory before reading any selected input bytes.
    for (const file of required) assertNativePublicInput(file, packet.credentialSource)
    const manifest: NativeQualificationManifest = {
      version: 'appraise.native-qualification/v1',
      campaignId: packet.campaignId,
      repositoryRoot: options.repositoryRoot,
      freshRoot: `/private/tmp/m13-c1-${randomUUID()}`,
      candidateTree: packet.candidateTree,
      native: packet.native,
      prerequisites: packet.prerequisites,
      credentialSource: packet.credentialSource,
      database: { path: databasePath, dev: String(identity.dev), ino: String(identity.ino) },
      binding: bindingManifest(event),
      inputs: required.map(file => ({ path: file, sha256: publicFileDigest(file, packet.credentialSource) })),
      configurationSha256: '0'.repeat(64),
      endpoint: {
        host: '127.0.0.1',
        port: packet.port,
        path: `/appraise-worker/${randomBytes(16).toString('hex')}`,
        serverName: 'appraise_worker',
        capabilityCommitment: nativeQualificationDigest(capability),
      },
      envelopeDigest: driverDigest({ input: envelope, model: nativeQualificationModel, effort: 'medium' }),
      roleProfileDigest: delivery.profileDigest,
      mcpPromptBypass: 'EXACT_ENABLED_TOOLS_APPROVE',
      enabledTools: delivery.profile.tools.map(tool => tool.name),
      limits: packet.limits,
      allowance: {
        acquisitions: 1,
        threads: 1,
        consumingTurns: 1,
        accountRequests: 0,
        resumes: 0,
        executionCalls: 0,
        correctionCalls: 0,
      },
    }
    manifest.configurationSha256 = nativeQualificationDigest(
      renderNativeQualificationConfiguration(manifest, capability),
    ).slice(7)
    const plan = captureNativeQualificationPlan(manifest, capability)
    const profile = captureNativeOutcomeProfile(plan, packet.dossierRoot, packet.reviewControl)
    const profileRecord = inspectNativeOutcomeProfile(profile)
    const body = {
      version: 'M13_NATIVE_DRIVER_PREPARED_V1',
      phase: 'PREPARED',
      provenance: 'ORIGINAL_C1_TASK',
      kind: event.kind,
      ...(packet.recoveryCase ? { recoveryCase: packet.recoveryCase } : {}),
      ...(packet.recoveryCase?.caseKind === 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS'
        ? { recoverySelectionPolicy: 'FIRST_AUTHORIZED_NORMALIZED_ANALYSIS_SUBMISSION' }
        : {}),
      manifest,
      roleProfile: delivery.profile,
      envelope,
      profileDigest: profileRecord.profileDigest,
      dossierDigest: profileRecord.dossierDigest,
      artifactDigest: profileRecord.artifactDigest,
      reviewControl: packet.reviewControl,
      leaseExpiresAt: attempt.leaseExpiresAt.toISOString(),
      persona: scriptedDisposableHuman,
      humanWaitMetric: 'UNQUALIFIED',
      realHumanInteractionObserved: false,
      runtimeQualified: false,
      physicalQualified: false,
      effectAuthority: 'EXACT_EXTERNAL_PACKET_REVIEW_REQUIRED',
      providerHttpRequestsHardCapped: false,
    }
    const publicText = canonicalContractJson(body)
    if (
      publicText.includes(capability) ||
      publicText.includes(event.original.binding.assignmentSecret) ||
      publicText.includes(delivery.sealedGrant)
    )
      throw new Error('Private material in public prepared metadata')
    const subjectDigest = driverDigest(body)
    options.assertParentCurrent()
    persistNativeDriverPublic(path.join(directory, 'prepared.json'), { ...body, preparedDigest: subjectDigest })
    const control = createOriginalNativeCaseControl({
      provenance: 'ORIGINAL_C1_TASK',
      subjectDigest,
      leaseExpiresAt: attempt.leaseExpiresAt.getTime(),
      minimumLeaseMs: manifest.limits.acquisitionMs + manifest.limits.caseMs + manifest.limits.cleanupMs,
      source: packet.credentialSource,
      toolName: event.original.toolName,
      arguments: event.arguments,
      async createOriginalTask(approvalEvidence) {
        const absoluteCleanupDeadline = Date.now() + manifest.limits.caseMs + manifest.limits.cleanupMs
        if (packet.recoveryCase && packet.recoveryCase.caseKind !== 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION') {
          const predecessor =
            packet.recoveryCase.caseKind === 'R2_NATIVE_START_ACK_LOSS'
              ? (
                  await getQualityJourney(
                    {
                      journeyId: originalEvent.original.binding.journeyId,
                      targetProjectId: originalEvent.original.binding.targetProjectId,
                    },
                    pair.client,
                  )
                ).journey
              : undefined
          originalLossControl = createNativeQualificationLossControl({
            caseKind: packet.recoveryCase.caseKind,
            fixture: originalEvent.original,
            client: pair.client,
            plan,
            profile,
            absoluteCleanupDeadline,
            pause: {
              idempotencyKey: `${packet.campaignId}:recovery-pause`,
              reason: `SCRIPTED_DISPOSABLE_TEST_HUMAN:${packet.recoveryCase.caseKind === 'R2_NATIVE_START_ACK_LOSS' ? 'M13_R2' : 'M13_R3'}`,
              ...(predecessor
                ? { expectedVersion: predecessor.version, expectedStateHash: predecessor.stateHash }
                : {}),
            },
          })
        }
        const task = await prepareReviewedC1Task(
          {
            plan,
            nativeOutcome: { profile, database, reviewControl: packet.reviewControl },
            approvalEvidence,
            evidenceDirectory: directory,
            envelope,
            canonicalDefinitions: originalEvent.original.canonicalDefinitions,
            taskRecoveryDelivery: recoveryDelivery,
            ...(originalLossControl
              ? { qualificationLoss: { control: originalLossControl, fixture: originalEvent.original } }
              : {}),
            input: {
              ...originalEvent.original.binding,
              idempotencyKey: `${packet.campaignId}:prepare`,
              providerNamespace: `native:m13:${packet.campaignId}`,
              configurationDigest: `sha256:${manifest.configurationSha256}`,
              envelopeDigest: manifest.envelopeDigest,
            },
          },
          pair.client,
        )
        if (typeof task.readAcceptedManagedDelivery !== 'function')
          throw new Error('Original accepted-delivery observation unavailable')
        return task as OriginalNativeDriverTask
      },
      async verifyReconciled(result) {
        if (!exactReconciliation(result)) throw new Error('Exact original reconciliation result required')
        const intent = await originalEvent.original.client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
          where: { id: result.observation.intentId },
        })
        const slot = await originalEvent.original.client.qualityJourneyProviderSlot.findUnique({ where: { id: 'HUB' } })
        if (!intent.reconciledAt || intent.status !== 'TERMINAL_RECONCILED' || slot?.intentId || slot?.providerRunId)
          throw new Error('Original native HUB remains unreconciled')
      },
      async disposeOriginalSource() {
        await disposeProviderSourceDatabase(database)
        options.sourceDisposed()
      },
    })
    return Object.freeze({
      publicPrepared: () => structuredClone({ ...body, preparedDigest: subjectDigest }),
      control,
      credentialSource: structuredClone(packet.credentialSource),
      directory,
      kind: event.kind,
      recoveryDelivery,
      originalLossControl: () => originalLossControl,
    })
  } catch {
    throw new Error('Original native-driver preparation refused; disposable evidence retained')
  }
}
