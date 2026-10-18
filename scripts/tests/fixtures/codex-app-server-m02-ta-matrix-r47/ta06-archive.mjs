/** Explicit finite TA06 archival qualification. Original identity and continuity remain UNKNOWN. */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { verifyTA04History } from '../codex-app-server-m02-ta-matrix-r23/prior-evidence.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r23/r21-evidence.mjs'
import { digest } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const pin = (path, sha256) => Object.freeze({ path: join(REPO, path), sha256 })
export const TA06_LABEL = 'HISTORICAL_TEMP_SOURCE_ABSENT_TA06_VERIFIED'
const TA04_LABEL = 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED'
export const TA06_PINS = Object.freeze({
  decision: pin(
    '.appraisejs/m02-ta06-user-decision-01.json',
    'ec43dee8ec1f698589966876a7cc8eac462dd37d8c31c4d500e9e2627e00436d',
  ),
  proposal: pin(
    'tasks/codex-app-server-journeys/m02-ta06-archive-and-file-identity-amendment-01.md',
    '2815f7167d37f1dce0718394bd8807f220da91490cab76c099657dfdf6a5e771',
  ),
  review: pin(
    '.appraisejs/m02-ta06-proposal-review-01.json',
    'bbe96109deae6b534e95e231ee3830f254ee550c940e49f97b03294e60631395',
  ),
  ledger: pin(
    '.appraisejs/m02-ta06-finite-archive-availability-proposal-02.json',
    'b97cade3e738e0cdebb6f43f23dd734a047fd0276c0c55f5b6ebe07b23879cc5',
  ),
  inventory: pin(
    '.appraisejs/m02-ta06-original-predicate-inventory-01.json',
    '3d913521ead5ee2146615f9b39229e6124a8125ff89568f9d7938e92c157e38f',
  ),
  installedSnapshot: pin(
    '.appraisejs/m02-r46-installed-file-availability-01.json',
    '1b7170d6b6b0476624c82045140864fa9eb09c833c08531bb8cca4e18c18bb51',
  ),
  predecessor: pin(
    '.appraisejs/m02-ta-matrix-build-r44/manifest.json',
    '22095597b02883fb421f42d908a29cb54c49de5174d0857b6d91305dd4c856ff',
  ),
  originalWitnesses: 648,
  historicalRoots: 18,
  manifestClaims: 580,
  additionalNonManifestWitnesses: 68,
  originalTA04Claims: 23,
})
const ROOTS = Object.freeze(
  [7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26].map(
    n => `/private/tmp/appraise-m02-ta-matrix-p${n}`,
  ),
)
const qualification = new AsyncLocalStorage()
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) =>
  ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key])
const fail = message => {
  throw new Error(`TA06 ${message}`)
}
const exactPath = value => typeof value === 'string' && isAbsolute(value) && resolve(value) === value
const relativePath = value =>
  typeof value === 'string' &&
  value.length > 0 &&
  !isAbsolute(value) &&
  !value.includes('\\') &&
  value.split('/').every(part => part && part !== '.' && part !== '..')

async function absent(path) {
  try {
    await fs.lstat(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  fail(`forbidden original reappearance: ${path}`)
}

function context() {
  const current = qualification.getStore()
  if (!current?.active) fail('fresh per-invocation qualification context required')
  return current
}

async function absentPair(witness) {
  await absent(witness.historicalRoot)
  await absent(witness.originalPath ?? witness.predecessorClaim?.path)
}

/** Strict current archive ownership, separate from recorded historical original metadata. */
async function readArchive(witness, { max = 256 * 1024 * 1024 } = {}) {
  const parent = dirname(witness.archiveCopy)
  const directory = await fs.lstat(parent)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o7777) !== 0o700
  )
    fail('archive parent ownership or mode drift')
  const heldDirectory = await fs.open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    if (!same(directory, await heldDirectory.stat())) fail('archive parent replaced')
    const before = await fs.lstat(witness.archiveCopy)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== process.getuid() ||
      (before.mode & 0o7777) !== 0o600 ||
      before.nlink !== 1 ||
      before.size !== witness.archiveBytes ||
      before.size > max
    )
      fail('archive file ownership, type, links, mode or size drift')
    const held = await fs.open(witness.archiveCopy, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!same(before, await held.stat())) fail('archive file replaced before read')
      const bytes = await held.readFile()
      if (
        !same(before, await held.stat()) ||
        !same(before, await fs.lstat(witness.archiveCopy)) ||
        bytes.length !== before.size ||
        bytes.length !== witness.archiveBytes ||
        sha(bytes) !== witness.archiveCopySha256 ||
        !same(directory, await heldDirectory.stat()) ||
        !same(directory, await fs.lstat(parent))
      )
        fail('archive byte hash, length or identity drift')
      return bytes
    } finally {
      await held.close()
    }
  } finally {
    await heldDirectory.close()
  }
}

