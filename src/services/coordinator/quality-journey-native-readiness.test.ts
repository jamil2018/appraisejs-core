import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configureInertSupervisor,
  inertSupervisorFixture,
  provider,
} from './quality-journey-process-supervisor.test-support'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
  type JourneyNativeReadiness,
} from './quality-journey-process-supervisor'

beforeEach(configureInertSupervisor)
afterEach(() => vi.useRealTimers())
function fixture(overrides: Partial<JourneyNativeReadiness> = {}, fenceDelivery = vi.fn()) {
  const nativeReadiness = {
    cwd: '/private/synthetic',
    validateConfiguration: vi.fn(() => true),
    validateThread: vi.fn(() => true),
    validateRequiredMcp: vi.fn(() => true),
    mcpStatusParams: { serverName: 'worker', detail: 'full', limit: 1 },
    ...overrides,
  }
  const result = inertSupervisorFixture(
    (input, adapter, client) =>
      createQualityJourneyProcessSupervisor(
        input,
        {
          ...adapter,
          nativeReadiness,
          fenceDelivery,
        },
        client,
      ),
    trustedJourneyProcessAdapter,
  )
  return { ...result, nativeReadiness, fenceDelivery }
}
describe('native readiness uses the original canonical write boundary', () => {
  it('orders all nonconsuming gates before the sole consuming turn and captures hooks', async () => {
    const f = fixture()
    f.nativeReadiness.cwd = '/mutated'
    f.nativeReadiness.validateConfiguration = () => false
    await f.supervisor.start()
    expect(f.child.transport.request.mock.calls.map(([method]) => method)).toEqual([
      'initialize',
      'config/read',
      'thread/start',
      'mcpServerStatus/list',
      'turn/start',
    ])
    expect(f.child.transport.request).toHaveBeenNthCalledWith(1, 'initialize', {
      clientInfo: { name: 'appraise-journey-supervisor', version: '1' },
      capabilities: { experimentalApi: false },
    })
    expect(f.child.transport.request).toHaveBeenNthCalledWith(2, 'config/read', {
      cwd: '/private/synthetic',
      includeLayers: false,
    })
    expect(f.child.transport.request).toHaveBeenNthCalledWith(3, 'thread/start', {
      cwd: '/private/synthetic',
      ephemeral: true,
      model: 'gpt-6.1-sol',
      approvalPolicy: 'never',
      sandbox: 'read-only',
    })
    expect(f.child.transport.request).toHaveBeenNthCalledWith(4, 'mcpServerStatus/list', {
      threadId: 'thread',
      serverName: 'worker',
      detail: 'full',
      limit: 1,
    })
    expect(provider.write.mock.calls.map(([binding]) => binding.consume)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ])
    await f.supervisor.cancel()
    expect(f.fenceDelivery).toHaveBeenCalledTimes(1)
  })
  it('preserves the fixture default experimental API initialization', async () => {
    const f = inertSupervisorFixture(createQualityJourneyProcessSupervisor, trustedJourneyProcessAdapter)
    await f.supervisor.start()
    expect(f.child.transport.request).toHaveBeenNthCalledWith(1, 'initialize', {
      clientInfo: { name: 'appraise-journey-supervisor', version: '1' },
      capabilities: { experimentalApi: true },
    })
    await f.supervisor.cancel()
  })
  it.each([
    ['validateConfiguration', 2],
    ['validateThread', 3],
    ['validateRequiredMcp', 4],
  ] as const)('refuses %s before READY and turn consumption', async (gate, count) => {
    const f = fixture({ [gate]: () => false })
    await expect(f.supervisor.start()).rejects.toThrow(/refused/)
    expect(f.child.transport.request).toHaveBeenCalledTimes(count)
    expect(provider.write.mock.calls.every(([binding]) => !binding.consume)).toBe(true)
    expect(f.create.mock.calls.some(([arg]) => arg.data.kind === 'TRANSPORT_READY')).toBe(false)
    expect(f.child.stop).toHaveBeenCalledTimes(1)
  })
  it('refuses an existing thread instead of resuming it', async () => {
    provider.arm.mockResolvedValueOnce({ ...(await provider.arm()), run: { id: 'run', threadId: 'existing' } })
    const f = fixture()
    await expect(f.supervisor.start()).rejects.toThrow(/resume refused/)
    expect(f.child.transport.request.mock.calls.map(([method]) => method)).toEqual(['initialize', 'config/read'])
  })
  it('fences synchronously before cleanup and retains a throwing delivery fence as uncertainty', async () => {
    const f = fixture(
      {},
      vi.fn(() => {
        throw new Error('closed but uncertain')
      }),
    )
    await f.supervisor.start()
    const stopped = f.supervisor.cancel()
    expect(f.fenceDelivery).toHaveBeenCalledTimes(1)
    expect(f.supervisor.snapshot()).toMatchObject({ fenced: true, deliveryFenceFailed: true })
    expect(await stopped).toMatchObject({ state: 'uncertain', providerTerminationProven: false, slotReleased: false })
    await f.supervisor.cancel()
    expect(f.fenceDelivery).toHaveBeenCalledTimes(1)
  })
})
