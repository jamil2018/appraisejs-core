import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { spawnOwnedProcessGroup, stopOwnedProcessGroup } from '../../process/owned-process-stop'
import type { SpawnedProcess } from '../../process/task-spawner'
import { RpcTransport, type RpcTransportOptions } from './rpc-transport'

export type OwnedChildCleanupReceipt = {
  status: 'stopped' | 'uncertain'
  groupExitObserved: boolean
  privateRootRemoved: boolean
  privateRootRetained: boolean
  reason?: 'owned_drain_unverified' | 'private_root_cleanup_failed'
}
export type OwnedFixtureChild = {
  transport: Readonly<Pick<RpcTransport, 'request' | 'notifyInitialized' | 'fence' | 'snapshot'>>
  transportId: string
  stop: () => Promise<OwnedChildCleanupReceipt>
}
export type OwnedFixtureChildOptions = Pick<RpcTransportOptions, 'onNotification' | 'onFault' | 'requestTimeoutMs'> & {
  transportId?: string
  fixturePath: string
  fixtureArgs?: string[]
}

/** Launch failures expose only bounded local codes, never child output or configuration contents. */
class OwnedChildLaunchError extends Error {
  constructor(readonly privateRootRetained: boolean) {
    super(
      privateRootRetained
        ? 'Owned fixture launch failed; private recovery root retained.'
        : 'Owned fixture launch failed.',
    )
    this.name = 'OwnedChildLaunchError'
  }
}

async function fixtureCommand(options: OwnedFixtureChildOptions): Promise<string[]> {
  if (!path.isAbsolute(options.fixturePath)) throw new OwnedChildLaunchError(false)
  const fixturePath = await realpath(options.fixturePath)
  if (!(await stat(fixturePath)).isFile()) throw new OwnedChildLaunchError(false)
  const fixtureArgs = options.fixtureArgs ?? []
  if (
    !Array.isArray(fixtureArgs) ||
    fixtureArgs.length > 64 ||
    fixtureArgs.some(arg => typeof arg !== 'string' || Buffer.byteLength(arg) > 16_384)
  )
    throw new OwnedChildLaunchError(false)
  return [fixturePath, ...fixtureArgs]
}

async function privateEnvironment(privateRoot: string): Promise<Record<string, string>> {
  await chmod(privateRoot, 0o700)
  const home = path.join(privateRoot, 'home')
  const codexHome = path.join(privateRoot, 'codex')
  const temporary = path.join(privateRoot, 'tmp')
  await Promise.all([home, codexHome, temporary].map(directory => mkdir(directory, { mode: 0o700 })))
  await writeFile(path.join(codexHome, 'config.toml'), '', { mode: 0o600, flag: 'wx' })
  return { HOME: home, CODEX_HOME: codexHome, TMPDIR: temporary, LANG: 'C.UTF-8' }
}

function processTransport(spawned: SpawnedProcess, options: RpcTransportOptions): RpcTransport {
  const { stdin, stdout, stderr } = spawned.process
  if (!stdin || !stdout || !stderr) throw new Error('private_stdio_unavailable')
  // privateStdio keeps pipes paused until transport handlers attach and resume them.
  const transport = new RpcTransport({ stdin, stdout, stderr }, options)
  function processFault(reason: string) {
    if (transport.snapshot().status === 'fenced') return
    transport.fence(reason)
    try {
      options.onFault(reason)
    } catch {
      /* Consumer callback cannot disrupt owned cleanup. */
    }
  }
  spawned.process.once('error', () => processFault('child_error'))
  spawned.process.once('exit', () => processFault('child_exit'))
  return transport
}

async function removePrivateRoot(privateRoot: string): Promise<boolean> {
  try {
    await rm(privateRoot, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

async function cleanupOwnedChild(owned: SpawnedProcess, privateRoot: string): Promise<OwnedChildCleanupReceipt> {
  try {
    await stopOwnedProcessGroup(owned)
  } catch {
    return {
      status: 'uncertain',
      groupExitObserved: false,
      privateRootRemoved: false,
      privateRootRetained: true,
      reason: 'owned_drain_unverified',
    }
  }
  if (await removePrivateRoot(privateRoot))
    return { status: 'stopped', groupExitObserved: true, privateRootRemoved: true, privateRootRetained: false }
  return {
    status: 'uncertain',
    groupExitObserved: true,
    privateRootRemoved: false,
    privateRootRetained: true,
    reason: 'private_root_cleanup_failed',
  }
}

async function cleanupFailedLaunch(
  privateRoot: string,
  launchAttempted: boolean,
  spawned?: SpawnedProcess,
): Promise<boolean> {
  let safeToRemove = !launchAttempted
  if (spawned) {
    try {
      await stopOwnedProcessGroup(spawned)
      safeToRemove = true
    } catch {
      /* Preserve private evidence whenever owned drain is uncertain. */
    }
  }
  return safeToRemove && (await removePrivateRoot(privateRoot))
}

function ownedFixture(
  transport: RpcTransport,
  spawned: SpawnedProcess,
  privateRoot: string,
  transportId: string,
): OwnedFixtureChild {
  const facade = Object.freeze({
    request: transport.request.bind(transport),
    notifyInitialized: transport.notifyInitialized.bind(transport),
    fence: transport.fence.bind(transport),
    snapshot: transport.snapshot.bind(transport),
  })
  let stopFlight: Promise<OwnedChildCleanupReceipt> | undefined
  return {
    transport: facade,
    transportId,
    stop() {
      // Revoke the only write gate synchronously, before any group-drain await.
      transport.fence('owned_stop')
      stopFlight ??= cleanupOwnedChild(spawned, privateRoot)
      return stopFlight
    },
  }
}

/** The only enabled launch surface is an explicitly selected local Node fixture. */
export async function launchOwnedFixtureChild(options: OwnedFixtureChildOptions): Promise<OwnedFixtureChild> {
  const args = await fixtureCommand(options)
  const supervisorPath = fileURLToPath(new URL('../../../../scripts/owned-process-supervisor.mjs', import.meta.url))
  const privateRoot = await mkdtemp(path.join(tmpdir(), 'appraise-m05-fixture-'))
  let spawned: SpawnedProcess | undefined
  let launchAttempted = false
  let transport: RpcTransport | undefined
  try {
    const env = await privateEnvironment(privateRoot)
    launchAttempted = true
    spawned = await spawnOwnedProcessGroup(process.execPath, args, {
      supervisorPath,
      cwd: privateRoot,
      env,
      streamLogs: false,
      captureOutput: false,
      retainProcessRecord: false,
      privateStdio: true,
    })
    transport = processTransport(spawned, options)
    return ownedFixture(transport, spawned, privateRoot, options.transportId ?? randomUUID())
  } catch {
    transport?.fence('launch_failed')
    const removed = await cleanupFailedLaunch(privateRoot, launchAttempted, spawned)
    throw new OwnedChildLaunchError(!removed)
  }
}

/** M05 does not grant a production provider launch capability. */
export function launchOwnedProviderChild(): never {
  throw new Error('Production provider launch is not authorized or qualified.')
}