function recordPath(record, root) {
  if (record.originalPath !== undefined) return record.originalPath
  const source = record.sourceRelativePath ?? record.source
  if (!relativePath(source)) fail('invalid archive record source')
  return join(root, source)
}

function checkIndexWitness(witness, index) {
  const root = index.root ?? index.sourceRoot
  const records = index.files ?? index.records
  const original = witness.originalPath ?? witness.predecessorClaim?.path
  const matches = records?.filter(
    row => (row.status === undefined || row.status === 'COPIED') && recordPath(row, root) === original,
  )
  if (
    root !== witness.historicalRoot ||
    !isDeepStrictEqual(index.rootIdentity ?? index.sourceRootIdentity, witness.historicalRootIdentity) ||
    !Number.isSafeInteger(witness.indexRecordPosition) ||
    !isDeepStrictEqual(records?.[witness.indexRecordPosition], witness.indexRecord) ||
    matches?.length !== 1 ||
    !isDeepStrictEqual(matches[0], witness.indexRecord) ||
    !relativePath(witness.indexRecord.copy) ||
    witness.indexRecord.copy.includes('/') ||
    witness.archiveCopy !== join(dirname(witness.archiveIndex), witness.indexRecord.copy) ||
    witness.archiveCopySha256 !== witness.indexRecord.sha256 ||
    witness.archiveBytes !== witness.indexRecord.bytes ||
    !Number.isSafeInteger(witness.archiveBytes) ||
    witness.archiveBytes < 0 ||
    witness.originalPathAbsence !== 'ENOENT' ||
    witness.originalRootAbsence !== 'ENOENT' ||
    witness.currentOriginalRootIdentity !== 'UNKNOWN'
  )
    fail('exact archive index row, source, identity or membership drift')
  if (witness.predecessorClaim && witness.predecessorClaim.sha256 !== witness.archiveCopySha256)
    fail('original expected source hash drift')
}

