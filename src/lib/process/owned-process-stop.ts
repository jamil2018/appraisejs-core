import { execFile } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { spawnTask, type SpawnedProcess, type SpawnerOptions } from './task-spawner'

const execFileAsync = promisify(execFile)
export type OwnedProcessStopObservation = {
  kind: 'group_exit_observed'
  groupId: number
  observedAt: string
  supervisorProtocol: 'appraise.owned-supervisor/v1'
  runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED' | 'NOT_REQUIRED'
}

export class OwnedProcessStopError extends Error {
  constructor(
    readonly kind: 'ownership_unavailable' | 'exit_unverified',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'OwnedProcessStopError'
  }
}

type Capability = {
  nonce: string
  started: boolean
  finished: boolean
  escalating: boolean
  failed: boolean
  requireRuntimeBrowserClose: boolean
  browserClosed: boolean
  stopFlight?: Promise<OwnedProcessStopObservation>
}
type SupervisorMessage = {
  type: string
  nonce: unknown
  childPid?: unknown
  reason?: unknown
  browserClosed?: unknown
}
const capabilities = new WeakMap<SpawnedProcess, Capability>()

function parseSupervisorMessage(value: unknown): SupervisorMessage | undefined {
  if (!value || typeof value !== 'object' || !('type' in value) || !('nonce' in value)) return
  return value as SupervisorMessage
}

function applySupervisorStatus(
  capability: Capability,
  message: SupervisorMessage,
  settleStart: (() => void) | undefined,
  failStart: ((error: Error) => void) | undefined,
) {
  if (message.type === 'started' && Number.isSafeInteger(message.childPid)) {
    capability.started = true
    settleStart?.()
  }
  if (message.type === 'finished' || message.type === 'escalating') {
    capability.browserClosed = message.browserClosed === true
    if (message.type === 'finished') capability.finished = true
    else capability.escalating = true
  }
  if (message.type === 'failed') {
    capability.failed = true
    failStart?.(new Error(`Owned supervisor failed: ${String(message.reason)}`))
  }
}

async function liveGroupMembers(groupId: number): Promise<number[]> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,pgid=,stat='])
  return Array.from(stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+(\S+)/gm), ([, pid, group, state]) => ({
    pid: Number(pid),
    group: Number(group),
    state,
  })).flatMap(row => (row.group === groupId && !row.state.startsWith('Z') ? [row.pid] : []))
}

async function groupExited(groupId: number, timeoutMs: number): Promise<boolean> {
  const expiresAt = Date.now() + timeoutMs
  do {
    if ((await liveGroupMembers(groupId)).length === 0) return true
    await delay(25)
  } while (Date.now() < expiresAt)
  return (await liveGroupMembers(groupId)).length === 0
}

function waitForExit(spawned: SpawnedProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (spawned.process.exitCode !== null || spawned.process.signalCode !== null) return resolve()
    const timer = setTimeout(() => {
      cleanup()
      reject(new OwnedProcessStopError('exit_unverified', 'Owned supervisor did not exit in time.'))
    }, timeoutMs)
    const onExit = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      clearTimeout(timer)
      spawned.process.off('exit', onExit)
    }
    spawned.process.once('exit', onExit)
  })
}

function send(spawned: SpawnedProcess, message: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!spawned.process.connected)
      return reject(new OwnedProcessStopError('ownership_unavailable', 'Owned supervisor IPC is unavailable.'))
    spawned.process.send(message, error => (error ? reject(error) : resolve()))
  })
}

/** Launches the exact command only after a private nonce handshake with a live local supervisor. */
export async function spawnOwnedProcessGroup(
  command: string,
  args: string[],
  options: Omit<SpawnerOptions, 'cwd' | 'env'> & {
    supervisorPath: string
    cwd: string
    env: Record<string, string>
    requireRuntimeBrowserClose?: boolean
  },
): Promise<SpawnedProcess> {
  if (process.platform === 'win32')
    throw new OwnedProcessStopError('ownership_unavailable', 'Owned process groups require a POSIX host.')
  const { supervisorPath, cwd, env, requireRuntimeBrowserClose = false, ...taskOptions } = options
  const spawned = await spawnTask(process.execPath, [supervisorPath], {
    ...taskOptions,
    cwd,
    env: { PATH: process.env.PATH ?? '' },
    extendEnv: false,
    detached: true,
    ipc: true,
    serialization: 'json',
  })
  const capability: Capability = {
    nonce: '',
    started: false,
    finished: false,
    escalating: false,
    failed: false,
    requireRuntimeBrowserClose,
    browserClosed: false,
  }
  let settleStart: (() => void) | undefined
  let failStart: ((error: Error) => void) | undefined
  const started = new Promise<void>((resolve, reject) => {
    settleStart = resolve
    failStart = reject
  })
  const timer = setTimeout(() => failStart?.(new Error('Owned supervisor startup timed out.')), 5_000)
  const onMessage = (value: unknown) => {
    const message = parseSupervisorMessage(value)
    if (!message) return
    if (message.type === 'ready' && typeof message.nonce === 'string' && !capability.nonce) {
      capability.nonce = message.nonce
      void send(spawned, {
        type: 'start',
        nonce: message.nonce,
        command,
        args,
        cwd,
        env,
        requireRuntimeBrowserClose,
      }).catch(error => failStart?.(error))
      return
    }
    if (message.nonce !== capability.nonce) return
    applySupervisorStatus(capability, message, settleStart, failStart)
  }
  spawned.process.on('message', onMessage)
  spawned.process.once('exit', () => {
    if (!capability.started) failStart?.(new Error('Owned supervisor exited before child launch.'))
  })
  spawned.process.on('disconnect', () => {
    if (!capability.finished && !capability.escalating) capability.failed = true
    if (!capability.started) failStart?.(new Error('Owned supervisor IPC disconnected before child launch.'))
  })
  try {
    await started
  } catch (error) {
    if (capability.nonce && spawned.process.connected) {
      // A launch request might have reached the supervisor even when its reply
      // did not. Request cleanup over that same private channel.
      try {
        await send(spawned, {
          type: 'stop',
          nonce: capability.nonce,
          termWaitMs: 1_500,
          killWaitMs: 2_000,
        })
        await waitForExit(spawned, 6_500)
      } catch {
        spawned.process.disconnect()
      }
    } else if (!capability.nonce) {
      // No nonce means no command was ever granted to this supervisor.
      spawned.process.kill('SIGKILL')
    }
    throw new OwnedProcessStopError('ownership_unavailable', 'Owned supervisor startup failed.', { cause: error })
  } finally {
    clearTimeout(timer)
  }
  capabilities.set(spawned, capability)
  return spawned
}

