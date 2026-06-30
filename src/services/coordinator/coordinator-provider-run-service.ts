import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { getProviderAdapter, providerAdapters } from '@/lib/provider-runtime/mock-provider-adapter'
import type {
  NormalizedProviderEvent,
  ProviderAdapter,
  ProviderRunStatus,
} from '@/lib/provider-runtime/provider-adapter'
import { ServiceError } from '@/services/shared/errors'

const execFileAsync = promisify(execFile)

type JsonRecord = Record<string, unknown>

export type ProviderRunCreateInput = {
  targetProjectId: string
  planId?: string
  providerKey?: string
  providerProfile?: string
  launchPrompt: string
  approvedScope?: JsonRecord
  lifecyclePhase?: string
}

export type ProviderPermissionDecisionInput = {
  runId: string
  requestId: string
  decision: 'approved' | 'denied'
  riskTier: string
  requestedScope: string
  payload: JsonRecord
  reason?: string
  decidedBy: string
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function hashText(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

async function readGitSnapshot(cwd: string): Promise<JsonRecord> {
  try {
    const [{ stdout: branch }, { stdout: head }, { stdout: status }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd }),
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd }),
      execFileAsync('git', ['status', '--short'], { cwd }),
    ])
    return {
      branch: branch.trim() || null,
      head: head.trim() || null,
      dirtyStatus: status.trim().split('\n').filter(Boolean),
    }
  } catch (error) {
    return {
      unavailable: true,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

async function ensureAdapterRegistration(adapter: ProviderAdapter, client: PrismaClient) {
  return client.providerAdapterRegistration.upsert({
    where: { key: adapter.key },
    create: {
      key: adapter.key,
      displayName: adapter.displayName,
      providerKind: adapter.providerKind,
      adapterVersion: adapter.adapterVersion,
      capabilitiesJson: stringifyJson(adapter.capabilities),
    },
    update: {
      displayName: adapter.displayName,
      providerKind: adapter.providerKind,
      adapterVersion: adapter.adapterVersion,
      capabilitiesJson: stringifyJson(adapter.capabilities),
      enabled: true,
    },
  })
}

async function nextEventSequence(client: Prisma.TransactionClient, runId: string): Promise<number> {
  const latest = await client.providerRunEvent.findFirst({
    where: { runId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  return (latest?.sequence ?? 0) + 1
}

async function appendProviderEvent(
  client: Prisma.TransactionClient,
  runId: string,
  event: NormalizedProviderEvent,
  sequence?: number,
) {
  const resolvedSequence = sequence ?? (await nextEventSequence(client, runId))
  return client.providerRunEvent.create({
    data: {
      runId,
      sequence: resolvedSequence,
      type: event.type,
      stream: event.stream,
      payloadJson: stringifyJson(event.payload ?? null),
    },
  })
}

export async function listProviderAdapters(client: PrismaClient = prisma) {
  await Promise.all(providerAdapters.map(adapter => ensureAdapterRegistration(adapter, client)))
  return client.providerAdapterRegistration.findMany({ where: { enabled: true }, orderBy: { displayName: 'asc' } })
}

export async function createProviderWorkflowRun(input: ProviderRunCreateInput, client: PrismaClient = prisma) {
  const providerKey = input.providerKey ?? 'mock-planning'
  const adapter = getProviderAdapter(providerKey)
  if (!adapter) throw new ServiceError(`Provider adapter "${providerKey}" is not available.`, 'VALIDATION', 400)

  const targetProject = await client.targetProject.findUnique({ where: { id: input.targetProjectId } })
  if (!targetProject) throw new ServiceError('Target project not found.', 'NOT_FOUND')

  const plan = input.planId
    ? await client.planProjection.findUnique({
        where: { planId: input.planId },
        select: { id: true, planId: true, lifecycle: true, targetProjectId: true },
      })
    : null
  if (input.planId && !plan) throw new ServiceError('Plan not found.', 'NOT_FOUND')
  if (plan?.targetProjectId && plan.targetProjectId !== targetProject.id) {
    throw new ServiceError('Provider run target project does not match the linked plan target project.', 'CONFLICT')
  }

  const adapterRegistration = await ensureAdapterRegistration(adapter, client)
  const lifecyclePhase = input.lifecyclePhase ?? plan?.lifecycle ?? 'planning'
  const appraiseInstructions =
    'Appraise owns plan review, validation review, baseline acceptance, implementation checkpoints, completion approval, and cancellation. Provider exit status must never approve or complete lifecycle gates.'
  const preRunRepoSnapshot = await readGitSnapshot(targetProject.canonicalPath)

  const run = await client.providerWorkflowRun.create({
    data: {
      planProjectionId: plan?.id,
      targetProjectId: targetProject.id,
      providerAdapterId: adapterRegistration.id,
      providerKind: adapter.providerKind,
      providerProfile: input.providerProfile?.trim() || null,
      adapterVersion: adapter.adapterVersion,
      status: 'queued',
      lifecyclePhase,
      capabilitySnapshotJson: stringifyJson(adapter.capabilities),
      launchPrompt: input.launchPrompt.trim(),
      approvedScopeJson: input.approvedScope ? stringifyJson(input.approvedScope) : null,
      appraiseInstructions,
      preRunRepoSnapshotJson: stringifyJson(preRunRepoSnapshot),
      artifactHashesJson: stringifyJson({
        launchPrompt: hashText(input.launchPrompt),
        instructions: hashText(appraiseInstructions),
      }),
    },
  })

  await appendProviderEvents(
    run.id,
    [{ type: 'provider_run_started', payload: { status: 'queued', providerKey } }],
    client,
  )
  return launchProviderWorkflowRun(run.id, client)
}

async function launchProviderWorkflowRun(runId: string, client: PrismaClient = prisma) {
  const run = await client.providerWorkflowRun.findUnique({
    where: { id: runId },
    include: { targetProject: true, providerAdapter: true },
  })
  if (!run) throw new ServiceError('Provider run not found.', 'NOT_FOUND')
  if (!['queued', 'recovery_required'].includes(run.status)) return getProviderWorkflowRun(run.id, client)

  const adapter = getProviderAdapter(run.providerAdapter?.key ?? '')
  if (!adapter) throw new ServiceError('Provider adapter is no longer available for this run.', 'CONFLICT')

  await client.providerWorkflowRun.update({
    where: { id: run.id },
    data: { status: 'running', startedAt: run.startedAt ?? new Date() },
  })

  try {
    const result = await adapter.launch({
      runId: run.id,
      targetProjectPath: run.targetProject.canonicalPath,
      launchPrompt: run.launchPrompt,
      appraiseInstructions: run.appraiseInstructions,
      lifecyclePhase: run.lifecyclePhase,
      mcpEndpoint: process.env.APPRAISE_MCP_ENDPOINT,
    })
    const completedAt = ['completed', 'failed', 'cancelled'].includes(result.status) ? new Date() : null
    const postRunRepoSnapshot = await readGitSnapshot(run.targetProject.canonicalPath)

    await client.$transaction(async transaction => {
      for (const event of result.events) await appendProviderEvent(transaction, run.id, event)
      await transaction.providerWorkflowRun.update({
        where: { id: run.id },
        data: {
          status: result.status,
          providerSessionId: result.providerSessionId,
          providerThreadId: result.providerThreadId,
          providerProcessId: result.providerProcessId,
          completedAt,
          postRunRepoSnapshotJson: stringifyJson(postRunRepoSnapshot),
        },
      })
    })
  } catch (error) {
    await client.$transaction(async transaction => {
      await appendProviderEvent(transaction, run.id, {
        type: 'provider_run_failed',
        payload: { message: error instanceof Error ? error.message : String(error) },
      })
      await transaction.providerWorkflowRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          failureReason: error instanceof Error ? error.message : String(error),
        },
      })
    })
  }

  return getProviderWorkflowRun(run.id, client)
}

async function appendProviderEvents(runId: string, events: NormalizedProviderEvent[], client: PrismaClient = prisma) {
  await client.$transaction(async transaction => {
    let sequence = await nextEventSequence(transaction, runId)
    for (const event of events) {
      await appendProviderEvent(transaction, runId, event, sequence)
      sequence += 1
    }
  })
}

export async function cancelProviderWorkflowRun(runId: string, client: PrismaClient = prisma) {
  const run = await client.providerWorkflowRun.findUnique({
    where: { id: runId },
    include: { providerAdapter: true },
  })
  if (!run) throw new ServiceError('Provider run not found.', 'NOT_FOUND')
  if (['cancelled', 'completed', 'failed'].includes(run.status)) return getProviderWorkflowRun(runId, client)

  const adapter = getProviderAdapter(run.providerAdapter?.key ?? '')
  const cancelEvents = adapter?.cancel ? await adapter.cancel({ runId, providerProcessId: run.providerProcessId }) : []

  await client.$transaction(async transaction => {
    for (const event of cancelEvents) await appendProviderEvent(transaction, runId, event)
    await transaction.providerWorkflowRun.update({
      where: { id: runId },
      data: { status: 'cancelled', cancelledAt: new Date(), completedAt: new Date() },
    })
  })
  return getProviderWorkflowRun(runId, client)
}

export async function recordProviderPermissionDecision(
  input: ProviderPermissionDecisionInput,
  client: PrismaClient = prisma,
) {
  const run = await client.providerWorkflowRun.findUnique({
    where: { id: input.runId },
    include: { events: { where: { type: 'provider_permission_requested' } } },
  })
  if (!run) throw new ServiceError('Provider run not found.', 'NOT_FOUND')
  const matchingRequest = run.events.find(event => {
    const payload = parseJson<JsonRecord>(event.payloadJson)
    return payload?.requestId === input.requestId
  })
  if (!matchingRequest) {
    throw new ServiceError('Provider permission decision requires a matching provider permission request.', 'CONFLICT')
  }
  const requestPayload = parseJson<JsonRecord>(matchingRequest.payloadJson)
  if (requestPayload?.requestedScope !== input.requestedScope || requestPayload?.riskTier !== input.riskTier) {
    throw new ServiceError('Provider permission decision does not match the original request payload.', 'CONFLICT')
  }

  return client.providerPermissionDecision.upsert({
    where: { runId_requestId: { runId: input.runId, requestId: input.requestId } },
    create: {
      runId: input.runId,
      requestId: input.requestId,
      decision: input.decision,
      riskTier: input.riskTier,
      requestedScope: input.requestedScope,
      payloadJson: stringifyJson(input.payload),
      reason: input.reason,
      decidedBy: input.decidedBy,
    },
    update: {
      decision: input.decision,
      riskTier: input.riskTier,
      requestedScope: input.requestedScope,
      payloadJson: stringifyJson(input.payload),
      reason: input.reason,
      decidedBy: input.decidedBy,
      decidedAt: new Date(),
    },
  })
}

export async function listProviderWorkflowRuns(client: PrismaClient = prisma) {
  return client.providerWorkflowRun.findMany({
    include: {
      plan: true,
      targetProject: true,
      providerAdapter: true,
      events: { orderBy: { sequence: 'asc' } },
      permissionDecisions: { orderBy: { decidedAt: 'desc' } },
      artifactSnapshots: { orderBy: { capturedAt: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getProviderWorkflowRun(runId: string, client: PrismaClient = prisma) {
  const run = await client.providerWorkflowRun.findUnique({
    where: { id: runId },
    include: {
      plan: true,
      targetProject: true,
      providerAdapter: true,
      events: { orderBy: { sequence: 'asc' } },
      permissionDecisions: { orderBy: { decidedAt: 'desc' } },
      artifactSnapshots: { orderBy: { capturedAt: 'desc' } },
    },
  })
  if (!run) throw new ServiceError('Provider run not found.', 'NOT_FOUND')
  return {
    ...run,
    status: run.status as ProviderRunStatus,
    capabilitySnapshot: parseJson(run.capabilitySnapshotJson),
    approvedScope: parseJson(run.approvedScopeJson),
    preRunRepoSnapshot: parseJson(run.preRunRepoSnapshotJson),
    postRunRepoSnapshot: parseJson(run.postRunRepoSnapshotJson),
    changedFiles: parseJson(run.changedFilesJson),
    artifactHashes: parseJson(run.artifactHashesJson),
    events: run.events.map(event => ({
      ...event,
      payload: parseJson(event.payloadJson),
    })),
    permissionDecisions: run.permissionDecisions.map(decision => ({
      ...decision,
      payload: parseJson(decision.payloadJson),
    })),
    artifactSnapshots: run.artifactSnapshots.map(snapshot => ({
      ...snapshot,
      metadata: parseJson(snapshot.metadataJson),
    })),
  }
}
