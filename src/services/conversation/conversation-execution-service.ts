import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { qualityJourneyExecutionConsentScopeSchema, qualityJourneyIdentifierSchema } from '@/lib/quality-journey'
import { freezeJourneyExecutionEnvironment } from '@/lib/quality-journey/execution-environment'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  getQualityJourneyExecution,
  startQualityJourneyExecution,
} from '@/services/coordinator/quality-journey-execution-service'
import { ServiceError } from '@/services/shared/errors'

import { getLatestConversationJourney } from './conversation-service'

type ChatExecutionScope = {
  targetProjectId: string
  conversationId: string
  journeyId: string
}

type RequestChatExecution = ChatExecutionScope & {
  environmentId: string
  browserEngine: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
  expectedStateHash: string
}

type ApproveChatExecution = ChatExecutionScope & {
  executionConsentId: string
  expectedScopeHash: string
}

function chatOptions(input: ChatExecutionScope, requestConsentOnly?: true, approvalScopeHash?: string) {
  return {
    conversationId: input.conversationId,
    requestConsentOnly,
    approvalScopeHash,
    assertLinked: async (tx: Prisma.TransactionClient) => {
      if ((await getLatestConversationJourney(input, tx)) !== input.journeyId)
        throw new ServiceError('This Journey is no longer linked to the saved chat.', 'CONFLICT', 409)
    },
  }
}

async function assertSavedJourney(input: ChatExecutionScope, client: PrismaClient) {
  qualityJourneyIdentifierSchema.parse(input.targetProjectId)
  qualityJourneyIdentifierSchema.parse(input.journeyId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.conversationId))
    throw new ServiceError('Conversation id is invalid.', 'VALIDATION', 400)
  const linked = await getLatestConversationJourney(input, client)
  if (linked !== input.journeyId)
    throw new ServiceError('This Journey is no longer linked to the saved chat.', 'CONFLICT', 409)
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: { activeCycleId: true, stateHash: true, status: true },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  return journey
}

function attemptKey(input: RequestChatExecution & { preparedRuntimeCapsuleIds: string[] }) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        conversationId: input.conversationId,
        journeyId: input.journeyId,
        stateHash: input.expectedStateHash,
        environmentId: input.environmentId,
        browserEngine: input.browserEngine,
        preparedRuntimeCapsuleIds: input.preparedRuntimeCapsuleIds,
      }),
    )
    .digest('hex')
  return `chat-execution:${digest}`
}

