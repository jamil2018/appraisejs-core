import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { taskSpawner } from '@/lib/process/task-spawner'

import { processManager } from './process-manager'

function spawned(name: string): SpawnedProcess {
  return { name } as SpawnedProcess
}

describe('processManager cleanup', () => {
  afterEach(() => {
    processManager.clear()
    processManager.removeAllListeners()
  })

  it('replaces registrations without retaining the previous process listeners', () => {
    const scenario = vi.fn()
    processManager.on('scenario::end', scenario)
    processManager.register('run-1', spawned('old-process'))
    processManager.register('run-1', spawned('new-process'))

    taskSpawner.emit('stdout', {
      processName: 'old-process',
      data: '{"event":"scenario::end","data":{"scenarioName":"old"}}',
    })
    taskSpawner.emit('stdout', {
      processName: 'new-process',
      data: '{"event":"scenario::end","data":{"scenarioName":"new"}}',
    })

    expect(scenario).toHaveBeenCalledOnce()
    expect(scenario).toHaveBeenCalledWith(expect.objectContaining({ testRunId: 'run-1', scenarioName: 'new' }))
  })

  it('makes repeated cleanup a safe no-op', () => {
    processManager.register('run-1', spawned('process'))
    expect(processManager.unregister('run-1')).toBe(true)
    expect(processManager.unregister('run-1')).toBe(false)
  })

  it('emits only a structurally complete human-verification terminal event', () => {
    const blocked = vi.fn()
    processManager.on('test-run::blocked', blocked)
    processManager.register('run-1', spawned('process'))
    taskSpawner.emit('stdout', {
      processName: 'process',
      data: JSON.stringify({
        event: 'appraise.runtime.blocked/v1',
        data: {
          reason: 'human_verification_required',
          detectorVersion: 'captcha-structural/v1',
          provider: 'recaptcha',
          pageOrigin: 'https://example.test',
          frameOrigin: 'https://www.google.com',
          signatureId: 'iframe:recaptcha',
          checkpoint: 'before_operation',
          operation: 'browser.mouse.click@1',
          step: { id: 'step.click', version: '1' },
          observedAt: '2026-08-14T00:00:00.000Z',
        },
      }),
    })
    taskSpawner.emit('stdout', {
      processName: 'process',
      data: '{"event":"appraise.runtime.blocked/v1","data":{"reason":"text-only"}}',
    })
    expect(blocked).toHaveBeenCalledOnce()
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({ testRunId: 'run-1', reason: 'human_verification_required', provider: 'recaptcha' }),
    )
  })
})
