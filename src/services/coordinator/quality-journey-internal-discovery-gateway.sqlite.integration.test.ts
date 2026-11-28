import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import * as scenarioServices from './quality-journey-scenario-service'
import {
  getAppManagedPreparationRecovery,
  recoverAppManagedScenarioAutomation,
  getAppManagedScenarioDesignCorrection,
  requestAppManagedScenarioDesignCorrection,
} from './app-managed-scenario-automation-recovery'
import { readAppManagedDesignerSuccessor } from './app-managed-scenario-automation-task'
import { continueAppManagedJourney, readAppManagedJourneyContinuation } from './app-managed-progression-service'
import { startAppManagedScenarioAutomation } from './app-managed-scenario-automation-service'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createAttemptScopedWorkerMcpServer } from '../../../packages/appraisejs/src/mcp/managed-worker-server'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion, type QualityJourneyRole } from '@/lib/quality-journey'
import { createQualityJourneyInternalScenarioAutomationGateway } from './quality-journey-internal-scenario-automation-gateway'
import {
  decideQualityJourneyScenarios,
  requestQualityJourneyScenarioRevision,
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  startQualityJourneyScenarioDesign,
} from './quality-journey-scenario-service'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderFixture } from '@/test/quality-journey-provider-fixture'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import {
  claimExternalQualityJourneyWork,
  claimQualityJourneyWork,
  admitExternalQualityJourneyWork,
  getQualityJourney,
} from './quality-journey-service'
import {
  submitExternalQualityJourneyAnalysisSuccessor,
  publishQualityJourneyAnalysis,
  decideQualityJourneyAnalysis,
} from './quality-journey-analysis-service'
import { registerAppraiseOperations } from '../../../packages/appraisejs/src/mcp/registry'
import { createQualityJourneyInternalDiscoveryGateway } from './quality-journey-internal-discovery-gateway'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  markQualityJourneyDiscoveryBrowserMissingAccess,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from './quality-journey-discovery-browser-service'

const localSender = vi.hoisted(() => ({ run: vi.fn(), cleanup: vi.fn(), claudeRun: vi.fn(), claudeBind: vi.fn() }))
vi.mock('@/lib/quality-journey/codex-app-server/managed-analysis-sender', () => ({
  runManagedAnalysis: localSender.run,
  inspectManagedCodexPrerequisites: async () => ({ usableForDispatch: true, state: 'candidate' }),
  classifyManagedAnalysisFailure: () => 'Native send UNKNOWN',
  observeManagedAnalysisCleanup: localSender.cleanup,
}))
vi.mock(import('@/services/provider-connection/claude-code-journey-sender'), async importOriginal => ({
  ...(await importOriginal()),
  bindClaudeCodeJourneySender: localSender.claudeBind,
}))
const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
afterEach(async () => {
  vi.unstubAllEnvs()
  localSender.run.mockReset()
  localSender.cleanup.mockReset()
  localSender.claudeRun.mockReset()
  localSender.claudeBind.mockReset()
  await Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup()))
})

function disposableDiscoveryRuntime(): DiscoveryBrowserRuntime {
  let currentUrl = 'about:blank'
  const frame = { url: () => currentUrl }
  return {
    async launch() {
      return {
        on() {},
        isConnected: () => true,
        async close() {},
        async newContext() {
          return {
            on() {},
            async close() {},
            async route() {},
            async routeWebSocket() {},
            async newPage() {
              return {
                on() {},
                isClosed: () => false,
                async close() {},
                url: frame.url,
                title: async () => 'Target-controlled title',
                mainFrame: () => frame,
                async goto(url) {
                  currentUrl = url
                },
              }
            },
          }
        },
      }
    },
  }
}

