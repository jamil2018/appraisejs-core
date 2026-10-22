// Inert physical input checks only: never evaluates a generated client, native library or product module.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import path from 'node:path'
import { parseUniqueJson } from '../unique-json.mjs'

export const clientOutputNames = Object.freeze(
  [
    'client.d.ts',
    'client.js',
    'default.d.ts',
    'default.js',
    'edge.d.ts',
    'edge.js',
    'index-browser.js',
    'index.d.ts',
    'index.js',
    'libquery_engine-darwin-arm64.dylib.node',
    'package.json',
    'query_engine_bg.js',
    'query_engine_bg.wasm',
    'runtime/edge-esm.js',
    'runtime/edge.js',
    'runtime/index-browser.d.ts',
    'runtime/index-browser.js',
    'runtime/library.d.ts',
    'runtime/library.js',
    'runtime/react-native.js',
    'runtime/wasm-compiler-edge.js',
    'runtime/wasm-engine-edge.js',
    'schema.prisma',
    'wasm-edge-light-loader.mjs',
    'wasm-worker-loader.mjs',
    'wasm.d.ts',
    'wasm.js',
  ].sort(),
)
export const originalClientReviewSha256 = '31a1b325ffcb2f0d1474a77144277c214d8215ce00721a5a26a5d4201f7deaea'
export const copiedClientReviewSha256 = 'dde9e3d9f9b7b948f79db6f5300ff349427609844669f0c16bdc6e6d492c3af3'
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, target) =>
  target !== root &&
  !path.relative(root, target).startsWith('..' + path.sep) &&
  path.relative(root, target) !== '..' &&
  !path.isAbsolute(path.relative(root, target))
const absolute = filename =>
  assert(path.isAbsolute(filename) && path.resolve(filename) === filename, 'Canonical absolute path')

