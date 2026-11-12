import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFile: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  launchServer: vi.fn(),
}))
vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mocks.spawn,
  execFile: Object.assign(mocks.execFile, { [Symbol.for('nodejs.util.promisify.custom')]: mocks.execFile }),
}))
vi.mock('node:fs/promises', async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  mkdtemp: mocks.mkdtemp,
  rm: mocks.rm,
}))
vi.mock('playwright', () => ({ chromium: { launchServer: mocks.launchServer } }))
import { launchDiscoveryBrowserTransport } from './quality-journey-discovery-browser-transport'

class OwnedChild extends EventEmitter {
  pid = 43123
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  stdio = [null, null, null, new PassThrough(), new PassThrough()] as const
  exit(signal: NodeJS.Signals | null = 'SIGKILL') {
    this.signalCode = signal
    this.exitCode = signal ? null : 0
    this.emit('exit', this.exitCode, signal)
  }
}

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

let child: OwnedChild
let groupAlive: boolean
let kill: MockInstance<typeof process.kill>
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  child = new OwnedChild()
  groupAlive = false
  mocks.spawn.mockReturnValue(child as unknown as ChildProcess)
  mocks.mkdtemp.mockResolvedValue('/tmp/owned-discovery-profile')
  mocks.rm.mockResolvedValue(undefined)
  mocks.execFile.mockImplementation(async () => ({ stdout: groupAlive ? `43124 ${child.pid} S\n` : '' }))
  const probe = new OwnedChild()
  Object.assign(probe, {
    spawnfile: '/fixture/chromium',
    spawnargs: ['/fixture/chromium', '--remote-debugging-pipe', '--user-data-dir=/tmp/probe'],
  })
  mocks.launchServer.mockResolvedValue({
    process: () => probe,
    close: async () => {
      probe.exit()
    },
    kill: async () => {
      probe.exit()
    },
  })

  kill = vi.spyOn(process, 'kill').mockReturnValue(true)
})
afterEach(() => {
  kill.mockRestore()
  vi.useRealTimers()
})

async function fixture() {
  const transport = await launchDiscoveryBrowserTransport(true)
  return { transport, input: child.stdio[3], output: child.stdio[4] }
}

