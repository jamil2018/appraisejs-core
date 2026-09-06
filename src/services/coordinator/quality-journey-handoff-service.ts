import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'

const HANDOFF_TTL_MS = 10 * 60 * 1_000
type LaunchResult = { outcome: 'LAUNCHED' | 'UNAVAILABLE'; reason?: string }
export type CoordinatorProvider = {
  id: string
  launch(workspacePath: string): Promise<LaunchResult>
}

function digest(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function launchCodex(workspacePath: string): Promise<LaunchResult> {
  return new Promise(resolve => {
    const child = spawn('codex', ['app', workspacePath], { detached: true, stdio: 'ignore' })
    let settled = false
    child.once('error', error => {
      if (settled) return
      settled = true
      resolve({ outcome: 'UNAVAILABLE', reason: error.message })
    })
    child.once('spawn', () => {
      if (settled) return
      settled = true
      child.unref()
      resolve({ outcome: 'LAUNCHED' })
    })
  })
}

const codexCoordinatorProvider: CoordinatorProvider = { id: 'codex', launch: launchCodex }
const coordinatorProviderRegistry = Object.freeze({ codex: codexCoordinatorProvider })

function registeredProvider(id: string) {
  const provider = coordinatorProviderRegistry[id as keyof typeof coordinatorProviderRegistry]
  if (!provider) throw new ServiceError('Coordinator provider is not registered.', 'VALIDATION', 400)
  return provider
}

function requirementSummaryFrom(contentJson: string) {
  try {
    const value = JSON.parse(contentJson) as Record<string, unknown>
    const lines = [typeof value.objective === 'string' ? `Objective: ${value.objective.trim()}` : '']
    if (typeof value.coverageRigor === 'string') lines.push(`Coverage rigor: ${value.coverageRigor}`)
    for (const [key, label] of [
      ['testDimensions', 'Test dimensions'],
      ['includedScope', 'Included scope'],
      ['excludedScope', 'Excluded scope'],
      ['environmentIds', 'Environment IDs'],
      ['actors', 'Actors'],
      ['testDataNeeds', 'Test data needs'],
      ['constraints', 'Constraints'],
      ['risks', 'Risks'],
      ['desiredEvidenceSignals', 'Desired evidence signals'],
    ] as const) {
      const items = value[key]
      if (Array.isArray(items) && items.every(item => typeof item === 'string') && items.length)
        lines.push(`${label}: ${items.join('; ')}`)
    }
    return lines.filter(Boolean).join('\n')
  } catch {
    return ''
  }
}

function coordinatorBootstrapPrompt(input: {
  journeyId: string
  targetReference: string
  requirementSummary: string
  ticket: string
}) {
  return `Use the AppraiseJS MCP tools to coordinate Quality Journey ${input.journeyId} for target ${input.targetReference}.

The user submitted this requirement through AppraiseJS:

${input.requirementSummary}

Redeem the one-time coordinator handoff ticket ${input.ticket} with quality_journey_handoff_redeem. Then read the authoritative Journey state and immutable requirement from AppraiseJS before acting. Treat this prompt as context only. Coordinate the required roles using the harness's native agent capabilities, submit lifecycle artifacts only through their specialized AppraiseJS operations, and stop whenever AppraiseJS reports that a human answer, review, consent, or approval is required.`
}

async function scopedJourney(journeyId: string, targetProjectId: string, client: PrismaClient) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: journeyId, targetProjectId },
    include: {
      targetProject: { select: { canonicalIdentity: true, canonicalPath: true, kind: true } },
      revisions: { orderBy: { revision: 'desc' }, take: 1 },
    },
  })
  if (!journey) throw new ServiceError('Quality Journey was not found for the active project.', 'NOT_FOUND', 404)
  if (!['INTAKE', 'ANALYSIS', 'ANALYSIS_REVIEW'].includes(journey.stage))
    throw new ServiceError('Coordinator handoff is available only before or during requirement analysis.', 'CONFLICT')
  return journey
}

