import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { digest, POLICY } from './fixtures/codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { MATRIX_MANIFEST } from './fixtures/codex-app-server-m02-ta-matrix-r10/preparation.mjs'
import {
  dispatchMatrixEntrypoint,
  reviewedHostEnvironment,
} from './fixtures/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs'

const entrypoint = fileURLToPath(
  new URL('./fixtures/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs', import.meta.url),
)
const baseEntrypoint = fileURLToPath(
  new URL('./fixtures/codex-app-server-m02-ta-matrix-r10/entrypoint.mjs', import.meta.url),
)
const node = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const reviewSha256 = 'c'.repeat(64)
const cases = POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id)
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const baseEnvelope = JSON.parse(readFileSync(MATRIX_MANIFEST, 'utf8'))
const manifestFileSha256 = sha(MATRIX_MANIFEST)
const boundArtifacts = () => ({
  'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs': sha(entrypoint),
  'scripts/tests/codex-app-server-m02-ta-matrix-entrypoint-r11.test.mjs': sha(fileURLToPath(import.meta.url)),
  '.appraisejs/m02-t2-r10-preflight-review-01.json': 'f15fa36845e551aa07250438fd8b5cea5189270f885a0c1d7c6f4ead35826144',
  '.appraisejs/m02-t2-r10-preflight-evidence-01.json':
    '3b7a7f78d1bbfb957deac4166898baf995c4a3ad69ff749d600ea03769e3f589',
})

function fixture() {
  const calls = []
  const manifest = structuredClone(baseEnvelope.manifest)
  const manifestDigest = digest(manifest)
  assert.equal(manifestDigest, '69f6c17a7d1e0fddb3d2662b0ab6c5aaf1e125f38daca6b454e3cb3432235120')
  assert.equal(manifestFileSha256, '603d50d5b9afb3fb051d293e88fef87dfb68ef621dc0daac5b97e7a9ba4f7a7a')
  assert.ok(manifest.artifacts.some(item => item.path === baseEntrypoint))
  const prepared = {
    manifest,
    manifestDigest,
    manifestFileSha256,
    blockers: [],
    seal: {},
  }
  const receipt = {
    schema: 'appraise.m02-ta-t2-r11-exact-review/v1',
    reviewer: '/root/r6_exact_review',
    verdict: 'ACCEPT_ONE_FIXED_T2_R11_INVOCATION',
    runtimeVerdict: 'NOT_RUN',
    exactInvocationPrefix: [
      '/usr/bin/env',
      '-i',
      'PATH=/usr/bin:/bin',
      'LANG=C',
      node,
      entrypoint,
      '--run',
      MATRIX_MANIFEST,
      manifestDigest,
      manifestFileSha256,
    ],
    manifest: {
      path: MATRIX_MANIFEST,
      fileSha256: manifestFileSha256,
      manifestDigest,
      phase: 'T2',
      root: POLICY.roots.T2,
      cases,
    },
    boundArtifacts: boundArtifacts(),
  }
  let currentReview = { receipt, sha256: reviewSha256 }
  let runOptions
  const ports = {
    environment: { PATH: '/usr/bin:/bin', LANG: 'C' },
    execPath: node,
    programPath: entrypoint,
    verify: async () => {
      calls.push('verify')
      return prepared
    },
    readReview: async () => {
      calls.push('review')
      return currentReview
    },
    loadAddon: async () => {
      calls.push('addon')
      return { identity() {}, listDirectChildren() {}, directChildMetadata() {} }
    },
    run: async options => {
      calls.push('run')
      runOptions = options
      return { status: 'FAKE_ONLY', runtimeQualified: false }
    },
  }
  return {
    calls,
    ports,
    prepared,
    receipt,
    args: ['--run', MATRIX_MANIFEST, manifestDigest, manifestFileSha256, reviewSha256],
    options: () => runOptions,
    changeReview: value => {
      currentReview = value
    },
  }
}

test('import-inert R11 verification is read-only and never repeats R10 preparation', async () => {
  const f = fixture()
  await assert.rejects(dispatchMatrixEntrypoint(['--prepare'], f.ports), /exact --verify or --run/)
  assert.deepEqual(f.calls, [])
  const checked = await dispatchMatrixEntrypoint(['--verify'], f.ports)
  assert.equal(checked.runtimeEligible, false)
  assert.deepEqual(f.calls, ['verify'])
  await assert.rejects(dispatchMatrixEntrypoint(['--run'], f.ports), /exact --verify or --run/)
  assert.deepEqual(f.calls, ['verify'])
})

