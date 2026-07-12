import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { hashRepositoryExportBytes, type RepositoryExportManifest } from './contracts'
import { publishRepositoryExport } from './storage'

const roots: string[] = []
const bytes = (value: string) => Buffer.from(value)

function manifest(projectId: string, validationHash: string, content: Buffer): RepositoryExportManifest {
  return {
    schemaVersion: '1',
    projectId,
    validationHash,
    publishOperationId: `astpub_${'c'.repeat(64)}`,
    files: [{ path: 'features/example.feature', hash: hashRepositoryExportBytes(content), size: content.length }],
  }
}

afterEach(async () => Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))))

describe('repository export storage', () => {
  it('publishes a complete revision and replaces an unchanged prior revision', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-export-'))
    roots.push(root)
    const first = bytes('Feature: first\n')
    const second = bytes('Feature: second\n')
    await expect(
      publishRepositoryExport({
        projectRoot: root,
        destinationPath: 'automation/appraise',
        manifest: manifest('project-one', `sha256:${'a'.repeat(64)}`, first),
        files: [{ path: 'features/example.feature', bytes: first }],
      }),
    ).resolves.toMatchObject({ status: 'succeeded' })
    await expect(
      publishRepositoryExport({
        projectRoot: root,
        destinationPath: 'automation/appraise',
        manifest: manifest('project-one', `sha256:${'b'.repeat(64)}`, second),
        files: [{ path: 'features/example.feature', bytes: second }],
      }),
    ).resolves.toMatchObject({ status: 'succeeded' })
    await expect(fs.readFile(path.join(root, 'automation/appraise/features/example.feature'), 'utf8')).resolves.toBe(
      'Feature: second\n',
    )
  })

  it('reports external modifications without overwriting them', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-export-'))
    roots.push(root)
    const first = bytes('Feature: first\n')
    await publishRepositoryExport({
      projectRoot: root,
      destinationPath: 'automation/appraise',
      manifest: manifest('project-one', `sha256:${'a'.repeat(64)}`, first),
      files: [{ path: 'features/example.feature', bytes: first }],
    })
    const file = path.join(root, 'automation/appraise/features/example.feature')
    await fs.writeFile(file, 'external change\n')
    const second = bytes('Feature: second\n')
    await expect(
      publishRepositoryExport({
        projectRoot: root,
        destinationPath: 'automation/appraise',
        manifest: manifest('project-one', `sha256:${'b'.repeat(64)}`, second),
        files: [{ path: 'features/example.feature', bytes: second }],
      }),
    ).resolves.toEqual({ status: 'conflict', conflicts: ['features/example.feature'] })
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('external change\n')
  })

  it('rejects cross-project destination reuse and path traversal', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-export-'))
    roots.push(root)
    const content = bytes('Feature: first\n')
    await publishRepositoryExport({
      projectRoot: root,
      destinationPath: 'automation/appraise',
      manifest: manifest('project-one', `sha256:${'a'.repeat(64)}`, content),
      files: [{ path: 'features/example.feature', bytes: content }],
    })
    await expect(
      publishRepositoryExport({
        projectRoot: root,
        destinationPath: 'automation/appraise',
        manifest: manifest('project-two', `sha256:${'b'.repeat(64)}`, content),
        files: [{ path: 'features/example.feature', bytes: content }],
      }),
    ).rejects.toThrow('another target project')
    await expect(
      publishRepositoryExport({
        projectRoot: root,
        destinationPath: '../escape',
        manifest: manifest('project-one', `sha256:${'a'.repeat(64)}`, content),
        files: [{ path: 'features/example.feature', bytes: content }],
      }),
    ).rejects.toThrow('contained portable relative path')
  })
})
