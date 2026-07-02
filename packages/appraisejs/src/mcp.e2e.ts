import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const port = 3299
const baseUrl = `http://127.0.0.1:${port}`
const requestedPlanId = `mcp-e2e-${Date.now()}`
const providerNativeRunsEnabled = ['1', 'true', 'yes', 'on'].includes(
  (process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS ?? '').trim().toLowerCase(),
)
let planId = requestedPlanId
let explicitTargetPlanId: string | undefined
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-e2e-'))
const databasePath = path.join(temporaryDirectory, 'mcp-e2e.db')
let appServer: ChildProcess | undefined
let client: Client | undefined
let transport: StdioClientTransport | undefined
let serverOutput = ''
let mcpDiagnostics = ''

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

async function approveCurrentPlan(revision: number, contentHash: string) {
  const reviewPath = reviewPathFor(planId)
  await fs.mkdir(path.dirname(reviewPath), { recursive: true })
  await fs.writeFile(
    reviewPath,
    stringifyYaml({
      version: '1',
      planId,
      threads: [],
      planApprovals: [
        {
          id: 'mcp-e2e-approval',
          revision,
          contentHash,
          relevantHashes: { plan: contentHash },
          approvedBy: 'mcp-e2e-user',
          approvedAt: new Date().toISOString(),
        },
      ],
      fileApprovals: [],
    }),
  )
}

