import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createAttemptScopedWorkerMcpServer } from '../../../packages/appraisejs/src/mcp/managed-worker-server'
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

const fixtures: Awaited<ReturnType<typeof createProviderFixture>>[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
afterEach(async () => {
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

async function internalDiscoveryFixture() {
  const f = await createProviderFixture()
  fixtures.push(f)
  const { client, scope, credentials, binding, principal } = f
  const { targetProjectId, journeyId } = scope
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
  async function openGateway(role: 'SCOUT' | 'RESOURCE_EXPLORER') {
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
    const version = await ownershipVersion()
    const gateway = await createQualityJourneyInternalDiscoveryGateway(
      workerBinding,
      registerAppraiseOperations({
        server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
        api: {} as never,
        options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'm08-disposable' },
      }),
      client,
    )
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
  return { client, discovery, credentials, browserScope, startBrowser, openGateway, ownershipVersion }
}

async function callThroughWorkerMcp(
  gateway: Awaited<ReturnType<typeof createQualityJourneyInternalDiscoveryGateway>>,
  toolName: string,
  args: Record<string, unknown> = {},
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
    const response = await client.callTool({ name: toolName, arguments: args })
    expect(response.isError, JSON.stringify(response.content)).not.toBe(true)
    return response.structuredContent
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

describe('M08 internal Discovery gateway', () => {
  it('accepts both scoped role outputs with Appraise evidence and leaves the next lifecycle decision to Appraise', async () => {
    const f = await internalDiscoveryFixture()
    try {
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
    } finally {
      await f.client.$disconnect()
    }
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
