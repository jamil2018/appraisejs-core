import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { chromium } from 'playwright'

export type DiscoveryBrowserProtocolEvent = {
  method: string
  sessionId?: string
  params: Record<string, unknown>
}

type Reply = { id?: number; result?: unknown; error?: unknown } & DiscoveryBrowserProtocolEvent
type Pending = { method: string; resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }
type PipeLaunch = { executable: string; arguments_: string[] }

export type DiscoveryBrowserTransport = {
  send<T = Record<string, never>>(method: string, params?: object, sessionId?: string): Promise<T>
  events(handler: (event: DiscoveryBrowserProtocolEvent) => void): void
  lost(handler: () => void): void
  close(): Promise<void>
  exited: Promise<void>
  profileDirectory: string
  /** Qualification-only fault injection. Product APIs never receive this transport. */
  breakPipe(): void
  isConnected(): boolean
}

function completion() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}

async function pipeLaunchFromPlaywright(headless: boolean): Promise<PipeLaunch> {
  const probe = await chromium.launchServer({ headless })
  try {
    const process = probe.process()
    const launch = { executable: process.spawnfile, arguments_: process.spawnargs.slice(1) }
    const hasPrivatePipe = launch.arguments_.some(argument => argument === '--remote-debugging-pipe')
    const profileFlagCount = launch.arguments_.filter(argument => argument.startsWith('--user-data-dir=')).length
    if (!hasPrivatePipe || profileFlagCount !== 1)
      throw new Error('Playwright did not provide a supported private-pipe Chromium launch configuration.')
    return launch
  } finally {
    await probe.close()
  }
}

async function liveOwnedProcessIds(groupId: number) {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,pgid=,stat='])
  const rows = stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+(\S+)/gm)
  return Array.from(rows, ([, pid, group, state]) => ({ pid: Number(pid), group: Number(group), state })).flatMap(
    process => (process.group === groupId && !process.state.startsWith('Z') ? [process.pid] : []),
  )
}

async function ownedGroupExited(groupId: number) {
  const expiresAt = Date.now() + 1_000
  do {
    if ((await liveOwnedProcessIds(groupId)).length === 0) return true
    await delay(25)
  } while (Date.now() < expiresAt)
  return (await liveOwnedProcessIds(groupId)).length === 0
}

class OwnedChromiumProcess {
  readonly input: Writable
  readonly output: Readable
  readonly exited: Promise<void>
  private closing: Promise<void> | undefined
  private observedExit = false

  private constructor(
    readonly child: ChildProcess,
    readonly profileDirectory: string,
  ) {
    this.input = child.stdio[3] as Writable
    this.output = child.stdio[4] as Readable
    this.exited = new Promise(resolve => {
      child.once('exit', () => {
        this.observedExit = true
        resolve()
      })
      child.once('error', () => {
        // A failed spawn has no process; an error from a live child is not exit evidence.
        if (!child.pid) {
          this.observedExit = true
          resolve()
        }
      })
    })
  }

