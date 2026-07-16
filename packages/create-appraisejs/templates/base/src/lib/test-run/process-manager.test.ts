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
})
