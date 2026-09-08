import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { artifactIdentity, bindReview, verifyReview } from '../lib/harness-artifact.mjs'

test('review acceptance is bound to content, deletions, untracked additions and executable mode', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-review-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  assert.equal(spawnSync('git', ['init', '-q'], { cwd }).status, 0)
  fs.writeFileSync(path.join(cwd, 'source.mjs'), 'original')
  spawnSync('git', ['add', '.'], { cwd })
  const artifact = artifactIdentity(cwd)
  const review = bindReview(artifact, {
    reviewer: 'judge',
    evidence: 'fixture',
    independent: true,
    outcome: 'accepted',
  })
  assert.equal(verifyReview(review, artifactIdentity(cwd)), true)
  fs.writeFileSync(path.join(cwd, 'source.mjs'), 'changed')
  assert.equal(verifyReview(review, artifactIdentity(cwd)), false)
  fs.writeFileSync(path.join(cwd, 'source.mjs'), 'original')
  assert.equal(verifyReview(review, artifactIdentity(cwd)), true)
  fs.writeFileSync(path.join(cwd, 'new.mjs'), 'new')
  assert.equal(verifyReview(review, artifactIdentity(cwd)), false)
  fs.unlinkSync(path.join(cwd, 'new.mjs'))
  fs.chmodSync(path.join(cwd, 'source.mjs'), 0o755)
  assert.equal(verifyReview(review, artifactIdentity(cwd)), false)
  fs.unlinkSync(path.join(cwd, 'source.mjs'))
  assert.equal(verifyReview(review, artifactIdentity(cwd)), false)
})
test('self review or missing evidence cannot create acceptance', () => {
  assert.throws(() => bindReview({}, { independent: false }), /independent/)
  assert.equal(verifyReview({}, {}), false)
})
