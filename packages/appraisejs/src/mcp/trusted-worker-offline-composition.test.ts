import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGatewayFixture } from '../../../../scripts/tests/fixtures/codex-app-server-m02/gateway-fixture.mjs'
import {
  externalWorkerTools,
  type ExternalWorkerRole,
  type ExternalWorkerAcceptance,
} from './external-worker-gateway.js'
import { NativeDescriptorCollector } from './native-descriptor-capture.js'
import type { TrustedRouteInput } from './trusted-worker-native-route.js'
import {
  createTrustedWorkerOfflineComposition,
  type TrustedWorkerOfflineOptions,
} from './trusted-worker-offline-composition.js'

const digest = `sha256:${'a'.repeat(64)}`
const closes: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(closes.splice(0).map(close => close()))
})
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
function binding(role: ExternalWorkerRole) {
  return {
    hubId: 'hub-1',
    target: 'target-1',
    targetProjectId: 'project-1',
    journeyId: 'journey-1',
    role,
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    assignmentId: 'assignment-1',
    assignmentGeneration: 2,
    leaseId: 'lease-1',
    authorizationId: 'authorization-1',
    coordinatorSessionId: 'session-1',
    coordinatorGeneration: 3,
    transportGeneration: 1,
    expectedInputHash: digest,
    expectedScopeHash: digest,
    assignmentSecret: 'synthetic-assignment-secret-123456789',
    expiresAt: '2036-10-14T01:00:00.000Z',
  }
}
function directRoute(context: Parameters<TrustedWorkerOfflineOptions['route']>[0]): TrustedRouteInput {
  const request = {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(
      JSON.stringify({
        tools: context.sdkListedTools.map(tool => ({
          type: 'function',
          name: `mcp__worker__${tool.name}`,
          parameters: tool.inputSchema,
        })),
      }),
    ),
  }
  const provenance = {
    binarySha256: digest,
    platform: 'SYNTHETIC',
    configSha256: digest,
    schemaSha256: digest,
    runId: 'run-1',
    requestId: 'request-1',
    threadId: 'thread-1',
    turnId: 'turn-1',
  }
  const capture = new NativeDescriptorCollector().capture(request, provenance)
  if (capture.status !== 'CAPTURED') throw new Error('fixture capture')
  return {
    request,
    context: provenance,
    ...context,
    mcpServerName: 'worker',
    routes: context.sdkListedTools.map(tool => ({
      operation: tool.name,
      nativeName: `mcp__worker__${tool.name}`,
      descriptorHash: capture.callables.find(item => item.name === `mcp__worker__${tool.name}`)!.descriptorHash,
      mode: 'DIRECT_MCP',
    })),
    limits: { outerCalls: 16, innerCalls: 16, resultBytes: 256 * 1024 },
  }
}
async function fixture(
  role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER',
  patch: Partial<TrustedWorkerOfflineOptions> = {},
) {
  const logical = createGatewayFixture(role),
    scope = binding(role)
  const writes = new Map<string, string>(),
    acceptance = new Map<string, ExternalWorkerAcceptance>()
  let effects = 0,
    requests = 0
  const authorize = vi.fn(async () => {})
  const onUnknown = vi.fn(async () => {})
  const writeName = externalWorkerTools[role].at(-1)!
  const request = vi.fn(async (_path: string, options?: { body?: string }) => {
    requests++
    const payload = JSON.parse(options!.body!) as Record<string, unknown>
    const key = String(payload.idempotencyKey),
      bodyHash = hash(payload)
    if (writes.has(key) && writes.get(key) !== bodyHash) throw new Error('changed content')
    if (!writes.has(key)) {
      effects++
      writes.set(key, bodyHash)
    }
    return { stored: true }
  })
  const readAcceptance = vi.fn(async (input: Parameters<TrustedWorkerOfflineOptions['readAcceptance']>[0]) => {
    if (!writes.has(input.idempotencyKey)) return null
    const value = {
      receiptId: 'accepted-1',
      assignmentId: scope.assignmentId,
      attemptId: scope.attemptId,
      operation: input.toolName,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      artifactIds: ['artifact-1'],
    }
    acceptance.set(input.idempotencyKey, value)
    return value
  })
  const options: TrustedWorkerOfflineOptions = {
    provenance: 'OFFLINE_SYNTHETIC',
    caseId: 'case-1',
    capability: 'c'.repeat(32),
    binding: scope,
    frozenReads: externalWorkerTools[role]
      .filter(name => name !== writeName)
      .map(toolName => ({
        toolName,
        arguments: logical.logicalScript.find(call => call.toolName === toolName)!.arguments,
        allowedArtifactIds: ['sealed-1'],
        inputHash: digest,
        scopeHash: digest,
        source: [
          {
            hubId: scope.hubId,
            targetProjectId: scope.targetProjectId,
            journeyId: scope.journeyId,
            workItemId: scope.workItemId,
            attemptId: scope.attemptId,
            inputHash: digest,
            scopeHash: digest,
            artifactId: 'sealed-1',
            data: {
              summary: 'Synthetic sealed scope',
              ...(toolName === 'operation_search' ? { resources: [] } : {}),
              ...(toolName === 'quality_journey_triage_evidence_read'
                ? { receiptId: 'sealed-1', artifactKind: 'log', offset: 0, limit: 4096, text: 'synthetic' }
                : {}),
            },
          },
        ],
      })),
    authorize,
    request,
    readAcceptance,
    onUnknown,
    route: directRoute,
    caller: {
      provenance: 'OFFLINE_SYNTHETIC',
      invoke: async (call, dispatch) => dispatch(call.operation, call.outerArguments as Record<string, unknown>),
    },
    ...patch,
  }
  const composition = await createTrustedWorkerOfflineComposition(options)
  closes.push(composition.close)
  const write = logical.logicalScript.find(call => call.toolName === writeName)!
  const invoke = (argumentsValue = write.arguments, suffix = '1', operation = writeName) =>
    composition.invoke({
      operation,
      arguments: structuredClone(argumentsValue),
      outerCallId: `outer-${suffix}`,
      innerCallId: `inner-${suffix}`,
    })
  return {
    composition,
    options,
    logical,
    scope,
    write,
    invoke,
    request,
    authorize,
    readAcceptance,
    onUnknown,
    effects: () => effects,
    requests: () => requests,
    acceptance,
  }
}