/** Request a fresh, explicit Run permission for the exact prepared Journey scope. */
export async function requestConversationExecution(input: RequestChatExecution, client: PrismaClient = prisma) {
  const journey = await assertSavedJourney(input, client)
  if (journey.stateHash !== input.expectedStateHash)
    throw new ServiceError('The Journey changed. Load the current run scope.', 'CONFLICT', 409)
  const prepared = await client.qualityJourneyPreparedRuntimeCapsule.findMany({
    where: {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: journey.activeCycleId,
      status: 'PREPARED',
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  if (!prepared.length) throw new ServiceError('The approved tests are not prepared yet.', 'CONFLICT', 409)
  const preparedRuntimeCapsuleIds = prepared.map(item => item.id)
  return startQualityJourneyExecution(
    {
      targetProjectId: input.targetProjectId,
      journeyId: input.journeyId,
      environmentId: input.environmentId,
      browserEngine: input.browserEngine,
      expectedStateHash: input.expectedStateHash,
      preparedRuntimeCapsuleIds,
      idempotencyKey: attemptKey({ ...input, preparedRuntimeCapsuleIds }),
    },
    client,
    trustedHumanCoordinatorSession,
    chatOptions(input, true),
  )
}

/** Recover a saved request, grant it through Appraise, then reserve its one runner attempt. */
export async function approveConversationExecution(input: ApproveChatExecution, client: PrismaClient = prisma) {
  await assertSavedJourney(input, client)
  const consent = await client.qualityJourneyExecutionConsent.findFirst({
    where: {
      id: input.executionConsentId,
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      scopeHash: input.expectedScopeHash,
    },
  })
  if (!consent) throw new ServiceError('Run permission changed. Load the current scope.', 'CONFLICT', 409)
  const scope = qualityJourneyExecutionConsentScopeSchema.parse(JSON.parse(consent.scopeJson))
  if (scope.chatConversationId !== input.conversationId || !scope.journeyStateHash)
    throw new ServiceError('Run permission belongs to another attempt.', 'CONFLICT', 409)
  if (consent.status === 'CONSUMED' && consent.executionCycleId) return readConversationExecution(input, client)
  const observed = await readConversationExecution(input, client)
  if (observed.permission?.id !== consent.id || observed.permission.stale || observed.permission.expired)
    throw new ServiceError('Run permission changed. Request the current scope.', 'CONFLICT', 409)
  if (consent.status !== 'REQUESTED' && consent.status !== 'GRANTED')
    throw new ServiceError('Run permission is unavailable. Request a fresh scope.', 'CONFLICT', 409)
  if (consent.expiresAt && consent.expiresAt <= new Date())
    throw new ServiceError('Run permission expired. Request a fresh scope.', 'CONFLICT', 409)
  const checkpoint = /^START_EXECUTION:(.+):(CHROMIUM|FIREFOX|WEBKIT)$/.exec(scope.checkpoint)
  if (!checkpoint) throw new ServiceError('Run permission has an invalid execution target.', 'CONFLICT', 409)
  const request = {
    targetProjectId: input.targetProjectId,
    conversationId: input.conversationId,
    journeyId: input.journeyId,
    environmentId: checkpoint[1]!,
    browserEngine: checkpoint[2] as RequestChatExecution['browserEngine'],
    expectedStateHash: scope.journeyStateHash,
    preparedRuntimeCapsuleIds: scope.preparedRuntimeCapsuleIds,
  }
  try {
    await startQualityJourneyExecution(
      {
        journeyId: request.journeyId,
        targetProjectId: request.targetProjectId,
        environmentId: request.environmentId,
        browserEngine: request.browserEngine,
        expectedStateHash: request.expectedStateHash,
        preparedRuntimeCapsuleIds: request.preparedRuntimeCapsuleIds,
        idempotencyKey: attemptKey(request),
        executionConsentId: consent.id,
      },
      client,
      trustedHumanCoordinatorSession,
      chatOptions(input, undefined, input.expectedScopeHash),
    )
  } catch (error) {
    const latest = await client.qualityJourneyExecutionConsent.findUnique({ where: { id: consent.id } })
    if (latest?.status !== 'CONSUMED' || !latest.executionCycleId) throw error
    // Reservation committed before the reply was lost. Observe it without dispatching again.
  }
  return readConversationExecution(input, client)
}

/** Render only persisted Appraise consent and runner observations after reconnect. */
export async function readConversationExecution(input: ChatExecutionScope, client: PrismaClient = prisma) {
  const journey = await assertSavedJourney(input, client)
  const execution = await getQualityJourneyExecution(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    client,
  )
  const permission = execution.consents
    .map(consent => ({ ...consent, scope: qualityJourneyExecutionConsentScopeSchema.parse(consent.scope) }))
    .filter(consent => consent.scope.chatConversationId === input.conversationId)
    .findLast(consent => ['REQUESTED', 'GRANTED'].includes(consent.status))
  const checkpoint = permission
    ? /^START_EXECUTION:(.+):(CHROMIUM|FIREFOX|WEBKIT)$/.exec(permission.scope.checkpoint)
    : null
  const [prepared, target, environment] = permission
    ? await Promise.all([
        client.qualityJourneyPreparedRuntimeCapsule.findMany({
          where: {
            id: { in: permission.scope.preparedRuntimeCapsuleIds },
            journeyId: input.journeyId,
            targetProjectId: input.targetProjectId,
          },
          include: { materialization: { include: { scenarioRevision: true } } },
        }),
        client.targetProject.findUnique({
          where: { id: input.targetProjectId },
          select: { displayName: true, fingerprint: true, kind: true },
        }),
        client.environment.findFirst({
          where: { id: checkpoint?.[1] ?? '', targetProjectId: input.targetProjectId },
        }),
      ])
    : [[], null, null]
  const environmentMatches =
    permission && target && environment
      ? freezeJourneyExecutionEnvironment(environment, target.kind).hash === permission.scope.environmentSnapshotHash
      : false
  const scenarios = permission
    ? permission.scope.preparedRuntimeCapsuleIds.map(id => {
        const capsule = prepared.find(item => item.id === id)
        const intent = capsule
          ? (JSON.parse(capsule.materialization.scenarioRevision.behavioralIntentJson) as unknown)
          : null
        const title = intent && typeof intent === 'object' && 'title' in intent ? intent.title : null
        return {
          preparedRuntimeCapsuleId: id,
          scenarioRevisionId: capsule?.materialization.scenarioRevisionId ?? null,
          title: typeof title === 'string' ? title : null,
        }
      })
    : []
  return {
    journeyStateHash: journey.stateHash,
    paused: journey.status === 'PAUSED',
    execution,
    permission: permission
      ? {
          ...permission,
          stale:
            permission.scope.journeyStateHash !== journey.stateHash ||
            prepared.length !== permission.scope.preparedRuntimeCapsuleIds.length ||
            target?.fingerprint !== permission.scope.targetFingerprint ||
            !environmentMatches,
          expired: permission.expiresAt !== null && permission.expiresAt <= Date.now(),
          scenarios,
          target: target?.displayName ?? null,
          environment: environmentMatches
            ? { name: environment!.name, baseUrl: environment!.baseUrl, browserEngine: checkpoint![2] }
            : null,
        }
      : null,
    cycles: execution.cycles,
  }
}
