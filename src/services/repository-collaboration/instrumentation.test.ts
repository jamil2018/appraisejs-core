import { afterEach, describe, expect, it, vi } from 'vitest'

const scheduler = vi.hoisted(() => ({ start: vi.fn() }))

vi.mock('@/services/repository-collaboration/scheduler-runtime', () => ({
  startCollaborationScheduler: scheduler.start,
}))

import { register } from '@/instrumentation'

afterEach(() => {
  vi.unstubAllEnvs()
  scheduler.start.mockReset()
})

describe('Next instrumentation', () => {
  it('does not import or start the Node scheduler outside the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')

    await register()

    expect(scheduler.start).not.toHaveBeenCalled()
  })

  it('starts the process-local scheduler only in the Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')

    await register()

    expect(scheduler.start).toHaveBeenCalledTimes(1)
  })
})
