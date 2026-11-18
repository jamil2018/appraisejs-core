import { copyFile, rm } from 'node:fs/promises'
import { lstatSync } from 'node:fs'
import { createServer } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it, vi } from 'vitest'
import { expectedNativeMcpConfiguration } from '@/lib/quality-journey/codex-app-server/native-qualification-configuration'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { prepareM10AutomationFixture, callM10WorkerMcp, type M10OfflineDispatchEvent } from '@/test/m10-journey-fixture'
import { failedExecution, triager, report, mcpReport } from '@/test/m10-runtime-fixture'
import { resetQualityJourneyExecutionRuntimeAdapter } from './quality-journey-execution-service'
import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'
import { createManagedWorkerLoopbackServer } from '../../../packages/appraisejs/src/mcp/managed-worker-loopback-server'
import { createNativeQualityJourneyQualification } from './quality-journey-native-qualification'
import {
  captureNativeQualificationPlan,
  nativeQualificationDigest,
  renderNativeQualificationConfiguration,
} from '@/lib/quality-journey/codex-app-server/native-qualification-contract'
import { syntheticNativeManifest } from '@/lib/quality-journey/codex-app-server/native-qualification.test-support'
import type { launchNativeQualificationChild } from '@/lib/quality-journey/codex-app-server/native-qualification-child'

