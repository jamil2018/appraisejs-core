import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { dispatchMatrixEntrypoint as dispatchR19 } from './fixtures/codex-app-server-m02-ta-matrix-r19/entrypoint.mjs'
import { verifyConsumedR19 } from './fixtures/codex-app-server-m02-ta-matrix-r20/prior-evidence.mjs'
import { prepareR20MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r20/manifest.mjs'

const repo = process.cwd()
const evidence = path.join(repo, '.appraisejs')
const r19Entry = path.join(repo, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r19/entrypoint.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test('original R19 receipt bytes reproduce the consumed review refusal without hash spoofing', async () => {
  const [manifestBytes, reviewBytes, decisionBytes, entryBytes] = await Promise.all([
    fs.readFile(path.join(evidence, 'm02-ta-matrix-build-r19/manifest.json')),
    fs.readFile(path.join(evidence, 'm02-t2-r19-exact-review.json')),
    fs.readFile(path.join(evidence, 'm02-t2-r19-recovery-user-decision.json')),
    fs.readFile(r19Entry),
  ])
  const envelope = JSON.parse(manifestBytes)
  const review = JSON.parse(reviewBytes)
  const decision = JSON.parse(decisionBytes)
  assert.equal(sha(manifestBytes), '2c04717e51e0c0a5b19060b35e13457c407ad8942db9bf797c27b3401de4c8b0')
  assert.equal(sha(reviewBytes), '665c347237c012e98316762f92a22979958663ac02eb5a302a2dd4b07e4a210c')
  assert.equal(sha(decisionBytes), 'c59f3453327cc87565fc2d227413e6b53a6542baa1ad9d27fb6f2190d326cacb')
  assert.deepEqual(review.preflightEvidence, envelope.manifest.preflightEvidence)
  assert.notEqual(JSON.stringify(review.preflightEvidence), JSON.stringify(envelope.manifest.preflightEvidence))
  const counts = { host: 0, prior: 0, addon: 0, run: 0 }
  const args = [
    '--run',
    path.join(evidence, 'm02-ta-matrix-build-r19/manifest.json'),
    envelope.manifestDigest,
    sha(manifestBytes),
    sha(reviewBytes),
    sha(decisionBytes),
  ]
  await assert.rejects(
    dispatchR19(args, {
      environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
      execPath: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
      programPath: r19Entry,
      cwd: repo,
      verify: async () => ({
        manifest: envelope.manifest,
        manifestDigest: envelope.manifestDigest,
        manifestFileSha256: sha(manifestBytes),
        blockers: [],
        seal: { offlineFixture: true },
      }),
      sourceSha256: async () => sha(entryBytes),
      readReview: async () => ({ receipt: review, sha256: sha(reviewBytes) }),
      readDecision: async () => ({ receipt: decision, sha256: sha(decisionBytes) }),
      verifyHostFile: async () => {
        counts.host++
      },
      verifyPrior: async () => {
        counts.prior++
      },
      loadAddon: async () => {
        counts.addon++
      },
      run: async () => {
        counts.run++
      },
    }),
    /independent exact R19 review absent or changed/,
  )
  assert.deepEqual(counts, { host: 0, prior: 0, addon: 0, run: 0 })
})

test('R20 prior and pure derivation refuse missing retained artifact pins', async () => {
  const missing = '/private/tmp/appraise-m02-ta-matrix-p1/cases/B01/supervisor/script-plan.json'
  await assert.rejects(fs.lstat(missing), { code: 'ENOENT' })
  await assert.rejects(verifyConsumedR19(), { code: 'ENOENT' })
  await assert.rejects(prepareR20MatrixManifest(), /ENOENT|installed Code Mode host metadata drift/)
})
