#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { addStepBySlug } from './add-step.js'
import { createCoordinatorClient } from './coordinator-client.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { runAppraiseMcp } from './mcp.js'
import { createOfflineDraft, readValidatedPlan, validatePlanFile } from './plan-file.js'
import { resolvePlanSource } from './plan-source.js'

const program = new Command()

program.name('appraisejs').description('AppraiseJS command line tools').showHelpAfterError()

type OnlineOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
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

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
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

const plan = program.command('plan').description('Validate and coordinate AppraiseJS plans')

plan
  .command('validate-file')
  .argument('<file>', 'plan YAML or JSON file')
  .option('--json', 'print machine-readable JSON', false)
  .action(async (file: string, options: { json: boolean }) => {
    const result = await validatePlanFile(file)
    console.log(
      options.json ? JSON.stringify(result, null, 2) : `Valid plan ${result.planId} revision ${result.revision}.`,
    )
  })

plan
  .command('create')
  .requiredOption('--file <path>', 'plan YAML or JSON file')
  .option('--cwd <path>', 'Appraise project directory', process.cwd())
  .option('--base-url <url>', 'local AppraiseJS application URL', 'http://127.0.0.1:3000')
  .option('--coordinator-id <id>', 'stable coordinator identity', process.env.APPRAISE_COORDINATOR_ID ?? 'coordinator')
  .option('--offline', 'create a local draft without lifecycle registration', false)
  .option('--allow-external-plan-file', 'allow a plan file outside --cwd', false)
  .action(async (options: OnlineOptions & { file: string; offline: boolean; allowExternalPlanFile: boolean }) => {
    if (options.offline) return printJson(await createOfflineDraft(options.file, options.cwd))
    const source = await resolvePlanSource(options.cwd, options.file, options.allowExternalPlanFile)
    const client = await onlineClient(options)
    printJson(await client.createPlan(await readValidatedPlan(source.path), source))
  })

addOnlineOptions(plan.command('status').argument('<plan-id>').description('Read current online plan status')).action(
  async (planId: string, options: OnlineOptions) => printJson(await (await onlineClient(options)).readPlan(planId)),
)

addOnlineOptions(
  plan
    .command('revise')
    .argument('<plan-id>')
    .requiredOption('--file <path>', 'revised plan file')
    .requiredOption('--expected-hash <hash>', 'exact current plan content hash'),
).action(async (planId: string, options: OnlineOptions & { file: string; expectedHash: string }) => {
  const client = await onlineClient(options)
  printJson(
    await client.revisePlan(planId, {
      expectedHash: options.expectedHash,
      plan: await readValidatedPlan(options.file),
    }),
  )
})

addOnlineOptions(
  plan.command('events').argument('<plan-id>').option('--after <sequence>', 'read events after sequence', '0'),
).action(async (planId: string, options: OnlineOptions & { after: string }) => {
  printJson(await (await onlineClient(options)).readEvents(planId, Number(options.after)))
})

addOnlineOptions(
  plan
    .command('ack-event')
    .argument('<plan-id>')
    .requiredOption('--sequence <number>', 'event sequence to acknowledge'),
).action(async (planId: string, options: OnlineOptions & { sequence: string }) => {
  printJson(await (await onlineClient(options)).acknowledgeEvent(planId, Number(options.sequence)))
})

addOnlineOptions(
  plan
    .command('reconnect')
    .argument('<plan-id>')
    .requiredOption('--connection-id <id>', 'previous coordinator connection ID')
    .option('--after <sequence>', 'read pending events after sequence', '0'),
).action(async (planId: string, options: OnlineOptions & { connectionId: string; after: string }) => {
  printJson(await (await onlineClient(options)).reconnect(planId, options.connectionId, Number(options.after)))
})

addOnlineOptions(
  plan.command('register').argument('<plan-id>').option('--takeover-approved', 'confirm user-approved takeover', false),
).action(async (planId: string, options: OnlineOptions & { takeoverApproved: boolean }) => {
  printJson(await (await onlineClient(options)).register(planId, options.takeoverApproved))
})

const validation = program.command('validation').description('Publish and submit validation review data')

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
  program.command('completion').argument('<plan-id>').description('Read final completion review'),
).action(async (planId: string, options: OnlineOptions) =>
  printJson(await (await onlineClient(options)).completionReview(planId)),
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
