import { Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

import {
  claudeCodeJourneyDeadlineMs,
  claudeCodeJourneyIdleTimeoutMs,
  armProviderUpstreamIdleTimeout,
} from './claude-code-egress'

describe('Claude Code Journey egress', () => {
  it('keeps its idle limit beyond the bounded Journey child deadline', () => {
    expect(claudeCodeJourneyDeadlineMs).toBe(180_000)
    expect(claudeCodeJourneyIdleTimeoutMs).toBeGreaterThan(claudeCodeJourneyDeadlineMs)
  })

  it('marks an upstream timeout and destroys the owned socket without opening a network connection', () => {
    const upstream = new Socket()
    const onIdle = vi.fn()
    armProviderUpstreamIdleTimeout(upstream, 40, onIdle)
    upstream.emit('timeout')
    expect(onIdle).toHaveBeenCalledOnce()
    expect(upstream.destroyed).toBe(true)
  })
})
