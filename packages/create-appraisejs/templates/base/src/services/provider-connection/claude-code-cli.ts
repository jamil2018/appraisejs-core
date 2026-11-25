import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import type { Stats } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { homedir, platform, tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'

import { openClaudeCodeLookupEgress } from './claude-code-egress'

const sandboxExecutable = '/usr/bin/sandbox-exec'
const maxImageBytes = 512 * 1024 * 1024
const maxOutputBytes = 256 * 1024

// The signed-in CLI may use the macOS Keychain helper. A lookup cannot start a
// shell, read workspace files, or launch a configured hook or MCP subprocess.
const lookupSandbox = `(version 1)
(allow default)
(deny process-exec)
(deny network*)
(allow network-outbound (remote ip (param "EGRESS")))
(allow process-exec (literal (param "EXECUTABLE")) (literal "/usr/bin/security"))
(deny file-read-data file-write*)
(allow file-read-data
  (literal "/")
  (literal (param "EXECUTABLE"))
  (literal "/usr/bin/security")
  (literal (param "LOGIN_KEYCHAIN"))
  (subpath "/System") (subpath "/usr/lib") (subpath "/usr/share/icu")
  (subpath "/Library/Apple/System/Library") (subpath "/private/var/db/dyld")
  (literal "/private/etc/hosts") (literal "/private/etc/resolv.conf")
  (literal "/private/etc/localtime") (subpath "/private/var/db/timezone")
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  (subpath "/Library/Application Support/ClaudeCode")
  (subpath "/Library/Managed Preferences")
  (subpath (param "PROFILE")) (subpath (param "SCRATCH")))
(allow file-write*
  (literal "/dev/null")
  (subpath (param "PROFILE")) (subpath (param "SCRATCH")))
(deny file-write* (literal (param "EXECUTABLE")))`

export type ClaudeCodeCommand = 'status' | 'login' | 'logout' | 'lookup'
export type ClaudeCodeRunOptions = { input?: string; signal?: AbortSignal; lookupArgs?: readonly string[] }
export type ClaudeCodeReply = { exitCode: number; output: string }
export type ClaudeCodeCli = {
  run: (command: ClaudeCodeCommand, options?: ClaudeCodeRunOptions) => Promise<ClaudeCodeReply>
}

const imagePin = z.object({
  executable: z
    .string()
    .regex(/^[^\x00-\x1f\x7f]+$/)
    .refine(path.isAbsolute),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
})

function isExecutableImage(metadata: Stats) {
  return (
    metadata.isFile() &&
    metadata.size > 0 &&
    metadata.size <= maxImageBytes &&
    (metadata.mode & 0o022) === 0 &&
    (metadata.mode & 0o100) !== 0
  )
}

async function resolvePinnedExecutable() {
  if (platform() !== 'darwin') return undefined
  try {
    const pin = imagePin.parse({
      executable: process.env.APPRAISE_CLAUDE_CODE_EXECUTABLE,
      expectedDigest: process.env.APPRAISE_CLAUDE_CODE_SHA256,
    })
    const executable = await realpath(pin.executable)
    if (isExecutableImage(await stat(executable))) return { executable, expectedDigest: pin.expectedDigest }
  } catch {
    // A missing or invalid operator pin leaves the runtime unavailable.
  }
}

async function stagePinnedExecutable(image: z.infer<typeof imagePin>, scratch: string) {
  const executable = path.join(scratch, 'claude')
  await copyFile(image.executable, executable, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
  const metadata = await stat(executable)
  if (metadata.size <= 0 || metadata.size > maxImageBytes) throw new Error('Invalid Claude Code executable size.')
  await chmod(executable, 0o500)
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(executable)) digest.update(chunk)
  if (digest.digest('hex') !== image.expectedDigest) throw new Error('Claude Code executable verification failed.')
  return executable
}

async function profileDirectory() {
  const directory = path.join(await realpath(homedir()), '.appraise-claude-code')
  await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  const metadata = await lstat(directory)
  if (!metadata.isDirectory() || metadata.uid !== process.getuid?.() || (metadata.mode & 0o077) !== 0) {
    throw new Error('The Claude Code profile must be a private directory owned by the Appraise user.')
  }
  return directory
}

function runCommand(
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number; signal?: AbortSignal },
  input: string | undefined,
): Promise<ClaudeCodeReply> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      args,
      { ...options, encoding: 'utf8', killSignal: 'SIGKILL', maxBuffer: maxOutputBytes },
      (error, output) => {
        if (!error) resolve({ exitCode: 0, output })
        else if (typeof error.code === 'number' && !error.killed) resolve({ exitCode: error.code, output })
        else reject(new Error('The Claude Code process did not return a complete reply.'))
      },
    )
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(input)
  })
}

export async function resolveClaudeCodeCli(): Promise<ClaudeCodeCli | undefined> {
  const image = await resolvePinnedExecutable()
  if (!image) return undefined

  return {
    async run(command, options = {}) {
      options.signal?.throwIfAborted()
      const profile = await profileDirectory()
      const scratch = await mkdtemp(path.join(await realpath(tmpdir()), 'appraise-claude-'))
      const environment = {
        HOME: homedir(),
        NODE_ENV: process.env.NODE_ENV,
        USER: process.env.USER,
        LOGNAME: process.env.LOGNAME,
        LANG: 'en_US.UTF-8',
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        TMPDIR: scratch,
        CLAUDE_CODE_TMPDIR: scratch,
        CLAUDE_CONFIG_DIR: profile,
        DISABLE_AUTOUPDATER: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      }
      try {
        const executable = await stagePinnedExecutable(image, scratch)
        options.signal?.throwIfAborted()
        const common = { cwd: scratch, env: environment, signal: options.signal }
        if (command !== 'lookup') {
          const reply = await runCommand(
            executable,
            ['auth', command],
            { ...common, timeout: command === 'login' ? 5 * 60_000 : 5_000 },
            undefined,
          )
          if (command === 'status' && JSON.parse(reply.output).configDirectory !== profile) {
            throw new Error('Claude Code did not use the private Appraise profile.')
          }
          return reply
        }
        const egress = await openClaudeCodeLookupEgress()
        try {
          return await runCommand(
            sandboxExecutable,
            [
              '-D',
              `EXECUTABLE=${executable}`,
              '-D',
              `PROFILE=${profile}`,
              '-D',
              `LOGIN_KEYCHAIN=${path.join(path.dirname(profile), 'Library', 'Keychains', 'login.keychain-db')}`,
              '-D',
              `SCRATCH=${scratch}`,
              '-D',
              `EGRESS=localhost:${egress.port}`,
              '-p',
              lookupSandbox,
              executable,
              ...(options.lookupArgs ?? []),
            ],
            {
              ...common,
              env: { ...environment, HTTPS_PROXY: egress.proxy, ENABLE_CLAUDEAI_MCP_SERVERS: 'false' },
              timeout: 40_000,
            },
            options.input,
          )
        } finally {
          egress.close()
        }
      } finally {
        await rm(scratch, { recursive: true, force: true }).catch(() => undefined)
      }
    },
  }
}
