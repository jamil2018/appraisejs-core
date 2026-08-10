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
import { assertLoopbackMcpHost } from './mcp-http-security.js'
import { runAppraiseHttpMcp, runAppraiseMcp } from './mcp.js'
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
  .option('--body-limit-bytes <bytes>', 'maximum JSON request size', String(1024 * 1024))
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
    .argument('<path>', 'target application repository path')
    .option('--display-name <name>', 'display label for the target project')
    .option('--init-git', 'initialize a main-branch Git repository when the target workspace is empty', false)
    .option('--json', 'print machine-readable JSON', false),
).action(
  async (projectPath: string, options: OnlineOptions & { displayName?: string; initGit: boolean; json: boolean }) => {
    await runCommand(
      async () =>
        printJson(
          await (await onlineClient(options)).addTargetProject(projectPath, options.displayName, options.initGit),
        ),
      options.json,
    )
  },
)

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
    .option('--json', 'print the exact machine-readable diagnostic DTO', false),
).action(async (options: OnlineOptions & { runId: string; json: boolean }) => {
  await runCommand(async () => {
    const client = await onlineClient(options)
    const outcome = await runTestRunDiagnose(options, {
      diagnose: runId => client.diagnoseTestRun(runId) as Promise<Record<string, unknown>>,
      write: value => console.log(value),
    })
    if (outcome.exitCode) process.exitCode = outcome.exitCode
  }, options.json)
})

program.parseAsync(process.argv).catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
