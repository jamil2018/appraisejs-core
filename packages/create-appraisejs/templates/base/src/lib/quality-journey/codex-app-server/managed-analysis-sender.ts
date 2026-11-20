import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { describeNativeCredential, linkNativeCredential, unlinkNativeCredential } from './native-credential-topology'
import { nativeQualificationFeatures, nativeQualificationModel } from './native-qualification-configuration'
import schemaOrigin from './native-qualification-schemas/origin.json'

const executable = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
const timeoutMs = 180_000
const maxBytes = 1_048_576
const cleanupMs = 2_000
const reconciliationMs = 60_000
// Use the pinned model and its qualified Code Mode Host profile; actual tool items remain refused.
const managedAnalysisModel = nativeQualificationModel

class ManagedAnalysisSenderError extends Error {}

function refused(reason: string) {
  return new ManagedAnalysisSenderError(`Managed Analysis ${reason}; attempt outcome UNKNOWN`)
}
function classified(error: unknown, fallback: string) {
  return error instanceof ManagedAnalysisSenderError ? error : refused(fallback)
}

/** Only sender-created messages cross this boundary; arbitrary errors never reach persisted diagnostics. */
export function classifyManagedAnalysisFailure(error: unknown): string {
  return error instanceof ManagedAnalysisSenderError
    ? error.message
    : 'Managed Analysis unavailable; attempt outcome UNKNOWN'
}

function nativeFailure(value: unknown, fallback = 'native turn failed'): string {
  const message = typeof value === 'string' ? value : ''
  if (/requires.{0,40}code[_ -]?mode|code[_ -]?mode.{0,40}required/i.test(message)) return 'model requires Code Mode'
  if (/usage limit|quota|rate.?limit|429/i.test(message)) return 'provider usage limit reached'
  if (/unauthorized|401|authentication|sign.?in|login|auth token|access token|refresh token/i.test(message))
    return 'existing login rejected'
  if (/unsupported.{0,40}model|model.{0,80}(not supported|not available|does not exist)/i.test(message))
    return 'configured model unavailable'
  if (
    /unexpected argument|unrecognized|unknown.{0,30}(config|field)|invalid.{0,30}config|config.{0,30}error/i.test(
      message,
    )
  )
    return 'CLI configuration refused'
  if (/network|connection|certificate|dns|stream disconnected|error sending request|timed out/i.test(message))
    return 'provider connection failed'
  if (/operation not permitted|permission denied|sandbox/i.test(message)) return 'host containment refused'
  const labels = [
    ['unsupported value', /unsupported.?value/i],
    ['unsupported parameter', /unsupported.?parameter/i],
    ['invalid request', /invalid.?request/i],
    ['forbidden', /forbidden|403/i],
    ['not found', /not found|404/i],
    ['model', /model/i],
    ['tool', /tool/i],
    ['reasoning', /reasoning/i],
    ['configuration', /config/i],
    ['empty message', /^$/],
    ['Code Mode', /code[_ -]?mode/i],
    ['disabled', /disabled/i],
    ['enabled', /enabled/i],
    ['host', /host/i],
    ['spawn', /spawn/i],
    ['missing file', /no such file/i],
    ['unsupported', /unsupported/i],
    ['invalid', /invalid/i],
    ['missing', /missing/i],
    ['runtime', /runtime/i],
    ['module', /module/i],
    ['node', /node/i],
    ['deno', /deno/i],
    ['requires', /requires/i],
    ['expected', /expected/i],
    ['boolean', /boolean/i],
    ['table', /table/i],
    ['string', /string/i],
  ] as const
  const matched = labels.filter(([, pattern]) => pattern.test(message)).map(([label]) => label)
  const words = new Set([
    'code_mode',
    'code_mode_only',
    'code_mode_host',
    'model',
    'tools',
    'tool',
    'deprecated',
    'now',
    'must',
    'in',
    'as',
    'expected',
    'is',
    'not',
    'enabled',
    'disabled',
    'enable',
    'with',
    'the',
    'configuration',
    'config',
    'table',
    'false',
    'true',
    'supports',
    'support',
    'supported',
    'only',
    'requires',
    'required',
    'use',
    'available',
    'this',
    'for',
    'and',
    'to',
    'be',
    'cannot',
    'when',
    'field',
    'features',
    'value',
    'error',
    'failed',
    'invalid',
  ])
  const grammar = message
    .toLowerCase()
    .split(/[^a-z_]+/)
    .filter(word => words.has(word))
    .slice(0, 70)
    .join(' ')
  return grammar ? `${fallback} (${grammar})` : matched.length ? `${fallback} (${matched.join(', ')})` : fallback
}

