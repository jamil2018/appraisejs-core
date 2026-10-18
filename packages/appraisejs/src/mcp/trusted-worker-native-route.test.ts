import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'

import { createGatewayFixture } from '../../../../scripts/tests/fixtures/codex-app-server-m02/gateway-fixture.mjs'
import { externalWorkerTools, type ExternalWorkerRole } from './external-worker-gateway.js'
import { createExternalWorkerMcpServer } from './external-worker-server.js'
import { NativeDescriptorCollector, type TrustedDescriptorContext } from './native-descriptor-capture.js'
import {
  constructTrustedWorkerNativeCall,
  constructTrustedWorkerRejectionProbe,
  correlateTrustedWorkerNativeCalls,
  prepareTrustedWorkerNativeRoute,
  type TrustedRouteInput,
  type TrustedWrapperCodec,
} from './trusted-worker-native-route.js'

const digest = `sha256:${'a'.repeat(64)}`
const context: TrustedDescriptorContext = {
  binarySha256: digest,
  platform: 'synthetic-test-platform',
  configSha256: digest,
  schemaSha256: digest,
  runId: 'run-1',
  requestId: 'request-1',
  threadId: 'thread-1',
  turnId: 'turn-1',
}
function hash(value: unknown) {
  const stable = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(stable)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map(key => [key, stable((input as Record<string, unknown>)[key])]),
          )
        : input
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')}`
}
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
    coordinatorHandoffId: 'session-1',
    coordinatorGeneration: 3,
    transportGeneration: 1,
    expectedInputHash: digest,
    expectedScopeHash: digest,
    assignmentSecret: 'synthetic-assignment-secret-123456789',
    expiresAt: '2026-10-14T01:00:00.000Z',
  }
}
async function sdkFixture(role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER') {
  const logical = createGatewayFixture(role)
  const scope = binding(role)
  const writeName = externalWorkerTools[role].at(-1)!
  let profileDigest = ''
  let canonicalRequests = 0
  const accepted = new Map<string, string>()
  const server = createExternalWorkerMcpServer({
    context: {
      api: {
        request: async (_path: string, options?: { body?: string }) => {
          canonicalRequests++
          const payload = JSON.parse(options!.body!) as Record<string, unknown>
          const hidden = new Set([
            'target',
            'journeyId',
            'workItemId',
            'attemptId',
            'assignmentId',
            'assignmentGeneration',
            'assignmentSecret',
            'leaseId',
            'expectedInputHash',
            'expectedScopeHash',
            'coordinatorHandoffId',
            'coordinatorGeneration',
            'ownerToken',
          ])
          const workerArguments = Object.fromEntries(Object.entries(payload).filter(([key]) => !hidden.has(key)))
          const publicBinding = Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'assignmentSecret'))
          accepted.set(
            String(payload.idempotencyKey),
            hash({ toolName: writeName, arguments: workerArguments, profileDigest, binding: publicBinding }),
          )
          return { syntheticOnly: true }
        },
      },
      options: {},
    },
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
              summary: 'Synthetic frozen scope',
              ...(toolName === 'operation_search' ? { resources: [] } : {}),
              ...(toolName === 'quality_journey_triage_evidence_read'
                ? {
                    receiptId: 'sealed-1',
                    artifactKind: 'log',
                    offset: 0,
                    limit: 4096,
                    text: 'Synthetic sealed evidence',
                  }
                : {}),
            },
          },
        ],
      })),
    authorize: async () => {},
    readAcceptance: async ({ toolName, idempotencyKey, requestHash }) => {
      if (accepted.get(idempotencyKey) !== requestHash) return null
      return {
        receiptId: 'accepted-1',
        assignmentId: scope.assignmentId,
        attemptId: scope.attemptId,
        operation: toolName,
        idempotencyKey,
        requestHash,
        artifactIds: ['artifact-1'],
      }
    },
    clock: () => new Date('2026-10-14T00:00:00.000Z'),
  })
  profileDigest = server.profile.profileDigest
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'trusted-route-offline-test', version: '0' })
  await server.server.connect(serverTransport)
  await client.connect(clientTransport)
  const listed = await client.listTools()
  expect(listed.tools.map(tool => tool.name)).toEqual([...externalWorkerTools[role]])
  return {
    server,
    client,
    listed,
    logical,
    canonicalRequests: () => canonicalRequests,
    close: async () => {
      await client.close()
      await server.server.close()
    },
  }
}
function routeInput(h: Awaited<ReturnType<typeof sdkFixture>>, wrapper = false): TrustedRouteInput {
  const extra = {
    type: 'function',
    name: 'native_shell',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  }
  const wrapped = {
    type: 'function',
    name: 'codemode.invoke',
    parameters: {
      type: 'object',
      properties: { operation: { type: 'string' }, callId: { type: 'string' }, args: { type: 'object' } },
      required: ['operation', 'callId', 'args'],
      additionalProperties: false,
    },
  }
  const tools = wrapper
    ? [wrapped, extra]
    : [
        ...h.listed.tools.map(tool => ({
          type: 'function',
          name: `mcp__worker__${tool.name}`,
          parameters: tool.inputSchema,
        })),
        extra,
      ]
  const request = {
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ tools })),
  }
  const capture = new NativeDescriptorCollector().capture(request, context)
  if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
  const codec: TrustedWrapperCodec = {
    version: 'M02_TRUSTED_WRAPPER_V1',
    provenance: 'OFFLINE_SYNTHETIC',
    semantics: 'Synthetic test codec: one outer invocation carries exactly one scoped MCP operation and call ID.',
    codecDigest: digest,
    rejectionProbeOperations: [
      'quality_journey_analysis_answer',
      'quality_journey_analysis_decide',
      'quality_journey_command_submit',
      'quality_journey_execution_start',
      'quality_journey_external_work_claim_v1',
      'quality_journey_get',
    ],
    encode: ({ operation, innerCallId, arguments: args }) => ({ operation, callId: innerCallId, args }),
    decodeInput: outerArguments => {
      const envelope = outerArguments as { operation: string; callId: string; args: Record<string, unknown> }
      return { operation: envelope.operation, innerCallId: envelope.callId, arguments: envelope.args }
    },
    decode: outerResult => {
      const envelope = outerResult as { operation: string; callId: string; result: unknown }
      return { operation: envelope.operation, innerCallId: envelope.callId, result: envelope.result }
    },
  }
  return {
    request,
    context,
    profile: h.server.profile,
    advertisedProfile: h.server.advertisedProfile,
    sdkListedTools: h.listed.tools,
    mcpServerName: 'worker',
    limits: { outerCalls: 3, innerCalls: 3, resultBytes: 4096 },
    routes: h.listed.tools.map((tool, index) => ({
      operation: tool.name,
      nativeName: wrapper ? wrapped.name : `mcp__worker__${tool.name}`,
      descriptorHash: capture.callables[wrapper ? 0 : index].descriptorHash,
      mode: wrapper ? ('REVIEWED_WRAPPER' as const) : ('DIRECT_MCP' as const),
      ...(wrapper ? { wrapper: codec } : {}),
    })),
  }
}

