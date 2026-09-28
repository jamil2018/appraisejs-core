import { execFile, spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { chromium } from 'playwright'

// Owns a disposable synthetic-test Chromium. No debugging port or shared browser.
type ProtocolEvent = { method: string; sessionId?: string; params: Record<string, unknown> }
type Reply = { id?: number; result?: unknown; error?: unknown } & ProtocolEvent
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }

// A group may retain defunct processes after the browser exits. Never send a
// second signal merely because the group ID once existed: first check live members.
async function liveGroupMembers(groupId: number) {
  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,pgid=,stat='])
  return stdout
    .trim()
    .split('\n')
    .flatMap(line => {
      const [pid, group, state] = line.trim().split(/\s+/)
      return Number(group) === groupId && !state.startsWith('Z') ? [Number(pid)] : []
    })
}
async function waitForGroupExit(groupId: number) {
  const deadline = Date.now() + 1000
  while ((await liveGroupMembers(groupId)).length > 0) {
    if (Date.now() >= deadline) return false
    await delay(25)
  }
  return true
}

export async function launchTargetTransport(headless = true) {
  // Use the exact executable and flags selected by the installed Playwright.
  // The discovery launcher is closed before creating the owned pipe browser.
  const launcher = await chromium.launchServer({ headless })
  let executable: string
  let launchArgs: string[]
  try {
    executable = launcher.process().spawnfile
    launchArgs = launcher.process().spawnargs.slice(1)
  } finally {
    await launcher.close()
  }
  if (
    !launchArgs.includes('--remote-debugging-pipe') ||
    launchArgs.filter(arg => arg.startsWith('--user-data-dir=')).length !== 1
  ) {
    throw new Error('Unsupported synthetic Chromium launch configuration')
  }
  const directory = await mkdtemp(join(tmpdir(), 'appraise-c233-target-'))
  const args = launchArgs.map(arg => (arg.startsWith('--user-data-dir=') ? `--user-data-dir=${directory}` : arg))
  const child = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  function signalOwnedGroup(signal: NodeJS.Signals) {
    if (!child.pid) return
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  const input = child.stdio[3] as Writable
  const output = child.stdio[4] as Readable
  const pending = new Map<number, Pending>()
  let nextId = 0
  let buffer = ''
  let stopped = false
  let closing: Promise<void> | undefined
  let onEvent: (event: ProtocolEvent) => void = () => undefined
  let onLoss: () => void = () => undefined
  const exited = new Promise<void>(resolve => {
    child.once('exit', () => resolve())
    child.once('error', () => resolve())
  })
  function lose() {
    if (stopped) return
    stopped = true
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(new Error('Synthetic Chromium transport closed'))
    }
    pending.clear()
    onLoss()
  }
  function receive(message: string) {
    try {
      const reply = JSON.parse(message) as Reply
      if (reply.id !== undefined) {
        const item = pending.get(reply.id)
        if (!item) return
        pending.delete(reply.id)
        clearTimeout(item.timer)
        if (reply.error) item.reject(new Error('Synthetic CDP command failed'))
        else item.resolve(reply.result)
      } else onEvent(reply)
    } catch {
      lose()
    }
  }
  output.setEncoding('utf8')
  output.on('data', (chunk: string) => {
    buffer += chunk
    let end: number
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      receive(message)
    }
  })
  input.on('error', lose)
  output.on('error', lose)
  output.on('close', lose)
  child.on('exit', lose)
  child.on('error', lose)
  function send<T = Record<string, never>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (stopped) return Promise.reject(new Error('Synthetic Chromium transport closed'))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Synthetic CDP command timed out'))
        lose()
      }, 3000)
      pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      input.write(JSON.stringify({ id, method, params, sessionId }) + '\0')
    })
  }
  function close() {
    closing ??= Promise.resolve().then(async () => {
      lose()
      signalOwnedGroup('SIGTERM')
      let forceError: unknown
      const force = setTimeout(() => {
        try {
          signalOwnedGroup('SIGKILL')
        } catch (error) {
          forceError = error
        }
      }, 1500)
      let deadline!: NodeJS.Timeout
      try {
        await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(forceError ?? new Error('Synthetic Chromium did not exit')), 3500)
          }),
        ])
      } finally {
        clearTimeout(force)
        clearTimeout(deadline)
      }
      if (child.pid && process.platform !== 'win32' && !(await waitForGroupExit(child.pid))) {
        signalOwnedGroup('SIGKILL')
        if (!(await waitForGroupExit(child.pid))) throw new Error('Synthetic Chromium descendants did not exit')
      }
      input.destroy()
      output.destroy()
      buffer = ''
      await rm(directory, { recursive: true, force: true })
    })
    return closing
  }
  return {
    profileDirectory: directory,
    executableName: basename(executable),
    send,
    close,
    exited,
    events(handler: typeof onEvent) {
      onEvent = handler
    },
    lost(handler: typeof onLoss) {
      onLoss = handler
    },
    breakPipe() {
      input.destroy()
      output.destroy()
    },
  }
}
