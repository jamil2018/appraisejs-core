import { describe, expect, it, vi } from 'vitest'
import { createProject, type CreateProjectDependencies, type CreateProjectLogger } from './create-project.js'
import type { PromptAnswers } from './prompts.js'

function createDependencies(overrides: Partial<CreateProjectDependencies> = {}): CreateProjectDependencies {
  return {
    copyTemplate: vi.fn().mockResolvedValue(undefined),
    downloadRepo: vi.fn().mockResolvedValue({
      repoRoot: '/tmp/remote-repo',
      cleanupDir: '/tmp/remote-checkout',
    }),
    getConfig: vi.fn().mockReturnValue({
      repoBase: 'https://github.com/jamil2018/appraisejs-core',
      branch: 'main',
      templateSubpath: 'templates/default',
      useBundled: true,
    }),
    patchPackageJsonScripts: vi.fn().mockResolvedValue(undefined),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
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
  packageManager: 'pnpm',
  runInstall: true,
  playwrightBrowsers: ['chromium'],
}

describe('createProject', () => {
  it('uses the bundled template path by default', async () => {
    const dependencies = createDependencies()
    const { logger, messages } = createLogger()

    const result = await createProject(ANSWERS, dependencies, logger)

    expect(dependencies.copyTemplate).toHaveBeenCalledWith(ANSWERS.directory, undefined, undefined, ANSWERS.packageManager)
    expect(dependencies.downloadRepo).not.toHaveBeenCalled()
    expect(dependencies.patchPackageJsonScripts).toHaveBeenCalledWith(ANSWERS.directory, ANSWERS.packageManager)
    expect(dependencies.runSetup).toHaveBeenCalledWith(
      ANSWERS.directory,
      ANSWERS.packageManager,
      ANSWERS.playwrightBrowsers,
    )
    expect(result.targetDirectory).toBe(ANSWERS.directory)
    expect(messages).toContain('  Copying bundled template files...')
  })

  it('downloads and cleans up the remote template when overrides disable bundled mode', async () => {
    const dependencies = createDependencies({
      getConfig: vi.fn().mockReturnValue({
        repoBase: 'https://example.com/custom',
        branch: 'develop',
        templateSubpath: 'templates/custom',
        useBundled: false,
      }),
    })

    await createProject({ ...ANSWERS, runInstall: false }, dependencies)

    expect(dependencies.downloadRepo).toHaveBeenCalledWith('https://example.com/custom', 'develop', 'templates/custom')
    expect(dependencies.copyTemplate).toHaveBeenCalledWith(
      ANSWERS.directory,
      undefined,
      '/tmp/remote-repo/templates/custom',
      ANSWERS.packageManager,
    )
    expect(dependencies.removeDirectory).toHaveBeenCalledWith('/tmp/remote-checkout')
    expect(dependencies.runSetup).not.toHaveBeenCalled()
  })

  it('still cleans up remote downloads when copying fails', async () => {
    const dependencies = createDependencies({
      getConfig: vi.fn().mockReturnValue({
        repoBase: 'https://example.com/custom',
        branch: 'develop',
        templateSubpath: 'templates/custom',
        useBundled: false,
      }),
      copyTemplate: vi.fn().mockRejectedValue(new Error('copy failed')),
    })

    await expect(createProject({ ...ANSWERS, runInstall: false }, dependencies)).rejects.toThrow('copy failed')
    expect(dependencies.removeDirectory).toHaveBeenCalledWith('/tmp/remote-checkout')
  })
})
