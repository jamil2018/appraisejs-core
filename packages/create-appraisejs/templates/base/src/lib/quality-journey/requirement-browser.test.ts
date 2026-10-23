import { webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hashQualityJourneyRequirementForBrowser } from './requirement-browser'
import { hashQualityJourneyRequirement as serverHash } from './requirement-contracts'

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser requirement hashing', () => {
  it('compiles the actual browser helper closure without Node built-ins or resolver substitutes', async () => {
    const result = await build({
      entryPoints: [fileURLToPath(new URL('./requirement-browser.ts', import.meta.url))],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      metafile: true,
      logLevel: 'silent',
    })
    expect(result.errors).toEqual([])
    expect(Object.keys(result.metafile!.inputs)).not.toContain('src/lib/quality-journey/requirement-contracts.ts')
    expect(Object.keys(result.metafile!.inputs)).not.toContain('src/lib/quality-journey/index.ts')
  })

  it.each([
    { objective: 'Verify checkout.' },
    { objective: '  Café 🧪 — বাংলা  ' },
    {
      objective: '  Validate the café checkout 🧪  ',
      schemaVersion: 'appraise.quality-journey-requirement/v1',
      context: '  Unicode stays intact.  ',
      actors: [' Zoë ', ' Åsa ', 'বাংলা'],
      includedScope: [' Payment ', ' Cart '],
      environmentIds: ['environment-z', 'environment-a'],
      testDimensions: ['VISUAL', 'FUNCTIONAL'],
      constraints: [' No live charges '],
    },
  ])('matches the server hash of parsed canonical UTF-8 bytes for %j', async requirement => {
    expect(await hashQualityJourneyRequirementForBrowser(requirement)).toBe(serverHash(requirement))
  })

  it('preserves trim/order normalization and the literal Unicode hash vector', async () => {
    expect(await hashQualityJourneyRequirementForBrowser({ objective: '  Café 🧪 — বাংলা  ' })).toBe(
      'sha256:360c84fc8414be46833ac9dbb22d63ab94178404b802650adc714643c95936f5',
    )
    expect(await hashQualityJourneyRequirementForBrowser({ objective: 'Checkout', actors: [' Zoë ', 'Åsa'] })).toBe(
      await hashQualityJourneyRequirementForBrowser({ actors: ['Åsa', 'Zoë'], objective: 'Checkout' }),
    )
    expect(await hashQualityJourneyRequirementForBrowser({ objective: 'Café' })).not.toBe(
      await hashQualityJourneyRequirementForBrowser({ objective: 'Cafe\u0301' }),
    )
  })

  it('rejects schema and digest failures instead of supplying a fallback hash', async () => {
    await expect(hashQualityJourneyRequirementForBrowser({ objective: '' })).rejects.toThrow()
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockRejectedValue(new Error('Digest unavailable')) } })
    await expect(hashQualityJourneyRequirementForBrowser({ objective: 'Checkout' })).rejects.toThrow(
      'Digest unavailable',
    )
  })
})
