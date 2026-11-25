import { execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createReadStream, rmSync } from 'node:fs'
import { copyFile, lstat, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { openProviderLookupEgress } from './claude-code-egress'
import { startCursorCommand } from './cursor-process'
import { cursorPrivateDirectory, withEncryptedCursorProfile } from './cursor-profile'

const execute = promisify(execFile)
const maxArchiveBytes = 512 * 1024 * 1024
const maxOutputBytes = 256 * 1024
const sandboxExecutable = '/usr/bin/sandbox-exec'
const lookupMaxConnections = 32

// Cursor's documented agent and authentication endpoints. MCPs, web fetches,
// background agents, updates, and telemetry cannot use the lookup relay.
const lookupDestinations = new Set([
  'api2.cursor.sh',
  'api5.cursor.sh',
  'agent.api5.cursor.sh',
  'agentn.api5.cursor.sh',
  'agent.us.api5.cursor.sh',
  'agentn.us.api5.cursor.sh',
  'agent.global.api5.cursor.sh',
  'agentn.global.api5.cursor.sh',
  'authenticate.cursor.sh',
  'prod.authentication.cursor.sh',
  'authentication.cursor.sh',
  'cursor.com',
])

const privateFiles = `(deny file-read-data file-write*)
(allow file-read-data
  (literal "/")
  (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share/icu")
  (subpath "/Library/Apple/System/Library") (subpath "/private/var/db/dyld")
  (literal "/private/etc/hosts") (literal "/private/etc/resolv.conf")
  (literal "/private/etc/localtime") (subpath "/private/var/db/timezone")
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  (subpath (param "BUNDLE")) (subpath (param "PROFILE")) (subpath (param "SCRATCH")))
(allow file-write*
  (literal "/dev/null")
  (subpath (param "PROFILE")) (subpath (param "SCRATCH")))`

const authSandbox = `(version 1)
(allow default)
(deny process-exec)
(allow process-exec (literal (param "NODE")) (literal "/usr/bin/open"))
${privateFiles}
(allow file-read-data (literal "/usr/bin/open"))`

const lookupSandbox = `(version 1)
(allow default)
(deny process-exec)
(allow process-exec (literal (param "NODE")))
(deny network*)
(allow network-outbound (remote ip (param "EGRESS")))
${privateFiles}
(deny file-write* (subpath (param "WORKSPACE_CONFIG")))`

export type CursorAuthCommand = 'status' | 'login' | 'logout'
export type CursorAuthReply = { exitCode: number; output: string }
export type CursorCli = {
  auth: (command: CursorAuthCommand, signal?: AbortSignal) => Promise<CursorAuthReply>
  lookup: <T>(
    interact: (child: ChildProcessWithoutNullStreams, cwd: string) => Promise<T>,
    signal: AbortSignal,
  ) => Promise<T>
}

async function verifyArchive(source: string, archive: string, expectedDigest: string) {
  const info = await stat(source)
  if (!info.isFile() || info.size <= 0 || info.size > maxArchiveBytes) throw new Error('Invalid Cursor CLI archive.')
  await copyFile(source, archive, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
  const copied = await stat(archive)
  if (copied.size <= 0 || copied.size > maxArchiveBytes) throw new Error('Invalid Cursor CLI archive.')
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(archive)) digest.update(chunk)
  if (digest.digest('hex') !== expectedDigest) throw new Error('Cursor CLI archive verification failed.')
}

function verifyTarEntries(output: string) {
  for (const entry of output.trimEnd().split('\n')) {
    const file = entry.slice(entry.lastIndexOf(' ') + 1)
    if (
      !/^[-d]/.test(entry) ||
      !/^dist-package\/(?:[A-Za-z0-9_.@+-]+\/?)*$/.test(file) ||
      file.split('/').some(part => part === '..' || part === '.')
    ) {
      throw new Error('Unexpected entry in the Cursor CLI archive.')
    }
  }
}

async function stageBundle(source: string, expectedDigest: string) {
  const bundle = await mkdtemp(path.join(await realpath(tmpdir()), 'appraise-cursor-bundle-'))
  const archive = path.join(bundle, 'cursor.tar.gz')
  try {
    await verifyArchive(source, archive, expectedDigest)

    const tarOptions = {
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      encoding: 'utf8' as const,
      env: { NODE_ENV: 'production' as const, PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    }
    const { stdout } = await execute('/usr/bin/tar', ['-tvf', archive], tarOptions)
    verifyTarEntries(stdout)
    await execute('/usr/bin/tar', ['-xf', archive, '--strip-components', '1', '-C', bundle], tarOptions)
    await rm(archive)

    const node = await lstat(path.join(bundle, 'node'))
    const entry = await lstat(path.join(bundle, 'index.js'))
    if (!node.isFile() || !entry.isFile() || !(node.mode & 0o100)) throw new Error('Invalid Cursor CLI entry point.')
    process.once('exit', () => {
      try {
        rmSync(bundle, { recursive: true, force: true })
      } catch {
        // The verified bundle is private to the local OS user.
      }
    })
    return bundle
  } catch (error) {
    await rm(bundle, { recursive: true, force: true })
    throw error
  }
}

const processState = globalThis as typeof globalThis & {
  appraiseCursorBundle?: { pin: string; staged: Promise<string | undefined> }
}

async function resolveBundle() {
  const archive = process.env.APPRAISE_CURSOR_CLI_ARCHIVE
  const digest = process.env.APPRAISE_CURSOR_CLI_SHA256
  if (platform() !== 'darwin' || !archive || !path.isAbsolute(archive) || !digest || !/^[a-f0-9]{64}$/.test(digest))
    return
  const pin = JSON.stringify([archive, digest])
  if (processState.appraiseCursorBundle?.pin !== pin) {
    processState.appraiseCursorBundle = { pin, staged: stageBundle(archive, digest).catch(() => undefined) }
  }
  return processState.appraiseCursorBundle.staged
}

async function withCursorWorkspace<T>(
  run: (context: { cwd: string; profile: string; config: string; env: NodeJS.ProcessEnv }) => Promise<T>,
) {
  return withEncryptedCursorProfile(async profile => {
    const config = await cursorPrivateDirectory(path.join(profile, '.cursor'))
    const privateTemp = await cursorPrivateDirectory(path.join(profile, '.tmp'))
    const cwd = await mkdtemp(path.join(await realpath(tmpdir()), 'appraise-cursor-'))
    // Cursor's file-based credential store is inside the encrypted profile.
    // Start with an explicit environment to exclude API keys and custom endpoints.
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      HOME: profile,
      CURSOR_CONFIG_DIR: config,
      CURSOR_DATA_DIR: config,
      AGENT_CLI_CREDENTIAL_STORE: 'file',
      CURSOR_INVOKED_AS: 'agent',
      TMPDIR: privateTemp,
      NODE_DISABLE_COMPILE_CACHE: '1',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: 'en_US.UTF-8',
      NO_COLOR: '1',
    }
    try {
      return await run({ cwd, profile, config, env })
    } finally {
      await rm(cwd, { recursive: true, force: true }).catch(() => undefined)
    }
  })
}

function collectAccountReply(child: ChildProcessWithoutNullStreams, stop: () => void, timeout: number) {
  return new Promise<CursorAuthReply>((resolve, reject) => {
    const failure = () => new Error('Cursor CLI did not complete the account command.')
    const output: Buffer[] = []
    let bytes = 0
    let interrupted = false
    const interrupt = () => {
      interrupted = true
      stop()
    }
    const timer = setTimeout(interrupt, timeout).unref()
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > maxOutputBytes) interrupt()
      else output.push(chunk)
    })
    child.stderr.resume()
    child.once('error', () => reject(failure()))
    child.once('close', code => {
      clearTimeout(timer)
      if (interrupted || code === null) reject(failure())
      else resolve({ exitCode: code, output: Buffer.concat(output).toString('utf8') })
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end()
  })
}

