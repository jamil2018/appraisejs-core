import { describe, expect, it } from 'vitest'
import { qualifyC233GracefulOwnerRestart } from '@/test/c233-restart-harness'

describe('C2.3.3 synthetic graceful owner restart qualification', () => {
  it('closes the real Chromium owner before a fresh process rejects the old scope', async () => {
    await expect(qualifyC233GracefulOwnerRestart()).resolves.toEqual({
      qualification: 'SYNTHETIC_GRACEFUL_OWNER_RESTART_V1',
      ownerExit: 'EXITED_BEFORE_FRESH_PROCESS',
      browserProcess: 'CLOSED',
      scopeInvalidation: 'NOT_FOUND_AFTER_GRACEFUL_OWNER_RESTART',
    })
  }, 60_000)
})
