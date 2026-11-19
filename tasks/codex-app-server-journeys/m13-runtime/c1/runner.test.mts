import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { requiredC1TaskInputPaths } from './runner.mts'
import { createC1TaskLifetime } from './lifetime.mts'

test('C1 import is an inert explicit task and complete inventory pins its original controller', async () => {
  const surface = await import('./runner.mts')
  assert.deepEqual(Object.keys(surface).sort(), ['prepareReviewedC1Task', 'requiredC1TaskInputPaths'])
  const inputs = requiredC1TaskInputPaths(process.cwd())
  for (const name of ['runner.mts', 'runner.test.mts', 'lifetime.mts'])
    assert.ok(inputs.includes(path.join(process.cwd(), 'tasks/codex-app-server-journeys/m13-runtime/c1', name)))
})
test('C1 keeps the original parent alive after model cleanup for finite review, then disconnects/exits', context => {
  const root = mkdtempSync(path.join(tmpdir(), 'appraise-c1-lifetime-')),
    evidence = path.join(root, 'hard.json')
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let cancelled = 0,
    revoked = 0,
    disconnected = 0
  context.mock.method(process, 'exit', (code: number) => {
    assert.equal(code, 2)
    throw new Error('synthetic-parent-exit')
  })
  const lifetime = createC1TaskLifetime({
    caseMs: 10,
    cleanupMs: 5,
    control: { reviewerId: 'reviewer', nonce: 'nonce', reviewMs: 20, reconciliationMs: 5 },
    hardEvidencePath: evidence,
    cancelModel: async () => {
      cancelled++
    },
    revokeOriginal: () => {
      revoked++
    },
    disconnectOriginal: () => {
      disconnected++
      return false
    },
  })
  try {
    context.mock.timers.tick(10)
    assert.equal(cancelled, 1)
    assert.equal(disconnected, 0)
    lifetime.nativeCleanupObserved()
    context.mock.timers.tick(29)
    assert.equal(lifetime.expired(), false)
    assert.equal(disconnected, 0)
    assert.throws(() => context.mock.timers.tick(1), /synthetic-parent-exit/)
    assert.equal(lifetime.expired(), true)
    assert.equal(revoked, 1)
    assert.equal(disconnected, 1)
    assert.deepEqual(JSON.parse(readFileSync(evidence, 'utf8')), {
      outcome: 'UNKNOWN',
      consumed: true,
      nextCasePermitted: false,
    })
  } finally {
    lifetime.finish()
    rmSync(root, { recursive: true, force: true })
    context.mock.restoreAll()
    context.mock.timers.reset()
  }
})
test('C1 evidence failure cannot bypass the original disconnect and parent exit', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  let disconnected = 0
  context.mock.method(process, 'exit', () => {
    throw new Error('synthetic-emergency-exit')
  })
  const lifetime = createC1TaskLifetime({
    caseMs: 1,
    cleanupMs: 1,
    control: { reviewerId: 'reviewer', nonce: 'nonce', reviewMs: 1, reconciliationMs: 1 },
    hardEvidencePath: '/definitely/missing/parent/hard.json',
    cancelModel: async () => {},
    revokeOriginal() {},
    disconnectOriginal() {
      disconnected++
      return true
    },
  })
  try {
    assert.throws(() => context.mock.timers.tick(4), /synthetic-emergency-exit/)
    assert.equal(disconnected, 1)
  } finally {
    lifetime.finish()
    context.mock.restoreAll()
    context.mock.timers.reset()
  }
})

test('C1 manifest reader verifies exact controller inventory and refuses credential aliases before reading bytes', async () => {
  const { syntheticNativeManifest } =
    await import('../../../../src/lib/quality-journey/codex-app-server/native-qualification.test-support')
  const { readReviewedC1Manifest } = await import('./manifest.mts')
  const { writeFileSync, symlinkSync } = await import('node:fs')
  const f = syntheticNativeManifest()
  try {
    f.manifest.inputs = requiredC1TaskInputPaths(f.manifest.repositoryRoot).map(filename => ({
      path: filename,
      sha256: f.sha(readFileSync(filename)),
    }))
    const filename = path.join(f.parent, 'manifest.json'),
      bytes = JSON.stringify(f.manifest)
    writeFileSync(filename, bytes)
    const request = {
      manifestPath: filename,
      manifestSha256: f.sha(bytes),
      credentialSource: f.manifest.credentialSource,
      connectorCapability: f.capability,
    }
    assert.ok(readReviewedC1Manifest(request))
    assert.throws(
      () => readReviewedC1Manifest({ ...request, manifestSha256: '0'.repeat(64) }),
      /Exact C1 manifest bytes/,
    )
    const alias = path.join(f.parent, 'credential-alias.json')
    symlinkSync(f.credential, alias)
    assert.throws(() => readReviewedC1Manifest({ ...request, manifestPath: alias }), /topology refused/)
  } finally {
    rmSync(f.parent, { recursive: true, force: true })
  }
})
