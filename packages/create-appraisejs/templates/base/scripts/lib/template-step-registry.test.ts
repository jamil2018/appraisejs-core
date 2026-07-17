import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from '@babel/parser'
import { buildStepRegistry, createContentSha256, slugifyRegistryName } from './template-step-registry'

const tempDirs: string[] = []

async function createTempWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-registry-'))
  tempDirs.push(dir)
  return dir
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = path.join(root, relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, content)
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('slugifyRegistryName', () => {
  it('creates hyphenated slugs for CLI lookup', () => {
    expect(slugifyRegistryName('Text Assertion')).toBe('text-assertion')
    expect(slugifyRegistryName('Assert element contains text')).toBe('assert-element-contains-text')
  })
})

describe('buildStepRegistry', () => {
  it('builds manifest entries and source fragments from canonical step files', async () => {
    const workspace = await createTempWorkspace()

    await writeFile(
      workspace,
      'automation/steps/actions/click.step.ts',
      `/**
 * @name click
 * @description Click helpers
 * @type ACTION
 */
import { When, CustomWorld, SelectorName, resolveLocator } from '../../../packages/cucumber-runtime/src/index.js'

/**
 * @name click element
 * @description clicks the target element
 * @icon MOUSE
 */
When('click {string}', async function (this: CustomWorld, elementName: SelectorName) {
  const selector = await resolveLocator(this.page, elementName)
  await this.page.locator(selector!).click()
})
`,
    )

    const registry = await buildStepRegistry(workspace)
    expect(registry.manifest.version).toBe(1)
    expect(registry.manifest.steps).toHaveLength(1)

    const entry = registry.manifest.steps[0]
    expect(entry.slug).toBe('click/click-element')
    expect(entry.sourcePath).toBe('fragments/click/click-element.ts')
    expect(entry.signature).toBe('click {string}')
    expect(entry.group).toEqual({
      slug: 'click',
      name: 'click',
      description: 'Click helpers',
      type: 'ACTION',
    })

    expect(registry.fragments).toEqual([
      {
        path: 'fragments/click/click-element.ts',
        content: expect.stringContaining('@name click element'),
      },
    ])
    expect(registry.fragments[0]?.content).toContain("When('click {string}'")
    expect(entry.sourceSha256).toBe(createContentSha256(registry.fragments[0]!.content))
  })

  it('fails when duplicate signatures would produce an ambiguous registry', async () => {
    const workspace = await createTempWorkspace()

    await writeFile(
      workspace,
      'automation/steps/actions/click.step.ts',
      `/**
 * @name click
 * @type ACTION
 */
/**
 * @name click element
 * @icon MOUSE
 */
When('click {string}', async function () {})
`,
    )

    await writeFile(
      workspace,
      'automation/steps/actions/hover.step.ts',
      `/**
 * @name hover
 * @type ACTION
 */
/**
 * @name hover element
 * @icon MOUSE
 */
When('click {string}', async function () {})
`,
    )

    await expect(buildStepRegistry(workspace)).rejects.toThrow('Duplicate step signature')
  })

  it('publishes the complete canonical catalog with searchable metadata and installable fragments', async () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..')
    const registry = await buildStepRegistry(repoRoot)

    expect(registry.manifest.steps.length).toBeGreaterThan(100)
    expect(registry.fragments).toHaveLength(registry.manifest.steps.length)
    expect(new Set(registry.manifest.steps.map(step => step.signature)).size).toBe(registry.manifest.steps.length)
    expect(registry.manifest.steps.every(step => step.description && step.group.description)).toBe(true)

    const searchTerms = [
      'upload',
      'keyboard-shortcut',
      'popup',
      'dialog',
      'download',
      'storage',
      'response',
      'attribute',
    ]
    for (const term of searchTerms) {
      expect(
        registry.manifest.steps.some(step => `${step.slug} ${step.description}`.toLowerCase().includes(term)),
        `expected catalog metadata for ${term}`,
      ).toBe(true)
    }

    for (const fragment of registry.fragments) {
      expect(() =>
        parse(fragment.content, { sourceType: 'module', plugins: ['typescript', 'decorators-legacy'] }),
      ).not.toThrow()
    }
  })
})
