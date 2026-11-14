import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { configureInertSupervisor, supervisorGate } from './quality-journey-process-supervisor.test-support'
import { createNativeQualityJourneyQualification } from './quality-journey-native-qualification'
import {
  nativeQualificationDigest,
  type CapturedNativeQualificationPlan,
} from '@/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  expectedNativeMcpConfiguration,
  nativeQualificationFeatureControls,
} from '@/lib/quality-journey/codex-app-server/native-qualification-configuration'
import { canonicalContractJson } from '@/lib/catalog-contracts'

const ports = vi.hoisted(() => ({
  verify: vi.fn(),
  delivery: vi.fn(),
  authority: vi.fn(),
  launch: vi.fn(),
  source: vi.fn(),
  profile: vi.fn(),
}))
vi.mock('@/lib/quality-journey/codex-app-server/native-qualification-contract', async importOriginal => ({
  ...(await importOriginal<object>()),
  verifyNativeQualificationPlan: ports.verify,
}))
vi.mock('@/lib/quality-journey/codex-app-server/native-outcome-source', () => ({
  createOriginalNativeOutcomeCandidate: ports.source,
}))
vi.mock('@/lib/quality-journey/codex-app-server/native-outcome-profile', () => ({
  inspectNativeOutcomeProfile: ports.profile,
}))
vi.mock('./quality-journey-managed-role-delivery', () => ({ createManagedQualityJourneyRoleDelivery: ports.delivery }))
vi.mock('./quality-journey-internal-worker-authority', () => ({ readInternalWorkerAuthority: ports.authority }))
vi.mock('@/lib/quality-journey/codex-app-server/native-qualification-child', () => ({
  launchNativeQualificationChild: ports.launch,
}))
beforeEach(configureInertSupervisor)
afterEach(() => vi.useRealTimers())
function fixture() {
  const profile = {
    role: 'REQUIREMENT_ANALYZER',
    tools: [{ name: 'quality_journey_analysis_get', inputSchema: { type: 'object' } }],
    contractDigest: `sha256:${'f'.repeat(64)}`,
  }
  const delivery = {
    profile,
    profileDigest: profile.contractDigest,
    sealedGrant: 'private-grant',
    fence: vi.fn(),
    invoke: vi.fn(),
  }
  const endpoint = {
    fence: vi.fn(),
    close: vi.fn().mockResolvedValue({ closed: true, effectUnknown: false }),
    snapshot: () => ({ fenced: false, requests: 0, calls: 0, inFlight: 0, effectUnknown: false }),
  }
  const createEndpoint = vi.fn().mockResolvedValue(endpoint)
  const envelope = [{ type: 'text', text: 'Synthetic boundary test' }]
  const input = {
    journeyId: 'journey',
    targetProjectId: 'project',
    attemptId: 'attempt',
    assignmentId: 'assignment',
    assignmentGeneration: 1,
    assignmentSecret: 'parent-only-secret',
    providerNamespace: 'synthetic:native-boundary',
    configurationDigest: `sha256:${'c'.repeat(64)}`,
  } as Parameters<typeof createNativeQualityJourneyQualification>[0]['input']
  const config: Record<string, unknown> = {
    model: 'gpt-6.1-sol',
    model_provider: 'openai',
    model_reasoning_effort: 'medium',
    approval_policy: 'never',
    sandbox_mode: 'read-only',
    web_search: 'disabled',
    cli_auth_credentials_store: 'file',
    mcp_oauth_credentials_store: 'file',
    features: Object.fromEntries(nativeQualificationFeatureControls.map(key => [key, false])),
    analytics: { enabled: false },
    feedback: { enabled: false },
    history: { persistence: 'none' },
  }
  const manifest = {
    binding: { journeyId: input.journeyId, targetProjectId: input.targetProjectId, attemptId: input.attemptId },
    database: { path: process.execPath },
    freshRoot: '/private/synthetic-native',
    configurationSha256: 'c'.repeat(64),
    roleProfileDigest: profile.contractDigest,
    enabledTools: profile.tools.map(tool => tool.name),
    envelopeDigest: nativeQualificationDigest(
      canonicalContractJson({ input: envelope, model: 'gpt-6.1-sol', effort: 'medium' }),
    ),
    endpoint: {
      host: '127.0.0.1',
      port: 39187,
      path: `/appraise-worker/${'a'.repeat(32)}`,
      serverName: 'appraise_worker',
      capabilityCommitment: `sha256:${'b'.repeat(64)}`,
    },
    limits: {
      acquisitionMs: 1000,
      caseMs: 10000,
      requestMs: 1000,
      acknowledgementMs: 1000,
      cleanupMs: 1000,
      bodyBytes: 4096,
      httpRequests: 32,
      toolCalls: 4,
    },
  }
  config.mcp_servers = { appraise_worker: expectedNativeMcpConfiguration(manifest, 'b'.repeat(64)) }
  ports.verify.mockReturnValue({ manifest, capability: 'b'.repeat(64) })
  ports.delivery.mockResolvedValue(delivery)
  ports.authority.mockResolvedValue({})
  const request = vi.fn(async (method: string) => {
    const cwd = '/private/synthetic-native/cwd'
    if (method === 'initialize') return { codexHome: '/private/synthetic-native/codex-home' }
    if (method === 'config/read') return { config }
    if (method === 'thread/start')
      return {
        model: 'gpt-6.1-sol',
        modelProvider: 'openai',
        reasoningEffort: 'medium',
        approvalPolicy: 'never',
        cwd,
        sandbox: { type: 'readOnly' },
        thread: { id: 'thread', cwd, modelProvider: 'openai', ephemeral: true, turns: [], preview: '' },
      }
    if (method === 'mcpServerStatus/list')
      return {
        data: [
          {
            name: 'appraise_worker',
            runtimeStatus: 'connected',
            toolsError: null,
            httpOrigin: 'http://127.0.0.1:39187',
            pluginId: null,
            resources: [],
            resourceTemplates: [],
            serverInfo: { name: 'appraise-quality-journey-worker-requirement_analyzer', version: '0.0.0-p0-proof' },
            serverCapabilities: { tools: {} },
            tools: { read: profile.tools[0] },
          },
        ],
        nextCursor: null,
      }
    return { turn: { id: 'turn' } }
  })
  ports.launch.mockImplementation(async (_plan, callbacks) => ({
    transportId: callbacks.transportId,
    transport: {
      request,
      notifyInitialized: vi.fn(),
      fence: vi.fn(),
      snapshot: () => ({ issuedRequests: request.mock.calls.length }),
    },
    stop: vi.fn(async () => {
      await callbacks.closeMcp()
      return { status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false }
    }),
  }))
  const client = {
    $queryRawUnsafe: async () => [{ name: 'main', file: process.execPath }],
    $transaction: async (operation: (tx: unknown) => unknown) => operation({}),
    qualityJourneyProviderObservation: { create: vi.fn() },
  } as unknown as PrismaClient
  const options = {
    plan: {} as CapturedNativeQualificationPlan,
    input,
    envelope,
    canonicalDefinitions: [],
    createEndpoint,
  }
  return { options, client, manifest, config, request, delivery, endpoint, createEndpoint }
}
describe('portable native composition boundary and cancellation', () => {
  it('cleans the exact returned child when C1 original capture refuses before initialize', async () => {
    const f = fixture()
    ports.profile.mockReturnValue({ plan: f.options.plan })
    ports.source.mockResolvedValue({
      attach() {
        throw new Error('C1 capture refused')
      },
      supervisorOperation() {},
      captureSupervisorStop() {},
      captureSdkClose() {},
    })
    const controller = await createNativeQualityJourneyQualification(
      {
        ...f.options,
        nativeOutcome: {
          profile: {} as never,
          database: {} as never,
          reviewControl: { reviewerId: 'reviewer', nonce: 'nonce', reviewMs: 1000, reconciliationMs: 1000 },
        },
      },
      f.client,
    )
    await expect(controller.start()).rejects.toThrow('C1 capture refused')
    const original = await ports.launch.mock.results[0].value
    expect(original.stop).toHaveBeenCalledOnce()
    expect(f.endpoint.close).toHaveBeenCalledOnce()
    expect(f.request).not.toHaveBeenCalled()
  })
  it('captures trusted endpoint factory and synchronously fences delivery before original cleanup', async () => {
    const f = fixture(),
      controller = await createNativeQualityJourneyQualification(f.options, f.client)
    f.options.createEndpoint = vi.fn().mockRejectedValue(new Error('replacement must not run'))
    const started = await controller.start()
    expect(started).toMatchObject({
      provenance: 'NATIVE_QUALIFICATION_OBSERVATION',
      runtimeQualified: false,
      providerTerminationProven: false,
      slotReleased: false,
    })
    expect(f.createEndpoint).toHaveBeenCalledTimes(1)
    const stop = controller.cancel()
    expect(f.delivery.fence).toHaveBeenCalledTimes(1)
    expect(f.endpoint.fence).toHaveBeenCalled()
    await stop
    expect(f.endpoint.close).toHaveBeenCalledTimes(1)
  })
  it.each(['missing', 'ephemeral'] as const)(
    'refuses %s credential-store readback before thread or turn',
    async store => {
      const f = fixture()
      if (store === 'missing') delete f.config.cli_auth_credentials_store
      else f.config.cli_auth_credentials_store = 'ephemeral'
      const controller = await createNativeQualityJourneyQualification(f.options, f.client)
      await expect(controller.start()).rejects.toThrow(/configuration refused/)
      expect(f.request.mock.calls.map(([method]) => method)).toEqual(['initialize', 'config/read'])
    },
  )
  it.each([null, undefined])(
    'accepts schema-permitted %s status origin only with exact pinned connector config',
    async origin => {
      const f = fixture(),
        request = f.request.getMockImplementation()!
      f.request.mockImplementation(async method => {
        const result = await request(method)
        if (method === 'mcpServerStatus/list') {
          const server = (result as { data: Record<string, unknown>[] }).data[0]
          if (origin === undefined) delete server.httpOrigin
          else server.httpOrigin = origin
        }
        return result
      })
      const controller = await createNativeQualityJourneyQualification(f.options, f.client)
      expect(await controller.start()).toMatchObject({ state: 'active' })
      await controller.cancel()
    },
  )
  it('refuses a nonnull status origin different from the exact owned listener', async () => {
    const f = fixture(),
      request = f.request.getMockImplementation()!
    f.request.mockImplementation(async method => {
      const result = await request(method)
      if (method === 'mcpServerStatus/list')
        (result as { data: Record<string, unknown>[] }).data[0].httpOrigin = 'http://127.0.0.1:39188'
      return result
    })
    const controller = await createNativeQualityJourneyQualification(f.options, f.client)
    await expect(controller.start()).rejects.toThrow(/required MCP refused/)
    expect(f.request.mock.calls.some(([method]) => method === 'turn/start')).toBe(false)
  })
  it('closes the original late endpoint on cancellation before any native acquisition', async () => {
    const f = fixture(),
      endpoint = supervisorGate<typeof f.endpoint>()
    f.createEndpoint.mockReturnValue(endpoint.promise)
    const controller = await createNativeQualityJourneyQualification(f.options, f.client),
      start = controller.start()
    const rejected = expect(start).rejects.toThrow(/fenced/)
    await vi.waitFor(() => expect(f.createEndpoint).toHaveBeenCalledTimes(1))
    const stop = controller.cancel()
    endpoint.resolve(f.endpoint)
    await Promise.all([stop, rejected])
    expect(ports.launch).not.toHaveBeenCalled()
    expect(f.endpoint.close).toHaveBeenCalledTimes(1)
    expect(controller.snapshot().fenced).toBe(true)
  })
})
