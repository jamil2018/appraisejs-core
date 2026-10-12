import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import { assertCurrentCoordinatorSession, type CoordinatorSessionBinding } from './quality-journey-coordinator-session'
import { replaceQualityJourneyWorkAuthorizationForTakeoverInTransaction } from './quality-journey-service'
import { assertQualityJourneyMutable } from './quality-journey-terminal'

const HANDOFF_TTL_MS = 10 * 60 * 1_000
const TAKEOVER_APPROVAL_TTL_MS = 5 * 60 * 1_000
const expirableHandoffStatuses = ['PREPARED', 'FAILED', 'LAUNCHING', 'LAUNCHED']
type Db = PrismaClient | Prisma.TransactionClient
type LaunchResult = { outcome: 'LAUNCHED' | 'UNAVAILABLE'; reason?: string }
export type CoordinatorProvider = {
  id: string
  launch(deepLink: string): Promise<LaunchResult>
  /** Stock Codex does not currently offer a trustworthy task-reopen deep link.
   * A future registered provider may opt in only after it supplies a bounded,
   * validated reconnect URL contract. */
  supportsKnownTaskReconnect?: boolean
}

function digest(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function launchCodex(deepLink: string): Promise<LaunchResult> {
  if (process.platform !== 'darwin') return { outcome: 'UNAVAILABLE', reason: 'Codex deep-link launch requires macOS.' }
  return new Promise(resolve => {
    const child = spawn('open', [deepLink], { stdio: 'ignore' })
    let settled = false
    child.once('error', error => {
      if (settled) return
      settled = true
      resolve({ outcome: 'UNAVAILABLE', reason: error.message })
    })
    child.once('close', code => {
      if (settled) return
      settled = true
      resolve(
        code === 0
          ? { outcome: 'LAUNCHED' }
          : { outcome: 'UNAVAILABLE', reason: `Codex deep-link handler exited with status ${code ?? 'unknown'}.` },
      )
    })
  })
}

const codexCoordinatorProvider: CoordinatorProvider = {
  id: 'codex',
  launch: launchCodex,
  supportsKnownTaskReconnect: false,
}
const coordinatorProviderRegistry = Object.freeze({ codex: codexCoordinatorProvider })

function registeredProvider(id: string) {
  const provider = coordinatorProviderRegistry[id as keyof typeof coordinatorProviderRegistry]
  if (!provider) throw new ServiceError('Coordinator provider is not registered.', 'VALIDATION', 400)
  return provider
}

async function expireActiveHandoff(handoffId: string, client: Db) {
  await client.qualityJourneyCoordinatorHandoff.updateMany({
    where: { id: handoffId, connectedAt: null, status: { in: expirableHandoffStatuses } },
    data: { status: 'EXPIRED', failedAt: new Date(), failureCode: 'TICKET_EXPIRED' },
  })
}

function currentLaunchResult(handoffId: string, status: string) {
  if (status === 'CONNECTED') return { handoffId, status: 'CONNECTED' as const }
  if (status === 'LAUNCHED') return { handoffId, status: 'LAUNCHED' as const }
  if (status === 'LAUNCHING') return { handoffId, status: 'LAUNCHING' as const }
  throw new ServiceError('Coordinator handoff is no longer launchable. Prepare a new one.', 'CONFLICT')
}

async function persistLaunchOutcome(handoffId: string, launched: LaunchResult, client: PrismaClient) {
  const now = new Date()
  if (launched.outcome === 'UNAVAILABLE') {
    const failed = await client.qualityJourneyCoordinatorHandoff.updateMany({
      where: { id: handoffId, connectedAt: null, status: 'LAUNCHING' },
      data: { status: 'FAILED', failedAt: now, failureCode: 'PROVIDER_UNAVAILABLE' },
    })
    if (failed.count === 1) return { handoffId, status: 'FAILED' as const, reason: launched.reason }
    const current = await client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: handoffId } })
    if (current.status === 'CONNECTED') return { handoffId, status: 'CONNECTED' as const }
    throw new ServiceError('Coordinator handoff was superseded while launching.', 'CONFLICT')
  }
  const completed = await client.qualityJourneyCoordinatorHandoff.updateMany({
    where: { id: handoffId, connectedAt: null, status: 'LAUNCHING', expiresAt: { gt: now } },
    data: { status: 'LAUNCHED', launchedAt: now },
  })
  if (completed.count === 1) return { handoffId, status: 'LAUNCHED' as const }
  const current = await client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: handoffId } })
  if (current.status === 'CONNECTED') return { handoffId, status: 'CONNECTED' as const }
  throw new ServiceError('Coordinator handoff was superseded while launching.', 'CONFLICT')
}