async function internalDiscoveryFixture(
  prepare?: (client: Awaited<ReturnType<typeof createProviderFixture>>['client']) => Promise<void>,
) {
  const f = await createProviderFixture()
  fixtures.push(f)
  const { client, scope, credentials, binding, principal } = f
  const { targetProjectId, journeyId } = scope
  await prepare?.(client)
  await client.environment.create({
    data: { id: 'environment-analysis-1', name: 'Disposable', baseUrl: 'http://127.0.0.1:44081', targetProjectId },
  })
  await client.module.create({ data: { id: 'module-analysis-1', name: 'Checkout', targetProjectId } })
  await client.locatorGroup.create({
    data: { id: 'm08-locators', name: 'Checkout', route: '/checkout', moduleId: 'module-analysis-1', targetProjectId },
  })
  const charter = {
    schemaVersion: 'appraise.quality-journey/v1',
    charterId: 'm08-charter',
    analysisRevisionId: 'm08-analysis',
    ...scope,
    cycleId: f.created.journey.activeCycleId,
    requirementRevisionId: f.created.journey.activeRevisionIds.journey,
    objectives: ['Allow checkout.'],
    scope: { included: ['Checkout'], excluded: [] },
    actors: ['Shopper'],
    requirements: [
      { requirementId: 'REQ-CHECKOUT-1', statement: 'A shopper submits an order.', sourceRefs: ['brief:1'] },
    ],
    obligations: [
      {
        obligationId: 'OBL-CHECKOUT-1',
        requirementId: 'REQ-CHECKOUT-1',
        statement: 'A confirmation appears.',
        acceptanceSignals: ['Confirmation'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: [],
    acceptanceSignals: ['Confirmation'],
    retiredRequirementIds: [],
    questions: [],
    resolvedQuestionAnswerIds: [],
  }
  const submitted = await submitExternalQualityJourneyAnalysisSuccessor(
    {
      ...scope,
      workItemId: binding.workItemId,
      attemptId: binding.attemptId,
      assignmentId: binding.assignmentId,
      assignmentGeneration: binding.assignmentGeneration,
      assignmentSecret: binding.assignmentSecret,
      leaseId: binding.leaseId,
      idempotencyKey: 'm08-submit-analysis',
      charter,
    },
    principal,
    client,
    credentials,
  )
  const { id, contentHash } = submitted.analysisRevision
  const inputArtifactRefs = [
    { kind: 'ANALYSIS_CHARTER_REVISION', artifactId: charter.charterId, revisionId: id, contentHash },
  ]
  const base = { ...scope, schemaVersion: 'appraise.quality-journey/v1', inputArtifactRefs }
  await publishQualityJourneyAnalysis(
    {
      ...base,
      commandId: 'm08-publish-analysis',
      idempotencyKey: 'm08-publish-analysis',
      actor: 'RUNNER',
      command: 'PUBLISH_ANALYSIS',
      expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
      payload: { artifactRevisionId: id, artifactHash: contentHash },
    },
    client,
    credentials,
  )
  await decideQualityJourneyAnalysis(
    {
      ...base,
      commandId: 'm08-approve-analysis',
      idempotencyKey: 'm08-approve-analysis',
      actor: 'USER',
      command: 'DECIDE_ANALYSIS',
      expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
      payload: { revisionId: id, contentHash, decision: 'APPROVED' },
    },
    client,
    trustedHumanCoordinatorSession,
  )
  const discovery = await client.qualityJourneyDiscoveryRevision.findFirstOrThrow({ where: { journeyId } })
  const browserScope = {
    journeyId: discovery.journeyId,
    targetProjectId: discovery.targetProjectId,
    discoveryRevisionId: discovery.id,
  }
  const startBrowser = (accessMode: 'ANONYMOUS' | 'AUTHENTICATED_INTENT') =>
    startQualityJourneyDiscoveryBrowserSession(
      {
        ...browserScope,
        workItemId: discovery.scoutWorkItemId,
        environmentId: 'environment-analysis-1',
        routeId: '/checkout',
        accessMode,
        ...(accessMode === 'AUTHENTICATED_INTENT' ? { authFlowId: 'ungranted-flow' } : {}),
      },
      client,
      disposableDiscoveryRuntime(),
    )
  async function ownershipVersion() {
    const journey = await client.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
    return journey.ownershipVersion
  }
  async function admit(role: QualityJourneyRole) {
    const assignmentSecret = `m08-disposable-secret-${role}-0123456789`
    const worker = await claimExternalQualityJourneyWork(
      {
        ...credentials,
        role,
        principal,
        assignmentSecret,
        idempotencyKey: `m08-claim-${role}`,
      },
      client,
    )
    const workerBinding = {
      ...credentials,
      role,
      principal,
      workItemId: worker.workItem.id,
      attemptId: worker.attempt.id,
      assignmentId: worker.assignment.assignmentId,
      assignmentGeneration: worker.assignmentGeneration,
      assignmentSecret,
      leaseId: worker.attempt.leaseId,
    }
    await admitExternalQualityJourneyWork({ ...workerBinding, idempotencyKey: `m08-admit-${role}` }, client)
    return { worker, workerBinding }
  }
  const canonicalDefinitions = registerAppraiseOperations({
    server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
    api: {} as never,
    options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'm08-disposable' },
  })
  async function openGateway(role: 'SCOUT' | 'RESOURCE_EXPLORER') {
    const { worker, workerBinding } = await admit(role)
    const version = await ownershipVersion()
    const gateway = await createQualityJourneyInternalDiscoveryGateway(workerBinding, canonicalDefinitions, client)
    expect(await ownershipVersion()).toBe(version)
    return {
      worker,
      gateway,
      call: (toolName: string, args: Record<string, unknown> = {}) =>
        gateway.callGateway({
          sealedGrant: gateway.sealedGrant,
          profileDigest: gateway.profile.contractDigest,
          toolName,
          arguments: args,
        }),
    }
  }
  return { ...f, discovery, browserScope, startBrowser, openGateway, ownershipVersion, admit, canonicalDefinitions }
}

async function callThroughWorkerMcp(
  gateway: Awaited<ReturnType<typeof createQualityJourneyInternalDiscoveryGateway>>,
  toolName: string,
  args: Record<string, unknown> = {},
  rejected = false,
) {
  const server = createAttemptScopedWorkerMcpServer({
    ...gateway,
    expectedProfileDigest: gateway.profile.contractDigest,
  })
  const client = new Client({ name: 'm08-fixture-worker', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const { tools } = await client.listTools()
    expect(tools.map(tool => tool.name)).toEqual(gateway.profile.tools.map(tool => tool.name))
    const call = client.callTool({ name: toolName, arguments: args })
    if (rejected) {
      await expect(call).rejects.toThrow('MCP error')
      return undefined
    }
    const response = await call
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true)
    return response.structuredContent as { result: unknown; receipt: unknown } | undefined
  } finally {
    await client.close()
    await server.close()
  }
}

const discoveryReadTool = 'quality_journey_discovery_get'
const scoutSubmitTool = 'quality_journey_target_observation_submit'
const resourceSubmitTool = 'quality_journey_resource_resolution_submit'

async function captureAnonymousM08Evidence(f: Awaited<ReturnType<typeof internalDiscoveryFixture>>) {
  const session = await f.startBrowser('ANONYMOUS')
  const scope = { ...f.browserScope, sessionId: session.id }
  try {
    return await captureQualityJourneyDiscoveryBrowserReceipt({ ...scope, snapshotId: 'm08-snapshot' }, f.client)
  } finally {
    await closeQualityJourneyDiscoveryBrowserSession(scope)
  }
}

async function completeInternalDiscovery(
  f: Awaited<ReturnType<typeof internalDiscoveryFixture>>,
  additionalResources: ReadonlyArray<{ resourceId: string; resourceKind: 'STEP_DEFINITION' | 'OPERATION' }> = [],
) {
  await expect(f.openGateway('SCOUT')).rejects.toMatchObject({
    details: { reason: 'DISCOVERY_BROWSER_EVIDENCE_REQUIRED' },
  })
  const captured = await captureAnonymousM08Evidence(f)
  const scout = await f.openGateway('SCOUT')
  const resource = await f.openGateway('RESOURCE_EXPLORER')
  const descriptor = { artifactId: captured.artifactId, contentHash: captured.contentHash }
  const version = await f.ownershipVersion()
  const scopeRead = await callThroughWorkerMcp(scout.gateway, discoveryReadTool)
  expect(scopeRead?.result).toMatchObject({ role: 'SCOUT', evidence: [descriptor] })
  expect(JSON.stringify(scopeRead?.result)).not.toContain('discoveryAuthTransitPolicyJson')
  expect(JSON.stringify(scopeRead?.result)).not.toContain('Target-controlled title')
  await expect(scout.call(resourceSubmitTool)).rejects.toThrow('outside the internal Discovery profile')
  await expect(resource.call('operation_search')).rejects.toThrow('outside the internal Discovery profile')
  const inventory = await callThroughWorkerMcp(resource.gateway, discoveryReadTool)
  expect(inventory?.result).toMatchObject({ role: 'RESOURCE_EXPLORER', scope: { operationIds: expect.any(Array) } })
  expect(inventory?.result).not.toHaveProperty('evidence')
  expect(await f.ownershipVersion()).toBe(version)
  const analysisRevision = {
    artifactId: f.discovery.analysisRevisionArtifactId,
    revisionId: f.discovery.analysisRevisionId,
    contentHash: f.discovery.analysisRevisionContentHash,
  }
  const common = {
    cycleId: f.discovery.cycleId,
    analysisRevision,
    analysisApproval: {
      artifactId: f.discovery.analysisApprovalArtifactId,
      contentHash: f.discovery.analysisApprovalContentHash,
    },
    approvedRequirementSetHash: f.discovery.approvedRequirementSetHash,
  }
  const { receipt } = captured
  const observation = {
    ...common,
    bundleId: 'm08-observations',
    inputArtifacts: JSON.parse(scout.worker.workItem.inputArtifactRefsJson),
    evidenceReceipts: [descriptor],
    observedAt: receipt.capturedAt,
    targetSnapshot: {
      snapshotId: receipt.snapshotId,
      capturedAt: receipt.capturedAt,
      contentHash: captured.contentHash,
    },
    observations: [
      {
        observationId: 'm08-observation',
        snapshotId: receipt.snapshotId,
        routeId: receipt.routeId,
        environmentId: receipt.environmentId,
        fact: receipt.observationFacts[0],
        evidenceReceiptIds: [captured.artifactId],
        confidence: 'HIGH',
        confidenceRationale: 'The scoped route was loaded.',
        stability: 'CONDITIONAL',
        stabilityRationale: 'The environment binding may change.',
        revalidationPolicy: { triggers: ['environment_registry_changed'] },
      },
    ],
  }
  const scoutArgs = { discoveryRevisionId: f.discovery.id, idempotencyKey: 'm08-observations' }
  await expect(
    scout.call(scoutSubmitTool, {
      ...scoutArgs,
      bundle: {
        ...observation,
        evidenceReceipts: [{ artifactId: 'raw-browser', contentHash: digest('e') }],
        observations: [{ ...observation.observations[0], evidenceReceiptIds: ['raw-browser'] }],
      },
    }),
  ).rejects.toMatchObject({
    cause: expect.objectContaining({ message: 'Scout evidence receipt is not an Appraise browser receipt.' }),
  })
  await expect(
    callThroughWorkerMcp(scout.gateway, scoutSubmitTool, { ...scoutArgs, bundle: observation }),
  ).resolves.toMatchObject({
    result: { status: 'COLLECTING', replayed: false },
  })
  const resourceArgs = { discoveryRevisionId: f.discovery.id, idempotencyKey: 'm08-resolution' }
  const resolution = {
    ...common,
    bundleId: 'm08-resolution',
    inputArtifacts: JSON.parse(resource.worker.workItem.inputArtifactRefsJson),
    evidenceReceipts: [{ artifactId: analysisRevision.artifactId, contentHash: analysisRevision.contentHash }],
    resolvedAt: receipt.capturedAt,
    destinationModuleId: 'module-analysis-1',
    approvedRequirementIds: ['REQ-CHECKOUT-1'],
    reusable: [
      {
        resourceId: 'module:module-analysis-1',
        resourceKind: 'MODULE',
        requirementId: 'REQ-CHECKOUT-1',
        rank: 1,
        explanation: 'Use the frozen project module.',
        reasonCode: 'COMPATIBLE',
        evidenceReceiptIds: [analysisRevision.artifactId],
      },
      ...additionalResources.map((resource, index) => ({
        ...resource,
        requirementId: 'REQ-CHECKOUT-1',
        rank: index + 2,
        explanation: 'Use the compatible frozen mapping.',
        reasonCode: 'COMPATIBLE',
        evidenceReceiptIds: [analysisRevision.artifactId],
      })),
    ],
    incompatible: [],
    stale: [],
    crossTarget: [],
    missing: [],
  }
  await expect(
    resource.call(resourceSubmitTool, {
      ...resourceArgs,
      bundle: {
        ...resolution,
        evidenceReceipts: [descriptor],
        reusable: [{ ...resolution.reusable[0], evidenceReceiptIds: [descriptor.artifactId] }],
      },
    }),
  ).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringContaining('Appraise-issued assignment artifacts') }),
  })
  await expect(
    resource.call(resourceSubmitTool, {
      ...resourceArgs,
      bundle: {
        ...resolution,
        approvedRequirementIds: ['m08-unapproved'],
        reusable: [{ ...resolution.reusable[0], requirementId: 'm08-unapproved' }],
      },
    }),
  ).rejects.toMatchObject({
    cause: expect.objectContaining({
      message: 'Resource Explorer requirements do not match the approved charter.',
    }),
  })
  await expect(
    callThroughWorkerMcp(resource.gateway, resourceSubmitTool, { ...resourceArgs, bundle: resolution }),
  ).resolves.toMatchObject({
    result: { status: 'COMPLETED', replayed: false },
  })
  expect(await f.client.qualityJourney.findUnique({ where: { id: f.discovery.journeyId } })).toMatchObject({
    stage: 'DISCOVERY',
  })
  expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
}

