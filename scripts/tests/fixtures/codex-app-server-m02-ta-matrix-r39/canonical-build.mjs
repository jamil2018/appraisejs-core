/** Pure, reversible relocation of the accepted R17 private canonical bundle. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HISTORICAL_CANONICAL_ROOT, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const HISTORICAL_BUNDLE = join(REPO, '.appraisejs/m02-ta-matrix-build-r17/canonical-bridge.mjs')
export const HISTORICAL_SHA = '8d03c8156ce171c63135c57b716ee5b3e6b679cf3dc18005d87f0fa45eed1893'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

export async function buildR39CanonicalBytes() {
  const before = await fs.lstat(HISTORICAL_BUNDLE)
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== process.getuid() || before.nlink !== 1)
    throw new Error('R17 canonical identity drift')
  const handle = await fs.open(HISTORICAL_BUNDLE, constants.O_RDONLY | constants.O_NOFOLLOW)
  let bytes
  try {
    if (!same(before, await handle.stat())) throw new Error('R17 canonical changed before read')
    bytes = await handle.readFile()
    if (!same(before, await handle.stat()) || !same(before, await fs.lstat(HISTORICAL_BUNDLE)))
      throw new Error('R17 canonical changed during read')
  } finally {
    await handle.close()
  }
  if (sha(bytes) !== HISTORICAL_SHA) throw new Error('R17 canonical hash drift')
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const count = source.split(HISTORICAL_CANONICAL_ROOT).length - 1
  if (count !== 1 || source.includes(ROOT)) throw new Error('canonical relocation is not one-way unique')
  const moved = source.replace(HISTORICAL_CANONICAL_ROOT, ROOT)
  if (moved.replace(ROOT, HISTORICAL_CANONICAL_ROOT) !== source) throw new Error('canonical relocation not reversible')
  const staged = Buffer.from(moved, 'utf8')
  return Object.freeze({
    bytes: staged,
    originalSha256: HISTORICAL_SHA,
    sha256: sha(staged),
    relocation: Object.freeze({ from: HISTORICAL_CANONICAL_ROOT, to: ROOT, count: 1 }),
  })
}
