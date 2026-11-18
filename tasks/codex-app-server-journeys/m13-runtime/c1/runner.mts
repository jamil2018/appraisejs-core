import {
  createNativeQualificationDiagnostics,
  requireNativeDiagnostic,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-diagnostics'
import { createC1TaskLifetime } from './lifetime.mts'
import {
  assertNativePublicInput,
  readNativePublicBytes,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@prisma/client'
import { createManagedWorkerLoopbackServer } from '../../../../packages/appraisejs/src/mcp/managed-worker-loopback-server'
import { createNativeQualityJourneyQualification } from '../../../../src/services/coordinator/quality-journey-native-qualification'
import { reconcileConsumedQualityJourneyProviderIntent } from '../../../../src/services/coordinator/quality-journey-provider-run-service'
import { trustedProviderReconciliation } from '../../../../src/lib/quality-journey/provider-intent-contract'
import {
  nativeQualificationDigest,
  nativeQualificationSourceFiles,
  inspectNativeQualificationPlan,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  inspectNativeOutcomeProfile,
  nativeOutcomeReviewControlDigest,
} from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-profile'
import type { NativeOutcomeReviewDecision } from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-source'
import { requiredC0TaskInputPaths } from '../c0/inputs.mts'
import type { createTaskRecoveryDelivery } from './recovery-case.mts'
import { createOriginalLossEndpoint } from './native-loss-endpoint.mts'

export function requiredC1TaskInputPaths(canonicalRoot: string) {
  return [
    ...new Set([
      ...requiredC0TaskInputPaths(canonicalRoot),
      ...nativeQualificationSourceFiles(path.dirname(fileURLToPath(import.meta.url))),
    ]),
  ].sort()
}
function assertC1InputInventory(manifest: ReturnType<typeof inspectNativeQualificationPlan>['manifest']) {
  const required = requiredC1TaskInputPaths(manifest.repositoryRoot)
  if (
    required.length !== manifest.inputs.length ||
    !manifest.inputs.every((entry, index) => entry.path === required[index])
  )
    throw new Error('Exact frozen C1 task input inventory required')
}
function persist(filename: string, body: unknown) {
  const fd = openSync(filename, 'wx', 0o600)
  try {
    writeSync(fd, JSON.stringify(body) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
/** Original task parent only. Import has no effect; no CLI or product registration exists. */
export async function prepareReviewedC1Task(
  provided: Omit<Parameters<typeof createNativeQualityJourneyQualification>[0], 'createEndpoint' | 'diagnostics'> & {
    nativeOutcome: NonNullable<Parameters<typeof createNativeQualityJourneyQualification>[0]['nativeOutcome']>
    approvalEvidence: string
    evidenceDirectory: string
    taskRecoveryDelivery?: ReturnType<typeof createTaskRecoveryDelivery>
  },
  client: PrismaClient,
) {
  const options = Object.freeze({
    ...provided,
    nativeOutcome: Object.freeze({
      ...provided.nativeOutcome,
      reviewControl: Object.freeze({ ...provided.nativeOutcome.reviewControl }),
    }),
  })
  const originalProfile = options.nativeOutcome.profile,
    originalPlan = options.plan
  const profile = inspectNativeOutcomeProfile(originalProfile)
  const controlDigest = nativeOutcomeReviewControlDigest(options.nativeOutcome.reviewControl)
  if (profile.reviewControlDigest !== controlDigest) throw new Error('Exact frozen C1 review control required')
  const { manifest } = inspectNativeQualificationPlan(options.plan)
  assertC1InputInventory(manifest)
  if (
    profile.plan !== options.plan ||
    !/^sha256:[a-f0-9]{64}$/.test(options.approvalEvidence) ||
    !path.isAbsolute(options.evidenceDirectory) ||
    options.evidenceDirectory.startsWith(manifest.freshRoot)
  )
    throw new Error('Exact frozen C1 task packet required')
  const diagnostic = createNativeQualificationDiagnostics(options.evidenceDirectory, manifest.freshRoot)
  const diagnostics = diagnostic.observer
  let composition: Awaited<ReturnType<typeof createNativeQualityJourneyQualification>>
  try {
    composition = await createNativeQualityJourneyQualification(
      {
        ...options,
        diagnostics,
        createEndpoint: endpointOptions =>
          options.qualificationLoss
            ? createOriginalLossEndpoint(endpointOptions, options.qualificationLoss.control)
            : createManagedWorkerLoopbackServer({
                ...endpointOptions,
                callGateway: call =>
                  options.taskRecoveryDelivery
                    ? options.taskRecoveryDelivery.callGateway(
                        { toolName: call.toolName, arguments: call.arguments },
                        () => endpointOptions.callGateway(call),
                      )
                    : endpointOptions.callGateway(call),
              }),
      },
      client,
    )
  } catch (error) {
    diagnostics.record('CASE_FAILURE', 'UNKNOWN', 'BOUNDARY_REFUSED')
    diagnostic.close()
    throw error
  }
  const evidencePath = path.join(options.evidenceDirectory, `${manifest.campaignId}.c1-spent.json`)
  let start: ReturnType<typeof composition.start> | undefined
  let candidate:
    | Awaited<ReturnType<NonNullable<ReturnType<typeof composition.originalNativeOutcome>>['freezeCandidate']>>
    | undefined
  let enrollment:
    ReturnType<NonNullable<ReturnType<typeof composition.originalNativeOutcome>>['acceptTaskReview']> | undefined
  let freezeEntered = false,
    reviewEntered = false,
    reconciliationEntered = false
  let lifetime: ReturnType<typeof createC1TaskLifetime> | undefined
  const control = options.nativeOutcome.reviewControl
  function closeControls() {
    lifetime?.finish()
    diagnostic.close()
  }
  async function cancelOriginal() {
    try {
      return await composition.cancel()
    } finally {
      diagnostic.close()
    }
  }
  function owner() {
    const original = composition.originalNativeOutcome()
    if (!original || lifetime?.expired()) throw new Error('Original C1 task owner unavailable')
    return original
  }
  return Object.freeze({
    start() {
      if (!start) {
        try {
          requireNativeDiagnostic(diagnostics, 'CASE_START')
          const current = inspectNativeOutcomeProfile(originalProfile)
          if (
            current.plan !== originalPlan ||
            current.profileDigest !== profile.profileDigest ||
            current.reviewControlDigest !== controlDigest
          )
            throw new Error('Original frozen C1 profile changed before reservation')
          assertC1InputInventory(inspectNativeQualificationPlan(originalPlan).manifest)
          persist(evidencePath, {
            version: 'M13_C1_SPENT_V1',
            campaignId: manifest.campaignId,
            approvalEvidence: options.approvalEvidence,
            profileDigest: profile.profileDigest,
            allowance: manifest.allowance,
            reviewControl: control,
            reconciliationAllowance: 1,
            disposition: 'SPENT_BEFORE_EFFECTS',
            outcome: 'UNKNOWN',
            refundPermitted: false,
          })
          lifetime = createC1TaskLifetime({
            caseMs: manifest.limits.caseMs,
            cleanupMs: manifest.limits.cleanupMs,
            control,
            hardEvidencePath: path.join(options.evidenceDirectory, `${manifest.campaignId}.c1-hard-deadline.json`),
            cancelModel: cancelOriginal,
            revokeOriginal: () => composition.originalNativeOutcome()?.revoke(),
            disconnectOriginal: composition.disconnectOriginalSupervisor,
          })
          start = composition.start()
          // Observe the original promise without replacing it or retaining its raw rejection.
          void start.then(
            () => {
              diagnostics.record('CASE_START', 'SETTLED')
            },
            () => {
              try {
                const inspection = composition.snapshot().configurationInspection
                persist(path.join(options.evidenceDirectory, `${manifest.campaignId}.c1-start-failure.json`), {
                  version: 'M13_C1_START_FAILURE_V1',
                  outcome: 'UNKNOWN',
                  configurationInspection: inspection
                    ? {
                        valid: inspection.valid,
                        reason: inspection.reason,
                        ...(inspection.feature === undefined ? {} : { feature: inspection.feature }),
                        ...(inspection.fields === undefined ? {} : { fields: [...inspection.fields] }),
                      }
                    : null,
                })
              } catch {
                // Evidence failure cannot replace the original rejection or bypass original stop/close below.
              }
              diagnostics.record('CASE_FAILURE', 'UNKNOWN', 'BOUNDARY_REFUSED')
            },
          )
          // A fulfilled start only acknowledges the turn. Its stop flight may not exist yet.
          void start.then(undefined, () => {
            void composition.waitOriginalStop().then(diagnostic.close, diagnostic.close)
          })
        } catch (error) {
          diagnostics.record('CASE_FAILURE', 'UNKNOWN', 'BOUNDARY_REFUSED')
          diagnostic.close()
          throw error
        }
      }
      return start
    },
    async freezeCandidate() {
      if (!start || freezeEntered) throw new Error('One original C1 candidate required')
      freezeEntered = true
      await composition.waitOriginalStop()
      const state = composition.snapshot()
      if (state.state !== 'stopped' || state.originalStartState !== 'FULFILLED')
        throw new Error('Original C1 cleanup pending')
      lifetime?.nativeCleanupObserved()
      diagnostic.close()
      candidate = await owner().freezeCandidate()
      persist(path.join(options.evidenceDirectory, `${manifest.campaignId}.c1-candidate.json`), candidate)
      return candidate
    },
    async readAcceptedManagedDelivery(call: { toolName: string; arguments: Record<string, unknown> }) {
      await composition.waitOriginalStop()
      if (composition.snapshot().state !== 'stopped') throw new Error('Original C1 cleanup is not settled')
      return composition.readAcceptedManagedDelivery(call)
    },
    acceptIndependentReview(receiptPath: string, exactReceiptDigest: string, actualReviewPath: string) {
      if (reviewEntered || !candidate) throw new Error('One bounded actual C1 review required')
      reviewEntered = true
      assertNativePublicInput(receiptPath, manifest.credentialSource)
      assertNativePublicInput(actualReviewPath, manifest.credentialSource)
      const bytes = readNativePublicBytes(receiptPath, manifest.credentialSource, 1024 * 1024)
      if (nativeQualificationDigest(bytes) !== exactReceiptDigest) throw new Error('Actual review receipt drift')
      const receipt = JSON.parse(bytes.toString()) as NativeOutcomeReviewDecision
      if (
        nativeQualificationDigest(readNativePublicBytes(actualReviewPath, manifest.credentialSource, 1024 * 1024)) !==
        receipt.actualReviewReceiptDigest
      )
        throw new Error('Actual independent review evidence drift')
      enrollment = owner().acceptTaskReview(receipt)
      return Object.freeze({ candidateDigest: enrollment.candidateDigest })
    },
    async reconcile(observationKey: string) {
      if (reconciliationEntered || !enrollment) throw new Error('One original native reconciliation required')
      reconciliationEntered = true
      try {
        const result = await reconcileConsumedQualityJourneyProviderIntent(
          {
            intentId: String(candidate!.identity.intentId),
            observationKey,
            senderExcluded: enrollment.senderExcluded,
            physicalEvidence: enrollment.physicalEvidence,
          },
          enrollment.context,
          trustedProviderReconciliation,
          client,
        )
        closeControls()
        return result
      } catch (error) {
        // Original ambiguous transaction custody remains alive until the frozen hard boundary.
        throw error
      }
    },
    async cancel() {
      composition.originalNativeOutcome()?.revoke()
      const result = await cancelOriginal()
      if (!reconciliationEntered && result.state === 'stopped' && result.cleanup?.status === 'stopped') closeControls()
      return result
    },
    snapshot: composition.snapshot,
    evidencePath,
  })
}
