/** Reversible single-root relocation of the accepted R10 canonical bundle. No esbuild or source TS. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRIOR_ROOT, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const HISTORICAL_BUNDLE = join(REPO, '.appraisejs/m02-ta-matrix-build-r10/canonical-bridge.mjs')
export const HISTORICAL_SHA = 'e2c7d99a882465437dd3ea878c85fafc8eaa47ca13578214ad3a2237c3ad5e67'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export async function buildMatrixCanonicalBytes({ readFile = fs.readFile } = {}) {
  const old = await readFile(HISTORICAL_BUNDLE)
  if (!Buffer.isBuffer(old) || sha(old) !== HISTORICAL_SHA) throw new Error('historical canonical bytes drift')
  const source = old.toString('utf8')
  if (source.split(PRIOR_ROOT).length !== 2 || source.includes(ROOT))
    throw new Error('canonical root relocation not unique')
  const bytes = Buffer.from(source.replace(PRIOR_ROOT, ROOT))
  if (sha(Buffer.from(bytes.toString('utf8').replace(ROOT, PRIOR_ROOT))) !== HISTORICAL_SHA)
    throw new Error('canonical root relocation not reversible')
  return Object.freeze({
    bytes,
    sha256: sha(bytes),
    originalSha256: HISTORICAL_SHA,
    relocation: Object.freeze({ from: PRIOR_ROOT, to: ROOT, count: 1 }),
    runtimeQualified: false,
  })
}
