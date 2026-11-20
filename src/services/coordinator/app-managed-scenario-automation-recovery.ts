import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { z } from 'zod'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisCredential } from './app-managed-analysis-credential'
import {
  appManagedScenarioAutomationDefinitions,
  appManagedScenarioAutomationOutputSchema,
  appManagedScenarioAutomationTools,
  type AppManagedScenarioAutomationRole,
} from './app-managed-scenario-automation-contract'
import { appManagedPreparationProjection } from './app-managed-scenario-automation-projection'
import { publishAppManagedScenarios } from './app-managed-scenario-automation-service'
import {
  assertCurrentCoordinatorSession,
  assertCoordinatorAttemptSession,
  readScopedQualityJourney,
} from './quality-journey-coordinator-session'
import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'
import {
  readExternalQualityJourneySubmissionOutcome,
  requestQualityJourneyRejectedDesignerReplacement,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

function deny(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const retained = z
  .object({
    senderCleanupVerified: z.literal(true),
    recoveryEligible: z.literal(true),
    candidate: appManagedScenarioAutomationOutputSchema,
    candidateHash: digest,
    submissionIdempotencyKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    canonicalRecoveryUsed: z.boolean().optional(),
    rejection: z.object({ kind: z.string(), message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
type Scope = { journeyId: string; targetProjectId: string; role: AppManagedScenarioAutomationRole }

export async function getAppManagedScenarioDesignCorrection(input: Omit<Scope, 'role'>, client: PrismaClient = prisma) {
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stage !== 'SCENARIO_DESIGN'
  )
    return null
  const attempt = await client.qualityJourneyWorkAttempt.findFirst({
    where: {
      dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER',
      status: 'IN_PROGRESS',
      workItemId: { in: JSON.parse(journey.activeWorkItemIdsJson) },
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        cycleId: journey.activeCycleId,
        role: 'TEST_SCENARIO_DESIGNER',
        status: 'IN_PROGRESS',
      },
    },
    include: { workItem: { select: { currentAttempt: true } } },
  })
  if (!attempt?.failureJson || attempt.workItem.currentAttempt !== attempt.attempt) return null
  const failure = JSON.parse(attempt.failureJson)
  if (
    failure.stage !== 'OUTPUT_VALIDATION' ||
    failure.senderCleanupVerified !== true ||
    failure.canonicalSubmissionStarted !== false ||
    failure.rejection?.kind !== 'SCHEMA' ||
    !Array.isArray(failure.rejection.issues) ||
    !failure.rejection.issues.length
  )
    return null
  const issues = failure.rejection.issues as Array<{ path: string; code: string }>
  return {
    attemptId: attempt.id,
    failureHash: hashCanonical(failure),
    detail: `The completed proposal was rejected at ${issues.map(issue => `${issue.path} (${issue.code})`).join(', ')}. Its original attempt remains consumed.`,
  }
}

/** Explicit issuance only. Dispatch of the new assignment remains a separate local request. */
export async function requestAppManagedScenarioDesignCorrection(
  input: Omit<Scope, 'role'> & { expectedStateHash: string; attemptId: string; expectedFailureHash: string },
  client: PrismaClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  const principalId = `appraise-local:${input.targetProjectId}`
  if (!session || session.ownerPrincipalId !== principalId || !session.generation)
    deny('Correction requires the current local coordinator.')
  return requestQualityJourneyRejectedDesignerReplacement(
    {
      ...input,
      coordinatorSessionId: session.id,
      coordinatorGeneration: session.generation,
      coordinatorPrincipalId: principalId,
    },
    client,
  )
}

/** A compact contextual affordance only. No candidate content or private assignment scope reaches the browser. */
export async function getAppManagedPreparationRecovery(input: Scope, client: PrismaClient = prisma) {
  const journey = await readScopedQualityJourney(input, client)
  if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || journey.status !== 'ACTIVE') return null
  const activeIds = JSON.parse(journey.activeWorkItemIdsJson) as string[]
  const portfolio =
    input.role === 'TEST_SCENARIO_DESIGNER' && journey.activeScenarioPortfolioRevisionId
      ? await client.qualityJourneyScenarioPortfolioRevision.findFirst({
          where: {
            id: journey.activeScenarioPortfolioRevisionId,
            journeyId: input.journeyId,
            targetProjectId: input.targetProjectId,
          },
          select: { submittedAttemptId: true },
        })
      : null
  const attempt = await client.qualityJourneyWorkAttempt.findFirst({
    where: {
      dispatchAdapterId: `APP_SERVER_LOCAL_V1_PREPARATION_${input.role}`,
      failureJson: { not: null },
      workItem: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        role: input.role,
        cycleId: journey.activeCycleId,
      },
      OR: [
        { workItemId: { in: activeIds } },
        ...(portfolio?.submittedAttemptId ? [{ id: portfolio.submittedAttemptId }] : []),
      ],
    },
    include: { workItem: { select: { currentAttempt: true } } },
    orderBy: { startedAt: 'desc' },
  })
  if (!attempt?.failureJson || attempt.workItem.currentAttempt !== attempt.attempt) return null
  const state = retained.safeParse(JSON.parse(attempt.failureJson))
  if (
    !state.success ||
    state.data.canonicalRecoveryUsed ||
    hashCanonical(state.data.candidate) !== state.data.candidateHash
  )
    return null
  return {
    attemptId: attempt.id,
    candidateHash: state.data.candidateHash,
    detail:
      state.data.rejection?.kind === 'CANONICAL'
        ? (state.data.rejection.message ?? 'Canonical submission requires recovery.')
        : 'The retained proposal needs validation.',
  }
}

/** One canonical-only recovery of a retained post-sender proposal. This module never imports a native sender. */
export async function recoverAppManagedScenarioAutomation(
  input: Scope & { expectedStateHash: string; attemptId: string; candidateHash: string },
  client: PrismaClient = prisma,
) {
  const journey = await readScopedQualityJourney(input, client)
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    journey.stateHash !== input.expectedStateHash
  )
    deny('The Journey changed. Reload before canonical proposal recovery.')
  const session = journey.currentCoordinatorSessionId
    ? await client.qualityJourneyCoordinatorSession.findUnique({ where: { id: journey.currentCoordinatorSessionId } })
    : null
  const principalId = `appraise-local:${input.targetProjectId}`
  if (!session || session.ownerPrincipalId !== principalId || !session.generation)
    deny('Recovery requires the current local coordinator.')
  const owner = {
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
    coordinatorPrincipalId: principalId,
  }
  await assertCurrentCoordinatorSession(owner, client)
  const currentRecovery = await getAppManagedPreparationRecovery(input, client)
  if (currentRecovery?.attemptId !== input.attemptId || currentRecovery.candidateHash !== input.candidateHash)
    deny('Recovery does not bind the current active proposal.')
  const attempt = await client.qualityJourneyWorkAttempt.findFirst({
    where: {
      id: input.attemptId,
      dispatchAdapterId: `APP_SERVER_LOCAL_V1_PREPARATION_${input.role}`,
      workItem: { journeyId: input.journeyId, targetProjectId: input.targetProjectId, role: input.role },
    },
  })
  if (!attempt?.failureJson || !attempt.assignmentId) deny('The original rejected proposal is unavailable.')
  const state = retained.parse(JSON.parse(attempt.failureJson))
  if (
    state.canonicalRecoveryUsed ||
    state.candidateHash !== input.candidateHash ||
    hashCanonical(state.candidate) !== input.candidateHash
  )
    deny('The original proposal changed or its canonical recovery was already consumed.')
  const binding: ExternalQualityJourneySubmissionBinding = {
    ...owner,
    role: input.role,
    principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
    assignmentSecret: await appManagedAnalysisCredential(owner, client),
    workItemId: attempt.workItemId,
    attemptId: attempt.id,
    assignmentId: attempt.assignmentId,
    assignmentGeneration: attempt.assignmentGeneration,
    leaseId: attempt.leaseId,
  }
  await assertCoordinatorAttemptSession(binding, client)
  const updated = await client.qualityJourneyWorkAttempt.updateMany({
    where: { id: attempt.id, failureJson: attempt.failureJson },
    data: { failureJson: canonicalContractJson({ ...state, canonicalRecoveryUsed: true }) },
  })
  if (updated.count !== 1) deny('Canonical proposal recovery was already consumed.')
  const operation = input.role === 'TEST_SCENARIO_DESIGNER' ? 'SCENARIO_PORTFOLIO_SUBMIT' : 'AUTOMATION_MATERIALIZE'
  let delivery: Awaited<ReturnType<typeof createManagedQualityJourneyRoleDelivery>> | undefined
  try {
    let committed = false
    try {
      await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation, idempotencyKey: state.submissionIdempotencyKey },
        client,
      )
      committed = true
    } catch (error) {
      if (!(error instanceof ServiceError) || error.code !== 'NOT_FOUND') throw error
    }
    if (!committed) {
      delivery = await createManagedQualityJourneyRoleDelivery({
        binding,
        canonicalDefinitions: appManagedScenarioAutomationDefinitions,
        client,
      })
      const tools = appManagedScenarioAutomationTools[input.role]
      const context = await delivery.invoke({ toolName: tools.read, arguments: {}, callId: 'canonical-recovery-read' })
      const call = appManagedPreparationProjection(input.role, context.result).compile(
        state.candidate,
        state.submissionIdempotencyKey,
      )
      const accepted = await delivery.invoke({ ...call, callId: state.submissionIdempotencyKey })
      if (!accepted.receipt.accepted) deny('The retained proposal has no canonical acceptance.')
    }
    if (input.role === 'TEST_SCENARIO_DESIGNER' && journey.stage === 'SCENARIO_DESIGN')
      await publishAppManagedScenarios(input, owner, attempt.id, client)
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: attempt.dispatchAdapterId },
      data: { dispatchReservedAt: null, dispatchStartedAt: null, failureJson: null },
    })
    return { accepted: true, nativeSend: false }
  } catch (error) {
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: attempt.dispatchAdapterId },
      data: {
        failureJson: canonicalContractJson({
          ...state,
          canonicalRecoveryUsed: true,
          canonicalRecoveryOutcome: 'REJECTED_OR_UNKNOWN',
          canonicalRecoveryCode: error instanceof ServiceError ? error.code : 'VALIDATION_OR_UNCERTAIN',
        }),
      },
    })
    throw new ServiceError(
      'The retained proposal could not complete canonical recovery. Its original data is preserved; no new native send was performed.',
      'CONFLICT',
    )
  } finally {
    delivery?.fence()
  }
}