export async function prepareQualityJourneyHandoff(
  input: {
    journeyId: string
    targetProjectId: string
    providerId: string
  },
  client: PrismaClient = prisma,
) {
  const journey = await scopedJourney(input.journeyId, input.targetProjectId, client)
  registeredProvider(input.providerId)
  const ticket = `qjh_${randomBytes(24).toString('base64url')}`
  const targetReference = journey.targetProject.canonicalIdentity
  const prompt = coordinatorBootstrapPrompt({
    journeyId: journey.id,
    targetReference,
    requirementSummary: requirementSummaryFrom(journey.revisions[0]?.contentJson ?? '{}'),
    ticket,
  })
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS)
  const handoff = await client.qualityJourneyCoordinatorHandoff.create({
    data: {
      id: `qjh_${randomUUID()}`,
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      providerId: input.providerId,
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
    expiresAt,
    canLaunch: journey.targetProject.kind === 'LOCAL_WORKSPACE' && Boolean(journey.targetProject.canonicalPath),
  }
}

export async function launchQualityJourneyHandoff(
  input: { handoffId: string; journeyId: string; targetProjectId: string },
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
  if (handoff.expiresAt <= new Date()) {
    await client.qualityJourneyCoordinatorHandoff.update({
      where: { id: handoff.id },
      data: { status: 'EXPIRED', failedAt: new Date(), failureCode: 'TICKET_EXPIRED' },
    })
    throw new ServiceError('Coordinator handoff expired. Prepare a new one.', 'CONFLICT')
  }
  if (handoff.status === 'CONNECTED') return { handoffId: handoff.id, status: 'CONNECTED' as const }
  if (handoff.targetProject.kind !== 'LOCAL_WORKSPACE' || !handoff.targetProject.canonicalPath)
    throw new ServiceError('Codex launch requires a registered local workspace.', 'CONFLICT')

  const launched = await launcher.launch(handoff.targetProject.canonicalPath)
  const now = new Date()
  if (launched.outcome === 'UNAVAILABLE') {
    const failed = await client.qualityJourneyCoordinatorHandoff.updateMany({
      where: { id: handoff.id, connectedAt: null },
      data: { status: 'FAILED', failedAt: now, failureCode: 'PROVIDER_UNAVAILABLE' },
    })
    if (failed.count === 0) return { handoffId: handoff.id, status: 'CONNECTED' as const }
    return { handoffId: handoff.id, status: 'FAILED' as const, reason: launched.reason }
  }
  const persisted = await client.qualityJourneyCoordinatorHandoff.updateMany({
    where: { id: handoff.id, connectedAt: null },
    data: { status: 'LAUNCHED', launchedAt: now, failedAt: null, failureCode: null },
  })
  if (persisted.count === 0) return { handoffId: handoff.id, status: 'CONNECTED' as const }
  return { handoffId: handoff.id, status: 'LAUNCHED' as const }
}

export async function redeemQualityJourneyHandoff(
  input: {
    journeyId: string
    targetProjectId: string
    ticket: string
  },
  client: PrismaClient = prisma,
) {
  const handoff = await client.qualityJourneyCoordinatorHandoff.findUnique({
    where: { ticketHash: digest(input.ticket) },
  })
  if (!handoff || handoff.journeyId !== input.journeyId || handoff.targetProjectId !== input.targetProjectId)
    throw new ServiceError('Coordinator handoff ticket is invalid for this Journey and target.', 'UNAUTHORIZED', 401)
  if (handoff.expiresAt <= new Date()) {
    await client.qualityJourneyCoordinatorHandoff.update({
      where: { id: handoff.id },
      data: { status: 'EXPIRED', failedAt: new Date(), failureCode: 'TICKET_EXPIRED' },
    })
    throw new ServiceError('Coordinator handoff ticket expired.', 'UNAUTHORIZED', 401)
  }
  if (handoff.connectedAt) throw new ServiceError('Coordinator handoff ticket has already been redeemed.', 'CONFLICT')
  const connectedAt = new Date()
  const redemption = await client.qualityJourneyCoordinatorHandoff.updateMany({
    where: { id: handoff.id, connectedAt: null, expiresAt: { gt: connectedAt } },
    data: { status: 'CONNECTED', connectedAt, failedAt: null, failureCode: null },
  })
  if (redemption.count !== 1)
    throw new ServiceError('Coordinator handoff ticket has already been redeemed or expired.', 'CONFLICT')
  return { handoffId: handoff.id, providerId: handoff.providerId, connectedAt }
}

export async function inspectQualityJourneyHandoff(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const handoff = await client.qualityJourneyCoordinatorHandoff.findFirst({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    orderBy: { createdAt: 'desc' },
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
    },
  })
  if (!handoff) return { handoff: null }
  return {
    handoff: {
      ...handoff,
      status: handoff.status === 'PREPARED' && handoff.expiresAt <= new Date() ? 'EXPIRED' : handoff.status,
    },
  }
}
