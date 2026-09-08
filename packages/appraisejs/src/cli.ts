#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { expectedAgentCapabilities } from './agent-setup-capabilities.js'
import {
  CoordinatorRequestError,
  coordinatorRequestError,
  createCoordinatorClient,
  createLocalCoordinatorFailure,
} from './coordinator-client.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { assertLoopbackMcpHost, DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES } from './mcp-http-security.js'
import { runAppraiseHttpMcp, runAppraiseMcp } from './mcp.js'
import { callLocalMcpTool, parseMcpToolArguments, unwrapMcpToolResult } from './mcp-call.js'
import { ensureLocalProjectIdentity } from './project-identity.js'
import { runTestRunDiagnose } from './test-run-diagnose-cli.js'

const program = new Command()
const staleAgentCapabilityRecovery = [
  'Restart or reconnect the MCP/agent client.',
  'Restart the Appraise MCP sidecar.',
  'Rerun npm run setup:mcp and npm run setup:agent, then call project_diagnostic.',
]
const toolsNotVisibleRecovery = [
  'Register the Streamable HTTP endpoint or the stdio command with the agent client.',
  'Restart or reconnect the client after changing MCP registration.',
  'Run appraisejs agent setup --json and inspect httpMcpEndpoint, stdioFallback, and expectedCapabilities.',
  'Verify HTTP endpoint reachability after reconnect.',
  'If native tools still are not visible, stop and ask the user to reconnect or restart the client.',
]

program.name('appraisejs').description('AppraiseJS command line tools').showHelpAfterError()

type OnlineOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

function resolveMcpEndpoint(options?: { host?: string; port?: string; path?: string }): string {
  const host = options?.host ?? process.env.APPRAISE_MCP_HOST ?? '127.0.0.1'
  assertLoopbackMcpHost(host)
  const port = options?.port ?? process.env.APPRAISE_MCP_PORT ?? '3010'
  const endpointPath = options?.path ?? process.env.APPRAISE_MCP_PATH ?? '/mcp'
  return `http://${host}:${port}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`
}

function addOnlineOptions(command: Command): Command {
  return command
    .option('--cwd <path>', 'Appraise project directory', process.cwd())
    .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
    .option(
      '--coordinator-id <id>',
      'stable coordinator identity',
      process.env.APPRAISE_COORDINATOR_ID ?? 'coordinator',
    )
}

async function onlineClient(options: OnlineOptions) {
  return createCoordinatorClient({ ...options, cwd: path.resolve(options.cwd) })
}

const locatorGraph = program.command('locator-graph').description('Query the read-only Appraise locator graph')
addOnlineOptions(
  locatorGraph
    .command('query')
    .requiredOption('--target <path-or-fingerprint>')
    .requiredOption('--journey-id <id>')
    .requiredOption('--from-id <id>')
    .option('--relation <relation>')
    .option('--to-type <type>')
    .option('--cursor <cursor>')
    .option('--limit <number>', 'bounded page size', '25')
    .option('--depth <number>', 'bounded traversal depth', '1')
    .option('--json'),
).action(async options =>
  runCommand(async () => {
    const client = await onlineClient(options)
    printJson(
      await client.queryLocatorGraph({
        target: options.target,
        journeyId: options.journeyId,
        fromId: options.fromId,
        relation: options.relation,
        toType: options.toType,
        cursor: options.cursor,
        limit: Number(options.limit),
        depth: Number(options.depth),
      }),
    )
  }, Boolean(options.json)),
)

const collaboration = program
  .command('collaboration')
  .description('Operate the project-bound repository collaboration control plane')

addOnlineOptions(
  collaboration
    .command('status')
    .requiredOption('--target <path-or-fingerprint>')
    .option('--json', 'print machine-readable JSON', false),
).action(async (options: OnlineOptions & { target: string; json: boolean }) => {
  await runCommand(
    async () => printJson(await (await onlineClient(options)).collaborationStatus(options.target)),
    options.json,
  )
})

