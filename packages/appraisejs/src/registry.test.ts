import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { downloadStepPayload, resolveManifestUrl } from './registry.js'

describe('resolveManifestUrl', () => {
  it('uses the default GitHub raw registry when no override is provided', () => {
    expect(resolveManifestUrl('feature/registry').toString()).toBe(
      'https://raw.githubusercontent.com/jamil2018/appraisejs-core/feature/registry/packages/appraisejs/registry/template-steps/manifest.json',
    )
  })

  it('accepts either a base registry URL or a full manifest URL override', () => {
    expect(resolveManifestUrl('main', 'https://example.com/custom-registry').toString()).toBe(
      'https://example.com/custom-registry/manifest.json',
    )
    expect(resolveManifestUrl('main', 'https://example.com/custom/manifest.json').toString()).toBe(
      'https://example.com/custom/manifest.json',
    )
  })
})

describe('downloadStepPayload', () => {
  it('downloads step source relative to the manifest URL and verifies the checksum', async () => {
    const source = `/**
 * @name click element
 * @icon MOUSE
 */
When('click {string}', async function () {})
`
    const payload = await downloadStepPayload(
      new URL('https://example.com/registry/template-steps/manifest.json'),
      {
        slug: 'click/click-element',
        sourcePath: 'fragments/click/click-element.ts',
        sourceSha256: createHash('sha256').update(source).digest('hex'),
        signature: 'click {string}',
        name: 'click element',
        description: null,
        icon: 'MOUSE',
        group: {
          slug: 'click',
          name: 'click',
          description: null,
          type: 'ACTION',
        },
      },
      async url => {
        expect(url.toString()).toBe('https://example.com/registry/template-steps/fragments/click/click-element.ts')
        return new Response(source, { status: 200 })
      },
    )

    expect(payload.source).toBe(source)
    expect(payload.step.slug).toBe('click/click-element')
  })
})
