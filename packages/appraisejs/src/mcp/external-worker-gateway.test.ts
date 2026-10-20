import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { canonicalMcpToolNames } from './contract.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { McpRegistryContext } from './registry.js'
import {
  createExternalWorkerGateway,
  externalWorkerTools,
  ExternalWorkerCallError,
  type ExternalWorkerBinding,
  type ExternalWorkerRole,
  type FrozenWorkerRead,
} from './external-worker-gateway.js'

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
function harness(role: ExternalWorkerRole = 'REQUIREMENT_ANALYZER') {
  const scope = binding(role)
  let current = structuredClone(scope)
  let time = new Date(now)
  let failAfterCommit = false
  let commit = true
  let afterIoRevoked = false
  const artifacts = new Map<string, unknown>()
  const acceptances = new Map<string, { requestHash: string; payload: string }>()
  let gateway: ReturnType<typeof createExternalWorkerGateway>
  const request = vi.fn(async (_path: string, options?: { body?: string }) => {
    const args = JSON.parse(options!.body!)
    // Disposable deterministic acceptance store, not an Appraise authority/containment attestation.
    if (JSON.stringify(current) !== JSON.stringify(scope)) throw new Error('transaction fence')
    const payload = JSON.stringify(args)
    const prior = acceptances.get(args.idempotencyKey)
    if (prior && prior.payload !== payload) throw new Error('changed replay payload')
    if (commit) {
      artifacts.set(args.idempotencyKey, args)
      const hidden = [
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
      ]
      const workerArgs = Object.fromEntries(Object.entries(args).filter(([key]) => !hidden.includes(key)))
      const publicScope = Object.fromEntries(Object.entries(scope).filter(([key]) => key !== 'assignmentSecret'))
      const requestHash = fixtureHash({
        toolName: externalWorkerTools[role].at(-1),
        arguments: workerArgs,
        profileDigest: gateway.profile.profileDigest,
        binding: publicScope,
      })
      acceptances.set(args.idempotencyKey, { requestHash, payload })
    }
    if (failAfterCommit) throw new Error(`lost reply ${scope.assignmentSecret}`)
    return { accepted: true, credentials: 'never forwarded' }
  })
  const authorize = vi.fn(async (_binding, stage) => {
    if (JSON.stringify(current) !== JSON.stringify(scope) || (stage === 'after_io' && afterIoRevoked))
      throw new Error('revoked')
  })
  const readAcceptance = vi.fn(async ({ toolName, idempotencyKey, requestHash }) => {
    const stored = acceptances.get(idempotencyKey)
    if (!stored) return null
    if (stored.requestHash && stored.requestHash !== requestHash) throw new Error('changed replay')
    return {
      receiptId: 'accepted-1',
      assignmentId: scope.assignmentId,
      attemptId: scope.attemptId,
      operation: toolName,
      idempotencyKey,
      requestHash: stored.requestHash,
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
  const options = {
    context: { api: { request }, options: {} } as unknown as Omit<McpRegistryContext, 'server'>,
    binding: scope,
    frozenReads: reads,
    authorize,
    readAcceptance,
    clock: () => time,
  }
  return {
    options,
    gateway: (gateway = createExternalWorkerGateway(options)),
    scope,
    reads,
    request,
    authorize,
    artifacts,
    readAcceptance,
    mutate: (field: keyof ExternalWorkerBinding, value: unknown) => {
      current = { ...current, [field]: value }
    },
    expire: () => {
      time = new Date('2026-10-14T01:00:00.000Z')
    },
    revokeAfterIo: () => {
      afterIoRevoked = true
    },
    loseReply: () => {
      failAfterCommit = true
    },
    noCommit: () => {
      commit = false
    },
  }
}

const allRoles = Object.keys(externalWorkerTools) as ExternalWorkerRole[]
describe('external worker six-role profile and canonical submissions', () => {
  it.each(allRoles)('%s serves only frozen reads and validates a specialized accepted packet', async role => {
    const h = harness(role)
    expect(h.gateway.profile.tools.map(tool => tool.name)).toEqual([...externalWorkerTools[role]])
    expect(h.gateway.profile.resources).toEqual([])
    for (const read of h.reads)
      expect(await h.gateway.call(read.toolName, read.arguments)).toMatchObject({
        artifacts: [{ artifactId: 'artifact-read-1', data: { summary: 'frozen scoped projection' } }],
      })
    expect(h.request).not.toHaveBeenCalled()
    const tool = externalWorkerTools[role].at(-1)!
    expect(await h.gateway.call(tool, packet(role))).toMatchObject({
      receiptId: 'accepted-1',
      artifactIds: ['artifact-1'],
    })
    expect(h.request).toHaveBeenCalledTimes(1)
    const saved = h.artifacts.get('submit-1') as Record<string, unknown>
    expect(saved).toMatchObject({
      target: 'target-1',
      assignmentId: 'assignment-1',
      assignmentGeneration: 2,
      coordinatorGeneration: 3,
    })
    expect(JSON.stringify(h.gateway.profile)).not.toContain(h.scope.assignmentSecret)
  })
  it.each(allRoles)('%s rejects malformed canonical payloads before I/O', async role => {
    const h = harness(role)
    const args = packet(role)
    delete args[
      role === 'REQUIREMENT_ANALYZER'
        ? 'charter'
        : role === 'SCOUT' || role === 'RESOURCE_EXPLORER'
          ? 'bundle'
          : role === 'TEST_SCENARIO_DESIGNER'
            ? 'portfolio'
            : role === 'AUTOMATOR'
              ? 'scenarios'
              : 'report'
    ]
    await expect(h.gateway.call(externalWorkerTools[role].at(-1)!, args)).rejects.toBeInstanceOf(
      ExternalWorkerCallError,
    )
    expect(h.request).not.toHaveBeenCalled()
  })
  it('preserves nested identity schemas and canonical semantic refinements', async () => {
    const h = harness('TEST_SCENARIO_DESIGNER')
    const tool = h.gateway.profile.tools.at(-1)!
    const schema = tool.inputSchema as { properties: Record<string, { properties: Record<string, unknown> }> }
    expect(schema.properties.result.properties).toHaveProperty('role')
    expect(schema.properties.result.properties).toHaveProperty('assignmentId')
    const args = packet('TEST_SCENARIO_DESIGNER')
    const portfolio = args.portfolio as { graph: { edges: unknown[] } }
    portfolio.graph.edges = [
      {
        sourceScenarioRevisionId: 'missing',
        targetScenarioRevisionId: 'scenario-revision-1',
        relation: 'DEPENDS_ON',
        rationale: 'Invalid graph',
      },
    ]
    await expect(h.gateway.call(tool.name, args)).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.request).not.toHaveBeenCalled()
  })
})

describe('adversarial authority and frozen projection rejection', () => {
  it.each([
    'target',
    'targetProjectId',
    'journeyId',
    'assignmentId',
    'assignmentGeneration',
    'coordinatorGeneration',
    'assignmentSecret',
    'principal',
    'projectBearer',
    'actor',
  ])('rejects forged caller %s', async key => {
    const h = harness()
    await expect(
      h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], {
        ...packet('REQUIREMENT_ANALYZER'),
        [key]: 'forged',
      }),
    ).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.request).not.toHaveBeenCalled()
  })
  it.each([
    'hubId',
    'target',
    'targetProjectId',
    'journeyId',
    'role',
    'workItemId',
    'attemptId',
    'assignmentId',
    'assignmentGeneration',
    'leaseId',
    'authorizationId',
    'coordinatorHandoffId',
    'coordinatorGeneration',
    'transportGeneration',
    'expectedInputHash',
    'expectedScopeHash',
    'assignmentSecret',
  ])('rejects stale/current binding mismatch: %s', async field => {
    const h = harness()
    h.mutate(field as keyof ExternalWorkerBinding, 'changed')
    await expect(h.gateway.call('quality_journey_analysis_get', {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.request).not.toHaveBeenCalled()
  })
  it.each([
    'quality_journey_analysis_answer',
    'quality_journey_analysis_decide',
    'quality_journey_analysis_revision_request',
    'quality_journey_analysis_publish',
    'quality_journey_command_submit',
    'quality_journey_work_complete',
    'quality_journey_execution_start',
    'quality_journey_resume',
    'quality_journey_external_work_claim_v1',
    'quality_journey_external_work_admit_v1',
    'quality_journey_external_work_outcome_get_v1',
    'quality_journey_handoff_redeem',
    'quality_journey_scenarios_decide',
    'quality_journey_closure_decide',
    'environment_ensure',
    'locator_ensure',
    'quality_journey_external_triage_submit_v1',
    'exec_command',
    'apply_patch',
    'web_search',
    'other_mcp',
  ])('rejects prohibited operation %s', async name => {
    const h = harness()
    await expect(h.gateway.call(name, {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.authorize).not.toHaveBeenCalled()
    expect(h.request).not.toHaveBeenCalled()
  })
  it('refuses missing sessions, extra frozen reads, missing reads, and mismatched revisions', () => {
    const h = harness()
    expect(() =>
      createExternalWorkerGateway({ ...h.options, binding: { ...h.scope, coordinatorHandoffId: '' } }),
    ).toThrow()
    expect(() => createExternalWorkerGateway({ ...h.options, frozenReads: [] })).toThrow('Required frozen read')
    expect(() =>
      createExternalWorkerGateway({ ...h.options, frozenReads: [{ ...h.reads[0], toolName: 'quality_journey_get' }] }),
    ).toThrow('outside')
    expect(() =>
      createExternalWorkerGateway({
        ...h.options,
        frozenReads: [{ ...h.reads[0], inputHash: `sha256:${'b'.repeat(64)}` }],
      }),
    ).toThrow('outside')
  })
  it('rejects unknown search/receipt pages and prevents mutable snapshot escape', async () => {
    const h = harness('RESOURCE_EXPLORER')
    h.reads[0].source[0].data.summary = 'mutated'
    expect(await h.gateway.call('quality_journey_discovery_get', {})).toMatchObject({
      artifacts: [{ data: { summary: 'frozen scoped projection' } }],
    })
    await expect(h.gateway.call('operation_search', { query: 'another-project' })).rejects.toBeInstanceOf(
      ExternalWorkerCallError,
    )
    expect(h.request).not.toHaveBeenCalled()
  })
  it('projects broad reads and excludes alternate secrets and foreign assignment records', async () => {
    const h = harness('RESOURCE_EXPLORER')
    const read = h.reads[0]
    read.source[0].data = {
      summary: 'safe',
      secretUnderAnotherName: 'secret-value',
      unrelatedArtifacts: ['foreign'],
      credentials: 'broad bearer',
    }
    const foreign = {
      ...read.source[0],
      attemptId: 'other-attempt',
      artifactId: 'foreign',
      data: { summary: 'foreign' },
    }
    const gateway = createExternalWorkerGateway({
      ...h.options,
      frozenReads: [{ ...read, source: [...read.source, foreign] }, h.reads[1]],
    })
    const output = await gateway.call(read.toolName, read.arguments)
    expect(output).toMatchObject({ artifacts: [{ artifactId: 'artifact-read-1', data: { summary: 'safe' } }] })
    expect(JSON.stringify(output)).not.toMatch(/secret-value|foreign|broad bearer/)
    expect(() =>
      createExternalWorkerGateway({
        ...h.options,
        frozenReads: [{ ...read, allowedArtifactIds: ['foreign'], source: [foreign] }, h.reads[1]],
      }),
    ).toThrow('scope')
    read.source[0].data.summary = h.scope.assignmentSecret
    expect(() => createExternalWorkerGateway({ ...h.options, frozenReads: [read, h.reads[1]] })).toThrow('Secret')
  })
  it('keeps role maps immutable and rejects expired bindings', async () => {
    const h = harness()
    expect(Object.isFrozen(externalWorkerTools.REQUIREMENT_ANALYZER)).toBe(true)
    h.expire()
    await expect(h.gateway.call('quality_journey_analysis_get', {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.authorize).not.toHaveBeenCalled()
  })
})

describe('acceptance, I/O races and lost replies', () => {
  it('never accepts handler success without a durable acceptance', async () => {
    const h = harness()
    h.noCommit()
    await expect(
      h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], packet('REQUIREMENT_ANALYZER')),
    ).rejects.toMatchObject({ receipt: { canonicalAccepted: false, effectOutcome: 'unknown' } })
  })
  it('preserves occurred acceptance on post-I/O revocation without exposing raw response', async () => {
    const h = harness()
    h.revokeAfterIo()
    await expect(
      h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], packet('REQUIREMENT_ANALYZER')),
    ).rejects.toMatchObject({ receipt: { canonicalAccepted: true, effectOutcome: 'occurred' } })
    expect(h.artifacts.size).toBe(1)
  })
  it('records unknown after a lost reply; trusted reconciliation precedes exact replay', async () => {
    const h = harness()
    h.loseReply()
    let failure: ExternalWorkerCallError | undefined
    try {
      await h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], packet('REQUIREMENT_ANALYZER'))
    } catch (error) {
      failure = error as ExternalWorkerCallError
    }
    expect(failure?.receipt).toMatchObject({ effectOutcome: 'unknown', canonicalAccepted: false })
    expect(String(failure)).not.toContain(h.scope.assignmentSecret)
    expect(h.request).toHaveBeenCalledTimes(1)
    expect(
      await h.readAcceptance({
        toolName: externalWorkerTools.REQUIREMENT_ANALYZER[1],
        idempotencyKey: 'submit-1',
        requestHash: failure!.receipt.requestHash,
      }),
    ).toMatchObject({ receiptId: 'accepted-1' })
    expect(h.artifacts.size).toBe(1)
  })
  it('replays identical accepted packets without duplicate artifacts and rejects changed input', async () => {
    const h = harness()
    const name = externalWorkerTools.REQUIREMENT_ANALYZER[1]
    const first = await h.gateway.call(name, packet('REQUIREMENT_ANALYZER'))
    expect(await h.gateway.call(name, packet('REQUIREMENT_ANALYZER'))).toEqual(first)
    expect(h.artifacts.size).toBe(1)
    const changed = packet('REQUIREMENT_ANALYZER')
    ;(changed.charter as { objectives: string[] }).objectives = ['Changed']
    await expect(h.gateway.call(name, changed)).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.artifacts.size).toBe(1)
  })
})

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

