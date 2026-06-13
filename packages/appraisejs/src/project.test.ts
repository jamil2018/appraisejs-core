import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { afterEach, describe, expect, it } from 'vitest'
import { detectPackageManager, validateAppraiseProject } from './project.js'
import { deriveProjectIdentity, ensureLocalProjectIdentity } from './project-identity.js'
import { deriveCoordinatorProjectIdentity } from '../../../src/lib/coordinator-api/project-identity.js'

const tempDirs: string[] = []

async function createTempWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'appraisejs-project-'))
  tempDirs.push(dir)
  return dir
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })))
})

describe('detectPackageManager', () => {
  it('prefers pnpm, yarn, and bun lockfiles over npm fallback', async () => {
    const pnpmWorkspace = await createTempWorkspace()
    await fs.writeFile(path.join(pnpmWorkspace, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(pnpmWorkspace)).toBe('pnpm')

    const yarnWorkspace = await createTempWorkspace()
    await fs.writeFile(path.join(yarnWorkspace, 'yarn.lock'), '')
    expect(detectPackageManager(yarnWorkspace)).toBe('yarn')

    const bunWorkspace = await createTempWorkspace()
    await fs.writeFile(path.join(bunWorkspace, 'bun.lockb'), '')
    expect(detectPackageManager(bunWorkspace)).toBe('bun')
  })
})

describe('validateAppraiseProject', () => {
  it('accepts a scaffolded Appraise project with the local installer prerequisites', async () => {
    const workspace = await createTempWorkspace()
    await writeJson(path.join(workspace, 'package.json'), {
      scripts: {
        'appraisejs:install-step': 'npx tsx scripts/install-template-step.ts',
        'sync-template-step-groups': 'npx tsx scripts/sync-template-step-groups.ts',
        'sync-template-steps': 'npx tsx scripts/sync-template-steps.ts',
      },
    })
    await fs.mkdir(path.join(workspace, 'scripts'), { recursive: true })
    await fs.writeFile(path.join(workspace, 'scripts', 'install-template-step.ts'), '')
    await fs.mkdir(path.join(workspace, 'node_modules'), { recursive: true })

    const project = await validateAppraiseProject(workspace)
    expect(project.root).toBe(workspace)
    expect(project.packageManager).toBe('npm')
  })

  it('rejects projects missing the local installer wiring', async () => {
    const workspace = await createTempWorkspace()
    await writeJson(path.join(workspace, 'package.json'), {
      scripts: {
        'sync-template-step-groups': 'npx tsx scripts/sync-template-step-groups.ts',
        'sync-template-steps': 'npx tsx scripts/sync-template-steps.ts',
      },
    })
    await fs.mkdir(path.join(workspace, 'node_modules'), { recursive: true })

    await expect(validateAppraiseProject(workspace)).rejects.toThrow('appraisejs:install-step')
  })
})

describe('coordinator project identity', () => {
  it('supports a generic directory without package.json and creates stable credentials', async () => {
    const workspace = await createTempWorkspace()

    const first = await ensureLocalProjectIdentity(workspace)
    const second = await ensureLocalProjectIdentity(workspace)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.identity).toEqual(first.identity)
    expect(first.details.packageName).toBeUndefined()
  })

  it('includes an optional package name and canonical real path in a stable fingerprint', async () => {
    const workspace = await createTempWorkspace()
    await writeJson(path.join(workspace, 'package.json'), { name: 'identity-test' })
    const link = `${workspace}-link`
    tempDirs.push(link)
    await fs.symlink(workspace, link)

    const direct = await deriveProjectIdentity(workspace)
    const linked = await deriveProjectIdentity(link)

    expect(linked).toEqual(direct)
    expect(direct.packageName).toBe('identity-test')
  })

  it('reports malformed package metadata precisely', async () => {
    const workspace = await createTempWorkspace()
    await fs.writeFile(path.join(workspace, 'package.json'), '{')

    await expect(deriveProjectIdentity(workspace)).rejects.toMatchObject({
      code: 'package-json-invalid',
      path: path.join(await fs.realpath(workspace), 'package.json'),
    })
  })

  it.each([undefined, 'shared-identity'])('matches the application fingerprint for package name %s', async name => {
    const workspace = await createTempWorkspace()
    if (name) await writeJson(path.join(workspace, 'package.json'), { name })

    await expect(deriveProjectIdentity(workspace)).resolves.toEqual(await deriveCoordinatorProjectIdentity(workspace))
  })
})
