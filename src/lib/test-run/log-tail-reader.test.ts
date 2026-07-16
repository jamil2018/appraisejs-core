import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readLogTail } from './log-tail-reader'

let root: string | undefined

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
  root = undefined
})

async function fixture(content: string) {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-log-tail-'))
  const file = path.join(root, 'run.log')
  await fs.writeFile(file, content)
  return file
}

describe('readLogTail', () => {
  it('returns a bounded, line-aligned UTF-8 tail', async () => {
    const file = await fixture(`first\nsecond\n🙂 third\nfourth\n`)
    const tail = await readLogTail(file, 20)
    expect(Buffer.byteLength(tail.text)).toBeLessThanOrEqual(20)
    expect(tail.text).toBe('🙂 third\nfourth\n')
    expect(tail.text).not.toContain('�')
    expect(tail.truncated).toBe(true)
    expect(tail.partialStart).toBe(false)
  })

  it('handles empty files and large single lines deterministically', async () => {
    await expect(readLogTail(await fixture(''), 16)).resolves.toMatchObject({ text: '', truncated: false })
    const tail = await readLogTail(await fixture('x'.repeat(100)), 16)
    expect(tail.text).toBe('x'.repeat(16))
    expect(tail.partialStart).toBe(true)
  })

  it('reports missing and rotated files through the filesystem error', async () => {
    await expect(readLogTail('/definitely/missing/appraise.log', 16)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
