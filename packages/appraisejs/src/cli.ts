#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { Command } from 'commander'
import { addStepBySlug } from './add-step.js'
import {
  CoordinatorRequestError,
  coordinatorRequestErrorEnvelope,
  createCoordinatorClient,
} from './coordinator-client.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { runAppraiseHttpMcp, runAppraiseMcp } from './mcp.js'
import { createOfflineDraft, readValidatedPlan, validatePlanFile } from './plan-file.js'
import { resolvePlanSource } from './plan-source.js'
import { runTestRunDiagnose } from './test-run-diagnose-cli.js'

const program = new Command()
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedAgentCapabilities = {
  tools: [
    'action_categories_list',
    'actions_list',
    'actions_read',
    'planning_session_create',
    'plan_review_loop',
    'validation_publish',
    'validation_review_loop',
    'baseline_start',
    'baseline_reconcile',
    'baseline_accept',
    'implementation_start',
    'delegated_validation_ast_submit',
    'validation_ast_check',
    'validation_ast_preview',
    'validation_ast_compile',
    'validation_ast_extension_policy',
    'validation_ast_extension_reviews',
    'legacy_automation_import_preview',
  ],
  resources: [
    'appraise://actions/catalog',
    'appraise://actions/category/{categoryId}',
    'appraise://agent-guide',
    'appraise://workflow/planning',
    'appraise://workflow/validation-preparation',
    'appraise://workflow/standby',
    'appraise://contracts/validation-ast',
    'appraise://contracts/delegated-authorization',
  ],
}
const staleAgentCapabilityRecovery = [
  'Restart or reconnect the MCP/agent client.',
  'Restart the Appraise MCP sidecar.',
  'Rerun npm run setup:mcp and npm run setup:agent, then call project_diagnostic.',
]
const toolsNotVisibleRecovery = [
  'Register the Streamable HTTP endpoint or the stdio command with the agent client.',
  'Restart or reconnect the client after changing MCP registration.',
  'Run appraisejs agent setup --json and inspect httpMcpEndpoint, stdioFallback, and expectedCapabilities.',
  'Verify HTTP endpoint reachability, then read appraise://agent-guide after reconnect.',
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
    printJson({ ok: false, ...coordinatorRequestErrorEnvelope(error) })
    return
  }
  printJson({
    ok: false,
    code: 'command-failed',
    message: error instanceof Error ? error.message : String(error),
  })
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
  .action(
    async (options: {
      cwd: string
      baseUrl: string
      coordinatorId: string
      host: string
      port: string
      path: string
    }) => {
      try {
        await runAppraiseHttpMcp({
          cwd: path.resolve(options.cwd),
          baseUrl: options.baseUrl,
          coordinatorId: options.coordinatorId,
          host: options.host,
          port: parsePort(options.port),
          path: options.path.startsWith('/') ? options.path : `/${options.path}`,
        })
      } catch (error) {
        console.error(formatMcpBootstrapError(error))
        process.exitCode = 1
      }
    },
  )

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
  .description('Print MCP, skill, restart, and standby guidance for coding agents')
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
      const stdio = { command: 'appraisejs', args: ['mcp', '--cwd', cwd, '--base-url', options.baseUrl] }
      const skillPath = path.join(packageRoot, 'agent-skills', 'appraise-planning-standby')
      const setup = {
        httpMcpEndpoint: endpoint,
        stdioFallback: stdio,
        currentBoundHubProject: cwd,
        globalSkill: {
          status: 'manual_install_required',
          path: skillPath,
          instructions: `Install or point the agent client at ${skillPath}.`,
        },
        requiredClientAction: 'Restart or reconnect the MCP/agent client after changing registration.',
        expectedCapabilities: expectedAgentCapabilities,
        staleCapabilityRecovery: staleAgentCapabilityRecovery,
        toolsNotVisibleRecovery,
        healthCheck: 'Run appraisejs doctor --json, then call MCP project_diagnostic after reconnecting.',
        standbyWarning:
          'Prefer plan_review_loop when available. Otherwise keep an active bounded plan_wait_for_approval loop after plan_review_ready. Use compact continuation only for long-review or host-limit fallback; pending review or approval is not completion.',
      }
      if (options.json) {
        printJson(setup)
        return
      }
      console.log('AppraiseJS agent setup')
      console.log(`\nHTTP MCP endpoint:\n${setup.httpMcpEndpoint}`)
      console.log('\nStdio fallback command config:')
      console.log(JSON.stringify({ appraisejs: setup.stdioFallback }, null, 2))
      console.log(`\nCurrent bound hub project:\n${setup.currentBoundHubProject}`)
      console.log(`\nGlobal skill/plugin guidance:\n${setup.globalSkill.instructions}`)
      console.log('\nExpected MCP capabilities after reconnect:')
      console.log(JSON.stringify(setup.expectedCapabilities, null, 2))
      console.log(`\n${setup.requiredClientAction}`)
      console.log(setup.healthCheck)
      console.log('\nIf expected capabilities are missing:')
      for (const step of setup.staleCapabilityRecovery) console.log(`- ${step}`)
      console.log('\nIf setup text is visible but native MCP tools are not:')
      for (const step of setup.toolsNotVisibleRecovery) console.log(`- ${step}`)
      console.log(setup.standbyWarning)
    },
  )

