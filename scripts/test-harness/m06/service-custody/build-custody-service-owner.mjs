// Static bundling only. Does not execute repository modules, connect clients or open databases.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { legacyResolution } from './custody-legacy-resolution.mjs'
import { fileURLToPath } from 'node:url'
import { preserveServiceOwnedChildOrigin, assertServiceOwnedChildEmittedOrigin } from './custody-owned-child-origin.mjs'
const here = path.dirname(fileURLToPath(import.meta.url))
const root = realpathSync(path.resolve(here, '../../../..'))
const [outputArgument, generatedArgument] = process.argv.slice(2)
const require = createRequire(path.join(root, 'package.json'))
const { build } = require('esbuild')
const output = path.resolve(outputArgument)
if (!output.startsWith(path.join(root, '.appraisejs') + path.sep))
  throw new Error('Owner bundle must stay in owned .appraisejs artifact space')
const generated = realpathSync(generatedArgument ?? require.resolve('@prisma/client'))
const commonRoot = path.dirname(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
)
const overlay = path.join(commonRoot, '.appraisejs/m06-work/evidence/custody-service16/generated-client/index.js')
const physicalC = path.join(root, '.tmp/m06-source8-template-dependencies1/env-root/a/b/c/d/e/client/index.js')
if (
  !generated.startsWith(path.join(commonRoot, 'node_modules') + path.sep) &&
  generated !== overlay &&
  generated !== physicalC
)
  throw new Error('Generated client outside declared canonical or exact frozen overlay artifact space')
mkdirSync(output, { recursive: true })
const bundle = path.join(output, 'owner-bundle.mjs')
const legacy = legacyResolution(root)
const ownedChildSource = realpathSync(path.join(root, 'src/lib/quality-journey/codex-app-server/owned-child.ts'))
const origin = preserveServiceOwnedChildOrigin(ownedChildSource, readFileSync(ownedChildSource, 'utf8'))
if (origin.receipt.supervisor !== path.join(root, 'scripts/owned-process-supervisor.mjs'))
  throw new Error('Original supervisor resource escaped exact worktree')
