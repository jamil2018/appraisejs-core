import { execa, type Options as ExecaOptions } from 'execa'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

/**
 * Configuration options for spawning child processes
 * @extends ExecaOptions - Extends execa Options for additional functionality
 */
export interface SpawnerOptions extends ExecaOptions {
  /** Whether to stream logs to console (default: true) */
  streamLogs?: boolean
  /** Whether to prefix logs with process name (default: true) */
  prefixLogs?: boolean
  /** Custom prefix for logs (default: process name) */
  logPrefix?: string
  /** Whether to capture output for later retrieval (default: false) */
  captureOutput?: boolean
}

/**
 * Represents a spawned child process with metadata and output tracking
 */
export interface SpawnedProcess {
  /** The underlying Node.js ChildProcess instance (returned by execa) */
  process: ChildProcess
  /** Unique name identifier for the process */
  name: string
  /** Captured output from the process */
  output: {
    /** Standard output lines */
    stdout: string[]
    /** Standard error lines */
    stderr: string[]
  }
  /** Whether the process is currently running */
  isRunning: boolean
  /** Exit code of the process (null if still running) */
  exitCode: number | null
  /** Timestamp when the process was started */
  startTime: Date
  /** Timestamp when the process ended (null if still running) */
  endTime: Date | null
}

/**
 * A comprehensive task spawner that manages child processes with logging, output capture,
 * and process lifecycle management. Extends EventEmitter to provide process events.
 *
 * Features:
 * - Concurrent process spawning and management
 * - Real-time log streaming with customizable prefixes
 * - Output capture and buffering
 * - Process lifecycle tracking (start/end times, exit codes)
 * - Event-driven architecture for process monitoring
 * - Graceful process termination
 */
export class TaskSpawner extends EventEmitter {
  /** Map of process names to SpawnedProcess instances */
  private processes: Map<string, SpawnedProcess> = new Map()
  /** Counter for generating unique process names */
  private processCounter = 0
  /** Internal buffers for processing output streams line by line */
  private outputBuffers: Map<string, { stdout: string; stderr: string }> = new Map()

  /**
   * Spawns a child process with comprehensive logging and output management
   *
   * @param command - The command to execute
   * @param args - Array of command line arguments (default: [])
   * @param options - Configuration options for spawning and logging
   * @returns Promise that resolves to a SpawnedProcess instance
   *
   * @example
   * ```typescript
   * const process = await spawner.spawn('npm', ['test'], {
   *   streamLogs: true,
   *   captureOutput: true,
   *   logPrefix: 'test-runner'
   * });
   * ```
   */
  async spawn(command: string, args: string[] = [], options: SpawnerOptions = {}): Promise<SpawnedProcess> {
    const { streamLogs = true, prefixLogs = true, logPrefix, captureOutput = false, ...spawnOptions } = options

    const processName = logPrefix || `${command}_${++this.processCounter}`

    // Create the spawned process object
    const spawnedProcess: SpawnedProcess = {
      process: null as unknown as ChildProcess, // Will be set below
      name: processName,
      output: {
        stdout: [],
        stderr: [],
      },
      isRunning: false,
      exitCode: null,
      startTime: new Date(),
      endTime: null,
    }

    // Spawn the child process using execa
    // Always use 'pipe' when captureOutput is true to enable output capture
    // streamLogs just controls whether we also log to console, not whether we can capture
    const stdioConfig = captureOutput ? 'pipe' : (streamLogs ? 'inherit' : 'pipe')
    const childProcess = execa(command, args, {
      stdio: stdioConfig,
      ...spawnOptions,
    })

    spawnedProcess.process = childProcess
    spawnedProcess.isRunning = true

    // Store the process
    this.processes.set(processName, spawnedProcess)

    // Initialize output buffers for this process
    this.outputBuffers.set(processName, { stdout: '', stderr: '' })

    // Set up event listeners
    this.setupProcessListeners(spawnedProcess, {
      streamLogs,
      prefixLogs,
      captureOutput,
      stdioConfig,
    })

    // Emit spawn event
    this.emit('spawn', spawnedProcess)

    return spawnedProcess
  }

