import { describe, expect, it } from 'vitest'

import { buildOperationArchitectureCertification } from '../certify-operation-architecture'

describe('operation architecture certification', () => {
  it('content-addresses a fully migrated operation architecture', async () => {
    const first = await buildOperationArchitectureCertification()
    const second = await buildOperationArchitectureCertification()

    expect(first).toEqual(second)
    expect(first.gates).toMatchObject({
      canonicalSourceHashMatches: true,
      allBuiltInsAccountedFor: true,
      exactDefinitionHashes: true,
      uniqueHumanSignatures: true,
      everyDefinitionHasTrustedHandler: true,
    })
    expect(first.status).toBe('certified')
    expect(first.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })
})
