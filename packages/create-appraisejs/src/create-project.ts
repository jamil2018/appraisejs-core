import { copyTemplate } from './copy-template.js'
import { getConfig, type Config } from './config.js'
import { patchPackageJsonScripts, runSetup } from './install.js'
import type { PromptAnswers } from './prompts.js'
import type { TemplateId } from './template-catalog.js'

export interface CreateProjectDependencies {
  copyTemplate: typeof copyTemplate
  getConfig: typeof getConfig
  patchPackageJsonScripts: typeof patchPackageJsonScripts
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
  getConfig,
  patchPackageJsonScripts,
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

export async function createProject(
  answers: PromptAnswers,
  dependencies: CreateProjectDependencies = defaultDependencies,
  logger: CreateProjectLogger = { info: message => console.log(message) },
): Promise<CreateProjectResult> {
  const config = dependencies.getConfig(answers.template)
  const { directory, template, packageManager, runInstall, playwrightBrowsers } = answers

  logger.info('\n  Validating target directory...')
  logger.info(`  Creating project at: ${directory}\n`)

  await copyBundledTemplate(directory, template, packageManager, dependencies, logger)

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
