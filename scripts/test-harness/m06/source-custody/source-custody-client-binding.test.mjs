// Synthetic text only: no generated client, product, native library or owner is imported.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  sourceClientByteMembership,
  clientOutputNames,
  bindingFileRecord,
  inspectPhysicalClient,
  verifyPhysicalClient,
  parseClientEnv,
  materializeGeneratedClient,
  verifyPacketClient,
  withVerifiedPacketClient,
  readReviewedClientBinding,
  originalClientReviewSha256,
  copiedClientReviewSha256,
} from './source-custody-client-binding.mjs'

const loader = `const fs = require('fs')

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
const footer = `defineDmmfProperty(exports.Prisma, config.runtimeDataModel)
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
const schema = 'synthetic schema, never loaded'
function code(env) {
  return `} = require('./runtime/library.js')\nconst config = ${JSON.stringify(
    {
      clientVersion: '6.19.3',
      activeProvider: 'sqlite',
      generator: { config: { engineType: 'library' } },
      relativeEnvPaths: env,
      inlineSchema: schema,
    },
    null,
    2,
  )}\n\n${loader}config.runtimeDataModel = JSON.parse("{}")\n${footer}`
}
function prepareFakeClientTrees(directories, env) {
  const contents = new Map([
    ['index.js', code(env)],
    ['schema.prisma', schema],
    ['package.json', '{"version":"6.19.3"}'],
  ])
  for (const base of directories) {
    fs.mkdirSync(path.join(base, 'runtime'), { recursive: true })
    for (const name of clientOutputNames) {
      const text = contents.get(name) ?? 'inert fake bytes: ' + name
      fs.writeFileSync(path.join(base, name), text, { mode: name.endsWith('.node') ? 0o755 : 0o644 })
    }
  }
}
function fixture(t, env = { rootEnvPath: '../../.env' }) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(tmpdir()), 'source-binding-inert-'))
  t.after(() => fs.rmSync(root, { recursive: true }))
  fs.writeFileSync(path.join(root, 'creation.json'), '{}')
  fs.writeFileSync(path.join(root, 'canonical.prisma'), 'synthetic canonical')
  const original = path.join(root, 'original'),
    envRoot = path.join(root, 'env-root'),
    directory = path.join(envRoot, 'a/client')
  prepareFakeClientTrees([original, directory], env)
  const provenance = {
    kind: 'REVIEWED_RELOCATION',
    originalDirectory: original,
    canonicalSchema: bindingFileRecord(path.join(root, 'canonical.prisma')),
    receipts: [bindingFileRecord(path.join(root, 'creation.json'))],
  }
  return { root, directory, envRoot, provenance }
}
test('literal parser accepts both roles/null and refuses duplicate/dynamic/unknown/absolute/loader/schema forms', () => {
  assert.deepEqual(parseClientEnv(code({ rootEnvPath: null, schemaEnvPath: '../schema/.env' }), schema), {
    rootEnvPath: null,
    schemaEnvPath: '../schema/.env',
  })
  for (const text of [
    code({ extra: '../.env' }),
    code({ rootEnvPath: '/ambient/.env' }),
    code({ rootEnvPath: 'C:\\ambient' }),
    code({ rootEnvPath: '\0' }),
    code({ rootEnvPath: '' }),
    code({ rootEnvPath: 7 }),
    code({}).replace('"relativeEnvPaths": {}', '"relativeEnvPaths": {}, "relativeEnvPaths": {}'),
    code({}).replace('"relativeEnvPaths": {}', '"relativeEnvPaths": lookup()'),
    code({}).replace('config.dirname = __dirname', 'config.dirname = process.cwd()'),
    code({}).replace('warnEnvConflicts({', 'anotherEnvLoader({'),
    code({}) + 'config.dirname = process.cwd()\n',
    code({}).replace('JSON.parse("{}")', 'runtimeModel()'),
    code({}).replace('"6.19.3"', '"6.20.0"'),
  ])
    assert.throws(() => parseClientEnv(text, schema))
  assert.throws(() => parseClientEnv(code({}), 'different adjacent schema'))
})
test('complete physical receipt binds all27 files, original/copy and directory identity; no env content read', t => {
  const f = fixture(t),
    reads = [],
    io = {
      ...fs,
      readFileSync(filename, ...args) {
        reads.push(filename)
        assert.notEqual(path.basename(filename), '.env')
        return fs.readFileSync(filename, ...args)
      },
    }
  const binding = inspectPhysicalClient(f, io)
  assert.equal(binding.facts.copied.files.length, 27)
  assert.deepEqual(
    binding.facts.envTargets.map(row => row.filename),
    [path.join(f.envRoot, '.env')],
  )
  assert.equal(verifyPhysicalClient(binding, io), binding)
  assert(reads.length > 27)
  fs.writeFileSync(path.join(f.directory, 'index.d.ts'), 'changed')
  assert.throws(() => verifyPhysicalClient(binding, io))
})
test('outside target is refused before candidate lstat or env content access', t => {
  const f = fixture(t, { rootEnvPath: '../../../ambient.env', schemaEnvPath: '../../safe.env' }),
    touched = []
  const outside = path.resolve(f.directory, '../../../ambient.env')
  const io = {
    ...fs,
    lstatSync(filename, ...args) {
      touched.push(filename)
      return fs.lstatSync(filename, ...args)
    },
  }
  assert.throws(() => inspectPhysicalClient(f, io), /Outside owned/)
  assert(!touched.includes(outside))
  assert(!touched.includes(path.join(f.envRoot, 'safe.env')))
})
test('changed env ancestry is bound even when its final leaf stays absent', t => {
  const f = fixture(t, { schemaEnvPath: '../../nested/.env' }),
    binding = inspectPhysicalClient(f)
  fs.mkdirSync(path.join(f.envRoot, 'nested'))
  assert.throws(() => verifyPhysicalClient(binding), /binding changed/)
})
const envAbsenceMutations = {
  file(f, nested) {
    fs.mkdirSync(nested)
    fs.writeFileSync(path.join(nested, '.env'), 'never read')
  },
  directory(f, nested) {
    fs.mkdirSync(nested)
    fs.mkdirSync(path.join(nested, '.env'))
  },
  'dangling-link'(f, nested) {
    fs.mkdirSync(nested)
    fs.symlinkSync(path.join(f.root, 'missing'), path.join(nested, '.env'))
  },
  'ancestor-link'(f, nested) {
    fs.symlinkSync(f.root, nested)
  },
}
for (const [kind, mutate] of Object.entries(envAbsenceMutations))
  test('env absence refuses ' + kind, t => {
    const f = fixture(t, { schemaEnvPath: '../../nested/.env' })
    mutate(f, path.join(f.envRoot, 'nested'))
    assert.throws(() => inspectPhysicalClient(f))
  })
