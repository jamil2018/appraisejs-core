import type { SpawnedProcess } from '@/tests/utils/spawner.util'

/**
 * Process Manager - Singleton to track running test processes by test run ID
 * 
 * This manager maintains a registry of active test processes, allowing
 * the SSE route handler to look up processes and stream their logs.
 */
class ProcessManager {
  private static instance: ProcessManager
  private processes: Map<string, SpawnedProcess> = new Map()

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of ProcessManager
   */
  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager()
    }
    return ProcessManager.instance
  }

  /**
   * Register a process for a test run
   * @param testRunId - The test run ID
   * @param process - The spawned process instance
   */
  register(testRunId: string, process: SpawnedProcess): void {
    this.processes.set(testRunId, process)
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
   * @param testRunId - The test run ID
   * @returns True if the process was found and removed, false otherwise
   */
  unregister(testRunId: string): boolean {
    return this.processes.delete(testRunId)
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
   * Get all registered test run IDs
   * @returns Array of test run IDs
   */
  getAllTestRunIds(): string[] {
    return Array.from(this.processes.keys())
  }

  /**
   * Clear all registered processes (useful for cleanup)
   */
  clear(): void {
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

