/** Disposable M08/M09 preparation for M10; all authority comes from canonical services.
 * The provider fixture is positively legacy/no-invalidation. This does not admit E2 dispatch.
 * No Vitest dependency: runtime qualification scripts can reuse this preparation.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createAttemptScopedWorkerMcpServer } from '../../packages/appraisejs/src/mcp/managed-worker-server'
import { registerAppraiseOperations } from '../../packages/appraisejs/src/mcp/registry'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  stepDefinitionContentHash,
} from '../../packages/cucumber-runtime/src/step-definitions'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion, type QualityJourneyRole } from '@/lib/quality-journey'
import { createProviderFixture } from './quality-journey-provider-fixture'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  claimExternalQualityJourneyWork,
  admitExternalQualityJourneyWork,
  getQualityJourney,
} from '@/services/coordinator/quality-journey-service'
import {
  submitExternalQualityJourneyAnalysisSuccessor,
  publishQualityJourneyAnalysis,
  decideQualityJourneyAnalysis,
} from '@/services/coordinator/quality-journey-analysis-service'
import { createQualityJourneyInternalDiscoveryGateway } from '@/services/coordinator/quality-journey-internal-discovery-gateway'
import { createQualityJourneyInternalScenarioAutomationGateway } from '@/services/coordinator/quality-journey-internal-scenario-automation-gateway'
import {
  startQualityJourneyScenarioDesign,
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
} from '@/services/coordinator/quality-journey-scenario-service'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  startQualityJourneyDiscoveryBrowserSession,
  type DiscoveryBrowserRuntime,
} from '@/services/coordinator/quality-journey-discovery-browser-service'

type ScopedGateway = Pick<
  Awaited<ReturnType<typeof createQualityJourneyInternalDiscoveryGateway>>,
  'profile' | 'sealedGrant' | 'callGateway'
>

/** In-memory MCP transport, using the actual attempt-scoped server and tool schemas. */
export async function callM10WorkerMcp<T = unknown>(
  gateway: ScopedGateway,
  toolName: string,
  args: Record<string, unknown> = {},
) {
  let gatewayError: unknown
  const server = createAttemptScopedWorkerMcpServer({
    ...gateway,
    callGateway: async request => {
      try {
        return await gateway.callGateway(request)
      } catch (error) {
        gatewayError = error
        throw error
      }
    },
    expectedProfileDigest: gateway.profile.contractDigest,
  })
  const worker = new Client({ name: 'm10-disposable-worker', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await worker.connect(clientTransport)
  try {
    const response = await worker.callTool({ name: toolName, arguments: args })
    if (response.isError) throw new Error(JSON.stringify(response.content))
    return response.structuredContent as { result: T; receipt: unknown }
  } catch (error) {
    throw new Error(`M10 scoped MCP ${toolName} failed`, { cause: gatewayError ?? error })
  } finally {
    await worker.close()
    await server.close()
  }
}

/** Discovery metadata only; physical browser execution belongs to the runtime lane. */
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
                title: async () => 'Disposable checkout target',
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

export async function prepareM10AutomationFixture(baseUrl = 'http://127.0.0.1:44081/checkout') {
  const f = await createProviderFixture()
  try {
    const { client, scope, credentials, principal } = f
    const operations = [
      'browser.navigation.navigate.to.environment.base.url',
      'browser.navigation.reload',
      'browser.navigation.assertion.assert.url.route.equals',
    ].map(id => {
      const operation = defaultOperationDefinitions.find(candidate => candidate.id === id)!
      const definition = builtInStepDefinitions.find(
        candidate => candidate.execution.kind === 'operation' && candidate.execution.handlerId === operation.handler.id,
      )!
      return { operation, definition, hashes: computeStepDefinitionHashes(definition) }
    })
    for (const { definition, hashes } of operations) {
      const registryManifestHash = stepDefinitionContentHash({ step: definition.identity })
      const conformanceRunId = 'm10-disposable-runtime-fixture'
      const publicationReceipt = {
        step: { id: definition.identity.id, version: definition.identity.version },
        ...hashes,
        registryManifestHash,
        executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, conformanceRunId),
        conformanceRunId,
        reviewAuthority: 'disposable-fixture-reviewer',
        publishedAt: '2026-11-11T00:00:00.000Z',
      }
      await client.stepDefinition.create({
        data: {
          id: definition.identity.id,
          version: definition.identity.version,
          status: 'ready',
          title: definition.intent.title,
          description: definition.intent.description,
          definitionJson: canonicalContractJson(definition),
          ...hashes,
          // Isolated fixture publication metadata; it is not provider or production qualification.
          publicationReceipt: {
            create: {
              receiptJson: canonicalContractJson(publicationReceipt),
              receiptHash: stepDefinitionContentHash(publicationReceipt),
              registryManifestHash,
              conformanceRunId,
              reviewAuthority: publicationReceipt.reviewAuthority,
            },
          },
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
    }
    const environmentId = 'm10-environment'
    const moduleId = 'm10-module'
    await client.environment.create({
      data: { id: environmentId, name: 'M10 disposable', baseUrl, targetProjectId: scope.targetProjectId },
    })
    await client.module.create({ data: { id: moduleId, name: 'M10 checkout', targetProjectId: scope.targetProjectId } })
    await client.locatorGroup.create({
      data: {
        id: 'm10-locators',
        name: 'M10 checkout',
        route: '/checkout',
        moduleId,
        targetProjectId: scope.targetProjectId,
      },
    })
    const command = async (key: string, actor: 'USER' | 'RUNNER') => ({
      ...scope,
      schemaVersion: qualityJourneyContractVersion,
      commandId: key,
      idempotencyKey: key,
      actor,
      expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
    })
    const charter = {
      schemaVersion: qualityJourneyContractVersion,
      charterId: 'm10-charter',
      analysisRevisionId: 'm10-analysis',
      ...scope,
      cycleId: f.created.journey.activeCycleId,
      requirementRevisionId: f.created.journey.activeRevisionIds.journey,
      objectives: ['Allow checkout.'],
      scope: { included: ['Checkout'], excluded: [] },
      actors: ['Shopper'],
      requirements: [
        { requirementId: 'REQ-M10-CHECKOUT', statement: 'A shopper opens checkout.', sourceRefs: ['brief:1'] },
      ],
      obligations: [
        {
          obligationId: 'OBL-M10-CHECKOUT',
          requirementId: 'REQ-M10-CHECKOUT',
          statement: 'The checkout route is displayed.',
          acceptanceSignals: ['Checkout route'],
        },
      ],
      constraints: [],
      assumptions: [],
      risks: [],
      acceptanceSignals: ['Checkout route'],
      retiredRequirementIds: [],
      questions: [],
      resolvedQuestionAnswerIds: [],
    }
    const submitted = await submitExternalQualityJourneyAnalysisSuccessor(
      {
        ...scope,
        workItemId: f.binding.workItemId,
        attemptId: f.binding.attemptId,
        assignmentId: f.binding.assignmentId,
        assignmentGeneration: f.binding.assignmentGeneration,
        assignmentSecret: f.binding.assignmentSecret,
        leaseId: f.binding.leaseId,
        idempotencyKey: 'm10-submit-analysis',
        charter,
      },
      principal,
      client,
      credentials,
    )
    const analysis = submitted.analysisRevision
    const analysisRefs = [
      {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: charter.charterId,
        revisionId: analysis.id,
        contentHash: analysis.contentHash,
      },
    ]
    await publishQualityJourneyAnalysis(
      {
        ...(await command('m10-publish-analysis', 'RUNNER')),
        command: 'PUBLISH_ANALYSIS',
        inputArtifactRefs: analysisRefs,
        payload: { artifactRevisionId: analysis.id, artifactHash: analysis.contentHash },
      },
      client,
      credentials,
    )
    await decideQualityJourneyAnalysis(
      {
        ...(await command('m10-approve-analysis', 'USER')),
        command: 'DECIDE_ANALYSIS',
        inputArtifactRefs: analysisRefs,
        payload: { revisionId: analysis.id, contentHash: analysis.contentHash, decision: 'APPROVED' },
      },
      client,
      trustedHumanCoordinatorSession,
    )
    const canonicalDefinitions = registerAppraiseOperations({
      server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
      api: {} as never,
      options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'm10-disposable' },
    })
    let claimSequence = 0
    const admit = async (role: QualityJourneyRole) => {
      const key = `m10-${role}-${++claimSequence}`
      const assignmentSecret = `m10-disposable-${key}-0123456789`
      const worker = await claimExternalQualityJourneyWork(
        { ...credentials, role, principal, assignmentSecret, idempotencyKey: `${key}-claim` },
        client,
      )
      const workerBinding = {
        ...credentials,
        role,
        principal,
        assignmentSecret,
        workItemId: worker.workItem.id,
        attemptId: worker.attempt.id,
        assignmentId: worker.assignment.assignmentId,
        assignmentGeneration: worker.assignmentGeneration,
        leaseId: worker.attempt.leaseId,
      }
      await admitExternalQualityJourneyWork({ ...workerBinding, idempotencyKey: `${key}-admit` }, client)
      return { worker, workerBinding }
    }
    const discovery = await client.qualityJourneyDiscoveryRevision.findFirstOrThrow({
      where: { journeyId: scope.journeyId },
    })
    const browserScope = { ...scope, discoveryRevisionId: discovery.id }
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...browserScope,
        workItemId: discovery.scoutWorkItemId,
        environmentId,
        routeId: '/checkout',
        accessMode: 'ANONYMOUS',
      },
      client,
      disposableDiscoveryRuntime(),
    )
    let captured: Awaited<ReturnType<typeof captureQualityJourneyDiscoveryBrowserReceipt>>
    try {
      captured = await captureQualityJourneyDiscoveryBrowserReceipt(
        { ...browserScope, sessionId: session.id, snapshotId: 'm10-snapshot' },
        client,
      )
    } finally {
      await closeQualityJourneyDiscoveryBrowserSession({ ...browserScope, sessionId: session.id })
    }
    const scout = await admit('SCOUT')
    const explorer = await admit('RESOURCE_EXPLORER')
    const scoutGateway = await createQualityJourneyInternalDiscoveryGateway(
      scout.workerBinding,
      canonicalDefinitions,
      client,
    )
    const explorerGateway = await createQualityJourneyInternalDiscoveryGateway(
      explorer.workerBinding,
      canonicalDefinitions,
      client,
    )
    const analysisRevision = {
      artifactId: discovery.analysisRevisionArtifactId,
      revisionId: discovery.analysisRevisionId,
      contentHash: discovery.analysisRevisionContentHash,
    }
    const common = {
      cycleId: discovery.cycleId,
      analysisRevision,
      analysisApproval: {
        artifactId: discovery.analysisApprovalArtifactId,
        contentHash: discovery.analysisApprovalContentHash,
      },
      approvedRequirementSetHash: discovery.approvedRequirementSetHash,
    }
    const descriptor = { artifactId: captured.artifactId, contentHash: captured.contentHash }
    const { receipt } = captured
    await callM10WorkerMcp(scoutGateway, 'quality_journey_target_observation_submit', {
      discoveryRevisionId: discovery.id,
      idempotencyKey: 'm10-observations',
      bundle: {
        ...common,
        bundleId: 'm10-observations',
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
            observationId: 'm10-observation',
            snapshotId: receipt.snapshotId,
            routeId: receipt.routeId,
            environmentId: receipt.environmentId,
            fact: receipt.observationFacts[0],
            evidenceReceiptIds: [captured.artifactId],
            confidence: 'HIGH',
            confidenceRationale: 'The scoped route was loaded.',
            stability: 'CONDITIONAL',
            stabilityRationale: 'The local target can change.',
            revalidationPolicy: { triggers: ['environment_registry_changed'] },
          },
        ],
      },
    })
    const resources = [
      { resourceId: `module:${moduleId}`, resourceKind: 'MODULE' },
      ...operations.flatMap(({ operation, definition }) => [
        {
          resourceId: `step:${definition.identity.id}:${definition.identity.version}`,
          resourceKind: 'STEP_DEFINITION',
        },
        { resourceId: `operation:${operation.id}:${operation.version}`, resourceKind: 'OPERATION' },
      ]),
    ]
    await callM10WorkerMcp(explorerGateway, 'quality_journey_resource_resolution_submit', {
      discoveryRevisionId: discovery.id,
      idempotencyKey: 'm10-resolution',
      bundle: {
        ...common,
        bundleId: 'm10-resolution',
        inputArtifacts: JSON.parse(explorer.worker.workItem.inputArtifactRefsJson),
        resolvedAt: receipt.capturedAt,
        destinationModuleId: moduleId,
        approvedRequirementIds: ['REQ-M10-CHECKOUT'],
        evidenceReceipts: [{ artifactId: analysisRevision.artifactId, contentHash: analysisRevision.contentHash }],
        reusable: resources.map((resource, index) => ({
          ...resource,
          requirementId: 'REQ-M10-CHECKOUT',
          rank: index + 1,
          explanation: 'Use the frozen compatible mapping.',
          reasonCode: 'COMPATIBLE',
          evidenceReceiptIds: [analysisRevision.artifactId],
        })),
        incompatible: [],
        stale: [],
        crossTarget: [],
        missing: [],
      },
    })
    await startQualityJourneyScenarioDesign(
      {
        ...(await command('m10-start-design', 'RUNNER')),
        command: 'START_SCENARIO_DESIGN',
        inputArtifactRefs: [],
        payload: {},
      },
      client,
      credentials,
    )
    const designer = await admit('TEST_SCENARIO_DESIGNER')
    const designerGateway = await createQualityJourneyInternalScenarioAutomationGateway(
      designer.workerBinding,
      canonicalDefinitions,
      client,
    )
    const { result: design } = await callM10WorkerMcp<{
      cycleId: string
      discoveryRevisionId: string
      discoveryCompletionHash: string
      portfolioId: string
      portfolioRevisionId: string
    }>(designerGateway, 'quality_journey_scenarios_get')
    const scenarioRevisionId = 'm10-checkout-v1'
    const portfolio = {
      ...design,
      schemaVersion: qualityJourneyContractVersion,
      coverageRationale: 'Cover the checkout route.',
      graph: { edges: [], sharedSetup: [] },
      scenarios: [
        {
          stableScenarioId: 'm10-checkout',
          scenarioRevisionId,
          behavioralIntent: {
            title: 'Verify checkout route',
            narrative: 'A shopper opens checkout.',
            requirementIds: ['REQ-M10-CHECKOUT'],
            expectedSignals: ['Checkout route'],
            steps: operations.map(({ definition }, index) => ({
              stepId: `m10-step-${index}`,
              action: `${index === 0 ? 'Given' : 'Then'} ${definition.intent.title}`,
              expected: index === 0 ? 'Environment is open' : '/checkout',
            })),
          },
          enrichment: {
            observationIds: ['m10-observation'],
            resourceAssumptionIds: operations
              .map(({ operation }) => `operation:${operation.id}:${operation.version}`)
              .sort(),
            feasibilityNotes: [],
          },
          layout: { x: 0, y: 0, sequence: 0 },
        },
      ],
    }
    // Scope reads include other fields; only the exact submission identity is submitted.
    const exactPortfolio = {
      cycleId: portfolio.cycleId,
      discoveryRevisionId: portfolio.discoveryRevisionId,
      discoveryCompletionHash: portfolio.discoveryCompletionHash,
      portfolioId: portfolio.portfolioId,
      portfolioRevisionId: portfolio.portfolioRevisionId,
      schemaVersion: portfolio.schemaVersion,
      coverageRationale: portfolio.coverageRationale,
      graph: portfolio.graph,
      scenarios: portfolio.scenarios,
    }
    await callM10WorkerMcp(designerGateway, 'quality_journey_scenarios_submit', {
      idempotencyKey: 'm10-scenarios',
      portfolio: exactPortfolio,
    })
    const candidate = await getQualityJourneyScenarioPortfolio(scope, client)
    const portfolioRefs = [
      {
        kind: 'SCENARIO_PORTFOLIO_REVISION',
        artifactId: design.portfolioId,
        revisionId: design.portfolioRevisionId,
        contentHash: candidate.portfolio.contentHash,
      },
    ]
    await publishQualityJourneyScenarioPortfolio(
      {
        ...(await command('m10-publish-scenarios', 'RUNNER')),
        command: 'PUBLISH_SCENARIO_PORTFOLIO',
        inputArtifactRefs: portfolioRefs,
        payload: { artifactRevisionId: design.portfolioRevisionId, artifactHash: candidate.portfolio.contentHash },
      },
      client,
      credentials,
    )
    const reviewed = await getQualityJourneyScenarioPortfolio(scope, client)
    const decision = { approvedScenarioRevisionIds: [scenarioRevisionId], rejectedScenarioRevisionIds: [] }
    await decideQualityJourneyScenarios(
      {
        ...decision,
        expectedReviewHash: reviewed.portfolio.reviewHash,
        command: {
          ...(await command('m10-human-review', 'USER')),
          command: 'DECIDE_SCENARIOS',
          inputArtifactRefs: portfolioRefs,
          payload: {
            ...decision,
            portfolioRevisionId: design.portfolioRevisionId,
            portfolioHash: candidate.portfolio.contentHash,
          },
        },
      },
      client,
      trustedHumanCoordinatorSession,
    )
    const automator = await admit('AUTOMATOR')
    const automatorGateway = await createQualityJourneyInternalScenarioAutomationGateway(
      automator.workerBinding,
      canonicalDefinitions,
      client,
    )
    const { result: automation } = await callM10WorkerMcp<{
      stepDefinitions: Array<{ definition: { identity: { id: string; version: string } }; definitionHash: string }>
    }>(automatorGateway, 'quality_journey_automation_context_get')
    const steps = operations.map(({ operation, definition }, index) => ({
      sourceScenarioStepId: `m10-step-${index}`,
      stepDefinition: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: automation.stepDefinitions.find(item => item.definition.identity.id === definition.identity.id)!
          .definitionHash,
      },
      operation: { id: operation.id, version: operation.version, handler: operation.handler },
      parameters: index < operations.length - 1 ? [] : [{ name: 'route', type: 'string', value: '/checkout' }],
      testData: [],
      locatorRequirements: [],
    }))
    await callM10WorkerMcp(automatorGateway, 'quality_journey_automation_materialize', {
      idempotencyKey: 'm10-materialize',
      scenarios: [{ scenarioRevisionId, steps }],
    })
    const prepared = await client.qualityJourneyPreparedRuntimeCapsule.findMany({
      where: { journeyId: scope.journeyId },
      orderBy: { id: 'asc' },
    })
    return { ...f, admit, command, environmentId, scenarioRevisionId, prepared, canonicalDefinitions }
  } catch (error) {
    await f.cleanup()
    throw error
  }
}