function addCollaborationJsonCommand(
  name: string,
  description: string,
  call: (
    client: Awaited<ReturnType<typeof createCoordinatorClient>>,
    input: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  addOnlineOptions(
    collaboration
      .command(name)
      .description(description)
      .requiredOption('--input-json <json>', 'exact collaboration request object')
      .option('--json', 'print machine-readable JSON', false),
  ).action(async (options: OnlineOptions & { inputJson: string; json: boolean }) => {
    await runCommand(
      async () => printJson(await call(await onlineClient(options), parseMcpToolArguments(options.inputJson))),
      options.json,
    )
  })
}

addCollaborationJsonCommand('connect', 'Connect a registered local target to its repository.', (client, input) =>
  client.collaborationConnect(input),
)
addCollaborationJsonCommand('policy-update', 'Update explicit collaboration permissions.', (client, input) =>
  client.collaborationPolicyUpdate(input),
)
addCollaborationJsonCommand(
  'prepare',
  'Prepare a durable collaboration operation or isolated divergent review.',
  (client, input) => client.collaborationPrepare(input),
)
addCollaborationJsonCommand('get', 'Read a target-scoped collaboration operation.', (client, input) =>
  client.collaborationGet(input),
)
addCollaborationJsonCommand(
  'resolution-propose',
  'Submit a complete divergent reconciliation proposal.',
  (client, input) => client.collaborationResolutionPropose(input),
)
addCollaborationJsonCommand('decide', 'Record reviewed collaboration resolutions.', (client, input) =>
  client.collaborationDecide(input),
)
addCollaborationJsonCommand(
  'execute',
  'Execute an exact prepared database operation or fixed Git step.',
  (client, input) => client.collaborationExecute(input),
)
addCollaborationJsonCommand('undo-prepare', 'Prepare a guarded inverse operation.', (client, input) =>
  client.collaborationUndoPrepare(input),
)
addCollaborationJsonCommand('worker-register', 'Register a collaboration worker session.', (client, input) =>
  client.collaborationWorkerRegister(input),
)
addCollaborationJsonCommand('work-claim', 'Claim collaboration work with a worker session.', (client, input) =>
  client.collaborationWorkClaim(input),
)
addCollaborationJsonCommand('work-heartbeat', 'Renew a collaboration work lease.', (client, input) =>
  client.collaborationWorkHeartbeat(input),
)
addCollaborationJsonCommand('work-complete', 'Submit a structured worker proposal.', (client, input) =>
  client.collaborationWorkComplete(input),
)
addCollaborationJsonCommand('handoff-redeem', 'Redeem a one-time collaboration handoff ticket.', (client, input) =>
  client.collaborationHandoffRedeem(input),
)

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function printErrorJson(error: unknown): void {
  if (error instanceof CoordinatorRequestError) {
    printJson(coordinatorRequestError(error))
    return
  }
  printJson(
    createLocalCoordinatorFailure(
      'cli',
      'appraise_runtime_defect',
      error instanceof Error ? error.message : String(error),
    ),
  )
}

async function runCommand(action: () => Promise<void>, json: boolean): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (!json) throw error
    printErrorJson(error)
    process.exitCode = 1
  }
}

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Expected --port to be an integer between 1 and 65535, received "${value}".`)
  }
  return port
}

program
  .command('mcp')
  .description('Run the AppraiseJS MCP server over stdio')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--coordinator-id <id>', 'stable coordinator identity', process.env.APPRAISE_COORDINATOR_ID ?? 'coordinator')
  .action(async (options: { cwd: string; baseUrl: string; coordinatorId: string }) => {
    try {
      await runAppraiseMcp({
        cwd: path.resolve(options.cwd),
        baseUrl: options.baseUrl,
        coordinatorId: options.coordinatorId,
      })
    } catch (error) {
      console.error(formatMcpBootstrapError(error))
      process.exitCode = 1
    }
  })

program
  .command('mcp-http')
  .description('Run the AppraiseJS MCP server over Streamable HTTP')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--coordinator-id <id>', 'stable coordinator identity', process.env.APPRAISE_COORDINATOR_ID ?? 'coordinator')
  .option('--host <host>', 'HTTP bind host', process.env.APPRAISE_MCP_HOST ?? '127.0.0.1')
  .option('--port <port>', 'HTTP bind port', process.env.APPRAISE_MCP_PORT ?? '3010')
  .option('--path <path>', 'HTTP MCP endpoint path', process.env.APPRAISE_MCP_PATH ?? '/mcp')
  .option('--body-limit-bytes <bytes>', 'maximum JSON request size', String(DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES))
  .option('--max-concurrency <count>', 'maximum concurrent MCP requests', '16')
  .action(
    async (options: {
      cwd: string
      baseUrl: string
      coordinatorId: string
      host: string
      port: string
      path: string
      bodyLimitBytes: string
      maxConcurrency: string
    }) => {
      try {
        await runAppraiseHttpMcp({
          cwd: path.resolve(options.cwd),
          baseUrl: options.baseUrl,
          coordinatorId: options.coordinatorId,
          host: options.host,
          port: parsePort(options.port),
          path: options.path.startsWith('/') ? options.path : `/${options.path}`,
          bodyLimitBytes: parsePositiveInteger(options.bodyLimitBytes, '--body-limit-bytes'),
          maxConcurrency: parsePositiveInteger(options.maxConcurrency, '--max-concurrency'),
        })
      } catch (error) {
        console.error(formatMcpBootstrapError(error))
        process.exitCode = 1
      }
    },
  )

program
  .command('mcp-call')
  .description('Call one tool through the authenticated local HTTP MCP bridge')
  .argument('<tool>', 'MCP tool name')
  .option('--input-json <json>', 'tool arguments as a JSON object', '{}')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--endpoint <url>', 'local AppraiseJS MCP endpoint')
  .action(async (tool: string, options: { inputJson: string; cwd: string; endpoint?: string }) =>
    runCommand(async () => {
      printJson(
        unwrapMcpToolResult(
          await callLocalMcpTool({
            cwd: path.resolve(options.cwd),
            endpoint: options.endpoint ?? resolveMcpEndpoint(),
            tool,
            arguments: parseMcpToolArguments(options.inputJson),
          }),
        ),
      )
    }, true),
  )

function parsePositiveInteger(value: string, option: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive integer; received "${value}".`)
  }
  return parsed
}

