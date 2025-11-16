import type { SpawnedProcess } from '@/tests/utils/spawner.util'
import { EventEmitter } from 'events'
import { taskSpawner } from '@/tests/utils/spawner.util'

/**
 * Process Manager - Singleton to track running test processes by test run ID
 *
 * This manager maintains a registry of active test processes, allowing
 * the SSE route handler to look up processes and stream their logs.
 *
 * Uses global variable pattern (like Prisma) to persist across Next.js runtime contexts
 *
 * Security: Currently stores processes by testRunId only.
 * TODO: When user authentication is implemented, consider adding user isolation:
 * - Option 1: Use composite keys like `${userId}:${testRunId}`
 * - Option 2: Store userId in process metadata and filter by userId in get() method
 * - Option 3: Create separate ProcessManager instances per user (more complex)
 */
class ProcessManager extends EventEmitter {
  private processes: Map<string, SpawnedProcess> = new Map()
  // Track event listeners for cleanup
  private eventListeners: Map<string, Map<string, () => void>> = new Map()

  private constructor() {
    super()
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of ProcessManager
   * Uses global variable to persist across Next.js runtime contexts
   */
  static getInstance(): ProcessManager {
    const globalForProcessManager = global as unknown as {
      processManager: ProcessManager | undefined
    }

    if (!globalForProcessManager.processManager) {
      globalForProcessManager.processManager = new ProcessManager()
    }

    return globalForProcessManager.processManager
  }

  /**
   * Register a process for a test run
   * Sets up event listeners to parse custom events from stdout/stderr
   * @param testRunId - The test run ID
   * @param process - The spawned process instance
   */
  register(testRunId: string, process: SpawnedProcess): void {
    this.processes.set(testRunId, process)

    // Set up listeners to parse custom events from stdout/stderr
    const listeners = new Map<string, () => void>()

    // Handler for stdout events - parse for custom events
    const onStdout = ({ processName, data }: { processName: string; data: string }) => {
      if (processName === process.name) {
        this.parseAndEmitCustomEvents(testRunId, data)
      }
    }

    // Handler for stderr events - parse for custom events
    const onStderr = ({ processName, data }: { processName: string; data: string }) => {
      if (processName === process.name) {
        this.parseAndEmitCustomEvents(testRunId, data)
      }
    }

    // Store cleanup functions
    listeners.set('stdout', () => taskSpawner.removeListener('stdout', onStdout))
    listeners.set('stderr', () => taskSpawner.removeListener('stderr', onStderr))

    // Register listeners
    taskSpawner.on('stdout', onStdout)
    taskSpawner.on('stderr', onStderr)

    this.eventListeners.set(testRunId, listeners)
  }

  /**
   * Parse stdout/stderr output for custom event markers and emit them
   * Expects events in JSON format: {"event":"scenario::end","data":{...}}
   */
  private parseAndEmitCustomEvents(testRunId: string, output: string): void {
    // Split by newlines to handle multi-line output
    const lines = output.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        // Look for JSON objects in the line that contain an "event" field
        // Matches: {"event":"scenario::end","data":{...}}
        const jsonMatch = line.match(/\{[\s\S]*"event"[\s\S]*\}/)
        if (jsonMatch) {
          const eventData = JSON.parse(jsonMatch[0])
          if (eventData.event === 'scenario::end') {
            console.log(`[ProcessManager] Parsed scenario::end event for testRunId: ${testRunId}`, eventData)
            this.emit('scenario::end', {
              testRunId,
              scenarioName: eventData.data?.scenarioName,
              status: eventData.data?.status,
              ...eventData.data,
            })
            console.log(`[ProcessManager] Emitted scenario::end event for testRunId: ${testRunId}`)
          }
        }
      } catch (error) {
        // Not a custom event, continue parsing other lines
        // This is expected for regular log output
        // Only log if it looks like it might be a JSON parse error
        if (line.trim().startsWith('{')) {
          console.warn(`[ProcessManager] Failed to parse potential event JSON: ${line.substring(0, 100)}`, error)
        }
      }
    }
  }

  /**
   * Get a process by test run ID
   * @param testRunId - The test run ID
   * @returns The spawned process or undefined if not found
   */
  get(testRunId: string): SpawnedProcess | undefined {
    return this.processes.get(testRunId)
  }

  /**
   * Unregister a process for a test run
   * Cleans up event listeners
   * @param testRunId - The test run ID
   * @returns True if the process was found and removed, false otherwise
   */
  unregister(testRunId: string): boolean {
    // Clean up event listeners
    const listeners = this.eventListeners.get(testRunId)
    if (listeners) {
      listeners.forEach(cleanup => cleanup())
      this.eventListeners.delete(testRunId)
    }

    const deleted = this.processes.delete(testRunId)
    console.log(
      `[ProcessManager] Unregistering process for testRunId: ${testRunId}, deleted: ${deleted}, remaining processes: ${this.processes.size}`,
    )
    return deleted
  }

  /**
   * Check if a process exists for a test run
   * @param testRunId - The test run ID
   * @returns True if a process exists, false otherwise
   */
  has(testRunId: string): boolean {
    return this.processes.has(testRunId)
  }

  /**
   * Get all registered test run IDs (for debugging)
   * @returns Array of test run IDs
   */
  getAllTestRunIds(): string[] {
    return Array.from(this.processes.keys())
  }

  /**
   * Clear all registered processes (useful for cleanup)
   */
  clear(): void {
    // Clean up all event listeners
    this.eventListeners.forEach(listeners => {
      listeners.forEach(cleanup => cleanup())
    })
    this.eventListeners.clear()
    this.processes.clear()
  }

  /**
   * Get the number of active processes
   * @returns The number of registered processes
   */
  size(): number {
    return this.processes.size
  }
}

// Export singleton instance
export const processManager = ProcessManager.getInstance()
