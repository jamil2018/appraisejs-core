import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import schemaOrigin from './native-qualification-schemas/origin.json'
import { nativeQualificationFeatures } from './native-qualification-configuration'
import {
  classifyManagedAnalysisFailure,
  observeManagedAnalysisCleanup,
  runManagedAnalysis,
} from './managed-analysis-sender'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  lstat: vi.fn(),
  realpath: vi.fn(),
  chmod: vi.fn(),
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
  digest: vi.fn(),
  describe: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('node:fs/promises', () => ({
  lstat: mocks.lstat,
  realpath: mocks.realpath,
  chmod: mocks.chmod,
  mkdir: mocks.mkdir,
  mkdtemp: mocks.mkdtemp,
  rm: mocks.rm,
  writeFile: mocks.writeFile,
}))
vi.mock('node:fs', () => ({
  createReadStream: () =>
    (async function* () {
      yield Buffer.from('native')
    })(),
}))
vi.mock('node:crypto', () => ({ createHash: () => ({ update: vi.fn(), digest: mocks.digest }) }))
vi.mock('./native-credential-topology', () => ({
  describeNativeCredential: mocks.describe,
  linkNativeCredential: mocks.link,
  unlinkNativeCredential: mocks.unlink,
}))

function childProcess() {
  return Object.assign(new EventEmitter(), {
    pid: 43210,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  })
}
const esrch = () => Object.assign(new Error('absent'), { code: 'ESRCH' })
const root = '/private/tmp/appraise-managed-analysis-unit'
let child: ReturnType<typeof childProcess>
let kill: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.lstat.mockResolvedValue({
    isFile: () => true,
    isDirectory: () => true,
    isSymbolicLink: () => false,
    mode: 0o755,
    dev: 1,
    ino: 2,
  })
  mocks.realpath.mockImplementation(async value => value)
  mocks.digest.mockReturnValue(schemaOrigin.nativeExecutableSha256)
  mocks.mkdtemp.mockResolvedValue(root)
  mocks.describe.mockReturnValue({ path: '/original-codex/auth.json' })
  mocks.link.mockReturnValue({ path: `${root}/codex/auth.json` })
  mocks.rm.mockResolvedValue(undefined)
  child = childProcess()
  mocks.spawn.mockReturnValue(child)
  kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw esrch()
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function reply(events: unknown[], code = 0) {
  queueMicrotask(() => {
    for (const event of events) child.stdout.write(`${JSON.stringify(event)}\n`)
    child.emit('close', code)
  })
}
function onPrompt(action: () => void) {
  child.stdin.once('finish', action)
}