program
  .command('doctor')
  .description('Diagnose local AppraiseJS CLI and MCP prerequisites')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--json', 'print machine-readable JSON', false)
  .action(async (options: { cwd: string; baseUrl: string; json: boolean }) => {
    const result = await diagnoseProject({ cwd: options.cwd, baseUrl: options.baseUrl })
    console.log(
      options.json
        ? JSON.stringify(result, null, 2)
        : result.checks.map(check => `${check.status}: ${check.message}`).join('\n'),
    )
    if (!result.ok) process.exitCode = 1
  })

const agent = program.command('agent').description('Set up coding-agent access to AppraiseJS')

agent
  .command('setup')
  .description('Print MCP registration and restart guidance for coding agents')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--host <host>', 'HTTP MCP bind host', process.env.APPRAISE_MCP_HOST ?? '127.0.0.1')
  .option('--port <port>', 'HTTP MCP port', process.env.APPRAISE_MCP_PORT ?? '3010')
  .option('--path <path>', 'HTTP MCP endpoint path', process.env.APPRAISE_MCP_PATH ?? '/mcp')
  .option('--json', 'print machine-readable JSON', false)
  .action(
    async (options: { cwd: string; baseUrl: string; host: string; port: string; path: string; json: boolean }) => {
      const cwd = path.resolve(options.cwd)
      const endpoint = resolveMcpEndpoint(options)
      const { identity } = await ensureLocalProjectIdentity(cwd)
      const stdio = { command: 'appraisejs', args: ['mcp', '--cwd', cwd, '--base-url', options.baseUrl] }
      const setup = {
        httpMcpEndpoint: endpoint,
        httpMcp: { url: endpoint, headers: { Authorization: `Bearer ${identity.token}` } },
        stdioFallback: stdio,
        currentBoundHubProject: cwd,
        requiredClientAction: 'Restart or reconnect the MCP/agent client after changing registration.',
        expectedCapabilities: expectedAgentCapabilities,
        staleCapabilityRecovery: staleAgentCapabilityRecovery,
        toolsNotVisibleRecovery,
        healthCheck: 'Run appraisejs doctor --json, then call MCP project_diagnostic after reconnecting.',
      }
      if (options.json) {
        printJson(setup)
        return
      }
      console.log('AppraiseJS agent setup')
      console.log(`\nHTTP MCP endpoint:\n${setup.httpMcpEndpoint}`)
      console.log('Authorization header: configured in `appraisejs agent setup --json` output (token hidden here).')
      console.log('\nStdio fallback command config:')
      console.log(JSON.stringify({ appraisejs: setup.stdioFallback }, null, 2))
      console.log(`\nCurrent bound hub project:\n${setup.currentBoundHubProject}`)
      console.log('\nExpected MCP capabilities after reconnect:')
      console.log(JSON.stringify(setup.expectedCapabilities, null, 2))
      console.log(`\n${setup.requiredClientAction}`)
      console.log(setup.healthCheck)
      console.log('\nIf expected capabilities are missing:')
      for (const step of setup.staleCapabilityRecovery) console.log(`- ${step}`)
      console.log('\nIf setup text is visible but native MCP tools are not:')
      for (const step of setup.toolsNotVisibleRecovery) console.log(`- ${step}`)
    },
  )