async function buildContext() {
  const fixed = new Map()
  for (const item of Object.values(TA06_PINS))
    if (typeof item === 'object')
      fixed.set(item.path, await readStableFile(item.path, item.sha256, { max: 4 * 1024 * 1024 }))
  const parse = name => JSON.parse(fixed.get(TA06_PINS[name].path))
  const decision = parse('decision'),
    review = parse('review'),
    ledger = parse('ledger'),
    inventory = parse('inventory'),
    prepared = parse('predecessor')
  if (
    decision.verdict !== 'APPROVE_EXACT_TA06_OFFLINE_IMPLEMENTATION' ||
    !isDeepStrictEqual(decision.proposal, TA06_PINS.proposal) ||
    decision.proposalReviewSha256 !== TA06_PINS.review.sha256 ||
    decision.criterionRevisionApproved !== true ||
    decision.runtimeEligible !== false ||
    decision.consumedCommandReplayAuthorized !== false ||
    decision.historicalAllocationsReset !== false ||
    decision.regressionTestsAuthorizedNow !== false ||
    review.verdict !== 'ACCEPT_FOR_USER_QUALIFICATION_DECISION' ||
    inventory.nativeRoots?.length !== 18 ||
    inventory.originalTA04ExceptionsRemainExactly !== 23 ||
    ledger.newlyAbsentManifestClaims?.length !== 580 ||
    ledger.additionalR44OriginalCopyEvidence?.length !== 30 ||
    ledger.additionalEarlierOriginalEvidence?.length !== 38 ||
    ledger.totalNewMissingOriginalWitnesses !== 648 ||
    ledger.additionalNonManifestWitnessCount !== 68 ||
    !isDeepStrictEqual([...ledger.absentOriginalRoots].sort(), [...ROOTS].sort())
  )
    fail('fixed approval or finite-set shape drift')
  if (
    prepared.manifestDigest !== ledger.predecessorManifest.manifestDigest ||
    digest(prepared.manifest) !== prepared.manifestDigest ||
    ledger.predecessorManifest.path !== TA06_PINS.predecessor.path ||
    ledger.predecessorManifest.sha256 !== TA06_PINS.predecessor.sha256 ||
    prepared.manifest.artifacts?.length !== 8756 ||
    !isDeepStrictEqual(
      prepared.manifest.artifacts.filter(row => row.availability === TA04_LABEL),
      ledger.unchangedOriginalTA04Rows,
    ) ||
    !isDeepStrictEqual(prepared.manifest.historicalAvailability, ledger.unchangedOriginalTA04Witnesses)
  )
    fail('frozen R44 or unchanged TA04 history drift')
  const witnesses = new Map(),
    indexes = new Map(),
    roots = new Map(),
    copies = new Set()
  const artifacts = new Map(prepared.manifest.artifacts.map(row => [row.path, row]))
  if (artifacts.size !== 8756) fail('frozen predecessor artifact duplicates')
  for (const source of inventory.nativeRoots) {
    if (!ROOTS.includes(source.historicalRoot) || roots.has(source.historicalRoot))
      fail('source inventory root membership drift')
    await readStableFile(source.sourceFile, source.sourceSha256)
    const index = JSON.parse(
      await readStableFile(source.archiveIndex, source.archiveIndexSha256, { max: 4 * 1024 * 1024 }),
    )
    indexes.set(source.archiveIndex, { index, sha256: source.archiveIndexSha256 })
    roots.set(source.historicalRoot, {
      identity: index.rootIdentity ?? index.sourceRootIdentity,
      indexPath: source.archiveIndex,
    })
  }
  if (roots.size !== 18 || indexes.size !== 18) fail('source inventory root or index duplicates')
  for (const witness of [
    ...ledger.newlyAbsentManifestClaims,
    ...ledger.additionalR44OriginalCopyEvidence,
    ...ledger.additionalEarlierOriginalEvidence,
  ]) {
    const original = witness.originalPath ?? witness.predecessorClaim?.path
    const indexed = indexes.get(witness.archiveIndex)
    if (
      !exactPath(original) ||
      !exactPath(witness.archiveCopy) ||
      !ROOTS.includes(witness.historicalRoot) ||
      !original.startsWith(`${witness.historicalRoot}/`) ||
      witnesses.has(original) ||
      copies.has(witness.archiveCopy) ||
      !indexed ||
      indexed.sha256 !== witness.archiveIndexSha256 ||
      roots.get(witness.historicalRoot)?.indexPath !== witness.archiveIndex
    )
      fail('unapproved, duplicate or changed archive mapping')
    if (
      witness.predecessorClaim
        ? !isDeepStrictEqual(artifacts.get(original), witness.predecessorClaim)
        : artifacts.has(original) || witness.manifestMembership !== 'NOT_MEMBER_OF_R44_MANIFEST'
    )
      fail('manifest versus non-manifest membership drift')
    checkIndexWitness(witness, indexed.index)
    await absentPair(witness)
    await readArchive(witness)
    await absentPair(witness)
    witnesses.set(original, witness)
    copies.add(witness.archiveCopy)
  }
  if (witnesses.size !== 648 || copies.size !== 648) fail('incomplete finite original witness set')
  for (const root of ROOTS) await absent(root)
  return { active: true, ledger, roots, witnesses, indexes, predecessor: prepared.manifest }
}

/** Always establishes a new invocation, including when called under an older qualification. */
export async function withTA06Qualification(operation) {
  if (typeof operation !== 'function') fail('qualification operation required')
  const current = await buildContext()
  try {
    return await qualification.run(current, operation)
  } finally {
    current.active = false
  }
}

export async function readClaimBytes(file, expected, options) {
  const historicalRoot = ROOTS.find(root => file === root || file.startsWith(`${root}/`))
  if (!historicalRoot) return readStableFile(file, expected, options)
  const current = context(),
    witness = current.witnesses.get(file)
  if (!witness || expected !== witness.archiveCopySha256) fail('unapproved original path or exact expected hash')
  await absentPair(witness)
  const bytes = await readArchive(witness, options)
  await absentPair(witness)
  return bytes
}

/** Validates a recorded claim only; deliberately returns no current filesystem identity. */
export async function assertHistoricalRoot(root, recordedIdentity) {
  const archived = context().roots.get(root)
  if (
    !archived ||
    !Number.isSafeInteger(recordedIdentity?.dev) ||
    !Number.isSafeInteger(recordedIdentity?.ino) ||
    recordedIdentity.dev !== archived.identity?.dev ||
    recordedIdentity.ino !== archived.identity?.ino
  )
    fail('unapproved historical root or recorded identity drift')
  await absent(root)
}

export async function readHistoricalPair(row, indexPath, expectedOriginalPath) {
  const current = context(),
    witness = current.witnesses.get(expectedOriginalPath),
    archived = current.indexes.get(indexPath)
  if (
    !witness ||
    witness.archiveIndex !== indexPath ||
    !archived ||
    witness.archiveIndexSha256 !== archived.sha256 ||
    !isDeepStrictEqual(row, witness.indexRecord)
  )
    fail('unapproved historical pair')
  checkIndexWitness(witness, archived.index)
  await absentPair(witness)
  const bytes = await readArchive(witness)
  await absentPair(witness)
  return bytes
}

