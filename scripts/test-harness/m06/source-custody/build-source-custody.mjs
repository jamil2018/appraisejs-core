// Static bundling and owned offline client generation. Never imports product/client/SQLite.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, fileRecord, generateOwnedClient, root, tree } from './source-custody-client.mjs'
import { readReviewedClientBinding, verifyPacketClient } from './source-custody-client-binding.mjs'
import { sourceIpcFaultCases } from './source-custody-ipc-fault.mjs'
const here = path.dirname(fileURLToPath(import.meta.url)),
  require = createRequire(path.join(root, 'package.json'))
const { build } = require('esbuild')
const ts = require('typescript')
const commonNames = Object.freeze([
  'fixture-terminal-codecs',
  'fixture-evidence-read',
  'fixture-diagnostic-failures',
  'unique-json',
  'fixture-audit-records',
])
export const sourcePacketCommonImportMap = Object.freeze(
  Object.fromEntries(commonNames.map(name => ['../' + name + '.mjs', './' + name + '.mjs'])),
)
const ownerNames = ['source-custody-owner.mjs', 'source-custody-cleanup-owner.mjs']
const testPaths = [
  'src/lib/quality-journey/provider-source-database.sqlite.test.ts',
  'src/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal.test.ts',
  'src/lib/quality-journey/codex-app-server/outcome-source.sqlite.test.ts',
]
const sourcePaths = [
  'provider-source-database.ts',
  'provider-intent-contract.ts',
  'provider-reconciliation-contract.ts',
  ...[
    'outcome-source.ts',
    'outcome-source-contract.ts',
    'outcome-source-envelope.ts',
    'outcome-source-sqlite-journal.ts',
    'outcome-custodian.ts',
    'rpc-transport.ts',
  ].map(name => 'codex-app-server/' + name),
].map(name => 'src/lib/quality-journey/' + name)
sourcePaths.push(
  'src/services/shared/errors.ts',
  ...['index.ts', 'canonical-json.ts', 'references.ts'].map(name => 'src/lib/catalog-contracts/' + name),
)
export function canonicalInputs() {
  const files = [
    ...tree(here),
    ...commonNames.flatMap(name =>
      ['.mjs', '.d.mts', '.test.mjs'].map(extension => fileRecord(path.join(here, '..', name + extension))),
    ),
    fileRecord(require.resolve('typescript')),
    fileRecord(require.resolve('typescript/package.json')),
    ...testPaths.map(name => fileRecord(path.join(root, name))),
    ...sourcePaths.map(name => fileRecord(path.join(root, name))),
    fileRecord(path.join(root, 'prisma/schema.prisma')),
    fileRecord(path.join(root, 'prisma/migration-inventory.json')),
    ...tree(path.join(root, 'prisma/migrations')),
    fileRecord(require.resolve('prisma/package.json')),
    fileRecord(require.resolve('@prisma/client/package.json')),
    fileRecord(process.execPath),
    fileRecord('/bin/ps'),
    ...tree(path.dirname(require.resolve('zod/package.json'))),
  ]
  // Output directories, packet nonce and generated absolute output spellings are deliberately absent.
  const canonical = files
    .map(row => ({ path: path.relative(root, row.filename), sha256: row.sha256, bytes: row.bytes }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return {
    files,
    digest: digest(
      JSON.stringify({
        files: canonical,
        clientVersion: '6.19.3',
        schemaEngine: 'caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1',
        queryEngine: 'afb9cb5a12ea42caa6f6498e40e9cb75059cae17098aadcc1001c99bb262e1ee',
      }),
    ),
  }
}
export async function buildSourceCustodyPacket(directory, staticClient, physicalReview, sourceIpcFaultOnly = false) {
  assert(path.isAbsolute(directory) && !existsSync(directory), 'Fresh packet only')
  assert.equal(typeof sourceIpcFaultOnly, 'boolean')
  assert(!physicalReview || staticClient, 'Physical review only for explicit external client')
  assert(
    !sourceIpcFaultOnly || (staticClient && physicalReview),
    'Fault packet requires explicit reviewed physical client; no generation',
  )
  const canonical = canonicalInputs()
  mkdirSync(directory, { recursive: true })
  const { generated, clientAcceptance, clientBinding } = selectSourcePacketClient(
    directory,
    staticClient,
    physicalReview,
  )
  const { entry, result, actualInputs } = await buildAndBindSourceStage(directory, generated, canonical)
  const { scriptNames, projections, commonCopies } = materializeSourcePacketScripts(directory)

  const manifest = {
    version: 2,
    projections,
    commonCopies,
    status: staticClient ? 'STATIC_ONLY_ACCEPTED_CLIENT_BUILD_INPUT' : 'CANONICAL_TEST_INPUT_PACKET',
    clientReady: true,
    clientRuntimeSafe: !!clientBinding,
    clientBinding,
    ...(sourceIpcFaultOnly
      ? {
          sourceIpcFaultOnly: true,
          allowedFaultCases: [...sourceIpcFaultCases],
          faultReportAfterReceiptThrows: true,
          faultControllerScript: 'source-custody-fault-controller.mjs',
        }
      : {}),
    controllerRuntimeReviewRequired: !!staticClient,
    clientAcceptance,
    runtimeExecuted: false,
    canonicalInputDigest: canonical.digest,
    executable: fileRecord(process.execPath),
    psExecutable: fileRecord('/bin/ps'),
    nodeVersion: process.version,
    generatedEntry: generated.entry,
    generatedFiles: tree(path.dirname(generated.entry)),
    files: canonical.files,
    bundle: fileRecord(entry),
    migrations: tree(path.join(root, 'prisma/migrations')).filter(row => row.filename.endsWith('/migration.sql')),
    actualSourceInputs: actualInputs.map(fileRecord),
    ownerScripts: [...ownerNames],
    setupScript: 'source-custody-setup.mjs',
    controllerScript: 'source-custody-controller.mjs',
    packetFiles: [
      ...scriptNames.map(name => fileRecord(path.join(directory, name))),
      ...commonCopies.map(row => row.copied),
      fileRecord(entry),
    ],
    nativeDatabaseOwnerAccess: false,
    engineQueryEvents: 'UNAVAILABLE_UNCONFIGURED',
    retainedReconcileOrdering: 'SEPARATE_GENUINE_SERVICE_FIXTURE_DEPENDENCY_NOT_RECREATED',
  }
  if (clientBinding) verifyPacketClient(manifest, directory)
  assert.equal(manifest.migrations.length, 93)
  for (const output of Object.values(result.metafile.outputs))
    for (const imported of output.imports) assert(!['@prisma/client', 'node:sqlite'].includes(imported.path))
  assert.equal(canonicalInputs().digest, canonical.digest, 'Canonical input drift during build')
  if (clientBinding) verifyPacketClient(manifest, directory) // Includes original/copy/provenance/current env facts.
  writeFileSync(path.join(directory, 'bundle-metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n')
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  return manifest
}
export function buildSourceIpcFaultPacket(directory, staticClient, physicalReview) {
  return buildSourceCustodyPacket(directory, staticClient, physicalReview, true)
}

// Build-time TypeScript parsing selects literal import sites; no arbitrary text replacement.
// Whole module-reference grammar and fixed owner/common projection policy used by the actual traversal.
export function sourcePacketImportSite(node, parsed, name) {
  let literal, kind
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    literal = node.moduleSpecifier
    kind = ts.isImportDeclaration(node) ? 'static-import' : 'static-export'
  } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    assert.equal(node.arguments.length, 1, 'Single literal dynamic import only')
    literal = node.arguments[0]
    kind = 'dynamic-import'
    assert(ts.isStringLiteral(literal), 'No computed dynamic importer')
  }
  if (!literal) return undefined
  assert(ts.isStringLiteral(literal), 'Literal module specifier required')
  const specifier = literal.text
  let projected = Object.hasOwn(sourcePacketCommonImportMap, specifier)
    ? sourcePacketCommonImportMap[specifier]
    : specifier
  if (specifier === './source-custody-cases.ts') {
    assert(ownerNames.includes(name) && kind === 'dynamic-import', 'Owner-only stage projection')
    projected = './source-stage.mjs'
  }
  assert(
    !specifier.startsWith('../') || Object.hasOwn(sourcePacketCommonImportMap, specifier),
    'Unknown parent dependency',
  )
  return { kind, start: literal.getStart(parsed), end: literal.end, specifier, projected }
}
export function sourcePacketImportSites(content, name) {
  const parsed = ts.createSourceFile(name, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(parsed.parseDiagnostics.length, 0, 'Canonical script must parse before projection')
  const sites = []
  function visit(node) {
    const site = sourcePacketImportSite(node, parsed, name)
    if (site) sites.push(site)
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  sites.sort((a, b) => a.start - b.start)
  assert.equal(
    sites.filter(site => site.specifier === './source-custody-cases.ts').length,
    ownerNames.includes(name) ? 1 : 0,
    'Exactly one declared canonical stage import in each owner',
  )
  return sites
}
export function projectSourcePacketScript(content, name) {
  const sites = sourcePacketImportSites(content, name)
  let projected = '',
    offset = 0
  const replacements = []
  for (const site of sites) {
    if (site.specifier === site.projected) continue
    projected += content.slice(offset, site.start)
    const originalLiteral = content.slice(site.start, site.end),
      projectedLiteral = originalLiteral[0] + site.projected + originalLiteral.at(-1)
    assert.equal(originalLiteral.slice(1, -1), site.specifier, 'No escaped module specifier')
    replacements.push({
      ...site,
      originalLiteral,
      projectedLiteral,
      projectedStart: projected.length,
      projectedEnd: projected.length + projectedLiteral.length,
    })
    projected += projectedLiteral
    offset = site.end
  }
  projected += content.slice(offset)
  let inverse = projected
  for (const replacement of [...replacements].reverse()) {
    assert.equal(inverse.slice(replacement.projectedStart, replacement.projectedEnd), replacement.projectedLiteral)
    inverse =
      inverse.slice(0, replacement.projectedStart) +
      replacement.originalLiteral +
      inverse.slice(replacement.projectedEnd)
  }
  assert.equal(inverse, content, 'Full literal-only projection byte inverse')
  const occurrenceCounts = Object.fromEntries(Object.keys(sourcePacketCommonImportMap).map(specifier => [specifier, 0]))
  for (const replacement of replacements)
    if (Object.hasOwn(occurrenceCounts, replacement.specifier)) occurrenceCounts[replacement.specifier]++
  return { content: projected, importLiteralSites: sites, replacements, occurrenceCounts, byteInverse: true }
}
function materializeSourcePacketScripts(directory) {
  const scriptNames = readdirSync(here).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')),
    projections = [],
    commonCopies = []
  for (const name of commonNames) {
    const basename = name + '.mjs'
    assert(!scriptNames.includes(basename), 'Common packet helper collision')
    const source = path.join(here, '..', basename),
      copied = path.join(directory, basename)
    writeFileSync(copied, readFileSync(source), { flag: 'wx' })
    const original = fileRecord(source),
      actual = fileRecord(copied)
    assert.equal(actual.sha256, original.sha256)
    assert.equal(actual.bytes, original.bytes)
    commonCopies.push({ source: original, copied: actual })
  }
  for (const name of scriptNames) {
    const source = path.join(here, name),
      target = path.join(directory, name),
      projection = projectSourcePacketScript(readFileSync(source, 'utf8'), name)
    writeFileSync(target, projection.content, { flag: 'wx' })
    projections.push({
      source: fileRecord(source),
      projected: fileRecord(target),
      importLiteralSites: projection.importLiteralSites,
      replacements: projection.replacements,
      occurrenceCounts: projection.occurrenceCounts,
      byteInverse: projection.byteInverse,
    })
  }
  return { scriptNames, projections, commonCopies }
}

function selectSourcePacketClient(directory, staticClient, physicalReview) {
  const generated = staticClient
    ? { entry: path.resolve(staticClient) }
    : generateOwnedClient(path.join(directory, 'client'))
  let clientAcceptance,
    clientBinding = generated.clientBinding
  if (physicalReview) {
    const accepted = readReviewedClientBinding(physicalReview)
    assert.equal(generated.entry, accepted.binding.facts.entry)
    assert.equal(accepted.binding.facts.provenance.canonicalSchema.filename, path.join(root, 'prisma/schema.prisma'))
    clientBinding = {
      origin: accepted.origin,
      physicalReview: accepted.physicalReview,
      bindingReceipt: accepted.bindingReceipt,
    }
    clientAcceptance = physicalReview
  } else if (staticClient) {
    const filename = path.resolve(root, '../../reviews/custody-source-regression8-canonical-client-review.json')
    const bytes = readFileSync(filename)
    assert.equal(digest(bytes), '31a1b325ffcb2f0d1474a77144277c214d8215ce00721a5a26a5d4201f7deaea')
    const review = JSON.parse(bytes)
    assert.equal(review.canonicalClientBuildInputAccepted, true)
    assert.equal(generated.entry, review.acceptedClientEntry.path)
    for (const expected of review.acceptedGeneratedOutputs) {
      const actual = fileRecord(expected.filename)
      assert.equal(actual.sha256, expected.sha256)
      assert.equal(actual.bytes, expected.bytes)
    }
    assert.equal(tree(path.dirname(generated.entry)).length, review.acceptedGeneratedOutputs.length)
    clientAcceptance = fileRecord(filename)
  }
  return { generated, clientAcceptance, clientBinding }
}
async function buildAndBindSourceStage(directory, generated, canonical) {
  const entry = path.join(directory, 'source-stage.mjs')
  const result = await build({
    stdin: {
      contents: `export * from './scripts/test-harness/m06/source-custody/source-custody-cases';`,
      resolveDir: root,
      loader: 'ts',
    },
    absWorkingDir: root,
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    packages: 'external',
    metafile: true,
    plugins: [
      {
        name: 'sole-owned-exact-generated-client',
        setup(api) {
          api.onResolve({ filter: /^@prisma\/client$/ }, () => ({ path: generated.entry, external: true }))
          api.onResolve({ filter: /^zod$/ }, () => ({ path: require.resolve('zod'), external: true }))
        },
      },
    ],
  })
  const actualInputs = Object.keys(result.metafile.inputs)
    .filter(name => name !== '<stdin>')
    .map(name => path.resolve(root, name))
  const allowed = new Set(canonical.files.map(row => row.filename))
  for (const filename of actualInputs) assert(allowed.has(filename), 'Unbound source dependency: ' + filename)
  for (const filename of actualInputs) {
    const relative = path.relative(root, filename),
      target = path.join(directory, 'source', relative)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(filename), { flag: 'wx' })
  }
  return { entry, result, actualInputs }
}
