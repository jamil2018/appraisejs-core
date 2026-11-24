import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import type { Stats } from 'node:fs'
import { chmod, mkdir, mkdtemp, open, realpath, rm, stat, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Transform } from 'node:stream'

import type { CodexReadTransport } from './codex-read-provider'

const SANDBOX_EXEC = '/usr/bin/sandbox-exec'
const MAX_IMAGE_BYTES = 512 * 1024 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const MAX_STDOUT_BYTES = 1024 * 1024
const STOP_GRACE_MS = 500
const STOP_KILL_MS = 2_000

export type MacCodexReadImage = Readonly<{ executable: string; sha256: string }>
export type MacCodexReadLaunch = MacCodexReadImage &
  Readonly<{ brokerPort: number; brokerToken: string; args: readonly string[] }>

export function configuredMacCodexReadExecutable(): MacCodexReadImage | undefined {
  const executable = process.env.APPRAISE_CODEX_READ_EXECUTABLE
  const sha256 = process.env.APPRAISE_CODEX_READ_SHA256
  if (executable === undefined && sha256 === undefined) return undefined
  if (!executable || !sha256) throw new Error('Native Codex read image configuration is incomplete.')
  validateImage({ executable, sha256 })
  return { executable, sha256 }
}

function validateImage(image: MacCodexReadImage): void {
  if (
    typeof image.executable !== 'string' ||
    !path.isAbsolute(image.executable) ||
    path.basename(image.executable) !== 'codex' ||
    /[\x00-\x1f\x7f]/.test(image.executable) ||
    typeof image.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(image.sha256)
  ) {
    throw new Error('Invalid native Codex read image configuration.')
  }
}

function validateLaunch(launch: MacCodexReadLaunch): void {
  validateImage(launch)
  if (!validBrokerPort(launch.brokerPort) || !validBrokerToken(launch.brokerToken) || !validArguments(launch.args)) {
    throw new Error('Invalid native Codex read launch.')
  }
}

function validBrokerPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

function validBrokerToken(token: string): boolean {
  return typeof token === 'string' && /^[\x21-\x7e]{16,512}$/.test(token)
}

function validArgument(arg: string): boolean {
  return typeof arg === 'string' && arg.length <= 2048 && !/[\x00-\x1f\x7f]/.test(arg)
}

function validArguments(args: readonly string[]): boolean {
  return Array.isArray(args) && args.length <= 48 && args[0] === 'app-server' && args.every(validArgument)
}

function requireNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('Native Codex read was aborted.')
}

function validateImageMetadata(identity: Stats): void {
  if (!identity.isFile() || identity.size < 4 || identity.size > MAX_IMAGE_BYTES || (identity.mode & 0o022) !== 0) {
    throw new Error('Native Codex image must be a regular, non-writable file within the size limit.')
  }
}

async function writeAll(output: FileHandle, chunk: Buffer, bytesRead: number, offset: number): Promise<void> {
  let written = 0
  while (written < bytesRead) {
    const result = await output.write(chunk, written, bytesRead - written, offset + written)
    if (result.bytesWritten === 0) throw new Error('Native Codex image copy did not complete.')
    written += result.bytesWritten
  }
}

async function copyImageBytes(
  input: FileHandle,
  output: FileHandle,
  size: number,
  signal: AbortSignal,
): Promise<{ sha256: string; magic: string | undefined }> {
  const hash = createHash('sha256')
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  let offset = 0
  let magic: string | undefined
  while (offset < size) {
    requireNotAborted(signal)
    const { bytesRead } = await input.read(chunk, 0, Math.min(chunk.length, size - offset), offset)
    if (bytesRead === 0) throw new Error('Native Codex image changed during copy.')
    if (offset === 0) magic = chunk.subarray(0, 4).toString('hex')
    hash.update(chunk.subarray(0, bytesRead))
    await writeAll(output, chunk, bytesRead, offset)
    offset += bytesRead
  }
  return { sha256: hash.digest('hex'), magic }
}

function validatePinnedImage(before: Stats, after: Stats, sha256: string, expected: string, magic?: string): void {
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
    throw new Error('Native Codex image changed during copy.')
  }
  if (sha256 !== expected) throw new Error('Native Codex image SHA-256 did not match.')
  if (!magic || !['cffaedfe', 'feedfacf', 'cafebabe', 'bebafeca'].includes(magic)) {
    throw new Error('Native Codex image is not a supported Mach-O executable.')
  }
}

async function pinImage(
  source: string,
  expectedSha256: string,
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  if ((await realpath(source)) !== source) throw new Error('Native Codex image path must be canonical.')
  const handle = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const identity = await handle.stat()
    validateImageMetadata(identity)
    const output = await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    try {
      const copied = await copyImageBytes(handle, output, identity.size, signal)
      const after = await handle.stat()
      validatePinnedImage(identity, after, copied.sha256, expectedSha256, copied.magic)
      await output.sync()
    } finally {
      await output.close()
    }
    await chmod(destination, 0o500)
  } finally {
    await handle.close()
  }
}

function quote(value: string): string {
  return JSON.stringify(value)
}

