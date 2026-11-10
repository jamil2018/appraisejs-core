import {
  preserveAnalysisOwnedChildOrigin,
  inspectEmittedAnalysisOwnedChildOrigin,
} from './analysis-retained-owned-child-origin.mjs'
import { collectAnalysisRuntimePackageInputs } from './analysis-retained-package-inputs.mjs'
import { inspectAnalysisPreRuntimeClosure } from './analysis-retained-preruntime-inputs.mjs'
// Static compiler only: never imports product/C, generates a client, opens SQLite or runs the bundle.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)))
const sourceEntry = fileURLToPath(new URL('../../../../src/test/m06-analysis-retained-controller.ts', import.meta.url))
const [output, clientEntry, clientBindingPath] = process.argv.slice(2)
assert.equal(process.argv.length, 5, 'Exact fresh output, C entry and physical binding receipt required.')
assert.ok(path.isAbsolute(output) && !existsSync(output))
assert.ok(output.startsWith(path.join(root, '.appraisejs') + path.sep))
const binding = JSON.parse(readFileSync(clientBindingPath, 'utf8'))
assert.equal(clientEntry, binding.facts.entry)
assert.equal(realpathSync(clientEntry), clientEntry)
const require = createRequire(path.join(root, 'package.json'))
const { build } = require('esbuild')
const record = filename => {
  const bytes = readFileSync(filename)
  return { filename, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
}
const ownedChildPath = path.join(root, 'src/lib/quality-journey/codex-app-server/owned-child.ts')
const supervisorPath = path.join(root, 'scripts/owned-process-supervisor.mjs')
assert.equal(realpathSync(ownedChildPath), ownedChildPath)
assert.equal(realpathSync(supervisorPath), supervisorPath)
const originTransforms = []
mkdirSync(output)
const result = await build({
  absWorkingDir: root,
  entryPoints: [sourceEntry],
  outdir: output,
  entryNames: 'controller',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  packages: 'external',
  metafile: true,
  plugins: [
    {
      name: 'exact-retained-canonical-client',
      setup(api) {
        api.onLoad({ filter: /owned-child\.ts$/ }, args => {
          if (args.path !== ownedChildPath) return undefined
          assert.equal(realpathSync(args.path), ownedChildPath)
          const originalBytes = readFileSync(args.path)
          const original = originalBytes.toString('utf8')
          assert.ok(Buffer.from(original, 'utf8').equals(originalBytes), 'Original UTF8 bytes must roundtrip.')
          const transformed = preserveAnalysisOwnedChildOrigin(args.path, original, { ownedChildPath, supervisorPath })
          originTransforms.push(transformed)
          return { contents: transformed.contents, loader: 'ts', resolveDir: path.dirname(ownedChildPath) }
        })
        api.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: clientEntry, external: true }))
        api.onResolve({ filter: /^@\/config\/db-config$/ }, () => ({
          path: fileURLToPath(new URL('./analysis-retained-ambient-db.ts', import.meta.url)),
        }))
        api.onResolve({ filter: /^@\// }, args => {
          const base = path.join(root, 'src', args.path.slice(2))
          return { path: existsSync(base + '.ts') ? base + '.ts' : path.join(base, 'index.ts') }
        })
      },
    },
  ],
})
assert.equal(originTransforms.length, 1, 'One canonical owned-child onLoad invocation required.')
const inputMapping = Object.keys(result.metafile.inputs).map(rawKey => {
  const filename = path.resolve(root, rawKey.replace(/ with \{ type: 'json' \}$/, ''))
  assert.equal(realpathSync(filename), filename)
  return { rawKey, physical: record(filename) }
})
assert.equal(inputMapping.filter(row => row.physical.filename === ownedChildPath).length, 1)
const origin = originTransforms[0]
const emittedLaunchSite = inspectEmittedAnalysisOwnedChildOrigin(
  Object.keys(result.metafile.outputs).map(name => ({
    filename: path.resolve(root, name),
    contents: readFileSync(path.resolve(root, name), 'utf8'),
  })),
  origin.receipt.sourceURL,
)
const originDirectory = path.join(output, 'owned-child-origin')
mkdirSync(originDirectory)
const originFiles = ['original.ts', 'transformed.ts', 'receipt.json'].map(name => path.join(originDirectory, name))
writeFileSync(originFiles[0], origin.original, { flag: 'wx' })
writeFileSync(originFiles[1], origin.contents, { flag: 'wx' })
writeFileSync(
  originFiles[2],
  JSON.stringify({ ...origin.receipt, onLoadInvocations: 1, physicalInputInclusions: 1, emittedLaunchSite }, null, 2) +
    '\n',
  { flag: 'wx' },
)
const mappingPath = path.join(output, 'metafile-input-mapping.json')
writeFileSync(mappingPath, JSON.stringify(inputMapping, null, 2) + '\n', { flag: 'wx' })
// Bind the installed runtime package trees without importing/evaluating them.
const externalImports = [
  ...new Set(
    Object.values(result.metafile.outputs).flatMap(module =>
      module.imports.filter(row => row.external).map(row => row.path),
    ),
  ),
].sort()
const { installedRoots, packageFiles, excludedPackageInputs, packageDependencyEdges } =
  collectAnalysisRuntimePackageInputs(externalImports, { root, clientEntry })
