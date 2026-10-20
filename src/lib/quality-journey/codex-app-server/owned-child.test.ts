import path from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { taskSpawner } from '../../process/task-spawner'
import { spawnOwnedProcessGroup, stopOwnedProcessGroup } from '../../process/owned-process-stop'
import { launchOwnedFixtureChild, launchOwnedProviderChild, type OwnedFixtureChild } from './owned-child'

const children: OwnedFixtureChild[] = []
afterEach(async () => {
  const receipts = await Promise.all(children.splice(0).map(child => child.stop()))
  for (const receipt of receipts) expect(receipt).toMatchObject({ groupExitObserved: true, privateRootRemoved: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const fixturePath = path.resolve('scripts/tests/fixtures/m05-owned-child.mjs')
async function launch(fixtureArgs = ['hold']) {
  const onFault = vi.fn()
  const onNotification = vi.fn()
  const child = await launchOwnedFixtureChild({
    fixturePath,
    fixtureArgs,
    transportId: 'owned-test-transport',
    onFault,
    onNotification,
    requestTimeoutMs: 1_000,
  })
  children.push(child)
  return { ...child, onFault, onNotification }
}

describe.skipIf(process.platform === 'win32')('actual owned fixture child', () => {
  it('preserves startup stdout and stderr before the private consumer attaches', async () => {
    const child = await spawnOwnedProcessGroup(
      process.execPath,
      ['-e', 'process.stdout.write("startup-out\\n");process.stderr.write("startup-err\\n");setInterval(()=>{},1000)'],
      {
        supervisorPath: path.resolve('scripts/owned-process-supervisor.mjs'),
        cwd: tmpdir(),
        env: {},
        streamLogs: false,
        captureOutput: false,
        retainProcessRecord: false,
        privateStdio: true,
      },
    )
    try {
      await delay(100)
      expect(child.process.stdout?.readableFlowing).toBe(false)
      expect(child.process.stderr?.readableFlowing).toBe(false)
      const read = (stream: NonNullable<typeof child.process.stdout>) =>
        new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('startup bytes were lost')), 1_000)
          stream.once('data', (chunk: Buffer) => {
            clearTimeout(timer)
            resolve(chunk.toString())
          })
          stream.resume()
        })
      await expect(read(child.process.stdout!)).resolves.toBe('startup-out\n')
      await expect(read(child.process.stderr!)).resolves.toBe('startup-err\n')
      expect(child.output).toEqual({ stdout: [], stderr: [] })
    } finally {
      await expect(stopOwnedProcessGroup(child)).resolves.toMatchObject({ kind: 'group_exit_observed' })
    }
  }, 15_000)

  it('isolates the actual Node child and owns init/resume/interrupt/fenced idempotent cleanup', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-do-not-copy')
    vi.stubEnv('CODEX_HOME', '/synthetic/ambient-codex-home')
    const emitted = { spawn: vi.fn(), stdout: vi.fn(), stderr: vi.fn(), exit: vi.fn() }
    for (const [event, listener] of Object.entries(emitted)) taskSpawner.on(event, listener)
    try {
      const child = await launch()
      expect(child.transportId).toBe('owned-test-transport')
      await expect(child.transport.request('initialize', {})).resolves.toMatchObject({ isolationChecked: true })
      await child.transport.notifyInitialized()
      await expect(child.transport.request('thread/resume', { threadId: 'm05-fixture-thread' })).resolves.toEqual({
        thread: { id: 'm05-fixture-thread' },
      })
      await expect(child.transport.request('turn/start', { threadId: 'm05-fixture-thread' })).resolves.toEqual({
        turn: { id: 'm05-fixture-turn' },
      })
      await expect(
        child.transport.request('turn/interrupt', { threadId: 'm05-fixture-thread', turnId: 'm05-fixture-turn' }),
      ).resolves.toMatchObject({ interrupted: true })
      const first = child.stop()
      expect(child.transport.snapshot()).toMatchObject({ status: 'fenced', reason: 'owned_stop', pendingRequests: 0 })
      expect(child.stop()).toBe(first)
      const receipt = await first
      expect(receipt).toEqual({
        status: 'stopped',
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      })
      expect(await child.stop()).toBe(receipt)
      await expect(child.transport.request('turn/start', {})).rejects.toMatchObject({ reason: 'fenced' })
      expect(child.onFault).not.toHaveBeenCalled()
      expect(child.transport.snapshot()).toMatchObject({ issuedRequests: 4, receivedFrames: 4, writing: false })
      for (const listener of Object.values(emitted)) expect(listener).not.toHaveBeenCalled()
      expect(Object.keys(child).sort()).toEqual(['onFault', 'onNotification', 'stop', 'transport', 'transportId'])
      expect(JSON.stringify({ receipt, snapshot: child.transport.snapshot() })).not.toMatch(
        /synthetic|privateRootPath|groupId|pid|m05-fixture-thread/,
      )
    } finally {
      for (const [event, listener] of Object.entries(emitted)) taskSpawner.off(event, listener)
    }
  }, 15_000)

  it.each([
    ['rpc', 'unexpected_rpc_request'],
    ['malformed', 'invalid_json_utf8'],
    ['crash', undefined],
    ['lost-ack', 'request_timeout'],
  ])(
    'fences real-child %s and separately observes owned cleanup',
    async (mode, reason) => {
      const child = await launch([mode])
      await child.transport.request('initialize', {})
      await child.transport.request('thread/start', {})
      const response = child.transport.request('turn/start', {}, mode === 'lost-ack' ? 50 : 1_000)
      await expect(response).rejects.toBeInstanceOf(Error)
      expect(child.transport.snapshot().status).toBe('fenced')
      if (reason) expect(child.transport.snapshot().reason).toBe(reason)
      expect(child.onNotification).not.toHaveBeenCalled()
      expect(child.onFault).toHaveBeenCalledTimes(1)
      expect(await child.stop()).toMatchObject({ status: 'stopped', groupExitObserved: true, privateRootRemoved: true })
    },
    15_000,
  )

  it('rejects an invalid fixture launch and unconditionally blocks the provider entry', async () => {
    await expect(
      launchOwnedFixtureChild({ fixturePath: 'relative.mjs', onFault() {}, onNotification() {} }),
    ).rejects.toMatchObject({ privateRootRetained: false })
    expect(launchOwnedProviderChild).toThrow(/not authorized or qualified/)
  })
})
