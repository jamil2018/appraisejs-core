import { z } from 'zod'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  runManagedAnalysis,
  classifyManagedAnalysisFailure,
  observeManagedAnalysisCleanup,
} from '@/lib/quality-journey/codex-app-server/managed-analysis-sender'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import {
  appManagedScenarioAutomationOutputSchema,
  type AppManagedScenarioAutomationRole,
} from './app-managed-scenario-automation-contract'
import { prepareAppManagedScenarioAutomationTask } from './app-managed-scenario-automation-task'
import { assertCurrentCoordinatorSession, readScopedQualityJourney } from './quality-journey-coordinator-session'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'
import {
  publishQualityJourneyScenarioPortfolio,
  startQualityJourneyScenarioDesign,
} from './quality-journey-scenario-service'

export function appManagedScenarioAutomationEnabled() {
  return process.env.APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED === 'true'
}
type Input = {
  journeyId: string
  targetProjectId: string
  expectedStateHash: string
  role: AppManagedScenarioAutomationRole
}
function conflict(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}

/** Persist only validation paths and trusted canonical service messages; never native errors or arbitrary causes. */
function preparationRejection(error: unknown): unknown {
  if (error instanceof z.ZodError)
    return {
      kind: 'SCHEMA',
      issues: error.issues.slice(0, 30).map(issue => ({
        code: issue.code,
        path: issue.path.join('.'),
        message: issue.message.replace(/[\r\n\x00]/g, ' ').slice(0, 500),
      })),
    }
  let current = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
    if (current instanceof ServiceError)
      return {
        kind: 'CANONICAL',
        code: current.code,
        message: current.message
          .replace(/[\r\n\x00-\x1f]/g, ' ')
          .replace(/https?:\/\/[^\s]+/g, '[url]')
          .slice(0, 1000),
      }
    current = current.cause
  }
  return { kind: 'UNCLASSIFIED' }
}