  /**
   * Spawns multiple processes concurrently and returns a map of process names to instances
   *
   * @param tasks - Array of task configurations to spawn
   * @returns Promise that resolves to a Map of process names to SpawnedProcess instances
   *
   * @example
   * ```typescript
   * const processes = await spawner.spawnMultiple([
   *   { name: 'server', command: 'npm', args: ['start'] },
   *   { name: 'tests', command: 'npm', args: ['test'] }
   * ]);
   * ```
   */
  async spawnMultiple(
    tasks: Array<{
      name: string
      command: string
      args?: string[]
      options?: SpawnerOptions
    }>,
  ): Promise<Map<string, SpawnedProcess>> {
    const promises = tasks.map(async task => {
      const process = await this.spawn(task.command, task.args || [], {
        logPrefix: task.name,
        ...task.options,
      })
      return { name: task.name, process }
    })

    const results = await Promise.all(promises)
    const processMap = new Map<string, SpawnedProcess>()

    results.forEach(({ name, process }) => {
      processMap.set(name, process)
    })

    return processMap
  }

  /**
   * Terminates a specific process by name
   *
   * @param processName - The name of the process to kill
   * @param signal - The signal to send to the process (default: 'SIGTERM')
   * @returns True if the process was found and killed, false otherwise
   *
   * @example
   * ```typescript
   * const killed = spawner.killProcess('my-process', 'SIGKILL');
   * ```
   */
  killProcess(processName: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const spawnedProcess = this.processes.get(processName)
    if (!spawnedProcess || !spawnedProcess.isRunning) {
      return false
    }

    spawnedProcess.process.kill(signal)
    return true
  }

  /**
   * Terminates all currently running processes managed by this spawner
   *
   * @param signal - The signal to send to all processes (default: 'SIGTERM')
   *
   * @example
   * ```typescript
   * spawner.killAll('SIGKILL'); // Force kill all processes
   * ```
   */
  killAll(signal: NodeJS.Signals = 'SIGTERM'): void {
    this.processes.forEach(spawnedProcess => {
      if (spawnedProcess.isRunning) {
        spawnedProcess.process.kill(signal)
      }
    })
  }

  /**
   * Waits for a specific process to complete and returns its exit code
   *
   * @param processName - The name of the process to wait for
   * @returns Promise that resolves to the exit code (null if process not found)
   * @throws Error if the process name is not found
   *
   * @example
   * ```typescript
   * const exitCode = await spawner.waitForProcess('my-process');
   * console.log(`Process exited with code: ${exitCode}`);
   * ```
   */
  async waitForProcess(processName: string): Promise<number | null> {
    const spawnedProcess = this.processes.get(processName)
    if (!spawnedProcess) {
      throw new Error(`Process '${processName}' not found`)
    }

    return new Promise(resolve => {
      if (!spawnedProcess.isRunning) {
        resolve(spawnedProcess.exitCode)
        return
      }

      spawnedProcess.process.on('exit', (code: number | null) => {
        resolve(code)
      })
    })
  }

  /**
   * Waits for all currently running processes to complete
   *
   * @returns Promise that resolves to a Map of process names to their exit codes
   *
   * @example
   * ```typescript
   * const results = await spawner.waitForAll();
   * results.forEach((exitCode, processName) => {
   *   console.log(`${processName} exited with code: ${exitCode}`);
   * });
   * ```
   */
  async waitForAll(): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>()
    const promises: Array<Promise<[string, number | null]>> = []

    this.processes.forEach((spawnedProcess, name) => {
      if (spawnedProcess.isRunning) {
        promises.push(this.waitForProcess(name).then(code => [name, code] as [string, number | null]))
      } else {
        results.set(name, spawnedProcess.exitCode)
      }
    })

    const completed = await Promise.all(promises)
    completed.forEach(([name, code]) => {
      results.set(name, code)
    })