export async function resolveCursorCli(): Promise<CursorCli | undefined> {
  const bundle = await resolveBundle()
  if (!bundle) return undefined
  const node = path.join(bundle, 'node')
  const entry = path.join(bundle, 'index.js')
  return {
    auth(command, signal) {
      return withCursorWorkspace(({ cwd, env, profile }) => {
        const { child, stop } = startCursorCommand(
          node,
          sandboxExecutable,
          [
            '-D',
            `NODE=${node}`,
            '-D',
            `BUNDLE=${bundle}`,
            '-D',
            `PROFILE=${profile}`,
            '-D',
            `SCRATCH=${cwd}`,
            '-p',
            authSandbox,
            node,
            entry,
            '--disable-auto-update',
            command,
            ...(command === 'status' ? ['--format', 'json'] : []),
          ],
          { cwd, env },
          signal,
        )
        return collectAccountReply(child, stop, command === 'login' ? 300_000 : 8_000)
      })
    },
    lookup(interact, signal) {
      return withCursorWorkspace(async ({ cwd, env, profile, config }) => {
        const workspaceConfig = await cursorPrivateDirectory(path.join(cwd, '.cursor'))
        const permissions = {
          allow: [],
          deny: [
            'Read(**)',
            'Read(/**)',
            `Read(${path.join(config, 'auth.json')})`,
            'Write(**)',
            'Write(/**)',
            'Shell(*)',
            'WebFetch(*)',
            'Mcp(*:*)',
          ],
        }
        // Cursor persists model selection in its private profile. The same
        // denials also live in the workspace config enforced read-only below.
        await writeFile(
          path.join(config, 'cli-config.json'),
          JSON.stringify({
            version: 1,
            editor: { vimMode: false },
            permissions,
          }),
          { mode: 0o600, flag: constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW },
        )
        await writeFile(path.join(workspaceConfig, 'cli.json'), JSON.stringify({ permissions }), {
          mode: 0o600,
          flag: 'wx',
        })
        const egress = await openProviderLookupEgress(lookupDestinations, lookupMaxConnections)
        try {
          signal.throwIfAborted()
          const { child, stop } = startCursorCommand(
            node,
            sandboxExecutable,
            [
              '-D',
              `NODE=${node}`,
              '-D',
              `BUNDLE=${bundle}`,
              '-D',
              `PROFILE=${profile}`,
              '-D',
              `WORKSPACE_CONFIG=${workspaceConfig}`,
              '-D',
              `SCRATCH=${cwd}`,
              '-D',
              `EGRESS=localhost:${egress.port}`,
              '-p',
              lookupSandbox,
              node,
              entry,
              '--disable-auto-update',
              '--mode',
              'ask',
              'acp',
            ],
            {
              cwd,
              env: { ...env, HTTP_PROXY: egress.proxy, HTTPS_PROXY: egress.proxy, NODE_USE_ENV_PROXY: '1' },
            },
            signal,
          )
          child.stderr.resume()
          const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
          try {
            return await interact(child, cwd)
          } finally {
            stop()
            await closed
          }
        } finally {
          egress.close()
        }
      })
    },
  }
}