/** A raw or restored PID is never sufficient authority to register a process group. */
export function registerOwnedProcessGroup(spawned: SpawnedProcess): never {
  void spawned
  throw new OwnedProcessStopError('ownership_unavailable', 'Raw process-group registration is not supported.')
}

async function requestStopIfLive(
  spawned: SpawnedProcess,
  capability: Capability,
  options: { termWaitMs?: number; killWaitMs?: number },
): Promise<void> {
  if (capability.finished || capability.escalating) return
  if (spawned.process.exitCode !== null || spawned.process.signalCode !== null) return
  if (!spawned.process.connected || capability.failed)
    throw new OwnedProcessStopError('ownership_unavailable', 'Owned supervisor IPC continuity was lost.')
  await send(spawned, {
    type: 'stop',
    nonce: capability.nonce,
    termWaitMs: options.termWaitMs ?? 1_500,
    killWaitMs: options.killWaitMs ?? 2_000,
  })
}

async function verifyOwnedExit(
  spawned: SpawnedProcess,
  capability: Capability,
  killWaitMs: number,
): Promise<OwnedProcessStopObservation> {
  if (capability.failed || (!capability.finished && !capability.escalating))
    throw new OwnedProcessStopError('exit_unverified', 'Owned supervisor exited without a verified drain protocol.')
  if (capability.requireRuntimeBrowserClose && !capability.browserClosed)
    throw new OwnedProcessStopError('exit_unverified', 'Managed browser closure was not acknowledged.')
  if (!(await groupExited(spawned.pid!, killWaitMs)))
    throw new OwnedProcessStopError('exit_unverified', 'Owned process-group members remain after supervisor exit.')
  return {
    kind: 'group_exit_observed',
    groupId: spawned.pid!,
    observedAt: new Date().toISOString(),
    supervisorProtocol: 'appraise.owned-supervisor/v1',
    runtimeBrowserCleanup: capability.requireRuntimeBrowserClose ? 'CLOSE_ACKNOWLEDGED' : 'NOT_REQUIRED',
  }
}

async function observeOwnedStop(
  spawned: SpawnedProcess,
  capability: Capability,
  options: { termWaitMs?: number; killWaitMs?: number },
): Promise<OwnedProcessStopObservation> {
  try {
    await requestStopIfLive(spawned, capability, options)
    await waitForExit(spawned, (options.termWaitMs ?? 1_500) + (options.killWaitMs ?? 2_000) + 3_000)
    return await verifyOwnedExit(spawned, capability, options.killWaitMs ?? 2_000)
  } catch (error) {
    if (error instanceof OwnedProcessStopError) throw error
    throw new OwnedProcessStopError('exit_unverified', 'Owned process-group exit could not be verified.', {
      cause: error,
    })
  }
}

/** Only the live supervisor can signal its own process group. */
export function stopOwnedProcessGroup(
  spawned: SpawnedProcess,
  options: { termWaitMs?: number; killWaitMs?: number } = {},
): Promise<OwnedProcessStopObservation> {
  const capability = capabilities.get(spawned)
  if (!capability?.started || !spawned.pid || spawned.process.pid !== spawned.pid)
    return Promise.reject(
      new OwnedProcessStopError('ownership_unavailable', 'Owned supervisor capability is unavailable.'),
    )
  capability.stopFlight ??= observeOwnedStop(spawned, capability, options)
  return capability.stopFlight
}

export async function ensureOwnedProcessGroupExited(spawned: SpawnedProcess): Promise<void> {
  await stopOwnedProcessGroup(spawned)
}