function metadata(filename, directory, io) {
  absolute(filename)
  const info = io.lstatSync(filename)
  assert(directory ? info.isDirectory() : info.isFile(), 'Ordinary file/directory required: ' + filename)
  assert(!info.isSymbolicLink() && info.uid === process.getuid(), 'Owned nonsymlink input required: ' + filename)
  assert.equal(info.mode & 0o022, 0, 'Group/other writable input: ' + filename)
  assert.equal(io.realpathSync(filename), filename, 'Physical path differs: ' + filename)
  return { filename, mode: info.mode & 0o777, uid: info.uid, device: info.dev, inode: info.ino }
}
export function bindingFileRecord(filename, io = fs) {
  assert(!/^\.env(?:\.|$)/.test(path.basename(filename)), 'Never read env contents')
  const physical = metadata(filename, false, io),
    bytes = io.readFileSync(filename)
  return { ...physical, sha256: digest(bytes), bytes: bytes.length }
}
function verifyRecord(expected, io) {
  assert(
    expected && /^[a-f0-9]{64}$/.test(expected.sha256) && Number.isSafeInteger(expected.bytes) && expected.bytes >= 0,
    'Exact record hash/length required',
  )
  const actual = bindingFileRecord(expected.filename, io)
  for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], 'Bound record changed: ' + key)
  return actual
}
const dirnameBlock = `const fs = require('fs')

config.dirname = __dirname
if (!fs.existsSync(path.join(__dirname, 'schema.prisma'))) {
  const alternativePaths = [
    "../generated-client",
    "generated-client",
  ]
  
  const alternativePath = alternativePaths.find((altPath) => {
    return fs.existsSync(path.join(process.cwd(), altPath, 'schema.prisma'))
  }) ?? alternativePaths[0]

  config.dirname = path.join(process.cwd(), alternativePath)
  config.isBundled = true
}

`
const clientFooter = `defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
config.engineWasm = undefined
config.compilerWasm = undefined


const { warnEnvConflicts } = require('./runtime/library.js')

warnEnvConflicts({
    rootEnvPath: config.relativeEnvPaths.rootEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.rootEnvPath),
    schemaEnvPath: config.relativeEnvPaths.schemaEnvPath && path.resolve(config.dirname, config.relativeEnvPaths.schemaEnvPath)
})

const PrismaClient = getPrismaClient(config)
exports.PrismaClient = PrismaClient
Object.assign(exports, Prisma)

// file annotations for bundling tools to include these files
path.join(__dirname, "libquery_engine-darwin-arm64.dylib.node");
path.join(process.cwd(), "../generated-client/libquery_engine-darwin-arm64.dylib.node")
// file annotations for bundling tools to include these files
path.join(__dirname, "schema.prisma");
path.join(process.cwd(), "../generated-client/schema.prisma")
`
function verifyLoaderTail(text) {
  const model = text.match(/^config\.runtimeDataModel = JSON.parse\(("(?:[^"\\]|\\.)*")\)\n/)
  assert(model, 'Literal runtime data model required')
  parseUniqueJson(JSON.parse(model[1]))
  assert.equal(text.slice(model[0].length), clientFooter, 'Unsupported runtime/env/constructor loader tail')
}
export function parseClientEnv(code, schema) {
  const matches = [...code.matchAll(/^const config = (\{[\s\S]*?\n\})\n\nconst fs = require\('fs'\)/gm)]
  assert.equal(matches.length, 1, 'Exactly one supported literal config')
  const config = parseUniqueJson(matches[0][1])
  assert.equal(config.clientVersion, '6.19.3')
  assert.equal(config.activeProvider, 'sqlite')
  assert.equal(config.generator.config.engineType, 'library')
  assert.equal(config.inlineSchema, schema, 'Adjacent generated schema must equal inline schema')
  const start = matches[0].index + 'const config = '.length + matches[0][1].length + 2
  assert(code.slice(start).startsWith(dirnameBlock + 'config.runtimeDataModel = '), 'Unsupported dirname loader')
  verifyLoaderTail(code.slice(start + dirnameBlock.length))
  assert.equal(
    [...code.matchAll(/^} = require\('\.\/runtime\/library.js'\)$/gm)].length,
    1,
    'Sole Node/library runtime loader',
  )
  assert.equal(code.split('const config = ').length, 2, 'Unsupported additional config')
  const env = config.relativeEnvPaths
  assert(env && typeof env === 'object' && !Array.isArray(env), 'Literal env object required')
  for (const [role, value] of Object.entries(env)) {
    assert(['rootEnvPath', 'schemaEnvPath'].includes(role), 'Unknown env role')
    if (value === null) continue
    assert(typeof value === 'string' && value.length > 0 && !/[\0\\:]/.test(value), 'Relative env string required')
    assert(!path.isAbsolute(value), 'Absolute env target forbidden')
  }
  return env
}
function inventory(directory, io) {
  const directories = [],
    files = []
  function visit(current) {
    directories.push(metadata(current, true, io))
    for (const name of io.readdirSync(current).sort()) {
      const filename = path.join(current, name),
        info = io.lstatSync(filename)
      if (info.isDirectory()) visit(filename)
      else files.push(filename)
    }
  }
  visit(directory)
  assert.deepEqual(
    files.map(filename => path.relative(directory, filename)).sort(),
    clientOutputNames,
    'Full27 membership',
  )
  const records = files.sort().map(filename => {
    const record = bindingFileRecord(filename, io)
    assert.equal(record.mode, filename.endsWith('.dylib.node') ? 0o755 : 0o644, 'Pinned output mode')
    return { relativePath: path.relative(directory, filename), ...record }
  })
  assert.deepEqual(directories.map(row => path.relative(directory, row.filename)).sort(), ['', 'runtime'])
  return { directories, files: records }
}
function envTargets(directory, envRoot, env, io) {
  const targets = Object.entries(env)
    .filter(([, value]) => value !== null)
    .map(([role, literal]) => ({
      role,
      literal,
      filename: path.resolve(directory, literal),
    }))
  // Containment of ALL targets precedes ANY candidate metadata call.
  for (const target of targets) assert(inside(envRoot, target.filename), 'Outside owned env-root')
  for (const target of targets) {
    target.observedDirectories = []
    const parts = path.relative(envRoot, target.filename).split(path.sep)
    let current = envRoot
    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index])
      let info
      try {
        info = io.lstatSync(current)
      } catch (error) {
        if (error.code === 'ENOENT') {
          target.firstAbsentPath = current
          break
        }
        throw error
      }
      assert(index !== parts.length - 1, 'Env leaf exists; contents forbidden')
      assert(info.isDirectory() && !info.isSymbolicLink(), 'Env ancestor must be ordinary directory')
      target.observedDirectories.push(metadata(current, true, io))
    }
  }
  return targets.map(row => ({ ...row, absent: true }))
}
export function inspectPhysicalClient({ directory, envRoot, provenance }, io = fs) {
  absolute(directory)
  absolute(envRoot)
  assert(inside(envRoot, directory), 'Client must be below owned root')
  assert(['OWNED_GENERATION', 'REVIEWED_RELOCATION'].includes(provenance.kind), 'Explicit binding provenance required')
  verifyRecord(provenance.canonicalSchema, io)
  assert(provenance.receipts.length > 0, 'Creation/provenance receipts required')
  for (const record of provenance.receipts) verifyRecord(record, io)
  const original = inventory(provenance.originalDirectory, io),
    copied = inventory(directory, io)
  const content = rows => rows.map(({ relativePath, mode, sha256, bytes }) => ({ relativePath, mode, sha256, bytes }))
  assert.deepEqual(content(original.files), content(copied.files), 'Original/copy bytes and modes')
  const ownedDirectories = []
  for (let current = directory; ; current = path.dirname(current)) {
    ownedDirectories.push(metadata(current, true, io))
    if (current === envRoot) break
  }
  const schema = io.readFileSync(path.join(directory, 'schema.prisma'), 'utf8')
  const relativeEnvPaths = parseClientEnv(io.readFileSync(path.join(directory, 'index.js'), 'utf8'), schema)
  assert.equal(JSON.parse(io.readFileSync(path.join(directory, 'package.json'))).version, '6.19.3')
  const facts = {
    version: 1,
    directory,
    entry: path.join(directory, 'index.js'),
    envRoot,
    provenance,
    original,
    copied,
    ownedDirectories,
    relativeEnvPaths,
    envTargets: envTargets(directory, envRoot, relativeEnvPaths, io),
  }
  return { facts, digest: digest(JSON.stringify(facts)) }
}
export function verifyPhysicalClient(binding, io = fs) {
  const { directory, envRoot, provenance } = binding.facts
  const actual = inspectPhysicalClient({ directory, envRoot, provenance }, io)
  assert.deepEqual(actual, binding, 'Current complete physical binding changed')
  return binding
}
function publish(filename, value, io) {
  io.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
  return bindingFileRecord(filename, io)
}
function readBoundJson(record, io) {
  verifyRecord(record, io)
  return parseUniqueJson(io.readFileSync(record.filename, 'utf8'))
}
function runtimeLayout(envRoot, env) {
  let depth = 1
  for (const value of Object.values(env).filter(value => value !== null)) {
    const parts = path.posix.normalize(value).split('/'),
      upward = parts.filter(part => part === '..').length
    depth = Math.max(depth, upward + (parts.every(part => part === '..') ? 1 : 0))
  }
  return path.join(envRoot, ...Array.from({ length: depth - 1 }, (_, index) => 'level-' + index), 'client')
}
export function materializeGeneratedClient(generationDirectory, provenance, io = fs) {
  absolute(generationDirectory)
  assert.equal(provenance.kind, 'OWNED_GENERATION')
  assert.equal(provenance.originalDirectory, path.join(generationDirectory, 'generated-client'))
  const original = inventory(provenance.originalDirectory, io)
  const schema = io.readFileSync(path.join(provenance.originalDirectory, 'schema.prisma'), 'utf8')
  const env = parseClientEnv(io.readFileSync(path.join(provenance.originalDirectory, 'index.js'), 'utf8'), schema)
  const envRoot = path.join(generationDirectory, 'runtime-env-root'),
    directory = runtimeLayout(envRoot, env)
  const consumed = publish(
    path.join(generationDirectory, 'runtime-materialization-consumed.json'),
    {
      status: 'CONSUMED_OWNED_RUNTIME_COPY_NO_RETRY',
      generationDirectory,
      directory,
      envRoot,
      original,
    },
    io,
  )
  try {
    io.mkdirSync(envRoot) // Exclusive root: no adoption, recopy or alternative layout on failure.
    io.mkdirSync(path.join(directory, 'runtime'), { recursive: true })
    for (const row of original.files) {
      const filename = path.join(directory, row.relativePath)
      io.writeFileSync(filename, io.readFileSync(row.filename), { flag: 'wx', mode: row.mode })
      io.chmodSync(filename, row.mode)
    }
    const binding = inspectPhysicalClient(
      {
        directory,
        envRoot,
        provenance: { ...provenance, generationDirectory, receipts: [...provenance.receipts, consumed] },
      },
      io,
    )
    assert.deepEqual(binding.facts.original, original, 'Original generation changed during copy')
    const receipt = publish(path.join(generationDirectory, 'physical-client-binding.json'), binding, io)
    verifyPhysicalClient(binding, io)
    return { entry: binding.facts.entry, bindingReceipt: receipt, origin: 'OWNED_GENERATION' }
  } catch (error) {
    try {
      publish(
        path.join(generationDirectory, 'runtime-materialization-failure.json'),
        {
          status: 'FAILED_PRESERVED_NO_RETRY',
          error: String(error.message).slice(0, 2000),
          directory,
        },
        io,
      )
    } catch {
      /* Preserve the original failure and every partial output. */
    }
    throw error
  }
}
export function readReviewedClientBinding(reviewRecord, io = fs) {
  const review = readBoundJson(reviewRecord, io)
  assert.equal(review.judgment, 'ACCEPT')
  assert.equal(review.scope, 'EXACT_SOURCE8_PHYSICAL_CLIENT_BINDING')
  assert.equal(review.clientExecutionAuthorized, false)
  assert.equal(review.originalStaticReviewSha256, originalClientReviewSha256)
  assert.equal(review.copied27StaticResultReviewSha256, copiedClientReviewSha256)
  const binding = readBoundJson(review.bindingReceipt, io)
  assert.equal(binding.facts.provenance.kind, 'REVIEWED_RELOCATION')
  assert.equal(review.bindingDigest, binding.digest)
  assert.equal(review.clientEntry, binding.facts.entry)
  assert.equal(review.envRoot, binding.facts.envRoot)
  const receiptHashes = binding.facts.provenance.receipts.map(row => row.sha256)
  assert(
    receiptHashes.includes(originalClientReviewSha256) && receiptHashes.includes(copiedClientReviewSha256),
    'Both provenance reviews bound',
  )
  const originalReview = readBoundJson(
    binding.facts.provenance.receipts.find(row => row.sha256 === originalClientReviewSha256),
    io,
  )
  assert.equal(originalReview.canonicalClientBuildInputAccepted, true)
  assert.equal(binding.facts.provenance.originalDirectory, path.dirname(originalReview.acceptedClientEntry.path))
  assert.equal(binding.facts.provenance.canonicalSchema.filename, originalReview.originalCanonicalSchema.path)
  assert.equal(binding.facts.provenance.canonicalSchema.sha256, originalReview.originalCanonicalSchema.sha256)
  assert.deepEqual(
    sourceClientByteMembership(binding.facts.original.files),
    sourceClientByteMembership(originalReview.acceptedGeneratedOutputs),
  )
  const copyReview = readBoundJson(
    binding.facts.provenance.receipts.find(row => row.sha256 === copiedClientReviewSha256),
    io,
  )
  assert.equal(copyReview.ownedCopyStaticBuildInputAccepted, true)
  assert.equal(copyReview.completedViewValidation.copiedClient, binding.facts.directory)
  verifyPhysicalClient(binding, io)
  return { binding, bindingReceipt: review.bindingReceipt, physicalReview: reviewRecord, origin: 'REVIEWED_RELOCATION' }
}
function verifyGenerationPolicy(binding, packet, io) {
  const provenance = binding.facts.provenance,
    directory = path.join(packet, 'client')
  assert.equal(provenance.kind, 'OWNED_GENERATION')
  assert.equal(provenance.generationDirectory, directory)
  assert.equal(provenance.originalDirectory, path.join(directory, 'generated-client'))
  assert.equal(binding.facts.envRoot, path.join(directory, 'runtime-env-root'))
  const receipt = name => {
    const record = provenance.receipts.find(row => row.filename === path.join(directory, name))
    assert(record, 'Required original generation receipt: ' + name)
    return readBoundJson(record, io)
  }
  const inputs = receipt('generation-inputs.json'),
    result = receipt('generation-result.json'),
    formatter = receipt('formatter/result.json')
  assert.equal(inputs.status, 'CONSUMED_OFFLINE_GENERATION_NO_RETRY')
  assert.equal(inputs.canonicalSchemaSha256, provenance.canonicalSchema.sha256)
  assert.equal(result.status, 0)
  assert.equal(result.signal, null)
  assert.equal(result.unchangedInstalled, true)
  assert.equal(formatter.exit, 0)
  assert.equal(formatter.signal, null)
  assert.equal(formatter.exactFormatterOutputEqualsGeneratedSchema, true)
  const generatedSchema = binding.facts.original.files.find(row => row.relativePath === 'schema.prisma')
  assert.equal(formatter.generatedSchemaSha256, generatedSchema.sha256)
  assert.equal(receipt('runtime-materialization-consumed.json').status, 'CONSUMED_OWNED_RUNTIME_COPY_NO_RETRY')
}
export function verifyPacketClient(manifest, packet, io = fs) {
  absolute(packet)
  assert.equal(manifest.version, 2, 'Physical binding manifest required')
  assert.equal(manifest.clientReady, true)
  assert.equal(manifest.clientRuntimeSafe, true, 'Original31 remains blocked for execution')
  const selected = manifest.clientBinding
  assert(
    selected && ['OWNED_GENERATION', 'REVIEWED_RELOCATION'].includes(selected.origin),
    'Explicit origin policy required',
  )
  let binding
  if (selected.origin === 'REVIEWED_RELOCATION') {
    assert.equal(manifest.status, 'STATIC_ONLY_ACCEPTED_CLIENT_BUILD_INPUT')
    assert.equal(manifest.controllerRuntimeReviewRequired, true, 'External client requires exact execution review')
    const accepted = readReviewedClientBinding(selected.physicalReview, io)
    assert.deepEqual(accepted.bindingReceipt, selected.bindingReceipt)
    binding = accepted.binding
  } else {
    assert.equal(manifest.status, 'CANONICAL_TEST_INPUT_PACKET')
    assert.equal(manifest.controllerRuntimeReviewRequired, false)
    assert(!selected.physicalReview, 'Generation cannot inherit external acceptance')
    assert.equal(selected.bindingReceipt.filename, path.join(packet, 'client/physical-client-binding.json'))
    binding = readBoundJson(selected.bindingReceipt, io)
    verifyGenerationPolicy(binding, packet, io)
    verifyPhysicalClient(binding, io)
  }
  assert.equal(binding.facts.entry, manifest.generatedEntry)
  assert(
    manifest.files.some(
      row =>
        row.filename === binding.facts.provenance.canonicalSchema.filename &&
        row.sha256 === binding.facts.provenance.canonicalSchema.sha256 &&
        row.bytes === binding.facts.provenance.canonicalSchema.bytes,
    ),
    'Canonical schema must be a packet input',
  )
  assert.deepEqual(
    sourceClientByteMembership(manifest.generatedFiles),
    sourceClientByteMembership(binding.facts.copied.files),
  )
  return binding
}
export function sourceClientByteMembership(rows) {
  return rows
    .map(({ filename, sha256, bytes }) => ({ filename, sha256, bytes }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
}
export function withVerifiedPacketClient(manifest, packet, action, io = fs) {
  verifyPacketClient(manifest, packet, io)
  return action() // Exact return, including the original import Promise; no assimilation or added await.
}
