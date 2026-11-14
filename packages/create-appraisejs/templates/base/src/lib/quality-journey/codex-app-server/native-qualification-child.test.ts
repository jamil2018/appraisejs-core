import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { existsSync, lstatSync, readlinkSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureNativeQualificationPlan, renderNativeQualificationConfiguration } from './native-qualification-contract'
import { nativeQualificationFeatureControls } from './native-qualification-configuration'
import { launchNativeQualificationChild, claimOriginalNativeQualificationChild } from './native-qualification-child'
import { syntheticNativeManifest } from './native-qualification.test-support'
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
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
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
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
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
      child = await launchNativeQualificationChild(f.plan, f.callbacks)
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
