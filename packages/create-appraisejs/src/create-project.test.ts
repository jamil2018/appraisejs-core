import { describe, expect, it, vi } from 'vitest'
import { createProject, type CreateProjectDependencies, type CreateProjectLogger } from './create-project.js'
import type { PromptAnswers } from './prompts.js'

function createDependencies(overrides: Partial<CreateProjectDependencies> = {}): CreateProjectDependencies {
  return {
    copyTemplate: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn().mockReturnValue({
      template: 'starter',
    }),
    patchPackageJsonScripts: vi.fn().mockResolvedValue(undefined),
    runSetup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createLogger(): { logger: CreateProjectLogger; messages: string[] } {
  const messages: string[] = []
  return {
    logger: {
      info(message: string) {
        messages.push(message)
      },
    },
    messages,
  }
}

const ANSWERS: PromptAnswers = {
  directory: '/tmp/my-appraise-app',
  template: 'starter',
  packageManager: 'pnpm',
  runInstall: true,
  playwrightBrowsers: ['chromium'],
}

describe('createProject', () => {
  it('uses the bundled template path by default', async () => {
    const dependencies = createDependencies()
    const { logger, messages } = createLogger()

    const result = await createProject(ANSWERS, dependencies, logger)

    expect(dependencies.getConfig).toHaveBeenCalledWith(ANSWERS.template)
    expect(dependencies.copyTemplate).toHaveBeenCalledWith(
      ANSWERS.directory,
      undefined,
      undefined,
      ANSWERS.packageManager,
      ANSWERS.template,
    )
    expect(dependencies.patchPackageJsonScripts).toHaveBeenCalledWith(ANSWERS.directory, ANSWERS.packageManager)
    expect(dependencies.runSetup).toHaveBeenCalledWith(
      ANSWERS.directory,
      ANSWERS.packageManager,
      ANSWERS.playwrightBrowsers,
    )
    expect(result.targetDirectory).toBe(ANSWERS.directory)
    expect(messages).toContain('  Copying bundled template files...')
  })

  it('passes blank template selection through to config and bundled copy resolution', async () => {
    const dependencies = createDependencies()

    await createProject({ ...ANSWERS, template: 'blank', runInstall: false }, dependencies)

    expect(dependencies.getConfig).toHaveBeenCalledWith('blank')
    expect(dependencies.copyTemplate).toHaveBeenCalledWith(
      ANSWERS.directory,
      undefined,
      undefined,
      ANSWERS.packageManager,
      'blank',
    )
  })
})