function changedMetadataIO(f, key) {
  return {
    ...fs,
    lstatSync(filename) {
      const info = fs.lstatSync(filename)
      if (filename === f.envRoot) Object.defineProperty(info, key, { value: info[key] + 1 })
      return info
    },
  }
}
const physicalMutations = {
  extra(f) {
    fs.writeFileSync(path.join(f.directory, 'extra.js'), '')
  },
  'missing-schema'(f) {
    fs.unlinkSync(path.join(f.directory, 'schema.prisma'))
  },
  mode(f) {
    fs.chmodSync(path.join(f.directory, 'index.js'), 0o666)
  },
  'file-link'(f) {
    fs.unlinkSync(path.join(f.directory, 'index.js'))
    fs.symlinkSync(path.join(f.provenance.originalDirectory, 'index.js'), path.join(f.directory, 'index.js'))
  },
  'directory-link'(f) {
    fs.renameSync(path.join(f.directory, 'runtime'), path.join(f.root, 'moved'))
    fs.symlinkSync(path.join(f.root, 'moved'), path.join(f.directory, 'runtime'))
  },
  uid(f) {
    return changedMetadataIO(f, 'uid')
  },
  inode(f) {
    return changedMetadataIO(f, 'ino')
  },
}
for (const [kind, mutate] of Object.entries(physicalMutations))
  test('physical verification refuses ' + kind, t => {
    const f = fixture(t),
      binding = inspectPhysicalClient(f)
    const io = mutate(f) ?? fs
    assert.throws(() => verifyPhysicalClient(binding, io))
  })