const originInvocations = []
function resolveCanonicalAlias(specifier) {
  if (specifier === '@/config/db-config') return { path: path.join(here, 'custody-owner-ambient-db.ts') }
  if (specifier.startsWith('@/')) {
    const base = path.join(root, 'src', specifier.slice(2))
    return { path: existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts') }
  }
}
const buildEntry = (entry, outputFile, bundlePackages = false) =>
  build({
    absWorkingDir: root,
    entryPoints: [path.join(here, entry)],
    outfile: outputFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    ...(bundlePackages ? {} : { packages: 'external' }),
    loader: { '.fixture': 'ts' },
    metafile: true,
    plugins: [
      {
        name: 'exact-legacy-current-generated-resolution',
        setup(api) {
          api.onLoad({ filter: /owned-child\.ts$/ }, args => {
            if (args.path !== ownedChildSource) return undefined
            if (realpathSync(args.path) !== ownedChildSource || readFileSync(args.path, 'utf8') !== origin.source)
              throw new Error('Original owned-child source changed during static compilation')
            originInvocations.push({ entry, filename: args.path })
            return { contents: origin.transformed, loader: 'ts', resolveDir: path.dirname(ownedChildSource) }
          })
          api.onResolve({ filter: /.*/ }, args => {
            if (args.path === '@prisma/client') return { path: generated, external: true }
            const original = legacy.resolve(args.importer, args.path)
            if (original) return { path: original }
            return resolveCanonicalAlias(args.path)
          })
        },
      },
    ],
  })
const legacyBundle = path.join(output, 'legacy-owner-bundle.mjs')
const currentResult = await buildEntry('custody-service-owner.ts', bundle)
const legacyResult = await buildEntry('custody-legacy-entry.mjs', legacyBundle)
const controllerBundle = path.join(output, 'service-controller-bundle.mjs')
const controllerResult = await buildEntry('custody-service-controller.mjs', controllerBundle, true)
const compositionControllerBundle = path.join(output, 'composition-controller-bundle.mjs')
const compositionControllerResult = await buildEntry(
  'custody-service-composition-controller.mjs',
  compositionControllerBundle,
  true,
)
const allInputs = {
  ...compositionControllerResult.metafile.inputs,
  ...currentResult.metafile.inputs,
  ...legacyResult.metafile.inputs,
  ...controllerResult.metafile.inputs,
}
const hash = filename => createHash('sha256').update(readFileSync(filename)).digest('hex')
const physicalInput = filename => path.resolve(root, filename.replace(/ with \{ type: 'json' \}$/, ''))
const inputPhysicalMap = Object.keys(allInputs).map(key => ({ key, physical: physicalInput(key) }))
const paths = new Set(inputPhysicalMap.map(input => input.physical))
for (const filename of [
  'build-custody-service-owner.mjs',
  'custody-legacy-resolution.mjs',
  'check-custody-service-types.mjs',
  'custody-native-contender.mjs',
  'custody-inspect-after-exit.mjs',
])
  paths.add(path.join(here, filename))
// Bind the entire selected fixture implementation/test/type closure, including supervisor-only proof modules.
// Tests and declarations are manifest inputs only and never executable owner entries.
for (const filename of readdirSync(here)) {
  if (/\.(?:mjs|ts|mts|py)$/.test(filename)) paths.add(path.join(here, filename))
}
const commonModules = [
  'fixture-terminal-codecs',
  'fixture-evidence-read',
  'fixture-diagnostic-failures',
  'unique-json',
  'fixture-audit-records',
]
for (const name of commonModules)
  for (const extension of ['.mjs', '.d.mts', '.test.mjs']) paths.add(path.join(here, '..', name + extension))
paths.add(path.join(root, 'src/services/coordinator/quality-journey-outcome-source.sqlite.integration.test.ts'))
paths.add(path.join(root, 'prisma/schema.prisma'))
paths.add(path.join(root, 'package.json'))
paths.add(path.join(root, 'package-lock.json'))
paths.add(origin.receipt.supervisor)
paths.add(path.join(root, 'scripts/tests/fixtures/m06-analysis-child.mjs'))
paths.add(path.join(root, 'scripts/tests/fixtures/m06-analysis-charter.mjs'))
paths.add(path.join(root, 'prisma/migration-inventory.json'))
function includeDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) includeDirectory(full)
    else paths.add(full)
  }
}
includeDirectory(path.dirname(generated))
if (generated === physicalC) {
  // These are static provenance/data reviews only; their inclusion grants no execution authority.
  paths.add(
    path.join(
      commonRoot,
      '.appraisejs/m06-work/evidence/source-regression8/client-binding16m-physical1/physical-client-binding.json',
    ),
  )
  paths.add(
    path.join(
      commonRoot,
      '.appraisejs/m06-work/evidence/service-composition16z-canonical-closure7/physical-identity-data-proposal1/physical-client-binding.proposed.DATA.json',
    ),
  )
  paths.add(path.join(commonRoot, '.appraisejs/m06-work/reviews/custody-source8-physical-client16m-review.json'))
}
if (generated.includes('/node_modules/@prisma/client/'))
  includeDirectory(path.dirname(require.resolve('.prisma/client/default', { paths: [path.dirname(generated)] })))
includeDirectory(path.join(root, 'prisma/migrations'))
paths.add(path.join(root, 'e2e/apply-migrations.mjs'))
paths.add(path.join(here, 'legacy-fixtures/body-inventory.json'))
for (const input of Object.keys(allInputs)) {
  const filename = physicalInput(input)
  if (
    filename.startsWith(legacy.legacy + path.sep) &&
    !Object.hasOwn(legacy.expected, path.relative(legacy.legacy, filename).replace(/\.fixture$/, ''))
  )
    throw new Error('Unreviewed historical runtime body: ' + filename)
}
const runtimeBodies = Object.keys(allInputs)
  .map(filename => path.resolve(root, filename))
  .filter(filename => filename.startsWith(legacy.legacy + path.sep))
if (runtimeBodies.length !== Object.keys(legacy.expected).length)
  throw new Error('Historical runtime closure must contain exactly seven original bodies')
for (const exact of [
  path.join(root, 'src/lib/quality-journey/provider-intent-contract.ts'),
  path.join(root, 'src/lib/quality-journey/codex-app-server/rpc-transport.ts'),
])
  if (!paths.has(exact)) throw new Error('Missing canonical authority singleton: ' + exact)
