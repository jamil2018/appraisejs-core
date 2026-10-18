import './fixtures/codex-app-server-m02-ta-matrix-r22-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareR22MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r22/manifest.mjs'
import {
  verifyR22HistoricalClosure,
  createNativePorts,
} from './fixtures/codex-app-server-m02-ta-matrix-r22/runtime-effects.mjs'
import { readStableFile } from './fixtures/codex-app-server-m02-ta-matrix-r22/r21-evidence.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta-matrix-r22/policy.mjs'

const fixture = await prepareR22MatrixManifest()
const actual = await verifyR22HistoricalClosure(fixture.manifest)
const witnesses = fixture.manifest.historicalAvailability.archiveWitnesses
const syntheticHistory = async () => ({ historicalSources: witnesses })
const noRetainedRead = async () => {}
const verifySynthetic = manifest =>
  verifyR22HistoricalClosure(manifest, { verifyHistory: syntheticHistory, verifyRetained: noRetainedRead })

const clone = () => structuredClone(fixture.manifest)
const historicalIndexes = fixture.manifest.artifacts.flatMap((row, index) =>
  row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' ? [index] : [],
)

test('R22 real historical closure reads all 23 trusted TA04 witnesses', () => {
  assert.equal(actual.size, 23)
  assert.equal(historicalIndexes.length, 23)
})

test('R22 rejects a changed source hash at every one of the 23 labelled rows', async t => {
  for (const index of historicalIndexes) {
    await t.test(`row ${index}`, async () => {
      const manifest = clone()
      manifest.artifacts[index].sha256 = '0'.repeat(64)
      await assert.rejects(verifySynthetic(manifest), /historical row mapping drift/)
    })
  }
})

test('R22 rejects missing, duplicated, extra and unknown historical labels', async () => {
  const missing = clone()
  delete missing.artifacts[historicalIndexes[0]].availability
  await assert.rejects(verifySynthetic(missing), /historical witness set drift/)

  const duplicate = clone()
  duplicate.artifacts[historicalIndexes[1]].path = duplicate.artifacts[historicalIndexes[0]].path
  await assert.rejects(verifySynthetic(duplicate), /historical witness set drift/)

  const extra = clone()
  extra.artifacts[0].availability = 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED'
  await assert.rejects(verifySynthetic(extra), /historical witness set drift/)

  const unknown = clone()
  unknown.artifacts[0].availability = 'UNKNOWN'
  await assert.rejects(verifySynthetic(unknown), /historical witness set drift/)
})

test('R22 rejects index, copy, byte-length and witness-set drift without touching archives', async () => {
  for (const key of ['archiveIndexSha256', 'archiveCopySha256', 'archiveBytes']) {
    const manifest = clone()
    manifest.historicalAvailability.archiveWitnesses[0][key] = key === 'archiveBytes' ? 0 : '0'.repeat(64)
    await assert.rejects(verifySynthetic(manifest), /historical witness set drift/)
  }
  const fewer = clone()
  fewer.historicalAvailability.archiveWitnesses.pop()
  await assert.rejects(verifySynthetic(fewer), /historical witness set drift/)
})

test('R22 stable no-follow reader rejects hash and symlink drift', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'appraise-r22-read-'))
  try {
    const file = join(directory, 'candidate')
    const link = join(directory, 'link')
    await fs.writeFile(file, 'trusted', { mode: 0o600 })
    const bytes = await readStableFile(file)
    assert.equal(bytes.toString(), 'trusted')
    await assert.rejects(readStableFile(file, '0'.repeat(64)), /hash or identity drift/)
    await fs.symlink(file, link)
    await assert.rejects(readStableFile(link), /identity drift/)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

function offlinePorts({ tuple, fileDigest }) {
  const counts = { uncertain: 0, listener: 0, spawn: 0 }
  const io = {
    tuple,
    fs: {
      lstat: async () => ({ isFile: () => true, isSymbolicLink: () => false }),
    },
    fileDigest,
    createServer: () => {
      counts.listener++
      throw new Error('listener unexpectedly reached')
    },
    spawn: () => {
      counts.spawn++
      throw new Error('spawn unexpectedly reached')
    },
  }
  const ports = createNativePorts({
    prepared: fixture,
    precreatedRootIdentity: { dev: 1, ino: 1 },
    authorize: async () => true,
    withReservation: async (_kind, _id, operation) => operation(),
    recordRecovery: async () => {},
    onUncertain: async () => {
      counts.uncertain++
    },
    consumeReservation: () => true,
    io,
    verifyHistorical: async () => actual,
  })
  return { ports, counts }
}

const interpreter = fixture.manifest.artifacts.find(row => row.purpose === 'interpreter')
const exactTuple = () => ({
  platform: POLICY.executable.platform,
  arch: POLICY.executable.arch,
  osBuild: POLICY.executable.osBuild,
  nodeExecutable: interpreter.path,
  nodeMajor: POLICY.executable.nodeMajor,
})

test('R22 native port refuses tuple drift before any listener, with sanitized stage', async () => {
  const { ports, counts } = offlinePorts({
    tuple: async () => ({ ...exactTuple(), osBuild: 'wrong' }),
    fileDigest: async () => '0'.repeat(64),
  })
  await assert.rejects(ports.startProvider({ id: 'B01-listener', caseId: 'B01' }), error => {
    assert.equal(error.operationStage, 'FILE_VERIFY')
    assert.equal(error.message, 'R22 FILE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0, spawn: 0 })
})

test('R22 native port refuses current-file hash drift before any listener', async () => {
  const { ports, counts } = offlinePorts({ tuple: async () => exactTuple(), fileDigest: async () => '0'.repeat(64) })
  await assert.rejects(ports.startProvider({ id: 'B01-listener', caseId: 'B01' }), error => {
    assert.equal(error.operationStage, 'FILE_VERIFY')
    assert.equal(error.message, 'R22 FILE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0, spawn: 0 })
})

test('R22 native port refuses archive-verifier error with bounded category', async () => {
  const counts = { uncertain: 0, listener: 0 }
  const ports = createNativePorts({
    prepared: fixture,
    precreatedRootIdentity: { dev: 1, ino: 1 },
    authorize: async () => true,
    withReservation: async (_kind, _id, operation) => operation(),
    recordRecovery: async () => {},
    onUncertain: async () => {
      counts.uncertain++
    },
    consumeReservation: () => true,
    io: {
      tuple: async () => exactTuple(),
      fs: {},
      createServer: () => {
        counts.listener++
      },
    },
    verifyHistorical: async () => {
      throw Object.assign(new Error('private archive path'), { code: 'ENOENT' })
    },
  })
  await assert.rejects(ports.startProvider({ id: 'B01-listener', caseId: 'B01' }), error => {
    assert.equal(error.operationStage, 'ARCHIVE_VERIFY')
    assert.equal(error.code, 'ENOENT')
    assert.equal(error.message, 'R22 ARCHIVE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0 })
})