describe('M08 internal Discovery gateway', () => {
  it('accepts both scoped role outputs with Appraise evidence and leaves the next lifecycle decision to Appraise', async () => {
    await completeInternalDiscovery(await internalDiscoveryFixture())
  }, 20_000)

  it('denies ungranted protected access and parks both roles with zero attempts or admissible evidence', async () => {
    const f = await internalDiscoveryFixture()
    try {
      await expect(f.startBrowser('AUTHENTICATED_INTENT')).rejects.toMatchObject({ code: 'CONFLICT' })
      const session = await f.startBrowser('ANONYMOUS')
      await markQualityJourneyDiscoveryBrowserMissingAccess({ ...f.browserScope, sessionId: session.id }, f.client)
      for (const role of ['SCOUT', 'RESOURCE_EXPLORER'] as const)
        await expect(claimQualityJourneyWork({ ...f.credentials, role }, f.client)).rejects.toMatchObject({
          code: 'UNAUTHORIZED',
          message: 'Internal Discovery work requires versioned admission.',
        })
      await expect(f.openGateway('SCOUT')).rejects.toMatchObject({ details: { reason: 'DISCOVERY_MISSING_ACCESS' } })
      await expect(f.openGateway('RESOURCE_EXPLORER')).rejects.toMatchObject({
        details: { reason: 'DISCOVERY_MISSING_ACCESS' },
      })
      expect(
        await f.client.qualityJourneyWorkAttempt.count({
          where: { workItemId: { in: [f.discovery.scoutWorkItemId, f.discovery.resourceWorkItemId] } },
        }),
      ).toBe(0)
      expect(await f.client.qualityJourneyArtifact.count({ where: { kind: 'DISCOVERY_BROWSER_RECEIPT' } })).toBe(0)
      expect(await f.client.qualityJourneyBlocker.findFirst()).toMatchObject({
        reasonCode: 'DISCOVERY_MISSING_ACCESS',
        status: 'ACTIVE',
      })
    } finally {
      await f.client.$disconnect()
    }
  })

  it('rejects changed Environment bindings and expired grants', async () => {
    const f = await internalDiscoveryFixture()
    try {
      await captureAnonymousM08Evidence(f)
      const scout = await f.openGateway('SCOUT')
      await f.client.environment.update({
        where: { id: 'environment-analysis-1' },
        data: { baseUrl: 'https://different.example.test', scopeVersion: { increment: 1 } },
      })
      await expect(scout.call(scoutSubmitTool)).rejects.toThrow('registry authority is stale')
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(new Date(scout.worker.attempt.leaseExpiresAt).getTime() + 1))
      await expect(scout.call(scoutSubmitTool)).rejects.toThrow('grant has expired')
      expect(
        await f.client.qualityJourneyDiscoveryRevision.findUnique({ where: { id: f.discovery.id } }),
      ).toMatchObject({ targetObservationHash: null })
    } finally {
      vi.useRealTimers()
      await f.client.$disconnect()
    }
  })
})

