import type { PrismaClient, QualityJourneyWorkAttempt } from '@prisma/client'
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
const canonicalCall = z
  .object({
    toolName: z.string(),
    arguments: z.object({ idempotencyKey: z.string() }).passthrough(),
  })
  .passthrough()
const retained = z
  .object({
    senderCleanupVerified: z.literal(true),
    recoveryEligible: z.literal(true).optional(),
    candidate: appManagedScenarioAutomationOutputSchema,
    candidateHash: digest,
    submissionIdempotencyKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    canonicalRecoveryUsed: z.boolean().optional(),
    canonicalRecoveryCall: canonicalCall.optional(),
    canonicalRecoveryCallHash: digest.optional(),
    canonicalRecoveryOutcome: z.string().optional(),
    rejection: z.object({ kind: z.string(), message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
type Scope = { journeyId: string; targetProjectId: string; role: AppManagedScenarioAutomationRole }

// Older pre-submit markers omitted recoveryEligible. Accept only that exact
// durable shape, bound to the original claim and compiled submission identity.
const legacyPreSubmission = z.object({
  state: z.literal('UNKNOWN'),
  stage: z.literal('CANONICAL_SUBMISSION'),
  canonicalSubmissionStarted: z.literal(true),
  compiledCall: z
    .object({
      toolName: z.string(),
      arguments: z.object({ idempotencyKey: z.string() }).passthrough(),
    })
    .passthrough(),
  compiledCallHash: digest,
})
function matchesFields(actual: object, expected: object) {
  const values = actual as Record<string, unknown>
  return Object.entries(expected).every(([key, value]) => values[key] === value)
}
function legacySubmissionMatches(state: z.infer<typeof retained>, role: AppManagedScenarioAutomationRole) {
  const legacy = legacyPreSubmission.safeParse(state)
  if (!legacy.success) return false
  const expected = { toolName: appManagedScenarioAutomationTools[role].submit }
  return (
    matchesFields(state.candidate, expected) &&
    matchesFields(legacy.data.compiledCall, expected) &&
    state.candidate.arguments.idempotencyKey === state.submissionIdempotencyKey &&
    legacy.data.compiledCall.arguments.idempotencyKey === state.submissionIdempotencyKey &&
    hashCanonical(legacy.data.compiledCall) === legacy.data.compiledCallHash
  )
}
async function originalClaimMatches(
  attempt: QualityJourneyWorkAttempt,
  input: Scope,
  key: string,
  client: PrismaClient,
) {
  const claim = await client.qualityJourneyExternalWorkClaimReceipt.findUnique({ where: { attemptId: attempt.id } })
  if (!claim || !claim.idempotencyKey.endsWith(':claim')) return false
  const receipt = JSON.parse(claim.receiptJson)
  return (
    matchesFields(claim, {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      role: input.role,
      workItemId: attempt.workItemId,
      authorizationId: attempt.authorizationId,
      protocol: 'EXTERNAL_V1',
      principalId: `appraise-local:${input.targetProjectId}`,
      principalAssurance: 'PROJECT_CREDENTIAL_ONLY',
      assignmentGeneration: attempt.assignmentGeneration,
      leaseId: attempt.leaseId,
    }) &&
    matchesFields(attempt, {
      executionMode: 'EXTERNAL_V1',
      externalPrincipalId: claim.principalId,
      externalPrincipalAssurance: claim.principalAssurance,
      assignmentId: receipt.assignmentId,
    }) &&
    hashCanonical(receipt) === claim.receiptHash &&
    key === `${claim.idempotencyKey.slice(0, -6)}:submit`
  )
}
async function readRetainedPreparation(attempt: QualityJourneyWorkAttempt, input: Scope, client: PrismaClient) {
  if (!attempt.failureJson) return null
  const parsed = retained.safeParse(JSON.parse(attempt.failureJson))
  if (!parsed.success || hashCanonical(parsed.data.candidate) !== parsed.data.candidateHash) return null
  const state = parsed.data
  if (state.recoveryEligible === true) return state
  if (![attempt.assignmentId, attempt.dispatchReservedAt, attempt.dispatchStartedAt].every(Boolean)) return null
  if (!legacySubmissionMatches(state, input.role)) return null
  return (await originalClaimMatches(attempt, input, state.submissionIdempotencyKey, client)) ? state : null
}
function retryCallMatches(state: z.infer<typeof retained>, role: AppManagedScenarioAutomationRole) {
  if (!state.canonicalRecoveryCall || !state.canonicalRecoveryCallHash) return false
  return (
    state.canonicalRecoveryOutcome !== 'REJECTED' &&
    state.canonicalRecoveryCall.toolName === appManagedScenarioAutomationTools[role].submit &&
    state.canonicalRecoveryCall.arguments.idempotencyKey === state.submissionIdempotencyKey &&
    hashCanonical(state.canonicalRecoveryCall) === state.canonicalRecoveryCallHash
  )
}
async function hasExactAcceptance(attempt: QualityJourneyWorkAttempt, input: Scope, key: string, client: PrismaClient) {
  const receipt = await client.qualityJourneyExternalSubmissionAcceptance.findFirst({
    where: {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      role: input.role,
      operation: input.role === 'TEST_SCENARIO_DESIGNER' ? 'SCENARIO_PORTFOLIO_SUBMIT' : 'AUTOMATION_MATERIALIZE',
      attemptId: attempt.id,
      workItemId: attempt.workItemId,
      assignmentId: attempt.assignmentId!,
      assignmentGeneration: attempt.assignmentGeneration,
      leaseId: attempt.leaseId,
      principalId: `appraise-local:${input.targetProjectId}`,
      principalAssurance: 'PROJECT_CREDENTIAL_ONLY',
      idempotencyKey: key,
    },
  })
  return Boolean(receipt && hashCanonical(JSON.parse(receipt.outcomeJson)) === receipt.outcomeHash)
}
function deterministicRecoveryRejection(error: unknown) {
  let current = error
  for (let depth = 0; depth < 6 && current instanceof Error; depth++) {
    if (current instanceof z.ZodError) return true
    if (current instanceof ServiceError && current.code !== 'INTERNAL') return true
    current = current.cause
  }
  return false
}

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
  const state = await readRetainedPreparation(attempt, input, client)
  if (!state) return null
  if (
    state.canonicalRecoveryUsed &&
    !(await hasExactAcceptance(attempt, input, state.submissionIdempotencyKey, client))
  ) {
    if (attempt.leaseExpiresAt <= new Date() || !retryCallMatches(state, input.role)) return null
  }
  return {
    attemptId: attempt.id,
    candidateHash: state.candidateHash,
    detail:
      state.rejection?.kind === 'CANONICAL'
        ? (state.rejection.message ?? 'Canonical submission requires recovery.')
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
  const state = await readRetainedPreparation(attempt, input, client)
  if (!state || state.candidateHash !== input.candidateHash || hashCanonical(state.candidate) !== input.candidateHash)
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
  const operation = input.role === 'TEST_SCENARIO_DESIGNER' ? 'SCENARIO_PORTFOLIO_SUBMIT' : 'AUTOMATION_MATERIALIZE'
  let delivery: Awaited<ReturnType<typeof createManagedQualityJourneyRoleDelivery>> | undefined
  let recoveryState = { ...state, canonicalRecoveryUsed: true }
  let committed = false
  let ownedMarker = attempt.failureJson
  let mayRecordFailure = true
  try {
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
      if (attempt.leaseExpiresAt <= new Date()) deny('Unaccepted canonical recovery requires its original live lease.')
      if (state.canonicalRecoveryUsed && !retryCallMatches(state, input.role))
        deny('The original proposal has no exact retryable canonical call.')
      delivery = await createManagedQualityJourneyRoleDelivery({
        binding,
        canonicalDefinitions: appManagedScenarioAutomationDefinitions,
        client,
      })
      let call = state.canonicalRecoveryCall
      if (!state.canonicalRecoveryUsed) {
        const tools = appManagedScenarioAutomationTools[input.role]
        const context = await delivery.invoke({
          toolName: tools.read,
          arguments: {},
          callId: 'canonical-recovery-read',
        })
        call = appManagedPreparationProjection(input.role, context.result).compile(
          state.candidate,
          state.submissionIdempotencyKey,
        )
      }
      if (!call) deny('The exact canonical recovery call is unavailable.')
      recoveryState = { ...recoveryState, canonicalRecoveryCall: call, canonicalRecoveryCallHash: hashCanonical(call) }
      const nextMarker = canonicalContractJson(recoveryState)
      const captured = await client.qualityJourneyWorkAttempt.updateMany({
        where: { id: attempt.id, failureJson: attempt.failureJson },
        data: { failureJson: nextMarker },
      })
      if (captured.count !== 1) {
        mayRecordFailure = false
        deny('The exact canonical recovery call changed concurrently.')
      }
      ownedMarker = nextMarker
      const accepted = await delivery.invoke({ ...call, callId: state.submissionIdempotencyKey })
      if (!accepted.receipt.accepted) deny('The retained proposal has no canonical acceptance.')
      committed = true
    }
    if (input.role === 'TEST_SCENARIO_DESIGNER' && journey.stage === 'SCENARIO_DESIGN')
      await publishAppManagedScenarios(input, owner, attempt.id, client)
    await client.qualityJourneyWorkAttempt.updateMany({
      where: { id: attempt.id, dispatchAdapterId: attempt.dispatchAdapterId, failureJson: ownedMarker },
      data: { dispatchReservedAt: null, dispatchStartedAt: null, failureJson: null },
    })
    return { accepted: true, nativeSend: false }
  } catch (error) {
    if (mayRecordFailure)
      await client.qualityJourneyWorkAttempt.updateMany({
        where: { id: attempt.id, dispatchAdapterId: attempt.dispatchAdapterId, failureJson: ownedMarker },
        data: {
          failureJson: canonicalContractJson({
            ...recoveryState,
            canonicalRecoveryUsed: true,
            canonicalRecoveryOutcome: !committed && deterministicRecoveryRejection(error) ? 'REJECTED' : 'INTERRUPTED',
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
