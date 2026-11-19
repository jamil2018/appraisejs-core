import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureNativeQualificationPlan, renderNativeQualificationConfiguration } from './native-qualification-contract'
import { nativeQualificationFeatureControls } from './native-qualification-configuration'
import { launchNativeQualificationChild, claimOriginalNativeQualificationChild } from './native-qualification-child'
import { syntheticNativeManifest } from './native-qualification.test-support'
import { createNativeQualificationDiagnostics } from './native-qualification-diagnostics'
import type { SpawnedProcess } from '../../process/task-spawner'

const owned = vi.hoisted(() => ({ spawn: vi.fn(), stop: vi.fn() }))
vi.mock('../../process/owned-process-stop', () => ({
  spawnOwnedProcessGroup: owned.spawn,
  stopOwnedProcessGroup: owned.stop,
}))
const parents: string[] = []
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  owned.spawn.mockReset()
  owned.stop.mockReset()
  parents.splice(0).forEach(parent => rmSync(parent, { recursive: true, force: true }))
})
function setup() {
  const f = syntheticNativeManifest()
  parents.push(f.parent)
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough
    stdout: PassThrough
    stderr: PassThrough
    connected: boolean
    disconnect: () => void
  }
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.connected = true
  child.disconnect = vi.fn(() => {
    child.connected = false
  })
  const original = { process: child } as unknown as SpawnedProcess
  owned.spawn.mockResolvedValue(original)
  owned.stop.mockImplementation(async () => {
    child.stdout.end()
    child.stderr.end()
    return { kind: 'group_exit_observed' }
  })
  const callbacks = {
    transportId: 'synthetic-transport',
    onNotification: vi.fn(),
    onFault: vi.fn(),
    assertAdmission: vi.fn(),
    captureOriginalDisconnect: vi.fn(),
    fenceMcp: vi.fn(),
    closeMcp: vi.fn().mockResolvedValue(true),
  }
  return { ...f, original, callbacks, plan: captureNativeQualificationPlan(f.manifest, f.capability) }
}
describe('real default native route, intercepted without native execution', () => {
  it('claims only the original child before handshake and retains the private sender seal', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    expect(() => claimOriginalNativeQualificationChild({ ...child }, f.plan, observer)).toThrow(
      /Original pre-handshake/,
    )
    expect(() => claimOriginalNativeQualificationChild(child, {} as typeof f.plan, observer)).toThrow(
      /Original pre-handshake/,
    )
    const original = claimOriginalNativeQualificationChild(child, f.plan, observer)
    expect(original.snapshot()).toMatchObject({ issuedRequests: 0, writtenBytes: 0 })
    expect(() => claimOriginalNativeQualificationChild(child, f.plan, observer)).toThrow(/Original pre-handshake/)
    const seal = original.sealSender()
    expect(original.sealSender()).toBe(seal)
    await child.stop()
    expect(observer.cleanup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 'stopped' }))
  })
  it('delivers post-fence passive nonitem notifications to original C1 observation through stream EOF', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(() => {
        throw new Error('foreign producer')
      }),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    claimOriginalNativeQualificationChild(child, f.plan, observer)
    child.transport.fence('source_cleanup')
    f.original.process.stdout!.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          method: 'remoteControl/status/changed',
          params: { installationId: 'test', serverName: 'test', status: 'disabled', environmentId: null },
        }) + '\n',
      ),
    )
    expect(observer.notification).toHaveBeenCalledExactlyOnceWith(
      'remoteControl/status/changed',
      expect.objectContaining({ status: 'disabled' }),
    )
    expect(await child.stop()).toMatchObject({ status: 'uncertain', privateRootRetained: true })
    expect(observer.fault).toHaveBeenCalled()
  })
  it('synchronously hands bounded original preclaim frames to C1 before any handshake', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    f.original.process.stdout!.emit(
      'data',
      Buffer.from(
        JSON.stringify({
          method: 'remoteControl/status/changed',
          params: { installationId: 'test', serverName: 'test', status: 'disabled', environmentId: null },
        }) + '\n',
      ),
    )
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    const original = claimOriginalNativeQualificationChild(child, f.plan, observer)
    expect(original.snapshot().issuedRequests).toBe(0)
    expect(observer.notification).toHaveBeenCalledExactlyOnceWith(
      'remoteControl/status/changed',
      expect.objectContaining({ status: 'disabled' }),
    )
    await child.stop()
  })
  it('refuses overflowed or semantically rejected original preclaim frames without a handshake', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const frame = Buffer.from(
      JSON.stringify({
        method: 'remoteControl/status/changed',
        params: { installationId: 'test', serverName: 'test', status: 'disabled', environmentId: null },
      }) + '\n',
    )
    for (let index = 0; index < 33; index++) f.original.process.stdout!.emit('data', frame)
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    expect(() => claimOriginalNativeQualificationChild(child, f.plan, observer)).toThrow(/Original pre-handshake/)
    expect(child.transport.snapshot().issuedRequests).toBe(0)
    expect(observer.fault).toHaveBeenCalledOnce()
    await child.stop()
  })
  it('delivers raw RPC faults to the original C1 sticky observer even with no pending request', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    claimOriginalNativeQualificationChild(child, f.plan, observer)
    f.original.process.stdin!.emit('error', new Error('synthetic original stdin failure'))
    expect(observer.fault).toHaveBeenCalledOnce()
    expect(f.callbacks.onFault).toHaveBeenCalledWith('stdin_error')
    expect(child.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'stdin_error', issuedRequests: 0 })
    await child.stop()
  })
  it('uses exact executable/app-server argv, closed environment, approved link, original cleanup and memoized stop', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    expect(owned.spawn).toHaveBeenCalledTimes(1)
    expect(owned.spawn).toHaveBeenCalledWith(
      f.manifest.native.path,
      ['app-server'],
      expect.objectContaining({
        cwd: path.join(f.manifest.freshRoot, 'cwd'),
        privateStdio: true,
        captureOutput: false,
        env: {
          HOME: path.join(f.manifest.freshRoot, 'home'),
          CODEX_HOME: path.join(f.manifest.freshRoot, 'codex-home'),
          TMPDIR: path.join(f.manifest.freshRoot, 'tmp'),
          LANG: 'C.UTF-8',
        },
      }),
    )
    expect(readlinkSync(path.join(f.manifest.freshRoot, 'codex-home/auth.json'))).toBe(f.credential)
    const stop = child.stop()
    expect(child.stop()).toBe(stop)
    expect(await stop).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
    expect(f.callbacks.closeMcp).toHaveBeenCalledTimes(1)
    expect(existsSync(f.credential)).toBe(true)
    expect(existsSync(f.manifest.freshRoot)).toBe(false)
  })
  it('retains the exact private root and auth link when MCP cleanup reports uncertain effects', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot),
      child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    f.callbacks.closeMcp.mockResolvedValue(false)
    expect(await child.stop()).toMatchObject({
      status: 'uncertain',
      groupExitObserved: true,
      privateRootRemoved: false,
      privateRootRetained: true,
    })
    expect(readlinkSync(path.join(f.manifest.freshRoot, 'codex-home/auth.json'))).toBe(f.credential)
    expect(existsSync(f.manifest.freshRoot)).toBe(true)
    expect(existsSync(f.credential)).toBe(true)
    expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
    trace.close()
    expect(readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).toContain(
      '"stage":"CLEANUP","status":"UNKNOWN","reason":"CLEANUP_MCP_UNPROVEN"',
    )
  })
  it('pins file-backed auth and disables every supported feature explicitly', () => {
    const f = setup()
    const rendered = renderNativeQualificationConfiguration(f.manifest, f.capability)
    expect(rendered).toContain('cli_auth_credentials_store = "file"')
    expect(rendered).toContain('mcp_oauth_credentials_store = "file"')
    for (const tool of f.manifest.enabledTools)
      expect(rendered).toContain(
        `[mcp_servers.appraise_worker.tools.${JSON.stringify(tool)}]\napproval_mode = "approve"`,
      )
    expect(rendered).not.toContain('default_tools_approval_mode')
    for (const key of nativeQualificationFeatureControls) expect(rendered).toContain(`${key} = false`)
    expect(rendered).toContain('web_search = "disabled"')
  })
  it('refuses private configuration drift before the default acquisition', async () => {
    const f = setup()
    f.callbacks.assertAdmission.mockImplementation(() =>
      writeFileSync(path.join(f.manifest.freshRoot, 'codex-home/config.toml'), 'changed config'),
    )
    await expect(launchNativeQualificationChild(f.plan, f.callbacks)).rejects.toThrow(/refused/)
    expect(owned.spawn).not.toHaveBeenCalled()
  })
  it('captures only the exact original live supervisor IPC disconnector', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const disconnect = f.callbacks.captureOriginalDisconnect.mock.calls[0][0] as () => boolean
    expect(disconnect()).toBe(true)
    expect(disconnect()).toBe(false)
    expect(f.original.process.disconnect).toHaveBeenCalledTimes(1)
    await child.stop()
  })
  it('refuses source drift before root acquisition', async () => {
    const f = setup()
    writeFileSync(f.manifest.native.path, 'changed source')
    await expect(launchNativeQualificationChild(f.plan, f.callbacks)).rejects.toThrow(/plan refused/)
    expect(owned.spawn).not.toHaveBeenCalled()
    expect(existsSync(f.manifest.freshRoot)).toBe(false)
  })
  it('never removes a replaced auth link and retains private resources on uncertain cleanup', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot),
      child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    const auth = path.join(f.manifest.freshRoot, 'codex-home/auth.json')
    unlinkSync(auth)
    writeFileSync(auth, 'replacement')
    expect(await child.stop()).toMatchObject({
      status: 'uncertain',
      groupExitObserved: true,
      privateRootRetained: true,
    })
    expect(lstatSync(auth).isFile()).toBe(true)
    expect(existsSync(f.credential)).toBe(true)
    trace.close()
    expect(readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).toContain(
      '"stage":"CLEANUP","status":"UNKNOWN","reason":"CLEANUP_CREDENTIAL_UNPROVEN"',
    )
  })
  it('retains unknown original acquisition and never reconstructs a process handle', async () => {
    const f = setup()
    owned.spawn.mockRejectedValueOnce(new Error('lost acquisition reply'))
    await expect(launchNativeQualificationChild(f.plan, f.callbacks)).rejects.toThrow(/retained UNKNOWN/)
    expect(owned.stop).not.toHaveBeenCalled()
    expect(existsSync(f.manifest.freshRoot)).toBe(true)
  })
  it('refuses cancellation before actual spawn after private setup', async () => {
    const f = setup()
    f.callbacks.assertAdmission.mockImplementation(() => {
      throw new Error('cancelled')
    })
    await expect(launchNativeQualificationChild(f.plan, f.callbacks)).rejects.toThrow(/refused/)
    expect(owned.spawn).not.toHaveBeenCalled()
    expect(existsSync(f.manifest.freshRoot)).toBe(false)
  })
})