const project = program.command('project').description('Manage repos attached to the local AppraiseJS hub')

addOnlineOptions(
  project
    .command('add')
    .argument('<target>', 'target application workspace path or HTTP(S) URL')
    .option('--display-name <name>', 'display label for the target project')
    .option('--init-git', 'initialize a main-branch Git repository when the target workspace is empty', false)
    .option('--json', 'print machine-readable JSON', false),
).action(async (target: string, options: OnlineOptions & { displayName?: string; initGit: boolean; json: boolean }) => {
  const isRemoteTarget = /^https?:\/\//i.test(target)
  await runCommand(
    async () =>
      printJson(
        await (
          await onlineClient(options)
        ).addTargetProject(
          isRemoteTarget
            ? { url: target, ...(options.displayName ? { displayName: options.displayName } : {}) }
            : {
                path: target,
                ...(options.displayName ? { displayName: options.displayName } : {}),
                ...(options.initGit ? { initializeGit: true } : {}),
              },
        ),
      ),
    options.json,
  )
})

addOnlineOptions(project.command('list').option('--json', 'print machine-readable JSON', false)).action(
  async (options: OnlineOptions & { json: boolean }) => {
    await runCommand(async () => printJson(await (await onlineClient(options)).listTargetProjects()), options.json)
  },
)

const testRun = program.command('test-run').description('Inspect managed Appraise test runs')

addOnlineOptions(
  testRun
    .command('diagnose')
    .requiredOption('--run-id <id>', 'managed TestRun public run id')
    .requiredOption('--target <target>', 'registered target reference')
    .option('--json', 'print the exact machine-readable diagnostic DTO', false),
).action(async (options: OnlineOptions & { runId: string; target: string; json: boolean }) => {
  await runCommand(async () => {
    const client = await onlineClient(options)
    const outcome = await runTestRunDiagnose(options, {
      diagnose: runId => client.diagnoseTestRun(runId, options.target) as Promise<Record<string, unknown>>,
      write: value => console.log(value),
    })
    if (outcome.exitCode) process.exitCode = outcome.exitCode
  }, options.json)
})

program.parseAsync(process.argv).catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
