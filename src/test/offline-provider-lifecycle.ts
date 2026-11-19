/** Fresh per-role SQLite snapshots preserve UNKNOWN/HUB while canonical fixture setup advances independently. */
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { expect } from 'vitest'
import { qualityJourneyContractVersion } from '@/lib/quality-journey'
import { prepareM10AutomationFixture, callM10WorkerMcp, type M10OfflineDispatchEvent } from './m10-journey-fixture'
import { failedExecution, triager, report, mcpReport } from './m10-runtime-fixture'
import { resetQualityJourneyExecutionRuntimeAdapter } from '@/services/coordinator/quality-journey-execution-service'
import { createOfflineQualityJourneyRoleDelivery } from '@/services/coordinator/quality-journey-offline-role-delivery'
import { createOfflineQualityJourneyProviderComposition } from '@/services/coordinator/quality-journey-offline-provider-composition'
import { createOfflineProviderPackageAdapter } from './offline-provider-package-adapter'
import {
  offlineCompositionDigest as hash,
  type OfflineOwnedProviderPort,
  type OfflineProviderCompositionReceipt,
  type OfflineProviderCall,
} from '@/lib/quality-journey/codex-app-server/provider-composition-contract'

export type OfflineLifecycleMode = 'direct' | 'package'
const roleOrder = [
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
]
function changedArguments(event: M10OfflineDispatchEvent) {
  const args = structuredClone(event.arguments)
  const paths: Record<string, string[]> = {
    REQUIREMENT_ANALYZER: ['charter', 'assumptions'],
    SCOUT: ['bundle', 'observations', '0', 'fact'],
    TEST_SCENARIO_DESIGNER: ['portfolio', 'coverageRationale'],
    AUTOMATOR: ['scenarios', '0', 'steps', '0', 'sourceScenarioStepId'],
    TRIAGER: ['report', 'summary'],
  }
  let keys = paths[event.binding.role]
  if (event.binding.role === 'RESOURCE_EXPLORER') {
    const bundle = args.bundle as Record<string, unknown[]>
    const collection = ['reusable', 'incompatible', 'stale', 'crossTarget', 'missing'].find(k => bundle[k]?.length)
    if (!collection) throw new Error('Synthetic resolution must contain a populated canonical collection')
    keys = ['bundle', collection, '0', 'explanation']
  }
  let record = args
  for (const key of keys.slice(0, -1)) record = record[key] as Record<string, unknown>
  const key = keys.at(-1)!
  record[key] = Array.isArray(record[key]) ? [...record[key], 'Changed synthetic replay.'] : `${record[key]} changed`
  return args
}

function producerArguments(event: M10OfflineDispatchEvent) {
  const args = structuredClone(event.arguments)
  if (event.binding.role === 'REQUIREMENT_ANALYZER') {
    const charter = args.charter as Record<string, unknown>
    expect(charter).toMatchObject({
      schemaVersion: qualityJourneyContractVersion,
      journeyId: event.binding.journeyId,
      targetProjectId: event.binding.targetProjectId,
    })
    for (const field of ['schemaVersion', 'journeyId', 'targetProjectId']) delete charter[field]
  }
  return args
}

