import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserEngine } from '@prisma/client'

const { mockSpawnTask, mockEnsureAutomationWorkspaceReady, mockMkdir, mockWriteFile, mockRegister, mockUnregister } =
  vi.hoisted(() => ({
    mockSpawnTask: vi.fn(),
    mockEnsureAutomationWorkspaceReady: vi.fn(),
    mockMkdir: vi.fn(),
    mockWriteFile: vi.fn(),
    mockRegister: vi.fn(),
    mockUnregister: vi.fn(),
  }))

vi.mock('@/lib/process/task-spawner', () => ({
  spawnTask: mockSpawnTask,
  waitForTask: vi.fn(),
  killTask: vi.fn(),
  taskSpawner: { getProcess: vi.fn(), spawn: vi.fn() },
}))

vi.mock('@/lib/automation/automation-workspace', () => ({
  ensureAutomationWorkspaceReady: mockEnsureAutomationWorkspaceReady,
}))

vi.mock('@/lib/test-run/process-manager', () => ({
  processManager: {
    register: mockRegister,
    unregister: mockUnregister,
  },
}))

vi.mock('fs', () => ({
  promises: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
}))

import { localExecutorAdapter } from './local-executor-adapter'

describe('local executor adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSpawnTask.mockResolvedValue({
      process: { on: vi.fn() },
      name: 'test-run-run-1',
      output: { stdout: [], stderr: [] },
    })
  })

  it('runs repo-owned tests from the target project cwd and writes target-relative reports', async () => {
    const result = await localExecutorAdapter.executeTestRun({
      testRunId: 'run-1',
      environment: {
        id: 'env-1',
        name: 'local',
        baseUrl: 'http://localhost',
        apiBaseUrl: null,
        username: null,
        passwordEnvironmentVariable: null,
        credentialState: 'NONE',
        legacyCredentialDetectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        targetProjectId: null,
      },
      tagExpression: '@smoke',
      testWorkersCount: 2,
      browserEngine: BrowserEngine.CHROMIUM,
      projectRoot: '/target/app',
      prepareWorkspace: false,
    })

    expect(mockEnsureAutomationWorkspaceReady).not.toHaveBeenCalled()
    expect(mockMkdir).toHaveBeenCalledWith('/target/app/automation/reports/run-1', { recursive: true })
    expect(mockSpawnTask).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('@cucumber/cucumber/bin/cucumber.js'), '-t', '@smoke', '--parallel', '2'],
      expect.objectContaining({
        cwd: '/target/app',
        env: expect.objectContaining({
          REPORT_PATH: '/target/app/automation/reports/run-1/cucumber.json',
          REPORT_FORMAT: 'json:automation/reports/run-1/cucumber.json',
          TEST_RUN_ID: 'run-1',
          APPRAISE_CUCUMBER_BINARY: expect.stringContaining('@cucumber/cucumber/bin/cucumber.js'),
        }),
      }),
    )
    expect(result.reportPath).toBe('automation/reports/run-1/cucumber.json')
  })

  it('generates an exact Cucumber config for plan-bound runs', async () => {
    await localExecutorAdapter.executeTestRun({
      testRunId: 'run-2',
      environment: {
        id: 'env-1',
        name: 'local',
        baseUrl: 'http://localhost',
        apiBaseUrl: null,
        username: null,
        passwordEnvironmentVariable: null,
        credentialState: 'NONE',
        legacyCredentialDetectedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        targetProjectId: null,
      },
      tagExpression: null,
      testWorkersCount: 1,
      browserEngine: BrowserEngine.CHROMIUM,
      projectRoot: '/target/app',
      featurePaths: ['/target/app/automation/features/approved.feature'],
      importPaths: ['/target/app/automation/steps/approved.step.ts'],
      supportPaths: ['/hub/packages/cucumber-runtime/src/world.ts'],
      prepareWorkspace: false,
    })

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/target/app/automation/reports/run-2/cucumber.run-2.mjs',
      expect.stringContaining('automation/features/approved.feature'),
    )
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/target/app/automation/reports/run-2/cucumber.run-2.mjs',
      expect.stringContaining('/hub/packages/cucumber-runtime/src/world.ts'),
    )
    expect(mockSpawnTask).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining('@cucumber/cucumber/bin/cucumber.js'),
        '--config',
        'automation/reports/run-2/cucumber.run-2.mjs',
      ],
      expect.objectContaining({ cwd: '/target/app' }),
    )
  })
})