    return results
  }

  /**
   * Retrieves a specific process by name
   *
   * @param processName - The name of the process to retrieve
   * @returns The SpawnedProcess instance or undefined if not found
   *
   * @example
   * ```typescript
   * const process = spawner.getProcess('my-process');
   * if (process) {
   *   console.log(`Process is running: ${process.isRunning}`);
   * }
   * ```
   */
  getProcess(processName: string): SpawnedProcess | undefined {
    return this.processes.get(processName)
  }

  /**
   * Retrieves all processes managed by this spawner (running and completed)
   *
   * @returns A Map of process names to SpawnedProcess instances
   *
   * @example
   * ```typescript
   * const allProcesses = spawner.getAllProcesses();
   * console.log(`Total processes: ${allProcesses.size}`);
   * ```
   */
  getAllProcesses(): Map<string, SpawnedProcess> {
    return new Map(this.processes)
  }

  /**
   * Retrieves only the currently running processes
   *
   * @returns A Map of running process names to SpawnedProcess instances
   *
   * @example
   * ```typescript
   * const running = spawner.getRunningProcesses();
   * console.log(`Running processes: ${running.size}`);
   * ```
   */
  getRunningProcesses(): Map<string, SpawnedProcess> {
    const running = new Map<string, SpawnedProcess>()
    this.processes.forEach((process, name) => {
      if (process.isRunning) {
        running.set(name, process)
      }
    })
    return running
  }

  /**
   * Retrieves the captured output from a specific process
   *
   * @param processName - The name of the process to get output for
   * @returns Object containing stdout and stderr arrays, or null if process not found
   *
   * @example
   * ```typescript
   * const output = spawner.getProcessOutput('my-process');
   * if (output) {
   *   console.log('STDOUT:', output.stdout.join('\n'));
   *   console.log('STDERR:', output.stderr.join('\n'));
   * }
   * ```
   */
  getProcessOutput(processName: string): { stdout: string[]; stderr: string[] } | null {
    const spawnedProcess = this.processes.get(processName)
    return spawnedProcess?.output || null
  }

  /**
   * Clears all process history and resets the spawner to initial state
   *
   * @example
   * ```typescript
   * spawner.clearHistory(); // Removes all tracked processes
   * ```
   */
  clearHistory(): void {
    this.processes.clear()
    this.outputBuffers.clear()
    this.processCounter = 0
  }

  /**
   * Processes buffered output and emits complete lines
   *
   * @private
   * @param processName - The name of the process
   * @param stream - The stream type ('stdout' or 'stderr')
   * @param streamLogs - Whether to stream logs to console
   * @param prefixLogs - Whether to prefix logs with process name
   * @param captureOutput - Whether to capture output for later retrieval
   * @param spawnedProcess - The spawned process instance
   */
  private processBufferedOutput(
    processName: string,
    stream: 'stdout' | 'stderr',
    streamLogs: boolean,
    prefixLogs: boolean,
    captureOutput: boolean,
    spawnedProcess: SpawnedProcess,
  ): void {
    const buffer = this.outputBuffers.get(processName)
    if (!buffer) return

    const currentBuffer = buffer[stream]
    const lines = currentBuffer.split('\n')

    // Keep the last line in buffer (might be incomplete)
    buffer[stream] = lines.pop() || ''

    // Process complete lines
    for (const line of lines) {
      if (captureOutput) {
        spawnedProcess.output[stream].push(line + '\n')
        // ROOT LEVEL LOG: Log the actual captured content
        console.log(`[ROOT CAPTURE] ${stream.toUpperCase()} captured for ${processName}:`, line)
        console.log(`[ROOT CAPTURE] Total ${stream} lines captured: ${spawnedProcess.output[stream].length}`)
      }

      if (streamLogs) {
        const prefix = prefixLogs ? `[${processName}] ` : ''
        if (stream === 'stdout') {
          console.log(`${prefix}${line}`)
        } else {
          console.error(`${prefix}${line}`)
        }
      }

      console.log(`[TaskSpawner] Emitting ${stream} event for processName: ${processName}, data length: ${(line + '\n').length} bytes`)
      this.emit(stream, { processName, data: line + '\n' })
    }
  }

  /**
   * Sets up event listeners for a spawned process
   *
   * @private
   * @param spawnedProcess - The spawned process instance
   * @param options - Configuration options for the listeners
   */
  private setupProcessListeners(
    spawnedProcess: SpawnedProcess,
    options: {
      streamLogs: boolean
      prefixLogs: boolean
      captureOutput: boolean
      stdioConfig: string | string[]
    },
  ): void {
    const { streamLogs, prefixLogs, captureOutput, stdioConfig } = options
    const { process: childProcess, name } = spawnedProcess

    // Only set up data listeners when stdio is 'pipe'
    if (stdioConfig === 'pipe') {
      console.log(`[TaskSpawner] Setting up data listeners for process: ${name}, stdio: pipe`)
      // Handle stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log(`[TaskSpawner] Received stdout data for process: ${name}, length: ${data.length} bytes, output length: ${output.length} chars`)
        const buffer = this.outputBuffers.get(name)

        if (buffer) {
          buffer.stdout += output
          this.processBufferedOutput(name, 'stdout', streamLogs, prefixLogs, captureOutput, spawnedProcess)
        } else {
          console.warn(`[TaskSpawner] No output buffer found for process: ${name}`)
        }
      })

      // Handle stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        console.log(`[TaskSpawner] Received stderr data for process: ${name}, length: ${data.length} bytes, output length: ${output.length} chars`)
        const buffer = this.outputBuffers.get(name)

        if (buffer) {
          buffer.stderr += output
          this.processBufferedOutput(name, 'stderr', streamLogs, prefixLogs, captureOutput, spawnedProcess)
        } else {
          console.warn(`[TaskSpawner] No output buffer found for process: ${name}`)
        }
      })
    } else {
      console.log(`[TaskSpawner] Skipping data listeners for process: ${name}, stdio: ${stdioConfig}`)
    }

    // Handle process exit
    childProcess.on('exit', (code: number | null) => {
      // Only flush buffered output when stdio is 'pipe'
      if (stdioConfig === 'pipe') {
        const buffer = this.outputBuffers.get(name)
        if (buffer) {
          // Process remaining stdout
          if (buffer.stdout) {
            if (captureOutput) {
              spawnedProcess.output.stdout.push(buffer.stdout)
            }
            if (streamLogs) {
              const prefix = prefixLogs ? `[${name}] ` : ''
              console.log(`${prefix}${buffer.stdout}`)
            }
            console.log(`[TaskSpawner] Emitting final stdout event for process: ${name}, data length: ${buffer.stdout.length} chars`)
            this.emit('stdout', {
              processName: name,
              data: buffer.stdout,
            })
          }

          // Process remaining stderr
          if (buffer.stderr) {
            if (captureOutput) {
              spawnedProcess.output.stderr.push(buffer.stderr)
            }
            if (streamLogs) {
              const prefix = prefixLogs ? `[${name}] ` : ''
              console.error(`${prefix}${buffer.stderr}`)
            }
            console.log(`[TaskSpawner] Emitting final stderr event for process: ${name}, data length: ${buffer.stderr.length} chars`)
            this.emit('stderr', {
              processName: name,
              data: buffer.stderr,
            })
          }

          // Clear the buffer
          this.outputBuffers.delete(name)
        }
      }

      spawnedProcess.isRunning = false
      spawnedProcess.exitCode = code
      spawnedProcess.endTime = new Date()

      console.log(`[TaskSpawner] Process exited: ${name}, code: ${code}, emitting exit event`)
      this.emit('exit', { processName: name, code })
    })

    // Handle process error
    childProcess.on('error', (error: Error) => {
      spawnedProcess.isRunning = false
      spawnedProcess.endTime = new Date()

      if (streamLogs) {
        const prefix = prefixLogs ? `[${name}] ` : ''
        console.error(`${prefix}ERROR: ${error.message}`)
      }

      this.emit('error', { processName: name, error })
    })

    // Handle uncaught exceptions to prevent crashes
    childProcess.on('uncaughtException', (error: Error) => {
      spawnedProcess.isRunning = false
      spawnedProcess.endTime = new Date()

      if (streamLogs) {
        const prefix = prefixLogs ? `[${name}] ` : ''
        console.error(`${prefix}UNCAUGHT EXCEPTION: ${error.message}`)
      }

      this.emit('error', { processName: name, error })
    })
  }
}