describe('bounded original native lifetime and passive drain', () => {
  it('returns UNKNOWN on never-settling acquisition and cleans a late original handle once', async () => {
    const f = setup()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let resolve!: (value: SpawnedProcess) => void
    owned.spawn.mockReturnValue(
      new Promise<SpawnedProcess>(done => {
        resolve = done
      }),
    )
    const launch = launchNativeQualificationChild(f.plan, f.callbacks)
    const rejected = expect(launch).rejects.toThrow(/retained UNKNOWN/)
    await vi.waitFor(() => expect(owned.spawn).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(f.manifest.limits.acquisitionMs)
    await rejected
    expect(existsSync(f.manifest.freshRoot)).toBe(true)
    resolve(f.original)
    await vi.waitFor(() => expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original))
  })
  it('never settles an unresolved original cleanup as stopped and retains resources after late physical success', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot),
      child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let resolve!: () => void
    owned.stop.mockReturnValue(
      new Promise<void>(done => {
        resolve = done
      }),
    )
    const stopped = child.stop()
    await vi.advanceTimersByTimeAsync(f.manifest.limits.cleanupMs)
    expect(await stopped).toMatchObject({ status: 'uncertain', groupExitObserved: false, privateRootRetained: true })
    resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(existsSync(f.manifest.freshRoot)).toBe(true)
    expect(child.stop()).toBe(stopped)
    trace.close()
    expect(readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).toContain(
      '"stage":"CLEANUP","status":"UNKNOWN","reason":"CLEANUP_DEADLINE"',
    )
  })
  it.each(['invalid', 'partial', 'missing-eof'] as const)(
    'retains resources for %s passive output after fencing without canonical callback delivery',
    async fault => {
      const f = setup(),
        child = await launchNativeQualificationChild(f.plan, f.callbacks)
      owned.stop.mockImplementation(async () => {
        const process = f.original.process
        if (fault === 'invalid') process.stdout!.push(Buffer.from('{invalid}\n'))
        if (fault === 'partial') process.stdout!.push(Buffer.from('{"id":'))
        if (fault !== 'missing-eof') {
          process.stdout!.push(null)
          process.stderr!.push(null)
        }
      })
      expect(await child.stop()).toMatchObject({
        status: 'uncertain',
        groupExitObserved: true,
        privateRootRetained: true,
      })
      expect(f.callbacks.onNotification).not.toHaveBeenCalled()
      expect(existsSync(f.manifest.freshRoot)).toBe(true)
    },
  )
  it('still fences the sender and retains uncertainty when the owned MCP fence throws', async () => {
    const f = setup()
    f.callbacks.fenceMcp.mockImplementation(() => {
      throw new Error('synthetic fence uncertainty')
    })
    const child = await launchNativeQualificationChild(f.plan, f.callbacks)
    expect(await child.stop()).toMatchObject({ status: 'uncertain', privateRootRetained: true })
    expect(child.transport.snapshot().status).toBe('fenced')
    expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
  })
})