const native = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('@/lib/quality-journey/codex-app-server/native-qualification-child', () => ({
  launchNativeQualificationChild: native.launch,
}))
async function port() {
  const probe = createServer()
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const address = probe.address()
  if (!address || typeof address === 'string') throw new Error('No offline test port')
  await new Promise<void>(resolve => probe.close(() => resolve()))
  return address.port
}
async function oneRole(event: M10OfflineDispatchEvent) {
  const f = syntheticNativeManifest()
  await copyFile(event.databasePath, f.manifest.database.path)
  const identity = lstatSync(f.manifest.database.path, { bigint: true })
  f.manifest.database.dev = String(identity.dev)
  f.manifest.database.ino = String(identity.ino)
  const client = new PrismaClient({ datasources: { db: { url: `file:${f.manifest.database.path}` } } })
  let controller: Awaited<ReturnType<typeof createNativeQualityJourneyQualification>> | undefined
  let worker: Client | undefined
  try {
    const delivery = await createManagedQualityJourneyRoleDelivery({
      binding: event.binding,
      canonicalDefinitions: event.canonicalDefinitions,
      client,
    })
    f.manifest.binding = Object.fromEntries(
      Object.keys(f.manifest.binding).map(key => [key, event.binding[key as keyof typeof event.binding]]),
    ) as typeof f.manifest.binding
    f.manifest.endpoint.port = await port()
    f.manifest.roleProfileDigest = delivery.profileDigest
    f.manifest.enabledTools = delivery.profile.tools.map(tool => tool.name)
    f.manifest.configurationSha256 = f.sha(renderNativeQualificationConfiguration(f.manifest, f.capability))
    const config = {
      model: 'gpt-6.1-sol',
      model_provider: 'openai',
      model_reasoning_effort: 'medium',
      approval_policy: 'never',
      sandbox_mode: 'read-only',
      web_search: 'disabled',
      features: {
        shell_tool: false,
        apps: false,
        async_compaction: false,
        code_mode: false,
        code_mode_only: false,
        code_mode_host: false,
        code_mode_prewarm: false,
        goals: false,
        multi_agent: false,
        multi_agent_v2: false,
        wake_on_agent_messages: false,
        sleep_tool: false,
        memories: false,
        view_image: false,
        hooks: false,
        remote_plugin: false,
        api_key_cyber_access_programs: false,
        api_key_model_discovery: false,
        auth_elicitation: false,
        mentions_v2: false,
        tool_suggest: false,
        network_proxy: false,
      },
      analytics: { enabled: false },
      feedback: { enabled: false },
      history: { persistence: 'none' },
      cli_auth_credentials_store: 'file',
      mcp_oauth_credentials_store: 'file',
    }
    Object.assign(config, {
      mcp_servers: { appraise_worker: expectedNativeMcpConfiguration(f.manifest, f.capability) },
    })
    const envelope = [{ type: 'text', text: 'Synthetic offline producer. No native executable or model call.' }]
    f.manifest.envelopeDigest = nativeQualificationDigest(
      canonicalContractJson({ input: envelope, model: 'gpt-6.1-sol', effort: 'medium' }),
    )
    const plan = captureNativeQualificationPlan(f.manifest, f.capability)
    const args = structuredClone(event.arguments)
    if (event.binding.role === 'REQUIREMENT_ANALYZER')
      for (const key of ['schemaVersion', 'journeyId', 'targetProjectId'])
        delete (args.charter as Record<string, unknown>)[key]
    const methods: string[] = []
    let callbacks: Parameters<typeof launchNativeQualificationChild>[1] | undefined
    let result: unknown
    native.launch.mockImplementation(async (_plan, original: Parameters<typeof launchNativeQualificationChild>[1]) => {
      callbacks = original
      return {
        transportId: original.transportId,
        transport: {
          async request(method: string) {
            methods.push(method)
            const cwd = `${f.manifest.freshRoot}/cwd`
            if (method === 'initialize') return { codexHome: `${f.manifest.freshRoot}/codex-home` }
            if (method === 'config/read') return { config }
            if (method === 'thread/start')
              return {
                model: 'gpt-6.1-sol',
                reasoningEffort: 'medium',
                approvalPolicy: 'never',
                modelProvider: 'openai',
                cwd,
                sandbox: { type: 'readOnly' },
                thread: {
                  id: 'synthetic-thread',
                  modelProvider: 'openai',
                  cwd,
                  ephemeral: true,
                  turns: [],
                  preview: '',
                },
              }
            if (method === 'mcpServerStatus/list')
              return {
                data: [
                  {
                    name: 'appraise_worker',
                    runtimeStatus: 'connected',
                    toolsError: null,
                    httpOrigin: `http://127.0.0.1:${f.manifest.endpoint.port}`,
                    pluginId: null,
                    resources: [],
                    resourceTemplates: [],
                    serverCapabilities: { tools: {} },
                    serverInfo: {
                      name: `appraise-quality-journey-worker-${event.binding.role.toLowerCase()}`,
                      version: '0.0.0-p0-proof',
                    },
                    tools: Object.fromEntries(delivery.profile.tools.map(tool => [tool.name, tool])),
                  },
                ],
                nextCursor: null,
              }
            if (method !== 'turn/start') throw new Error('Unexpected native operation')
            worker = new Client({ name: 'synthetic-native-sdk-client', version: '1' })
            await worker.connect(
              new StreamableHTTPClientTransport(
                new URL(`http://127.0.0.1:${f.manifest.endpoint.port}${f.manifest.endpoint.path}`),
                {
                  requestInit: { headers: { Authorization: `Bearer ${f.capability}` } },
                },
              ),
            )
            expect((await worker.listTools()).tools.map(tool => tool.name)).toEqual(
              delivery.profile.tools.map(tool => tool.name),
            )
            const reply = await worker.callTool({ name: event.toolName, arguments: args })
            expect(reply.isError).not.toBe(true)
            const content = reply.structuredContent as { result: unknown; receipt: { accepted: boolean } }
            expect(content.receipt.accepted).toBe(true)
            expect(content.result).toBeDefined()
            result = content.result
            const foreignTool =
              event.binding.role === 'TRIAGER' ? 'quality_journey_analysis_submit' : 'quality_journey_triage_submit'
            await expect(worker.callTool({ name: foreignTool, arguments: args })).rejects.toThrow()
            await expect(
              worker.callTool({ name: event.toolName, arguments: { ...args, attemptId: 'forged-attempt' } }),
            ).rejects.toThrow()
            return { turn: { id: 'synthetic-turn' } }
          },
          async notifyInitialized() {
            methods.push('initialized')
          },
          fence() {},
          snapshot: () => ({ issuedRequests: methods.length }),
        },
        async stop() {
          original.fenceMcp()
          await original.closeMcp()
          return { status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false }
        },
      }
    })
    controller = await createNativeQualityJourneyQualification(
      {
        plan,
        createEndpoint: createManagedWorkerLoopbackServer,
        input: {
          ...event.binding,
          idempotencyKey: `native-prepare-${event.binding.role}`,
          providerNamespace: `synthetic:native:${event.binding.role}`,
          configurationDigest: `sha256:${f.manifest.configurationSha256}`,
          envelopeDigest: f.manifest.envelopeDigest,
        },
        envelope,
        canonicalDefinitions: event.canonicalDefinitions,
      },
      client,
    )
    await controller.start()
    expect(methods).toEqual([
      'initialize',
      'initialized',
      'config/read',
      'thread/start',
      'mcpServerStatus/list',
      'turn/start',
    ])
    callbacks!.onNotification('turn/completed', {
      threadId: 'synthetic-thread',
      turn: { id: 'synthetic-turn', status: 'completed' },
    })
    await controller.waitOriginalStop()
    const acceptedOriginal = await controller.readAcceptedManagedDelivery({ toolName: event.toolName, arguments: args })
    expect(acceptedOriginal?.receipt.accepted).toBe(true)
    expect(JSON.parse(JSON.stringify(acceptedOriginal?.result))).toEqual(result)
    expect(acceptedOriginal?.argumentsDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(
      await controller.readAcceptedManagedDelivery({
        toolName: event.toolName,
        arguments: { ...args, idempotencyKey: 'foreign-call' },
      }),
    ).toBeNull()
    expect(controller.snapshot()).toMatchObject({
      provenance: 'NATIVE_QUALIFICATION_OBSERVATION',
      runtimeQualified: false,
      providerTerminationProven: false,
      slotReleased: false,
    })
    expect(
      await client.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: event.binding.attemptId } }),
    ).toBe(1)
    const slot = await client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
    expect(slot.intentId).not.toBeNull()
    const sealedIntent = await client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
      where: { id: slot.intentId! },
      include: { run: true },
    })
    expect(sealedIntent).toMatchObject({ reconciledAt: null, turnId: 'synthetic-turn' })
    expect(JSON.parse(sealedIntent.run.policyJson)).toMatchObject({
      version: 'APP_SERVER_M13_NATIVE_QUALIFICATION_V2',
      model: 'gpt-6.1-sol',
      reasoning: 'medium',
    })
    expect(native.launch).toHaveBeenCalledTimes(1)
    return { role: event.binding.role, result }
  } finally {
    await worker?.close()
    await controller?.cancel()
    native.launch.mockReset()
    await client.$disconnect()
    await rm(f.parent, { recursive: true, force: true })
  }
}
describe('native composition with actual SDK HTTP and canonical disposable SQLite', () => {
  it('reaches all six role acceptances with real results and keeps every original HUB unreconciled', async () => {
    const roles: string[] = []
    const f = await prepareM10AutomationFixture(undefined, {
      async dispatch(event) {
        roles.push((await oneRole(event)).role)
        return event.directInvoke()
      },
    })
    try {
      await failedExecution(f)
      const t = await triager(f)
      const args = { idempotencyKey: 'native-triage-submit', report: mcpReport(report(t.assignment)) }
      roles.push(
        (
          await oneRole({
            binding: t.workerBinding,
            client: f.client,
            databasePath: f.databasePath,
            canonicalDefinitions: f.canonicalDefinitions,
            toolName: 'quality_journey_triage_submit',
            arguments: args,
            directInvoke: () => callM10WorkerMcp(t.gateway, 'quality_journey_triage_submit', args),
          })
        ).role,
      )
      expect(roles).toEqual([
        'REQUIREMENT_ANALYZER',
        'SCOUT',
        'RESOURCE_EXPLORER',
        'TEST_SCENARIO_DESIGNER',
        'AUTOMATOR',
        'TRIAGER',
      ])
    } finally {
      resetQualityJourneyExecutionRuntimeAdapter()
      await f.cleanup()
    }
  }, 30_000)
})
