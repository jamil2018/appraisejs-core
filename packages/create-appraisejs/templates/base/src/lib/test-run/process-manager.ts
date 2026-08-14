import type { SpawnedProcess } from '@/lib/process/task-spawner'
import { parseHumanVerificationEventLine, parseRuntimeEventLine } from '@/lib/test-run/human-verification-event'
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
    output.split('\n').forEach(line => this.emitRuntimeEvent(testRunId, line))
  }

  private emitRuntimeEvent(testRunId: string, line: string): void {
    const event = parseRuntimeEventLine(line)
    if (event?.event === 'scenario::end') this.emitScenarioEnd(testRunId, event.data)

    const humanVerification = parseHumanVerificationEventLine(line)
    if (humanVerification) this.emit('test-run::blocked', { testRunId, ...humanVerification })
  }

  private emitScenarioEnd(testRunId: string, data: Record<string, unknown>): void {
    this.emit('scenario::end', {
      testRunId,
      featureName: data.featureName,
      scenarioName: data.scenarioName,
      scenarioTags: data.scenarioTags,
      status: data.status,
      tracePath: data.tracePath,
      ...data,
    })
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