describe('offline trusted worker package composition', () => {
  it.each(Object.keys(externalWorkerTools) as ExternalWorkerRole[])(
    'composes %s through the actual in-memory SDK and canonical bridge',
    async role => {
      const f = await fixture(role)
      const result = await f.invoke()
      expect(result).toMatchObject({
        provenance: 'OFFLINE_SYNTHETIC',
        runtimeQualified: false,
        dispatchAllowed: false,
        observedNativeTuple: null,
        accepted: true,
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        canonicalAcceptance: { receiptId: 'accepted-1' },
      })
      expect(result.acceptanceDigest).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(f.effects()).toBe(1)
      expect(f.authorize.mock.calls.map(call => call[1])).toEqual(['before_io', 'after_io'])
      expect(JSON.stringify(result)).not.toContain(f.scope.assignmentSecret)
      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.canonicalAcceptance)).toBe(true)
      const replay = await f.invoke(f.write.arguments, '2')
      expect(replay.canonicalAcceptance).toEqual(result.canonicalAcceptance)
      expect(f.effects()).toBe(1)
      expect(
        await f.composition.readCommittedAcceptance({
          operation: f.write.toolName,
          idempotencyKey: 'submit-1',
          requestHash: result.canonicalAcceptance!.requestHash,
        }),
      ).toEqual(result.canonicalAcceptance)
    },
  )
  it('refuses cross-role operations and forged authority before calling the synthetic caller', async () => {
    const f = await fixture()
    await expect(
      f.invoke(f.write.arguments, 'foreign', 'quality_journey_external_triage_submit_v1' as typeof f.write.toolName),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    await expect(f.invoke({ ...f.write.arguments, journeyId: 'foreign' })).rejects.toMatchObject({
      disposition: 'REFUSED',
    })
    expect(f.requests()).toBe(0)
    const accepted = await f.invoke()
    expect(accepted.accepted).toBe(true)
    await expect(
      f.composition.invoke({
        operation: f.write.toolName,
        arguments: f.write.arguments,
        outerCallId: 'outer-1',
        innerCallId: 'inner-new',
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('preserves canonical changed-payload rejection without a second accepted effect', async () => {
    const f = await fixture()
    await f.invoke()
    const changed = structuredClone(f.write.arguments)
    ;(changed.charter as { assumptions: string[] }).assumptions.push('Changed synthetic payload')
    await expect(f.invoke(changed, '2')).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(f.effects()).toBe(1)
    await expect(f.invoke(f.write.arguments, '3')).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('never treats post-I/O authority loss as acceptance', async () => {
    const f = await fixture()
    f.authorize.mockImplementation(async (_binding, stage) => {
      if (stage === 'after_io') throw new Error('revoked')
    })
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(f.effects()).toBe(1)
    expect(f.onUnknown).toHaveBeenCalled()
    const receipt = f.acceptance.get('submit-1')!
    expect(
      await f.composition.readCommittedAcceptance({
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        requestHash: receipt.requestHash,
      }),
    ).toEqual(receipt)
  })
  it('preserves committed submission with a lost acceptance reply and permits only trusted lookup', async () => {
    const f = await fixture()
    const original = f.options.readAcceptance
    f.readAcceptance.mockImplementationOnce(async input => {
      await original(input)
      throw new Error('lost reply')
    })
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(f.effects()).toBe(1)
    const receipt = f.acceptance.get('submit-1')!
    expect(
      await f.composition.readCommittedAcceptance({
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        requestHash: receipt.requestHash,
      }),
    ).toEqual(receipt)
    expect(f.requests()).toBe(1)
  })
  it('rejects swapped acceptance binding on trusted lookup', async () => {
    const f = await fixture()
    const result = await f.invoke()
    f.readAcceptance.mockResolvedValueOnce({ ...result.canonicalAcceptance!, attemptId: 'foreign' })
    await expect(
      f.composition.readCommittedAcceptance({
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        requestHash: result.canonicalAcceptance!.requestHash,
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('bounds and fences a caller that does not return and excludes its late dispatch', async () => {
    let dispatchLate: (() => Promise<unknown>) | undefined
    const f = await fixture('REQUIREMENT_ANALYZER', {
      timeoutMs: 10,
      caller: {
        provenance: 'OFFLINE_SYNTHETIC',
        invoke: (call, dispatch) => {
          dispatchLate = () => dispatch(call.operation, call.outerArguments as Record<string, unknown>)
          return new Promise(() => {})
        },
      },
    })
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    await expect(dispatchLate!()).rejects.toMatchObject({ disposition: 'REFUSED' })
    expect(f.requests()).toBe(0)
  })
  it('rejects a synthetic caller that fabricates output or changes the constructed input', async () => {
    const fabricated = await fixture('REQUIREMENT_ANALYZER', {
      caller: { provenance: 'OFFLINE_SYNTHETIC', invoke: async () => ({ invented: true }) },
    })
    await expect(fabricated.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(fabricated.requests()).toBe(0)
    const changed = await fixture('REQUIREMENT_ANALYZER', {
      caller: {
        provenance: 'OFFLINE_SYNTHETIC',
        invoke: async (call, dispatch) =>
          dispatch(call.operation, { ...(call.outerArguments as object), idempotencyKey: 'changed' }),
      },
    })
    await expect(changed.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(changed.requests()).toBe(0)
  })
  it('refuses drifted profiles before any canonical request', async () => {
    await expect(
      fixture('REQUIREMENT_ANALYZER', {
        route: context => ({
          ...directRoute(context),
          advertisedProfile: { ...context.advertisedProfile, profileDigest: `sha256:${'b'.repeat(64)}` },
        }),
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('closes one original SDK lifetime and rejects later calls', async () => {
    const f = await fixture()
    const one = f.composition.close()
    expect(f.composition.close()).toBe(one)
    await one
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'REFUSED' })
    expect(f.requests()).toBe(0)
  })
  it('keeps frozen reads separate from canonical acceptance and enforces the call ceiling', async () => {
    const f = await fixture('REQUIREMENT_ANALYZER', {
      route: context => ({
        ...directRoute(context),
        limits: { outerCalls: 1, innerCalls: 1, resultBytes: 256 * 1024 },
      }),
    })
    const read = f.logical.logicalScript.find(call => call.toolName === 'quality_journey_analysis_get')!
    const value = await f.composition.invoke({
      operation: read.toolName,
      arguments: read.arguments,
      outerCallId: 'read-outer',
      innerCallId: 'read-inner',
    })
    expect(value).toMatchObject({ accepted: false, canonicalAcceptance: null, acceptanceDigest: null })
    expect(f.requests()).toBe(0)
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('fences fabricated output after an actual canonical dispatch without erasing its effect', async () => {
    const f = await fixture('REQUIREMENT_ANALYZER', {
      caller: {
        provenance: 'OFFLINE_SYNTHETIC',
        invoke: async (call, dispatch) => {
          await dispatch(call.operation, call.outerArguments as Record<string, unknown>)
          return { fabricated: true }
        },
      },
    })
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(f.effects()).toBe(1)
    await expect(f.invoke(f.write.arguments, '2')).rejects.toMatchObject({ disposition: 'REFUSED' })
  })
  it('refuses replayed physical callback admission even when the first canonical effect committed', async () => {
    const f = await fixture('REQUIREMENT_ANALYZER', {
      caller: {
        provenance: 'OFFLINE_SYNTHETIC',
        invoke: async (call, dispatch) => {
          await dispatch(call.operation, call.outerArguments as Record<string, unknown>)
          return dispatch(call.operation, call.outerArguments as Record<string, unknown>)
        },
      },
    })
    await expect(f.invoke()).rejects.toMatchObject({ disposition: 'UNKNOWN' })
    expect(f.effects()).toBe(1)
    expect(f.requests()).toBe(1)
  })
  it('rejects unbounded or secret-shaped trusted acceptance lookup values', async () => {
    const f = await fixture()
    const result = await f.invoke()
    f.readAcceptance.mockResolvedValueOnce({
      ...result.canonicalAcceptance!,
      token: 'never-returned',
    } as ExternalWorkerAcceptance)
    await expect(
      f.composition.readCommittedAcceptance({
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        requestHash: result.canonicalAcceptance!.requestHash,
      }),
    ).rejects.toMatchObject({ disposition: 'REFUSED' })
    f.readAcceptance.mockRejectedValueOnce(new Error('sensitive-lookup-message'))
    await expect(
      f.composition.readCommittedAcceptance({
        operation: f.write.toolName,
        idempotencyKey: 'submit-1',
        requestHash: result.canonicalAcceptance!.requestHash,
      }),
    ).rejects.toMatchObject({ disposition: 'UNKNOWN', message: 'Offline worker composition unknown.' })
  })
})