const plan = program.command('plan').description('Validate and coordinate AppraiseJS plans')

plan
  .command('validate-file')
  .argument('<file>', 'plan YAML or JSON file')
  .option('--json', 'print machine-readable JSON', false)
  .action(async (file: string, options: { json: boolean }) => {
    await runCommand(async () => {
      const result = await validatePlanFile(file)
      console.log(
        options.json ? JSON.stringify(result, null, 2) : `Valid plan ${result.planId} revision ${result.revision}.`,
      )
    }, options.json)
  })

plan
  .command('create')
  .requiredOption('--file <path>', 'plan YAML or JSON file')
  .option('--target <project>', 'registered target project id, fingerprint, display name, or path')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--coordinator-id <id>', 'stable coordinator identity', process.env.APPRAISE_COORDINATOR_ID ?? 'coordinator')
  .option('--offline', 'create a local draft without lifecycle registration', false)
  .option('--allow-external-plan-file', 'allow a plan file outside --cwd', false)
  .option('--json', 'print machine-readable JSON', false)
  .action(
    async (
      options: OnlineOptions & {
        file: string
        target?: string
        offline: boolean
        allowExternalPlanFile: boolean
        json: boolean
      },
    ) => {
      await runCommand(async () => {
        if (options.offline) return printJson(await createOfflineDraft(options.file, options.cwd))
        const source = await resolvePlanSource(options.cwd, options.file, options.allowExternalPlanFile)
        const client = await onlineClient(options)
        const planArtifact = await readValidatedPlan(source.path)
        printJson(
          options.target
            ? await client.createPlanForTarget(planArtifact, options.target, source)
            : await client.createPlan(planArtifact, source),
        )
      }, options.json)
    },
  )

const project = program.command('project').description('Manage repos attached to the local AppraiseJS hub')

addOnlineOptions(
  project
    .command('add')
    .argument('<path>', 'target application repository path')
    .option('--display-name <name>', 'display label for the target project')
    .option('--json', 'print machine-readable JSON', false),
).action(async (projectPath: string, options: OnlineOptions & { displayName?: string; json: boolean }) => {
  await runCommand(
    async () => printJson(await (await onlineClient(options)).addTargetProject(projectPath, options.displayName)),
    options.json,
  )
})

addOnlineOptions(project.command('list').option('--json', 'print machine-readable JSON', false)).action(
  async (options: OnlineOptions & { json: boolean }) => {
    await runCommand(async () => printJson(await (await onlineClient(options)).listTargetProjects()), options.json)
  },
)

const test = program.command('test').description('Run repo-owned tests from an attached target project')
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

addOnlineOptions(
  test
    .command('run')
    .requiredOption('--target <project>', 'registered target project id, fingerprint, display name, or path')
    .requiredOption('--environment <id>', 'Appraise environment id to expose as ENVIRONMENT')
    .option('--name <name>', 'test run display name')
    .option('--tags <expression>', 'Cucumber tag expression')
    .option('--workers <count>', 'Cucumber parallel worker count')
    .option('--browser <browser>', 'browser engine: CHROMIUM, FIREFOX, or WEBKIT', 'CHROMIUM')
    .option('--json', 'print machine-readable JSON', false),
).action(
  async (
    options: OnlineOptions & {
      target: string
      environment: string
      name?: string
      tags?: string
      workers?: string
      browser: string
      json: boolean
    },
  ) => {
    await runCommand(async () => {
      const testWorkersCount = options.workers === undefined ? undefined : Number(options.workers)
      if (testWorkersCount !== undefined && (!Number.isInteger(testWorkersCount) || testWorkersCount < 1)) {
        throw new Error(`Expected --workers to be a positive integer, received "${options.workers}".`)
      }
      printJson(
        await (
          await onlineClient(options)
        ).runTargetTests({
          target: options.target,
          environmentId: options.environment,
          name: options.name,
          tagExpression: options.tags,
          testWorkersCount,
          browserEngine: options.browser,
        }),
      )
    }, options.json)
  },
)