/**
 * Default TaskSpawner instance for convenience
 * Use this when you don't need multiple spawner instances
 */
export const taskSpawner = new TaskSpawner()

/**
 * Convenience function to spawn a single task using the default spawner
 *
 * @param command - The command to execute
 * @param args - Array of command line arguments
 * @param options - Configuration options for spawning
 * @returns Promise that resolves to a SpawnedProcess instance
 */
export const spawnTask = (command: string, args: string[] = [], options: SpawnerOptions = {}) =>
  taskSpawner.spawn(command, args, options)

/**
 * Convenience function to spawn multiple tasks using the default spawner
 *
 * @param tasks - Array of task configurations to spawn
 * @returns Promise that resolves to a Map of process names to SpawnedProcess instances
 */
export const spawnMultipleTasks = (
  tasks: Array<{
    name: string
    command: string
    args?: string[]
    options?: SpawnerOptions
  }>,
) => taskSpawner.spawnMultiple(tasks)

/**
 * Convenience function to kill a task using the default spawner
 *
 * @param processName - The name of the process to kill
 * @param signal - The signal to send to the process
 * @returns True if the process was found and killed, false otherwise
 */
export const killTask = (processName: string, signal?: NodeJS.Signals) => taskSpawner.killProcess(processName, signal)

/**
 * Convenience function to kill all tasks using the default spawner
 *
 * @param signal - The signal to send to all processes
 */
export const killAllTasks = (signal?: NodeJS.Signals) => taskSpawner.killAll(signal)

/**
 * Convenience function to wait for a task using the default spawner
 *
 * @param processName - The name of the process to wait for
 * @returns Promise that resolves to the exit code
 */
export const waitForTask = (processName: string) => taskSpawner.waitForProcess(processName)

/**
 * Convenience function to wait for all tasks using the default spawner
 *
 * @returns Promise that resolves to a Map of process names to exit codes
 */
export const waitForAllTasks = () => taskSpawner.waitForAll()