describe('late original RPC bytes remain observable after the sender fence', () => {
  it('drains a correlated schema-valid late reply without reopening its rejected request', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const pending = child.transport.request('initialize', { clientInfo: { name: 'synthetic', version: '1' } })
    const rejected = expect(pending).rejects.toThrow()
    owned.stop.mockImplementation(async () => {
      f.original.process.stdout!.push(
        Buffer.from(
          JSON.stringify({
            id: 1,
            result: { codexHome: '/synthetic', platformFamily: 'unix', platformOs: 'macos', userAgent: 'synthetic' },
          }) + '\n',
        ),
      )
      f.original.process.stdout!.push(null)
      f.original.process.stderr!.push(null)
    })
    expect(await child.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    await rejected
    expect(f.callbacks.onNotification).not.toHaveBeenCalled()
    expect(f.callbacks.onFault).not.toHaveBeenCalled()
  })
  it('refuses a malformed late reply even after the original group exit is observed', async () => {
    const f = setup(),
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
    const pending = child.transport.request('initialize', { clientInfo: { name: 'synthetic', version: '1' } })
    const rejected = expect(pending).rejects.toThrow()
    owned.stop.mockImplementation(async () => {
      f.original.process.stdout!.push(
        Buffer.from(JSON.stringify({ id: 1, result: {}, error: { code: -1, message: 'synthetic' } }) + '\n'),
      )
      f.original.process.stdout!.push(null)
      f.original.process.stderr!.push(null)
    })
    expect(await child.stop()).toMatchObject({
      status: 'uncertain',
      groupExitObserved: true,
      privateRootRetained: true,
    })
    await rejected
    expect(f.callbacks.onNotification).not.toHaveBeenCalled()
    expect(f.callbacks.onFault).toHaveBeenCalledWith('native_passive_drain_refused')
  })
})