test('macOS locale metadata is the only optional clean-host environment key', async () => {
  const clean = { PATH: '/usr/bin:/bin', LANG: 'C' }
  const mac = { ...clean, __CF_USER_TEXT_ENCODING: '0x1F5:0x0:0x0' }
  assert.equal(reviewedHostEnvironment(clean), true)
  assert.equal(reviewedHostEnvironment(mac), true)
  assert.equal(reviewedHostEnvironment({ ...clean, __CF_USER_TEXT_ENCODING: '0xABCDEF12:0xA:0xF' }), true)
  for (const value of ['', '0x:0x0:0x0', '0x123456789:0x0:0x0', '0x1:0x2', '0x1:0x2:$(id)', '0x1:0x2:0x3\n'])
    assert.equal(reviewedHostEnvironment({ ...clean, __CF_USER_TEXT_ENCODING: value }), false)
  assert.equal(reviewedHostEnvironment({ ...mac, HOME: '/Users/foreign' }), false)
  assert.equal(reviewedHostEnvironment({ ...mac, PATH: '/opt/homebrew/bin' }), false)
  assert.equal(reviewedHostEnvironment({ ...mac, LANG: 'en_US.UTF-8' }), false)

  const accepted = fixture()
  accepted.ports.environment = mac
  await dispatchMatrixEntrypoint(accepted.args, accepted.ports)
  assert.deepEqual(accepted.calls, ['verify', 'review', 'addon', 'run'])
  const rejected = fixture()
  rejected.ports.environment = { ...mac, HOME: '/Users/foreign' }
  await assert.rejects(dispatchMatrixEntrypoint(rejected.args, rejected.ports), /host invocation environment changed/)
  assert.deepEqual(rejected.calls, [])
})

test('exact reviewed run verifies manifest, source, receipt, then loads addon and runner', async () => {
  const f = fixture()
  const result = await dispatchMatrixEntrypoint(f.args, f.ports)
  assert.deepEqual(result, { status: 'FAKE_ONLY', runtimeQualified: false })
  assert.deepEqual(f.calls, ['verify', 'review', 'addon', 'run'])
  assert.equal(
    await f.options().verifyExactReview({
      manifestDigest: f.prepared.manifestDigest,
      manifest: f.prepared.manifest,
    }),
    true,
  )
  assert.equal(
    await f.options().verifyExactReview({ manifestDigest: 'd'.repeat(64), manifest: f.prepared.manifest }),
    false,
  )
})

test('wrong invocation, source pin, digest, and independent review bytes fail before addon', async () => {
  for (const mutation of [
    f => {
      f.args[1] = '/tmp/arbitrary-manifest.json'
    },
    f => {
      f.args[2] = 'd'.repeat(64)
    },
    f => {
      f.args[3] = 'd'.repeat(64)
    },
    f => {
      f.args[4] = 'd'.repeat(64)
    },
    f => {
      f.receipt.reviewer = '/root/producer'
    },
    f => {
      f.receipt.boundArtifacts['scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r11/entrypoint.mjs'] = 'd'.repeat(
        64,
      )
    },
    f => {
      f.receipt.boundArtifacts['scripts/tests/codex-app-server-m02-ta-matrix-entrypoint-r11.test.mjs'] = 'd'.repeat(64)
    },
    f => {
      f.receipt.boundArtifacts['.appraisejs/m02-t2-r10-preflight-review-01.json'] = 'd'.repeat(64)
    },
    f => {
      f.receipt.boundArtifacts['.appraisejs/m02-t2-r10-preflight-evidence-01.json'] = 'd'.repeat(64)
    },
    f => {
      f.receipt.boundArtifacts['/tmp/unreviewed'] = 'd'.repeat(64)
    },
    f => {
      f.receipt.exactInvocationPrefix[7] = '/tmp/arbitrary-manifest.json'
    },
    f => {
      f.prepared.manifest.artifacts[0].path = '/tmp/foreign-base-entrypoint.mjs'
    },
    f => {
      f.ports.environment.HOME = '/Users/foreign'
    },
    f => {
      f.ports.environment.__CF_USER_TEXT_ENCODING = '0x1:0x2:garbage'
    },
    f => {
      f.ports.execPath = '/tmp/foreign-node'
    },
    f => {
      f.ports.programPath = '/tmp/foreign-entrypoint.mjs'
    },
  ]) {
    const f = fixture()
    mutation(f)
    await assert.rejects(dispatchMatrixEntrypoint(f.args, f.ports), /T2 entrypoint/)
    assert.equal(f.calls.includes('addon'), false)
    assert.equal(f.calls.includes('run'), false)
  }
})

