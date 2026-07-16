import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { EventEmitter } from 'events'
import { taskSpawner } from '@/lib/process/task-spawner'

class ProcessManager extends EventEmitter {
  private processes: Map<string, SpawnedProcess> = new Map()
  private eventListeners: Map<string, Map<string, () => void>> = new Map()

  private constructor() {
    super()
  }

  static getInstance(): ProcessManager {
    const globalForProcessManager = global as unknown as {
      processManager: ProcessManager | undefined
    }

    if (!globalForProcessManager.processManager) {
      globalForProcessManager.processManager = new ProcessManager()
    }

    return globalForProcessManager.processManager
  }

  register(testRunId: string, process: SpawnedProcess): void {
    this.unregister(testRunId)
    this.processes.set(testRunId, process)
    const listeners = new Map<string, () => void>()

    const onStdout = ({ processName, data }: { processName: string; data: string }) => {
      if (processName === process.name) {
        this.parseAndEmitCustomEvents(testRunId, data)
      }
    }

    const onStderr = ({ processName, data }: { processName: string; data: string }) => {
      if (processName === process.name) {
        this.parseAndEmitCustomEvents(testRunId, data)
      }
    }

    listeners.set('stdout', () => taskSpawner.removeListener('stdout', onStdout))
    listeners.set('stderr', () => taskSpawner.removeListener('stderr', onStderr))

    taskSpawner.on('stdout', onStdout)
    taskSpawner.on('stderr', onStderr)

    this.eventListeners.set(testRunId, listeners)
  }

  private parseAndEmitCustomEvents(testRunId: string, output: string): void {
    const lines = output.split('\n')

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      try {
        const jsonMatch = line.match(/\{[\s\S]*"event"[\s\S]*\}/)
        if (jsonMatch) {
          const eventData = JSON.parse(jsonMatch[0])
          if (eventData.event === 'scenario::end') {
            this.emit('scenario::end', {
              testRunId,
              featureName: eventData.data?.featureName,
              scenarioName: eventData.data?.scenarioName,
              scenarioTags: eventData.data?.scenarioTags,
              status: eventData.data?.status,
              tracePath: eventData.data?.tracePath,
              ...eventData.data,
            })
          }
        }
      } catch {
        continue
      }
    }
  }

  get(testRunId: string): SpawnedProcess | undefined {
    return this.processes.get(testRunId)
  }

  unregister(testRunId: string): boolean {
    const listeners = this.eventListeners.get(testRunId)
    if (listeners) {
      listeners.forEach(cleanup => cleanup())
      this.eventListeners.delete(testRunId)
    }

    return this.processes.delete(testRunId)
  }

  has(testRunId: string): boolean {
    return this.processes.has(testRunId)
  }

  getAllTestRunIds(): string[] {
    return Array.from(this.processes.keys())
  }

  clear(): void {
    this.eventListeners.forEach(listeners => {
      listeners.forEach(cleanup => cleanup())
    })
    this.eventListeners.clear()
    this.processes.clear()
  }

  size(): number {
    return this.processes.size
  }
}

export const processManager = ProcessManager.getInstance()
