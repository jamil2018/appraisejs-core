import { describe, expect, it } from 'vitest'

import type { RuntimeCapsuleManifest } from './contracts'
import { validateOperationClosure } from './preflight-validators'

describe('sealed Step Definition closure preflight', () => {
  it('rejects an absent Step Definition closure', () => {
    expect(() => validateOperationClosure({ stepDefinitions: [] } as unknown as RuntimeCapsuleManifest)).toThrow(
      'Step Definition closure is missing',
    )
  })
})