/** Deny by default. The only outbound socket is the fresh per-read broker port. */
function sandboxProfile(root: string, image: string, port: number): string {
  const home = path.join(root, 'home')
  const temporary = path.join(root, 'tmp')
  const cwd = path.join(root, 'cwd')
  const metadata = new Set<string>([
    '/',
    '/etc',
    '/var',
    '/private',
    '/private/etc',
    '/private/var',
    '/private/tmp',
    root,
    image,
  ])
  for (const target of [home, temporary, cwd]) {
    let at = target
    while (at !== '/') {
      metadata.add(at)
      at = path.dirname(at)
    }
  }
  return (
    [
      '(version 1)',
      '(deny default)',
      '(deny network*)',
      '(allow sysctl-read)',
      '(allow system-info (info-type "vfs.disk-space"))',
      '(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo"))',
      '(allow signal (target same-sandbox))',
      `(allow process-exec (literal ${quote(image)}))`,
      `(allow file-map-executable (literal ${quote(image)}) (subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple/System/Library"))`,
      `(allow file-read-data (literal "/"))`,
      `(allow file-read* (subpath "/System") (subpath "/usr/lib") (subpath "/Library/Apple/System/Library") (subpath "/private/var/db/dyld") (subpath ${quote(root)}) (literal "/dev/null") (literal "/dev/urandom"))`,
      `(allow file-read-metadata ${[...metadata].map(item => `(literal ${quote(item)})`).join(' ')})`,
      `(allow file-write* (subpath ${quote(home)}) (subpath ${quote(temporary)}) (subpath ${quote(cwd)}))`,
      `(allow network-outbound (remote ip "localhost:${port}"))`,
    ].join('\n') + '\n'
  )
}

async function waitForClose(child: ReturnType<typeof spawn>, isClosed: () => boolean, ms: number): Promise<boolean> {
  if (isClosed()) return true
  return await new Promise<boolean>(resolve => {
    const onClose = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    const timeout = setTimeout(() => {
      child.removeListener('close', onClose)
      resolve(false)
    }, ms)
    child.once('close', onClose)
  })
}

export async function openMacCodexReadTransport(
  launch: MacCodexReadLaunch,
  signal: AbortSignal,
): Promise<CodexReadTransport> {
  if (process.platform !== 'darwin') throw new Error('Native Codex read requires macOS.')
  validateLaunch(launch)
  requireNotAborted(signal)
  const sandbox = await stat(SANDBOX_EXEC)
  if (!sandbox.isFile() || (sandbox.mode & 0o022) !== 0) throw new Error('macOS sandbox executable is not qualified.')

  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'appraise-codex-read-')))
  const home = path.join(root, 'home')
  const temporary = path.join(root, 'tmp')
  const cwd = path.join(root, 'cwd')
  const image = path.join(root, 'codex')
  let child: ReturnType<typeof spawn> | undefined
  let closed = false
  try {
    await Promise.all([mkdir(home, { mode: 0o700 }), mkdir(temporary, { mode: 0o700 }), mkdir(cwd, { mode: 0o700 })])
    await mkdir(path.join(home, '.codex'), { mode: 0o700 })
    await pinImage(launch.executable, launch.sha256, image, signal)
    requireNotAborted(signal)
    const profile = path.join(root, 'sandbox.sb')
    await writeFile(profile, sandboxProfile(root, image, launch.brokerPort), { mode: 0o400, flag: 'wx' })
    requireNotAborted(signal)

    const running = spawn(SANDBOX_EXEC, ['-f', profile, image, ...launch.args], {
      cwd,
      env: {
        NODE_ENV: 'production',
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        TMPDIR: temporary,
        XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_CACHE_HOME: path.join(home, '.cache'),
        XDG_DATA_HOME: path.join(home, '.local', 'share'),
        PATH: '/usr/bin:/bin',
        ACCESS_TOKEN: launch.brokerToken,
        NO_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'] as const,
      windowsHide: true,
    })
    child = running
    running.once('close', () => {
      closed = true
    })
    running.stdin.on('error', () => undefined)
    running.stdout.on('error', () => undefined)
    let stdoutBytes = 0
    const boundedStdout = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        stdoutBytes += chunk.length
        callback(
          stdoutBytes > MAX_STDOUT_BYTES ? new Error('Native Codex output exceeded the limit.') : null,
          stdoutBytes > MAX_STDOUT_BYTES ? undefined : chunk,
        )
      },
    })
    boundedStdout.on('error', () => running.kill('SIGKILL'))
    running.stdout.pipe(boundedStdout)
    let stderrBytes = 0
    running.stderr.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length
      if (stderrBytes > MAX_STDERR_BYTES) running.kill('SIGKILL')
    })
    running.stderr.on('error', () => undefined)
    await new Promise<void>((resolve, reject) => {
      const onSpawn = () => {
        running.removeListener('error', onError)
        resolve()
      }
      const onError = (error: Error) => {
        running.removeListener('spawn', onSpawn)
        reject(error)
      }
      running.once('spawn', onSpawn)
      running.once('error', onError)
    })
    let stopped: Promise<void> | undefined
    const stop = () => {
      stopped ??= (async () => {
        signal.removeEventListener('abort', onAbort)
        running.stdin.destroy()
        if (!(await waitForClose(running, () => closed, 0))) {
          running.kill('SIGTERM')
          if (!(await waitForClose(running, () => closed, STOP_GRACE_MS))) {
            running.kill('SIGKILL')
            if (!(await waitForClose(running, () => closed, STOP_KILL_MS))) {
              throw new Error('Native Codex read process could not be reaped.')
            }
          }
        }
        await rm(root, { recursive: true, force: true })
      })()
      return stopped
    }
    const onAbort = () => {
      void stop().catch(() => undefined)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      await stop()
      requireNotAborted(signal)
    }
    return {
      stdin: running.stdin,
      stdout: boundedStdout,
      isolatedCwd: cwd,
      isolatedHome: home,
      isolationVerified: true,
      stop,
    }
  } catch (error) {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await waitForClose(child, () => closed, STOP_KILL_MS).catch(() => undefined)
    }
    await rm(root, { recursive: true, force: true })
    throw error
  }
}