addOnlineOptions(
  plan
    .command('status')
    .argument('<plan-id>')
    .description('Read current online plan status')
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { json: boolean }) => {
  await runCommand(async () => printJson(await (await onlineClient(options)).readPlan(planId)), options.json)
})

addOnlineOptions(
  plan
    .command('revise')
    .argument('<plan-id>')
    .requiredOption('--file <path>', 'revised plan file')
    .requiredOption('--expected-hash <hash>', 'exact current plan content hash')
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { file: string; expectedHash: string; json: boolean }) => {
  await runCommand(async () => {
    const client = await onlineClient(options)
    printJson(
      await client.revisePlan(planId, {
        expectedHash: options.expectedHash,
        plan: await readValidatedPlan(options.file),
      }),
    )
  }, options.json)
})

addOnlineOptions(
  plan
    .command('events')
    .argument('<plan-id>')
    .option('--after <sequence>', 'read events after sequence', '0')
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { after: string; json: boolean }) => {
  await runCommand(
    async () => printJson(await (await onlineClient(options)).readEvents(planId, Number(options.after))),
    options.json,
  )
})

addOnlineOptions(
  plan
    .command('ack-event')
    .argument('<plan-id>')
    .requiredOption('--sequence <number>', 'event sequence to acknowledge')
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { sequence: string; json: boolean }) => {
  await runCommand(
    async () => printJson(await (await onlineClient(options)).acknowledgeEvent(planId, Number(options.sequence))),
    options.json,
  )
})

addOnlineOptions(
  plan
    .command('reconnect')
    .argument('<plan-id>')
    .requiredOption('--connection-id <id>', 'previous coordinator connection ID')
    .option('--after <sequence>', 'read pending events after sequence', '0')
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { connectionId: string; after: string; json: boolean }) => {
  await runCommand(
    async () =>
      printJson(await (await onlineClient(options)).reconnect(planId, options.connectionId, Number(options.after))),
    options.json,
  )
})

addOnlineOptions(
  plan
    .command('register')
    .argument('<plan-id>')
    .option('--takeover-approved', 'confirm user-approved takeover', false)
    .option('--json', 'print machine-readable JSON', false),
).action(async (planId: string, options: OnlineOptions & { takeoverApproved: boolean; json: boolean }) => {
  await runCommand(
    async () => printJson(await (await onlineClient(options)).register(planId, options.takeoverApproved)),
    options.json,
  )
})

const validation = program.command('validation').description('Publish and submit validation review data')

addOnlineOptions(
  validation
    .command('submit-delegated-ast')
    .requiredOption('--submission <path>', 'Validation AST submission JSON')
    .requiredOption('--receipt <path>', 'delegated authorization receipt JSON')
    .option('--json', 'print machine-readable JSON', true),
).action(async (options: OnlineOptions & { submission: string; receipt: string; json: boolean }) => {
  await runCommand(async () => {
    const fs = await import('node:fs/promises')
    const [submission, receipt] = await Promise.all([
      fs.readFile(path.resolve(options.submission), 'utf8').then(JSON.parse),
      fs.readFile(path.resolve(options.receipt), 'utf8').then(JSON.parse),
    ])
    printJson(await (await onlineClient(options)).submitDelegatedValidationAst(submission, receipt))
  }, options.json)
})

addOnlineOptions(
  validation.command('publish').argument('<plan-id>').requiredOption('--file <path>', 'validation artifact JSON file'),
).action(async (planId: string, options: OnlineOptions & { file: string }) => {
  const value = JSON.parse(
    await (await import('node:fs/promises')).readFile(path.resolve(options.file), 'utf8'),
  ) as unknown
  printJson(await (await onlineClient(options)).publishValidation(planId, value))
})

addOnlineOptions(validation.command('submit').argument('<plan-id>')).action(
  async (planId: string, options: OnlineOptions) =>
    printJson(await (await onlineClient(options)).submitValidation(planId)),
)