describe('M02 trusted native route, offline only', () => {
  it.each(Object.keys(externalWorkerTools) as ExternalWorkerRole[])(
    '%s binds the actual SDK role catalog with extra native inventory',
    async role => {
      const h = await sdkFixture(role)
      try {
        const input = routeInput(h)
        const prepared = prepareTrustedWorkerNativeRoute(input)
        expect(prepared).toMatchObject({
          status: 'PREPARED_NOT_RUNTIME_QUALIFIED',
          role,
          runtimeQualified: false,
          dispatchAllowed: false,
        })
        if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(prepared.reason)
        const read = h.logical.logicalScript[0]
        const call = constructTrustedWorkerNativeCall({
          routeInput: input,
          prepared,
          operation: read.toolName,
          arguments: read.arguments,
          innerCallId: 'inner-1',
          outerCallId: 'outer-1',
        })
        expect(call.status).toBe('CONSTRUCTED_NOT_DISPATCHED')
        const sdkResult = await h.client.callTool({ name: read.toolName, arguments: read.arguments })
        expect(sdkResult.isError).not.toBe(true)
        const submission = h.logical.logicalScript.at(-1)!
        const submitCall = constructTrustedWorkerNativeCall({
          routeInput: input,
          prepared,
          operation: submission.toolName,
          arguments: submission.arguments,
          innerCallId: 'inner-2',
          outerCallId: 'outer-2',
        })
        expect(submitCall.status).toBe('CONSTRUCTED_NOT_DISPATCHED')
        const submitResult = await h.client.callTool({ name: submission.toolName, arguments: submission.arguments })
        expect(submitResult.isError).not.toBe(true)
        expect(JSON.parse((submitResult.content[0] as { text: string }).text)).toMatchObject({
          receiptId: 'accepted-1',
          operation: submission.toolName,
        })
        if (call.status !== 'CONSTRUCTED_NOT_DISPATCHED') throw new Error(call.reason)
        expect(
          correlateTrustedWorkerNativeCalls(
            prepared,
            input,
            [call],
            [
              {
                outerCallId: call.outerCallId,
                innerCallId: call.innerCallId,
                operation: call.operation,
                nativeName: call.nativeName,
                innerArgumentsHash: call.innerArgumentsHash,
                outerArgumentsHash: call.outerArgumentsHash,
                outerResult: sdkResult,
                innerResult: sdkResult,
              },
            ],
          ),
        ).toMatchObject({ status: 'CORRELATED_OFFLINE_ONLY', outerCalls: 1, innerCalls: 1 })
      } finally {
        await h.close()
      }
    },
  )

  it('requires an explicit reviewed wrapper codec and validates its constructed outer schema', async () => {
    const h = await sdkFixture()
    try {
      const input = routeInput(h, true)
      const prepared = prepareTrustedWorkerNativeRoute(input)
      expect(prepared.status).toBe('PREPARED_NOT_RUNTIME_QUALIFIED')
      if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(prepared.reason)
      const call = constructTrustedWorkerNativeCall({
        routeInput: input,
        prepared,
        operation: h.logical.logicalScript[0].toolName,
        arguments: {},
        innerCallId: 'inner-1',
        outerCallId: 'outer-1',
      })
      expect(call).toMatchObject({ status: 'CONSTRUCTED_NOT_DISPATCHED', nativeName: 'codemode.invoke' })
      if (call.status !== 'CONSTRUCTED_NOT_DISPATCHED') throw new Error(call.reason)
      const wrappedResult = { operation: call.operation, callId: call.innerCallId, result: { accepted: true } }
      const observation = {
        outerCallId: call.outerCallId,
        innerCallId: call.innerCallId,
        operation: call.operation,
        nativeName: call.nativeName,
        innerArgumentsHash: call.innerArgumentsHash,
        outerArgumentsHash: call.outerArgumentsHash,
        outerResult: wrappedResult,
        innerResult: wrappedResult.result,
      }
      expect(correlateTrustedWorkerNativeCalls(prepared, input, [call], [observation])).toMatchObject({
        status: 'CORRELATED_OFFLINE_ONLY',
      })
      expect(
        correlateTrustedWorkerNativeCalls(
          prepared,
          input,
          [call],
          [{ ...observation, innerResult: { accepted: false } }],
        ),
      ).toMatchObject({ reason: 'RESULT_CORRELATION_MISMATCH' })
      const invalid = { ...input, routes: input.routes.map(route => ({ ...route, wrapper: undefined })) }
      expect(prepareTrustedWorkerNativeRoute(invalid)).toMatchObject({ reason: 'INCOMPLETE_WRAPPER_CODEC' })
      const broken = {
        ...input,
        routes: input.routes.map(route => ({
          ...route,
          wrapper: { ...route.wrapper!, encode: () => ({ unexpected: true }) },
        })),
      }
      const brokenPrepared = prepareTrustedWorkerNativeRoute(broken)
      expect(brokenPrepared.status).toBe('PREPARED_NOT_RUNTIME_QUALIFIED')
      if (brokenPrepared.status === 'PREPARED_NOT_RUNTIME_QUALIFIED')
        expect(
          constructTrustedWorkerNativeCall({
            routeInput: broken,
            prepared: brokenPrepared,
            operation: h.logical.logicalScript[0].toolName,
            arguments: {},
            innerCallId: 'inner-1',
            outerCallId: 'outer-1',
          }),
        ).toMatchObject({ reason: 'OUTER_SCHEMA_MISMATCH' })
      const crossRole = {
        ...input,
        routes: input.routes.map(route => ({
          ...route,
          wrapper: {
            ...route.wrapper!,
            encode: ({
              innerCallId,
              arguments: args,
            }: {
              innerCallId: string
              arguments: Record<string, unknown>
            }) => ({
              operation: 'quality_journey_execution_start',
              callId: innerCallId,
              args,
            }),
          },
        })),
      }
      const crossRolePrepared = prepareTrustedWorkerNativeRoute(crossRole)
      if (crossRolePrepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(crossRolePrepared.reason)
      expect(
        constructTrustedWorkerNativeCall({
          routeInput: crossRole,
          prepared: crossRolePrepared,
          operation: h.logical.logicalScript[0].toolName,
          arguments: {},
          innerCallId: 'inner-1',
          outerCallId: 'outer-1',
        }),
      ).toMatchObject({ reason: 'WRAPPER_INPUT_CORRELATION_MISMATCH' })
    } finally {
      await h.close()
    }
  })

  it('fails closed on unknown, duplicate, drifted and cross-role mappings and bounded correlation', async () => {
    const h = await sdkFixture()
    try {
      const input = routeInput(h)
      const prepared = prepareTrustedWorkerNativeRoute(input)
      if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(prepared.reason)
      expect(prepareTrustedWorkerNativeRoute({ ...input, routes: input.routes.slice(0, 1) })).toMatchObject({
        reason: 'INCOMPLETE_OPERATION_MAP',
      })
      expect(prepareTrustedWorkerNativeRoute({ ...input, sdkListedTools: [] })).toMatchObject({
        reason: 'SDK_LIST_MISMATCH',
      })
      expect(
        prepareTrustedWorkerNativeRoute({
          ...input,
          routes: input.routes.map((route, i) => (i ? route : { ...route, mode: 'UNKNOWN' as never })),
        }),
      ).toMatchObject({ reason: 'UNKNOWN_ROUTE_MODE' })
      expect(
        prepareTrustedWorkerNativeRoute({
          ...input,
          routes: input.routes.map(route => ({ ...route, operation: 'quality_journey_execution_start' })),
        }),
      ).toMatchObject({ reason: 'INCOMPLETE_OPERATION_MAP' })
      expect(
        prepareTrustedWorkerNativeRoute({
          ...input,
          routes: input.routes.map((route, i) =>
            i
              ? route
              : {
                  ...route,
                  descriptorHash: digest,
                },
          ),
        }),
      ).toMatchObject({ reason: 'DESCRIPTOR_MISMATCH' })
      const changed = { ...input, request: { ...input.request, body: Buffer.from(input.request.body) } }
      changed.request.body = Buffer.from(
        JSON.stringify({
          tools: [
            {
              type: 'function',
              name: 'unknown',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          ],
        }),
      )
      expect(
        constructTrustedWorkerNativeCall({
          routeInput: changed,
          prepared,
          operation: h.logical.logicalScript[0].toolName,
          arguments: {},
          innerCallId: 'inner-1',
          outerCallId: 'outer-1',
        }),
      ).toMatchObject({ reason: 'STALE_ROUTE' })
      const call = constructTrustedWorkerNativeCall({
        routeInput: input,
        prepared,
        operation: h.logical.logicalScript[0].toolName,
        arguments: {},
        innerCallId: 'inner-1',
        outerCallId: 'outer-1',
      })
      if (call.status !== 'CONSTRUCTED_NOT_DISPATCHED') throw new Error(call.reason)
      const observation = {
        outerCallId: call.outerCallId,
        innerCallId: call.innerCallId,
        operation: call.operation,
        nativeName: call.nativeName,
        innerArgumentsHash: call.innerArgumentsHash,
        outerArgumentsHash: call.outerArgumentsHash,
        outerResult: {},
        innerResult: {},
      }
      expect(
        correlateTrustedWorkerNativeCalls(prepared, input, [call, call], [observation, observation]),
      ).toMatchObject({
        reason: 'DUPLICATE_OR_INVALID_CALL_ID',
      })
      expect(
        correlateTrustedWorkerNativeCalls(
          prepared,
          input,
          [call],
          [{ ...observation, operation: 'quality_journey_execution_start' }],
        ),
      ).toMatchObject({ reason: 'CALL_CORRELATION_MISMATCH' })
      expect(
        correlateTrustedWorkerNativeCalls(
          prepared,
          input,
          [call],
          [{ ...observation, outerResult: 'x'.repeat(5000), innerResult: 'x'.repeat(5000) }],
        ),
      ).toMatchObject({ reason: 'RESULT_LIMIT' })
      expect(hash(input.profile)).toMatch(/^sha256:/)
    } finally {
      await h.close()
    }
  })

  it.each([
    'A01',
    'A02',
    'A03',
    'A04',
    'A05',
    'A06',
    'A07',
    'A08',
    'A09',
    'A10',
    'A11',
    'A12',
    'A13',
    'A14',
    'D01',
    'T01',
  ] as const)('%s constructs only its reviewed negative SDK lane', async selector => {
    const role: ExternalWorkerRole =
      selector === 'D01' ? 'TEST_SCENARIO_DESIGNER' : selector === 'T01' ? 'TRIAGER' : 'REQUIREMENT_ANALYZER'
    const h = await sdkFixture(role)
    try {
      const input = routeInput(h, true)
      const prepared = prepareTrustedWorkerNativeRoute(input)
      if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(prepared.reason)
      const baselineArguments =
        selector === 'T01'
          ? h.logical.logicalScript.find(call => call.toolName === 'quality_journey_triage_evidence_read')!.arguments
          : selector.startsWith('A') && Number(selector.slice(1)) >= 9
            ? undefined
            : h.logical.logicalScript.at(-1)!.arguments
      const probe = constructTrustedWorkerRejectionProbe({
        routeInput: input,
        prepared,
        selector,
        baselineArguments,
        baselineArgumentsHash: baselineArguments ? hash(baselineArguments) : undefined,
        outerCallId: `outer-${selector}`,
        innerCallId: `inner-${selector}`,
      })
      expect(probe).toMatchObject({
        status: 'CONSTRUCTED_REJECTION_NOT_DISPATCHED',
        selector,
        role,
        runtimeQualified: false,
        dispatchAllowed: false,
        outerCallCeiling: 3,
        innerCallCeiling: 3,
      })
      if (probe.status !== 'CONSTRUCTED_REJECTION_NOT_DISPATCHED') throw new Error(probe.reason)
      expect(probe.outerArgumentsHash).toMatch(/^sha256:/)
      const sdkResult = await h.client.callTool({ name: probe.operation, arguments: probe.innerArguments })
      expect(sdkResult.isError).toBe(true)
      expect(h.canonicalRequests()).toBe(0)
    } finally {
      await h.close()
    }
  })

  it('fences unknown selectors, wrong role, unrelated controls and unreachable direct routes', async () => {
    const h = await sdkFixture()
    const designer = await sdkFixture('TEST_SCENARIO_DESIGNER')
    try {
      const wrapperInput = routeInput(h, true)
      const prepared = prepareTrustedWorkerNativeRoute(wrapperInput)
      if (prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(prepared.reason)
      const base = { routeInput: wrapperInput, prepared, outerCallId: 'outer-1', innerCallId: 'inner-1' }
      const analyzerPacket = h.logical.logicalScript.at(-1)!.arguments
      expect(
        constructTrustedWorkerRejectionProbe({ ...base, selector: 'X99' as never, baselineArguments: analyzerPacket }),
      ).toMatchObject({ reason: 'UNKNOWN_REJECTION_SELECTOR' })
      expect(
        constructTrustedWorkerRejectionProbe({ ...base, selector: 'D01', baselineArguments: analyzerPacket }),
      ).toMatchObject({ reason: 'SELECTOR_ROLE_MISMATCH' })
      expect(
        constructTrustedWorkerRejectionProbe({
          ...base,
          selector: 'A01',
          baselineArguments: { ...analyzerPacket, unrelated: 'injection' },
          baselineArgumentsHash: hash({ ...analyzerPacket, unrelated: 'injection' }),
        }),
      ).toMatchObject({
        reason: 'INVALID_POSITIVE_CONTROL',
      })
      expect(
        constructTrustedWorkerRejectionProbe({
          ...base,
          selector: 'A01',
          baselineArguments: { ...analyzerPacket, idempotencyKey: 'changed' },
          baselineArgumentsHash: hash(analyzerPacket),
        }),
      ).toMatchObject({ reason: 'POSITIVE_CONTROL_HASH_MISMATCH' })
      expect(constructTrustedWorkerRejectionProbe({ ...base, selector: 'A09', baselineArguments: {} })).toMatchObject({
        reason: 'UNRELATED_PROBE_INPUT',
      })
      const directInput = routeInput(h)
      const directPrepared = prepareTrustedWorkerNativeRoute(directInput)
      if (directPrepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(directPrepared.reason)
      expect(
        constructTrustedWorkerRejectionProbe({
          routeInput: directInput,
          prepared: directPrepared,
          selector: 'A01',
          baselineArguments: analyzerPacket,
          baselineArgumentsHash: hash(analyzerPacket),
          outerCallId: 'outer-1',
          innerCallId: 'inner-1',
        }),
      ).toMatchObject({ reason: 'UNREACHABLE_NATIVE_ROUTE' })
      expect(
        constructTrustedWorkerRejectionProbe({
          routeInput: directInput,
          prepared: directPrepared,
          selector: 'A09',
          outerCallId: 'outer-1',
          innerCallId: 'inner-1',
        }),
      ).toMatchObject({ reason: 'UNREACHABLE_NATIVE_ROUTE' })
      const designerInput = routeInput(designer, true)
      const designerPrepared = prepareTrustedWorkerNativeRoute(designerInput)
      if (designerPrepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED') throw new Error(designerPrepared.reason)
      expect(
        constructTrustedWorkerRejectionProbe({
          routeInput: designerInput,
          prepared: designerPrepared,
          selector: 'D01',
          baselineArguments: analyzerPacket,
          baselineArgumentsHash: hash(analyzerPacket),
          outerCallId: 'outer-1',
          innerCallId: 'inner-1',
        }),
      ).toMatchObject({ reason: 'INVALID_POSITIVE_CONTROL' })
    } finally {
      await h.close()
      await designer.close()
    }
  })
})