describe('M09 internal Scenario Designer and Automator gateway', () => {
  it('uses accepted Discovery, exact human approval and frozen mappings through scoped MCP', async () => {
    const operation = defaultOperationDefinitions.find(
      candidate => candidate.id === 'browser.navigation.assertion.assert.url.route.equals',
    )!
    const definition = builtInStepDefinitions.find(
      candidate => candidate.execution.kind === 'operation' && candidate.execution.handlerId === operation.handler.id,
    )!
    const hashes = computeStepDefinitionHashes(definition)
    const f = await internalDiscoveryFixture(async client => {
      await client.stepDefinition.create({
        data: {
          id: definition.identity.id,
          version: definition.identity.version,
          status: 'ready',
          title: definition.intent.title,
          description: definition.intent.description,
          definitionJson: canonicalContractJson(definition),
          ...hashes,
          provenanceJson: canonicalContractJson(definition.provenance),
          executionBinding: {
            create: {
              kind: 'operation',
              bindingJson: canonicalContractJson(definition.execution),
              bindingHash: hashes.executionHash,
            },
          },
        },
      })
    })
    const { client, credentials, scope, canonicalDefinitions } = f
    await completeInternalDiscovery(f, [
      { resourceId: `step:${definition.identity.id}:${definition.identity.version}`, resourceKind: 'STEP_DEFINITION' },
      { resourceId: `operation:${operation.id}:${operation.version}`, resourceKind: 'OPERATION' },
    ])
    const command = async (key: string, actor: 'USER' | 'RUNNER') => ({
      ...scope,
      schemaVersion: qualityJourneyContractVersion,
      commandId: key,
      idempotencyKey: key,
      actor,
      expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
    })
    await startQualityJourneyScenarioDesign(
      {
        ...(await command('m09-start', 'RUNNER')),
        command: 'START_SCENARIO_DESIGN',
        inputArtifactRefs: [],
        payload: {},
      },
      client,
      credentials,
    )
    await expect(
      claimQualityJourneyWork({ ...credentials, role: 'TEST_SCENARIO_DESIGNER' }, client),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(f.admit('AUTOMATOR')).rejects.toMatchObject({ code: 'CONFLICT' })
    const designer = await f.admit('TEST_SCENARIO_DESIGNER')
    const open = (binding: typeof designer.workerBinding) =>
      createQualityJourneyInternalScenarioAutomationGateway(binding, canonicalDefinitions, client)
    await expect(open({ ...designer.workerBinding, targetProjectId: 'foreign-project' })).rejects.toThrow()
    await expect(
      open({ ...designer.workerBinding, assignmentGeneration: designer.workerBinding.assignmentGeneration + 1 }),
    ).rejects.toThrow()
    const designerGateway = await open(designer.workerBinding)
    const designRead = 'quality_journey_scenarios_get'
    const designSubmit = 'quality_journey_scenarios_submit'
    const automateRead = 'quality_journey_automation_context_get'
    const automateSubmit = 'quality_journey_automation_materialize'
    expect(designerGateway.profile.tools.map(tool => tool.name)).toEqual([designRead, designSubmit])
    const beforeDesignerRead = await f.ownershipVersion()
    const context = (await callThroughWorkerMcp(designerGateway, designRead))?.result as {
      cycleId: string
      discoveryRevisionId: string
      discoveryCompletionHash: string
      portfolioId: string
      portfolioRevisionId: string
    }
    expect(context).toMatchObject({
      discoveryRevisionId: f.discovery.id,
      analysisCharter: { charterId: 'm08-charter' },
      targetObservation: { bundleId: 'm08-observations' },
      resourceResolution: { bundleId: 'm08-resolution' },
      scope: { routes: ['/checkout'] },
      inputArtifacts: expect.arrayContaining([expect.objectContaining({ artifactId: 'm08-charter' })]),
    })
    expect(await f.ownershipVersion()).toBe(beforeDesignerRead)
    const { cycleId, discoveryRevisionId, discoveryCompletionHash, portfolioId, portfolioRevisionId } = context
    const portfolio = {
      cycleId,
      discoveryRevisionId,
      discoveryCompletionHash,
      portfolioId,
      portfolioRevisionId,
      schemaVersion: qualityJourneyContractVersion,
      coverageRationale: 'Review both checkout paths before preparing test coverage.',
      graph: { edges: [], sharedSetup: [] },
      scenarios: ['m09-checkout', 'm09-deferred'].map((stableScenarioId, sequence) => ({
        stableScenarioId,
        scenarioRevisionId: `${stableScenarioId}-v1`,
        behavioralIntent: {
          title: sequence === 0 ? 'Verify checkout route' : 'Deferred checkout branch',
          narrative: 'A shopper opens checkout.',
          requirementIds: ['REQ-CHECKOUT-1'],
          expectedSignals: ['Checkout route'],
          steps: [
            { stepId: `${stableScenarioId}-step`, action: 'Then the checkout route is open', expected: '/checkout' },
          ],
        },
        enrichment: {
          observationIds: ['m08-observation'],
          resourceAssumptionIds: [`operation:${operation.id}:${operation.version}`],
          feasibilityNotes: [],
        },
        layout: { x: sequence * 100, y: 0, sequence },
      })),
    }
    await callThroughWorkerMcp(
      designerGateway,
      designSubmit,
      {
        idempotencyKey: 'wrong-discovery',
        portfolio: { ...portfolio, discoveryCompletionHash: digest('f') },
      },
      true,
    )
    await callThroughWorkerMcp(
      designerGateway,
      designSubmit,
      {
        idempotencyKey: 'foreign-observation',
        portfolio: {
          ...portfolio,
          scenarios: portfolio.scenarios.map(scenario => ({
            ...scenario,
            enrichment: { ...scenario.enrichment, observationIds: ['foreign-observation'] },
          })),
        },
      },
      true,
    )
    expect(await client.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
    await expect(
      callThroughWorkerMcp(designerGateway, designSubmit, { idempotencyKey: 'm09-candidate', portfolio }),
    ).resolves.toMatchObject({ result: { portfolioRevisionId, replayed: false }, receipt: { accepted: true } })
    await expect(f.admit('AUTOMATOR')).rejects.toMatchObject({ code: 'CONFLICT' })
    const candidate = await getQualityJourneyScenarioPortfolio(scope, client)
    const portfolioHash = candidate.portfolio.contentHash
    const inputArtifactRefs = [
      {
        kind: 'SCENARIO_PORTFOLIO_REVISION',
        artifactId: portfolioId,
        revisionId: portfolioRevisionId,
        contentHash: portfolioHash,
      },
    ]
    await publishQualityJourneyScenarioPortfolio(
      {
        ...(await command('m09-publish', 'RUNNER')),
        command: 'PUBLISH_SCENARIO_PORTFOLIO',
        inputArtifactRefs,
        payload: { artifactRevisionId: portfolioRevisionId, artifactHash: portfolioHash },
      },
      client,
      credentials,
    )
    const reviewed = await getQualityJourneyScenarioPortfolio(scope, client)
    await expect(f.admit('AUTOMATOR')).rejects.toMatchObject({ code: 'CONFLICT' })
    const approval = {
      approvedScenarioRevisionIds: ['m09-checkout-v1'],
      rejectedScenarioRevisionIds: ['m09-deferred-v1'],
      feedback: 'Defer the alternate checkout branch.',
    }
    const reviewCommand = {
      ...(await command('m09-human-review', 'USER')),
      command: 'DECIDE_SCENARIOS',
      inputArtifactRefs,
      payload: { ...approval, portfolioRevisionId, portfolioHash },
    }
    await expect(
      decideQualityJourneyScenarios(
        {
          ...approval,
          command: reviewCommand,
          expectedReviewHash: digest('f'),
        },
        client,
        trustedHumanCoordinatorSession,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await decideQualityJourneyScenarios(
      {
        ...approval,
        command: reviewCommand,
        expectedReviewHash: reviewed.portfolio.reviewHash,
      },
      client,
      trustedHumanCoordinatorSession,
    )

    await expect(claimQualityJourneyWork({ ...credentials, role: 'AUTOMATOR' }, client)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    })
    const automator = await f.admit('AUTOMATOR')
    const automatorGateway = await open(automator.workerBinding)
    expect(automatorGateway.profile.tools.map(tool => tool.name)).toEqual([automateRead, automateSubmit])
    await expect(
      automatorGateway.callGateway({
        sealedGrant: designerGateway.sealedGrant,
        profileDigest: automatorGateway.profile.contractDigest,
        toolName: automateRead,
        arguments: {},
      }),
    ).rejects.toThrow('signature is invalid')
    const beforeAutomatorRead = await f.ownershipVersion()
    const bindingRead = (await callThroughWorkerMcp(automatorGateway, automateRead))?.result as {
      stepDefinitions: Array<{ definitionHash: string }>
    }
    expect(bindingRead).toMatchObject({
      scope: {
        portfolioRevisionId,
        destinationModuleId: 'module-analysis-1',
        scenarioDecisions: [{ scenarioRevisionId: 'm09-checkout-v1' }],
      },
      scenarios: [{ scenarioRevisionId: 'm09-checkout-v1' }],
      operations: [expect.objectContaining({ id: operation.id })],
    })
    expect(await f.ownershipVersion()).toBe(beforeAutomatorRead)
    const approvedRow = await client.qualityJourneyScenarioRevision.findFirstOrThrow({
      where: { scenarioRevisionId: 'm09-checkout-v1' },
    })
    await expect(
      client.qualityJourneyScenarioRevision.update({
        where: { id: approvedRow.id },
        data: { behavioralIntentJson: '{}' },
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
    const step = {
      sourceScenarioStepId: 'm09-checkout-step',
      stepDefinition: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: bindingRead.stepDefinitions[0]!.definitionHash,
      },
      operation: { id: operation.id, version: operation.version, handler: operation.handler },
      parameters: [{ name: 'route', type: 'string', value: '/checkout' }],
      testData: [],
      locatorRequirements: [],
    }
    const proposal = { scenarioRevisionId: 'm09-checkout-v1', steps: [step] }
    for (const scenarioRevisionId of ['m09-checkout-v2', 'm09-deferred-v1']) {
      await callThroughWorkerMcp(
        automatorGateway,
        automateSubmit,
        {
          idempotencyKey: scenarioRevisionId,
          scenarios: [{ ...proposal, scenarioRevisionId }],
        },
        true,
      )
    }
    await callThroughWorkerMcp(
      automatorGateway,
      automateSubmit,
      {
        idempotencyKey: 'outside-resource',
        scenarios: [
          {
            ...proposal,
            steps: [
              {
                ...step,
                operation: { ...step.operation, id: 'outside-frozen-operations' },
              },
            ],
          },
        ],
      },
      true,
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(automator.worker.attempt.leaseExpiresAt.getTime() + 1))
      await callThroughWorkerMcp(
        automatorGateway,
        automateSubmit,
        {
          idempotencyKey: 'expired',
          scenarios: [proposal],
        },
        true,
      )
    } finally {
      vi.useRealTimers()
    }
    expect(await client.qualityJourneyAutomationMaterialization.count()).toBe(0)
    expect(await client.testCase.count()).toBe(0)
    expect(await f.ownershipVersion()).toBe(beforeAutomatorRead)
    await expect(
      callThroughWorkerMcp(automatorGateway, automateSubmit, {
        idempotencyKey: 'm09-materialize',
        scenarios: [proposal],
      }),
    ).resolves.toMatchObject({
      result: {
        replayed: false,
        materializations: [
          {
            scenarioRevisionId: 'm09-checkout-v1',
            status: 'MATERIALIZED',
            preparedCapsuleId: expect.any(String),
          },
        ],
      },
      receipt: { accepted: true },
    })
    expect(await client.qualityJourneyPreparedRuntimeCapsule.findFirstOrThrow()).toMatchObject({ status: 'PREPARED' })
    expect(
      await client.qualityJourneyExternalSubmissionAcceptance.findMany({
        where: { operation: { in: ['SCENARIO_PORTFOLIO_SUBMIT', 'AUTOMATION_MATERIALIZE'] } },
        select: { operation: true },
        orderBy: { operation: 'asc' },
      }),
    ).toEqual([{ operation: 'AUTOMATION_MATERIALIZE' }, { operation: 'SCENARIO_PORTFOLIO_SUBMIT' }])
    expect(await client.qualityJourneyExecutionConsent.count()).toBe(0)
    expect(await client.runtimeCapsule.count()).toBe(0)
    expect(await client.testRun.count()).toBe(0)
    expect(await client.qualityJourneyProviderRun.count()).toBe(0)
  }, 20_000)
})

describe('app-managed Scenario Designer and Automator dispatch', () => {
  async function localFixture() {
    vi.stubEnv('APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED', 'true')
    const operation = defaultOperationDefinitions.find(
      candidate => candidate.id === 'browser.navigation.assertion.assert.url.route.equals',
    )!
    const definition = builtInStepDefinitions.find(
      candidate => candidate.execution.kind === 'operation' && candidate.execution.handlerId === operation.handler.id,
    )!
    const hashes = computeStepDefinitionHashes(definition)
    const f = await internalDiscoveryFixture(async client => {
      await client.stepDefinition.create({
        data: {
          id: definition.identity.id,
          version: definition.identity.version,
          status: 'ready',
          title: definition.intent.title,
          description: definition.intent.description,
          definitionJson: canonicalContractJson(definition),
          ...hashes,
          provenanceJson: canonicalContractJson(definition.provenance),
          executionBinding: {
            create: {
              kind: 'operation',
              bindingJson: canonicalContractJson(definition.execution),
              bindingHash: hashes.executionHash,
            },
          },
        },
      })
    })
    await completeInternalDiscovery(f, [
      { resourceId: `step:${definition.identity.id}:${definition.identity.version}`, resourceKind: 'STEP_DEFINITION' },
      { resourceId: `operation:${operation.id}:${operation.version}`, resourceKind: 'OPERATION' },
    ])
    // Arrange a synthetic local owner after all fixture assignments have completed. No host qualification is claimed.
    await f.client.qualityJourneyCoordinatorSession.update({
      where: { id: f.credentials.coordinatorSessionId },
      data: { ownerPrincipalId: `appraise-local:${f.scope.targetProjectId}` },
    })
    const input = async (role: 'TEST_SCENARIO_DESIGNER' | 'AUTOMATOR') => ({
      ...f.scope,
      role,
      expectedStateHash: (await getQualityJourney(f.scope, f.client)).journey.stateHash,
    })
    return { ...f, operation, definition, input }
  }
  function scenarioOutput(prompt: string, scenarioCount = 1) {
    const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
    return JSON.stringify({
      toolName: context.toolName,
      arguments: {
        idempotencyKey: context.submissionIdempotencyKey,
        portfolio: {
          coverageRationale: 'Verify anonymous checkout routing.',
          graph: { edges: [], sharedSetup: [] },
          scenarios: Array.from({ length: scenarioCount }, (_, index) => ({
            scenarioKey: index === 0 ? 'checkout' : `checkout-${index + 1}`,
            behavioralIntent: {
              title: index === 0 ? 'Checkout route' : `Checkout route ${index + 1}`,
              narrative: 'A shopper opens checkout.',
              requirementIds: ['REQ-CHECKOUT-1'],
              expectedSignals: ['Checkout route'],
              steps: [{ action: 'Then the checkout route is open', expected: '/checkout' }],
            },
            enrichment: { observationIds: ['m08-observation'], resourceAssumptionIds: [], feasibilityNotes: [] },
          })),
        },
      },
    })
  }
  it('publishes accepted scenarios for exact human review and materializes approved tests without execution consent', async () => {
    const f = await localFixture()
    const original = await f.input('TEST_SCENARIO_DESIGNER')
    vi.stubEnv('APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED', 'false')
    await expect(startAppManagedScenarioAutomation(original, f.client)).rejects.toThrow('server owner')
    vi.stubEnv('APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED', 'true')
    await expect(
      startAppManagedScenarioAutomation({ ...original, expectedStateHash: digest('f') }, f.client),
    ).rejects.toThrow('changed')
    await expect(
      startAppManagedScenarioAutomation({ ...original, targetProjectId: 'another-project' }, f.client),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(localSender.run).not.toHaveBeenCalled()
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    await expect(
      startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
    ).resolves.toMatchObject({ accepted: true })
    const current = await getQualityJourney(f.scope, f.client)
    expect(current.journey.stage).toBe('SCENARIO_REVIEW')
    expect(localSender.run).toHaveBeenCalledTimes(1)
    await expect(startAppManagedScenarioAutomation(await f.input('AUTOMATOR'), f.client)).rejects.toThrow('eligible')
    const { portfolio } = await getQualityJourneyScenarioPortfolio(f.scope, f.client)
    const approval = {
      approvedScenarioRevisionIds: portfolio.scenarios.map(row => row.scenarioRevisionId),
      rejectedScenarioRevisionIds: [],
    }
    await decideQualityJourneyScenarios(
      {
        ...approval,
        expectedReviewHash: portfolio.reviewHash,
        command: {
          ...f.scope,
          schemaVersion: qualityJourneyContractVersion,
          actor: 'USER',
          command: 'DECIDE_SCENARIOS',
          commandId: 'local-human-review',
          idempotencyKey: 'local-human-review',
          expectedStateHash: current.journey.stateHash,
          inputArtifactRefs: [
            {
              kind: 'SCENARIO_PORTFOLIO_REVISION',
              artifactId: portfolio.artifactId,
              revisionId: portfolio.artifactRevisionId,
              contentHash: portfolio.contentHash,
            },
          ],
          payload: {
            ...approval,
            portfolioRevisionId: portfolio.artifactRevisionId,
            portfolioHash: portfolio.contentHash,
          },
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    localSender.run.mockImplementation(async (prompt: string) => {
      const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
      return JSON.stringify({
        toolName: context.toolName,
        arguments: {
          idempotencyKey: context.submissionIdempotencyKey,
          scenarios: [
            {
              scenarioKey: context.permissibleChoices.scenarios[0].scenarioKey,
              steps: [
                {
                  bindingId: context.permissibleChoices.bindings[0].bindingId,
                  parameters: [{ name: 'route', type: 'string', value: { json: '"/checkout"' } }],
                  testData: [],
                  locatorRequirements: [],
                },
              ],
            },
          ],
        },
      })
    })
    await expect(startAppManagedScenarioAutomation(await f.input('AUTOMATOR'), f.client)).resolves.toMatchObject({
      accepted: true,
    })
    expect(localSender.run).toHaveBeenCalledTimes(2)
    for (const call of localSender.run.mock.calls)
      expect(call[1]).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['toolName', 'arguments'],
      })
    expect(await f.client.qualityJourneyPreparedRuntimeCapsule.count({ where: { journeyId: f.scope.journeyId } })).toBe(
      1,
    )
    expect(await f.client.testCase.count()).toBe(1)
    expect(await f.client.testRun.count()).toBe(0)
    expect(await f.client.qualityJourneyExecutionConsent.count()).toBe(0)
    const attempts = await f.client.qualityJourneyWorkAttempt.findMany({
      where: { dispatchAdapterId: { startsWith: 'APP_SERVER_LOCAL_V1_PREPARATION_' } },
    })
    expect(attempts).toHaveLength(2)
    expect(attempts.every(attempt => !attempt.dispatchStartedAt && !attempt.failureJson)).toBe(true)
    await expect(startAppManagedScenarioAutomation(await f.input('AUTOMATOR'), f.connect())).rejects.toThrow()
    expect(localSender.run).toHaveBeenCalledTimes(2)
  }, 30_000)

  it('dispatches Scenario Designer and Automator through Claude with opaque identity and no Codex send', async () => {
    const f = await localFixture()
    await f.client.qualityJourney.update({
      where: { id: f.scope.journeyId },
      data: { managedWorkerProvider: 'CLAUDE_CODE' },
    })
    vi.stubEnv('APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED', 'false')
    vi.stubEnv('APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED', 'true')
    localSender.claudeBind.mockImplementation(async () => ({
      identity: {
        executableSha256: 'a'.repeat(64),
        accountFingerprint: 'b'.repeat(64),
        protocol: 'claude-code-print/v1',
      },
      run: localSender.claudeRun,
    }))
    localSender.claudeRun.mockImplementation(async (prompt: string, sentSchema: unknown) => {
      const context = JSON.parse(prompt.split('\n\n').find(part => part.startsWith('{'))!)
      if (localSender.claudeRun.mock.calls.length === 1) return scenarioOutput(prompt, 2)
      expect(sentSchema).toEqual(context.outputSchema)
      expect(context.outputSchema.properties.arguments.properties.scenarios).toMatchObject({
        type: 'object',
        required: ['scenario-1', 'scenario-2'],
        additionalProperties: false,
      })
      return JSON.stringify({
        toolName: context.toolName,
        arguments: {
          idempotencyKey: context.submissionIdempotencyKey,
          scenarios: Object.fromEntries(
            context.permissibleChoices.scenarios.map(({ scenarioKey }: { scenarioKey: string }) => [
              scenarioKey,
              [
                {
                  bindingId: context.permissibleChoices.bindings[0].bindingId,
                  parameters: [{ name: 'route', type: 'string', value: { json: '"/checkout"' } }],
                  testData: [],
                  locatorRequirements: [],
                },
              ],
            ]),
          ),
        },
      })
    })
    await expect(
      startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
    ).resolves.toMatchObject({ accepted: true })
    const current = await getQualityJourney(f.scope, f.client)
    const { portfolio } = await getQualityJourneyScenarioPortfolio(f.scope, f.client)
    const approval = {
      approvedScenarioRevisionIds: portfolio.scenarios.map(row => row.scenarioRevisionId),
      rejectedScenarioRevisionIds: [],
    }
    await decideQualityJourneyScenarios(
      {
        ...approval,
        expectedReviewHash: portfolio.reviewHash,
        command: {
          ...f.scope,
          schemaVersion: qualityJourneyContractVersion,
          actor: 'USER',
          command: 'DECIDE_SCENARIOS',
          commandId: 'claude-human-review',
          idempotencyKey: 'claude-human-review',
          expectedStateHash: current.journey.stateHash,
          inputArtifactRefs: [
            {
              kind: 'SCENARIO_PORTFOLIO_REVISION',
              artifactId: portfolio.artifactId,
              revisionId: portfolio.artifactRevisionId,
              contentHash: portfolio.contentHash,
            },
          ],
          payload: {
            ...approval,
            portfolioRevisionId: portfolio.artifactRevisionId,
            portfolioHash: portfolio.contentHash,
          },
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    await expect(startAppManagedScenarioAutomation(await f.input('AUTOMATOR'), f.client)).resolves.toMatchObject({
      accepted: true,
    })
    const attempts = await f.client.qualityJourneyWorkAttempt.findMany({
      where: { dispatchAdapterId: { startsWith: 'APP_SERVER_LOCAL_V1_PREPARATION_' } },
    })
    expect(attempts).toHaveLength(2)
    for (const attempt of attempts)
      expect(JSON.parse(attempt.managedDispatchIdentityJson!)).toMatchObject({ provider: 'CLAUDE_CODE' })
    expect(localSender.claudeRun).toHaveBeenCalledTimes(2)
    expect(await f.client.testCase.count()).toBe(2)
    expect(await f.client.qualityJourneyExecutionConsent.count()).toBe(0)
    expect(await f.client.testRun.count()).toBe(0)
    expect(localSender.run).not.toHaveBeenCalled()
    expect(localSender.cleanup).not.toHaveBeenCalled()
  }, 30_000)

  it.each([false, true])(
    'retains UNKNOWN after native failure with full-root cleanup verified=%s',
    async verified => {
      const f = await localFixture()
      localSender.run.mockRejectedValue(new Error('private native diagnostic'))
      localSender.cleanup.mockReturnValue({
        state: verified ? 'VERIFIED' : 'UNKNOWN',
        privateRootCleanupVerified: verified,
      })
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
      ).rejects.toThrow('UNKNOWN')
      const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
        where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER' },
      })
      expect(localSender.run.mock.calls[0][2]).toEqual({ attemptId: attempt.id })
      expect(localSender.cleanup).toHaveBeenCalledWith(attempt.id)
      expect(JSON.parse(attempt.failureJson!)).toMatchObject({
        state: 'UNKNOWN',
        stage: 'NATIVE_SEND',
        senderCleanupVerified: verified,
        recoveryEligible: false,
        canonicalSubmissionStarted: false,
      })
      expect(attempt.failureJson).not.toContain('private native diagnostic')
      expect(attempt.dispatchStartedAt).not.toBeNull()
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.connect()),
      ).rejects.toThrow('reconciliation')
      expect(localSender.run).toHaveBeenCalledOnce()
    },
    30_000,
  )

  it('consumes malformed output, prevents replay after reopening and blocks concurrent sends', async () => {
    const f = await localFixture()
    let release!: (value: string) => void
    localSender.run.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          release = resolve
        }),
    )
    const input = await f.input('TEST_SCENARIO_DESIGNER')
    const first = startAppManagedScenarioAutomation(input, f.client)
    await vi.waitFor(() => expect(localSender.run).toHaveBeenCalledTimes(1))
    await expect(
      startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.connect()),
    ).rejects.toThrow()
    release('{"toolName":"quality_journey_approve","arguments":{}}')
    await expect(first).rejects.toThrow('UNKNOWN')
    await expect(
      startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.connect()),
    ).rejects.toThrow('reconciliation')
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
    const attempt = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER' },
    })
    expect(attempt.dispatchStartedAt).not.toBeNull()
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({ state: 'UNKNOWN', stage: 'OUTPUT_VALIDATION' })
  }, 30_000)
  it('retains rejected semantic choices and permits only one canonical-only recovery without a native replay', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => {
      const candidate = JSON.parse(scenarioOutput(prompt))
      candidate.arguments.portfolio.scenarios[0].enrichment.observationIds = ['invented-observation']
      return JSON.stringify(candidate)
    })
    await expect(startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const scope = { ...f.scope, role: 'TEST_SCENARIO_DESIGNER' as const }
    const recovery = await getAppManagedPreparationRecovery(scope, f.client)
    expect(recovery?.detail).toBe('Scenario observation is outside completed Discovery.')
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    expect(JSON.parse(attempt.failureJson!)).toMatchObject({
      senderCleanupVerified: true,
      canonicalSubmissionStarted: false,
      candidate: {
        arguments: { portfolio: { scenarios: [{ enrichment: { observationIds: ['invented-observation'] } }] } },
      },
      rejection: { kind: 'CANONICAL', message: 'Scenario observation is outside completed Discovery.' },
    })
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, f.client),
    ).rejects.toThrow('no new native send')
    expect(await getAppManagedPreparationRecovery(scope, f.client)).toBeNull()
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(await f.client.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
  }, 30_000)

  it('recovers accepted candidate publication from the original receipt without another native send', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    const publication = vi.spyOn(scenarioServices, 'publishQualityJourneyScenarioPortfolio')
    publication.mockRejectedValueOnce(new Error('interrupted publication'))
    try {
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
      ).rejects.toThrow('UNKNOWN')
      const recovery = await getAppManagedPreparationRecovery({ ...f.scope, role: 'TEST_SCENARIO_DESIGNER' }, f.client)
      expect(recovery).not.toBeNull()
      await expect(
        recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, f.client),
      ).resolves.toEqual({ accepted: true, nativeSend: false })
      expect(localSender.run).toHaveBeenCalledTimes(1)
      expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('SCENARIO_REVIEW')
      expect(await f.client.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
    } finally {
      publication.mockRestore()
    }
  }, 30_000)
  it.each([false, true])(
    'recovers a persisted pre-submit crash marker (legacy=%s) without native replay',
    async legacy => {
      const f = await localFixture()
      localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
      let crashed = false
      const interrupted = new Proxy(f.client, {
        get(target, property) {
          if (property !== 'qualityJourneyWorkAttempt') return Reflect.get(target, property)
          return new Proxy(target.qualityJourneyWorkAttempt, {
            get(delegate, method) {
              if (method !== 'updateMany') return Reflect.get(delegate, method)
              return async (args: Parameters<typeof delegate.updateMany>[0]) => {
                if (crashed) throw new Error('Simulated process exit prevents catch persistence')
                const failure = args?.data.failureJson
                if (typeof failure === 'string') {
                  const state = JSON.parse(failure)
                  if (state.stage === 'CANONICAL_SUBMISSION' && !state.reason) {
                    expect(state.recoveryEligible).toBe(true)
                    const result = await delegate.updateMany(args)
                    expect(result.count).toBe(1)
                    crashed = true
                    throw new Error('Simulated process exit after durable pre-submit marker')
                  }
                }
                return delegate.updateMany(args)
              }
            },
          })
        },
      })
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), interrupted),
      ).rejects.toThrow('Simulated process exit')
      const fresh = f.connect()
      const attempt = await fresh.qualityJourneyWorkAttempt.findFirstOrThrow({
        where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER' },
      })
      const marker = JSON.parse(attempt.failureJson!)
      expect(marker).toMatchObject({
        senderCleanupVerified: true,
        canonicalSubmissionStarted: true,
        recoveryEligible: true,
      })
      if (legacy) {
        delete marker.recoveryEligible
        const original = canonicalContractJson(marker)
        for (const invalid of [
          { ...marker, senderCleanupVerified: false },
          { ...marker, canonicalSubmissionStarted: false },
          { ...marker, stage: 'SEMANTIC_VALIDATION' },
          { ...marker, candidateHash: digest('0') },
          { ...marker, compiledCallHash: digest('0') },
          { ...marker, submissionIdempotencyKey: 'different:submit' },
          { ...marker, recoveryEligible: false },
        ]) {
          await fresh.qualityJourneyWorkAttempt.update({
            where: { id: attempt.id },
            data: { failureJson: canonicalContractJson(invalid) },
          })
          expect(
            await getAppManagedPreparationRecovery({ ...f.scope, role: 'TEST_SCENARIO_DESIGNER' }, fresh),
          ).toBeNull()
        }
        await fresh.qualityJourneyWorkAttempt.update({
          where: { id: attempt.id },
          data: { failureJson: original, assignmentGeneration: attempt.assignmentGeneration + 1 },
        })
        expect(await getAppManagedPreparationRecovery({ ...f.scope, role: 'TEST_SCENARIO_DESIGNER' }, fresh)).toBeNull()
        await fresh.qualityJourneyWorkAttempt.update({
          where: { id: attempt.id },
          data: { assignmentGeneration: attempt.assignmentGeneration },
        })
      }
      expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
      await expect(startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), fresh)).rejects.toThrow()
      const recovery = await getAppManagedPreparationRecovery({ ...f.scope, role: 'TEST_SCENARIO_DESIGNER' }, fresh)
      expect(recovery).not.toBeNull()
      await expect(
        recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
      ).resolves.toEqual({ accepted: true, nativeSend: false })
      expect(localSender.run).toHaveBeenCalledTimes(1)
      expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
      expect((await getQualityJourney(f.scope, fresh)).journey.stage).toBe('SCENARIO_REVIEW')
      expect(await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
        failureJson: null,
        dispatchReservedAt: null,
        dispatchStartedAt: null,
      })
    },
    30_000,
  )

  it.each([false, true])(
    'retains accepted Designer recovery across publication crash (committed=%s)',
    async committed => {
      const f = await localFixture()
      localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
      const originalPublication = scenarioServices.publishQualityJourneyScenarioPortfolio
      const publication = vi.spyOn(scenarioServices, 'publishQualityJourneyScenarioPortfolio')
      publication.mockImplementationOnce(async (...args) => {
        if (committed) await originalPublication(...args)
        throw new Error('Simulated publication process exit')
      })
      const interrupted = new Proxy(f.client, {
        get(target, property) {
          if (property !== 'qualityJourneyWorkAttempt') return Reflect.get(target, property)
          return new Proxy(target.qualityJourneyWorkAttempt, {
            get(delegate, method) {
              if (method !== 'updateMany') return Reflect.get(delegate, method)
              return async (args: Parameters<typeof delegate.updateMany>[0]) => {
                const failure = args?.data.failureJson
                if (typeof failure === 'string' && JSON.parse(failure).reason === 'REVIEW_PUBLICATION_DID_NOT_COMPLETE')
                  throw new Error('Simulated process exit prevents catch persistence')
                return delegate.updateMany(args)
              }
            },
          })
        },
      })
      try {
        await expect(
          startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), interrupted),
        ).rejects.toThrow('Simulated process exit')
        const fresh = f.connect()
        const attempt = await fresh.qualityJourneyWorkAttempt.findFirstOrThrow({
          where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER' },
        })
        expect(JSON.parse(attempt.failureJson!)).toMatchObject({
          stage: 'CANONICAL_SUBMISSION',
          recoveryEligible: true,
        })
        expect(attempt.dispatchStartedAt).not.toBeNull()
        expect(await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } })).toBe(
          1,
        )
        const recovery = await getAppManagedPreparationRecovery({ ...f.scope, role: 'TEST_SCENARIO_DESIGNER' }, fresh)
        expect(recovery).not.toBeNull()
        await expect(
          recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
        ).resolves.toEqual({ accepted: true, nativeSend: false })
        expect(localSender.run).toHaveBeenCalledTimes(1)
        expect(await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } })).toBe(
          1,
        )
        expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
        expect((await getQualityJourney(f.scope, fresh)).journey.stage).toBe('SCENARIO_REVIEW')
        expect(await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).toMatchObject({
          failureJson: null,
          dispatchReservedAt: null,
          dispatchStartedAt: null,
        })
      } finally {
        publication.mockRestore()
      }
    },
    30_000,
  )

  it('preserves recovery eligibility when a transient assignment read fails before canonical call capture', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    const submit = vi.spyOn(scenarioServices, 'submitExternalQualityJourneyScenarioPortfolio')
    submit.mockRejectedValueOnce(new Error('transient original submission failure'))
    try {
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
      ).rejects.toThrow('UNKNOWN')
    } finally {
      submit.mockRestore()
    }
    const scope = { ...f.scope, role: 'TEST_SCENARIO_DESIGNER' as const }
    const recovery = await getAppManagedPreparationRecovery(scope, f.client)
    expect(recovery).not.toBeNull()
    const before = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    const read = vi.spyOn(scenarioServices, 'readInternalScenarioDesignerAssignment')
    read.mockRejectedValueOnce(new Error('temporary SQLite read interruption'))
    try {
      await expect(
        recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, f.client),
      ).rejects.toThrow('no new native send')
    } finally {
      read.mockRestore()
    }
    const fresh = f.connect()
    expect((await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: before.id } })).failureJson).toBe(
      before.failureJson,
    )
    expect(await getAppManagedPreparationRecovery(scope, fresh)).toEqual(recovery)
    expect(await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: before.id } })).toBe(0)
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
    ).resolves.toEqual({ accepted: true, nativeSend: false })
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: before.id } })).toBe(1)
    expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
  }, 30_000)

  it('resumes an exact persisted recovery call after a process exit before acceptance, only with a live lease', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    const submit = vi.spyOn(scenarioServices, 'submitExternalQualityJourneyScenarioPortfolio')
    submit.mockRejectedValueOnce(new Error('transient original submission failure'))
    try {
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
      ).rejects.toThrow('UNKNOWN')
    } finally {
      submit.mockRestore()
    }
    const scope = { ...f.scope, role: 'TEST_SCENARIO_DESIGNER' as const }
    const recovery = await getAppManagedPreparationRecovery(scope, f.client)
    expect(recovery).not.toBeNull()
    let crashed = false
    const interrupted = new Proxy(f.client, {
      get(target, property) {
        if (property !== 'qualityJourneyWorkAttempt') return Reflect.get(target, property)
        return new Proxy(target.qualityJourneyWorkAttempt, {
          get(delegate, method) {
            if (method !== 'updateMany') return Reflect.get(delegate, method)
            return async (args: Parameters<typeof delegate.updateMany>[0]) => {
              if (crashed) throw new Error('Simulated recovery process exit')
              const failure = args?.data.failureJson
              if (typeof failure === 'string' && JSON.parse(failure).canonicalRecoveryCall) {
                const result = await delegate.updateMany(args)
                expect(result.count).toBe(1)
                crashed = true
                throw new Error('Simulated recovery process exit')
              }
              return delegate.updateMany(args)
            }
          },
        })
      },
    })
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, interrupted),
    ).rejects.toThrow('Simulated recovery process exit')
    const fresh = f.connect()
    const attempt = await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } })
    const state = JSON.parse(attempt.failureJson!)
    expect(state).toMatchObject({ canonicalRecoveryUsed: true })
    expect(state.canonicalRecoveryCallHash).toBe(hashCanonical(state.canonicalRecoveryCall))
    expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
    expect(await getAppManagedPreparationRecovery(scope, fresh)).not.toBeNull()
    await fresh.qualityJourneyWorkAttempt.update({ where: { id: attempt.id }, data: { leaseExpiresAt: new Date(0) } })
    expect(await getAppManagedPreparationRecovery(scope, fresh)).toBeNull()
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
    ).rejects.toThrow('current active proposal')
    await fresh.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: {
        leaseExpiresAt: attempt.leaseExpiresAt,
        failureJson: canonicalContractJson({ ...state, canonicalRecoveryCallHash: digest('0') }),
      },
    })
    expect(await getAppManagedPreparationRecovery(scope, fresh)).toBeNull()
    await fresh.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: { failureJson: attempt.failureJson },
    })
    const winner = canonicalContractJson({ ...state, winningRecovery: true })
    const raced = new Proxy(fresh, {
      get(target, property) {
        if (property !== 'qualityJourneyWorkAttempt') return Reflect.get(target, property)
        return new Proxy(target.qualityJourneyWorkAttempt, {
          get(delegate, method) {
            if (method !== 'updateMany') return Reflect.get(delegate, method)
            return async () => {
              await delegate.update({ where: { id: attempt.id }, data: { failureJson: winner } })
              return { count: 0 }
            }
          },
        })
      },
    })
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, raced),
    ).rejects.toThrow('no new native send')
    expect((await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).failureJson).toBe(
      winner,
    )
    expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(0)
    await fresh.qualityJourneyWorkAttempt.update({
      where: { id: attempt.id },
      data: { failureJson: attempt.failureJson },
    })
    await expect(
      recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
    ).resolves.toEqual({ accepted: true, nativeSend: false })
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
    expect(await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: attempt.id } })).toBe(1)
    expect(await getAppManagedPreparationRecovery(scope, fresh)).toBeNull()
  }, 30_000)

  it.each([false, true])(
    'reconciles repeated recovery publication interruption after lease expiry (lost acknowledgement=%s)',
    async lostAck => {
      const f = await localFixture()
      localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
      const originalPublication = scenarioServices.publishQualityJourneyScenarioPortfolio
      const publication = vi.spyOn(scenarioServices, 'publishQualityJourneyScenarioPortfolio')
      publication.mockRejectedValueOnce(new Error('initial publication interruption'))
      try {
        await expect(
          startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
        ).rejects.toThrow('UNKNOWN')
        const scope = { ...f.scope, role: 'TEST_SCENARIO_DESIGNER' as const }
        const recovery = await getAppManagedPreparationRecovery(scope, f.client)
        publication.mockImplementationOnce(async (...args) => {
          if (lostAck) await originalPublication(...args)
          throw new Error('recovery publication interruption')
        })
        await expect(
          recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, f.client),
        ).rejects.toThrow('no new native send')
        const fresh = f.connect()
        await fresh.qualityJourneyWorkAttempt.update({
          where: { id: recovery!.attemptId },
          data: { leaseExpiresAt: new Date(0) },
        })
        expect(
          JSON.parse(
            (await fresh.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: recovery!.attemptId } }))
              .failureJson!,
          ),
        ).toMatchObject({ canonicalRecoveryUsed: true, canonicalRecoveryOutcome: 'INTERRUPTED' })
        for (let round = 0; round < 2; round++) {
          expect(await getAppManagedPreparationRecovery(scope, fresh)).not.toBeNull()
          publication.mockRejectedValueOnce(new Error('another transient publication interruption'))
          if (!lostAck)
            await expect(
              recoverAppManagedScenarioAutomation(
                { ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! },
                fresh,
              ),
            ).rejects.toThrow('no new native send')
          else publication.mockReset()
        }
        publication.mockImplementation(originalPublication)
        await expect(
          recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
        ).resolves.toEqual({ accepted: true, nativeSend: false })
        expect(localSender.run).toHaveBeenCalledTimes(1)
        expect(await fresh.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
        expect(
          await fresh.qualityJourneyExternalSubmissionAcceptance.count({ where: { attemptId: recovery!.attemptId } }),
        ).toBe(1)
        expect((await getQualityJourney(f.scope, fresh)).journey.stage).toBe('SCENARIO_REVIEW')
        expect(await getAppManagedPreparationRecovery(scope, fresh)).toBeNull()
        await expect(
          recoverAppManagedScenarioAutomation({ ...(await f.input('TEST_SCENARIO_DESIGNER')), ...recovery! }, fresh),
        ).rejects.toThrow('current active proposal')
      } finally {
        publication.mockRestore()
      }
    },
    30_000,
  )

  it('automatically dispatches an exact human-requested Designer revision once with carried feedback', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    await startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client)
    const before = await getQualityJourney(f.scope, f.client)
    const { portfolio } = await getQualityJourneyScenarioPortfolio(f.scope, f.client)
    const prior = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: portfolio.submittedAttemptId },
    })
    const request = {
      expectedReviewHash: portfolio.reviewHash,
      command: {
        ...f.scope,
        schemaVersion: qualityJourneyContractVersion,
        actor: 'USER',
        command: 'REQUEST_SCENARIO_REVISION',
        commandId: 'local-designer-revision',
        idempotencyKey: 'local-designer-revision',
        expectedStateHash: before.journey.stateHash,
        inputArtifactRefs: [
          {
            kind: 'SCENARIO_PORTFOLIO_REVISION',
            artifactId: portfolio.artifactId,
            revisionId: portfolio.artifactRevisionId,
            contentHash: portfolio.contentHash,
          },
        ],
        payload: {
          reviewedRevisionId: portfolio.artifactRevisionId,
          reviewedHash: portfolio.contentHash,
          feedback: 'Include a clearly named checkout outcome.',
        },
      },
    }
    await requestQualityJourneyScenarioRevision(request, f.client, trustedHumanCoordinatorSession)
    const reissued = await f.client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: prior.workItemId } })
    expect(reissued).toMatchObject({ status: 'ELIGIBLE', currentAttempt: 1 })
    const next = await f.input('TEST_SCENARIO_DESIGNER')
    expect(await readAppManagedJourneyContinuation(next, f.client)).toMatchObject({ role: 'TEST_SCENARIO_DESIGNER' })
    const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    const command = await f.client.qualityJourneyCommand.findUniqueOrThrow({ where: { id: request.command.commandId } })
    await expect(
      f.client.$transaction(tx =>
        readAppManagedDesignerSuccessor(
          row,
          reissued,
          new Proxy(tx, {
            get(target, property) {
              if (property === 'qualityJourneyCommand')
                return {
                  ...tx.qualityJourneyCommand,
                  findUnique: async () => ({
                    ...command,
                    requestJson: canonicalContractJson({
                      ...request.command,
                      payload: { ...request.command.payload, feedback: 'Forged feedback' },
                    }),
                  }),
                }
              return Reflect.get(target, property)
            },
          }),
        ),
      ),
    ).rejects.toThrow('exact canonical review request')
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(await continueAppManagedJourney(next, f.client)).toEqual({ completed: ['TEST_SCENARIO_DESIGNER'] })
    expect(localSender.run).toHaveBeenCalledTimes(2)
    const prompt = JSON.parse(
      localSender.run.mock.calls[1]![0].split('\n\n').find((part: string) => part.startsWith('{'))!,
    )
    expect(prompt.successorFeedback).toMatchObject({
      commandId: request.command.commandId,
      feedback: request.command.payload.feedback,
      reviewedRevisionId: portfolio.artifactRevisionId,
    })
    const successor = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: prior.workItemId, attempt: 2 },
    })
    expect(successor.assignmentId).not.toBe(prior.assignmentId)
    expect(successor.authorizationId).not.toBe(prior.authorizationId)
    expect(successor.replacesAttemptId).toBeNull()
    expect((await getQualityJourneyScenarioPortfolio(f.scope, f.client)).portfolio.predecessorPortfolioRevisionId).toBe(
      portfolio.id,
    )
    const after = await f.input('TEST_SCENARIO_DESIGNER')
    expect(await continueAppManagedJourney(after, f.client)).toEqual({ completed: [] })
    expect(await continueAppManagedJourney(next, f.client)).toEqual({ completed: [] })
    expect(localSender.run).toHaveBeenCalledTimes(2)
    expect(await f.client.qualityJourneyScenarioPortfolioRevision.count()).toBe(2)
    expect(await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: prior.id } })).toEqual(prior)
  }, 30_000)

  it('issues a distinct canonical Designer replacement for proven output rejection without replaying its consumed attempt', async () => {
    const f = await localFixture()
    localSender.run.mockImplementation(async (prompt: string) => {
      const output = JSON.parse(scenarioOutput(prompt))
      output.arguments.portfolio.scenarios[0].enrichment.observationIds = []
      return JSON.stringify(output)
    })
    await expect(startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const correction = await getAppManagedScenarioDesignCorrection(f.scope, f.client)
    expect(correction?.detail).toContain('arguments.portfolio.scenarios.0.enrichment.observationIds (too_small)')
    const original = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: correction!.attemptId },
    })
    const failure = JSON.parse(original.failureJson!)
    expect(failure).toMatchObject({
      senderCleanupVerified: true,
      stage: 'OUTPUT_VALIDATION',
      canonicalSubmissionStarted: false,
      normalizedOutput: { arguments: { portfolio: { scenarios: [{ enrichment: { observationIds: [] } }] } } },
    })
    expect(failure.candidate).toBeUndefined()
    const request = {
      ...(await f.input('TEST_SCENARIO_DESIGNER')),
      attemptId: original.id,
      expectedFailureHash: correction!.failureHash,
    }
    await expect(requestAppManagedScenarioDesignCorrection(request, f.client)).resolves.toMatchObject({
      predecessorAttemptId: original.id,
      successorAttempt: 2,
    })
    expect(localSender.run).toHaveBeenCalledTimes(1)
    const reconciled = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: original.id } })
    expect(reconciled).toMatchObject({
      status: 'FAILED',
      failureJson: original.failureJson,
      dispatchAdapterId: original.dispatchAdapterId,
      dispatchStartedAt: null,
      dispatchReservedAt: null,
    })
    const event = await f.client.qualityJourneyEvent.findFirstOrThrow({
      where: { journeyId: f.scope.journeyId, eventType: 'DESIGNER_REJECTED_OUTPUT_REPLACEMENT_REQUESTED' },
    })
    expect(JSON.parse(event.payloadJson)).toMatchObject({
      failureJson: original.failureJson,
      failureHash: correction!.failureHash,
      dispatchStartedAt: original.dispatchStartedAt!.toISOString(),
    })
    await expect(requestAppManagedScenarioDesignCorrection(request, f.client)).rejects.toThrow('not eligible')
    const next = await f.input('TEST_SCENARIO_DESIGNER')
    const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.scope.journeyId } })
    const item = await f.client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: original.workItemId } })
    await expect(
      f.client.$transaction(tx =>
        readAppManagedDesignerSuccessor(
          row,
          item,
          new Proxy(tx, {
            get(target, property) {
              if (property === 'qualityJourneyEvent')
                return {
                  ...tx.qualityJourneyEvent,
                  findMany: async () => [
                    {
                      ...event,
                      payloadJson: canonicalContractJson({
                        ...JSON.parse(event.payloadJson),
                        failureHash: digest('f'),
                      }),
                    },
                  ],
                }
              return Reflect.get(target, property)
            },
          }),
        ),
      ),
    ).rejects.toThrow('exact issued rejection successor')
    expect(localSender.run).toHaveBeenCalledTimes(1)
    localSender.run.mockImplementation(async (prompt: string) => scenarioOutput(prompt))
    expect(await continueAppManagedJourney(next, f.client)).toEqual({ completed: ['TEST_SCENARIO_DESIGNER'] })
    expect(localSender.run).toHaveBeenCalledTimes(2)
    const prompt = JSON.parse(
      localSender.run.mock.calls[1]![0].split('\n\n').find((part: string) => part.startsWith('{'))!,
    )
    expect(prompt.successorFeedback.rejection).toMatchObject({ kind: 'SCHEMA', issues: expect.any(Array) })
    expect(await continueAppManagedJourney(await f.input('TEST_SCENARIO_DESIGNER'), f.client)).toEqual({
      completed: [],
    })
    expect(localSender.run).toHaveBeenCalledTimes(2)
    const replacement = await f.client.qualityJourneyWorkAttempt.findFirstOrThrow({
      where: { workItemId: original.workItemId, attempt: 2 },
    })
    expect(replacement.assignmentId).not.toBe(original.assignmentId)
    expect(replacement.leaseId).not.toBe(original.leaseId)
    expect(replacement.authorizationId).toBe(original.authorizationId)
    expect(replacement.replacesAttemptId).toBe(original.id)
    expect(JSON.parse(replacement.assignmentJson!)).toMatchObject({
      replacement: { predecessorAttemptId: original.id, diagnostics: { failureHash: correction!.failureHash } },
    })
    expect((await getQualityJourney(f.scope, f.client)).journey.stage).toBe('SCENARIO_REVIEW')
    expect(await f.client.qualityJourneyScenarioPortfolioRevision.count()).toBe(1)
  }, 30_000)
  it('refuses a new Designer assignment for uncertain cleanup or a possibly started canonical submission', async () => {
    const f = await localFixture()
    localSender.run.mockResolvedValue('[]')
    await expect(startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client)).rejects.toThrow(
      'UNKNOWN',
    )
    const correction = await getAppManagedScenarioDesignCorrection(f.scope, f.client)
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: correction!.attemptId } })
    const original = JSON.parse(attempt.failureJson!)
    for (const delta of [
      { senderCleanupVerified: false },
      { canonicalSubmissionStarted: true },
      { stage: 'NATIVE_SEND' },
    ]) {
      const failure = { ...original, ...delta }
      await f.client.qualityJourneyWorkAttempt.update({
        where: { id: attempt.id },
        data: { failureJson: canonicalContractJson(failure) },
      })
      expect(await getAppManagedScenarioDesignCorrection(f.scope, f.client)).toBeNull()
      await expect(
        requestAppManagedScenarioDesignCorrection(
          {
            ...(await f.input('TEST_SCENARIO_DESIGNER')),
            attemptId: attempt.id,
            expectedFailureHash: hashCanonical(failure),
          },
          f.client,
        ),
      ).rejects.toThrow('proven sender cleanup')
      expect(
        (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).dispatchStartedAt,
      ).not.toBeNull()
    }
    expect(localSender.run).toHaveBeenCalledTimes(1)
    expect(
      await f.client.qualityJourneyEvent.count({
        where: { eventType: 'DESIGNER_REJECTED_OUTPUT_REPLACEMENT_REQUESTED' },
      }),
    ).toBe(0)
  }, 30_000)

  it('keeps the original authorization attempt ceiling across distinct rejected design assignments', async () => {
    const f = await localFixture()
    localSender.run.mockResolvedValue('[]')
    for (let index = 0; index < 3; index++) {
      await expect(
        startAppManagedScenarioAutomation(await f.input('TEST_SCENARIO_DESIGNER'), f.client),
      ).rejects.toThrow('UNKNOWN')
      const correction = await getAppManagedScenarioDesignCorrection(f.scope, f.client)
      const request = {
        ...(await f.input('TEST_SCENARIO_DESIGNER')),
        attemptId: correction!.attemptId,
        expectedFailureHash: correction!.failureHash,
      }
      if (index < 2) await requestAppManagedScenarioDesignCorrection(request, f.client)
      else
        await expect(requestAppManagedScenarioDesignCorrection(request, f.client)).rejects.toThrow(
          'maximum attempt budget',
        )
    }
    expect(localSender.run).toHaveBeenCalledTimes(3)
    const attempts = await f.client.qualityJourneyWorkAttempt.findMany({
      where: { dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER' },
    })
    expect(attempts).toHaveLength(3)
    expect(new Set(attempts.map(attempt => attempt.authorizationId)).size).toBe(1)
    expect(
      (
        await f.client.qualityJourneyWorkAuthorization.findUniqueOrThrow({
          where: { id: attempts[0].authorizationId! },
        })
      ).maxAttempts,
    ).toBe(3)
  }, 30_000)
})
