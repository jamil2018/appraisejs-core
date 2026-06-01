#!/usr/bin/env node

import path from 'path'
import { Command } from 'commander'
import { addStepBySlug } from './add-step.js'

const program = new Command()

program.name('appraisejs').description('AppraiseJS command line tools').showHelpAfterError()

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