// The managed sender consumes exec JSONL. The app-server protocol keeps its separate schema pin.
const managedExecDigests = new Set([
  schemaOrigin.nativeExecutableSha256,
  '3b6d00deea5fabc50ad34be1872b8e4ead1638d23c68fabb7837edc07f0cf1e0', // OpenAI-signed macOS 0.171.0-alpha.13
])

export async function verifyManagedAnalysisExecutable() {
  const metadata = await lstat(executable)
  if (!metadata.isFile() || metadata.isSymbolicLink() || !(metadata.mode & 0o111)) throw refused('executable refused')
  if ((await realpath(executable)) !== executable) throw refused('executable refused')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(executable)) hash.update(chunk)
  if (!managedExecDigests.has(hash.digest('hex'))) throw refused('requires a supported Codex executable')
}

function configuration() {
  return {
    model: JSON.stringify(managedAnalysisModel),
    model_provider: '"openai"',
    model_reasoning_effort: '"medium"',
    cli_auth_credentials_store: '"file"',
    mcp_oauth_credentials_store: '"file"',
    approval_policy: '"never"',
    sandbox_mode: '"read-only"',
    web_search: '"disabled"',
    project_doc_max_bytes: '0',
    mcp_servers: '{}',
    'tools.update_plan.enabled': 'false',
    'tools.experimental_request_user_input.enabled': 'false',
    developer_instructions: JSON.stringify(
      'Analyze only the supplied context. Do not call tools or perform actions. Return only the requested final JSON or text.',
    ),
    'shell_environment_policy.inherit': '"none"',
    'analytics.enabled': 'false',
    'feedback.enabled': 'false',
    'history.persistence': '"none"',
    ...Object.fromEntries(
      Object.entries(nativeQualificationFeatures(true)).map(([key, value]) => [`features.${key}`, String(value)]),
    ),
  }
}

function groupAlive(pid: number) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw refused('cleanup unverified')
  }
}
function signalGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw refused('cleanup unverified')
  }
}
async function waitForGroup(pid: number) {
  const deadline = Date.now() + cleanupMs
  while (groupAlive(pid)) {
    if (Date.now() >= deadline) return false
    await delay(25)
  }
  return true
}
async function stop(child: ChildProcessWithoutNullStreams, closed: () => boolean) {
  const pid = child.pid
  // No PID on spawn failure means no process was acquired.
  if (!pid) return
  if (!groupAlive(pid)) return
  // A persisted PID or an already closed leader cannot authorize another signal.
  if (closed()) throw refused('cleanup unverified')
  signalGroup(pid, 'SIGTERM')
  if (await waitForGroup(pid)) return
  if (closed()) throw refused('cleanup unverified')
  signalGroup(pid, 'SIGKILL')
  if (!(await waitForGroup(pid))) throw refused('cleanup unverified; private root retained')
}

type CleanupObservation = Readonly<{ state: 'UNKNOWN' | 'VERIFIED'; privateRootCleanupVerified: boolean }>
type Custody = {
  child?: ChildProcessWithoutNullStreams
  root: string
  identity: { dev: string; ino: string }
  link?: ReturnType<typeof linkNativeCredential>
  exited: boolean
  closed: boolean
  verified: boolean
  cleanup?: Promise<void>
}
// Keep the actual original handle through request completion and hot reload. Never reconstruct it from a PID.
const custodyGlobal = globalThis as typeof globalThis & {
  __appraiseManagedAnalysisCustody?: Map<string, Custody>
  __appraiseManagedAnalysisConsumed?: Set<string>
}
const retainedCustody = (custodyGlobal.__appraiseManagedAnalysisCustody ??= new Map())
const consumedAttempts = (custodyGlobal.__appraiseManagedAnalysisConsumed ??= new Set())

