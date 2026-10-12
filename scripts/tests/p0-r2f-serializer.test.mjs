import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { canonicalJson, sha256 } from '../lib/p0-r2d-interlock-experiment.mjs'

for (const [name, results, tamperDigest] of [
  ['empty results', [], false],
  ['duplicate arms', Array.from({ length: 12 }, () => ({ arm: 'role-SCOUT' })), false],
  ['changed receipt digest', [], true],
]) {
  test(`serializer canary rejects ${name} before invoking Cargo`, () => {
    const root = mkdtempSync(path.join(tmpdir(), 'r2f-receipt-test-'))
    try {
      const subject = { schema: 'appraise.p0-r2f-schema-transport/v1', results }
      const receipt = path.join(root, 'receipt.json')
      writeFileSync(
        receipt,
        JSON.stringify({ ...subject, receiptSubjectSha256: tamperDigest ? 'wrong' : sha256(canonicalJson(subject)) }),
      )
      const result = spawnSync(
        'python3',
        [
          'scripts/qualify-p0-r2f-serializer.py',
          '--source',
          root,
          '--receipt',
          receipt,
          '--cargo',
          '/nonexistent-cargo-must-not-run',
          '--output',
          path.join(root, 'output.json'),
        ],
        { encoding: 'utf8' },
      )
      assert.equal(result.status, 1)
      assert.match(result.stderr, /Invalid or incomplete schema receipt/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
