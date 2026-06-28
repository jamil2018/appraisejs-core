import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserEngine } from '@prisma/client'

const { mockSpawnTask, mockEnsureAutomationWorkspaceReady, mockMkdir, mockRegister, mockUnregister } = vi.hoisted(
  () => ({
    mockSpawnTask: vi.fn(),
    mockEnsureAutomationWorkspaceReady: vi.fn(),
    mockMkdir: vi.fn(),
    mockRegister: vi.fn(),
    mockUnregister: vi.fn(),
  }),
)

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
        createdAt: new Date(),
        updatedAt: new Date(),
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
      'npx',
      ['cucumber-js', '-t', '@smoke', '--parallel', '2'],
      expect.objectContaining({
        cwd: '/target/app',
        env: expect.objectContaining({
          REPORT_PATH: '/target/app/automation/reports/run-1/cucumber.json',
          REPORT_FORMAT: 'json:automation/reports/run-1/cucumber.json',
          TEST_RUN_ID: 'run-1',
        }),
      }),
    )
    expect(result.reportPath).toBe('automation/reports/run-1/cucumber.json')
  })
})