/** Observation only. UNKNOWN includes absent custody and process exit without complete private-root removal. */
export function observeManagedAnalysisCleanup(attemptId: string): CleanupObservation {
  const verified = retainedCustody.get(attemptId)?.verified === true
  return Object.freeze({ state: verified ? 'VERIFIED' : 'UNKNOWN', privateRootCleanupVerified: verified })
}

async function removePrivateRoot(custody: Custody) {
  if (custody.verified) return
  if (custody.cleanup) return custody.cleanup
  custody.cleanup = (async () => {
    const metadata = await lstat(custody.root)
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      String(metadata.dev) !== custody.identity.dev ||
      String(metadata.ino) !== custody.identity.ino
    )
      throw refused('private root identity changed')
    if (custody.link) {
      unlinkNativeCredential(custody.link)
      custody.link = undefined
    }
    await rm(custody.root, { recursive: true, force: true })
    custody.verified = true
    custody.child = undefined
  })()
  try {
    await custody.cleanup
  } finally {
    custody.cleanup = undefined
  }
}

async function reconcileCleanup(custody: Custody) {
  // Passive observation only after the original bounded termination path. No signaling or native replay.
  const pid = custody.child?.pid
  if (pid && groupAlive(pid)) return
  await removePrivateRoot(custody)
}

function retainCleanup(custody: Custody) {
  const deadline = Date.now() + reconciliationMs
  const poll = async () => {
    try {
      await reconcileCleanup(custody)
    } catch {
      // Retain custody and UNKNOWN; arbitrary OS errors never enter diagnostics.
    }
    if (!custody.verified && Date.now() < deadline) setTimeout(poll, 250).unref()
  }
  setTimeout(poll, 250).unref()
}

function consume(child: ChildProcessWithoutNullStreams, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let bytes = 0
    let pending = ''
    let diagnostics = ''
    let finalMessage: string | undefined
    let completed = false
    let failed = false
    const finishFailure = (reason: string, error?: unknown) => {
      if (failed) return
      failed = true
      clearTimeout(timer)
      // Rejection starts the caller's single cleanup path immediately.
      reject(classified(error, reason))
    }
    const frame = (line: string) => {
      if (!line.trim()) return
      const event = JSON.parse(line) as {
        type?: string
        message?: string
        error?: { message?: string }
        item?: { type?: string; text?: string; message?: string }
      }
      if (event.item?.type === 'error') {
        // Exec reports startup warnings as error items as well. Only a failed turn/process makes these fatal.
        if (typeof event.item.message === 'string' && diagnostics.length < 65_536)
          diagnostics += event.item.message.slice(0, 65_536 - diagnostics.length)
        return
      }
      if (event.type === 'error' || event.type === 'turn.failed')
        throw refused(nativeFailure(event.error?.message ?? event.message ?? diagnostics))
      if (event.type?.startsWith('item.')) {
        if (!event.item || !['agent_message', 'reasoning'].includes(event.item.type ?? ''))
          throw refused('tool activity refused')
        if (event.type === 'item.completed' && event.item.type === 'agent_message') {
          if (typeof event.item.text !== 'string') throw refused('response refused')
          finalMessage = event.item.text
        }
      }
      if (event.type === 'turn.completed') completed = true
    }
    const timer = setTimeout(() => finishFailure('timed out'), timeoutMs)
    const accountBytes = (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > maxBytes) finishFailure('output limit exceeded')
    }
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      accountBytes(Buffer.from(chunk))
      if (failed) return
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop()!
      try {
        for (const line of lines) frame(line)
      } catch (error) {
        finishFailure('native response refused', error)
      }
    })
    // Diagnostics are drained and bounded, never returned or logged.
    child.stderr.on('data', (chunk: Buffer) => {
      accountBytes(chunk)
      if (!failed && diagnostics.length < 65_536)
        diagnostics += chunk.toString('utf8').slice(0, 65_536 - diagnostics.length)
    })
    child.once('error', () => finishFailure('launch failed'))
    child.stdin.on('error', () => finishFailure('prompt delivery failed'))
    child.once('close', code => {
      clearTimeout(timer)
      if (failed) return
      try {
        frame(pending)
        if (code !== 0 || !completed || !finalMessage?.trim())
          throw refused(nativeFailure(diagnostics, 'incomplete response'))
        resolve(finalMessage)
      } catch (error) {
        finishFailure('incomplete response', error)
      }
    })
    child.stdin.end(prompt)
  })
}

