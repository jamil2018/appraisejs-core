#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { addStepBySlug } from './add-step.js'
import { diagnoseProject, formatMcpBootstrapError } from './diagnostics.js'
import { runAppraiseMcp } from './mcp.js'
import { createOfflineDraft, validatePlanFile } from './plan-file.js'

const program = new Command()

program.name('appraisejs').description('AppraiseJS command line tools').showHelpAfterError()

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
  .option('--offline', 'create a local draft without lifecycle registration', false)
  .action(async (options: { file: string; cwd: string; offline: boolean }) => {
    if (!options.offline)
      throw new Error('Online plan creation requires --base-url and is available through the coordinator commands.')
    console.log(JSON.stringify(await createOfflineDraft(options.file, options.cwd), null, 2))
  })

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
