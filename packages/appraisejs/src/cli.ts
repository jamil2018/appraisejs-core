#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { addStepBySlug } from './add-step.js'
import { runAppraiseMcp } from './mcp.js'

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
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
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
