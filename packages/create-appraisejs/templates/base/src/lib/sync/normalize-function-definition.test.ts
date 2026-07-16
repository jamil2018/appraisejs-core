import { describe, expect, it } from 'vitest'

import { normalizeFunctionDefinition } from './normalize-function-definition'

describe('normalizeFunctionDefinition', () => {
  it('normalizes TypeScript and preserves malformed source for diagnostics', async () => {
    await expect(normalizeFunctionDefinition('async()=>{return true}')).resolves.toBe(
      'async () => {\n  return true;\n};',
    )
    await expect(normalizeFunctionDefinition('not { valid')).resolves.toBe('not { valid')
    await expect(normalizeFunctionDefinition(null)).resolves.toBe('')
  })
})