async function oneRole(event: M10OfflineDispatchEvent, mode: OfflineLifecycleMode) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'appraise-offline-role-'))
  const databasePath = path.join(root, 'role.db')
  // No transaction or background writer is active at this awaited fixture hook.
  await copyFile(event.databasePath, databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  let delivery: Awaited<ReturnType<typeof createOfflineQualityJourneyRoleDelivery>> | undefined
  let adapter: Awaited<ReturnType<typeof createOfflineProviderPackageAdapter>> | undefined
  const counts = { acquisitions: 0, threads: 0, turns: 0, fences: 0, stops: 0 }
  try {
    const input = { binding: event.binding, canonicalDefinitions: event.canonicalDefinitions, client }
    if (mode === 'package') {
      adapter = await createOfflineProviderPackageAdapter(input)
      delivery = adapter
    } else delivery = await createOfflineQualityJourneyRoleDelivery(input)
    const binding = {
      candidateTree: '4'.repeat(40),
      configurationDigest: hash({ provenance: 'OFFLINE_FAKE_PORT', configuration: 1 }),
      protocolDigest: hash({ provenance: 'OFFLINE_FAKE_PORT', protocol: 1 }),
      roleProfileDigest: delivery.profileDigest,
      requiredMcpIds: ['synthetic-appraise'],
    }
    const call: OfflineProviderCall = {
      callId: `call-${event.binding.role}`,
      toolName: event.toolName,
      arguments: producerArguments(event),
    }
    const port: OfflineOwnedProviderPort = {
      provenance: 'OFFLINE_FAKE_PORT',
      initialize: async () => ({ status: 'INITIALIZED', binding }),
      inspectRequiredMcp: async () => ({ status: 'READY', servers: [{ id: 'synthetic-appraise', status: 'READY' }] }),
      startThread: async () => {
        counts.threads++
        return { thread: { id: 'synthetic-thread' } }
      },
      startTurn: async () => {
        counts.turns++
        return { turn: { id: 'synthetic-turn' } }
      },
      completeTurn: async () => ({
        threadId: 'synthetic-thread',
        turnId: 'synthetic-turn',
        status: 'COMPLETED',
        calls: [call],
      }),
      fence: () => {
        counts.fences++
      },
      stop: async () => {
        counts.stops++
        return { status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false }
      },
    }
    const controller = createOfflineQualityJourneyProviderComposition(
      {
        binding,
        input: {
          ...event.binding,
          idempotencyKey: `prepare-${event.binding.role}`,
          providerNamespace: `synthetic:${event.binding.role}`,
          configurationDigest: binding.configurationDigest,
          envelopeDigest: hash('synthetic-envelope'),
        },
        envelope: [{ type: 'text', text: 'Synthetic producer; no model or provider request.' }],
        delivery,
        acquire: async () => {
          counts.acquisitions++
          return port
        },
      },
      client,
    )
    const flight = controller.start()
    expect(controller.start()).toBe(flight)
    const receipt = await flight
    expect(receipt).toMatchObject({
      outcome: 'ACCEPTED_OFFLINE',
      provenance: 'OFFLINE_FAKE_PORT',
      runtimeQualified: false,
      observedNativeTuple: null,
      modelTokens: null,
      cost: null,
    })
    expect(receipt.acceptedArtifactDigests).toHaveLength(1)
    expect(counts).toEqual({ acquisitions: 1, threads: 1, turns: 1, fences: 1, stops: 1 })
    const intent = await client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: receipt.intentId! },
    })
    // ACKNOWLEDGED is operational correlation; physical effects remain unreconciled and the HUB stays occupied.
    expect(intent).toMatchObject({ status: 'ACKNOWLEDGED', reconciledAt: null, turnId: 'synthetic-turn' })
    expect(await client.qualityJourneyProviderSlot.count({ where: { intentId: intent.id } })).toBe(1)
    expect((await delivery.invoke(call)).accepted).toBe(true)
    await expect(
      delivery.invoke({ ...call, arguments: changedArguments({ ...event, arguments: call.arguments }) }),
    ).rejects.toThrow()
    const otherTool =
      event.binding.role === 'TRIAGER' ? 'quality_journey_analysis_submit' : 'quality_journey_triage_submit'
    await expect(delivery.invoke({ ...call, toolName: otherTool })).rejects.toThrow()
    expect(
      await client.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: event.binding.attemptId } }),
    ).toBe(1)
    // A second controller/restart cannot replay the consumed send, even with the original assignment material.
    expect(await controller.start()).toBe(receipt)
    expect(await controller.cancel()).toBe(receipt)
    expect(counts.turns).toBe(1)
    if (adapter) {
      expect(adapter.packageCalls()).toBe(1)
      expect(adapter.canonicalCalls()).toBe(1)
      expect(adapter.supportedOperations).toEqual(delivery.profile.tools.map(tool => tool.name))
      expect(adapter.managedProfileDigest).toBe(delivery.profileDigest)
    }
    return { role: event.binding.role, receipt, counts }
  } finally {
    await adapter?.close()
    await client.$disconnect()
    await rm(root, { recursive: true, force: true })
  }
}

export async function runOfflineProviderLifecycle(mode: OfflineLifecycleMode) {
  const observations: Array<{
    role: string
    receipt: OfflineProviderCompositionReceipt
    counts: Record<string, number>
  }> = []
  const f = await prepareM10AutomationFixture(undefined, {
    async dispatch(event) {
      observations.push(await oneRole(event, mode))
      return event.directInvoke()
    },
  })
  try {
    await failedExecution(f)
    const t = await triager(f)
    const args = { idempotencyKey: 'offline-triage-submit', report: mcpReport(report(t.assignment)) }
    observations.push(
      await oneRole(
        {
          binding: t.workerBinding,
          client: f.client,
          databasePath: f.databasePath,
          canonicalDefinitions: f.canonicalDefinitions,
          toolName: 'quality_journey_triage_submit',
          arguments: args,
          directInvoke: () => callM10WorkerMcp(t.gateway, 'quality_journey_triage_submit', args),
        },
        mode,
      ),
    )
    expect(observations.map(item => item.role)).toEqual(roleOrder)
    // Original DB advances only through direct canonical fixture preparation; no provider slot is released there.
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
    return observations
  } finally {
    resetQualityJourneyExecutionRuntimeAdapter()
    await f.cleanup()
  }
}
