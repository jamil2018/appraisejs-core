import type { SpawnedProcess } from '@/tests/utils/spawner.util'

/**
 * Process Manager - Singleton to track running test processes by test run ID
 * 
 * This manager maintains a registry of active test processes, allowing
 * the SSE route handler to look up processes and stream their logs.
 * 
 * Uses global variable pattern (like Prisma) to persist across Next.js runtime contexts
 */
class ProcessManager {
  private processes: Map<string, SpawnedProcess> = new Map()

  private constructor() {
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
   * @param testRunId - The test run ID
   * @param process - The spawned process instance
   */
  register(testRunId: string, process: SpawnedProcess): void {
    console.log(`[ProcessManager] Registering process for testRunId: ${testRunId}, process name: ${process.name}, isRunning: ${process.isRunning}`)
    this.processes.set(testRunId, process)
    console.log(`[ProcessManager] Process registered. Total processes: ${this.processes.size}, All testRunIds:`, Array.from(this.processes.keys()))
  }

  /**
   * Get a process by test run ID
   * @param testRunId - The test run ID
   * @returns The spawned process or undefined if not found
   */
  get(testRunId: string): SpawnedProcess | undefined {
    const process = this.processes.get(testRunId)
    if (process) {
      console.log(`[ProcessManager] Found process for testRunId: ${testRunId}, process name: ${process.name}, isRunning: ${process.isRunning}`)
    } else {
      console.log(`[ProcessManager] Process NOT found for testRunId: ${testRunId}. Available testRunIds:`, Array.from(this.processes.keys()))
    }
    return process
  }

  /**
   * Unregister a process for a test run
   * @param testRunId - The test run ID
   * @returns True if the process was found and removed, false otherwise
   */
  unregister(testRunId: string): boolean {
    const deleted = this.processes.delete(testRunId)
    console.log(`[ProcessManager] Unregistering process for testRunId: ${testRunId}, deleted: ${deleted}, remaining processes: ${this.processes.size}`)
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