const inputs = [
  ...new Set([
    ...inputMapping.map(row => row.physical.filename),
    ...originFiles,
    mappingPath,
    supervisorPath,
    ...[
      'analysis-retained-package-inputs.mjs',
      'analysis-retained-preruntime-inputs.mjs',
      'analysis-retained-owned-child-origin.mjs',
    ].map(name => fileURLToPath(new URL(name, import.meta.url))),
    ...packageFiles,
    fileURLToPath(import.meta.url),
    '/bin/ps',
    clientBindingPath,
    require.resolve('esbuild/package.json'),
    require.resolve('typescript'),
    require.resolve('typescript/package.json'),
    require.resolve('zod/package.json'),
    path.join(root, 'scripts/tests/fixtures/m06-analysis-child.mjs'),
    path.join(root, 'scripts/tests/fixtures/m06-analysis-charter.mjs'),
    path.join(root, 'prisma/schema.prisma'),
    path.join(root, 'prisma/migration-inventory.json'),
  ]),
]
  .sort()
  .map(record)
const migrationRoot = path.join(root, 'prisma/migrations')
const migrations = readdirSync(migrationRoot)
  .sort()
  .flatMap(name => {
    const filename = path.join(migrationRoot, name, 'migration.sql')
    return existsSync(filename) ? [record(filename)] : []
  })
assert.equal(migrations.length, 93)
const outputs = Object.keys(result.metafile.outputs).map(name => record(path.resolve(root, name)))
const entry = outputs.find(row => row.filename === path.join(output, 'controller.js'))
assert.ok(entry)
// Follow every statically evaluated emitted module, not only the entry's direct imports.
const preRuntimeOutputs = inspectAnalysisPreRuntimeClosure(result.metafile, entry, { root, sourceEntry })
writeFileSync(path.join(output, 'metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n', { flag: 'wx' })
writeFileSync(
  path.join(output, 'manifest.json'),
  JSON.stringify(
    {
      version: 1,
      runtimeExecuted: false,
      entry,
      outputs,
      preRuntimeOutputs: [...preRuntimeOutputs].sort(),
      externalImports,
      installedRoots,
      excludedPackageInputs,
      packageDependencyEdges,
      inputs,
      clientBinding: record(clientBindingPath),
      clientEntry,
      executable: record(process.execPath),
      nodeVersion: process.version,
      repositoryRoot: root,
      migrations,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx' },
)
process.stdout.write(
  JSON.stringify({ entry: entry.filename, inputs: inputs.length, outputs: outputs.length, runtimeExecuted: false }) +
    '\n',
)
