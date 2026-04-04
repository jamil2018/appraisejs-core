import { describe, expect, it, vi } from 'vitest'
import { addStepBySlug } from './add-step.js'
import { type TemplateStepInstallPayload } from './types.js'

const PAYLOAD: TemplateStepInstallPayload = {
  version: 1,
  step: {
    slug: 'click/click-element',
    sourcePath: 'fragments/click/click-element.ts',
    sourceSha256: 'abc',
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
  source: `/**
 * @name click element
 * @icon MOUSE
 */
When('click {string}', async function () {})
`,
}

describe('addStepBySlug', () => {
  it('validates the target project, fetches the payload, and invokes the local installer', async () => {
    const removeTempPayloadFile = vi.fn().mockResolvedValue(undefined)
    const runLocalInstaller = vi.fn().mockResolvedValue(undefined)

    await addStepBySlug(
      'click/click-element',
      {
        cwd: '/tmp/appraise-project',
        overwrite: true,
        dryRun: false,
        branch: 'main',
        useBundledRegistry: true,
      },
      {
        fetchRegistryManifest: vi.fn().mockResolvedValue({
          manifest: { version: 1, generatedAt: '2026-01-01T00:00:00.000Z', steps: [PAYLOAD.step] },
          manifestUrl: new URL('https://example.com/registry/template-steps/manifest.json'),
        }),
        downloadStepPayload: vi.fn().mockResolvedValue(PAYLOAD),
        resolveStepEntry: vi.fn().mockReturnValue(PAYLOAD.step),
        validateAppraiseProject: vi.fn().mockResolvedValue({
          root: '/tmp/appraise-project',
          packageManager: 'pnpm',
          packageJsonPath: '/tmp/appraise-project/package.json',
        }),
        writePayloadToTempFile: vi.fn().mockResolvedValue('/tmp/payload.json'),
        runLocalInstaller,
        removeTempPayloadFile,
        log: vi.fn(),
      },
    )

    expect(runLocalInstaller).toHaveBeenCalledWith('pnpm', '/tmp/appraise-project', '/tmp/payload.json', true, false)
    expect(removeTempPayloadFile).toHaveBeenCalledWith('/tmp/payload.json')
  })

  it('cleans up the temporary payload file even when the local install fails', async () => {
    const removeTempPayloadFile = vi.fn().mockResolvedValue(undefined)

    await expect(
      addStepBySlug(
        'click/click-element',
        {
          cwd: '/tmp/appraise-project',
        overwrite: false,
        dryRun: true,
        branch: 'main',
        useBundledRegistry: false,
      },
      {
          fetchRegistryManifest: vi.fn().mockResolvedValue({
            manifest: { version: 1, generatedAt: '2026-01-01T00:00:00.000Z', steps: [PAYLOAD.step] },
            manifestUrl: new URL('https://example.com/registry/template-steps/manifest.json'),
          }),
          downloadStepPayload: vi.fn().mockResolvedValue(PAYLOAD),
          resolveStepEntry: vi.fn().mockReturnValue(PAYLOAD.step),
          validateAppraiseProject: vi.fn().mockResolvedValue({
            root: '/tmp/appraise-project',
            packageManager: 'npm',
            packageJsonPath: '/tmp/appraise-project/package.json',
          }),
          writePayloadToTempFile: vi.fn().mockResolvedValue('/tmp/payload.json'),
          runLocalInstaller: vi.fn().mockRejectedValue(new Error('install failed')),
          removeTempPayloadFile,
          log: vi.fn(),
        },
      ),
    ).rejects.toThrow('install failed')

    expect(removeTempPayloadFile).toHaveBeenCalledWith('/tmp/payload.json')
  })
})
