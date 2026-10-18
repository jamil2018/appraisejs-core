/** Offline esbuild of the disposable canonical T2 bridge; no listener or database. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const PACKAGE_LOOKUP = 'require3("../../package.json")'
const STAGED_PACKAGE_LOOKUP = 'require3("./appraise-package.json")'

export async function buildMatrixCanonicalBundle({
  outputDirectory = path.join(REPO, '.appraisejs/m02-ta-matrix-build-r10'),
} = {}) {
  if (!path.isAbsolute(outputDirectory)) throw new Error('absolute build directory required')
  const target = path.join(outputDirectory, 'canonical-bridge.mjs')
  const generated = await buildMatrixCanonicalBytes({ outfile: target })
  await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  await fs.writeFile(target, generated.bytes, { flag: 'wx', mode: 0o600 })
  return Object.freeze({
    path: target,
    sha256: generated.sha256,
    bytes: generated.bytes.length,
    inputs: generated.inputs,
    outputDirectory,
    runtimeQualified: false,
  })
}

export async function buildMatrixCanonicalBytes({
  outfile = path.join(REPO, '.appraisejs/m02-ta-matrix-build-r10/canonical-bridge.mjs'),
} = {}) {
  if (!path.isAbsolute(outfile)) throw new Error('absolute canonical output path required')
  const result = await build({
    entryPoints: [path.join(HERE, 'canonical-entry.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    packages: 'external',
    sourcemap: false,
    metafile: true,
    write: false,
    logLevel: 'silent',
    banner: {
      js: "import { createRequire as m02CreateRequire } from 'node:module'; const require = m02CreateRequire(import.meta.url);",
    },
  })
  if (result.outputFiles.length !== 1) throw new Error('unexpected canonical bundle output')
  const original = Buffer.from(result.outputFiles[0].contents)
  const source = original.toString('utf8')
  if (source.split(PACKAGE_LOOKUP).length !== 2 || source.includes(STAGED_PACKAGE_LOOKUP))
    throw new Error('canonical package lookup source delta changed')
  const bytes = Buffer.from(source.replace(PACKAGE_LOOKUP, STAGED_PACKAGE_LOOKUP))
  const reversed = bytes.toString('utf8').replace(STAGED_PACKAGE_LOOKUP, PACKAGE_LOOKUP)
  if (sha(Buffer.from(reversed)) !== sha(original)) throw new Error('canonical relocation delta not reversible')
  return Object.freeze({
    bytes,
    sha256: sha(bytes),
    originalSha256: sha(original),
    relocation: Object.freeze({ from: PACKAGE_LOOKUP, to: STAGED_PACKAGE_LOOKUP, count: 1 }),
    inputs: Object.freeze(Object.keys(result.metafile.inputs).sort()),
    runtimeQualified: false,
  })
}
