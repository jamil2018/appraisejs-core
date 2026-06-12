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
const planId = `mcp-e2e-${Date.now()}`
const planPath = path.join(repoRoot, 'appraise', 'plans', `${planId}.yaml`)
const reviewPath = path.join(repoRoot, 'appraise', 'plans', 'reviews', `${planId}.review.yaml`)
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

async function approveCurrentPlan(contentHash: string) {
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
          revision: 2,
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

  appServer = spawn('npm', ['run', 'dev', '--', '-H', '127.0.0.1', '-p', String(port)], {
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
    'coordinator_heartbeat',
    'coordinator_register',
    'implementation_checkpoint',
    'implementation_complete',
    'implementation_completion_review',
    'implementation_control',
    'implementation_feedback',
    'implementation_task_update',
    'plan_create',
    'plan_event_acknowledge',
    'plan_events_read',
    'plan_read',
    'plan_revise',
    'plan_start',
    'plan_task_update',
    'plan_wait_for_review',
    'project_diagnostic',
    'validation_decide',
    'validation_file_approve',
    'validation_publish',
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
  const templates = await client.listResourceTemplates()
  assert(
    templates.resourceTemplates.some(template => template.uriTemplate === 'appraise://plans/{planId}'),
    'Plan resource template is missing.',
  )
  const projectResource = await client.readResource({ uri: 'appraise://project' })
  assert(projectResource.contents[0]?.text?.includes('projectFingerprint'), 'Project resource is unreadable.')
  const diagnostic = await callTool('project_diagnostic', {})
  assert(diagnostic.ok === true, `Project diagnostic failed: ${JSON.stringify(diagnostic)}`)
  assert(diagnostic.contractVersion === '1', 'Project diagnostic did not return the contract version.')

  const initialPlan = {
    version: '1',
    planId,
    revision: 1,
    lifecycle: 'awaiting_plan_review',
    goal: 'Validate the MCP bridge end to end',
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
  assert(created.reviewUrl === `/plans/${planId}`, 'Plan create did not return the stable review URL.')
  const createdLinks = created.links as { appraise: string; browser: string; route: string }
  assert(createdLinks.appraise === `appraise://plans/${planId}`, 'Plan create did not return the Appraise link.')
  assert(createdLinks.browser === `${baseUrl}/plans/${planId}`, 'Plan create did not return the browser link.')

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

  const firstRead = await callTool('plan_read', { planId })
  const firstHash = firstRead.contentHash as string
  assert(firstHash.startsWith('sha256:'), 'Plan read did not return a content hash.')
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
  await approveCurrentPlan(revisedHash)
  const started = await callTool('plan_start', { planId })
  const startedPlan = started.plan as { lifecycle: string }
  assert(startedPlan.lifecycle === 'preparing_validations', 'Approved plan did not start validation preparation.')

  const storedPlan = parseYaml(await fs.readFile(planPath, 'utf8')) as { lifecycle: string }
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
  await fs.rm(planPath, { force: true })
  await fs.rm(reviewPath, { force: true })
  await fs.rm(temporaryDirectory, { recursive: true, force: true })
}
