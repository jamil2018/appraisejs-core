import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { findProjectRoot } from './project-root'

describe('findProjectRoot', () => {
  it('walks upward to the real package root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-project-root-'))
    const nested = path.join(root, 'src', 'nested')
    await fs.mkdir(nested, { recursive: true })
    await fs.writeFile(path.join(root, 'package.json'), '{}')

    await expect(findProjectRoot(nested)).resolves.toBe(root)
    await fs.rm(root, { recursive: true, force: true })
  })
})
