import { describe, expect, it } from 'vitest'
import { runSourceCustodyCase } from '../../../../scripts/test-harness/m06/source-custody/source-custody-controller.mjs'

// Each case uses one standalone OS controller; the Vitest worker owns only its finite transport.
// Inner admission/build/owner custody lives in that guarded controller; UNKNOWN never grants retry.
describe.sequential('original source lifecycle and retained actual failures', () => {
  for (const selected of [
    'source-happy',
    'foreign-client',
    'reserve-rejection',
    'flush-rejection',
    'source-finalizer-throw',
    'source-finalizer-async-rejection',
    'source-finalizer-helper-throw',
    'late-observer',
    'allocation-overflow',
  ])
    it(
      selected,
      async () => {
        const result = await runSourceCustodyCase(selected)
        expect(['KNOWN_OWNER_EXIT0', 'EXPECTED_RETAINED_SUPERVISOR_EXIT']).toContain(result.status)
        expect(result.canonicalInputDigest).toMatch(/^[a-f0-9]{64}$/)
      },
      180_000,
    )
})