function generation(t, env) {
  const f = fixture(t, env),
    packet = path.join(f.root, 'packet'),
    directory = path.join(packet, 'client')
  fs.mkdirSync(directory, { recursive: true })
  fs.renameSync(f.provenance.originalDirectory, path.join(directory, 'generated-client'))
  const schemaHash = bindingFileRecord(path.join(directory, 'generated-client/schema.prisma')).sha256
  const records = [
    [
      'generation-inputs.json',
      { status: 'CONSUMED_OFFLINE_GENERATION_NO_RETRY', canonicalSchemaSha256: f.provenance.canonicalSchema.sha256 },
    ],
    ['generation-result.json', { status: 0, signal: null, unchangedInstalled: true }],
    [
      'formatter/result.json',
      { exit: 0, signal: null, exactFormatterOutputEqualsGeneratedSchema: true, generatedSchemaSha256: schemaHash },
    ],
  ].map(([name, value]) => {
    const filename = path.join(directory, name)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, JSON.stringify(value))
    return bindingFileRecord(filename)
  })
  const provenance = {
    ...f.provenance,
    kind: 'OWNED_GENERATION',
    originalDirectory: path.join(directory, 'generated-client'),
    receipts: records,
  }
  function prepare(io = fs) {
    const selected = materializeGeneratedClient(directory, provenance, io)
    const binding = JSON.parse(fs.readFileSync(selected.bindingReceipt.filename))
    const manifest = {
      version: 2,
      status: 'CANONICAL_TEST_INPUT_PACKET',
      clientReady: true,
      clientRuntimeSafe: true,
      controllerRuntimeReviewRequired: false,
      clientBinding: selected,
      generatedEntry: selected.entry,
      files: [provenance.canonicalSchema],
      generatedFiles: binding.facts.copied.files,
    }
    return { manifest, binding }
  }
  return { ...f, packet, generationDirectory: directory, provenance, prepare }
}
test('real materializer derives both env depths and gate returns exact original action value', t => {
  const f = generation(t, { rootEnvPath: '../../../../../../.env', schemaEnvPath: '../schema/.env' })
  const before = fs.readFileSync(path.join(f.provenance.originalDirectory, 'index.js'))
  const { manifest, binding } = f.prepare()
  assert.equal(path.relative(binding.facts.envRoot, binding.facts.directory).split(path.sep).length, 6)
  assert.deepEqual(fs.readFileSync(path.join(f.provenance.originalDirectory, 'index.js')), before)
  assert.equal(verifyPacketClient(manifest, f.packet).digest, binding.digest)
  const original = Promise.resolve('inert eager sentinel')
  assert.equal(
    withVerifiedPacketClient(manifest, f.packet, () => original),
    original,
  )
  fs.writeFileSync(path.join(binding.facts.envRoot, '.env'), 'never opened')
  let imports = 0
  assert.throws(() => withVerifiedPacketClient(manifest, f.packet, () => imports++))
  assert.equal(imports, 0)
})
test('materialization failure preserves original, consumed record and partial output, never retries', t => {
  const f = generation(t, { rootEnvPath: '../.env' })
  const io = {
    ...fs,
    writeFileSync(filename, ...args) {
      if (filename.includes('/runtime-env-root/') && filename.endsWith('/index.js'))
        throw new Error('inert copy failure')
      return fs.writeFileSync(filename, ...args)
    },
  }
  assert.throws(() => f.prepare(io), /inert copy failure/)
  assert(fs.existsSync(path.join(f.generationDirectory, 'runtime-materialization-consumed.json')))
  assert(fs.existsSync(path.join(f.generationDirectory, 'runtime-materialization-failure.json')))
  assert(fs.existsSync(path.join(f.generationDirectory, 'runtime-env-root/client/client.js')))
  assert(fs.existsSync(path.join(f.provenance.originalDirectory, 'index.js')))
  assert(!fs.existsSync(path.join(f.generationDirectory, 'physical-client-binding.json')))
  assert.throws(() => f.prepare(), /EEXIST/)
})
test('all packet provenance, receipt, inventory and late-drift failures fence the actual admission callback', t => {
  const f = generation(t, { rootEnvPath: null }),
    { manifest, binding } = f.prepare()
  const changes = [
    m => {
      m.version = 1
    },
    m => {
      m.clientRuntimeSafe = false
    },
    m => {
      m.controllerRuntimeReviewRequired = true
    },
    m => {
      m.clientBinding.origin = 'REVIEWED_RELOCATION'
    },
    m => {
      m.clientBinding.physicalReview = {}
    },
    m => {
      m.generatedEntry += '.other'
    },
    m => {
      m.generatedFiles.pop()
    },
    m => {
      m.files = []
    },
    m => {
      m.clientBinding.bindingReceipt.sha256 = '0'.repeat(64)
    },
    m => {
      m.clientBinding.bindingReceipt.bytes++
    },
    m => {
      m.clientBinding.bindingReceipt.filename += '.missing'
    },
  ]
  for (const change of changes) {
    const altered = structuredClone(manifest)
    change(altered)
    let calls = 0
    assert.throws(() => withVerifiedPacketClient(altered, f.packet, () => calls++))
    assert.equal(calls, 0)
  }
  const receipt = binding.facts.provenance.receipts[0]
  fs.appendFileSync(receipt.filename, ' ')
  assert.throws(() => verifyPacketClient(manifest, f.packet))
})
test('external review schema, exact receipt and original/copy authority are independent', t => {
  const f = fixture(t),
    binding = inspectPhysicalClient(f)
  const receiptPath = path.join(f.root, 'binding.json')
  fs.writeFileSync(receiptPath, JSON.stringify(binding))
  const base = {
    judgment: 'ACCEPT',
    scope: 'EXACT_SOURCE8_PHYSICAL_CLIENT_BINDING',
    clientExecutionAuthorized: false,
    originalStaticReviewSha256: originalClientReviewSha256,
    copied27StaticResultReviewSha256: copiedClientReviewSha256,
    bindingReceipt: bindingFileRecord(receiptPath),
    bindingDigest: binding.digest,
    clientEntry: binding.facts.entry,
    envRoot: f.envRoot,
  }
  const changes = [
    r => {
      r.scope = 'OTHER'
    },
    r => {
      r.clientExecutionAuthorized = true
    },
    r => {
      r.bindingDigest = 'wrong'
    },
    r => {
      r.clientEntry += '.other'
    },
    r => {
      r.envRoot = f.root
    },
    r => {
      r.originalStaticReviewSha256 = 'wrong'
    },
    r => {
      r.copied27StaticResultReviewSha256 = 'wrong'
    },
    r => {
      r.bindingReceipt.sha256 = '0'.repeat(64)
    },
    () => {},
  ]
  for (let index = 0; index < changes.length; index++) {
    const review = structuredClone(base)
    changes[index](review)
    const filename = path.join(f.root, 'review-' + index + '.json')
    fs.writeFileSync(filename, JSON.stringify(review))
    assert.throws(() => readReviewedClientBinding(bindingFileRecord(filename)))
  }
})

test('byte membership projects actual fields without mutating input or conflating physical metadata', () => {
  const rows = [
    { filename: '/b', sha256: 'b', bytes: 2, ino: 17, mode: 0o600 },
    { filename: '/a', sha256: 'a', bytes: 1, ino: 18, mode: 0o644 },
  ]
  const before = structuredClone(rows)
  assert.deepEqual(sourceClientByteMembership(rows), [
    { filename: '/a', sha256: 'a', bytes: 1 },
    { filename: '/b', sha256: 'b', bytes: 2 },
  ])
  assert.deepEqual(rows, before)
  assert.notDeepEqual(sourceClientByteMembership(rows), sourceClientByteMembership([{ ...rows[0], bytes: 3 }, rows[1]]))
})
