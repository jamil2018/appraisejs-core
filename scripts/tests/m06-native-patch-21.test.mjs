import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { bundle21, prepareNativePatch21 } from '../m06-native-patch-21.mjs'

const source = process.env.APPRAISE_M06_UPSTREAM_SOURCE
if (typeof source !== 'string' || !source.trim() || !path.isAbsolute(source))
  throw new Error('APPRAISE_M06_UPSTREAM_SOURCE must explicitly name the absolute accepted authentic Git input')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const json = relative => JSON.parse(fs.readFileSync(path.join(bundle21, relative)))

test('native21 fixed bundle has exact inventory, preserves artifact15 and retains consumed assembly', t => {
  const inventory = json('source-inventory.json')
  const provenance = json('inventory-provenance.json')
  assert.equal(
    digest(fs.readFileSync(path.join(bundle21, 'manifest.json'))),
    '45208f9a209649c72baf42372914b864e102e7a30489bf7122e7e1ceb40fec09',
  )
  assert.equal(
    digest(fs.readFileSync(path.join(bundle21, 'existing/ordinary-cancel-v1.patch'))),
    'd03811c2b05c7cb1526d66e0936df9ea0d9f1b1d67c50605e04ddcb3ed9c0c80',
  )
  assert.equal(inventory.leaves, 9184)
  assert.equal(inventory.inventorySha256, 'd53f1e7bcc3a13fa9a98d33e918a90dd714febd3a64d89b42e861dc78ee7fb0d')
  assert.equal(digest(JSON.stringify(inventory.files)), inventory.inventorySha256)
  assert.deepEqual(
    [provenance.inspectedCurrentLeaves, provenance.rootNpmrcPayloadRead, provenance.inheritedEntry],
    [9183, false, inventory.files.find(row => row.path === '.npmrc')],
  )
  assert.equal(
    digest(fs.readFileSync(path.join(bundle21, 'prior-artifact-pins.json'))),
    '4be9fca4f52d96d0cbce6e03e8ebe4ee298af60c10c49d9b89bdc631ca35afe2',
  )
  const prior = json('prior-artifact-pins.json')
  const priorRoot = path.resolve(bundle21, '../m06-native-patch-15')
  const expectedPrior = prior.files.map(row => [row.path, row.bytes, row.sha256])
  const measurePrior = () =>
    prior.files.map(row => {
      const bytes = fs.readFileSync(path.join(priorRoot, row.path))
      return [row.path, bytes.length, digest(bytes)]
    })
  assert.deepEqual(measurePrior(), expectedPrior)
  const output = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'm06-native21-source-only-'))
  t.diagnostic(`retained exact source assembly: ${output}`)
  const options = {
    source,
    destination: path.join(output, 'source'),
    receipt: path.join(output, 'receipt.json'),
    bundle: priorRoot,
  }
  const result = prepareNativePatch21(options)
  assert.deepEqual(
    [result.manifestSha256, result.existingPatchSha256, result.sourceInventorySha256],
    [
      '45208f9a209649c72baf42372914b864e102e7a30489bf7122e7e1ceb40fec09',
      'd03811c2b05c7cb1526d66e0936df9ea0d9f1b1d67c50605e04ddcb3ed9c0c80',
      'd53f1e7bcc3a13fa9a98d33e918a90dd714febd3a64d89b42e861dc78ee7fb0d',
    ],
  )
  assert.deepEqual(
    [result.sourceRevision, result.sourceTree, result.sourceFileCount],
    ['4ebc485ca321243727539187169425fcf972f2c4', '0cab0734fd471b47b59ecc4d7b257ab5034aad77', 9184],
  )
  assert.deepEqual(result.sourceInventory, inventory.files)
  assert.deepEqual(
    [result.rustCompilation, result.rustTests, result.rustFormatting, result.nativeExecution, result.runtimeQualified],
    ['UNEXECUTED', 'UNEXECUTED', 'UNEXECUTED', false, false],
  )
  assert.deepEqual(JSON.parse(fs.readFileSync(options.receipt)), result)
  assert.throws(() => prepareNativePatch21(options), /already exists/)
  assert.deepEqual(measurePrior(), expectedPrior)
  assert.deepEqual(JSON.parse(fs.readFileSync(options.receipt)), result)
})