test('per-effect authority rechecks receipt and binds ordered case and known effect IDs', async () => {
  const f = fixture()
  await dispatchMatrixEntrypoint(f.args, f.ports)
  const { authorize } = f.options()
  const input = (action, id, manifest = f.prepared.manifest) => ({
    action,
    id,
    manifestDigest: f.prepared.manifestDigest,
    manifest,
  })
  assert.equal(await authorize(input('owned-loopback-listener', 'B02-listener')), false)
  assert.equal(await authorize(input('owned-loopback-listener', 'B01-listener')), true)
  assert.equal(await authorize(input('owned-loopback-listener', 'B01-listener')), false)
  assert.equal(await authorize(input('owned-loopback-listener', 'B02-listener')), false)
  assert.equal(await authorize(input('private-synthetic-bootstrap', 'B02-bootstrap')), false)
  assert.equal(await authorize(input('private-synthetic-bootstrap', 'B01-bootstrap')), true)
  assert.equal(await authorize(input('codex-child', 'B01-codex')), true)
  assert.equal(await authorize(input('owned-stdio-send', 'B01-initialize')), true)
  assert.equal(await authorize(input('owned-stdio-send', 'B01-initialize-initialized')), true)
  assert.equal(await authorize(input('owned-stdio-send', 'B01-thread-start')), true)
  assert.equal(await authorize(input('owned-stdio-send', 'B01-turn-start')), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'B02-listener-canonical-1')), false)
  assert.equal(await authorize(input('canonical-ipc-request', 'B01-listener-canonical-2')), false)
  assert.equal(await authorize(input('canonical-ipc-request', 'B01-listener-canonical-1')), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'B01-listener-canonical-1')), false)
  for (let index = 2; index <= 14; index++)
    assert.equal(await authorize(input('canonical-ipc-request', `B01-listener-canonical-${index}`)), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'B01-listener-canonical-15')), false)
  for (let index = 1; index <= 4; index++)
    assert.equal(await authorize(input('scripted-provider-request', `B01-listener-request-${index}`)), true)
  assert.equal(await authorize(input('scripted-provider-request', 'B01-listener-request-5')), false)
  for (let index = 1; index <= 6; index++)
    assert.equal(await authorize(input('scoped-audit-request', `B01-listener-audit-${index}`)), true)
  assert.equal(await authorize(input('scoped-audit-request', 'B01-listener-audit-7')), false)
  assert.equal(await authorize(input('owned-stdio-send', 'permission-foreign')), false)
  assert.equal(await authorize(input('owned-stdio-send', 'B02-turn-start')), false)
  assert.equal(await authorize(input('owned-stop')), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'B01-listener-canonical-1')), false)
  assert.equal(await authorize(input('owned-loopback-listener', 'B02-listener')), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'B02-listener-canonical-1')), true)
  for (const caseId of cases.slice(2, cases.indexOf('P00'))) {
    assert.equal(await authorize(input('owned-stop')), true)
    assert.equal(await authorize(input('owned-loopback-listener', `${caseId}-listener`)), true)
  }
  assert.equal(await authorize(input('owned-stop')), true)
  assert.equal(await authorize(input('owned-loopback-listener', 'P00-listener')), true)
  assert.equal(await authorize(input('canonical-ipc-request', 'P00-listener-canonical-1')), false)
  assert.equal(await authorize(input('scoped-audit-request', 'P00-listener-audit-1')), false)
  assert.equal(await authorize(input('scripted-provider-request', 'P00-listener-request-1')), false)
  assert.equal(await authorize(input('owned-stop')), true)
  assert.equal(await authorize(input('owned-loopback-listener', 'B14-listener')), true)
  assert.equal(await authorize(input('scoped-audit-request', 'B14-listener-audit-1')), false)
  assert.equal(await authorize(input('scripted-provider-request', 'B14-listener-request-1')), true)
  assert.equal(await authorize(input('scripted-provider-request', 'B14-listener-request-2')), true)
  assert.equal(await authorize(input('scripted-provider-request', 'B14-listener-request-3')), false)
  assert.equal(await authorize(input('owned-stdio-send', 'permission-42')), true)
  assert.equal(await authorize(input('unreviewed-effect', 'B14-anything')), false)
  assert.equal(await authorize(input('owned-stop', undefined, { ...f.prepared.manifest, root: '/tmp/foreign' })), false)
  assert.ok(f.calls.filter(item => item === 'review').length >= 20)
})

test('changed review receipt blocks later authority callback without replay', async () => {
  const f = fixture()
  await dispatchMatrixEntrypoint(f.args, f.ports)
  f.changeReview({ receipt: f.receipt, sha256: 'd'.repeat(64) })
  await assert.rejects(
    f.options().authorize({
      action: 'owned-loopback-listener',
      id: 'B01-listener',
      manifestDigest: f.prepared.manifestDigest,
      manifest: f.prepared.manifest,
    }),
    /independent exact review absent or changed/,
  )
})

test('changed R11 review artifact pin blocks a later effect before authorization', async () => {
  const f = fixture()
  await dispatchMatrixEntrypoint(f.args, f.ports)
  f.receipt.boundArtifacts['scripts/tests/codex-app-server-m02-ta-matrix-entrypoint-r11.test.mjs'] = 'd'.repeat(64)
  await assert.rejects(
    f.options().authorize({
      action: 'owned-loopback-listener',
      id: 'B01-listener',
      manifestDigest: f.prepared.manifestDigest,
      manifest: f.prepared.manifest,
    }),
    /independent exact review absent or changed/,
  )
})

test('a fake runner cannot elevate the wrapper result to runtime qualification', async () => {
  const f = fixture()
  f.ports.run = async () => ({ status: 'FAKE_ONLY', runtimeQualified: true })
  const result = await dispatchMatrixEntrypoint(f.args, f.ports)
  assert.equal(result.runtimeQualified, false)
})