describe('managed native Analysis sender without model execution', () => {
  it('directly invokes only the pinned executable with isolated config/home, sends prompt through stdin, and returns final native text', async () => {
    const prompt = 'Return the authored analysis JSON.'
    let received = ''
    child.stdin.on('data', chunk => {
      received += chunk
    })
    onPrompt(() =>
      reply([
        { type: 'thread.started', thread_id: 'native-thread' },
        { type: 'turn.started' },
        {
          type: 'item.completed',
          item: { type: 'error', message: 'Deprecated configuration warning: private diagnostic' },
        },
        { type: 'item.completed', item: { type: 'reasoning', text: 'private reasoning' } },
        { type: 'item.completed', item: { type: 'agent_message', text: '{"summary":"native result"}' } },
        { type: 'turn.completed', usage: {} },
      ]),
    )
    await expect(runManagedAnalysis(prompt)).resolves.toBe('{"summary":"native result"}')
    expect(received).toBe(prompt)
    const [command, args, options] = mocks.spawn.mock.calls[0]
    expect(command).toBe('/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex')
    expect(args).toEqual(
      expect.arrayContaining(['exec', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json']),
    )
    expect(args).not.toContain(prompt)
    expect(args.at(-1)).toBe('-')
    const [configPath, config, writeOptions] = mocks.writeFile.mock.calls[0]
    expect(configPath).toBe(`${root}/codex/config.toml`)
    expect(writeOptions).toEqual({ mode: 0o600, flag: 'wx' })
    for (const [key, value] of Object.entries(nativeQualificationFeatures(true)))
      expect(config).toContain(`features.${key} = ${value}\n`)
    expect(config).toContain('web_search = "disabled"\n')
    expect(config).toContain('mcp_servers = {}\n')
    expect(config).toContain('approval_policy = "never"\n')
    expect(args).not.toContain('--ignore-user-config')
    expect(options).toEqual({
      cwd: `${root}/cwd`,
      env: {
        HOME: `${root}/home`,
        CODEX_HOME: `${root}/codex`,
        TMPDIR: `${root}/tmp`,
        LANG: 'C.UTF-8',
        NODE_ENV: 'production',
      },
      detached: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(mocks.link).toHaveBeenCalledWith({ path: '/original-codex/auth.json' }, `${root}/codex/auth.json`)
    expect(mocks.unlink).toHaveBeenCalledOnce()
    expect(mocks.rm).toHaveBeenCalledWith(root, { recursive: true, force: true })
  })

  it('passes the optional response schema via a private file in the cleaned worker root', async () => {
    mocks.digest.mockReturnValue('3b6d00deea5fabc50ad34be1872b8e4ead1638d23c68fabb7837edc07f0cf1e0')
    const schema = { type: 'object', properties: {}, additionalProperties: false }
    onPrompt(() =>
      reply([
        { type: 'thread.started', thread_id: 'native-thread' },
        { type: 'turn.started' },
        { type: 'item.completed', item: { type: 'agent_message', text: '{}' } },
        { type: 'turn.completed', usage: {} },
      ]),
    )
    await expect(runManagedAnalysis('return the object', schema)).resolves.toBe('{}')
    const schemaPath = `${root}/response-schema.json`
    expect(mocks.writeFile).toHaveBeenCalledWith(schemaPath, JSON.stringify(schema), { mode: 0o600, flag: 'wx' })
    expect(mocks.spawn.mock.calls[0][1].slice(-3)).toEqual(['--output-schema', schemaPath, '-'])
    expect(mocks.rm).toHaveBeenCalledWith(root, { recursive: true, force: true })
  })

  it('refuses a changed executable before credential access or launch', async () => {
    mocks.digest.mockReturnValue('untrusted')
    await expect(runManagedAnalysis('analysis')).rejects.toThrow(/supported Codex executable/)
    expect(mocks.describe).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each([
    [{ type: 'item.started', item: { type: 'command_execution', command: 'secret command' } }],
    [{ type: 'item.completed', item: { type: 'agent_message', text: 'partial' } }],
    [{ type: 'turn.failed', error: { message: 'secret diagnostic' } }],
  ])('refuses tool events and incomplete/failed turns without returning child diagnostics', async event => {
    onPrompt(() => reply([event]))
    await expect(runManagedAnalysis('analysis')).rejects.toThrow(/Managed Analysis .*; attempt outcome UNKNOWN/)
    expect(mocks.rm).toHaveBeenCalledOnce()
  })

  it('bounds stderr and stops the original process group after excessive output', async () => {
    let live = true
    kill.mockImplementation((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 'SIGTERM') {
        live = false
        return true
      }
      if (live) return true
      throw esrch()
    })
    onPrompt(() => child.stderr.write(Buffer.alloc(1_048_577)))
    await expect(runManagedAnalysis('analysis')).rejects.toThrow(/UNKNOWN/)
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGTERM')
    expect(mocks.rm).toHaveBeenCalledOnce()
  })

  it('bounds the native turn and escalates process group termination', async () => {
    vi.useFakeTimers()
    let live = true
    kill.mockImplementation((_pid: number, signal?: NodeJS.Signals | number) => {
      if (signal === 'SIGKILL') {
        live = false
        return true
      }
      if (live) return true
      throw esrch()
    })
    const operation = expect(runManagedAnalysis('analysis')).rejects.toThrow(/UNKNOWN/)
    await vi.advanceTimersByTimeAsync(183_000)
    await operation
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGTERM')
    expect(kill).toHaveBeenCalledWith(-43210, 'SIGKILL')
    expect(mocks.rm).toHaveBeenCalledOnce()
  })

  it('retains the private root and reports UNKNOWN when group cleanup cannot be proved', async () => {
    vi.useFakeTimers()
    kill.mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' })
    })
    onPrompt(() => reply([{ type: 'turn.failed' }]))
    await expect(runManagedAnalysis('analysis')).rejects.toThrow(/cleanup unverified; private root retained/)
    expect(mocks.unlink).not.toHaveBeenCalled()
    expect(mocks.rm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(61_000)
  })

  it('retains original attempt custody and reconciles a late close without signaling or replay', async () => {
    vi.useFakeTimers()
    let denied = true
    kill.mockImplementation(() => {
      if (denied) throw Object.assign(new Error('denied'), { code: 'EPERM' })
      throw esrch()
    })
    const operation = expect(runManagedAnalysis('analysis', undefined, { attemptId: 'late-original' })).rejects.toThrow(
      /cleanup unverified/,
    )
    await vi.advanceTimersByTimeAsync(180_100)
    await operation
    expect(observeManagedAnalysisCleanup('late-original')).toEqual({
      state: 'UNKNOWN',
      privateRootCleanupVerified: false,
    })
    expect(mocks.rm).not.toHaveBeenCalled()
    denied = false
    child.emit('close', 1)
    await vi.advanceTimersByTimeAsync(300)
    expect(observeManagedAnalysisCleanup('late-original')).toEqual({
      state: 'VERIFIED',
      privateRootCleanupVerified: true,
    })
    expect(mocks.unlink).toHaveBeenCalledOnce()
    expect(mocks.rm).toHaveBeenCalledOnce()
    expect(kill.mock.calls.every((args: unknown[]) => args[1] === 0)).toBe(true)
    await expect(runManagedAnalysis('analysis', undefined, { attemptId: 'late-original' })).rejects.toThrow(
      /already consumed/,
    )
    expect(mocks.spawn).toHaveBeenCalledOnce()
  })

  it('never signals a process group after the original leader exit event', async () => {
    vi.useFakeTimers()
    kill.mockReturnValue(true)
    onPrompt(() => child.emit('exit', 1))
    const operation = expect(
      runManagedAnalysis('analysis', undefined, { attemptId: 'exited-original' }),
    ).rejects.toThrow(/cleanup unverified/)
    await vi.advanceTimersByTimeAsync(180_100)
    await operation
    expect(kill.mock.calls.every((args: unknown[]) => args[1] === 0)).toBe(true)
    expect(observeManagedAnalysisCleanup('exited-original').state).toBe('UNKNOWN')
    expect(mocks.rm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(61_000)
  })

  it('keeps UNKNOWN when the root is replaced or root deletion fails after group exit', async () => {
    vi.useFakeTimers()
    mocks.rm.mockRejectedValue(new Error('private diagnostic'))
    onPrompt(() => reply([{ type: 'turn.failed' }]))
    await expect(runManagedAnalysis('analysis', undefined, { attemptId: 'root-failed' })).rejects.toThrow(
      /private root cleanup failed/,
    )
    expect(observeManagedAnalysisCleanup('root-failed').privateRootCleanupVerified).toBe(false)
    mocks.rm.mockResolvedValue(undefined)
    mocks.lstat.mockResolvedValue({
      isFile: () => false,
      isDirectory: () => true,
      isSymbolicLink: () => false,
      dev: 1,
      ino: 999,
    })
    const removals = mocks.rm.mock.calls.length
    await vi.advanceTimersByTimeAsync(61_000)
    expect(mocks.rm).toHaveBeenCalledTimes(removals)
    expect(observeManagedAnalysisCleanup('root-failed').state).toBe('UNKNOWN')
    expect(observeManagedAnalysisCleanup('legacy-unbound-attempt').state).toBe('UNKNOWN')
  })

  it('refuses concurrent dispatch of an already bound attempt before a second native launch', async () => {
    onPrompt(() =>
      reply([{ type: 'item.completed', item: { type: 'agent_message', text: '{}' } }, { type: 'turn.completed' }]),
    )
    const original = runManagedAnalysis('analysis', undefined, { attemptId: 'concurrent-original' })
    await expect(runManagedAnalysis('analysis', undefined, { attemptId: 'concurrent-original' })).rejects.toThrow(
      /already consumed/,
    )
    await expect(original).resolves.toBe('{}')
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(observeManagedAnalysisCleanup('concurrent-original').state).toBe('VERIFIED')
  })

  it('classifies provider failures without exposing arbitrary native diagnostics or caller errors', async () => {
    onPrompt(() =>
      reply(
        [
          { type: 'item.completed', item: { type: 'error', message: 'private startup diagnostic' } },
          { type: 'turn.failed', error: { message: 'authentication failed: private-auth-value' } },
        ],
        1,
      ),
    )
    try {
      await runManagedAnalysis('analysis')
      throw new Error('expected sender failure')
    } catch (error) {
      expect(classifyManagedAnalysisFailure(error)).toBe(
        'Managed Analysis existing login rejected; attempt outcome UNKNOWN',
      )
    }
    expect(classifyManagedAnalysisFailure(new Error('private-auth-value'))).toBe(
      'Managed Analysis unavailable; attempt outcome UNKNOWN',
    )
  })

  it('does not accept prompt arguments above the byte limit', async () => {
    await expect(runManagedAnalysis('x'.repeat(1_048_577))).rejects.toThrow(/prompt refused/)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
})
