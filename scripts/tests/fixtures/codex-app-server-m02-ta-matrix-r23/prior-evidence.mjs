/** TA04 plus exact TA05 current-version qualification: current pins plus exact witnesses for absent historical sources. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, digest } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'

import { qualifyRootPackage, ROOT_PACKAGE, OLD_PACKAGE_SHA, CURRENT_PACKAGE_SHA } from './package-qualification.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const R20 = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r20')
const R23_ROOT = '/private/tmp/appraise-m02-ta-matrix-p9'
const R19_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r19/manifest.json')
const FIXED = Object.freeze({
  [R19_MANIFEST]: '2c04717e51e0c0a5b19060b35e13457c407ad8942db9bf797c27b3401de4c8b0',
  [join(REPO, '.appraisejs/m02-t2-r19-exact-review.json')]:
    '665c347237c012e98316762f92a22979958663ac02eb5a302a2dd4b07e4a210c',
  [join(REPO, '.appraisejs/m02-t2-r19-recovery-user-decision.json')]:
    'c59f3453327cc87565fc2d227413e6b53a6542baa1ad9d27fb6f2190d326cacb',
  [join(REPO, '.appraisejs/m02-t2-r19-execution-result-01.json')]:
    'cabb4b9811fa9ea6604ca73379024d76db109e765aedcaa0d28439c516dd5006',
  [join(REPO, '.appraisejs/m02-t2-r19-execution-review-01.json')]:
    'a43293b55e8c1bc274997cdc28fbf874596b6585dcad2cc3ae55e4b02715782f',
  [join(REPO, '.appraisejs/m02-ta-matrix-r19-source-review-01.json')]:
    'ce6acc36513f7a0a5c34fc3031c3a63cef0e8493a7066a097fa66788cbea9530',
  [join(REPO, '.appraisejs/m02-r20-resume-preservation-01.json')]:
    'f0c52df1bcc666af5a08d9494c15afc94c8cffcc2770507ad08d5a87145bda10',
  [join(REPO, '.appraisejs/m02-r20-archive-availability-01.json')]:
    'f36f9f7d2cf7fe23a095e84fb0afc2086b22453500af6a99f2440b1bcb0fb1b1',
  [join(REPO, '.appraisejs/m02-ta-matrix-r20-source-review-01.json')]:
    '4db3a2f1a6339d11e03a3ffbc91d74082502513916b4ec1b186d7f79ec6d2a6a',
  [join(REPO, 'tasks/codex-app-server-journeys/m02-ta04-availability-amendment-01.md')]:
    '35f790f9d47c9474df3e6ec26511471c9dc08b7df13f10ba8ddc40f562fd8381',
  [join(REPO, '.appraisejs/m02-ta04-availability-design-review-01.json')]:
    '298a6e14f7f2a9a287c4e72ad28c96a2dc8489dd8e0252c8ff7978b0ab21c189',
  [join(REPO, '.appraisejs/m02-ta04-user-decision-01.json')]:
    '196fe5f3809f10c00272948a941d99cfafbca597f89672b079a31c8fe59eb64a',
})
const REVIEWED_TREE = 'e9d8afb4cd5e23cd7d99d938599fcf6c14c23140db7403808880f8bc3759a9de'
const MANIFEST_DIGEST = '4ad539c087bc35bb5668f97c2175b14df33ae56c1162a3a10599a4255f24d0f7'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])

async function exactFile(file, expected, { max = 256 * 1024 * 1024 } = {}) {
  const before = await fs.lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o022) !== 0 || before.size > max)
    throw new Error(`TA04 file identity drift: ${file}`)
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!same(before, await handle.stat())) throw new Error(`TA04 file replaced: ${file}`)
    const bytes = await handle.readFile()
    if (
      !same(before, await handle.stat()) ||
      !same(before, await fs.lstat(file)) ||
      bytes.length !== before.size ||
      (expected !== undefined && sha(bytes) !== expected)
    )
      throw new Error(`TA04 file hash or identity drift: ${file}`)
    return bytes
  } finally {
    await handle.close()
  }
}

export async function requireTA04Absent(file, { fileSystem = fs } = {}) {
  try {
    await fileSystem.lstat(file)
    throw new Error(`TA04 forbidden historical or fresh root reappeared: ${file}`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

export function verifyTA04ArchiveCopy(row, bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== row.bytes ||
    row.historicalSha256 !== row.archiveSha256 ||
    sha(bytes) !== row.historicalSha256
  )
    throw new Error('TA04 archive copy length or hash drift')
}

function validRelative(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !isAbsolute(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..') &&
    !value.includes('\\')
  )
}

export function verifyReviewedR20TreeEntries(entries) {
  if (
    entries?.length !== 21 ||
    new Set(entries.map(item => item.name)).size !== 21 ||
    entries.some(item => !/^[a-z0-9-]+\.mjs$/.test(item.name) || !/^[a-f0-9]{64}$/.test(item.sha256))
  )
    throw new Error('TA04 R20 source tree entry drift')
  const hash = createHash('sha256')
  for (const item of [...entries].sort((a, b) => a.name.localeCompare(b.name)))
    hash.update(item.name).update('\0').update(item.sha256).update('\n')
  if (hash.digest('hex') !== REVIEWED_TREE) throw new Error('TA04 reviewed R20 source tree drift')
}

/** Pure finite-set check, also used by disposable deterministic tests. */
export function classifyTA04ArchiveMapping({ artifacts, snapshot, observation, indexes }) {
  if (
    artifacts?.length !== 6521 ||
    snapshot?.schema !== 'appraise.m02-r20-resume-preservation/v1' ||
    snapshot.r19ManifestSha256 !== FIXED[R19_MANIFEST] ||
    snapshot.artifactPins !== 6521 ||
    snapshot.matched !== 6498 ||
    snapshot.missing?.length !== 23 ||
    snapshot.mismatched?.length !== 0 ||
    observation?.schema !== 'appraise.m02-r20-archive-availability/v1' ||
    observation.sourceSnapshotSha256 !== FIXED[join(REPO, '.appraisejs/m02-r20-resume-preservation-01.json')] ||
    observation.archiveIndexes?.length !== 6 ||
    observation.mappings?.length !== 23 ||
    observation.mappedMissingPins !== 23 ||
    indexes?.size !== 6
  )
    throw new Error('TA04 finite predecessor or observation shape drift')
  const pins = new Map()
  for (const item of artifacts) {
    if (
      !isAbsolute(item.path) ||
      resolve(item.path) !== item.path ||
      pins.has(item.path) ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error('TA04 predecessor artifact path/hash drift')
    pins.set(item.path, item)
  }
  const missing = new Map()
  for (const row of snapshot.missing) {
    if (row.status !== 'MISSING_ENOENT' || missing.has(row.path) || pins.get(row.path)?.sha256 !== row.expectedSha256)
      throw new Error('TA04 snapshot missing-set drift')
    missing.set(row.path, row)
  }
  const roots = new Map()
  for (const row of observation.archiveIndexes) {
    if (
      !pins.has(row.path) ||
      pins.get(row.path).sha256 !== row.sha256 ||
      roots.has(row.historicalSourceRoot) ||
      row.currentRootStatus !== 'MISSING_ENOENT' ||
      indexes.get(row.path)?.sourceRoot !== row.historicalSourceRoot
    )
      throw new Error('TA04 archive index/root drift')
    roots.set(row.historicalSourceRoot, row)
  }
  const mapped = new Map()
  const copies = new Set()
  for (const row of observation.mappings) {
    const root = [...roots.keys()].find(value => row.historicalSourcePath.startsWith(`${value}${sep}`))
    const relativePath = root && relative(root, row.historicalSourcePath).split(sep).join('/')
    const index = indexes.get(row.archiveIndex)
    const matches =
      index?.records?.filter(
        record => (record.sourceRelativePath ?? record.source) === relativePath && record.status === 'COPIED',
      ) ?? []
    const record = matches[0]
    if (
      !root ||
      row.archiveIndex !== roots.get(root).path ||
      row.currentSourceStatus !== 'MISSING_ENOENT' ||
      !missing.has(row.historicalSourcePath) ||
      mapped.has(row.historicalSourcePath) ||
      !validRelative(relativePath) ||
      matches.length !== 1 ||
      !validRelative(record.copy) ||
      record.copy.includes('/') ||
      row.archiveCopy !== join(dirname(row.archiveIndex), record.copy) ||
      copies.has(row.archiveCopy) ||
      row.historicalSha256 !== pins.get(row.historicalSourcePath)?.sha256 ||
      row.archiveSha256 !== row.historicalSha256 ||
      record.sha256 !== row.historicalSha256 ||
      record.bytes !== row.bytes ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0
    )
      throw new Error('TA04 archive mapping ambiguous or changed')
    mapped.set(row.historicalSourcePath, {
      ...row,
      historicalRoot: root,
      sourceRelativePath: relativePath,
      historicalRootIdentity: structuredClone(index.sourceRootIdentity ?? index.rootIdentity),
      historicalDirectoryMetadata: structuredClone(index.directoryMetadata ?? null),
    })
    copies.add(row.archiveCopy)
  }
  if (mapped.size !== 23 || [...missing.keys()].some(path => !mapped.has(path)))
    throw new Error('TA04 archive mapping incomplete')
  return { missing, roots, mapped }
}

async function reviewedR20Tree(review) {
  const names = await fs.readdir(R20)
  if (names.length !== 21 || names.some(name => !/^[a-z0-9-]+\.mjs$/.test(name)))
    throw new Error('TA04 R20 source tree entry drift')
  const sorted = names.sort()
  const entries = []
  const files = []
  for (const name of sorted) {
    const file = join(R20, name)
    const bytes = await exactFile(file)
    const value = sha(bytes)
    entries.push({ name, sha256: value })
    files.push({ path: file, sha256: value })
  }
  verifyReviewedR20TreeEntries(entries)
  if (review?.pins?.sourceTree?.sha256 !== REVIEWED_TREE || review.pins.sourceTree.files !== 21)
    throw new Error('TA04 reviewed R20 source tree drift')
  const tests = [
    [join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r20.test.mjs'), review.pins.mainTestSha256],
    [join(REPO, 'scripts/tests/codex-app-server-m02-ta-matrix-r20-prior.test.mjs'), review.pins.priorTestSha256],
  ]
  for (const [file, expected] of tests) {
    await exactFile(file, expected)
    files.push({ path: file, sha256: expected })
  }
  return files
}

export async function verifyTA04History({ requireNewRootAbsent = true } = {}) {
  const packageQualification = await qualifyRootPackage()
  const systemVersion = await fs.readFile('/System/Library/CoreServices/SystemVersion.plist', 'utf8')
  const osBuild = systemVersion.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
  if (
    process.platform !== POLICY.executable.platform ||
    process.arch !== POLICY.executable.arch ||
    Number(process.versions.node.split('.')[0]) !== POLICY.executable.nodeMajor ||
    process.execPath !== '/opt/homebrew/Cellar/node/26.11.0/bin/node' ||
    osBuild !== POLICY.executable.osBuild
  )
    throw new Error('TA04 public OS/Node tuple drift')
  const fixed = new Map()
  for (const [file, expected] of Object.entries(FIXED))
    fixed.set(file, await exactFile(file, expected, { max: 4 * 1024 * 1024 }))
  const envelope = JSON.parse(fixed.get(R19_MANIFEST))
  const manifest = envelope.manifest
  if (
    envelope.schema !== 'appraise.m02-ta-matrix-r19-preparation/v1' ||
    envelope.manifestDigest !== MANIFEST_DIGEST ||
    digest(manifest) !== MANIFEST_DIGEST ||
    manifest.version !== 'appraise.m02-ta-matrix-r19/v1' ||
    manifest.root !== '/private/tmp/appraise-m02-ta-matrix-p5' ||
    manifest.runtimeAuthorized !== false ||
    manifest.cases?.length !== 24
  )
    throw new Error('TA04 consumed R19 manifest drift')
  const snapshot = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-r20-resume-preservation-01.json')))
  const observation = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-r20-archive-availability-01.json')))
  const review = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-ta-matrix-r20-source-review-01.json')))
  const decision = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-ta04-user-decision-01.json')))
  if (
    decision.verdict !== 'APPROVE_TA04_OFFLINE_R21_ONLY' ||
    decision.runtimeAuthority !== false ||
    review.verdict !== 'ACCEPT_EXACT_OFFLINE_SOURCE_ONLY_CURRENT_DERIVATION_BLOCKED'
  )
    throw new Error('TA04 decision or independent R20 review drift')
  const indexes = new Map()
  for (const item of observation.archiveIndexes) {
    const bytes = await exactFile(item.path, item.sha256, { max: 4 * 1024 * 1024 })
    indexes.set(item.path, JSON.parse(bytes))
  }
  const classification = classifyTA04ArchiveMapping({ artifacts: manifest.artifacts, snapshot, observation, indexes })
  const pinned = new Set(Object.keys(FIXED))
  for (const root of classification.roots.keys()) await requireTA04Absent(root)
  await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p5')
  await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p6')
  if (requireNewRootAbsent) await requireTA04Absent(R23_ROOT)
  const historicalSources = []
  const liveArtifacts = []
  for (const item of manifest.artifacts) {
    const witness = classification.mapped.get(item.path)
    if (witness) {
      await requireTA04Absent(item.path)
      const bytes = await exactFile(witness.archiveCopy, item.sha256)
      verifyTA04ArchiveCopy(witness, bytes)
      historicalSources.push(
        Object.freeze({
          ...item,
          status: 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED',
          archiveIndex: witness.archiveIndex,
          archiveIndexSha256: classification.roots.get(witness.historicalRoot).sha256,
          archiveCopy: witness.archiveCopy,
          archiveCopySha256: witness.archiveSha256,
          archiveBytes: witness.bytes,
          historicalRoot: witness.historicalRoot,
          historicalRootIdentity: witness.historicalRootIdentity,
          historicalDirectoryMetadata: witness.historicalDirectoryMetadata,
          currentOriginalRootIdentity: 'UNKNOWN',
        }),
      )
      pinned.add(witness.archiveIndex)
      pinned.add(witness.archiveCopy)
    } else if (item.path === ROOT_PACKAGE) {
      if (item.sha256 !== OLD_PACKAGE_SHA) throw new Error('TA05 predecessor package claim drift')
      await exactFile(item.path, CURRENT_PACKAGE_SHA)
      liveArtifacts.push({ ...item, sha256: CURRENT_PACKAGE_SHA })
      pinned.add(item.path)
    } else {
      await exactFile(item.path, item.sha256)
      liveArtifacts.push(item)
      pinned.add(item.path)
    }
  }
  if (liveArtifacts.length !== 6498 || historicalSources.length !== 23)
    throw new Error('TA04 current/archived count drift')
  for (const item of await reviewedR20Tree(review)) pinned.add(item.path)
  for (const root of classification.roots.keys()) await requireTA04Absent(root)
  await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p5')
  await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p6')
  if (requireNewRootAbsent) await requireTA04Absent(R23_ROOT)
  return Object.freeze({
    status: 'PRIOR_P1_P2_P3_P4_UNKNOWN_R19_GATE_ONLY_ARCHIVE_VERIFIED',
    manifest,
    packageQualification,
    liveArtifacts: Object.freeze(liveArtifacts),
    historicalSources: Object.freeze(historicalSources),
    pinnedFiles: Object.freeze([...pinned]),
    priorEvidence: Object.freeze({
      ...manifest.priorEvidence,
      allFourRootsRetained: false,
      currentOriginalRootIdentity: 'UNKNOWN',
      historicalOutcomes: 'UNKNOWN',
      r19: Object.freeze({ status: 'GATE_ONLY_REFUSED', rootAbsent: true, casesCompleted: 0 }),
    }),
    r19: Object.freeze({
      manifestSha256: FIXED[R19_MANIFEST],
      manifestDigest: MANIFEST_DIGEST,
      rootAbsent: true,
      casesCompleted: 0,
    }),
  })
}
