import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundle11, prepareNativePatch11 } from '../m06-native-patch-11.mjs'
import { applyExactPatch, defaultBundle } from '../m06-native-patch-10.mjs'

function requireUpstreamSource(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value))
    throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must be a nonempty absolute path to the accepted authentic Git input')
  return value
}
const upstreamSource = requireUpstreamSource(process.env.APPRAISE_M06_UPSTREAM_SOURCE)

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const source = upstreamSource
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const expected = [
  'codex-rs/core/src/client_common.rs',
  'codex-rs/core/src/client_common_tests.rs',
  'codex-rs/core/src/session/turn.rs',
  'codex-rs/core/src/session/turn_tests.rs',
  'codex-rs/core/src/turn_timing.rs',
]

test('full additive bundle11 applies exactly to original pin and declares unexecuted Rust', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle11, 'manifest.json')))
  const original = JSON.parse(fs.readFileSync(path.join(defaultBundle, 'manifest.json')))
  assert.equal(manifest.status, 'CANDIDATE_COMPILE_UNVERIFIED')
  assert.equal(manifest.sourceRevision, '4ebc485ca321243727539187169425fcf972f2c4')
  assert.deepEqual(manifest.changedPaths, expected)
  assert.deepEqual(manifest.copiedPinnedSymlink, original.copiedPinnedSymlink)
  assert.equal(manifest.verification.rustCompilation, 'UNEXECUTED')
  assert.equal(manifest.verification.rustTests, 'UNEXECUTED')
  assert.equal(manifest.verification.rustFormatting, 'UNEXECUTED')
  assert.equal(manifest.verification.nativeExecution, false)
  assert.equal(manifest.verification.runtimeQualified, false)
  const patch = fs.readFileSync(path.join(bundle11, 'ordinary-cancel-v1.patch'))
  assert.equal(sha256(patch), manifest.patchSha256)
  const inputs = new Map(expected.map(name => [name, fs.readFileSync(path.join(source, name))]))
  const modes = new Map(manifest.files.map(file => [file.path, file.preimage.mode]))
  const outputs = applyExactPatch(patch, inputs, expected, modes)
  for (const file of manifest.files) {
    assert.equal(sha256(inputs.get(file.path)), file.preimage.sha256)
    assert.equal(sha256(outputs.get(file.path)), file.postimage.sha256)
    assert.equal(file.preimage.mode, '100644')
    assert.equal(file.postimage.mode, file.preimage.mode)
  }
  // Applicability/source inventory only, never substitutes for Rust compilation.
  assert.notEqual(manifest.patchSha256, original.patchSha256)
})

test('wrapper11 retains generic new-destination, symlink and invalid-source refusals', () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-wrapper11-refusals-'))
  try {
    assert.throws(() => prepareNativePatch11({ source, destination: directory }), /destination must be new/)
    const alias = path.join(directory, 'source-alias')
    fs.symlinkSync(source, alias)
    assert.throws(
      () => prepareNativePatch11({ source: alias, destination: path.join(directory, 'candidate') }),
      /symlink/,
    )
    const invalid = path.join(directory, 'invalid-source')
    fs.mkdirSync(invalid)
    assert.throws(
      () => prepareNativePatch11({ source: invalid, destination: path.join(directory, 'candidate') }),
      /git source inspection failed/,
    )
    assert.equal(fs.existsSync(path.join(directory, 'candidate')), false)
    const cli = spawnSync(process.execPath, [path.join(root, 'scripts/m06-native-patch-11.mjs')], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    assert.match(cli.stderr, /usage:/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('wrapper selects bundle11 even if caller supplies bundle10; actual complete copy retained', t => {
  const predecessorPaths = [
    'scripts/m06-native-patch-10.mjs',
    'scripts/tests/m06-native-patch-10.test.mjs',
    'tasks/codex-app-server-journeys/m06-native-patch-10/manifest.json',
    'tasks/codex-app-server-journeys/m06-native-patch-10/ordinary-cancel-v1.patch',
    'tasks/codex-app-server-journeys/m06-native-patch-10/README.md',
  ]
  const before = predecessorPaths.map(name => sha256(fs.readFileSync(path.join(root, name))))
  const retained = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-native-real-copy-test-11-'))
  const destination = path.join(retained, 'candidate'),
    receipt = path.join(retained, 'receipt.json')
  const result = prepareNativePatch11({ source, destination, receipt, bundle: defaultBundle })
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle11, 'manifest.json')))
  assert.equal(result.patchSha256, manifest.patchSha256)
  assert.equal(result.status, 'CANDIDATE_COMPILE_UNVERIFIED')
  assert.equal(result.copiedTrackedFiles, 9176)
  assert.equal(result.nativeExecution, false)
  assert.equal(result.runtimeQualified, false)
  assert.equal(fs.readlinkSync(path.join(destination, manifest.copiedPinnedSymlink.path)), 'COPYING')
  for (const file of manifest.files)
    assert.equal(sha256(fs.readFileSync(path.join(destination, file.path))), file.postimage.sha256)
  assert.deepEqual(
    predecessorPaths.map(name => sha256(fs.readFileSync(path.join(root, name)))),
    before,
  )
  assert.throws(
    () => prepareNativePatch11({ source, destination, receipt }),
    /destination must be new|receipt must be new/,
  )
  t.diagnostic(
    JSON.stringify({ retained, receipt, copiedTrackedFiles: result.copiedTrackedFiles, rustTests: 'UNEXECUTED' }),
  )
})
