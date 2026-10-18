import './fixtures/codex-app-server-m02-ta-matrix-r23-composed/no-external-effects.mjs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareR23MatrixManifest } from './fixtures/codex-app-server-m02-ta-matrix-r23/manifest.mjs'
import {
  verifyR23HistoricalClosure,
  createNativePorts,
} from './fixtures/codex-app-server-m02-ta-matrix-r23/runtime-effects.mjs'
import { readStableFile } from './fixtures/codex-app-server-m02-ta-matrix-r23/r21-evidence.mjs'
import { POLICY } from './fixtures/codex-app-server-m02-ta-matrix-r23/policy.mjs'
import {
  qualifyRootPackage,
  verifyExactPackageDelta,
  SCRIPT_DELTA,
  ROOT_PACKAGE,
  OLD_PACKAGE_SHA,
  CURRENT_PACKAGE_SHA,
} from './fixtures/codex-app-server-m02-ta-matrix-r23/package-qualification.mjs'
import { dispatchMatrixEntrypoint as verifyFrozenR22 } from './fixtures/codex-app-server-m02-ta-matrix-r22/entrypoint.mjs'
import { createHash } from 'node:crypto'

const fixture = await prepareR23MatrixManifest()
const actual = await verifyR23HistoricalClosure(fixture.manifest)
const witnesses = fixture.manifest.historicalAvailability.archiveWitnesses
const syntheticHistory = async () => ({
  historicalSources: witnesses,
  packageQualification: fixture.manifest.rootPackageQualification,
})
const noRetainedRead = async () => {}
const verifySynthetic = manifest =>
  verifyR23HistoricalClosure(manifest, { verifyHistory: syntheticHistory, verifyRetained: noRetainedRead })

const clone = () => structuredClone(fixture.manifest)
const historicalIndexes = fixture.manifest.artifacts.flatMap((row, index) =>
  row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' ? [index] : [],
)

test('R23 real historical closure reads all 23 trusted TA04 witnesses', () => {
  assert.equal(actual.size, 23)
  assert.equal(historicalIndexes.length, 23)
})

test('R23 rejects a changed source hash at every one of the 23 labelled rows', async t => {
  for (const index of historicalIndexes) {
    await t.test(`row ${index}`, async () => {
      const manifest = clone()
      manifest.artifacts[index].sha256 = '0'.repeat(64)
      await assert.rejects(verifySynthetic(manifest), /historical row mapping drift/)
    })
  }
})

test('R23 rejects missing, duplicated, extra and unknown historical labels', async () => {
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

test('R23 rejects index, copy, byte-length and witness-set drift without touching archives', async () => {
  for (const key of ['archiveIndexSha256', 'archiveCopySha256', 'archiveBytes']) {
    const manifest = clone()
    manifest.historicalAvailability.archiveWitnesses[0][key] = key === 'archiveBytes' ? 0 : '0'.repeat(64)
    await assert.rejects(verifySynthetic(manifest), /historical witness set drift/)
  }
  const fewer = clone()
  fewer.historicalAvailability.archiveWitnesses.pop()
  await assert.rejects(verifySynthetic(fewer), /historical witness set drift/)
})

test('R23 stable no-follow reader rejects hash and symlink drift', async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), 'appraise-r23-read-'))
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

const packageQualification = fixture.manifest.rootPackageQualification
const historicalPackageBytes = await readStableFile(packageQualification.predecessorBytes.path, OLD_PACKAGE_SHA)
const currentPackageBytes = await readStableFile(ROOT_PACKAGE, CURRENT_PACKAGE_SHA)
const historicalPackage = JSON.parse(historicalPackageBytes)
const currentPackage = JSON.parse(currentPackageBytes)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

test('frozen R22 --verify still refuses the changed current root package without native effects', async () => {
  const frozen = JSON.parse(await fs.readFile(join(process.cwd(), '.appraisejs/m02-ta-matrix-build-r22/manifest.json')))
  assert.equal(frozen.manifest.artifacts.find(row => row.path === ROOT_PACKAGE).sha256, OLD_PACKAGE_SHA)
  assert.notEqual(sha(currentPackageBytes), OLD_PACKAGE_SHA)
  await assert.rejects(verifyFrozenR22(['--verify']), error => {
    assert.ok(error.message.includes(ROOT_PACKAGE), error.message)
    assert.match(error.message, /hash|identity|artifact/)
    return true
  })
})

test('TA05 qualifies only the exact two package versions and five script changes', async () => {
  assert.deepEqual(await qualifyRootPackage(), packageQualification)
  assert.deepEqual(verifyExactPackageDelta(historicalPackage, currentPackage), Object.keys(SCRIPT_DELTA).sort())
  assert.equal(packageQualification.predecessorSha256, OLD_PACKAGE_SHA)
  assert.equal(packageQualification.currentSha256, CURRENT_PACKAGE_SHA)
  assert.equal(packageQualification.nonScriptMetadataIdentical, true)
  assert.equal(packageQualification.runtimeAuthority, false)
  assert.equal(packageQualification.runtimeCompatibility, 'UNQUALIFIED')
  assert.equal(packageQualification.predecessorBytes.evidenceClass, 'HISTORICAL_GIT_SOURCE_BYTES_NOT_CURRENT_FILE')
  const currentPin = fixture.manifest.artifacts.find(row => row.path === ROOT_PACKAGE)
  assert.equal(currentPin.sha256, CURRENT_PACKAGE_SHA)
  assert.equal(currentPin.availability, undefined)
})

