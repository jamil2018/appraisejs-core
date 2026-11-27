/** Disposable M08/M09 preparation for M10; all authority comes from canonical services.
 * The provider fixture is positively legacy/no-invalidation. This does not admit E2 dispatch.
 * No Vitest dependency: runtime qualification scripts can reuse this preparation.
 */
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { PrismaClient } from '@prisma/client'
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
import { createQualityJourneyInternalTriageGateway } from '@/services/coordinator/quality-journey-internal-triage-gateway'
import { prepareQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
import type { TriageInput } from '@/services/coordinator/quality-journey-triage-input'
import { composeOperatorReport, reviewSealedRuns } from '@/services/coordinator/app-managed-operator-triage'
import {
  startQualityJourneyScenarioDesign,
  getQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
} from '@/services/coordinator/quality-journey-scenario-service'
import {
  captureQualityJourneyDiscoveryBrowserReceipt,
  closeQualityJourneyDiscoveryBrowserSession,
  getOwnedQualityJourneyDiscoveryBrowserCleanup,
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
export function createM10DiscoveryMetadataRuntime(): DiscoveryBrowserRuntime {
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

export type M10OfflineDispatchEvent = Readonly<{
  binding: import('@/services/coordinator/quality-journey-service').ExternalQualityJourneySubmissionBinding
  client: import('@prisma/client').PrismaClient
  databasePath: string
  canonicalDefinitions: readonly import('@/lib/quality-journey/managed-worker-gateway').CanonicalMcpDefinition[]
  toolName: string
  arguments: Record<string, unknown>
  directInvoke: () => Promise<unknown>
}>
export type M10OfflineDispatch = (event: M10OfflineDispatchEvent) => Promise<unknown>
type ExistingApprovedJourney = {
  client: PrismaClient
  workspace: string
  databasePath: string
  journeyId: string
  targetProjectId: string
  requirementId: string
  expectedPageTitle: string
  reviewScenario?: () => Promise<void>
}

async function existingApprovedJourney(input: ExistingApprovedJourney) {
  const scope = { journeyId: input.journeyId, targetProjectId: input.targetProjectId }
  const journey = await input.client.qualityJourney.findFirst({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId },
  })
  if (
    !journey ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.stage !== 'DISCOVERY' ||
    !journey.currentCoordinatorSessionId ||
    !journey.activeDiscoveryRevisionId
  )
    throw new Error('M10 continuation requires the exact approved local Journey in Discovery.')
  const [session, discovery] = await Promise.all([
    input.client.qualityJourneyCoordinatorSession.findFirst({
      where: {
        id: journey.currentCoordinatorSessionId,
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
      },
    }),
    input.client.qualityJourneyDiscoveryRevision.findFirst({
      where: {
        id: journey.activeDiscoveryRevisionId,
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        cycleId: journey.activeCycleId,
      },
      select: { analysisDecision: { select: { decision: true, journeyId: true } } },
    }),
  ])
  if (
    !discovery ||
    discovery.analysisDecision.decision !== 'APPROVED' ||
    discovery.analysisDecision.journeyId !== journey.id
  )
    throw new Error('M10 continuation requires the exact approved Analysis decision.')
  if (
    !session ||
    session.status !== 'ACTIVE' ||
    session.fencedAt ||
    session.hostKind !== 'APP_SERVER_LOCAL_V1' ||
    !session.generation
  )
    throw new Error('M10 continuation requires the active durable local owner generation.')
  const credentials = {
    ...scope,
    coordinatorPrincipalId: session.ownerPrincipalId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation,
  }
  return {
    ...input,
    scope,
    credentials,
    principal: { principalId: session.ownerPrincipalId, assurance: 'PROJECT_CREDENTIAL_ONLY' as const },
    cleanup: async () => undefined,
  }
}

function m10Operations(includeOrderNumber: boolean) {
  return [
    'browser.navigation.navigate.to.environment.base.url',
    'browser.navigation.reload',
    'browser.navigation.assertion.assert.url.route.equals',
    ...(includeOrderNumber ? ['browser.browser.assertion.assert.page.title'] : []),
  ].map(id => {
    const operation = defaultOperationDefinitions.find(candidate => candidate.id === id)!
    const definition = builtInStepDefinitions.find(
      candidate => candidate.execution.kind === 'operation' && candidate.execution.handlerId === operation.handler.id,
    )!
    return { operation, definition, hashes: computeStepDefinitionHashes(definition) }
  })
}

async function publishM10FixtureDefinitions(client: PrismaClient, includeOrderNumber: boolean) {
  for (const { definition, hashes } of m10Operations(includeOrderNumber)) {
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
}

/** Seed the reviewed operation registry before Analysis approval freezes Discovery authority. */
export async function prepareM10ExistingRegistry(client: PrismaClient) {
  await publishM10FixtureDefinitions(client, true)
}

async function prepareM10AutomationFixtureInternal(
  baseUrl = 'http://127.0.0.1:44081/checkout',
  offline?: {
    dispatch: M10OfflineDispatch
    onFixtureOwned?: (owned: {
      client: M10OfflineDispatchEvent['client']
      workspace: string
      databasePath: string
    }) => void
    beforeDiscoveryBrowser?: (scope: {
      client: M10OfflineDispatchEvent['client']
      journeyId: string
      targetProjectId: string
      discoveryRevisionId: string
      workItemId: string
      environmentId: string
      routeId: string
    }) => Promise<void>
    discoveryRuntime?: DiscoveryBrowserRuntime
    serialDiscoveryAdmissions?: boolean
    preserveOnFailure?: boolean
    requireObservedDiscoveryCleanup?: boolean
    workspaceParent?: string
    qualificationLeaseSeconds?: 900
  },
  existing?: ExistingApprovedJourney,
) {
  const qualificationLeaseSeconds = offline?.qualificationLeaseSeconds
  const seeded = existing
    ? null
    : await createProviderFixture({ workspaceParent: offline?.workspaceParent, qualificationLeaseSeconds })
  const f = seeded ?? (await existingApprovedJourney(existing!))
  try {
    offline?.onFixtureOwned?.({ client: f.client, workspace: f.workspace, databasePath: f.databasePath })
    const { client, scope, credentials, principal } = f
    const canonicalDefinitions = registerAppraiseOperations({
      server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
      api: {} as never,
      options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'm10-disposable' },
    })
    const gatewayBindings = new WeakMap<ScopedGateway, M10OfflineDispatchEvent['binding']>()
    const dispatch = async <T>(
      binding: M10OfflineDispatchEvent['binding'],
      toolName: string,
      args: Record<string, unknown>,
      directInvoke: () => Promise<T>,
    ): Promise<T> =>
      offline
        ? ((await offline.dispatch({
            binding,
            client,
            databasePath: f.databasePath,
            canonicalDefinitions,
            toolName,
            arguments: args,
            directInvoke,
          })) as T)
        : directInvoke()
    const callWorker = async <T = unknown>(
      gateway: ScopedGateway,
      toolName: string,
      args: Record<string, unknown> = {},
    ) => {
      const invoke = () => callM10WorkerMcp<T>(gateway, toolName, args)
      const binding = gatewayBindings.get(gateway)
      return offline && binding && typeof args.idempotencyKey === 'string'
        ? dispatch(binding, toolName, args, invoke)
        : invoke()
    }

    const operations = m10Operations(Boolean(existing))
    if (!existing) await publishM10FixtureDefinitions(client, false)
    const environmentId = 'm10-environment'
    const moduleId = 'm10-module'
    if (existing) {
      const [environment, module, locators] = await Promise.all([
        client.environment.findFirst({ where: { id: environmentId, targetProjectId: scope.targetProjectId } }),
        client.module.findFirst({ where: { id: moduleId, targetProjectId: scope.targetProjectId } }),
        client.locatorGroup.findFirst({
          where: { id: 'm10-locators', moduleId, targetProjectId: scope.targetProjectId },
        }),
      ])
      if (!environment || environment.baseUrl !== baseUrl || !module || !locators || locators.route !== '/checkout')
        throw new Error('M10 continuation requires the reviewed local checkout environment and route.')
    } else {
      await client.environment.create({
        data: { id: environmentId, name: 'M10 disposable', baseUrl, targetProjectId: scope.targetProjectId },
      })
      await client.module.create({
        data: { id: moduleId, name: 'M10 checkout', targetProjectId: scope.targetProjectId },
      })
      await client.locatorGroup.create({
        data: {
          id: 'm10-locators',
          name: 'M10 checkout',
          route: '/checkout',
          moduleId,
          targetProjectId: scope.targetProjectId,
        },
      })
    }
    const command = async (key: string, actor: 'USER' | 'RUNNER') => ({
      ...scope,
      schemaVersion: qualityJourneyContractVersion,
      commandId: key,
      idempotencyKey: key,
      actor,
      expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
    })
    const requirementId = existing?.requirementId ?? 'REQ-M10-CHECKOUT'
    if (seeded) {
      const charter = {
        schemaVersion: qualityJourneyContractVersion,
        charterId: 'm10-charter',
        analysisRevisionId: 'm10-analysis',
        ...scope,
        cycleId: seeded.created.journey.activeCycleId,
        requirementRevisionId: seeded.created.journey.activeRevisionIds.journey,
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
      const submitAnalysis = () =>
        submitExternalQualityJourneyAnalysisSuccessor(
          {
            ...scope,
            workItemId: seeded.binding.workItemId,
            attemptId: seeded.binding.attemptId,
            assignmentId: seeded.binding.assignmentId,
            assignmentGeneration: seeded.binding.assignmentGeneration,
            assignmentSecret: seeded.binding.assignmentSecret,
            leaseId: seeded.binding.leaseId,
            idempotencyKey: 'm10-submit-analysis',
            charter,
          },
          principal,
          client,
          credentials,
        )
      const submitted = await dispatch(
        seeded.binding,
        'quality_journey_analysis_submit',
        { idempotencyKey: 'm10-submit-analysis', charter },
        submitAnalysis,
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
    }

    let claimSequence = 0
    const admit = async (role: QualityJourneyRole) => {
      const key = `m10-${role}-${++claimSequence}`
      const assignmentSecret = `m10-disposable-${key}-0123456789`
      const worker = await claimExternalQualityJourneyWork(
        {
          ...credentials,
          role,
          principal,
          assignmentSecret,
          idempotencyKey: `${key}-claim`,
          ...(qualificationLeaseSeconds === undefined ? {} : { leaseSeconds: qualificationLeaseSeconds }),
        },
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
    await offline?.beforeDiscoveryBrowser?.({
      ...browserScope,
      client,
      workItemId: discovery.scoutWorkItemId,
      environmentId,
      routeId: '/checkout',
    })
    const session = await startQualityJourneyDiscoveryBrowserSession(
      {
        ...browserScope,
        workItemId: discovery.scoutWorkItemId,
        environmentId,
        routeId: '/checkout',
        accessMode: 'ANONYMOUS',
      },
      client,
      offline?.discoveryRuntime ?? createM10DiscoveryMetadataRuntime(),
    )
    let captured: Awaited<ReturnType<typeof captureQualityJourneyDiscoveryBrowserReceipt>>
    try {
      captured = await captureQualityJourneyDiscoveryBrowserReceipt(
        { ...browserScope, sessionId: session.id, snapshotId: 'm10-snapshot' },
        client,
      )
    } finally {
      await closeQualityJourneyDiscoveryBrowserSession({ ...browserScope, sessionId: session.id })
      if (offline?.requireObservedDiscoveryCleanup) {
        const cleanup = getOwnedQualityJourneyDiscoveryBrowserCleanup({
          journeyId: scope.journeyId,
          targetProjectId: scope.targetProjectId,
        }).receipts.find(row => row.sessionId === session.id && row.processInstanceId === session.processInstanceId)
        if (cleanup?.state !== 'RUNTIME_CLOSE_CONFIRMED')
          throw new Error('Original discovery browser cleanup is unobserved')
      }
    }
    const scout = await admit('SCOUT')
    const earlyExplorer = offline?.serialDiscoveryAdmissions ? undefined : await admit('RESOURCE_EXPLORER')
    const scoutGateway = await createQualityJourneyInternalDiscoveryGateway(
      scout.workerBinding,
      canonicalDefinitions,
      client,
    )
    gatewayBindings.set(scoutGateway, scout.workerBinding)
    const createExplorerGateway = async (explorer: Awaited<ReturnType<typeof admit>>) => {
      const gateway = await createQualityJourneyInternalDiscoveryGateway(
        explorer.workerBinding,
        canonicalDefinitions,
        client,
      )
      gatewayBindings.set(gateway, explorer.workerBinding)
      return gateway
    }
    const earlyExplorerGateway = earlyExplorer ? await createExplorerGateway(earlyExplorer) : undefined
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
    await callWorker(scoutGateway, 'quality_journey_target_observation_submit', {
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
    const explorer = earlyExplorer ?? (await admit('RESOURCE_EXPLORER'))
    const explorerGateway = earlyExplorerGateway ?? (await createExplorerGateway(explorer))
    await callWorker(explorerGateway, 'quality_journey_resource_resolution_submit', {
      discoveryRevisionId: discovery.id,
      idempotencyKey: 'm10-resolution',
      bundle: {
        ...common,
        bundleId: 'm10-resolution',
        inputArtifacts: JSON.parse(explorer.worker.workItem.inputArtifactRefsJson),
        resolvedAt: receipt.capturedAt,
        destinationModuleId: moduleId,
        approvedRequirementIds: [requirementId],
        evidenceReceipts: [{ artifactId: analysisRevision.artifactId, contentHash: analysisRevision.contentHash }],
        reusable: resources.map((resource, index) => ({
          ...resource,
          requirementId,
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
    gatewayBindings.set(designerGateway, designer.workerBinding)
    const { result: design } = await callWorker<{
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
            title: existing ? 'Verify checkout order number' : 'Verify checkout route',
            narrative: 'A shopper opens checkout.',
            requirementIds: [requirementId],
            expectedSignals: existing ? ['An order ID is shown'] : ['Checkout route'],
            steps: operations.map(({ definition }, index) => ({
              stepId: `m10-step-${index}`,
              action: `${index === 0 ? 'Given' : 'Then'} ${definition.intent.title}`,
              expected:
                index === 0
                  ? 'Environment is open'
                  : definition.execution.kind === 'operation' &&
                      definition.execution.handlerId === 'browser.browser.assertion.assert.page.title'
                    ? existing!.expectedPageTitle
                    : '/checkout',
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
    await callWorker(designerGateway, 'quality_journey_scenarios_submit', {
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
    if (existing?.reviewScenario) await existing.reviewScenario()
    else
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
    gatewayBindings.set(automatorGateway, automator.workerBinding)
    const { result: automation } = await callWorker<{
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
      parameters:
        operation.id === 'browser.navigation.assertion.assert.url.route.equals'
          ? [{ name: 'route', type: 'string', value: '/checkout' }]
          : operation.id === 'browser.browser.assertion.assert.page.title'
            ? [{ name: 'expected', type: 'string', value: existing!.expectedPageTitle }]
            : [],
      testData: [],
      locatorRequirements: [],
    }))
    await callWorker(automatorGateway, 'quality_journey_automation_materialize', {
      idempotencyKey: 'm10-materialize',
      scenarios: [{ scenarioRevisionId, steps }],
    })
    const prepared = await client.qualityJourneyPreparedRuntimeCapsule.findMany({
      where: { journeyId: scope.journeyId },
      orderBy: { id: 'asc' },
    })
    return { ...f, admit, command, environmentId, scenarioRevisionId, prepared, canonicalDefinitions }
  } catch (error) {
    // Actual qualification keeps its original database and UNKNOWN records for its owning parent.
    if (!offline?.preserveOnFailure) await f.cleanup()
    throw error
  }
}

/** Original self-contained disposable M10 fixture. */
export async function prepareM10AutomationFixture(
  baseUrl = 'http://127.0.0.1:44081/checkout',
  offline?: Parameters<typeof prepareM10AutomationFixtureInternal>[1],
) {
  const result = await prepareM10AutomationFixtureInternal(baseUrl, offline)
  return result as typeof result & Awaited<ReturnType<typeof createProviderFixture>>
}

/** Continue a UI-created Journey after its exact Analysis revision was approved. */
export async function continueM10AutomationFixture(input: ExistingApprovedJourney, baseUrl: string) {
  return prepareM10AutomationFixtureInternal(baseUrl, undefined, input)
}

/** Synthetic Triager on the pilot's real sealed checkout result. */
export async function publishM10CheckoutReportFixture(
  scope: { journeyId: string; targetProjectId: string; executionCycleId: string },
  client: PrismaClient,
) {
  const journey = await client.qualityJourney.findFirstOrThrow({
    where: { id: scope.journeyId, targetProjectId: scope.targetProjectId, stage: 'TRIAGE', status: 'ACTIVE' },
  })
  const owner = await client.qualityJourneyCoordinatorSession.findFirstOrThrow({
    where: {
      id: journey.currentCoordinatorSessionId ?? '',
      journeyId: journey.id,
      targetProjectId: scope.targetProjectId,
      status: 'ACTIVE',
    },
  })
  if (!owner.generation) throw new Error('The fixture Journey needs its durable local coordinator generation.')
  const credentials = {
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    coordinatorPrincipalId: owner.ownerPrincipalId,
    coordinatorSessionId: owner.id,
    coordinatorGeneration: owner.generation,
  }
  await prepareQualityJourneyTriage(scope, client, credentials)
  const claim = {
    ...credentials,
    role: 'TRIAGER' as const,
    principal: { principalId: owner.ownerPrincipalId, assurance: 'PROJECT_CREDENTIAL_ONLY' as const },
    assignmentSecret: randomBytes(32).toString('hex'),
  }
  const worker = await claimExternalQualityJourneyWork(
    { ...claim, idempotencyKey: 'm10-checkout-triage-claim' },
    client,
  )
  const binding = {
    ...claim,
    workItemId: worker.workItem.id,
    attemptId: worker.attempt.id,
    assignmentId: worker.assignment.assignmentId,
    assignmentGeneration: worker.assignmentGeneration,
    leaseId: worker.attempt.leaseId,
  }
  await admitExternalQualityJourneyWork({ ...binding, idempotencyKey: 'm10-checkout-triage-admit' }, client)
  const definitions = registerAppraiseOperations({
    server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
    api: {} as never,
    options: { baseUrl: 'http://127.0.0.1:3000', cwd: process.cwd(), coordinatorId: 'm10-disposable' },
  })
  const gateway = await createQualityJourneyInternalTriageGateway(binding, definitions, client)
  const { result: assignment } = await callM10WorkerMcp<TriageInput & { reportRevisionId: string }>(
    gateway,
    'quality_journey_triage_get',
  )
  const runs = reviewSealedRuns(assignment, [])
  const notes = runs
    .filter(run => !run.passed)
    .map(run => ({
      testRunId: run.testRunId,
      kind: 'INCONCLUSIVE' as const,
      observation: 'The sealed fixture run did not establish the required order number.',
      expectation: 'The checkout confirmation includes an order number.',
      nextAction: 'Inspect the original checkout run and exact report step.',
    }))
  await callM10WorkerMcp(gateway, 'quality_journey_triage_submit', {
    idempotencyKey: 'm10-checkout-triage-report',
    report: {
      schemaVersion: qualityJourneyContractVersion,
      reportRevisionId: assignment.reportRevisionId,
      executionCycleId: assignment.executionCycleId,
      cycleId: assignment.cycleId,
      ...composeOperatorReport(assignment, runs, notes),
    },
  })
  return { reportRevisionId: assignment.reportRevisionId }
}
