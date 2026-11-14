import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { createManagedWorkerLoopbackServer } from '../../../../packages/appraisejs/src/mcp/managed-worker-loopback-server'
import {
  inspectNativeQualificationPlan,
  verifyNativeQualificationPlan,
  type CapturedNativeQualificationPlan,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { verifyC0TaskInputInventory } from './inputs.mts'
import { createC0TaskLifetime } from './lifetime.mts'
import { createNativeQualityJourneyQualification } from '../../../../src/services/coordinator/quality-journey-native-qualification'

/** No CLI entry point. Importing this task does not reserve, bind, launch, read an account or call a model. */
export async function prepareReviewedC0Task(
  options: Omit<Parameters<typeof createNativeQualityJourneyQualification>[0], 'plan' | 'createEndpoint'> & {
    plan: CapturedNativeQualificationPlan
    /** Host approval evidence belongs to the exact reviewed future packet; this string cannot grant authority. */
    approvalEvidence: string
    evidenceDirectory: string
  },
  client: PrismaClient,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(options.approvalEvidence))
    throw new Error('Exact C0 packet approval evidence is required')
  const { manifest } = inspectNativeQualificationPlan(options.plan)
  verifyC0TaskInputInventory(manifest)
  verifyNativeQualificationPlan(options.plan)
  if (
    !path.isAbsolute(options.evidenceDirectory) ||
    options.evidenceDirectory === manifest.freshRoot ||
    options.evidenceDirectory.startsWith(`${manifest.freshRoot}${path.sep}`)
  )
    throw new Error('C0 evidence must remain outside the removable runtime root')
  // This performs only frozen-plan and current canonical eligibility reads, before reservation/resources.
  const composition = await createNativeQualityJourneyQualification(
    { ...options, createEndpoint: createManagedWorkerLoopbackServer },
    client,
  )
  const evidencePath = path.join(options.evidenceDirectory, `${manifest.campaignId}.c0-spent.json`)
  let originalStart: ReturnType<typeof composition.start> | undefined
  let lifetime: ReturnType<typeof createC0TaskLifetime> | undefined
  let cleanupPoll: ReturnType<typeof setInterval> | undefined
  function finishIfClean() {
    const snapshot = composition.snapshot()
    if (snapshot.originalStartState === 'PENDING') return
    const noAcquisition = !snapshot.childLaunchEntered
    const cleaned =
      snapshot.state === 'stopped' &&
      snapshot.cleanup?.status === 'stopped' &&
      snapshot.cleanup.groupExitObserved &&
      snapshot.cleanup.privateRootRemoved
    if (!noAcquisition && !cleaned) return
    lifetime?.finish()
    if (cleanupPoll) clearInterval(cleanupPoll)
  }
  function reserveAndSpend() {
    verifyNativeQualificationPlan(options.plan)
    const captured = inspectNativeQualificationPlan(options.plan)
    const descriptor = openSync(evidencePath, 'wx', 0o600)
    try {
      writeSync(
        descriptor,
        JSON.stringify({
          version: 'm13-c0-spent/v1',
          campaignId: captured.manifest.campaignId,
          approvalEvidence: options.approvalEvidence,
          disposition: 'SPENT_BEFORE_EFFECTS',
          allowance: captured.manifest.allowance,
          outcome: 'UNKNOWN',
          refundPermitted: false,
        }) + '\n',
      )
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
  }
  return Object.freeze({
    start() {
      if (!originalStart) {
        // Conservatively spend the whole one-case allowance before any acquisition or consuming write.
        // Refusal, uncertain acquisition, lost replies and restarts never refund it.
        reserveAndSpend()
        lifetime = createC0TaskLifetime({
          caseMs: manifest.limits.caseMs,
          evidencePath: path.join(options.evidenceDirectory, `${manifest.campaignId}.c0-hard-deadline.json`),
          disconnectOriginal: composition.disconnectOriginalSupervisor,
        })
        originalStart = composition.start()
        cleanupPoll = setInterval(finishIfClean, 50)
        void originalStart.then(finishIfClean, finishIfClean)
      }
      return originalStart
    },
    cancel() {
      const original = composition.cancel()
      void original.then(finishIfClean, () => {})
      return original
    },
    snapshot: composition.snapshot,
    evidencePath,
  })
}
