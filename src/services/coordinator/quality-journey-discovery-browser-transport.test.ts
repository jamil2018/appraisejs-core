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
  mocks.launchServer.mockResolvedValue({
    process: () => ({
      spawnfile: '/fixture/chromium',
      spawnargs: ['/fixture/chromium', '--remote-debugging-pipe', '--user-data-dir=/tmp/probe'],
    }),
    close: async () => undefined,
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