addOnlineOptions(
  validation
    .command('ast')
    .argument('<phase>', 'check, preview, or compile')
    .argument('<plan-id>')
    .requiredOption('--submission <path>')
    .option('--receipt-hash <hash>')
    .option('--json', 'print machine-readable JSON', true),
).action(
  async (
    phase: string,
    planId: string,
    options: OnlineOptions & { submission: string; receiptHash?: string; json: boolean },
  ) => {
    await runCommand(async () => {
      const submission = JSON.parse(
        await (await import('node:fs/promises')).readFile(path.resolve(options.submission), 'utf8'),
      )
      const client = await onlineClient(options)
      if (phase === 'check') return printJson(await client.checkValidationAst(planId, submission))
      if (phase === 'preview') return printJson(await client.previewValidationAst(planId, submission))
      if (phase === 'compile' && options.receiptHash)
        return printJson(await client.compileValidationAst(planId, submission, options.receiptHash))
      throw new Error('Compile requires --receipt-hash; phase must be check, preview, or compile.')
    }, options.json)
  },
)

addOnlineOptions(validation.command('ast-policy').argument('<plan-id>')).action(
  async (planId: string, options: OnlineOptions) =>
    printJson(await (await onlineClient(options)).readValidationAstExtensionPolicy(planId)),
)

addOnlineOptions(validation.command('ast-reviews').argument('<plan-id>').option('--operation-id <id>')).action(
  async (planId: string, options: OnlineOptions & { operationId?: string }) =>
    printJson(await (await onlineClient(options)).readValidationAstExtensionReviews(planId, options.operationId)),
)

addOnlineOptions(
  program.command('completion').argument('<plan-id>').description('Read final completion review'),
).action(async (planId: string, options: OnlineOptions) =>
  printJson(await (await onlineClient(options)).completionReview(planId)),
)

const actions = program.command('actions').description('Discover versioned Appraise runtime actions')
addOnlineOptions(actions.command('categories').option('--parent <id>').option('--known-hash <hash>')).action(
  async (options: OnlineOptions & { parent?: string; knownHash?: string }) =>
    printJson(await (await onlineClient(options)).listActionCategories(options.parent, options.knownHash)),
)
addOnlineOptions(
  actions
    .command('list')
    .option('--category <id>')
    .option('--capability <id>')
    .option('--input-type <type>')
    .option('--runtime <runtime>')
    .option('--deprecated <boolean>')
    .option('--id-prefix <prefix>')
    .option('--cursor <number>')
    .option('--limit <number>'),
).action(async (options: OnlineOptions & Record<string, string | undefined>) =>
  printJson(
    await (
      await onlineClient(options)
    ).listActions({
      categoryId: options.category,
      capability: options.capability,
      inputType: options.inputType,
      runtime: options.runtime,
      deprecated: options.deprecated,
      idPrefix: options.idPrefix,
      cursor: options.cursor,
      limit: options.limit,
    }),
  ),
)
addOnlineOptions(actions.command('read').argument('<refs...>', 'action-id@version')).action(
  async (refs: string[], options: OnlineOptions) =>
    printJson(
      await (
        await onlineClient(options)
      ).readActions(
        refs.map(ref => {
          const [id, version] = ref.split('@')
          return { id: id!, ...(version ? { version } : {}) }
        }),
      ),
    ),
)

program
  .command('add')
  .description('Install AppraiseJS catalog assets into an existing project')
  .command('step')
  .argument('<group-slug/step-slug>', 'registry step slug to install')
  .option('--cwd <path>', 'target Appraise project directory', process.cwd())
  .option('--overwrite', 'replace an existing step with the same signature', false)
  .option('--dry-run', 'print the intended install actions without writing files or syncing', false)
  .option('--registry-url <url>', 'override the bundled registry with a manifest URL or base directory URL')
  .option('--branch <ref>', 'registry branch to fetch from GitHub instead of using the bundled registry', 'main')
  .action(
    async (
      slug: string,
      options: { cwd: string; overwrite: boolean; dryRun: boolean; registryUrl?: string; branch: string },
      command: Command,
    ) => {
      const useBundledRegistry = !options.registryUrl && command.getOptionValueSource('branch') !== 'cli'

      try {
        await addStepBySlug(slug, {
          cwd: path.resolve(options.cwd),
          overwrite: options.overwrite,
          dryRun: options.dryRun,
          registryUrl: options.registryUrl,
          branch: options.branch,
          useBundledRegistry,
        })
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        process.exit(1)
      }
    },
  )

program.parseAsync(process.argv).catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