function coordinatorBootstrapPrompt(input: {
  journeyId: string
  targetReference: string
  ticket: string
  reconnect: boolean
}) {
  return `Use $appraise-quality-journey. Redeem one-time ticket ${input.ticket} for Journey ${input.journeyId} and target ${input.targetReference} with quality_journey_handoff_redeem, then call quality_journey_get. Read the authoritative Journey, handoff, assignment, and pending-event state from AppraiseJS before acting.${input.reconnect ? ' This is a later-stage reconnect; reconcile any ambiguous prior external effect before preparing replacement work.' : ''} Redemption and this prompt do not authorize Journey work, claim an assignment, transfer lifecycle authority, or approve a takeover.`
}

function targetReference(target: { kind: string; canonicalIdentity: string; normalizedRemoteOrigin: string | null }) {
  if (target.kind === 'REMOTE_BLACK_BOX') {
    if (!target.normalizedRemoteOrigin)
      throw new ServiceError('Remote target is missing its normalized origin.', 'CONFLICT')
    return target.normalizedRemoteOrigin
  }
  return target.canonicalIdentity
}

function handoffWorkspacePath(target: { kind: string; canonicalPath: string | null }, handoffId: string) {
  if (target.kind === 'LOCAL_WORKSPACE') {
    if (!target.canonicalPath || !path.isAbsolute(target.canonicalPath))
      throw new ServiceError('Local target is missing a validated absolute workspace path.', 'CONFLICT')
    return path.normalize(target.canonicalPath)
  }
  return path.join(os.tmpdir(), `appraisejs-codex-neutral-${handoffId}`)
}

async function createNeutralWorkspace(workspacePath: string) {
  try {
    await mkdir(workspacePath, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new ServiceError('Neutral Codex host context already exists. Prepare a fresh handoff.', 'CONFLICT')
    throw error
  }
}

function buildCodexDeepLink(workspacePath: string, prompt: string) {
  const url = new URL('codex://new')
  url.searchParams.set('path', workspacePath)
  url.searchParams.set('prompt', prompt)
  return url.toString()
}

function validateCodexDeepLink(value: string, expectedPath: string, expectedPromptHash: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ServiceError('Codex launch link is invalid.', 'VALIDATION', 400)
  }
  const keys = [...url.searchParams.keys()]
  const prompt = url.searchParams.get('prompt')
  const workspacePath = url.searchParams.get('path')
  if (
    url.protocol !== 'codex:' ||
    url.hostname !== 'new' ||
    url.pathname !== '' ||
    keys.length !== 2 ||
    new Set(keys).size !== 2 ||
    !prompt ||
    digest(prompt) !== expectedPromptHash ||
    !workspacePath ||
    !path.isAbsolute(workspacePath) ||
    path.normalize(workspacePath) !== expectedPath
  )
    throw new ServiceError('Codex launch link does not match the prepared handoff.', 'VALIDATION', 400)
  return url.toString()
}

async function scopedJourney(journeyId: string, targetProjectId: string, client: Db) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: journeyId, targetProjectId },
    include: {
      targetProject: {
        select: { canonicalIdentity: true, canonicalPath: true, kind: true, normalizedRemoteOrigin: true },
      },
    },
  })
  if (!journey) throw new ServiceError('Quality Journey was not found for the active project.', 'NOT_FOUND', 404)
  assertQualityJourneyMutable(journey)
  return journey
}

type HandoffSnapshot = {
  journeyStateHash: string
  journeyStage: string
  revisionSnapshotHash: string
  workSnapshotHash: string
  eventSequence: number
  targetReferenceHash: string
}

type HandoffEffect = {
  id: string
  workItemId: string
  status: string
  leaseId: string
  assignmentGeneration: number
  authorizationId: string | null
  assignmentId: string | null
  leaseExpiresAt: Date
  dispatchKey: string | null
  dispatchAdapterId: string | null
  dispatchReservedAt: Date | null
  dispatchStartedAt: Date | null
  spawnReceiptId: string | null
  spawnReceiptHash: string | null
  resultHash: string | null
  failureJson: string | null
  cancelledAt: Date | null
  completedAt: Date | null
}

type EffectRecovery = {
  state: 'NO_EFFECTS' | 'TERMINAL_EFFECTS_RECONCILED' | 'ACTIVE_EFFECTS_FENCEABLE' | 'RECONCILIATION_REQUIRED'
  activeAttemptIds: string[]
  terminalAttemptIds: string[]
  ambiguousAttemptIds: string[]
  expiredAttemptIds: string[]
  nextAction: string
}

