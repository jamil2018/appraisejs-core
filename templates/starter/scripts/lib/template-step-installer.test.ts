import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createContentSha256, type RegistryStepEntry } from './template-step-registry'
import { installTemplateStepPayload, type TemplateStepInstallPayload } from './template-step-installer'

const tempDirs: string[] = []

async function createTempWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-step-install-'))
  tempDirs.push(dir)
  return dir
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

function createRegistryEntry(overrides: Partial<RegistryStepEntry> = {}): RegistryStepEntry {
  return {
    slug: 'click/click-element',
    sourcePath: 'fragments/click/click-element.ts',
    sourceSha256: '',
    signature: 'click {string}',
    name: 'click element',
    description: 'clicks the target element',
    icon: 'MOUSE',
    group: {
      slug: 'click',
      name: 'click',
      description: 'Click helpers',
      type: 'ACTION',
    },
    ...overrides,
  }
}

function createPayload(source: string, overrides: Partial<RegistryStepEntry> = {}): TemplateStepInstallPayload {
  const entry = createRegistryEntry(overrides)
  return {
    version: 1,
    step: {
      ...entry,
      sourceSha256: createContentSha256(source.endsWith('\n') ? source : `${source}\n`),
    },
    source,
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('installTemplateStepPayload', () => {
  it('creates a missing group file and installs the step', async () => {
    const workspace = await createTempWorkspace()
    const source = `/**
 * @name click element
 * @description clicks the target element
 * @icon MOUSE
 */
When('click {string}', async function () {})`

    const result = await installTemplateStepPayload(createPayload(source), {
      projectRoot: workspace,
    })

    expect(result.status).toBe('installed')
    expect(result.createdGroupFile).toBe(true)

    const filePath = path.join(workspace, 'automation/steps/actions/click.step.ts')
    const content = await fs.readFile(filePath, 'utf8')
    expect(content).toContain('@name click')
    expect(content).toContain("When('click {string}'")
    expect(content).toContain("from '../../../packages/cucumber-runtime/src/index.js'")
  })

  it('appends into an existing group file without dropping imports or existing steps', async () => {
    const workspace = await createTempWorkspace()
    await writeFile(
      workspace,
      'automation/steps/actions/click.step.ts',
      `/**
 * @name click
 * @description Click helpers
 * @type ACTION
 */
import { When } from '../../../packages/cucumber-runtime/src/index.js'
import { helper } from './helper'

// Existing note

/**
 * @name existing click
 * @icon MOUSE
 */
When('existing click', async function () {
  helper()
})
`,
    )

    const result = await installTemplateStepPayload(
      createPayload(`/**
 * @name click element
 * @description clicks the target element
 * @icon MOUSE
 */
When('click {string}', async function () {})`),
      { projectRoot: workspace },
    )

    expect(result.status).toBe('installed')
    const content = await fs.readFile(path.join(workspace, 'automation/steps/actions/click.step.ts'), 'utf8')
    expect(content).toContain("import { helper } from './helper'")
    expect(content).toContain('// Existing note')
    expect(content).toContain("When('existing click'")
    expect(content).toContain("When('click {string}'")
    expect(content).toContain('Then')
    expect(content).toContain('resolveLocator')
  })

  it('no-ops when the identical step is already installed', async () => {
    const workspace = await createTempWorkspace()
    const source = `/**
 * @name click element
 * @description clicks the target element
 * @icon MOUSE
 */
When('click {string}', async function () {})`

    await writeFile(
      workspace,
      'automation/steps/actions/click.step.ts',
      `/**
 * @name click
 * @description Click helpers
 * @type ACTION
 */
import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'

${source}
`,
    )

    const result = await installTemplateStepPayload(createPayload(source), {
      projectRoot: workspace,
    })

    expect(result.status).toBe('noop')
    expect(result.reason).toContain('already installed')
  })

  it('fails on a conflicting signature unless overwrite is enabled', async () => {
    const workspace = await createTempWorkspace()
    await writeFile(
      workspace,
      'automation/steps/actions/click.step.ts',
      `/**
 * @name click
 * @description Click helpers
 * @type ACTION
 */
import { When } from '../../../packages/cucumber-runtime/src/index.js'

/**
 * @name click element
 * @icon MOUSE
 */
When('click {string}', async function () {
  await Promise.resolve('old')
})
`,
    )

    const payload = createPayload(`/**
 * @name click element
 * @description clicks the target element
 * @icon MOUSE
 */
When('click {string}', async function () {
  await Promise.resolve('new')
})`)

    await expect(installTemplateStepPayload(payload, { projectRoot: workspace })).rejects.toThrow(
      'Re-run with --overwrite',
    )

    const overwriteResult = await installTemplateStepPayload(payload, {
      projectRoot: workspace,
      overwrite: true,
    })
    expect(overwriteResult.status).toBe('installed')

    const content = await fs.readFile(path.join(workspace, 'automation/steps/actions/click.step.ts'), 'utf8')
    expect(content).toContain("Promise.resolve('new')")
    expect(content).not.toContain("Promise.resolve('old')")
  })

  it('aborts when the same group name exists in the opposite folder', async () => {
    const workspace = await createTempWorkspace()
    await writeFile(
      workspace,
      'automation/steps/validations/click.step.ts',
      `/**
 * @name click
 * @type VALIDATION
 */
import { Then } from '../../../packages/cucumber-runtime/src/index.js'
`,
    )

    await expect(
      installTemplateStepPayload(
        createPayload(`/**
 * @name click element
 * @icon MOUSE
 */
When('click {string}', async function () {})`),
        { projectRoot: workspace },
      ),
    ).rejects.toThrow('same-named step group')
  })
})
