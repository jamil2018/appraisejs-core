/** Offline-only compiler for the single-root T1 replacement fixture. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createRequire, isBuiltin } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { T1_ROOT } from './journal.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const FIXTURE = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta/canonical-fixture.ts')
const BRIDGE = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta/canonical-bridge.ts')
export const R4_CANONICAL_BUILD = join(REPO, '.appraisejs/m02-ta-r4-canonical-build-01')
export const R4_CANONICAL_BUNDLE = join(R4_CANONICAL_BUILD, 'canonical-bridge.mjs')
const FIXTURE_SHA = '458097d49faa093a72c43224b01c89f1035c3c36bc14616b77d4a16f8630fc1a'
const BRIDGE_SHA = 'e5748bd49ccbb45536c66875c9f3b662a961281b30f01935262f3ab310150782'
const APPROVED_BLOCK = `const approvedPhaseRoots = [
  '/private/tmp/appraise-m02-ta-descriptors-p1',
  '/private/tmp/appraise-m02-ta-matrix-p1',
  '/private/tmp/appraise-m02-ta-workspace-p1',
]`
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export function transformT1Fixture(source, root) {
  if (typeof source !== 'string' || !/^\/[A-Za-z0-9_./-]+$/.test(root) || root.includes('/../'))
    throw new Error('canonical variant root contract')
  if (sha(source) !== FIXTURE_SHA || source.split(APPROVED_BLOCK).length !== 2)
    throw new Error('accepted canonical fixture source changed')
  return source.replace(APPROVED_BLOCK, `const approvedPhaseRoots = [\n  '${root}',\n]`)
}

export async function buildT1CanonicalVariant({ root = T1_ROOT, outputDirectory = R4_CANONICAL_BUILD } = {}) {
  if (root !== T1_ROOT && outputDirectory === R4_CANONICAL_BUILD)
    throw new Error('production canonical variant root mismatch')
  if (sha(await fsp.readFile(BRIDGE)) !== BRIDGE_SHA) throw new Error('accepted canonical bridge source changed')
  const fixtureSource = await fsp.readFile(FIXTURE, 'utf8')
  const transformed = transformT1Fixture(fixtureSource, root)
  await fsp.mkdir(outputDirectory, { mode: 0o700 })
  const stat = await fsp.lstat(outputDirectory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700)
    throw new Error('canonical variant build directory identity')
  await build({
    entryPoints: [BRIDGE],
    outdir: outputDirectory,
    outExtension: { '.js': '.mjs' },
    plugins: [
      {
        name: 'exact-fixture-root-variant',
        setup(builder) {
          builder.onLoad({ filter: /canonical-fixture\.ts$/ }, args => {
            if (args.path !== FIXTURE) throw new Error('unexpected canonical fixture load')
            return { contents: transformed, loader: 'ts', resolveDir: dirname(FIXTURE) }
          })
          builder.onResolve({ filter: /^[^./]/ }, args => {
            if (
              !args.importer.startsWith(join(REPO, 'packages/appraisejs') + '/') ||
              isBuiltin(args.path) ||
              args.path.startsWith('node:')
            )
              return
            return { path: createRequire(args.importer).resolve(args.path), external: false }
          })
        },
      },
    ],
    banner: {
      js: "import { createRequire as m02CreateRequire } from 'node:module'; const require = m02CreateRequire(import.meta.url);",
    },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node26',
    tsconfig: join(REPO, 'tsconfig.json'),
    logLevel: 'silent',
  })
  const bundlePath = join(outputDirectory, 'canonical-bridge.mjs')
  const bundleState = await fsp.lstat(bundlePath)
  if (!bundleState.isFile() || bundleState.isSymbolicLink()) throw new Error('canonical variant output identity')
  await fsp.chmod(bundlePath, 0o600)
  const bundle = await fsp.readFile(bundlePath)
  const handle = await fsp.open(bundlePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
  const manifest = {
    schema: 'appraise.m02-ta-r4-canonical-variant/v1',
    sourceFixtureSha256: FIXTURE_SHA,
    sourceBridgeSha256: BRIDGE_SHA,
    root,
    bundlePath,
    bundleSha256: sha(bundle),
    transformClass: 'ONE_EXACT_APPROVED_ROOT_BLOCK_TO_ONE_T1_ROOT',
    runtimeLaunched: false,
  }
  await fsp.writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  for (const filename of ['manifest.json', '.']) {
    const handle = await fsp.open(join(outputDirectory, filename), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }
  return Object.freeze(manifest)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== '--build-offline') {
    process.stderr.write('Exact --build-offline invocation required.\n')
    process.exitCode = 1
  } else {
    buildT1CanonicalVariant().then(
      result => process.stdout.write(`${JSON.stringify(result)}\n`),
      () => {
        process.stderr.write('Offline canonical variant build blocked.\n')
        process.exitCode = 1
      },
    )
  }
}