/** A single explicit local request; the durable marker is consumed before native effects. */
export async function startAppManagedScenarioAutomation(input: Input, client: PrismaClient = prisma) {
  if (!appManagedScenarioAutomationEnabled())
    conflict('Local Codex scenario design and preparation must be enabled by the Appraise server owner.')
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stateHash !== input.expectedStateHash
  )
    conflict('The Journey changed or is not active. Reload before preparation.')
  const expectedStage = input.role === 'TEST_SCENARIO_DESIGNER' ? 'SCENARIO_DESIGN' : 'AUTOMATION'
  if (journey.stage !== expectedStage && !(input.role === 'TEST_SCENARIO_DESIGNER' && journey.stage === 'DISCOVERY'))
    conflict('This role is not currently eligible for preparation.')
  const principalId = `appraise-local:${input.targetProjectId}`
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  if (!session || session.ownerPrincipalId !== principalId || session.generation === null)
    conflict('Preparation requires the current local coordinator. Use the ownership recovery controls.')
  const owner = {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorPrincipalId: principalId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
  }
  await assertCurrentCoordinatorSession(owner, client)
  if (journey.stage === 'DISCOVERY') {
    const discovery = journey.activeDiscoveryRevisionId
      ? await client.qualityJourneyDiscoveryRevision.findUnique({ where: { id: journey.activeDiscoveryRevisionId } })
      : null
    if (!discovery || discovery.status !== 'COMPLETED') conflict('Scenario design requires completed Discovery.')
    const result = await startQualityJourneyScenarioDesign(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        commandId: `app-scenarios-start:${discovery.id}`,
        idempotencyKey: `app-scenarios-start:${discovery.id}`,
        actor: 'RUNNER',
        command: 'START_SCENARIO_DESIGN',
        expectedStateHash: input.expectedStateHash,
        inputArtifactRefs: [],
        payload: {},
      },
      client,
      owner,
    )
    if (result.outcome !== 'COMMITTED') conflict('Scenario design needs reconciliation before dispatch.')
  }
  const task = await prepareAppManagedScenarioAutomationTask(
    {
      ...owner,
      role: input.role,
      principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
      assignmentSecret: await appManagedAnalysisCredential(owner, client),
    },
    client,
  )
  const marker = `APP_SERVER_LOCAL_V1_PREPARATION_${input.role}`
  try {
    await client.$transaction(async tx => {
      const hub = await tx.qualityJourneyProviderSlot.upsert({
        where: { id: 'HUB' },
        create: { id: 'HUB' },
        update: { version: { increment: 1 } },
      })
      if (hub.intentId || hub.providerRunId) conflict('The local worker requires reconciliation before reuse.')
      await assertHistoricalHubQuiescent(tx)
      await readInternalWorkerAuthority(task.binding, tx)
      const reserved = await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: task.binding.attemptId,
          status: 'IN_PROGRESS',
          dispatchAdapterId: null,
          dispatchReservedAt: null,
          dispatchStartedAt: null,
        },
        data: {
          dispatchAdapterId: marker,
          dispatchReservedAt: new Date(),
          dispatchStartedAt: new Date(),
          failureJson: canonicalContractJson({ state: 'UNKNOWN', reason: 'LOCAL_CODEX_PREPARATION_CONSUMED' }),
        },
      })
      if (reserved.count !== 1) conflict('Preparation was already dispatched and cannot be restarted.')
    })
  } catch (error) {
    task.delivery.fence()
    throw error
  }
  let stage = 'NATIVE_SEND'
  let candidate: unknown
  let compiledCall: unknown
  let normalizedOutput: unknown
  try {
    const raw = await runManagedAnalysis(task.prompt, task.nativeOutputSchema, { attemptId: task.binding.attemptId })
    stage = 'OUTPUT_VALIDATION'
    if (Buffer.byteLength(raw, 'utf8') > 1_000_000) throw new Error('Preparation output exceeds the bound.')
    normalizedOutput = task.normalizeNativeOutput(JSON.parse(raw))
    const call = appManagedScenarioAutomationOutputSchema.parse(normalizedOutput)
    candidate = call
    stage = 'SEMANTIC_VALIDATION'
    const compiled = task.compile(call)
    compiledCall = compiled
    if (call.toolName !== task.submitToolName || call.arguments.idempotencyKey !== task.submissionIdempotencyKey)
      throw new Error('Preparation output changed the original role or submission identity.')
    // Persist only strict content after sender cleanup, before canonical effects. A crash never requires another send.
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: {
        failureJson: canonicalContractJson({
          state: 'UNKNOWN',
          stage: 'CANONICAL_SUBMISSION',
          senderCleanupVerified: true,
          submissionIdempotencyKey: task.submissionIdempotencyKey,
          canonicalSubmissionStarted: true,
          candidate,
          candidateHash: hashCanonical(candidate),
          compiledCall,
          compiledCallHash: hashCanonical(compiledCall),
        }),
      },
    })
    stage = 'CANONICAL_SUBMISSION'
    const accepted = await task.delivery.invoke({ ...compiled, callId: task.submissionIdempotencyKey })
    if (!accepted.receipt.accepted) throw new Error('Preparation has no canonical acceptance.')
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: { dispatchReservedAt: null, dispatchStartedAt: null, failureJson: null },
    })
    stage = 'REVIEW_PUBLICATION'
    if (input.role === 'TEST_SCENARIO_DESIGNER')
      await publishAppManagedScenarios(input, owner, task.binding.attemptId, client)
    return { role: input.role, accepted: true }
  } catch (error) {
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: task.binding.attemptId, dispatchAdapterId: marker },
      data: {
        failureJson: canonicalContractJson({
          state: stage === 'REVIEW_PUBLICATION' ? 'HANDOFF_REQUIRED' : 'UNKNOWN',
          stage,
          reason: `${stage}_DID_NOT_COMPLETE`,
          senderCleanupVerified:
            stage !== 'NATIVE_SEND' || observeManagedAnalysisCleanup(task.binding.attemptId).privateRootCleanupVerified,
          submissionIdempotencyKey: task.submissionIdempotencyKey,
          recoveryEligible: stage !== 'NATIVE_SEND' && Boolean(candidate),
          canonicalSubmissionStarted: ['CANONICAL_SUBMISSION', 'REVIEW_PUBLICATION'].includes(stage),
          ...(candidate ? { candidate, candidateHash: hashCanonical(candidate) } : {}),
          ...(normalizedOutput ? { normalizedOutput, normalizedOutputHash: hashCanonical(normalizedOutput) } : {}),
          ...(compiledCall ? { compiledCall, compiledCallHash: hashCanonical(compiledCall) } : {}),
          rejection: preparationRejection(error),
          detail:
            stage === 'NATIVE_SEND'
              ? classifyManagedAnalysisFailure(error)
              : stage === 'OUTPUT_VALIDATION'
                ? 'Model output did not satisfy the exact preparation submission contract.'
                : error instanceof ServiceError
                  ? `Canonical service ${error.code}.`
                  : 'Canonical handoff did not complete.',
        }),
      },
    })
    throw new ServiceError(
      'Preparation could not finish. Its dispatch is consumed and may be UNKNOWN. Reload to inspect accepted work and use recovery; do not restart it.',
      'CONFLICT',
    )
  } finally {
    task.delivery.fence()
  }
}

export async function publishAppManagedScenarios(
  input: { journeyId: string; targetProjectId: string },
  owner: import('./quality-journey-coordinator-session').CoordinatorSessionBinding,
  attemptId: string,
  client: PrismaClient,
) {
  const portfolio = await client.qualityJourneyScenarioPortfolioRevision.findFirstOrThrow({
    where: {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      submittedAttemptId: attemptId,
    },
  })
  const current = await readScopedQualityJourney(input, client)
  const publication = await publishQualityJourneyScenarioPortfolio(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      commandId: `app-scenarios-publish:${portfolio.id}`,
      idempotencyKey: `app-scenarios-publish:${portfolio.id}`,
      actor: 'RUNNER',
      command: 'PUBLISH_SCENARIO_PORTFOLIO',
      expectedStateHash: current.stateHash,
      inputArtifactRefs: [
        {
          kind: 'SCENARIO_PORTFOLIO_REVISION',
          artifactId: portfolio.artifactId,
          revisionId: portfolio.artifactRevisionId,
          contentHash: portfolio.contentHash,
        },
      ],
      payload: { artifactRevisionId: portfolio.artifactRevisionId, artifactHash: portfolio.contentHash },
    },
    client,
    owner,
  )
  if (publication.outcome !== 'COMMITTED') conflict('Accepted scenarios need publication reconciliation.')
}