try {
  await fs.copyFile(path.join(repoRoot, 'prisma', 'dev.db'), databasePath)
  run('npx', ['prisma', 'migrate', 'deploy'], { DATABASE_URL: `file:${databasePath}` })
  run('npm', ['--prefix', 'packages/appraisejs', 'run', 'build'])

  appServer = spawn('npm', ['run', 'dev:web', '--', '-H', '127.0.0.1', '-p', String(port)], {
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
    'implementation_start',
    'implementation_task_update',
    'planning_session_create',
    'plan_create',
    'plan_event_acknowledge',
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
    'validation_decide',
    'validation_feedback_submit',
    'validation_file_approve',
    'validation_publish',
    'validation_review_loop',
    'validation_review_submit',
  ]
  assert(
    toolNames.length === expectedTools.length,
    `Expected ${expectedTools.length} MCP tools, received ${toolNames.join(', ')}.`,
  )
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
  const diagnostic = await callTool('project_diagnostic', {})
  assert(diagnostic.ok === true, `Project diagnostic failed: ${JSON.stringify(diagnostic)}`)
  assert(diagnostic.contractVersion === '1', 'Project diagnostic did not return the contract version.')
  const diagnosticCapabilities = diagnostic.capabilities as {
    workflowCriticalTools?: string[]
    workflowResourceUris?: string[]
  }
  assert(
    diagnosticCapabilities.workflowCriticalTools?.includes('planning_session_create'),
    'Project diagnostic did not expose planning_session_create capability metadata.',
  )
  assert(
    diagnosticCapabilities.workflowResourceUris?.includes('appraise://workflow/planning'),
    'Project diagnostic did not expose workflow resource metadata.',
  )
  assert(
    String(diagnostic.nextRecommendedAction).includes('target workspace'),
    'Project diagnostic did not return next-action guidance.',
  )

  const missingTarget = await callTool('planning_session_create', {
    projectBrief: 'Build a small recipe organizer app.',
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
    projectBrief: 'Plan a small target workspace smoke app.',
    targetWorkspacePath,
    displayName: 'MCP E2E target workspace',
  })
  const explicitTargetCreated = explicitTargetSession.created as { planId?: string } | undefined
  explicitTargetPlanId = String(explicitTargetCreated?.planId ?? '')
  assert(explicitTargetPlanId, 'Explicit target planning did not create a plan.')
  assert(explicitTargetSession.targetProject, 'Explicit target planning did not register or return the target project.')
  assert(
    (explicitTargetSession.reviewReady as { planId?: string } | undefined)?.planId === explicitTargetPlanId,
    'Explicit target planning did not return review-ready evidence for the created plan.',
  )
  assert(
    explicitTargetSession.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Explicit target planning did not enter approval standby.',
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
  const created = await callTool('plan_create', { plan: initialPlan })
  planId = String(created.planId)
  initialPlan.planId = planId
  assert(created.lifecycle === 'awaiting_plan_review', 'Plan create did not normalize the draft lifecycle.')
  const createdPlan = created.plan as { lifecycle: string }
  assert(createdPlan.lifecycle === 'awaiting_plan_review', 'Plan create did not return the normalized plan payload.')
  const createdLinks = created.links as { appraise: string; browser: string; route: string }
  assert(
    createdLinks.route === `/plans/${planId}`,
    `Plan create did not return the stable review route: ${JSON.stringify(createdLinks)}`,
  )
  assert(createdLinks.appraise === `appraise://plans/${planId}`, 'Plan create did not return the Appraise link.')
  assert(createdLinks.browser === `${baseUrl}/plans/${planId}`, 'Plan create did not return the browser link.')
  assert(
    created.nextRequiredAgentBehavior === 'wait_for_plan_review_ready',
    'Plan create did not require review-ready waiting.',
  )

  const ready = await callTool('plan_wait_for_review', { planId, afterSequence: 0 })
  const readyEvents = ready.events as Array<{ type: string; sequence: number }>
  assert(
    readyEvents.some(event => event.type === 'plan_review_ready'),
    'Review-ready event was not delivered.',
  )
  assert(ready.contentHash === created.contentHash, 'Review-ready evidence did not preserve the created hash.')
  assert(ready.eventSequence === created.eventSequence, 'Review-ready evidence did not preserve the event sequence.')
  assert(
    (ready.links as { appraise: string }).appraise === createdLinks.appraise,
    'Review-ready evidence returned different canonical links.',
  )
  assert(
    ready.nextRequiredAgentBehavior === 'standby_for_appraise_review',
    'Review-ready response did not instruct standby.',
  )

  const pendingApproval = await callTool('plan_wait_for_approval', { planId, afterSequence: ready.eventSequence })
  assert(pendingApproval.status === 'pending', 'Default approval wait did not return compact pending standby.')
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
  assert(
    String(pendingApproval.reviewGatePause).includes('Do not implement'),
    'Pending approval response did not include explicit review-gate pause guidance.',
  )
  assert(
    String(pendingApproval.cursorGuidance).includes('afterSequence is exclusive'),
    'Pending approval response did not include exclusive cursor guidance.',
  )
  const loopPending = await callTool('plan_review_loop', { planId, afterSequence: ready.eventSequence, timeoutMs: 1 })
  assert(loopPending.status === 'pending', 'Review loop did not return compact pending standby on timeout.')
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
  assert(directReviewHtml.includes(initialPlan.goal), 'Direct review route did not include the created plan goal.')

  const planListResponse = await fetch(`${baseUrl}/plans?query=${encodeURIComponent(planId)}`)
  assert(planListResponse.ok, `Filtered plan list route returned ${planListResponse.status}.`)
  const planListHtml = await planListResponse.text()
  assert(planListHtml.includes(planId), 'Plan list did not discover the created review-ready plan.')
  assert(planListHtml.includes(initialPlan.goal), 'Plan list did not include the created plan goal.')
  assert(planListHtml.includes('awaiting plan review'), 'Plan list did not show the created plan lifecycle status.')

  const firstRead = await callTool('plan_read', { planId })
  const firstHash = firstRead.contentHash as string
  assert(firstHash.startsWith('sha256:'), 'Plan read did not return a content hash.')
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

  await callTool('plan_task_update', {
    planId,
    taskId: 'validate-mcp',
    status: 'implemented',
    detail: 'MCP stdio call reached the application service.',
  })
  const delivered = await callTool('plan_events_read', { planId, afterSequence: 0 })
  const deliveredEvents = delivered.events as Array<{ type: string; sequence: number }>
  const taskEvent = deliveredEvents.find(event => event.type === 'task_updated')
  assert(taskEvent, 'Task update event was not delivered.')
  const redelivered = await callTool('plan_events_read', { planId, afterSequence: taskEvent.sequence - 1 })
  assert(
    (redelivered.events as Array<{ sequence: number }>).some(event => event.sequence === taskEvent.sequence),
    'Unacknowledged event was not redelivered.',
  )
  await callTool('plan_event_acknowledge', { planId, sequence: taskEvent.sequence })
  await callTool('plan_event_acknowledge', { planId, sequence: taskEvent.sequence })
  const afterAck = await callTool('plan_events_read', { planId, afterSequence: taskEvent.sequence - 1 })
  assert(
    !(afterAck.events as Array<{ sequence: number }>).some(event => event.sequence === taskEvent.sequence),
    'Acknowledged event was delivered again.',
  )

  const revisedPlan = { ...initialPlan, revision: 2, goal: 'Validate and approve the MCP bridge end to end' }
  const revised = await callTool('plan_revise', { planId, expectedHash: firstHash, plan: revisedPlan })
  const revisedHash = revised.contentHash as string
  assert(revisedHash !== firstHash, 'Plan revision did not change the content hash.')

  const approvedPlan = { ...revisedPlan, revision: 3, lifecycle: 'plan_approved' }
  const approved = await callTool('plan_revise', { planId, expectedHash: revisedHash, plan: approvedPlan })
  const approvedHash = approved.contentHash as string
  await approveCurrentPlan(3, approvedHash)

  const approval = await callTool('plan_wait_for_approval', { planId, afterSequence: 0 })
  assert(
    approval.nextRequiredAgentBehavior === 'start_validation_preparation',
    'Approval response did not require validation preparation.',
  )
  assert(approval.status === 'approved', `Approval wait did not observe plan approval: ${JSON.stringify(approval)}`)
  assert(approval.lifecycle === 'plan_approved', 'Approval wait did not preserve the approved lifecycle.')
  assert(approval.contentHash === approvedHash, 'Approval wait did not return the current approved hash.')

  const started = await callTool('plan_start', { planId })
  const startedPlan = started.plan as { lifecycle: string }
  assert(startedPlan.lifecycle === 'preparing_validations', 'Approved plan did not start validation preparation.')

  const storedPlan = parseYaml(await fs.readFile(planPathFor(planId), 'utf8')) as { lifecycle: string }
  assert(storedPlan.lifecycle === 'preparing_validations', 'Started lifecycle was not persisted.')
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
  if (appServer && appServer.exitCode === null) {
    appServer.kill('SIGTERM')
    await new Promise(resolve => appServer!.once('exit', resolve))
  }
  await fs.rm(planPathFor(planId), { force: true })
  await fs.rm(reviewPathFor(planId), { force: true })
  if (explicitTargetPlanId) {
    await fs.rm(planPathFor(explicitTargetPlanId), { force: true })
    await fs.rm(reviewPathFor(explicitTargetPlanId), { force: true })
  }
  await fs.rm(planPathFor(requestedPlanId), { force: true })
  await fs.rm(reviewPathFor(requestedPlanId), { force: true })
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
