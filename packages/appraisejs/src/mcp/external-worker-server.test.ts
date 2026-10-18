import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ListPromptsResultSchema, ListResourcesResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { describe, expect, it, vi } from 'vitest'

import { canonicalMcpToolNames } from './contract.js'
import {
  externalWorkerTools,
  type ExternalWorkerBinding,
  type ExternalWorkerRole,
  type FrozenWorkerRead,
} from './external-worker-gateway.js'
import { prepareExternalWorkerNativeMapping } from './external-worker-native-mapping.js'
import { createExternalWorkerMcpServer } from './external-worker-server.js'
import { NativeDescriptorCollector, type TrustedDescriptorContext } from './native-descriptor-capture.js'
import type { McpRegistryContext } from './registry.js'

const digest = `sha256:${'a'.repeat(64)}`
const now = '2026-10-14T00:00:00.000Z'
function binding(role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER'): ExternalWorkerBinding {
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
function result(role: ExternalWorkerRole) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    assignmentId: 'assignment-1',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    roleContractDigest: digest,
    inputHash: digest,
    role,
    status: 'COMPLETED',
    outputs: [],
    evidenceReceipts: [],
    assumptions: [],
    blockers: [],
    unresolvedQuestions: [],
    submittedAt: now,
  }
}
const bundle = {
  bundleId: 'bundle-1',
  cycleId: 'cycle-1',
  analysisRevision: { artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest },
  analysisApproval: { artifactId: 'approval-1', contentHash: digest },
  authorizationId: 'authorization-1',
  inputHash: digest,
  assignmentScopeHash: digest,
  approvedRequirementSetHash: digest,
  inputArtifacts: [
    { kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'analysis-1', revisionId: 'revision-1', contentHash: digest },
    { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-1', contentHash: digest },
  ],
  evidenceReceipts: [{ artifactId: 'receipt-1', contentHash: digest }],
}
function packet(role: ExternalWorkerRole): Record<string, unknown> {
  const base = { idempotencyKey: 'submit-1' }
  switch (role) {
    case 'REQUIREMENT_ANALYZER':
      return {
        ...base,
        charter: {
          charterId: 'charter-1',
          analysisRevisionId: 'analysis-1',
          cycleId: 'cycle-1',
          requirementRevisionId: 'requirement-1',
          objectives: ['Exercise a synthetic requirement'],
          scope: { included: ['Fixture'], excluded: [] },
          actors: [],
          requirements: [{ requirementId: 'r1', statement: 'Fixture requirement', sourceRefs: ['brief-1'] }],
          obligations: [
            {
              obligationId: 'o1',
              requirementId: 'r1',
              statement: 'Fixture obligation',
              acceptanceSignals: ['Fixture passes'],
            },
          ],
          constraints: [],
          assumptions: [],
          risks: [],
          acceptanceSignals: ['Fixture passes'],
          retiredRequirementIds: [],
          questions: [],
          resolvedQuestionAnswerIds: [],
        },
      }
    case 'SCOUT':
      return {
        ...base,
        discoveryRevisionId: 'discovery-1',
        bundle: {
          ...bundle,
          observedAt: now,
          targetSnapshot: { snapshotId: 'snapshot-1', capturedAt: now, contentHash: digest },
          observations: [
            {
              observationId: 'observation-1',
              snapshotId: 'snapshot-1',
              routeId: 'route-1',
              environmentId: 'environment-1',
              fact: 'Synthetic sealed fact',
              evidenceReceiptIds: ['receipt-1'],
              confidence: 'HIGH',
              confidenceRationale: 'Fixture receipt',
              stability: 'STABLE',
              stabilityRationale: 'Fixture',
              revalidationPolicy: { triggers: ['revision-changed'] },
            },
          ],
        },
      }
    case 'RESOURCE_EXPLORER':
      return {
        ...base,
        discoveryRevisionId: 'discovery-1',
        bundle: {
          ...bundle,
          resolvedAt: now,
          destinationModuleId: 'module-1',
          approvedRequirementIds: ['r1'],
          reusable: [],
          incompatible: [],
          stale: [],
          crossTarget: [],
          missing: [
            {
              requirementId: 'r1',
              capabilityId: 'capability-1',
              reasonCode: 'NOT_FOUND',
              explanation: 'Synthetic gap',
              evidenceReceiptIds: ['receipt-1'],
            },
          ],
        },
      }
    case 'TEST_SCENARIO_DESIGNER':
      return {
        ...base,
        result: result(role),
        portfolio: {
          schemaVersion: 'appraise.quality-journey/v1',
          portfolioId: 'portfolio-1',
          portfolioRevisionId: 'portfolio-revision-1',
          journeyId: 'journey-1',
          targetProjectId: 'project-1',
          cycleId: 'cycle-1',
          discoveryRevisionId: 'discovery-1',
          discoveryCompletionHash: digest,
          coverageRationale: 'Synthetic coverage',
          graph: { edges: [], sharedSetup: [] },
          scenarios: [
            {
              stableScenarioId: 'scenario-1',
              scenarioRevisionId: 'scenario-revision-1',
              behavioralIntent: {
                title: 'Synthetic scenario',
                narrative: 'Exercise fixture',
                requirementIds: ['r1'],
                expectedSignals: ['Pass'],
                steps: [{ stepId: 'step-1', action: 'Use fixture', expected: 'Pass' }],
              },
              enrichment: { observationIds: ['observation-1'], resourceAssumptionIds: [], feasibilityNotes: [] },
              layout: { x: 0, y: 0, sequence: 0 },
            },
          ],
        },
      }
    case 'AUTOMATOR':
      return {
        ...base,
        result: result(role),
        scenarios: [
          {
            scenarioRevisionId: 'scenario-revision-1',
            steps: [
              {
                sourceScenarioStepId: 'step-1',
                stepDefinition: { id: 'definition-1', version: '1', definitionHash: digest },
                operation: {
                  id: 'operation-1',
                  version: '1',
                  handler: { id: 'handler-1', version: '1', contentHash: digest },
                },
                parameters: [],
                testData: [],
                locatorRequirements: [],
              },
            ],
          },
        ],
      }
    case 'TRIAGER':
      return {
        ...base,
        result: result(role),
        report: {
          schemaVersion: 'appraise.quality-journey/v1',
          reportRevisionId: 'report-1',
          executionCycleId: 'execution-1',
          cycleId: 'cycle-1',
          inputHash: digest,
          summary: 'Synthetic triage',
          findings: [],
          coverage: [
            {
              requirementId: 'r1',
              scenarioRevisionIds: [],
              testRunIds: [],
              outcome: 'NOT_EVALUATED',
              rationale: 'Fixture only',
            },
          ],
          residualRisks: [],
          recommendations: ['Collect evidence'],
        },
      }
  }
}

function fixtureHash(value: unknown): string {
  const canonical = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(canonical)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.keys(input)
              .sort()
              .map(key => [key, canonical((input as Record<string, unknown>)[key])]),
          )
        : input
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`
}

function harness(role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER') {
  const scope = binding(role)
  let current = structuredClone(scope)
  let time = new Date(now)
  let loseReply = false
  let acceptanceMode: 'valid' | 'missing' | 'wrong' = 'valid'
  let profileDigest = ''
  const submitted = new Map<string, { requestHash: string; payload: string }>()
  const request = vi.fn(async (_path: string, options?: { body?: string }) => {
    const argumentsValue = JSON.parse(options!.body!) as Record<string, unknown>
    if (JSON.stringify(current) !== JSON.stringify(scope)) throw new Error('synthetic transaction fence')
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
    const workerArguments = Object.fromEntries(Object.entries(argumentsValue).filter(([key]) => !hidden.has(key)))
    const publicBinding = Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'assignmentSecret'))
    const requestHash = fixtureHash({
      toolName: externalWorkerTools[role].at(-1),
      arguments: workerArguments,
      profileDigest,
      binding: publicBinding,
    })
    submitted.set(String(argumentsValue.idempotencyKey), {
      requestHash,
      payload: JSON.stringify(argumentsValue),
    })
    if (loseReply) throw new Error('synthetic lost reply')
    return { accepted: true }
  })
  const authorize = vi.fn(async () => {
    if (JSON.stringify(current) !== JSON.stringify(scope)) throw new Error('synthetic revocation')
  })
  const readAcceptance = vi.fn(async ({ toolName, idempotencyKey, requestHash }) => {
    const stored = submitted.get(idempotencyKey)
    if (!stored || acceptanceMode === 'missing') return null
    return {
      receiptId: 'accepted-1',
      assignmentId: acceptanceMode === 'wrong' ? 'assignment-other' : scope.assignmentId,
      attemptId: scope.attemptId,
      operation: toolName,
      idempotencyKey,
      requestHash: stored.requestHash === requestHash ? stored.requestHash : digest,
      artifactIds: ['artifact-1'],
    }
  })
  const reads: FrozenWorkerRead[] = externalWorkerTools[role]
    .filter(name => !name.startsWith('quality_journey_external_'))
    .map(toolName => ({
      toolName,
      arguments:
        toolName === 'operation_search'
          ? { query: 'fixture' }
          : toolName === 'quality_journey_triage_evidence_read'
            ? { receiptId: 'artifact-read-1', artifactKind: 'log' }
            : {},
      allowedArtifactIds: ['artifact-read-1'],
      source: [
        {
          hubId: scope.hubId,
          targetProjectId: scope.targetProjectId,
          journeyId: scope.journeyId,
          workItemId: scope.workItemId,
          attemptId: scope.attemptId,
          inputHash: digest,
          scopeHash: digest,
          artifactId: 'artifact-read-1',
          data: {
            summary: 'frozen scoped projection',
            ...(toolName === 'operation_search' ? { resources: [] } : {}),
            ...(toolName === 'quality_journey_triage_evidence_read'
              ? {
                  receiptId: 'artifact-read-1',
                  artifactKind: 'log',
                  offset: 0,
                  limit: 65536,
                  text: 'sealed fixture evidence',
                }
              : {}),
          },
        },
      ],
      inputHash: digest,
      scopeHash: digest,
    }))
  const endpoint = createExternalWorkerMcpServer({
    context: { api: { request }, options: {} } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: scope,
    frozenReads: reads,
    authorize,
    readAcceptance,
    clock: () => time,
  })
  profileDigest = endpoint.profile.profileDigest
  const client = new Client({ name: 'external-worker-test', version: '1' })
  return {
    ...endpoint,
    client,
    scope,
    reads,
    request,
    authorize,
    readAcceptance,
    submitted,
    connect: async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      await endpoint.server.connect(serverTransport)
      await client.connect(clientTransport)
    },
    close: async () => {
      await client.close()
      await endpoint.server.close()
    },
    revoke: () => {
      current = { ...current, coordinatorGeneration: 4 }
    },
    expire: () => {
      time = new Date(scope.expiresAt)
    },
    loseReply: () => {
      loseReply = true
    },
    acceptance: (mode: 'valid' | 'missing' | 'wrong') => {
      acceptanceMode = mode
    },
  }
}

const allRoles = Object.keys(externalWorkerTools) as ExternalWorkerRole[]

describe('actual SDK external worker MCP endpoint', () => {
  it.each(allRoles)('%s exposes its exact role catalog, frozen reads, and accepted specialized submit', async role => {
    const h = harness(role)
    await h.connect()
    try {
      const listed = await h.client.listTools()
      expect(listed.tools.map(tool => tool.name)).toEqual([...externalWorkerTools[role]])
      expect(h.profile.tools.map(tool => tool.name)).toEqual([...externalWorkerTools[role]])
      expect(Object.isFrozen(h.profile)).toBe(true)
      expect(Object.isFrozen(h.advertisedProfile)).toBe(true)
      expect(h.advertisedProfile.gatewayProfileDigest).toBe(h.profile.profileDigest)
      expect(h.advertisedProfile.tools).toEqual(
        listed.tools.map(tool => ({
          name: tool.name,
          inputSchema: tool.inputSchema,
          schemaHash: fixtureHash(tool.inputSchema),
        })),
      )
      expect(h.advertisedProfile.profileDigest).toBe(
        fixtureHash({ gatewayProfileDigest: h.profile.profileDigest, tools: h.advertisedProfile.tools }),
      )
      if (role === 'REQUIREMENT_ANALYZER') {
        expect(h.profile.tools[0].inputSchema).not.toEqual(listed.tools[0].inputSchema)
        expect((h.profile.tools[0].inputSchema as { $schema?: string }).$schema).not.toBe(
          (listed.tools[0].inputSchema as { $schema?: string }).$schema,
        )
      }
      for (const read of h.reads) {
        const tool = listed.tools.find(tool => tool.name === read.toolName)!
        expect(tool.inputSchema.properties).not.toHaveProperty('target')
        const response = await h.client.callTool({ name: read.toolName, arguments: read.arguments })
        expect(response.isError).not.toBe(true)
        expect(JSON.parse((response.content[0] as { text: string }).text)).toMatchObject({
          artifacts: [{ artifactId: 'artifact-read-1', data: { summary: 'frozen scoped projection' } }],
        })
      }
      expect(h.request).not.toHaveBeenCalled()
      const submission = externalWorkerTools[role].at(-1)!
      const response = await h.client.callTool({ name: submission, arguments: packet(role) })
      expect(response.isError).not.toBe(true)
      expect(JSON.parse((response.content[0] as { text: string }).text)).toMatchObject({
        receiptId: 'accepted-1',
        assignmentId: h.scope.assignmentId,
        attemptId: h.scope.attemptId,
        operation: submission,
      })
      expect(h.request).toHaveBeenCalledTimes(1)
      expect(h.submitted.size).toBe(1)
    } finally {
      await h.close()
    }
  })

  it.each(allRoles)('%s binds actual SDK advertised schemas through collector and native mapper', async role => {
    const h = harness(role)
    await h.connect()
    try {
      const listed = await h.client.listTools()
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
      const request = {
        method: 'POST',
        path: '/v1/responses',
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            tools: listed.tools.map(tool => ({
              type: 'function',
              name: `mcp__worker__${tool.name}`,
              parameters: tool.inputSchema,
            })),
          }),
        ),
      }
      const capture = new NativeDescriptorCollector().capture(request, context)
      if (capture.status !== 'CAPTURED') throw new Error(capture.reason)
      const routes = capture.callables.map((callable, index) => ({
        nativeName: callable.name,
        operation: listed.tools[index].name,
        descriptorHash: callable.descriptorHash,
      }))
      const mapping = prepareExternalWorkerNativeMapping({
        request,
        context,
        profile: h.profile,
        advertisedProfile: h.advertisedProfile,
        mcpServerName: 'worker',
        routes,
      })
      expect(mapping).toMatchObject({
        status: 'PREPARED_NOT_RUNTIME_QUALIFIED',
        profileDigest: h.profile.profileDigest,
        advertisedProfileDigest: h.advertisedProfile.profileDigest,
        runtimeQualified: false,
        dispatchAllowed: false,
      })
      expect(h.request).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })

  it('has no resource, prompt, or ambient full-MCP catalog', async () => {
    const h = harness()
    await h.connect()
    try {
      expect(h.server.server.getCapabilities()).toEqual({ tools: { listChanged: true } })
      const allowed = new Set<string>(externalWorkerTools.REQUIREMENT_ANALYZER)
      expect((await h.client.listTools()).tools.every(tool => allowed.has(tool.name))).toBe(true)
      expect(canonicalMcpToolNames.some(name => !allowed.has(name))).toBe(true)
      await expect(h.client.request({ method: 'resources/list' }, ListResourcesResultSchema)).rejects.toThrow()
      await expect(h.client.request({ method: 'prompts/list' }, ListPromptsResultSchema)).rejects.toThrow()
      expect(h.request).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })

  it.each([
    'quality_journey_analysis_decide',
    'quality_journey_execution_start',
    'quality_journey_external_work_claim_v1',
    'quality_journey_external_triage_submit_v1',
    'exec_command',
    'apply_patch',
    'web_search',
  ])('rejects unregistered human, broad, and native tool %s before canonical ingress', async name => {
    const h = harness()
    await h.connect()
    try {
      const result = await h.client.callTool({ name, arguments: {} })
      expect(result.isError).toBe(true)
      expect(h.authorize).not.toHaveBeenCalled()
      expect(h.request).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })

  it.each(['target', 'ownerToken', 'principal', 'projectBearer', 'authorizationId'])(
    'rejects injected authority field %s before canonical ingress',
    async field => {
      const h = harness()
      await h.connect()
      try {
        const result = await h.client.callTool({
          name: externalWorkerTools.REQUIREMENT_ANALYZER[1],
          arguments: { ...packet('REQUIREMENT_ANALYZER'), [field]: 'forged' },
        })
        expect(result.isError).toBe(true)
        expect(h.request).not.toHaveBeenCalled()
      } finally {
        await h.close()
      }
    },
  )

  it('rejects malformed specialized schema before canonical ingress', async () => {
    const h = harness()
    await h.connect()
    try {
      const result = await h.client.callTool({
        name: externalWorkerTools.REQUIREMENT_ANALYZER[1],
        arguments: { idempotencyKey: 'submit-1' },
      })
      expect(result.isError).toBe(true)
      expect(h.request).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })

  it.each(['revoke', 'expire'] as const)('fences %s before frozen read and canonical I/O', async mode => {
    const h = harness()
    await h.connect()
    try {
      h[mode]()
      const response = await h.client.callTool({ name: 'quality_journey_analysis_get', arguments: {} })
      expect(response.isError).toBe(true)
      expect(h.request).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })

  it.each(['missing', 'wrong'] as const)('refuses %s durable acceptance after handler success', async mode => {
    const h = harness()
    await h.connect()
    try {
      h.acceptance(mode)
      const response = await h.client.callTool({
        name: externalWorkerTools.REQUIREMENT_ANALYZER[1],
        arguments: packet('REQUIREMENT_ANALYZER'),
      })
      expect(response.isError).toBe(true)
      expect(h.request).toHaveBeenCalledTimes(1)
      expect(h.readAcceptance).toHaveBeenCalledTimes(1)
    } finally {
      await h.close()
    }
  })

  it('does not retry a lost canonical reply through the SDK', async () => {
    const h = harness()
    await h.connect()
    try {
      h.loseReply()
      const response = await h.client.callTool({
        name: externalWorkerTools.REQUIREMENT_ANALYZER[1],
        arguments: packet('REQUIREMENT_ANALYZER'),
      })
      expect(response.isError).toBe(true)
      expect(h.request).toHaveBeenCalledTimes(1)
      expect(h.readAcceptance).not.toHaveBeenCalled()
      expect(h.submitted.size).toBe(1)
      expect(JSON.stringify(response)).not.toContain(h.scope.assignmentSecret)
    } finally {
      await h.close()
    }
  })
})