function effectRecovery(attempts: HandoffEffect[], now = new Date()): EffectRecovery {
  const active = attempts.filter(attempt => ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'].includes(attempt.status))
  const terminal = attempts.filter(attempt => !active.includes(attempt))
  const ambiguous = attempts.filter(
    attempt =>
      attempt.status === 'DISPATCH_UNRESOLVED' ||
      (attempt.status === 'WORKER_REQUESTED' && Boolean(attempt.dispatchStartedAt) && !attempt.spawnReceiptId),
  )
  const expired = active.filter(attempt => attempt.leaseExpiresAt <= now)
  if (ambiguous.length || expired.length)
    return {
      state: 'RECONCILIATION_REQUIRED',
      activeAttemptIds: active.map(attempt => attempt.id),
      terminalAttemptIds: terminal.map(attempt => attempt.id),
      ambiguousAttemptIds: ambiguous.map(attempt => attempt.id),
      expiredAttemptIds: expired.map(attempt => attempt.id),
      nextAction:
        'Reconcile the persisted adapter dispatch and lease state before approving takeover; Appraise will not replace ambiguous work.',
    }
  if (active.length)
    return {
      state: 'ACTIVE_EFFECTS_FENCEABLE',
      activeAttemptIds: active.map(attempt => attempt.id),
      terminalAttemptIds: terminal.map(attempt => attempt.id),
      ambiguousAttemptIds: [],
      expiredAttemptIds: [],
      nextAction:
        'Approved takeover will revoke and cancel these active predecessor attempts before the successor is effective.',
    }
  return {
    state: terminal.length ? 'TERMINAL_EFFECTS_RECONCILED' : 'NO_EFFECTS',
    activeAttemptIds: [],
    terminalAttemptIds: terminal.map(attempt => attempt.id),
    ambiguousAttemptIds: [],
    expiredAttemptIds: [],
    nextAction: terminal.length
      ? 'Terminal work effects are retained in the authoritative snapshot; review them before issuing any new work.'
      : 'No active external work effect is recorded.',
  }
}

function snapshotDigest(value: unknown) {
  return digest(JSON.stringify(value))
}

async function handoffSnapshot(
  journey: Awaited<ReturnType<typeof scopedJourney>>,
  client: Db,
): Promise<HandoffSnapshot> {
  const [items, attempts, authorizations, eventCount] = await Promise.all([
    client.qualityJourneyWorkItem.findMany({
      where: { journeyId: journey.id },
      select: { id: true, status: true, currentAttempt: true, version: true, inputHash: true },
      orderBy: { id: 'asc' },
    }),
    client.qualityJourneyWorkAttempt.findMany({
      where: { workItem: { journeyId: journey.id, targetProjectId: journey.targetProjectId } },
      select: {
        id: true,
        workItemId: true,
        status: true,
        leaseId: true,
        assignmentGeneration: true,
        authorizationId: true,
        assignmentId: true,
        leaseExpiresAt: true,
        dispatchKey: true,
        dispatchAdapterId: true,
        dispatchReservedAt: true,
        dispatchStartedAt: true,
        spawnReceiptId: true,
        spawnReceiptHash: true,
        resultHash: true,
        failureJson: true,
        cancelledAt: true,
        completedAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    client.qualityJourneyWorkAuthorization.findMany({
      where: { journeyId: journey.id, targetProjectId: journey.targetProjectId },
      select: { id: true, workItemId: true, revokedAt: true, cancelledAt: true, externalOptedInAt: true },
      orderBy: { id: 'asc' },
    }),
    client.qualityJourneyEvent.count({ where: { journeyId: journey.id } }),
  ])
  return {
    journeyStateHash: journey.stateHash,
    journeyStage: journey.stage,
    revisionSnapshotHash: snapshotDigest(JSON.parse(journey.activeRevisionIdsJson)),
    workSnapshotHash: snapshotDigest({
      items,
      authorizations: authorizations.map(authorization => ({
        ...authorization,
        revokedAt: authorization.revokedAt?.toISOString() ?? null,
        cancelledAt: authorization.cancelledAt?.toISOString() ?? null,
        externalOptedInAt: authorization.externalOptedInAt?.toISOString() ?? null,
      })),
      attempts: attempts.map(attempt => ({
        ...attempt,
        leaseExpiresAt: attempt.leaseExpiresAt.toISOString(),
        dispatchReservedAt: attempt.dispatchReservedAt?.toISOString() ?? null,
        dispatchStartedAt: attempt.dispatchStartedAt?.toISOString() ?? null,
        cancelledAt: attempt.cancelledAt?.toISOString() ?? null,
        completedAt: attempt.completedAt?.toISOString() ?? null,
      })),
    }),
    eventSequence: eventCount,
    targetReferenceHash: digest(targetReference(journey.targetProject)),
  }
}

async function readHandoffEffects(journeyId: string, targetProjectId: string, client: Db) {
  return client.qualityJourneyWorkAttempt.findMany({
    where: { workItem: { journeyId, targetProjectId } },
    select: {
      id: true,
      workItemId: true,
      status: true,
      leaseId: true,
      assignmentGeneration: true,
      authorizationId: true,
      assignmentId: true,
      leaseExpiresAt: true,
      dispatchKey: true,
      dispatchAdapterId: true,
      dispatchReservedAt: true,
      dispatchStartedAt: true,
      spawnReceiptId: true,
      spawnReceiptHash: true,
      resultHash: true,
      failureJson: true,
      cancelledAt: true,
      completedAt: true,
    },
    orderBy: { id: 'asc' },
  })
}

function storedSnapshot(handoff: {
  journeyStateHash: string | null
  journeyStage: string | null
  revisionSnapshotHash: string | null
  workSnapshotHash: string | null
  eventSequence: number | null
  targetReferenceHash: string | null
}): HandoffSnapshot {
  if (
    !handoff.journeyStateHash ||
    !handoff.journeyStage ||
    !handoff.revisionSnapshotHash ||
    !handoff.workSnapshotHash ||
    handoff.eventSequence === null ||
    !handoff.targetReferenceHash
  )
    throw new ServiceError(
      'Coordinator handoff predates reconnect safety snapshots. Prepare a fresh handoff.',
      'CONFLICT',
    )
  return {
    journeyStateHash: handoff.journeyStateHash,
    journeyStage: handoff.journeyStage,
    revisionSnapshotHash: handoff.revisionSnapshotHash,
    workSnapshotHash: handoff.workSnapshotHash,
    eventSequence: handoff.eventSequence,
    targetReferenceHash: handoff.targetReferenceHash,
  }
}

function sameSnapshot(left: HandoffSnapshot, right: HandoffSnapshot) {
  return (
    left.journeyStateHash === right.journeyStateHash &&
    left.journeyStage === right.journeyStage &&
    left.revisionSnapshotHash === right.revisionSnapshotHash &&
    left.workSnapshotHash === right.workSnapshotHash &&
    left.eventSequence === right.eventSequence &&
    left.targetReferenceHash === right.targetReferenceHash
  )
}

/**
 * C1.3 does not implement worker roles. It only binds existing claim/dispatch
 * ingress to the effective coordinator session after an approved takeover so
 * a fenced task cannot create or dispatch new work through an old generation.
 */
export { assertCurrentCoordinatorSession, type CoordinatorSessionBinding }

async function assertHandoffSnapshotCurrent(
  handoff: {
    journeyId: string
    targetProjectId: string
    journeyStateHash: string | null
    journeyStage: string | null
    revisionSnapshotHash: string | null
    workSnapshotHash: string | null
    eventSequence: number | null
    targetReferenceHash: string | null
  },
  client: Db,
) {
  const journey = await scopedJourney(handoff.journeyId, handoff.targetProjectId, client)
  const current = await handoffSnapshot(journey, client)
  if (!sameSnapshot(storedSnapshot(handoff), current))
    throw new ServiceError(
      'Coordinator handoff snapshot is stale. Re-read the authoritative Journey and prepare a fresh reconnect.',
      'CONFLICT',
    )
  return { journey, snapshot: current }
}

export async function prepareQualityJourneyHandoff(
  input: {
    journeyId: string
    targetProjectId: string
    providerId: string
  },
  client: PrismaClient = prisma,
) {
  const provider = registeredProvider(input.providerId)
  for (let preparationAttempt = 0; preparationAttempt < 3; preparationAttempt++) {
    try {
      return await client.$transaction(async tx => {
        const journey = await scopedJourney(input.journeyId, input.targetProjectId, tx)
        const snapshot = await handoffSnapshot(journey, tx)
        const ticket = `qjh_${randomBytes(24).toString('base64url')}`
        const takeoverApproval = `qjha_${randomBytes(24).toString('base64url')}`
        const takeoverRequestId = `qjhr_${randomBytes(24).toString('base64url')}`
        const normalizedTargetReference = targetReference(journey.targetProject)
        const priorTask = await tx.qualityJourneyCoordinatorHandoff.findFirst({
          where: {
            journeyId: journey.id,
            targetProjectId: journey.targetProjectId,
            coordinatorTaskId: { not: null },
            status: { not: 'FENCED' },
          },
          orderBy: [{ generation: 'desc' }, { id: 'desc' }],
          select: { coordinatorTaskId: true },
        })
        const hasKnownTask = Boolean(priorTask?.coordinatorTaskId)
        const reconnectSupported = hasKnownTask && provider.supportsKnownTaskReconnect === true
        const prompt = coordinatorBootstrapPrompt({
          journeyId: journey.id,
          targetReference: normalizedTargetReference,
          ticket,
          reconnect: journey.stage !== 'INTAKE',
        })
        const handoffId = `qjh_${randomUUID()}`
        const workspacePath = handoffWorkspacePath(journey.targetProject, handoffId)
        const launchUrl = buildCodexDeepLink(workspacePath, prompt)
        const preparedAt = new Date()
        const expiresAt = new Date(preparedAt.getTime() + HANDOFF_TTL_MS)
        const takeoverApprovalExpiresAt = new Date(
          Math.min(expiresAt.getTime(), preparedAt.getTime() + TAKEOVER_APPROVAL_TTL_MS),
        )
        const previousGeneration = await tx.qualityJourneyCoordinatorHandoff.findFirst({
          where: { journeyId: journey.id, targetProjectId: journey.targetProjectId },
          orderBy: [{ generation: 'desc' }, { id: 'desc' }],
          select: { generation: true },
        })
        await tx.qualityJourneyCoordinatorHandoff.updateMany({
          where: {
            journeyId: journey.id,
            targetProjectId: journey.targetProjectId,
            connectedAt: null,
            status: { in: expirableHandoffStatuses },
          },
          data: { status: 'EXPIRED', failedAt: preparedAt, failureCode: 'HANDOFF_SUPERSEDED' },
        })
        const handoff = await tx.qualityJourneyCoordinatorHandoff.create({
          data: {
            id: handoffId,
            journeyId: journey.id,
            targetProjectId: journey.targetProjectId,
            providerId: input.providerId,
            generation: (previousGeneration?.generation ?? 0) + 1,
            ...snapshot,
            takeoverApprovalHash: digest(takeoverApproval),
            takeoverApprovalExpiresAt,
            takeoverRequestHash: digest(takeoverRequestId),
            ticketHash: digest(ticket),
            promptHash: digest(prompt),
            expiresAt,
          },
        })
        return {
          handoffId: handoff.id,
          providerId: handoff.providerId,
          status: handoff.status,
          prompt,
          launchUrl,
          targetReference: normalizedTargetReference,
          hostContext: journey.targetProject.kind === 'LOCAL_WORKSPACE' ? 'TARGET_WORKSPACE' : 'NEUTRAL_WORKSPACE',
          expiresAt,
          canLaunch: true,
          generation: handoff.generation,
          takeoverApproval,
          takeoverRequestId,
          takeoverApprovalExpiresAt,
          recovery: {
            mode: reconnectSupported ? ('KNOWN_TASK_RECONNECT' as const) : ('FRESH_SCOPED_HANDOFF' as const),
            knownTask: hasKnownTask ? ('RECORDED' as const) : ('NOT_RECORDED' as const),
            guidance: reconnectSupported
              ? 'The registered coordinator provider supports reopening the known task for this exact snapshot.'
              : hasKnownTask
                ? 'A known Codex task was recorded, but this provider cannot safely reopen it. A fresh scoped handoff was prepared.'
                : 'No known Codex task is recorded. A fresh scoped handoff was prepared.',
          },
        }
      })
    } catch (error) {
      // Generation is unique per Journey/target. A simultaneous prepare may
      // observe the same predecessor generation; retrying re-reads the
      // authoritative maximum instead of issuing an ambiguous session.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002' ||
        preparationAttempt === 2
      )
        throw error
    }
  }
  throw new ServiceError('Coordinator handoff generation could not be allocated.', 'CONFLICT')
}

export async function launchQualityJourneyHandoff(
  input: { handoffId: string; journeyId: string; targetProjectId: string; launchUrl: string },
  provider: CoordinatorProvider | undefined = undefined,
  client: PrismaClient = prisma,
) {
  const handoff = await client.qualityJourneyCoordinatorHandoff.findFirst({
    where: { id: input.handoffId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    include: { targetProject: { select: { canonicalPath: true, kind: true } } },
  })
  if (!handoff) throw new ServiceError('Coordinator handoff was not found.', 'NOT_FOUND', 404)
  const launcher = provider ?? registeredProvider(handoff.providerId)
  if (handoff.providerId !== launcher.id) throw new ServiceError('Coordinator provider does not match.', 'CONFLICT')
  if (handoff.status === 'CONNECTED') return { handoffId: handoff.id, status: 'CONNECTED' as const }
  if (handoff.status === 'FENCED')
    throw new ServiceError('Coordinator handoff was fenced by a newer approved takeover.', 'CONFLICT')
  if (handoff.status === 'EXPIRED')
    throw new ServiceError('Coordinator handoff expired. Prepare a new one.', 'CONFLICT')
  if (handoff.expiresAt <= new Date()) {
    await expireActiveHandoff(handoff.id, client)
    throw new ServiceError('Coordinator handoff expired. Prepare a new one.', 'CONFLICT')
  }
  if (handoff.status === 'LAUNCHED') return { handoffId: handoff.id, status: 'LAUNCHED' as const }
  if (handoff.status === 'LAUNCHING') return { handoffId: handoff.id, status: 'LAUNCHING' as const }
  await assertHandoffSnapshotCurrent(handoff, client)
  const workspacePath = handoffWorkspacePath(handoff.targetProject, handoff.id)
  const launchUrl = validateCodexDeepLink(input.launchUrl, workspacePath, handoff.promptHash)
  if (handoff.targetProject.kind === 'REMOTE_BLACK_BOX') await createNeutralWorkspace(workspacePath)

  const launchStartedAt = new Date()
  const reservation = await client.qualityJourneyCoordinatorHandoff.updateMany({
    where: {
      id: handoff.id,
      connectedAt: null,
      status: { in: ['PREPARED', 'FAILED'] },
      expiresAt: { gt: launchStartedAt },
    },
    data: { status: 'LAUNCHING', failedAt: null, failureCode: null },
  })
  if (reservation.count === 0) {
    const current = await client.qualityJourneyCoordinatorHandoff.findUniqueOrThrow({ where: { id: handoff.id } })
    return currentLaunchResult(handoff.id, current.status)
  }
  let launched: LaunchResult
  try {
    launched = await launcher.launch(launchUrl)
  } catch (error) {
    launched = { outcome: 'UNAVAILABLE', reason: error instanceof Error ? error.message : 'Coordinator launch failed.' }
  }
  return persistLaunchOutcome(handoff.id, launched, client)
}

export async function redeemQualityJourneyHandoff(
  input: {
    journeyId: string
    targetProjectId: string
    ticket: string
    coordinatorTaskId?: string
  },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const handoff = await tx.qualityJourneyCoordinatorHandoff.findUnique({
      where: { ticketHash: digest(input.ticket) },
    })
    if (!handoff || handoff.journeyId !== input.journeyId || handoff.targetProjectId !== input.targetProjectId)
      throw new ServiceError('Coordinator handoff ticket is invalid for this Journey and target.', 'UNAUTHORIZED', 401)
    if (handoff.status === 'FENCED')
      throw new ServiceError('Coordinator handoff was fenced by a newer approved takeover.', 'CONFLICT')
    if (handoff.connectedAt) throw new ServiceError('Coordinator handoff ticket has already been redeemed.', 'CONFLICT')
    if (handoff.status === 'EXPIRED')
      throw new ServiceError('Coordinator handoff ticket is invalid for this Journey and target.', 'UNAUTHORIZED', 401)
    if (handoff.expiresAt <= new Date()) {
      await expireActiveHandoff(handoff.id, tx)
      throw new ServiceError('Coordinator handoff ticket expired.', 'UNAUTHORIZED', 401)
    }
    await assertHandoffSnapshotCurrent(handoff, tx)
    const recovery = effectRecovery(await readHandoffEffects(handoff.journeyId, handoff.targetProjectId, tx))
    const connectedAt = new Date()
    const redemption = await tx.qualityJourneyCoordinatorHandoff.updateMany({
      where: {
        id: handoff.id,
        generation: handoff.generation,
        connectedAt: null,
        status: { in: ['PREPARED', 'LAUNCHING', 'LAUNCHED', 'FAILED'] },
        expiresAt: { gt: connectedAt },
      },
      data: {
        status: 'CONNECTED',
        connectedAt,
        failedAt: null,
        failureCode: null,
        ...(input.coordinatorTaskId ? { coordinatorTaskId: input.coordinatorTaskId } : {}),
      },
    })
    if (redemption.count !== 1)
      throw new ServiceError('Coordinator handoff ticket has already been redeemed or expired.', 'CONFLICT')
    return {
      handoffId: handoff.id,
      providerId: handoff.providerId,
      connectedAt,
      generation: handoff.generation,
      takeover: 'USER_APPROVAL_REQUIRED' as const,
      recovery,
    }
  })
}

/**
 * This is intentionally a UI-only coordinator-session transition. It does not
 * claim an Appraise work item, issue a lease, or authorize C2 execution.
 * Before the successor becomes effective every connected predecessor is fenced
 * in the same transaction, and every authoritative snapshot is re-read.
 */
export async function approveQualityJourneyHandoffTakeover(
  input: {
    handoffId: string
    journeyId: string
    targetProjectId: string
    generation: number
    takeoverApproval: string
    takeoverRequestId: string
    approvedBy: 'local-ui'
  },
  client: PrismaClient = prisma,
) {
  return client.$transaction(async tx => {
    const handoff = await tx.qualityJourneyCoordinatorHandoff.findFirst({
      where: { id: input.handoffId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!handoff) throw new ServiceError('Coordinator handoff was not found.', 'NOT_FOUND', 404)
    if (handoff.generation !== input.generation)
      throw new ServiceError('Coordinator handoff generation is stale.', 'CONFLICT')
    if (!handoff.takeoverApprovalHash || handoff.takeoverApprovalHash !== digest(input.takeoverApproval))
      throw new ServiceError('Coordinator takeover approval is invalid or stale.', 'UNAUTHORIZED', 403)
    if (!handoff.takeoverRequestHash || handoff.takeoverRequestHash !== digest(input.takeoverRequestId))
      throw new ServiceError('Coordinator takeover request identity is invalid or stale.', 'UNAUTHORIZED', 403)
    if (handoff.takeoverAt)
      return handoff.takeoverResultJson
        ? {
            ...(JSON.parse(handoff.takeoverResultJson) as Record<string, unknown>),
            replayed: true,
            current: handoff.status === 'CONNECTED' && !handoff.fencedAt,
          }
        : {
            handoffId: handoff.id,
            generation: handoff.generation,
            replayed: true,
            takeoverAt: handoff.takeoverAt,
            current: handoff.status === 'CONNECTED' && !handoff.fencedAt,
          }
    const latest = await tx.qualityJourneyCoordinatorHandoff.findFirst({
      where: { journeyId: handoff.journeyId, targetProjectId: handoff.targetProjectId },
      orderBy: [{ generation: 'desc' }, { id: 'desc' }],
      select: { id: true },
    })
    if (latest?.id !== handoff.id)
      throw new ServiceError('Coordinator handoff was superseded by a newer generation.', 'CONFLICT')
    if (handoff.status === 'FENCED')
      throw new ServiceError('Coordinator handoff was fenced by a newer approved takeover.', 'CONFLICT')
    if (handoff.status !== 'CONNECTED' || !handoff.connectedAt)
      throw new ServiceError('Redeem the exact coordinator handoff before requesting takeover approval.', 'CONFLICT')
    if (!handoff.takeoverApprovalExpiresAt || handoff.takeoverApprovalExpiresAt <= new Date())
      throw new ServiceError('Coordinator takeover approval expired. Prepare a fresh handoff.', 'CONFLICT')
    const { journey, snapshot } = await assertHandoffSnapshotCurrent(handoff, tx)
    const effects = effectRecovery(await readHandoffEffects(handoff.journeyId, handoff.targetProjectId, tx))
    if (effects.state === 'RECONCILIATION_REQUIRED')
      throw new ServiceError(
        'Coordinator takeover is blocked until ambiguous dispatches and expired leases are reconciled.',
        'CONFLICT',
        409,
        { recovery: effects },
      )
    const now = new Date()
    const activeWorkItemIds = [...new Set(effects.activeAttemptIds.map(id => id))]
    const activeAttempts = await tx.qualityJourneyWorkAttempt.findMany({
      where: { id: { in: activeWorkItemIds } },
      select: { id: true, workItemId: true, authorizationId: true },
    })
    const affectedWorkItemIds = [...new Set(activeAttempts.map(attempt => attempt.workItemId))]
    const resultAuthorizationIds: string[] = []
    // Fence the old attempt/lease authority first. A late old worker can no
    // longer dispatch, complete, or otherwise use its lease once this commits.
    if (activeAttempts.length) {
      await tx.qualityJourneyWorkAttempt.updateMany({
        where: {
          id: { in: activeAttempts.map(attempt => attempt.id) },
          status: { in: ['CLAIMED', 'WORKER_REQUESTED', 'IN_PROGRESS'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: `COORDINATOR_TAKEOVER:${handoff.id}`,
          cancellationReason: 'Fenced before an explicitly approved coordinator takeover.',
          completedAt: now,
        },
      })
      await tx.qualityJourneyWorkItem.updateMany({
        where: { id: { in: affectedWorkItemIds }, status: { in: ['WORKER_REQUESTED', 'IN_PROGRESS'] } },
        data: { status: 'REPLACEMENT_REQUESTED', version: { increment: 1 } },
      })
      for (const workItemId of affectedWorkItemIds) {
        const successorAuthorization = await replaceQualityJourneyWorkAuthorizationForTakeoverInTransaction(
          handoff.journeyId,
          workItemId,
          tx,
          handoff.id,
        )
        resultAuthorizationIds.push(successorAuthorization.id)
      }
    }
    await tx.qualityJourneyCoordinatorHandoff.updateMany({
      where: {
        journeyId: handoff.journeyId,
        targetProjectId: handoff.targetProjectId,
        id: { not: handoff.id },
        status: 'CONNECTED',
        fencedAt: null,
      },
      data: { status: 'FENCED', fencedAt: now, fenceReason: `TAKEOVER:${handoff.id}` },
    })
    const result = {
      handoffId: handoff.id,
      generation: handoff.generation,
      replayed: false,
      takeoverAt: now,
      fencedAttemptIds: activeAttempts.map(attempt => attempt.id),
      successorAuthorizationIds: resultAuthorizationIds,
      current: true,
      recovery: effects,
      authoritative: {
        journeyId: journey.id,
        stage: snapshot.journeyStage,
        stateHash: snapshot.journeyStateHash,
        revisionSnapshotHash: snapshot.revisionSnapshotHash,
        workSnapshotHash: snapshot.workSnapshotHash,
        pendingEventSequence: snapshot.eventSequence,
      },
    }
    const admitted = await tx.qualityJourneyCoordinatorHandoff.updateMany({
      where: {
        id: handoff.id,
        generation: handoff.generation,
        status: 'CONNECTED',
        connectedAt: { not: null },
        takeoverAt: null,
        fencedAt: null,
      },
      data: {
        takeoverApprovedAt: now,
        takeoverApprovedBy: input.approvedBy,
        takeoverAt: now,
        takeoverResultJson: JSON.stringify(result),
      },
    })
    if (admitted.count !== 1)
      throw new ServiceError(
        'Coordinator handoff changed while approving takeover. Re-read its authoritative state.',
        'CONFLICT',
      )
    return result
  })
}

export async function inspectQualityJourneyHandoff(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const handoff = await client.qualityJourneyCoordinatorHandoff.findFirst({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    orderBy: [{ generation: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      providerId: true,
      status: true,
      promptHash: true,
      expiresAt: true,
      launchedAt: true,
      connectedAt: true,
      failedAt: true,
      failureCode: true,
      generation: true,
      coordinatorTaskId: true,
      journeyStateHash: true,
      journeyStage: true,
      revisionSnapshotHash: true,
      workSnapshotHash: true,
      eventSequence: true,
      targetReferenceHash: true,
      takeoverApprovedAt: true,
      takeoverAt: true,
      fencedAt: true,
      fenceReason: true,
      takeoverApprovalExpiresAt: true,
    },
  })
  if (!handoff) return { handoff: null }
  const recovery = effectRecovery(await readHandoffEffects(input.journeyId, input.targetProjectId, client))
  return {
    handoff: {
      ...handoff,
      status:
        expirableHandoffStatuses.includes(handoff.status) && handoff.expiresAt <= new Date()
          ? 'EXPIRED'
          : handoff.status,
      takeover: handoff.takeoverAt ? 'EFFECTIVE' : handoff.connectedAt ? 'USER_APPROVAL_REQUIRED' : 'NOT_CONNECTED',
      recovery:
        handoff.coordinatorTaskId &&
        !coordinatorProviderRegistry[handoff.providerId as keyof typeof coordinatorProviderRegistry]
          ?.supportsKnownTaskReconnect
          ? 'FRESH_SCOPED_HANDOFF_REQUIRED'
          : 'NO_KNOWN_TASK_REOPEN_REQUIRED',
      approval: {
        required: !handoff.takeoverAt && Boolean(handoff.connectedAt),
        expiresAt: handoff.takeoverApprovalExpiresAt,
        status: handoff.takeoverAt
          ? 'EFFECTIVE'
          : handoff.takeoverApprovalExpiresAt && handoff.takeoverApprovalExpiresAt <= new Date()
            ? 'EXPIRED'
            : 'PENDING',
      },
      effectRecovery: recovery,
    },
  }
}