/** Existing TA04 and TA05 semantics remain exact and unchanged; TA06 has a separate map. */
export async function verifyLegacyHistoricalClosure(manifest) {
  const current = context()
  const prior = await verifyTA04History({ requireNewRootAbsent: false })
  const witnesses = prior.historicalSources
  const labelled = manifest?.artifacts?.filter(row => row.availability === TA04_LABEL)
  if (
    !isDeepStrictEqual(manifest.rootPackageQualification, prior.packageQualification) ||
    witnesses.length !== 23 ||
    labelled?.length !== 23 ||
    new Set(labelled.map(row => row.path)).size !== 23 ||
    manifest.artifacts.some(row => row.availability !== undefined && row.availability !== TA04_LABEL) ||
    !isDeepStrictEqual(manifest.historicalAvailability?.archiveWitnesses, witnesses)
  )
    fail('legacy package qualification or TA04 witness set drift')
  const trusted = new Map(witnesses.map(row => [row.path, row]))
  for (const row of labelled)
    if (!trusted.has(row.path) || trusted.get(row.path).sha256 !== row.sha256) fail('legacy TA04 mapping drift')
  const p7 = current.witnesses.get('/private/tmp/appraise-m02-ta-matrix-p7/phase-journal.jsonl')
  if (
    !isDeepStrictEqual(p7?.sourceRecordedJournalIdentity, { dev: 16777233, ino: 69112686, size: 1207 }) ||
    p7.archiveCopySha256 !== '4a46da63f2e9e609281c6a7d4b338d2b44f22ded8dbda4b01bffae4b38f1f617'
  )
    fail('p7 historical journal claim drift')
  await assertHistoricalRoot(p7.historicalRoot, { dev: 16777233, ino: 69112685 })
  await readClaimBytes(p7.originalPath, p7.archiveCopySha256)
  return trusted
}

export async function verifyTA06ManifestHistory(manifest) {
  if (!qualification.getStore()?.active) return withTA06Qualification(() => verifyTA06ManifestHistory(manifest))
  const current = context(),
    artifacts = manifest?.artifacts
  if (
    !Array.isArray(artifacts) ||
    new Set(artifacts.map(row => row.path)).size !== artifacts.length ||
    artifacts.some(
      row => row.availability !== undefined && row.availability !== TA04_LABEL && row.availability !== TA06_LABEL,
    )
  )
    fail('manifest artifact membership or availability label drift')
  // Pass only the original labels to the unchanged legacy semantics; no ancestral artifact is rewritten.
  const legacyManifest = {
    ...manifest,
    artifacts: artifacts.map(row => (row.availability === TA06_LABEL ? { ...row, availability: undefined } : row)),
  }
  const trusted = await verifyLegacyHistoricalClosure(legacyManifest)
  const labelled = artifacts.filter(row => row.availability === TA06_LABEL)
  if (
    labelled.length !== 580 ||
    !isDeepStrictEqual(
      manifest.historicalAvailability?.archiveWitnesses,
      current.predecessor.historicalAvailability.archiveWitnesses,
    )
  )
    fail('TA06 manifest count or original TA04 witness drift')
  const claims = new Map(current.ledger.newlyAbsentManifestClaims.map(row => [row.predecessorClaim.path, row]))
  for (const row of labelled) {
    const witness = claims.get(row.path)
    if (!witness || row.sha256 !== witness.predecessorClaim.sha256 || trusted.has(row.path))
      fail('TA06 manifest mapping drift')
    await readClaimBytes(row.path, row.sha256)
    trusted.set(
      row.path,
      Object.freeze({
        ...witness.predecessorClaim,
        status: TA06_LABEL,
        archiveIndex: witness.archiveIndex,
        archiveIndexSha256: witness.archiveIndexSha256,
        archiveCopy: witness.archiveCopy,
        archiveCopySha256: witness.archiveCopySha256,
        archiveBytes: witness.archiveBytes,
        historicalRoot: witness.historicalRoot,
        historicalRootIdentity: structuredClone(witness.historicalRootIdentity),
        historicalDirectoryMetadata: structuredClone(witness.historicalDirectoryMetadata ?? null),
        currentOriginalRootIdentity: 'UNKNOWN',
      }),
    )
  }
  if (trusted.size !== 603 || [...claims.keys()].some(path => !trusted.has(path)))
    fail('TA06 trusted manifest mapping incomplete')
  return trusted
}
