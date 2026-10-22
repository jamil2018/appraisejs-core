import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { bundle15, prepareNativePatch15 } from '../m06-native-patch-15.mjs'
import { bundle12 } from '../m06-native-patch-12.mjs'

function requireUpstreamSource(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value))
    throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must be a nonempty absolute path to the accepted authentic Git input')
  return value
}
const upstreamSource = requireUpstreamSource(process.env.APPRAISE_M06_UPSTREAM_SOURCE)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const expectedInventorySha256 = 'd881bb6861f6b9b7cc6f1fe8b78235b45797d6ea79743ca4ef62530ab6176c44'
const expectedManifestSha256 = 'eb5513735db44cc95e434a6c050f96b739f7fa9621f76d372fac1111d13583e8'
const expectedPatchSha256 = 'aec612fd2cbc45f809f23b367ef48322d4f489b1d9f24c3b45a9353c71127502'

test('native15 source input is mandatory, explicit and absolute', () => {
  for (const value of [undefined, '', ' ', 'relative/source'])
    assert.throws(() => requireUpstreamSource(value), /APPRAISE_M06_UPSTREAM_SOURCE/)
  assert.equal(requireUpstreamSource(upstreamSource), upstreamSource)
})

test('fixed15 assembles all accepted production bytes, preserves input and retains consumed output', t => {
  const manifestBytes = fs.readFileSync(path.join(bundle15, 'manifest.json'))
  const manifest = JSON.parse(manifestBytes)
  const inventoryBytes = fs.readFileSync(path.join(bundle15, 'source-inventory.json'))
  const expected = JSON.parse(inventoryBytes)
  assert.equal(hash(manifestBytes), expectedManifestSha256)
  assert.equal(expected.leaves, 9184)
  assert.equal(expected.inventorySha256, expectedInventorySha256)
  assert.equal(hash(JSON.stringify(expected.files)), expectedInventorySha256)
  assert.equal(manifest.status, 'CANDIDATE_COMPILE_UNVERIFIED')
  assert.equal(manifest.verification.rustCompilation, 'UNEXECUTED')
  assert.equal(manifest.verification.rustTests, 'UNEXECUTED')
  assert.equal(manifest.verification.rustFormatting, 'UNEXECUTED')
  assert.equal(manifest.verification.runtimeQualified, false)
  assert.equal(manifest.additions.length, 8)
  const existing = JSON.parse(fs.readFileSync(path.join(bundle15, 'existing/manifest.json')))
  const link = existing.copiedPinnedSymlink
  assert.equal(fs.readlinkSync(path.join(upstreamSource, link.path)), 'COPYING')
  const originalCopying = fs.readFileSync(path.join(upstreamSource, link.targetPath))
  assert.equal(hash(originalCopying), link.targetSha256)
  const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-fixed15-source-only-'))
  t.diagnostic(`retained source-only assembly15: ${temp}`)
  const options = {
    source: upstreamSource,
    destination: path.join(temp, 'candidate'),
    receipt: path.join(temp, 'receipt.json'),
    bundle: bundle12,
  }
  const result = prepareNativePatch15(options)
  assert.match(bundle15, /m06-native-patch-15$/)
  assert.equal(result.manifestSha256, expectedManifestSha256)
  assert.equal(result.existingPatchSha256, expectedPatchSha256)
  assert.equal(result.sourceRevision, '4ebc485ca321243727539187169425fcf972f2c4')
  assert.equal(result.sourceTree, '0cab0734fd471b47b59ecc4d7b257ab5034aad77')
  assert.equal(result.sourceFileCount, 9184)
  assert.equal(result.sourceInventorySha256, expectedInventorySha256)
  assert.deepEqual(result.sourceInventory, expected.files)
  assert.equal(result.nativeExecution, false)
  assert.equal(result.runtimeQualified, false)
  for (const name of ['rustCompilation', 'rustTests', 'rustFormatting']) assert.equal(result[name], 'UNEXECUTED')
  const physical = []
  function appendPhysicalLeaf(absolute, relative, stat) {
    if (relative === 'M06-PREPARATION-STATUS.json') return
    const bytes = stat.isSymbolicLink() ? fs.readlinkSync(absolute, { encoding: 'buffer' }) : fs.readFileSync(absolute)
    physical.push({
      path: relative,
      mode: stat.isSymbolicLink() ? '120000' : `100${(stat.mode & 0o777).toString(8)}`,
      length: bytes.length,
      sha256: hash(bytes),
    })
  }
  function walk(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix + name
      const absolute = path.join(directory, name)
      const stat = fs.lstatSync(absolute)
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(absolute, relative + '/')
      else appendPhysicalLeaf(absolute, relative, stat)
    }
  }
  walk(options.destination)
  physical.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  assert.deepEqual(physical, expected.files)
  for (const addition of manifest.additions) {
    const bytes = fs.readFileSync(path.join(options.destination, addition.path))
    assert.equal(hash(bytes), addition.sha256)
    assert.equal(bytes.length, addition.length)
    assert.deepEqual(bytes, fs.readFileSync(path.join(bundle15, addition.payload)))
  }
  assert.equal(fs.readlinkSync(path.join(options.destination, link.path)), 'COPYING')
  assert.deepEqual(fs.readFileSync(path.join(options.destination, link.targetPath)), originalCopying)
  assert.equal(fs.readlinkSync(path.join(upstreamSource, link.path)), 'COPYING')
  assert.deepEqual(fs.readFileSync(path.join(upstreamSource, link.targetPath)), originalCopying)
  assert.deepEqual(JSON.parse(fs.readFileSync(options.receipt)), result)
  assert.throws(() => prepareNativePatch15(options), /already exists/)
})