  static async launch(headless: boolean) {
    const launch = await pipeLaunchFromPlaywright(headless)
    const profileDirectory = await mkdtemp(join(tmpdir(), 'appraise-quality-journey-'))
    const arguments_ = launch.arguments_.map(argument =>
      argument.startsWith('--user-data-dir=') ? `--user-data-dir=${profileDirectory}` : argument,
    )
    return new OwnedChromiumProcess(
      spawn(launch.executable, arguments_, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: true }),
      profileDirectory,
    )
  }

  close() {
    if (!this.closing) {
      const stopped = completion()
      this.closing = stopped.promise
      void this.release().then(stopped.resolve, stopped.reject)
    }
    return this.closing
  }

  private signal(signal: NodeJS.Signals) {
    if (!this.child.pid || this.observedExit || this.child.exitCode !== null || this.child.signalCode !== null) return
    try {
      process.kill(-this.child.pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }

  private async release() {
    // Detaching CDP can release a paused worker. Stop the original live owned group first.
    this.signal('SIGKILL')
    let timeout: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        this.exited,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Discovery browser did not exit; cleanup is unknown.')), 3_500)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
    if (this.child.pid && !(await ownedGroupExited(this.child.pid)))
      throw new Error('Discovery browser descendants did not exit; cleanup is unknown.')
    await rm(this.profileDirectory, { recursive: true, force: true })
  }
}

class CdpPipeProtocol {
  private readonly pending = new Map<number, Pending>()
  private nextId = 0
  private buffer = ''
  private stopped = false
  private lossNotified = false
  private eventHandler: (event: DiscoveryBrowserProtocolEvent) => void = () => undefined
  private lossHandler: () => void = () => undefined

  constructor(
    private readonly input: Writable,
    private readonly output: Readable,
    process: ChildProcess,
    private readonly onPipeLoss: () => void,
  ) {
    output.setEncoding('utf8')
    output.on('data', (chunk: string) => this.read(chunk))
    for (const stream of [input, output]) stream.on('error', () => this.disconnect())
    output.on('close', () => this.disconnect())
    process.on('exit', () => this.disconnect())
    process.on('error', () => this.disconnect())
  }

  send<T = Record<string, never>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('Discovery browser transport closed.'))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        method,
        resolve: value => resolve(value as T),
        reject,
        timer: setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`Discovery browser CDP command timed out: ${method}.`))
          this.disconnect()
        }, 10_000),
      }
      this.pending.set(id, pending)
      try {
        this.input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
      } catch {
        clearTimeout(pending.timer)
        this.pending.delete(id)
        reject(new Error('Discovery browser transport closed.'))
        this.disconnect()
      }
    })
  }

  events(handler: (event: DiscoveryBrowserProtocolEvent) => void) {
    if (!this.stopped) this.eventHandler = handler
  }

  lost(handler: () => void) {
    if (!this.stopped) this.lossHandler = handler
  }

  fence() {
    if (this.stopped) return
    this.stopped = true
    this.eventHandler = () => undefined
    this.buffer = ''
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Discovery browser transport closed.'))
    }
    this.pending.clear()
  }

  notifyLoss() {
    if (this.lossNotified) return
    this.lossNotified = true
    const handler = this.lossHandler
    this.lossHandler = () => undefined
    // Observer failure must never prevent stopping the owned process or replace a stop failure.
    try {
      handler()
    } catch {}
  }

  dispose() {
    this.input.destroy()
    this.output.destroy()
  }

  breakPipe() {
    this.input.destroy()
    this.output.destroy()
  }

  isConnected() {
    return !this.stopped
  }

  private disconnect() {
    if (this.stopped) return
    this.onPipeLoss()
  }

  private read(chunk: string) {
    if (this.stopped) return
    this.buffer += chunk
    let separator = this.buffer.indexOf('\0')
    while (separator !== -1) {
      this.receive(this.buffer.slice(0, separator))
      if (this.stopped) return
      this.buffer = this.buffer.slice(separator + 1)
      separator = this.buffer.indexOf('\0')
    }
  }

  private receive(message: string) {
    try {
      const reply = JSON.parse(message) as Reply
      if (reply.id === undefined) return this.eventHandler(reply)
      const pending = this.pending.get(reply.id)
      if (!pending) return
      this.pending.delete(reply.id)
      clearTimeout(pending.timer)
      if (reply.error) pending.reject(new Error(`Discovery browser CDP command failed: ${pending.method}.`))
      else pending.resolve(reply.result)
    } catch {
      this.disconnect()
    }
  }
}

/** Launches an owned Chromium with its DevTools protocol on private stdio pipes. */
export async function launchDiscoveryBrowserTransport(headless = false): Promise<DiscoveryBrowserTransport> {
  if (process.platform !== 'darwin' && process.platform !== 'linux')
    throw new Error('Discovery browser pipe runtime supports macOS and Linux only.')

  const owned = await OwnedChromiumProcess.launch(headless)
  const protocol = new CdpPipeProtocol(owned.input, owned.output, owned.child, () => {
    void close().catch(() => undefined)
  })
  let closing: Promise<void> | undefined
  const close = () => {
    if (closing) return closing
    const closed = completion()
    closing = closed.promise
    protocol.fence()
    // release() sends SIGKILL synchronously before its first await and before loss observers.
    const stopped = owned.close()
    protocol.notifyLoss()
    void stopped.then(() => {
      protocol.dispose()
      closed.resolve()
    }, closed.reject)
    return closing
  }
  return {
    profileDirectory: owned.profileDirectory,
    send: protocol.send.bind(protocol),
    events: protocol.events.bind(protocol),
    lost: protocol.lost.bind(protocol),
    close,
    exited: owned.exited,
    breakPipe: protocol.breakPipe.bind(protocol),
    isConnected: protocol.isConnected.bind(protocol),
  }
}
