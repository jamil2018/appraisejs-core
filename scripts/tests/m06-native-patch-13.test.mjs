import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { bundle13, prepareNativePatch13 } from '../m06-native-patch-13.mjs'
import { bundle12 } from '../m06-native-patch-12.mjs'

function requireUpstreamSource(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value))
    throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must be a nonempty absolute path to the accepted authentic Git input')
  return value
}
const upstreamSource = requireUpstreamSource(process.env.APPRAISE_M06_UPSTREAM_SOURCE)

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
test('fixed successor wrapper applies artifact13 despite caller override and retains consumed outputs', t => {
  const temp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-fixed13-test-'))
  t.diagnostic(`retained exact offline assembly: ${temp}`)
  const options = {
    source: upstreamSource,
    destination: path.join(temp, 'candidate'),
    receipt: path.join(temp, 'receipt.json'),
    bundle: bundle12,
  }
  const result = prepareNativePatch13(options)
  assert.match(bundle13, /m06-native-patch-13$/)
  assert.equal(result.manifestSha256, hash(fs.readFileSync(path.join(bundle13, 'manifest.json'))))
  assert.notEqual(result.manifestSha256, hash(fs.readFileSync(path.join(bundle12, 'manifest.json'))))
  assert.equal(result.sourceFileCount, 9184)
  assert.equal(result.additions.length, 8)
  assert.equal(result.nativeExecution, false)
  assert.equal(result.runtimeQualified, false)
  assert.equal(result.rustCompilation, 'UNEXECUTED')
  for (const addition of result.additions)
    assert.equal(hash(fs.readFileSync(path.join(options.destination, addition.path))), addition.sha256)
  assert.equal(hash(JSON.stringify(result.sourceInventory)), result.sourceInventorySha256)
  assert.throws(() => prepareNativePatch13(options), /already exists/)
  assert.deepEqual(JSON.parse(fs.readFileSync(options.receipt)), result)
})