describe('safe phase failures preserve the original cleanup capability', () => {
  it('sanitizes a hostile setup refusal without reading exception properties or entering acquisition', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
    const getters = vi.fn(() => {
      throw new Error('Exception property inspected')
    })
    const hostile = Object.create(null)
    for (const key of ['message', 'stack', 'cause', 'code', 'kind', 'name', 'pid', 'token'])
      Object.defineProperty(hostile, key, { enumerable: true, get: getters })
    f.callbacks.assertAdmission.mockImplementation(() => {
      throw hostile
    })
    await expect(
      launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer }),
    ).rejects.toThrow(/Native acquisition refused/)
    trace.close()
    const bytes = readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
    const rows = bytes
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(rows).toContainEqual(
      expect.objectContaining({ stage: 'PRIVATE_CONFIG', status: 'REFUSED', reason: 'BOUNDARY_REFUSED' }),
    )
    expect(rows.some(row => row.stage === 'ACQUISITION')).toBe(false)
    expect(getters).not.toHaveBeenCalled()
    expect(owned.spawn).not.toHaveBeenCalled()
    expect(bytes).not.toMatch(/Exception property|message|stack|cause|token|pid/)
  })
  it('fences before another RPC on sink identity failure and stops only the original child once', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
    const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    chmodSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 0o644)
    expect(() => child.transport.request('initialize', { clientInfo: { name: 'inert', version: '0' } })).toThrow(
      /diagnostic unavailable UNKNOWN/,
    )
    expect(child.transport.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 0 })
    await child.stop()
    expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
    expect(f.callbacks.fenceMcp).toHaveBeenCalledOnce()
    trace.close()
  })
  it('retains a late original acquisition for the same single cleanup after sink failure', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
    let acquired!: (original: SpawnedProcess) => void
    let entered!: () => void
    const acquisitionEntered = new Promise<void>(resolve => {
      entered = resolve
    })
    const pendingAcquisition = new Promise<SpawnedProcess>(resolve => {
      acquired = resolve
    })
    owned.spawn.mockImplementation(() => {
      entered()
      return pendingAcquisition
    })
    const launch = launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    const refused = expect(launch).rejects.toThrow(/Native acquisition/)
    await acquisitionEntered
    chmodSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 0o644)
    expect(trace.observer.record('ACQUISITION', 'ENTERED')).toBe(false)
    expect(owned.stop).not.toHaveBeenCalled()
    acquired(f.original)
    await refused
    await vi.waitFor(() => expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original))
    expect(f.callbacks.fenceMcp).toHaveBeenCalledOnce()
    trace.close()
  })
})