if (paths.has(path.join(root, 'src/config/db-config.ts')))
  throw new Error('Ambient database constructor entered the runtime closure')
// Bind installed assertion package metadata as well as every bundled source input.
for (const input of Object.keys(controllerResult.metafile.inputs)) {
  let directory = path.dirname(path.resolve(root, input))
  while (directory !== path.dirname(directory)) {
    const packageFile = path.join(directory, 'package.json')
    if (existsSync(packageFile)) {
      paths.add(packageFile)
      break
    }
    directory = path.dirname(directory)
  }
}
for (const result of [currentResult, legacyResult, controllerResult, compositionControllerResult]) {
  for (const output of Object.values(result.metafile.outputs))
    for (const imported of output.imports)
      if (imported.path === '@prisma/client' || imported.path === 'node:sqlite')
        throw new Error('Ambient client or canonical native SQLite import entered owner bundle')
}
const originCompilations = [
  ['custody-service-owner.ts', bundle, currentResult],
  ['custody-legacy-entry.mjs', legacyBundle, legacyResult],
  ['custody-service-controller.mjs', controllerBundle, controllerResult],
  ['custody-service-composition-controller.mjs', compositionControllerBundle, compositionControllerResult],
].map(([entry, filename, result]) => {
  const included = Object.keys(result.metafile.inputs).some(input => physicalInput(input) === ownedChildSource)
  const invocations = originInvocations.filter(invocation => invocation.entry === entry)
  if (invocations.length !== (included ? 1 : 0)) throw new Error('Owned-child origin transform inclusion mismatch')
  return {
    entry,
    included,
    invocations,
    emitted: included
      ? assertServiceOwnedChildEmittedOrigin(filename, readFileSync(filename, 'utf8'), origin.receipt)
      : null,
  }
})
const originDirectory = path.join(output, 'owned-child-origin')
mkdirSync(originDirectory)
for (const [filename, value] of [
  ['original.ts', origin.source],
  ['transformed.ts', origin.transformed],
  ['inverse.ts', origin.inverse],
])
  writeFileSync(path.join(originDirectory, filename), value, { flag: 'wx' })
const originReceipt = { ...origin.receipt, compilations: originCompilations }
writeFileSync(path.join(originDirectory, 'receipt.json'), JSON.stringify(originReceipt, null, 2) + '\n', { flag: 'wx' })
const manifest = {
  version: 1,
  root,
  bundle,
  bundleSha256: hash(bundle),
  legacyBundle,
  legacyBundleSha256: hash(legacyBundle),
  controllerBundle,
  controllerBundleSha256: hash(controllerBundle),
  compositionControllerBundle,
  compositionControllerBundleSha256: hash(compositionControllerBundle),
  generated,
  nativeScript: path.join(here, 'custody-native-contender.mjs'),
  inspectorScript: path.join(here, 'custody-inspect-after-exit.mjs'),
  legacy: { originalBodies: legacy.expected, importEdges: legacy.edges() },
  transform:
    'Static bundle; ambient database alias exports undefined; actual generated client external absolute module',
  ownedChildOrigin: {
    receipt: path.join(originDirectory, 'receipt.json'),
    sha256: hash(path.join(originDirectory, 'receipt.json')),
  },
  inputPhysicalMap,
  runtimeInputs: {
    current: Object.keys(currentResult.metafile.inputs).sort(),
    legacy: Object.keys(legacyResult.metafile.inputs).sort(),
    controller: Object.keys(controllerResult.metafile.inputs).sort(),
    compositionController: Object.keys(compositionControllerResult.metafile.inputs).sort(),
  },
  bundleMetafiles: {
    current: currentResult.metafile,
    legacy: legacyResult.metafile,
    controller: controllerResult.metafile,
    compositionController: compositionControllerResult.metafile,
  },
  inputs: [...paths].sort().map(filename => ({ filename, sha256: hash(filename) })),
}
writeFileSync(path.join(output, 'owner-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
process.stdout.write(
  JSON.stringify({ bundle, manifest: path.join(output, 'owner-manifest.json'), inputs: paths.size }) + '\n',
)