describe('exact registration and independent acceptance identity', () => {
  it.each(allRoles)('%s excludes every broader canonical operation and registers strict schemas', async role => {
    const h = harness(role)
    const allowlist = new Set<string>(externalWorkerTools[role])
    for (const name of canonicalMcpToolNames.filter(name => !allowlist.has(name)))
      await expect(h.gateway.call(name, {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    const schemas = new Map<string, z.ZodType>()
    const server = {
      registerTool: (name: string, config: { inputSchema: z.ZodType }) => schemas.set(name, config.inputSchema),
      registerResource: vi.fn(),
    }
    h.gateway.register(server as unknown as McpServer)
    expect([...schemas.keys()]).toEqual([...allowlist])
    expect(server.registerResource).not.toHaveBeenCalled()
    expect(() => schemas.get(externalWorkerTools[role][0])!.parse({ target: 'forged' })).toThrow()
    expect(h.request).not.toHaveBeenCalled()
  })
  it('rejects mismatched persisted acceptance instead of echoing requested identity', async () => {
    const h = harness()
    h.readAcceptance.mockImplementationOnce(async () => ({
      receiptId: 'accepted-other',
      assignmentId: 'assignment-other',
      attemptId: 'attempt-other',
      operation: externalWorkerTools.REQUIREMENT_ANALYZER[1],
      idempotencyKey: 'submit-1',
      requestHash: digest,
      artifactIds: ['artifact-other'],
    }))
    await expect(
      h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], packet('REQUIREMENT_ANALYZER')),
    ).rejects.toMatchObject({ receipt: { canonicalAccepted: false, effectOutcome: 'unknown' } })
    expect(h.artifacts.size).toBe(1)
  })
  it('does not permit forged manifest mutations or callback replacement to expand authority', async () => {
    const h = harness()
    h.gateway.profile.tools[0].name = 'quality_journey_execution_start'
    h.options.authorize = vi.fn().mockResolvedValue(undefined)
    h.mutate('coordinatorGeneration', 4)
    await expect(h.gateway.call('quality_journey_analysis_get', {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    await expect(h.gateway.call('quality_journey_execution_start', {})).rejects.toBeInstanceOf(ExternalWorkerCallError)
    expect(h.request).not.toHaveBeenCalled()
  })
  it.each(['targetProjectId', 'journeyId', 'workItemId', 'attemptId', 'hubId'])(
    'rejects foreign projection scope %s',
    field => {
      const h = harness()
      const read = h.reads[0]
      const foreign = { ...read.source[0], [field]: 'foreign' }
      expect(() =>
        createExternalWorkerGateway({ ...h.options, frozenReads: [{ ...read, source: [foreign] }] }),
      ).toThrow('scope')
    },
  )
  it('binds triage pages to the exact receipt, kind, offset and limit', async () => {
    const h = harness('TRIAGER')
    const read = h.reads[1]
    read.source[0].data = { ...read.source[0].data, offset: 1 }
    expect(() => createExternalWorkerGateway(h.options)).toThrow('Evidence page')
    await expect(
      h.gateway.call('quality_journey_triage_evidence_read', { receiptId: 'foreign', artifactKind: 'log' }),
    ).rejects.toBeInstanceOf(ExternalWorkerCallError)
    await expect(
      h.gateway.call('quality_journey_triage_evidence_read', {
        receiptId: 'artifact-read-1',
        artifactKind: 'log',
        offset: 1,
      }),
    ).rejects.toBeInstanceOf(ExternalWorkerCallError)
  })
  it('fences a concurrent change inside fixture commit admission', async () => {
    const h = harness()
    h.authorize.mockImplementationOnce(async () => {
      h.mutate('coordinatorGeneration', 4)
    })
    await expect(
      h.gateway.call(externalWorkerTools.REQUIREMENT_ANALYZER[1], packet('REQUIREMENT_ANALYZER')),
    ).rejects.toMatchObject({ receipt: { canonicalAccepted: false, effectOutcome: 'unknown' } })
    expect(h.artifacts.size).toBe(0)
  })
})
