import { execa, type Options as ExecaOptions } from 'execa'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface SpawnerOptions extends ExecaOptions {
  streamLogs?: boolean
  prefixLogs?: boolean
  logPrefix?: string
  captureOutput?: boolean
  retainProcessRecord?: boolean
}

export interface SpawnedProcess {
  process: ChildProcess
  pid: number | undefined
  name: string
  output: {
    stdout: string[]
    stderr: string[]
  }
  isRunning: boolean
  exitCode: number | null
  startTime: Date
  endTime: Date | null
}

export class TaskSpawner extends EventEmitter {
  private processes: Map<string, SpawnedProcess> = new Map()
  private processCounter = 0
  private outputBuffers: Map<string, { stdout: string; stderr: string }> = new Map()

  private scheduleProcessCleanup(processName: string, spawnedProcess: SpawnedProcess): void {
    setImmediate(() => {
      spawnedProcess.output.stdout.length = 0
      spawnedProcess.output.stderr.length = 0
      this.outputBuffers.delete(processName)
      this.processes.delete(processName)
    })
  }

  removeProcess(processName: string): boolean {
    this.outputBuffers.delete(processName)
    return this.processes.delete(processName)
  }

  async spawn(command: string, args: string[] = [], options: SpawnerOptions = {}): Promise<SpawnedProcess> {
    const {
      streamLogs = true,
      prefixLogs = true,
      logPrefix,
      captureOutput = false,
      retainProcessRecord = true,
      ...spawnOptions
    } = options

    const processName = logPrefix || `${command}_${++this.processCounter}`
    const spawnedProcess: SpawnedProcess = {
      process: null as unknown as ChildProcess,
      pid: undefined,
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

    const stdioConfig = captureOutput ? 'pipe' : streamLogs ? 'inherit' : 'pipe'
    const childProcess = execa(command, args, {
      stdio: stdioConfig,
      reject: false,
      ...spawnOptions,
    })

    spawnedProcess.process = childProcess
    spawnedProcess.pid = childProcess.pid
    spawnedProcess.isRunning = true

    this.processes.set(processName, spawnedProcess)
    this.outputBuffers.set(processName, { stdout: '', stderr: '' })

    this.setupProcessListeners(spawnedProcess, {
      streamLogs,
      prefixLogs,
      captureOutput,
      retainProcessRecord,
      stdioConfig,
    })

    this.emit('spawn', spawnedProcess)
    return spawnedProcess
  }

  killProcess(processName: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const spawnedProcess = this.processes.get(processName)
    if (!spawnedProcess || !spawnedProcess.isRunning) {
      return false
    }

    spawnedProcess.process.kill(signal)
    return true
  }

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

      spawnedProcess.process.on('exit', (code: number | null) => resolve(code))
    })
  }

  getProcess(processName: string): SpawnedProcess | undefined {
    return this.processes.get(processName)
  }

  private processBufferedOutput(
    processName: string,
    stream: 'stdout' | 'stderr',
    streamLogs: boolean,
    prefixLogs: boolean,
    captureOutput: boolean,
    spawnedProcess: SpawnedProcess,
  ): void {
    const buffer = this.outputBuffers.get(processName)
    if (!buffer) {
      return
    }

    const lines = buffer[stream].split('\n')
    buffer[stream] = lines.pop() || ''

    for (const line of lines) {
      if (captureOutput) {
        spawnedProcess.output[stream].push(`${line}\n`)
      }

      if (streamLogs) {
        const prefix = prefixLogs ? `[${processName}] ` : ''
        if (stream === 'stdout') {
          console.log(`${prefix}${line}`)
        } else {
          console.error(`${prefix}${line}`)
        }
      }

      this.emit(stream, { processName, data: `${line}\n` })
    }
  }

  private setupProcessListeners(
    spawnedProcess: SpawnedProcess,
    options: {
      streamLogs: boolean
      prefixLogs: boolean
      captureOutput: boolean
      retainProcessRecord: boolean
      stdioConfig: string | string[]
    },
  ): void {
    const { streamLogs, prefixLogs, captureOutput, retainProcessRecord, stdioConfig } = options
    const { process: childProcess, name } = spawnedProcess

    if (stdioConfig === 'pipe') {
      childProcess.stdout?.on('data', (data: Buffer) => {
        const buffer = this.outputBuffers.get(name)
        if (!buffer) {
          return
        }

        buffer.stdout += data.toString()
        this.processBufferedOutput(name, 'stdout', streamLogs, prefixLogs, captureOutput, spawnedProcess)
      })

      childProcess.stderr?.on('data', (data: Buffer) => {
        const buffer = this.outputBuffers.get(name)
        if (!buffer) {
          return
        }

        buffer.stderr += data.toString()
        this.processBufferedOutput(name, 'stderr', streamLogs, prefixLogs, captureOutput, spawnedProcess)
      })
    }

    childProcess.on('exit', (code: number | null) => {
      if (stdioConfig === 'pipe') {
        const buffer = this.outputBuffers.get(name)
        if (buffer) {
          if (buffer.stdout) {
            if (captureOutput) {
              spawnedProcess.output.stdout.push(buffer.stdout)
            }
            if (streamLogs) {
              const prefix = prefixLogs ? `[${name}] ` : ''
              console.log(`${prefix}${buffer.stdout}`)
            }
            this.emit('stdout', { processName: name, data: buffer.stdout })
          }

          if (buffer.stderr) {
            if (captureOutput) {
              spawnedProcess.output.stderr.push(buffer.stderr)
            }
            if (streamLogs) {
              const prefix = prefixLogs ? `[${name}] ` : ''
              console.error(`${prefix}${buffer.stderr}`)
            }
            this.emit('stderr', { processName: name, data: buffer.stderr })
          }

          this.outputBuffers.delete(name)
        }
      }

      spawnedProcess.isRunning = false
      spawnedProcess.exitCode = code
      spawnedProcess.endTime = new Date()

      if (!retainProcessRecord) {
        this.scheduleProcessCleanup(name, spawnedProcess)
      }

      this.emit('exit', { processName: name, code })
    })

    childProcess.on('error', (error: Error) => {
      this.outputBuffers.delete(name)
      spawnedProcess.isRunning = false
      spawnedProcess.endTime = new Date()

      if (!retainProcessRecord) {
        this.scheduleProcessCleanup(name, spawnedProcess)
      }

      if (streamLogs) {
        const prefix = prefixLogs ? `[${name}] ` : ''
        console.error(`${prefix}ERROR: ${error.message}`)
      }

      this.emit('error', { processName: name, error })
    })
  }
}

const globalForTaskSpawner = global as unknown as {
  taskSpawner: TaskSpawner | undefined
}

export const taskSpawner = globalForTaskSpawner.taskSpawner ?? new TaskSpawner()

if (!globalForTaskSpawner.taskSpawner) {
  globalForTaskSpawner.taskSpawner = taskSpawner
}

export const spawnTask = (command: string, args: string[] = [], options: SpawnerOptions = {}) =>
  taskSpawner.spawn(command, args, options)

export const killTask = (processName: string, signal?: NodeJS.Signals) => taskSpawner.killProcess(processName, signal)

export const waitForTask = (processName: string) => taskSpawner.waitForProcess(processName)

export const removeTask = (processName: string) => taskSpawner.removeProcess(processName)
