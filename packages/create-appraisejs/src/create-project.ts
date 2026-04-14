import path from 'path'
import fs from 'fs-extra'
import { copyTemplate } from './copy-template.js'
import { getConfig, type Config } from './config.js'
import { downloadRepo } from './download-repo.js'
import { patchPackageJsonScripts, runSetup } from './install.js'
import type { PromptAnswers } from './prompts.js'
import type { TemplateId } from './template-catalog.js'

export interface CreateProjectDependencies {
  copyTemplate: typeof copyTemplate
  downloadRepo: typeof downloadRepo
  getConfig: typeof getConfig
  patchPackageJsonScripts: typeof patchPackageJsonScripts
  removeDirectory: typeof fs.remove
  runSetup: typeof runSetup
}

export interface CreateProjectLogger {
  info(message: string): void
}

export interface CreateProjectResult {
  config: Config
  targetDirectory: string
}

const defaultDependencies: CreateProjectDependencies = {
  copyTemplate,
  downloadRepo,
  getConfig,
  patchPackageJsonScripts,
  removeDirectory: fs.remove,
  runSetup,
}

async function copyBundledTemplate(
  directory: string,
  template: TemplateId,
  packageManager: PromptAnswers['packageManager'],
  dependencies: CreateProjectDependencies,
  logger: CreateProjectLogger,
): Promise<void> {
  logger.info('  Copying bundled template files...')
  await dependencies.copyTemplate(directory, undefined, undefined, packageManager, template)
  logger.info('  Template files copied.\n')
}

async function copyRemoteTemplate(
  directory: string,
  template: TemplateId,
  packageManager: PromptAnswers['packageManager'],
  config: Config,
  dependencies: CreateProjectDependencies,
  logger: CreateProjectLogger,
): Promise<void> {
  let cleanupDir: string | null = null

  try {
    logger.info(`  Downloading template from ${config.repoBase} ...`)
    const download = await dependencies.downloadRepo(config.repoBase, config.branch, config.templateSubpath)
    cleanupDir = download.cleanupDir

    logger.info('  Copying template files...')
    await dependencies.copyTemplate(
      directory,
      undefined,
      path.join(download.repoRoot, config.templateSubpath),
      packageManager,
      template,
    )
    logger.info('  Template files copied.\n')
  } finally {
    if (cleanupDir) {
      await dependencies.removeDirectory(cleanupDir).catch(() => {})
    }
  }
}

export async function createProject(
  answers: PromptAnswers,
  dependencies: CreateProjectDependencies = defaultDependencies,
  logger: CreateProjectLogger = { info: message => console.log(message) },
): Promise<CreateProjectResult> {
  const config = dependencies.getConfig(answers.template)
  const { directory, template, packageManager, runInstall, playwrightBrowsers } = answers

  logger.info('\n  Validating target directory...')
  logger.info(`  Creating project at: ${directory}\n`)

  if (config.useBundled) {
    await copyBundledTemplate(directory, template, packageManager, dependencies, logger)
  } else {
    await copyRemoteTemplate(directory, template, packageManager, config, dependencies, logger)
  }

  await dependencies.patchPackageJsonScripts(directory, packageManager)

  if (runInstall) {
    logger.info('  Running setup (dependencies, env, production build)...')
    await dependencies.runSetup(directory, packageManager, playwrightBrowsers)
    logger.info('  Setup complete.\n')
  }

  return {
    config,
    targetDirectory: directory,
  }
}