it('reserves one original cleanup flight before a sink failure at cleanup entry can reenter stop', async () => {
  const f = setup(),
    trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
  const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
  const observer = {
    beforeRequest: vi.fn(),
    operation: vi.fn(),
    notification: vi.fn(),
    fault: vi.fn(),
    cleanup: vi.fn(),
  }
  claimOriginalNativeQualificationChild(child, f.plan, observer)
  chmodSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 0o644)
  const originalStop = child.stop()
  expect(child.stop()).toBe(originalStop)
  expect(await originalStop).toMatchObject({ status: 'stopped', privateRootRemoved: true })
  expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
  expect(f.callbacks.closeMcp).toHaveBeenCalledOnce()
  expect(observer.cleanup).toHaveBeenCalledOnce()
  expect(existsSync(f.manifest.freshRoot)).toBe(false)
  trace.close()
})

describe('fixed passive failure classes preserve original poison and cleanup', () => {
  it.each([
    ['reply', { id: 99, result: {} }, 'PASSIVE_PROTOCOL_REPLY'],
    ['frame', null, 'PASSIVE_PROTOCOL_FRAME'],
    [
      'account',
      { method: 'account/updated', params: { authMode: 'invalid-synthetic-mode' } },
      'PASSIVE_PROTOCOL_ACCOUNT_UPDATED',
    ],
    ['remote', { method: 'remoteControl/status/changed', params: {} }, 'PASSIVE_PROTOCOL_REMOTE_STATUS'],
    ['mcp', { method: 'mcpServer/startupStatus/updated', params: {} }, 'PASSIVE_PROTOCOL_MCP_STARTUP'],
    ['other', { method: 'secret future method /private/provider', params: {} }, 'PASSIVE_PROTOCOL_OTHER'],
  ])('records only the first %s protocol refusal before existing generic poison', async (_label, frame, expected) => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
    const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    for (let index = 0; index < 3; index++)
      f.original.process.stdout!.emit('data', Buffer.from(JSON.stringify(frame) + '\n'))
    expect(await child.stop()).toMatchObject({ status: 'uncertain', privateRootRetained: true })
    trace.close()
    const bytes = readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
    const rows = bytes
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(rows.filter(row => row.stage.startsWith('PASSIVE_'))).toEqual([
      expect.objectContaining({ stage: expected, status: 'REFUSED', reason: 'PROTOCOL_REFUSED' }),
    ])
    expect(rows.findIndex(row => row.stage === expected)).toBeLessThan(
      rows.findIndex(row => row.reason === 'PASSIVE_CAPTURE_REFUSED'),
    )
    expect(f.callbacks.onFault).toHaveBeenCalledWith('native_passive_drain_refused')
    expect(bytes).not.toMatch(/secret|future method|private\/provider|invalid-synthetic-mode/)
    expect(owned.stop).toHaveBeenCalledExactlyOnceWith(f.original)
  })
  it.each(['malformed-json', 'stream-error'])(
    'records residual %s only when no callback refusal was observed',
    async mode => {
      const f = setup(),
        trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
      const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
      if (mode === 'malformed-json')
        f.original.process.stdout!.emit('data', Buffer.from('{ malformed private payload\n'))
      else f.original.process.stdout!.emit('error', new Error('private token provider stream error'))
      expect(await child.stop()).toMatchObject({ status: 'uncertain', privateRootRetained: true })
      trace.close()
      const bytes = readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
      const rows = bytes
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      expect(rows.filter(row => row.stage.startsWith('PASSIVE_'))).toEqual([
        expect.objectContaining({ stage: 'PASSIVE_STREAM', status: 'REFUSED', reason: 'STREAM_PARSE_OR_IO_REFUSED' }),
      ])
      expect(bytes).not.toMatch(/private payload|private token|provider stream error/)
    },
  )
  it.each(['attached', 'preclaim', 'schema-branch'])(
    'locates %s original outcome observer refusal without reading its hostile exception',
    async timing => {
      const f = setup(),
        trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
      const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
      const read = vi.fn(() => {
          throw new Error('raw exception getter read')
        }),
        hostile = Object.create(null)
      for (const key of ['message', 'stack', 'cause', 'name', 'code', 'pid', 'token'])
        Object.defineProperty(hostile, key, { get: read })
      const observer = {
        beforeRequest: vi.fn(),
        operation: vi.fn(),
        notification() {
          throw hostile
        },
        fault: vi.fn(),
        cleanup: vi.fn(),
      }
      if (timing !== 'preclaim') claimOriginalNativeQualificationChild(child, f.plan, observer)
      const frame =
        timing === 'schema-branch'
          ? { method: 'skills/changed', params: {} }
          : { method: 'account/updated', params: { authMode: null, planType: null } }
      f.original.process.stdout!.emit('data', Buffer.from(JSON.stringify(frame) + '\n'))
      if (timing === 'preclaim')
        expect(() => claimOriginalNativeQualificationChild(child, f.plan, observer)).toThrow(/Original pre-handshake/)
      expect(await child.stop()).toMatchObject({ status: timing === 'preclaim' ? 'stopped' : 'uncertain' })
      trace.close()
      const rows = readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      expect(rows.filter(row => row.stage.startsWith('PASSIVE_'))).toEqual([
        expect.objectContaining({
          stage: timing === 'schema-branch' ? 'PASSIVE_OUTCOME_OTHER' : 'PASSIVE_OUTCOME_ACCOUNT_UPDATED',
          status: 'REFUSED',
          reason: 'OUTCOME_OBSERVER_REFUSED',
        }),
      ])
      const refusal = rows.find(row => row.reason === 'OUTCOME_OBSERVER_REFUSED')
      expect(refusal?.notificationSchemaBranch).toBe(timing === 'schema-branch' ? 10 : undefined)
      expect(JSON.stringify(rows)).not.toContain(frame.method)
      expect(read).not.toHaveBeenCalled()
      expect(observer.fault).toHaveBeenCalled()
    },
  )
  it('records bounded preclaim overflow separately without manufacturing a stream fault', async () => {
    const f = setup(),
      trace = createNativeQualificationDiagnostics(f.parent, f.manifest.freshRoot)
    const child = await launchNativeQualificationChild(f.plan, { ...f.callbacks, diagnostics: trace.observer })
    const frame = Buffer.from(
      JSON.stringify({
        method: 'remoteControl/status/changed',
        params: { installationId: 'test', serverName: 'test', status: 'disabled', environmentId: null },
      }) + '\n',
    )
    for (let index = 0; index < 100; index++) f.original.process.stdout!.emit('data', frame)
    const observer = {
      beforeRequest: vi.fn(),
      operation: vi.fn(),
      notification: vi.fn(),
      fault: vi.fn(),
      cleanup: vi.fn(),
    }
    expect(() => claimOriginalNativeQualificationChild(child, f.plan, observer)).toThrow(/Original pre-handshake/)
    expect(child.transport.snapshot().issuedRequests).toBe(0)
    expect(await child.stop()).toMatchObject({ status: 'stopped', privateRootRemoved: true })
    trace.close()
    const rows = readFileSync(path.join(f.parent, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(rows.filter(row => row.stage.startsWith('PASSIVE_'))).toEqual([
      expect.objectContaining({ stage: 'PASSIVE_PRECLAIM', status: 'REFUSED', reason: 'PRECLAIM_CAPTURE_LIMIT' }),
    ])
    expect(rows.some(row => row.reason === 'PASSIVE_CAPTURE_REFUSED')).toBe(false)
    expect(observer.notification).not.toHaveBeenCalled()
  })
})