/** A first-party, one-turn native sender. No retry, fixture, external worker, or MCP handoff. */
export async function runManagedAnalysis(
  prompt: string,
  outputSchema?: Record<string, unknown>,
  binding?: { attemptId: string },
): Promise<string> {
  if (typeof prompt !== 'string' || !prompt.trim() || Buffer.byteLength(prompt) > maxBytes)
    throw refused('prompt refused')
  if (process.platform === 'win32') throw refused('requires a POSIX host')
  if (binding && (!/^[A-Za-z0-9._:-]{1,200}$/.test(binding.attemptId) || consumedAttempts.has(binding.attemptId)))
    throw refused('attempt custody already consumed or invalid')
  if (binding) consumedAttempts.add(binding.attemptId)
  await verifyManagedAnalysisExecutable()
  const credential = describeNativeCredential(
    path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'auth.json'),
  )
  const root = await mkdtemp(path.join(tmpdir(), 'appraise-managed-analysis-'))
  const metadata = await lstat(root)
  const custody: Custody = {
    root,
    identity: { dev: String(metadata.dev), ino: String(metadata.ino) },
    exited: false,
    closed: false,
    verified: false,
  }
  if (binding) retainedCustody.set(binding.attemptId, custody)
  let cleanupVerified = true
  try {
    await chmod(root, 0o700)
    const home = path.join(root, 'home')
    const codexHome = path.join(root, 'codex')
    const temporary = path.join(root, 'tmp')
    const cwd = path.join(root, 'cwd')
    for (const directory of [home, codexHome, temporary, cwd]) await mkdir(directory, { mode: 0o700 })
    await writeFile(
      path.join(codexHome, 'config.toml'),
      Object.entries(configuration())
        .map(([key, value]) => `${key} = ${value}`)
        .join('\n') + '\n',
      { mode: 0o600, flag: 'wx' },
    )
    custody.link = linkNativeCredential(credential, path.join(codexHome, 'auth.json'))
    const args = ['exec', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json', '--color', 'never']
    if (outputSchema) {
      const schemaPath = path.join(root, 'response-schema.json')
      const serialized = JSON.stringify(outputSchema)
      if (Buffer.byteLength(serialized) > maxBytes) throw refused('response schema too large')
      await writeFile(schemaPath, serialized, { mode: 0o600, flag: 'wx' })
      args.push('--output-schema', schemaPath)
    }
    args.push('-')
    const child = spawn(executable, args, {
      cwd,
      env: { HOME: home, CODEX_HOME: codexHome, TMPDIR: temporary, LANG: 'C.UTF-8', NODE_ENV: 'production' },
      detached: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    custody.child = child
    child.once('exit', () => {
      custody.exited = true
    })
    child.once('close', () => {
      custody.closed = true
      // A late original event preserves ownership; group absence alone never certifies root cleanup.
      void reconcileCleanup(custody).catch(() => {})
    })
    return await consume(child, prompt)
  } catch (error) {
    throw classified(error, 'native send failed')
  } finally {
    try {
      if (custody.child) await stop(custody.child, () => custody.exited || custody.closed)
    } catch {
      cleanupVerified = false
    }
    if (!cleanupVerified) {
      retainCleanup(custody)
      throw refused('cleanup unverified; private root retained')
    }
    try {
      await removePrivateRoot(custody)
    } catch {
      retainCleanup(custody)
      throw refused('private root cleanup failed')
    }
  }
}