describe('owned discovery transport teardown', () => {
  it('fences protocol work and initiates SIGKILL before a reentrant throwing loss observer', async () => {
    const { transport, input, output } = await fixture()
    const events = vi.fn()
    transport.events(events)
    let reentrant: Promise<void> | undefined
    const lost = vi.fn(() => {
      expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid, 'SIGKILL')
      expect(transport.isConnected()).toBe(false)
      reentrant = transport.close()
      throw new Error('observer failure must not block stop')
    })
    transport.lost(lost)
    const pending = transport.send('Fixture.pending').catch(error => error)
    // Retain an incomplete raw frame before shutdown, then try to complete it afterward.
    output.emit('data', '{"method":"Fixture.late"')
    const closed = transport.close()
    expect(reentrant).toBe(closed)
    expect(transport.close()).toBe(closed)
    expect(input.destroyed).toBe(false)
    expect(output.destroyed).toBe(false)
    await expect(transport.send('Fixture.after')).rejects.toThrow('closed')
    expect(await pending).toBeInstanceOf(Error)
    output.emit('data', '}\0{"method":"Fixture.alsoLate"}\0')
    expect(events).not.toHaveBeenCalled()
    expect(mocks.execFile).not.toHaveBeenCalled()
    child.exit()
    await closed
    expect(input.destroyed).toBe(true)
    expect(output.destroyed).toBe(true)
    expect(lost).toHaveBeenCalledTimes(1)
    expect(mocks.rm).toHaveBeenCalledExactlyOnceWith('/tmp/owned-discovery-profile', { recursive: true, force: true })
    await vi.advanceTimersByTimeAsync(15_000)
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('waits for child exit before probing the original process group', async () => {
    const { transport, input } = await fixture()
    const closed = transport.close()
    await flush()
    expect(mocks.execFile).not.toHaveBeenCalled()
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(input.destroyed).toBe(false)
    child.exit()
    await closed
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
  })

  it('waits for the full group after child exit without sending another signal', async () => {
    const { transport, input, output } = await fixture()
    groupAlive = true
    const closed = transport.close()
    child.exit()
    await flush()
    expect(mocks.execFile).toHaveBeenCalledTimes(1)
    expect(input.destroyed).toBe(false)
    expect(output.destroyed).toBe(false)
    expect(mocks.rm).not.toHaveBeenCalled()
    groupAlive = false
    await vi.advanceTimersByTimeAsync(25)
    await closed
    expect(kill).toHaveBeenCalledTimes(1)
    expect(input.destroyed).toBe(true)
  })

  it.each(['signal', 'child-exit', 'group-probe', 'group-survives'])(
    'retains pipes and profile and caches rejected close when %s fails',
    async failure => {
      const { transport, input, output } = await fixture()
      if (failure === 'signal')
        kill.mockImplementation(() => {
          throw new Error('synthetic signal denial')
        })
      if (failure === 'group-probe') mocks.execFile.mockRejectedValue(new Error('synthetic process inventory failure'))
      if (failure === 'group-survives') groupAlive = true
      transport.lost(() => {
        throw new Error('observer must not replace stop failure')
      })
      const closed = transport.close()
      const outcome = closed.catch(error => error as Error)
      if (failure !== 'signal' && failure !== 'child-exit') child.exit()
      await vi.advanceTimersByTimeAsync(4_000)
      const error = await outcome
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain('observer')
      expect(transport.close()).toBe(closed)
      expect(input.destroyed).toBe(false)
      expect(output.destroyed).toBe(false)
      expect(mocks.rm).not.toHaveBeenCalled()
      expect(transport.isConnected()).toBe(false)
      expect(kill).toHaveBeenCalledTimes(1)
    },
  )

  it('does not signal a child that naturally exited before close', async () => {
    const { transport, input } = await fixture()
    child.exit(null)
    await transport.close()
    expect(kill).not.toHaveBeenCalled()
    expect(input.destroyed).toBe(true)
    expect(mocks.rm).toHaveBeenCalledTimes(1)
  })

  it('retains unresolved descendants after natural exit without reconstructing signal authority', async () => {
    const { transport, input, output } = await fixture()
    groupAlive = true
    child.exit(null)
    const closed = transport.close()
    const outcome = closed.catch(error => error as Error)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(await outcome).toBeInstanceOf(Error)
    expect(kill).not.toHaveBeenCalled()
    expect(input.destroyed).toBe(false)
    expect(output.destroyed).toBe(false)
    expect(mocks.rm).not.toHaveBeenCalled()
  })

  it('handles externally lost output through the same immediate owned stop flight', async () => {
    const { transport, input, output } = await fixture()
    const lost = vi.fn()
    transport.lost(lost)
    output.emit('error', new Error('external pipe loss'))
    const closed = transport.close()
    expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid, 'SIGKILL')
    expect(lost).toHaveBeenCalledTimes(1)
    expect(input.destroyed).toBe(false)
    child.exit()
    await closed
    expect(input.destroyed).toBe(true)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}
function probeFixture() {
  const process = new OwnedChild()
  Object.assign(process, {
    spawnfile: '/fixture/chromium',
    spawnargs: ['/fixture/chromium', '--remote-debugging-pipe', '--user-data-dir=/tmp/probe'],
  })
  const close = vi.fn(async () => {
    process.exit()
  })
  const kill = vi.fn(async () => {
    process.exit()
  })
  return { process: () => process, close, kill, originalChild: process }
}

describe('bounded discovery browser startup custody', () => {
  it('performs no native work when already aborted', async () => {
    const abort = new AbortController()
    abort.abort('private abort reason')
    const error = await launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    expect(error).toMatchObject({ category: 'ABORTED' })
    expect(String(error)).not.toContain('private abort reason')
    expect(await error.cleanup).toBe('OBSERVED')
    expect(mocks.launchServer).not.toHaveBeenCalled()
    expect(mocks.mkdtemp).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('fences a pending probe and owns its late handle until one cleanup completes', async () => {
    const pending = deferred<ReturnType<typeof probeFixture>>()
    const probe = probeFixture()
    mocks.launchServer.mockReturnValue(pending.promise)
    const abort = new AbortController()
    const starting = launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    expect(mocks.launchServer).toHaveBeenCalledExactlyOnceWith({ headless: true, timeout: 30_000 })
    abort.abort()
    const error = await starting
    expect(error).toMatchObject({ category: 'ABORTED', cleanupStatus: 'UNKNOWN' })
    let drained = false
    void error.cleanup.then(() => {
      drained = true
    })
    await flush()
    expect(drained).toBe(false)
    pending.resolve(probe)
    expect(await error.cleanup).toBe('OBSERVED')
    expect(probe.close).toHaveBeenCalledTimes(1)
    expect(probe.kill).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('bounds admission at 45 seconds while retaining a never-returning probe and its late cleanup', async () => {
    const pending = deferred<ReturnType<typeof probeFixture>>()
    mocks.launchServer.mockReturnValue(pending.promise)
    const starting = launchDiscoveryBrowserTransport(true).catch(error => error)
    await vi.advanceTimersByTimeAsync(45_000)
    const error = await starting
    expect(error).toMatchObject({ category: 'DEADLINE', cleanupStatus: 'UNKNOWN' })
    expect(mocks.spawn).not.toHaveBeenCalled()
    const probe = probeFixture()
    pending.resolve(probe)
    expect(await error.cleanup).toBe('OBSERVED')
    expect(probe.close).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it.each(['reject', 'hang'])(
    'fails admission when graceful probe close %s even if supported kill cleans it',
    async vector => {
      const probe = probeFixture()
      if (vector === 'reject') probe.close.mockRejectedValue(new Error('private probe error'))
      else probe.close.mockReturnValue(new Promise(() => undefined))
      mocks.launchServer.mockResolvedValue(probe)
      const starting = launchDiscoveryBrowserTransport(true).catch(error => error)
      await vi.advanceTimersByTimeAsync(5_000)
      const error = await starting
      expect(error).toMatchObject({ category: 'PROBE_CLOSE_FAILED' })
      expect(await error.cleanup).toBe('OBSERVED')
      expect(probe.kill).toHaveBeenCalledTimes(1)
      expect(mocks.mkdtemp).not.toHaveBeenCalled()
      expect(mocks.spawn).not.toHaveBeenCalled()
      expect(String(error)).not.toContain('private probe error')
    },
  )

  it.each(['reject', 'hang', 'no-exit'])('retains UNKNOWN when probe kill %s', async vector => {
    const probe = probeFixture()
    probe.close.mockRejectedValue(new Error('close rejected'))
    if (vector === 'reject') probe.kill.mockRejectedValue(new Error('kill rejected'))
    else if (vector === 'hang') probe.kill.mockReturnValue(new Promise(() => undefined))
    else probe.kill.mockResolvedValue(undefined)
    mocks.launchServer.mockResolvedValue(probe)
    const starting = launchDiscoveryBrowserTransport(true).catch(error => error)
    await vi.advanceTimersByTimeAsync(10_000)
    const error = await starting
    expect(error).toMatchObject({ category: 'PROBE_CLOSE_FAILED', cleanupStatus: 'UNKNOWN' })
    expect(await error.cleanup).toBe('UNKNOWN')
    expect(probe.kill).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('removes a late profile after abort without ever spawning an owned browser', async () => {
    const profile = deferred<string>()
    const entered = deferred<void>()
    mocks.mkdtemp.mockImplementation(() => {
      entered.resolve()
      return profile.promise
    })
    const abort = new AbortController()
    const starting = launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    await entered.promise
    expect(mocks.mkdtemp).toHaveBeenCalledTimes(1)
    abort.abort()
    const error = await starting
    expect(mocks.rm).not.toHaveBeenCalled()
    profile.resolve('/tmp/late-profile')
    expect(await error.cleanup).toBe('OBSERVED')
    expect(mocks.rm).toHaveBeenCalledExactlyOnceWith('/tmp/late-profile', { recursive: true, force: true })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('captures a child returned by a spawn that synchronously aborts before publication', async () => {
    const abort = new AbortController()
    mocks.spawn.mockImplementation(() => {
      abort.abort()
      return child
    })
    const starting = launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    await flush()
    const error = await starting
    expect(error).toMatchObject({ category: 'ABORTED' })
    expect(kill).toHaveBeenCalledExactlyOnceWith(-child.pid, 'SIGKILL')
    expect(mocks.rm).not.toHaveBeenCalled()
    expect(child.stdio[3].destroyed).toBe(false)
    child.exit()
    expect(await error.cleanup).toBe('OBSERVED')
    expect(child.stdio[3].destroyed).toBe(true)
    expect(mocks.rm).toHaveBeenCalledTimes(1)
  })
  it('joins one probe cleanup when its close callback synchronously aborts admission', async () => {
    const probe = probeFixture()
    const abort = new AbortController()
    probe.close.mockImplementation(async () => {
      abort.abort()
      probe.originalChild.exit()
    })
    mocks.launchServer.mockResolvedValue(probe)
    const error = await launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    expect(error).toMatchObject({ category: 'ABORTED', phase: 'PROBE_CLOSE' })
    expect(await error.cleanup).toBe('OBSERVED')
    expect(probe.close).toHaveBeenCalledTimes(1)
    expect(probe.kill).not.toHaveBeenCalled()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('retains late probe rejection as UNKNOWN without replacing its primary abort category', async () => {
    const pending = deferred<ReturnType<typeof probeFixture>>()
    mocks.launchServer.mockReturnValue(pending.promise)
    const abort = new AbortController()
    const starting = launchDiscoveryBrowserTransport(true, { signal: abort.signal }).catch(error => error)
    abort.abort()
    const error = await starting
    pending.reject(new Error('private late rejection'))
    expect(await error.cleanup).toBe('UNKNOWN')
    expect(error.category).toBe('ABORTED')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('fails closed when the public probe has no original child handle for exit observation', async () => {
    const probe = probeFixture()
    mocks.launchServer.mockResolvedValue({ ...probe, process: () => undefined })
    const error = await launchDiscoveryBrowserTransport(true).catch(error => error)
    expect(await error.cleanup).toBe('UNKNOWN')
    expect(probe.kill).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('never admits when close resolves but the original child exit remains unproved after kill', async () => {
    const probe = probeFixture()
    probe.close.mockResolvedValue(undefined)
    probe.kill.mockResolvedValue(undefined)
    mocks.launchServer.mockResolvedValue(probe)
    const starting = launchDiscoveryBrowserTransport(true).catch(error => error)
    await vi.advanceTimersByTimeAsync(10_000)
    const error = await starting
    expect(error.category).toBe('PROBE_CLOSE_FAILED')
    expect(await error.cleanup).toBe('UNKNOWN')
    expect(probe.kill).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).not.toHaveBeenCalled()
  })
  it('does not treat a probe handle with missing exit fields as observed exit evidence', async () => {
    const original = new EventEmitter()
    Object.assign(original, {
      spawnfile: '/fixture/chromium',
      spawnargs: ['/fixture/chromium', '--remote-debugging-pipe', '--user-data-dir=/tmp/probe'],
    })
    const close = vi.fn(async () => undefined)
    const supportedKill = vi.fn(async () => undefined)
    mocks.launchServer.mockResolvedValue({ process: () => original, close, kill: supportedKill })
    const error = await launchDiscoveryBrowserTransport(true).catch(error => error)
    expect(error).toMatchObject({ category: 'PROBE_CLOSE_FAILED', cleanupStatus: 'UNKNOWN' })
    expect(await error.cleanup).toBe('UNKNOWN')
    expect(close).toHaveBeenCalledTimes(1)
    expect(supportedKill).toHaveBeenCalledTimes(1)
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(kill).not.toHaveBeenCalled()
  })
})
