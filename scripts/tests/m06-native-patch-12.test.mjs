import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareExactNativeBundle12, prepareNativePatch12, bundle12 } from '../m06-native-patch-12.mjs'
import { bundle11 } from '../m06-native-patch-11.mjs'

function requireUpstreamSource(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value))
    throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must be a nonempty absolute path to the accepted authentic Git input')
  return value
}
const upstreamSource = requireUpstreamSource(process.env.APPRAISE_M06_UPSTREAM_SOURCE)

const source = upstreamSource
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
function fixture() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-exact12-test-'))
  const bundle = path.join(root, 'bundle')
  fs.mkdirSync(bundle)
  fs.mkdirSync(path.join(bundle, 'existing'))
  for (const name of ['manifest.json', 'ordinary-cancel-v1.patch'])
    fs.copyFileSync(path.join(bundle11, name), path.join(bundle, 'existing', name))
  const existing = JSON.parse(fs.readFileSync(path.join(bundle, 'existing/manifest.json')))
  const additions = ['a', 'b'].map(name => {
    const relative = `codex-rs/http-client/src/m06_fixture_${name}.rs`
    const payload = `additions/${relative}`
    const bytes = Buffer.from(`// exact offline fixture ${name}\n`)
    fs.mkdirSync(path.dirname(path.join(bundle, payload)), { recursive: true })
    fs.writeFileSync(path.join(bundle, payload), bytes, { mode: 0o644 })
    return { path: relative, preimage: 'ABSENT', mode: '100644', length: bytes.length, sha256: sha(bytes), payload }
  })
  const manifest = {
    version: 2,
    status: 'CANDIDATE_COMPILE_UNVERIFIED',
    sourceRevision: existing.sourceRevision,
    sourceTree: existing.sourceTree,
    existingManifestSha256: sha(fs.readFileSync(path.join(bundle, 'existing/manifest.json'))),
    additions,
  }
  const save = () =>
    fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 })
  save()
  return {
    root,
    bundle,
    manifest,
    save,
    destination: path.join(root, 'candidate'),
    receipt: path.join(root, 'final.json'),
  }
}
const prepare = f => prepareExactNativeBundle12({ ...f, source })

test('dual stage validates full original inventory plus ABSENT additions and final receipt', t => {
  const f = fixture()
  t.diagnostic(`retained exact fixture: ${f.root}`)
  const r = prepare(f)
  assert.equal(r.sourceFileCount, 9178)
  assert.equal(r.sourceInventory.length, 9178)
  assert.equal(r.sourceInventoryOrder, 'ASCII_PATH')
  assert.equal(r.sourceInventorySha256, sha(JSON.stringify(r.sourceInventory)))
  assert.equal(r.intermediate.scope, 'INTERMEDIATE_EXISTING_FILES_ONLY')
  assert.equal(r.intermediate.copiedTrackedFiles, 9176)
  assert.equal(JSON.parse(fs.readFileSync(r.intermediate.scopeReceipt)).scope, 'INTERMEDIATE_EXISTING_FILES_ONLY')
  assert.equal(sha(fs.readFileSync(r.intermediate.scopeReceipt)), r.intermediate.scopeReceiptSha256)
  assert.equal(r.intermediate.sha256, sha(fs.readFileSync(r.intermediate.receipt)))
  assert.equal(r.preparationMetadata.scope, 'GENERIC10_EXISTING_STAGE_ONLY')
  assert.equal(
    r.sourceInventory.some(entry => entry.path === 'M06-PREPARATION-STATUS.json'),
    false,
  )
  assert.equal(r.sourceInventory.filter(entry => entry.mode === '120000').length, 1)
  assert.equal(r.rustCompilation, 'UNEXECUTED')
  assert.equal(r.nativeExecution, false)
  assert.equal(r.runtimeQualified, false)
  assert.deepEqual(JSON.parse(fs.readFileSync(f.receipt)), r)
  for (const entry of f.manifest.additions)
    assert.equal(sha(fs.readFileSync(path.join(f.destination, entry.path))), entry.sha256)
  assert.throws(() => prepare(f), /already exists/)
})

for (const [name, mutate] of [
  ['duplicate addition', f => f.manifest.additions.push({ ...f.manifest.additions[0] })],
  ['nonABSENT', f => (f.manifest.additions[0].preimage = 'PRESENT')],
  ['unsafe traversal', f => (f.manifest.additions[0].path = '../escape.rs')],
  ['absolute path', f => (f.manifest.additions[0].path = '/escape.rs')],
  ['unsafe mode', f => (f.manifest.additions[0].mode = '100755')],
  ['payload digest drift', f => (f.manifest.additions[0].sha256 = '0'.repeat(64))],
  ['payload alias', f => (f.manifest.additions[0].payload = f.manifest.additions[1].payload)],
  ['nested manifest drift', f => (f.manifest.existingManifestSha256 = '0'.repeat(64))],
  ['tracked addition', f => (f.manifest.additions[0].path = 'codex-rs/http-client/src/lib.rs')],
  ['undeclared payload', f => fs.writeFileSync(path.join(f.bundle, 'additions/extra.rs'), '// extra\n')],
  [
    'payload symlink',
    f => {
      const p = path.join(f.bundle, f.manifest.additions[0].payload)
      fs.unlinkSync(p)
      fs.symlinkSync(path.join(f.bundle, f.manifest.additions[1].payload), p)
    },
  ],
])
  test(`preflight refuses ${name} without allocating destination`, () => {
    const f = fixture()
    mutate(f)
    f.save()
    assert.throws(() => prepare(f))
    assert.equal(fs.existsSync(f.destination), false)
    assert.equal(fs.existsSync(f.receipt), false)
  })