test('TA05 rejects before and after value drift for every one of its five script keys', () => {
  for (const key of Object.keys(SCRIPT_DELTA)) {
    const before = structuredClone(historicalPackage)
    before.scripts[key] = 'unapproved old script'
    assert.throws(() => verifyExactPackageDelta(before, currentPackage), /TA05 script/, key)
    const after = structuredClone(currentPackage)
    after.scripts[key] = 'unapproved current script'
    assert.throws(() => verifyExactPackageDelta(historicalPackage, after), /TA05 script/, key)
  }
})

test('TA05 rejects changed or missing non-script metadata at every package field', () => {
  for (const key of Object.keys(currentPackage).filter(key => key !== 'scripts')) {
    const changed = structuredClone(currentPackage)
    changed[key] = { unapproved: true }
    assert.throws(() => verifyExactPackageDelta(historicalPackage, changed), /non-script metadata drift/, key)
    const missing = structuredClone(currentPackage)
    delete missing[key]
    assert.throws(() => verifyExactPackageDelta(historicalPackage, missing), /non-script metadata drift/, key)
  }
  const extra = { ...currentPackage, unapproved: true }
  assert.throws(() => verifyExactPackageDelta(historicalPackage, extra), /non-script metadata drift/)
})

test('TA05 rejects extra, missing and unchanged script-delta keys', () => {
  const extra = structuredClone(currentPackage)
  extra.scripts.unapproved = 'node unapproved.mjs'
  assert.throws(() => verifyExactPackageDelta(historicalPackage, extra), /script key delta drift/)
  for (const key of Object.keys(SCRIPT_DELTA)) {
    const missing = structuredClone(currentPackage)
    delete missing.scripts[key]
    assert.throws(() => verifyExactPackageDelta(historicalPackage, missing), /TA05 script/, key)
    const unchanged = structuredClone(currentPackage)
    if (Object.hasOwn(historicalPackage.scripts, key)) unchanged.scripts[key] = historicalPackage.scripts[key]
    else delete unchanged.scripts[key]
    assert.throws(() => verifyExactPackageDelta(historicalPackage, unchanged), /script key delta drift/, key)
  }
  for (const value of [null, {}, { ...currentPackage, scripts: null }])
    assert.throws(() => verifyExactPackageDelta(historicalPackage, value), /TA05 scripts missing/)
})

test('TA05 refuses the historical current-file hash and any unapproved current bytes with no fallback', async () => {
  for (const substitute of [historicalPackageBytes, Buffer.from(`${JSON.stringify(currentPackage)}\n`)]) {
    const reads = []
    await assert.rejects(
      qualifyRootPackage({
        read: async (file, expected) => {
          reads.push({ file, expected })
          return file === ROOT_PACKAGE ? substitute : readStableFile(file, expected)
        },
      }),
      /TA05 package bytes or lengths drift/,
    )
    assert.equal(reads.filter(row => row.file === ROOT_PACKAGE).length, 1)
    assert.equal(reads.find(row => row.file === ROOT_PACKAGE).expected, CURRENT_PACKAGE_SHA)
    assert.equal(
      reads.some(row => row.file === ROOT_PACKAGE && row.expected === OLD_PACKAGE_SHA),
      false,
    )
  }
})

test('R23 historical closure rejects missing, extra and changed package qualification fields', async () => {
  const mutations = [
    value => {
      delete value.rootPackageQualification
    },
    value => {
      value.rootPackageQualification.extra = true
    },
    value => {
      value.rootPackageQualification.path += '.other'
    },
    value => {
      value.rootPackageQualification.currentSha256 = OLD_PACKAGE_SHA
    },
    value => {
      value.rootPackageQualification.predecessorSha256 = CURRENT_PACKAGE_SHA
    },
    value => {
      value.rootPackageQualification.predecessorBytes.evidenceClass = 'CURRENT'
    },
    value => {
      value.rootPackageQualification.changedScriptKeys.pop()
    },
    value => {
      value.rootPackageQualification.nonScriptMetadataIdentical = false
    },
    value => {
      value.rootPackageQualification.runtimeAuthority = true
    },
  ]
  for (const mutate of mutations) {
    const manifest = clone()
    mutate(manifest)
    await assert.rejects(verifySynthetic(manifest), /R23 package qualification drift/)
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

test('R23 native port refuses tuple drift before any listener, with sanitized stage', async () => {
  const { ports, counts } = offlinePorts({
    tuple: async () => ({ ...exactTuple(), osBuild: 'wrong' }),
    fileDigest: async () => '0'.repeat(64),
  })
  await assert.rejects(ports.startProvider({ id: 'B01-listener', caseId: 'B01' }), error => {
    assert.equal(error.operationStage, 'FILE_VERIFY')
    assert.equal(error.message, 'R23 FILE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0, spawn: 0 })
})

test('R23 native port refuses current-file hash drift before any listener', async () => {
  const { ports, counts } = offlinePorts({ tuple: async () => exactTuple(), fileDigest: async () => '0'.repeat(64) })
  await assert.rejects(ports.startProvider({ id: 'B01-listener', caseId: 'B01' }), error => {
    assert.equal(error.operationStage, 'FILE_VERIFY')
    assert.equal(error.message, 'R23 FILE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0, spawn: 0 })
})

test('R23 native port refuses archive-verifier error with bounded category', async () => {
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
    assert.equal(error.message, 'R23 ARCHIVE_VERIFY failed')
    return true
  })
  assert.deepEqual(counts, { uncertain: 1, listener: 0 })
})
