import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { analysisCharterSchema, assignmentManifestSchema } from '@/lib/quality-journey'
import { launchOwnedFixtureChild } from '@/lib/quality-journey/codex-app-server/owned-child'
import { ServiceError } from '@/services/shared/errors'
import { getQualityJourneyLibraryArtifact } from './quality-journey-artifact-library-service'
import { submitExternalQualityJourneyAnalysisSuccessor } from './quality-journey-analysis-service'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from './quality-journey-process-supervisor'
import type { PrepareQualityJourneyProviderRunInput } from './quality-journey-provider-run-service'
import {
  authenticateExternalQualityJourneySubmission,
  readExternalQualityJourneySubmissionOutcome,
} from './quality-journey-service'

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const candidateSchema = z
  .object({ threadId: z.string().min(1).max(200), turnId: z.string().min(1).max(200), charter: analysisCharterSchema })
  .strict()
type Options = {
  fixturePath: string
  submissionIdempotencyKey: string
  mode?:
    | 'normal'
    | 'missing'
    | 'invalid'
    | 'wrong-thread'
    | 'wrong-turn'
    | 'duplicate'
    | 'conflicting'
    | 'canonical-invalid'
    | 'delayed'
  requestTimeoutMs?: number
}

/** Internal, explicit owned-fixture delivery. No route, scheduler or real provider uses this adapter. */
export async function createQualityJourneyAnalysisFixtureDelivery(
  input: PrepareQualityJourneyProviderRunInput,
  options: Options,
  client: PrismaClient,
) {
  const binding = structuredClone(input)
  const settings = structuredClone(options)
  if (binding.role !== 'REQUIREMENT_ANALYZER')
    throw new ServiceError('Analysis delivery requires Analyzer work.', 'CONFLICT')
  if (!settings.submissionIdempotencyKey || settings.submissionIdempotencyKey.length > 200)
    throw new ServiceError('Analysis submission identity is required.', 'CONFLICT')
  const { item, attempt } = await client.$transaction(tx => authenticateExternalQualityJourneySubmission(binding, tx))
  const assignment = assignmentManifestSchema.parse(JSON.parse(attempt.assignmentJson ?? 'null'))
  if (digest(assignment) !== attempt.assignmentHash)
    throw new ServiceError('Analysis assignment lineage is invalid.', 'CONFLICT')
  const requirements = assignment.inputArtifacts.filter(ref => ref.kind === 'JOURNEY_REVISION')
  if (requirements.length !== 1)
    throw new ServiceError('Analysis requires one exact requirement reference.', 'CONFLICT')
  const requirementRef = requirements[0]!
  const { entry } = await getQualityJourneyLibraryArtifact(
    { ...binding, entryId: `REQUIREMENT_REVISION:${requirementRef.artifactId}` },
    client,
  )
  // The library revisionId is a display ordinal. The immutable row ID and hash bind the requirement.
  if (entry.artifactId !== requirementRef.artifactId || entry.sourceContentHash !== requirementRef.contentHash)
    throw new ServiceError('Exact requirement descriptor changed.', 'CONFLICT')
  const roleEnvelope = {
    schemaVersion: 'appraise.analysis-fixture-input/v1',
    role: binding.role,
    journeyId: binding.journeyId,
    targetProjectId: binding.targetProjectId,
    cycleId: item.cycleId,
    requirement: { artifactId: entry.artifactId, contentHash: entry.sourceContentHash, data: entry.data },
  }
  let candidate: unknown
  let candidateHash: string | undefined
  let invalid = false
  let cancelled = false
  let finishCandidate!: () => void
  const candidateFinished = new Promise<void>(resolve => {
    finishCandidate = resolve
  })
  let submission: Parameters<typeof submitExternalQualityJourneyAnalysisSuccessor>[0] | undefined
  let startFlight: Promise<Awaited<ReturnType<typeof deliver>>> | undefined
  const supervisor = createQualityJourneyProcessSupervisor(
    binding,
    {
      capability: trustedJourneyProcessAdapter,
      configurationDigest: digest({
        kind: 'M06_ANALYSIS_OWNED_FIXTURE_V1',
        scriptDigest: digest(readFileSync(settings.fixturePath, 'utf8')),
        mode: settings.mode ?? 'normal',
      }),
      input: [{ type: 'text', text: canonicalContractJson(roleEnvelope) }],
      launch: callbacks =>
        launchOwnedFixtureChild({
          fixturePath: settings.fixturePath,
          fixtureArgs: [settings.mode ?? 'normal'],
          requestTimeoutMs: settings.requestTimeoutMs,
          ...callbacks,
          onNotification(method, params) {
            if (method === 'appraise/analysisCandidate') {
              // Candidates convey data only. Conflicting duplicates poison this delivery.
              if (cancelled || supervisor.snapshot().fenced || !supervisor.snapshot().threadId) invalid = true
              const currentHash = digest(params)
              if (candidateHash && currentHash !== candidateHash) invalid = true
              if (!candidateHash) {
                candidate = structuredClone(params)
                candidateHash = currentHash
              }
              finishCandidate()
            }
            if (method === 'turn/completed') finishCandidate()
            callbacks.onNotification(method, params)
          },
        }),
      validateReadiness: value =>
        typeof value === 'object' && value !== null && 'isolationChecked' in value && value.isolationChecked === true,
    },
    client,
  )

  async function recoverSubmission() {
    if (cancelled) throw new ServiceError('Analysis delivery is cancelled.', 'CONFLICT')
    if (!submission) throw new ServiceError('No correlated Analysis candidate is available.', 'CONFLICT')
    try {
      const recovered = await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation: 'ANALYSIS_SUBMIT', idempotencyKey: settings.submissionIdempotencyKey },
        client,
      )
      return { ...recovered.outcome, replayed: true }
    } catch (error) {
      if (!(error instanceof ServiceError) || error.code !== 'NOT_FOUND') throw error
    }
    // Retry only this captured payload and original identity after a negative durable lookup.
    if (cancelled) throw new ServiceError('Analysis delivery is cancelled.', 'CONFLICT')
    return submitExternalQualityJourneyAnalysisSuccessor(submission, binding.principal, client, binding)
  }
  async function deliver() {
    try {
      const started = await supervisor.start()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          candidateFinished,
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, settings.requestTimeoutMs ?? 5_000)
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
      // Close the synchronous M05 write gate and drain before interpreting output.
      const stopped = await supervisor.cancel()
      const parsed = candidateSchema.safeParse(candidate)
      if (
        cancelled ||
        invalid ||
        !parsed.success ||
        parsed.data.threadId !== started.threadId ||
        parsed.data.turnId !== started.turnId
      )
        return { status: 'INCOMPLETE' as const, supervisor: stopped, acceptance: null }
      submission = Object.freeze({
        journeyId: binding.journeyId,
        targetProjectId: binding.targetProjectId,
        workItemId: binding.workItemId,
        attemptId: binding.attemptId,
        assignmentId: binding.assignmentId,
        assignmentGeneration: binding.assignmentGeneration,
        leaseId: binding.leaseId,
        assignmentSecret: binding.assignmentSecret,
        idempotencyKey: settings.submissionIdempotencyKey,
        charter: parsed.data.charter,
      })
      const acceptance = await recoverSubmission()
      return { status: 'ACCEPTED' as const, supervisor: stopped, acceptance }
    } catch (error) {
      await supervisor.cancel()
      throw error
    }
  }
  return Object.freeze({
    start() {
      startFlight ??= deliver()
      return startFlight
    },
    cancel() {
      cancelled = true
      finishCandidate()
      return supervisor.cancel()
    },
    snapshot: supervisor.snapshot,
    recoverSubmission,
  })
}