test('short addition write retains failed destination/intermediate and never emits final receipt', t => {
  const f = fixture()
  t.diagnostic(`retained failed attempt: ${f.root}`)
  const write = fs.writeSync
  const open = fs.openSync
  let additionFd
  fs.openSync = (name, ...args) => {
    const fd = open(name, ...args)
    if (name === path.join(f.destination, f.manifest.additions[0].path) && args[0] & fs.constants.O_EXCL)
      additionFd = fd
    return fd
  }
  fs.writeSync = (fd, bytes, offset, length) => write(fd, bytes, offset, fd === additionFd ? length - 1 : length)
  try {
    assert.throws(() => prepare(f), /short addition\/receipt write/)
  } finally {
    fs.writeSync = write
    fs.openSync = open
  }
  assert.equal(fs.existsSync(f.destination), true)
  assert.equal(fs.existsSync(f.receipt + '.existing.json'), true)
  assert.equal(
    JSON.parse(fs.readFileSync(f.receipt + '.existing-scope.json')).scope,
    'INTERMEDIATE_EXISTING_FILES_ONLY',
  )
  assert.equal(fs.existsSync(f.receipt), false)
  assert.throws(() => prepare(f), /already exists/)
})

test('fixed wrapper never accepts caller bundle override or existing output', () => {
  const f = fixture()
  fs.writeFileSync(f.receipt, 'consumed\n')
  assert.throws(() => prepareNativePatch12({ ...f, source, bundle: f.bundle }), /already exists/)
  assert.match(bundle12, /m06-native-patch-12$/)
})

function physicalLeaf(absolute, relative, stat) {
  const bytes = stat.isSymbolicLink() ? fs.readlinkSync(absolute, { encoding: 'buffer' }) : fs.readFileSync(absolute)
  return {
    path: relative,
    mode: stat.isSymbolicLink() ? '120000' : `100${(stat.mode & 0o777).toString(8)}`,
    length: bytes.length,
    sha256: sha(bytes),
  }
}
function capturePhysicalPath(root, relative, entries) {
  const absolute = path.join(root, relative)
  const stat = fs.lstatSync(absolute)
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const name of fs.readdirSync(absolute).sort()) capturePhysicalPath(root, relative + '/' + name, entries)
  } else entries.push(physicalLeaf(absolute, relative, stat))
}
function physicalInventory(root, omittedRootNames) {
  const entries = []
  for (const name of fs
    .readdirSync(root)
    .filter(name => !omittedRootNames.includes(name))
    .sort())
    capturePhysicalPath(root, name, entries)
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
const identity = ({ path, mode, sha256 }) => ({ path, mode, sha256 })
function expectedFixed12Identities(originals, existing, additions) {
  const entries = new Map(originals.map(entry => [entry.path, identity(entry)]))
  for (const item of existing.files) entries.set(item.path, { path: item.path, ...item.postimage })
  for (const item of additions) entries.set(item.path, identity(item))
  return [...entries.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
test('fixed12 prepares all eight additions with exact full-source commitments and retained output', t => {
  const originals = physicalInventory(source, ['.git'])
  assert.equal(originals.length, 9176)
  const manifestBytes = fs.readFileSync(path.join(bundle12, 'manifest.json'))
  const manifest = JSON.parse(manifestBytes)
  const existing = JSON.parse(fs.readFileSync(path.join(bundle12, 'existing/manifest.json')))
  const expected = expectedFixed12Identities(originals, existing, manifest.additions)
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-fixed12-source-only-'))
  t.diagnostic(`retained fixed12 source-only assembly: ${root}`)
  const options = {
    source,
    destination: path.join(root, 'candidate'),
    receipt: path.join(root, 'receipt.json'),
    bundle: bundle11,
  }
  const result = prepareNativePatch12(options)
  const physical = physicalInventory(options.destination, ['M06-PREPARATION-STATUS.json'])
  assert.equal(result.manifestSha256, sha(manifestBytes))
  assert.equal(result.sourceFileCount, 9184)
  assert.equal(result.additions.length, 8)
  assert.deepEqual(physical.map(identity), expected)
  assert.deepEqual(result.sourceInventory, physical)
  assert.equal(result.sourceInventorySha256, sha(JSON.stringify(physical)))
  assert.deepEqual(physicalInventory(source, ['.git']), originals)
  assert.equal(result.rustCompilation, 'UNEXECUTED')
  assert.equal(result.rustTests, 'UNEXECUTED')
  assert.equal(result.nativeExecution, false)
  assert.equal(result.runtimeQualified, false)
  assert.deepEqual(JSON.parse(fs.readFileSync(options.receipt)), result)
  assert.throws(() => prepareNativePatch12(options), /already exists/)
})
