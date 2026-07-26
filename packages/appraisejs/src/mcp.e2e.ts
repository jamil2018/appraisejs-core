import { createHash } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { parse as parseYaml } from 'yaml'

import { canonicalContractJson } from '../../../src/lib/catalog-contracts/index.ts'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const port = 3299
const baseUrl = `http://127.0.0.1:${port}`
const requestedPlanId = `mcp-e2e-${Date.now()}`
const providerNativeRunsEnabled = ['1', 'true', 'yes', 'on'].includes(
  (process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS ?? '').trim().toLowerCase(),
)
let planId = requestedPlanId
const explicitTargetPlanIds: string[] = []
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-e2e-'))
const databasePath = path.join(temporaryDirectory, 'mcp-e2e.db')
process.env.DATABASE_URL = `file:${databasePath}`
let appServer: ChildProcess | undefined
let client: Client | undefined
let transport: StdioClientTransport | undefined
let serverOutput = ''
let mcpDiagnostics = ''

function agentAuthoredPlan(
  goal: string,
  description: string,
  tasks = [
    {
      id: 'agent-authored-task',
      title: 'Execute the authored plan',
      description: 'Carry out the task explicitly supplied by the planning agent.',
      acceptanceCriteria: ['The agent-authored outcome is complete.'],
      validationIntent: 'Validate the authored outcome with deterministic evidence.',
    },
  ],
  edges: Array<{ from: string; to: string; type: 'depends-on' }> = [],
) {
  return {
    version: '1',
    revision: 1,
    lifecycle: 'draft',
    goal,
    description,
    tasks,
    edges,
    implementationGroups: [],
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`)
  }
}

async function waitForServer() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (appServer?.exitCode !== null) throw new Error(`App server exited early:\n${serverOutput}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The development server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for AppraiseJS:\n${serverOutput}`)
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true
  return new Promise(resolve => {
    const finish = (exited: boolean) => {
      clearTimeout(timer)
      child.off('exit', onExit)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
  })
}

async function stopAppServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  if (await waitForExit(child, 5_000)) return
  child.kill('SIGKILL')
  await waitForExit(child, 2_000)
}

function toolJson(result: Awaited<ReturnType<Client['callTool']>>) {
  assert(!result.isError, `MCP tool returned an error: ${JSON.stringify(result)}`)
  const item = result.content[0]
  assert(item?.type === 'text', 'MCP tool did not return text content.')
  return JSON.parse(item.text) as Record<string, unknown>
}

async function callTool(name: string, args: Record<string, unknown>) {
  return toolJson(await client!.callTool({ name, arguments: args }))
}

function planPathFor(id: string) {
  return path.join(repoRoot, 'appraise', 'plans', `${id}.yaml`)
}

function reviewPathFor(id: string) {
  return path.join(repoRoot, 'appraise', 'plans', 'reviews', `${id}.review.yaml`)
}

function validationPathFor(id: string) {
  return path.join(repoRoot, 'appraise', 'plans', 'validations', `${id}.validation.yaml`)
}

async function approveCurrentPlan(revision: number, contentHash: string) {
  const { approvePlanRevision } = await import('../../../src/services/plan-review/plan-review-service.ts')
  await approvePlanRevision(
    {
      planId,
      displayedRevision: revision,
      expectedPlanHash: contentHash,
      actor: 'mcp-e2e-user',
    },
    { projectDirectory: repoRoot },
  )
}

try {
  run(process.execPath, ['e2e/apply-migrations.mjs'], { DATABASE_URL: `file:${databasePath}` })
  run('npm', ['--prefix', 'packages/appraisejs', 'run', 'build'])
  // Seed the source-owned registry through its real publication path so this
  // test proves the public MCP search receipt, rather than fabricating one.
  const [
    { default: database },
    { StepDefinitionRegistryService },
    { builtInStepDefinitions, computeStepReferenceHash },
  ] = await Promise.all([
    import('../../../src/config/db-config.ts'),
    import('../../../src/services/step-definition/step-definition-registry-service.ts'),
    import('../../../packages/cucumber-runtime/src/step-definitions/index.ts'),
  ])
  const stepRegistry = new StepDefinitionRegistryService(database)
  for (const definition of builtInStepDefinitions) await stepRegistry.registerBuiltIn(definition, 'mcp-e2e-source')

  appServer = spawn(process.execPath, ['scripts/start-local.mjs', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  appServer.stdout?.on('data', chunk => (serverOutput += chunk.toString()))
  appServer.stderr?.on('data', chunk => (serverOutput += chunk.toString()))
  await waitForServer()

  transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.join(repoRoot, 'packages', 'appraisejs', 'dist', 'cli.js'),
      'mcp',
      '--cwd',
      repoRoot,
      '--base-url',
      baseUrl,
      '--coordinator-id',
      'mcp-e2e-coordinator',
    ],
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: `file:${databasePath}` } as Record<string, string>,
    stderr: 'pipe',
  })
  transport.stderr?.on('data', chunk => (mcpDiagnostics += chunk.toString()))
  client = new Client({ name: 'appraisejs-mcp-e2e', version: '1.0.0' })
  await client.connect(transport)

  const tools = await client.listTools()
  const toolNames = tools.tools.map(tool => tool.name).sort()
  const expectedTools = [
    'baseline_accept',
    'baseline_cancel',
    'baseline_failure_acknowledge',
    'baseline_reconcile',
    'baseline_regression_justify',
    'baseline_start',
    'coordinator_heartbeat',
    'coordinator_register',
    'implementation_checkpoint',
    'implementation_complete',
    'implementation_completion_review',
    'implementation_control',
    'implementation_feedback',
    'implementation_group_approve',
    'implementation_start',
    'implementation_task_update',
    'implementation_validation_reconcile',
    'implementation_validation_record',
    'implementation_validation_start',
    'appraise_resources_list',
    'locator_search',
    'planning_session_create',
    'plan_create',
    'plan_event_acknowledge',
    'plan_events_acknowledge_through',
    'plan_events_read',
    'plan_read',
    'plan_review_loop',
    'plan_review_read',
    'plan_revise',
    'plan_start',
    'plan_task_update',
    'plan_wait_for_approval',
    'plan_wait_for_review',
    ...(providerNativeRunsEnabled
      ? [
          'provider_list',
          'provider_permission_decide',
          'provider_probe',
          'provider_run_cancel',
          'provider_run_create',
          'provider_run_read',
          'provider_update',
        ]
      : []),
    'project_add',
    'project_diagnostic',
    'project_list',
    'test_run',
    'test_run_diagnose',
    'test_run_preflight',
    'test_run_read',
    'validation_context_read',
    'validation_feedback_submit',
    'validation_file_approve',
    'validation_review_loop',
    'validation_review_submit',
  ]
  for (const expected of expectedTools) {
    assert(toolNames.includes(expected), `Missing MCP tool ${expected}.`)
  }

  const resources = await client.listResources()
  assert(
    resources.resources.some(resource => resource.uri === 'appraise://project'),
    'Project resource is missing.',
  )
  assert(
    resources.resources.some(resource => resource.uri === 'appraise://agent-guide'),
    'Agent guide resource is missing.',
  )
  assert(
    resources.resources.some(resource => resource.uri === 'appraise://workflow/planning'),
    'Planning workflow resource is missing.',
  )
  assert(
    resources.resources.some(resource => resource.uri === 'appraise://workflow/validation-preparation'),
    'Validation preparation workflow resource is missing.',
  )
  assert(
    resources.resources.some(resource => resource.uri === 'appraise://workflow/standby'),
    'Standby workflow resource is missing.',
  )
  if (providerNativeRunsEnabled) {
    assert(
      resources.resources.some(resource => resource.uri === 'appraise://provider-runs'),
      'Provider runs resource is missing when provider-native runs are enabled.',
    )
  } else {
    assert(
      !resources.resources.some(resource => resource.uri === 'appraise://provider-runs'),
      'Provider runs resource should be hidden by default.',
    )
  }
  const templates = await client.listResourceTemplates()
  assert(
    templates.resourceTemplates.some(template => template.uriTemplate === 'appraise://plans/{planId}'),
    'Plan resource template is missing.',
  )
  const projectResource = await client.readResource({ uri: 'appraise://project' })
  assert(projectResource.contents[0]?.text?.includes('projectFingerprint'), 'Project resource is unreadable.')
  const projectResourceJson = JSON.parse(String(projectResource.contents[0]?.text)) as {
    capabilities?: { workflowCriticalTools?: string[]; workflowResourceUris?: string[] }
    capabilityRecovery?: { recoveryActions?: string[] }
  }
  assert(
    projectResourceJson.capabilities?.workflowCriticalTools?.includes('planning_session_create'),
    'Project resource did not expose workflow-critical tool metadata.',
  )
  assert(
    projectResourceJson.capabilities?.workflowResourceUris?.includes('appraise://workflow/standby'),
    'Project resource did not expose workflow resource metadata.',
  )
  const agentGuide = await client.readResource({ uri: 'appraise://agent-guide' })
  assert(agentGuide.contents[0]?.text?.includes('plan_wait_for_approval'), 'Agent guide missed standby guidance.')
  const validationPreparation = await client.readResource({ uri: 'appraise://workflow/validation-preparation' })
  assert(
    validationPreparation.contents[0]?.text?.includes('appraise.validation-ast'),
    'Validation preparation resource missed artifact contract guidance.',
  )
  const validationAstContractResource = await client.readResource({ uri: 'appraise://contracts/validation-ast' })
  const validationAstContract = JSON.parse(String(validationAstContractResource.contents[0]?.text)) as {
    schema?: {
      properties?: Record<
        string,
        {
          type?: string
          minItems?: number
          maxItems?: number
          items?: { type?: string; additionalProperties?: boolean; required?: string[] }
        }
      >
    }
  }
  const discoveredSelections = validationAstContract.schema?.properties?.stepDefinitionSelections
  assert(
    discoveredSelections?.type === 'array' &&
      discoveredSelections.minItems === 1 &&
      discoveredSelections.maxItems === 32 &&
      discoveredSelections.items?.type === 'object' &&
      discoveredSelections.items.additionalProperties === false &&
      discoveredSelections.items.required?.join(',') === 'receiptId,correlationId',
    'Live validation AST contract resource did not expose bounded plural Step Definition selections.',
  )
  assert(
    !('stepDefinitionSelection' in (validationAstContract.schema?.properties ?? {})),
    'Live validation AST contract resource still exposed the stale singular Step Definition selection field.',
  )
  const observedResourceUris = resources.resources.map(resource => resource.uri)
  const diagnostic = await callTool('project_diagnostic', {
    observedTools: toolNames,
    observedResources: observedResourceUris,
    expectedTargetWorkspacePath: repoRoot,
  })
  assert(diagnostic.ok === true, `Project diagnostic failed: ${JSON.stringify(diagnostic)}`)
  assert(diagnostic.contractVersion === '1', 'Project diagnostic did not return the contract version.')
  const diagnosticCapabilities = diagnostic.capabilities as {
    workflowSentinelTools?: string[]
    workflowSentinelResources?: string[]
    fullCapabilityResource?: string
  }
  assert(
    diagnosticCapabilities.workflowSentinelTools?.includes('planning_session_create'),
    'Project diagnostic did not expose planning_session_create capability metadata.',
  )
  assert(
    diagnosticCapabilities.workflowSentinelResources?.includes('appraise://workflow/planning'),
    'Project diagnostic did not expose workflow resource metadata.',
  )
  assert(
    diagnosticCapabilities.fullCapabilityResource === 'appraise://project',
    'Project diagnostic did not link to the complete capability resource.',
  )
  assert(
    String(diagnostic.nextRecommendedAction).includes('target workspace'),
    'Project diagnostic did not return next-action guidance.',
  )
  assert(
    (diagnostic.agentPreflight as { status?: string }).status === 'ready',
    'Project diagnostic did not certify the live MCP task snapshot.',
  )
  assert(
    typeof (diagnostic.preflightReceipt as { browserUrl?: unknown }).browserUrl === 'string',
    'Project diagnostic did not persist a browser-visible preflight receipt.',
  )

  const missingTarget = await callTool('planning_session_create', {
    plan: agentAuthoredPlan('Recipe organizer plan', 'Agent-authored plan for a small recipe organizer app.'),
    mode: 'plan_only',
  })
  assert(missingTarget.status === 'target_required', 'Planning session did not require an explicit target.')
  assert(
    missingTarget.nextRequiredAgentBehavior === 'choose_explicit_target_before_planning',
    'Planning session target recovery did not tell the agent to choose a target.',
  )

  const targetWorkspacePath = path.join(temporaryDirectory, 'explicit-target-workspace')
  await fs.mkdir(targetWorkspacePath)
  const explicitTargetSession = await callTool('planning_session_create', {
    plan: agentAuthoredPlan('Target workspace smoke plan', 'Agent-authored target workspace smoke plan.'),
    targetWorkspacePath,
    displayName: 'MCP E2E target workspace',
  })
  const explicitTargetPlanId = String(explicitTargetSession.planId ?? '')
  assert(explicitTargetPlanId, 'Explicit target planning did not create a plan.')
  explicitTargetPlanIds.push(explicitTargetPlanId)
  assert(explicitTargetSession.targetProject, 'Explicit target planning did not register or return the target project.')
  assert(
    explicitTargetSession.lifecycle === 'awaiting_plan_review' &&
      typeof explicitTargetSession.browserUrl === 'string' &&
      typeof explicitTargetSession.appraiseUrl === 'string',
    'Explicit target planning did not return review-ready evidence for the created plan.',
  )
  assert(
    explicitTargetSession.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Explicit target planning did not enter approval standby.',
  )
  const targetDiagnostic = await callTool('project_diagnostic', {
    observedTools: toolNames,
    observedResources: observedResourceUris,
    expectedTargetWorkspacePath: targetWorkspacePath,
  })
  assert(
    (
      targetDiagnostic.agentPreflight as {
        status?: string
        layers?: { targetProjectBinding?: { matchedScope?: string } }
      }
    ).layers?.targetProjectBinding?.matchedScope === 'target',
    'Project diagnostic did not certify the registered target binding.',
  )
  const targetReceiptUrl = (targetDiagnostic.preflightReceipt as { browserUrl?: string }).browserUrl
  assert(targetReceiptUrl, 'Target preflight did not return its browser receipt URL.')
  const targetReceiptPage = await fetch(targetReceiptUrl)
  assert(targetReceiptPage.ok, 'Target preflight browser receipt was not reachable.')
  const targetReceiptHtml = await targetReceiptPage.text()
  assert(
    targetReceiptHtml.includes('Agent readiness') && targetReceiptHtml.includes('MCP E2E target workspace'),
    'Target preflight receipt was not projected into the Projects UI.',
  )

  const initialPlan = {
    version: '1',
    planId: requestedPlanId,
    revision: 1,
    lifecycle: 'draft',
    goal: 'Validate the MCP bridge end to end',
    description: 'Exercise the live MCP bridge across plan creation, review, revision, and implementation tools.',
    tasks: [
      {
        id: 'validate-mcp',
        title: 'Validate MCP',
        description: 'Exercise every coordinator MCP operation.',
        acceptanceCriteria: ['All MCP calls succeed over stdio.'],
        validationIntent: 'Run the dedicated MCP E2E harness.',
      },
    ],
    edges: [],
    implementationGroups: [],
  }
  const created = await callTool('plan_create', { plan: initialPlan, target: targetWorkspacePath })
  planId = String(created.planId)
  initialPlan.planId = planId
  assert(created.lifecycle === 'awaiting_plan_review', 'Plan create did not normalize the draft lifecycle.')
  assert(created.targetProject, 'Plan create did not bind the MCP lifecycle plan to the explicit target project.')
  const createdLinks = created.links as { appraise: string; browser: string; route: string }
  assert(
    createdLinks.route.startsWith(`/plans/${planId}?project=`),
    `Target-bound plan create did not return the scoped review route: ${JSON.stringify(createdLinks)}`,
  )
  assert(createdLinks.appraise === `appraise://plans/${planId}`, 'Plan create did not return the Appraise link.')
  assert(createdLinks.browser.includes(`/plans/${planId}`), 'Plan create did not return the browser link.')
  assert(
    created.nextRequiredAgentBehavior === 'wait_for_plan_review_ready',
    'Plan create did not require review-ready waiting.',
  )

  const search = await callTool('step_search', {
    planId,
    query: 'navigate browser to URL',
    parameterNames: ['url'],
    limit: 1,
  })
  const reuseEvidence = search.reuseEvidence as {
    receiptId?: string
    correlationId?: string
    candidateReferences?: Array<{ id: string; version: string }>
  }
  assert(reuseEvidence.receiptId, 'step_search did not return a persisted reuse receipt ID.')
  assert(reuseEvidence.correlationId, 'step_search did not return a lifecycle correlation ID.')
  assert(Array.isArray(reuseEvidence.candidateReferences), 'step_search did not return receipt candidate references.')
  const sourceDefinition = builtInStepDefinitions.find(
    definition => definition.identity.id === 'browser.navigation.goto',
  )
  assert(sourceDefinition, 'MCP E2E source definition is missing.')
  const draftDefinition = {
    ...sourceDefinition,
    identity: { id: 'mcp.e2e.navigate', version: '1', status: 'draft' },
    provenance: {
      creationMethod: 'agent-command',
      createdBy: 'mcp-e2e-agent',
      createdAt: '2026-07-25T00:00:00.000Z',
    },
    intent: {
      ...sourceDefinition.intent,
      title: 'Navigate for MCP E2E',
      description: 'Use a persisted search receipt.',
    },
  }
  const draft = await callTool('step_definition_draft_create', {
    definition: draftDefinition,
    reuseEvidence: {
      ...reuseEvidence,
      reuseJustification: 'The returned ready definition was considered before authoring.',
    },
  })
  assert(typeof draft.id === 'string', 'step_definition_draft_create did not consume the returned persisted receipt.')
  const searchToDraftEvents = await database.stepDefinitionTelemetryEvent.findMany({
    where: { planId, correlationId: reuseEvidence.correlationId },
    select: { outcome: true, surface: true, payloadJson: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const outcome of ['query_match', 'selection_selected', 'draft_created'])
    assert(
      searchToDraftEvents.some(event => event.surface === 'agent' && event.outcome === outcome),
      `Official MCP search-to-draft path did not emit ${outcome} with its persisted lifecycle correlation.`,
    )
  assert(
    searchToDraftEvents.every(event => {
      const payload = JSON.parse(event.payloadJson) as Record<string, unknown>
      return (
        Object.keys(payload).every(key => key === 'candidateCount') &&
        (payload.candidateCount === undefined || Number.isInteger(payload.candidateCount))
      )
    }),
    'MCP lifecycle telemetry retained data outside the bounded payload contract.',
  )

  const ready = await callTool('plan_wait_for_review', { planId, afterSequence: 0 })
  const readyEvents = ready.events as Array<{ type: string; sequence: number }>
  assert(
    readyEvents.some(event => event.type === 'plan_review_ready'),
    'Review-ready event was not delivered.',
  )
  assert(
    ready.planContentHash === created.planContentHash,
    'Review-ready evidence did not preserve the created plan content hash.',
  )
  assert(
    (ready.links as { appraise: string }).appraise === createdLinks.appraise,
    'Review-ready evidence returned different canonical links.',
  )
  assert(
    ready.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Review-ready response did not instruct standby.',
  )

  const pendingApproval = await callTool('plan_wait_for_approval', { planId, afterSequence: ready.eventSequence })
  assert(pendingApproval.status === 'pending_unchanged', 'Default approval wait did not return an unchanged delta.')
  assert(
    pendingApproval.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Pending approval response did not preserve standby behavior.',
  )
  assert(
    typeof pendingApproval.nextAfterSequence === 'number',
    'Pending approval response did not include nextAfterSequence.',
  )
  assert(
    typeof pendingApproval.currentAfterSequence === 'number',
    'Pending approval response did not include currentAfterSequence.',
  )
  assert(JSON.stringify(pendingApproval).length < 1_000, 'Unchanged approval delta exceeded 1,000 characters.')
  assert(!('handoffMarkdown' in pendingApproval), 'Unchanged approval delta repeated the complete handoff.')
  const loopPending = await callTool('plan_review_loop', { planId, afterSequence: ready.eventSequence, timeoutMs: 1 })
  assert(loopPending.status === 'pending_unchanged', 'Review loop did not return an unchanged delta on timeout.')
  assert(
    loopPending.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Review loop timeout did not preserve standby behavior.',
  )
  assert(
    (loopPending.recommendedWait as { tool?: string } | undefined)?.tool === 'plan_review_loop',
    'Review loop timeout did not recommend resuming with plan_review_loop.',
  )

  const directReviewResponse = await fetch(`${baseUrl}${createdLinks.route}`)
  assert(directReviewResponse.ok, `Direct review route returned ${directReviewResponse.status}.`)
  const directReviewHtml = await directReviewResponse.text()
  assert(directReviewHtml.includes(planId), 'Direct review route did not include the created plan ID.')

  const planListResponse = await fetch(`${baseUrl}/plans?query=${encodeURIComponent(planId)}`)
  assert(planListResponse.ok, `Filtered plan list route returned ${planListResponse.status}.`)
  const planListHtml = await planListResponse.text()
  assert(planListHtml.includes(planId), 'Plan list did not discover the created review-ready plan.')

  const firstRead = await callTool('plan_read', { planId, responseMode: 'summary' })
  const firstHash = firstRead.contentHash as string
  assert(firstHash.startsWith('sha256:'), 'Plan read did not return a content hash.')
  assert(!('plan' in firstRead), 'Summary plan read unexpectedly returned the full plan artifact.')
  assert(JSON.stringify(firstRead).length < 2_000, 'Summary plan read exceeded 2,000 characters.')
  const firstReview = await callTool('plan_review_read', { planId })
  assert(firstReview.reviewHash && typeof firstReview.reviewHash === 'string', 'Plan review read missed review hash.')
  assert((firstReview.blockingThreads as unknown[]).length === 0, 'New plan unexpectedly has blocking review threads.')
  assert(
    (firstReview.recovery as { revise?: string }).revise?.includes('plan_revise'),
    'Plan review read did not return revision recovery guidance.',
  )
  const planResource = await client.readResource({ uri: `appraise://plans/${planId}` })
  assert(planResource.contents[0]?.text?.includes(planId), 'Plan resource did not return the created plan.')

  const lease = await callTool('coordinator_register', { planId })
  const connectionId = lease.connectionId as string
  assert(connectionId, 'Coordinator registration did not return a connection ID.')
  const heartbeat = await callTool('coordinator_heartbeat', { planId, connectionId })
  assert(heartbeat.connectionId === connectionId, 'Coordinator heartbeat did not renew the same lease.')

  const revisedPlan = {
    ...initialPlan,
    revision: 2,
    lifecycle: 'awaiting_plan_review',
    goal: 'Validate and approve the MCP bridge end to end',
  }
  const revised = await callTool('plan_revise', { planId, expectedHash: firstHash, plan: revisedPlan })
  const revisedHash = revised.planContentHash as string
  assert(revisedHash !== firstHash, 'Plan revision did not change the content hash.')

  const revisedReady = await callTool('plan_wait_for_review', {
    planId,
    afterSequence: ready.nextAfterSequence ?? ready.eventSequence,
  })
  assert(
    revisedReady.planContentHash === revisedHash,
    'Revised plan did not reach durable review readiness before approval.',
  )

  await approveCurrentPlan(2, revisedHash)
  const approvedRead = await callTool('plan_read', { planId })
  const approvedHash = approvedRead.contentHash as string

  const approval = await callTool('plan_wait_for_approval', { planId, afterSequence: 0 })
  assert(
    approval.nextRequiredAgentBehavior === 'start_validation_preparation',
    `Approval response did not require validation preparation: ${JSON.stringify(approval)}`,
  )
  assert(approval.status === 'approved', `Approval wait did not observe plan approval: ${JSON.stringify(approval)}`)
  assert(approval.lifecycle === 'plan_approved', 'Approval wait did not preserve the approved lifecycle.')
  assert(
    approval.contentHash === approvedHash,
    `Approval wait did not return the current approved hash: ${JSON.stringify({ approvedHash, approvalHash: approval.contentHash, revisedHash })}`,
  )

  const started = await callTool('plan_start', { planId })
  assert(started.lifecycle === 'preparing_validations', 'Approved plan did not start validation preparation.')

  const storedPlan = parseYaml(await fs.readFile(planPathFor(planId), 'utf8')) as { lifecycle: string }
  assert(storedPlan.lifecycle === 'preparing_validations', 'Started lifecycle was not persisted.')

  const proposedResources = await callTool('validation_resources_propose', {
    planId,
    proposal: {
      schemaVersion: 2,
      idempotencyKey: 'mcp-e2e-validation-environment',
      modules: [],
      locatorGroups: [],
      locators: [],
      environments: [
        {
          localKey: 'local',
          name: 'local',
          baseUrl,
        },
      ],
    },
  })
  const environmentId = (proposedResources.bindings as { environments?: Array<{ id?: string }> }).environments?.[0]?.id
  assert(environmentId, 'Validation resource proposal did not return the target-bound environment ID.')
  const validationContext = await callTool('validation_context_read', { planId, responseMode: 'full' })
  assert(
    (validationContext.resources as { environments?: Array<{ id?: string }> }).environments?.some(
      environment => environment.id === environmentId,
    ),
    'Validation context did not expose the target-bound environment created through MCP.',
  )
  const validationPlanHash = (validationContext.plan as { sourceHash?: string }).sourceHash
  assert(validationPlanHash, 'Validation context did not return the authoritative target-bound plan hash.')

  const gotoSearch = await callTool('step_search', {
    planId,
    query: 'navigate browser to URL',
    parameterNames: ['url'],
    limit: 1,
  })
  const pressSearch = await callTool('step_search', {
    planId,
    query: 'press keyboard key',
    parameterNames: ['key'],
    limit: 1,
  })
  const gotoEvidence = gotoSearch.reuseEvidence as {
    receiptId?: string
    correlationId?: string
    candidateReferences?: Array<{ id: string; version: string }>
  }
  const pressEvidence = pressSearch.reuseEvidence as {
    receiptId?: string
    correlationId?: string
    candidateReferences?: Array<{ id: string; version: string }>
  }
  assert(gotoEvidence.receiptId && gotoEvidence.correlationId, 'Navigation search did not return a persisted receipt.')
  assert(pressEvidence.receiptId && pressEvidence.correlationId, 'Keyboard search did not return a persisted receipt.')
  assert(gotoEvidence.receiptId !== pressEvidence.receiptId, 'Distinct search intents reused a receipt ID.')
  assert(gotoEvidence.correlationId !== pressEvidence.correlationId, 'Distinct search intents reused a correlation ID.')
  assert(
    gotoEvidence.candidateReferences?.some(
      reference => reference.id === 'browser.navigation.goto' && reference.version === '1',
    ),
    'Navigation search receipt did not cover the exact Navigation Step Definition reference.',
  )
  assert(
    pressEvidence.candidateReferences?.some(
      reference => reference.id === 'browser.keyboard.press' && reference.version === '1',
    ),
    'Keyboard search receipt did not cover the exact keyboard Step Definition reference.',
  )
  const gotoDefinition = builtInStepDefinitions.find(definition => definition.identity.id === 'browser.navigation.goto')
  const pressDefinition = builtInStepDefinitions.find(definition => definition.identity.id === 'browser.keyboard.press')
  assert(gotoDefinition && pressDefinition, 'MCP E2E registry fixture is missing one selected Step Definition.')

  const validationSubmission = {
    expectedPlanHash: validationPlanHash,
    stepDefinitionSelections: [
      { receiptId: gotoEvidence.receiptId, correlationId: gotoEvidence.correlationId },
      { receiptId: pressEvidence.receiptId, correlationId: pressEvidence.correlationId },
    ],
    ast: {
      schemaVersion: 2,
      id: 'mcp-multi-receipt-validation',
      title: 'Validate MCP receipt correlation',
      purpose: 'Use independently persisted search evidence while compiling one managed validation.',
      coversTaskIds: ['validate-mcp'],
      matrix: [{ browser: 'chromium', environmentId }],
      expectedFailures: [],
      scenarios: [
        {
          id: 'search-receipt-validation',
          title: 'Search receipts retain their selected references',
          steps: [
            {
              id: 'open-home',
              invocation: {
                step: {
                  id: 'browser.navigation.goto',
                  version: '1',
                  definitionHash: computeStepReferenceHash(gotoDefinition),
                },
                inputs: { url: '/' },
                presentation: { keyword: 'Given', description: 'the application home page is open' },
              },
            },
            {
              id: 'press-tab',
              invocation: {
                step: {
                  id: 'browser.keyboard.press',
                  version: '1',
                  definitionHash: computeStepReferenceHash(pressDefinition),
                },
                inputs: { key: 'Tab' },
                presentation: { keyword: 'When', description: 'the user presses the Tab key' },
              },
            },
          ],
        },
      ],
      qualityConcerns: [],
      customExtensions: [],
    },
    customExtensionProposals: [],
  }
  assert(
    validationSubmission.ast.scenarios[0]!.steps.every(step => step.invocation.step.definitionHash),
    'MCP E2E fixture did not calculate exact Step Definition references for managed Validation AST authoring.',
  )

  const expectToolError = async (name: string, args: Record<string, unknown>, expectedMessage: string) => {
    const result = await client!.callTool({ name, arguments: args })
    assert(result.isError, `${name} unexpectedly accepted invalid selection evidence.`)
    assert(
      result.content.some(item => item.type === 'text' && item.text.includes(expectedMessage)),
      `${name} rejection did not explain ${expectedMessage}: ${JSON.stringify(result)}`,
    )
  }
  await expectToolError(
    'validation_ast_check',
    {
      planId,
      submission: {
        ...validationSubmission,
        stepDefinitionSelections: [{ receiptId: gotoEvidence.receiptId, correlationId: gotoEvidence.correlationId }],
      },
    },
    'not covered',
  )
  await expectToolError(
    'validation_ast_check',
    {
      planId,
      submission: {
        ...validationSubmission,
        stepDefinitionSelections: [{ receiptId: gotoEvidence.receiptId, correlationId: pressEvidence.correlationId }],
      },
    },
    'invalid, expired, or belongs to another plan',
  )

  const expiredSearch = await callTool('step_search', {
    planId,
    query: 'navigate browser to URL',
    parameterNames: ['url'],
    limit: 1,
  })
  const expiredEvidence = expiredSearch.reuseEvidence as { receiptId?: string; correlationId?: string }
  assert(expiredEvidence.receiptId && expiredEvidence.correlationId, 'Expiry fixture search did not persist a receipt.')
  await database.stepDefinitionSearchReceipt.update({
    where: { id: expiredEvidence.receiptId },
    data: { expiresAt: new Date(Date.now() - 1) },
  })
  await expectToolError(
    'validation_ast_check',
    {
      planId,
      submission: {
        ...validationSubmission,
        stepDefinitionSelections: [
          { receiptId: expiredEvidence.receiptId, correlationId: expiredEvidence.correlationId },
        ],
      },
    },
    'invalid, expired, or belongs to another plan',
  )

  const checkedValidation = await callTool('validation_ast_check', { planId, submission: validationSubmission })
  assert(checkedValidation.valid === true, `Managed Validation AST check failed: ${JSON.stringify(checkedValidation)}`)
  const laterSearch = await callTool('step_search', {
    planId,
    query: 'wait for the page to be ready',
    parameterNames: [],
    limit: 1,
  })
  const laterEvidence = laterSearch.reuseEvidence as { correlationId?: string }
  assert(laterEvidence.correlationId, 'Interleaved search did not return a correlation ID.')
  const previewedValidation = await callTool('validation_ast_preview', { planId, submission: validationSubmission })
  assert(
    previewedValidation.valid === true,
    `Managed Validation AST preview failed: ${JSON.stringify(previewedValidation)}`,
  )
  assert(
    typeof previewedValidation.receiptHash === 'string',
    'Managed Validation AST preview did not return its receipt hash.',
  )
  const compiledValidation = await callTool('validation_ast_compile', {
    planId,
    submission: validationSubmission,
    expectedReceiptHash: previewedValidation.receiptHash,
  })
  assert(
    compiledValidation.operationId,
    `Managed Validation AST compile did not publish its review operation: ${JSON.stringify(compiledValidation)}`,
  )
  const compiledOperation = await database.validationAstPublishOperation.findFirst({
    where: { planId, id: String(compiledValidation.operationId) },
    select: { runtimeInputJson: true },
  })
  assert(compiledOperation?.runtimeInputJson, 'Managed Validation AST compile did not persist its runtime input.')
  const runtimeInput = JSON.parse(compiledOperation.runtimeInputJson) as {
    lifecycleCorrelation?: { planId?: string; correlationId?: string }
  }
  assert(runtimeInput.lifecycleCorrelation?.planId === planId, 'Compiled runtime input did not retain the source plan.')
  assert(
    runtimeInput.lifecycleCorrelation?.correlationId !== laterEvidence.correlationId,
    'Interleaved later search replaced the compiled Validation AST correlation.',
  )
  const expectedCorrelation = `sha256:${createHash('sha256')
    .update(
      canonicalContractJson({
        selections: [...validationSubmission.stepDefinitionSelections].sort((left, right) =>
          left.receiptId.localeCompare(right.receiptId),
        ),
      }),
    )
    .digest('hex')}`
  assert(
    runtimeInput.lifecycleCorrelation?.correlationId === expectedCorrelation,
    'Compiled Validation AST correlation was not bound to the combined original receipt selections.',
  )

  const libraryPlan = agentAuthoredPlan(
    'Publish a typed parsing library',
    'Agent-authored plan for a non-UI library with a build dependency.',
    [
      {
        id: 'define-parser-contract',
        title: 'Define parser contract',
        description: 'Specify the public parsing input and result types.',
        acceptanceCriteria: ['The public contract compiles.'],
        validationIntent: 'Run the package type check.',
      },
      {
        id: 'implement-parser',
        title: 'Implement parser',
        description: 'Implement the parser against the authored contract.',
        acceptanceCriteria: ['Valid and invalid inputs are covered.'],
        validationIntent: 'Run package unit tests.',
      },
    ],
    [{ from: 'implement-parser', to: 'define-parser-contract', type: 'depends-on' }],
  )
  const structurallyDifferentSession = await callTool('planning_session_create', {
    plan: libraryPlan,
    targetWorkspacePath,
    displayName: 'MCP E2E target workspace',
  })
  const structurallyDifferentPlanId = String(structurallyDifferentSession.planId ?? '')
  assert(structurallyDifferentPlanId, 'Structurally different planning session did not create a plan.')
  explicitTargetPlanIds.push(structurallyDifferentPlanId)
  const structurallyDifferentRead = await callTool('plan_read', {
    planId: structurallyDifferentPlanId,
    responseMode: 'full',
  })
  const structurallyDifferentPlan = structurallyDifferentRead.plan as {
    tasks: Array<{ id: string }>
    edges: Array<{ from: string; to: string; type: string }>
  }
  assert(
    structurallyDifferentPlan.tasks.map(task => task.id).join(',') === 'define-parser-contract,implement-parser',
    'Appraise did not preserve the structurally different agent-authored task graph.',
  )
  assert(
    structurallyDifferentPlan.edges[0]?.type === 'depends-on',
    'Appraise did not preserve the agent-authored dependency graph.',
  )
  assert(!mcpDiagnostics.includes('stdout'), `Unexpected MCP diagnostics: ${mcpDiagnostics}`)

  console.log(
    JSON.stringify({
      ok: true,
      planId,
      tools: toolNames.length,
      resources: resources.resources.length,
      resourceTemplates: templates.resourceTemplates.length,
      finalLifecycle: storedPlan.lifecycle,
      mcpDiagnostics,
    }),
  )
} finally {
  await client?.close().catch(() => {})
  await transport?.close().catch(() => {})
  if (appServer) await stopAppServer(appServer)
  await fs.rm(planPathFor(planId), { force: true })
  await fs.rm(reviewPathFor(planId), { force: true })
  await fs.rm(validationPathFor(planId), { force: true })
  for (const explicitTargetPlanId of explicitTargetPlanIds) {
    await fs.rm(planPathFor(explicitTargetPlanId), { force: true })
    await fs.rm(reviewPathFor(explicitTargetPlanId), { force: true })
  }
  await fs.rm(planPathFor(requestedPlanId), { force: true })
  await fs.rm(reviewPathFor(requestedPlanId), { force: true })
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
