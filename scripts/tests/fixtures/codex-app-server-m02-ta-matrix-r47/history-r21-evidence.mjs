/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Read-only, exact-byte predecessor and retained p7 evidence. No runtime authority is inferred. */
import fs from 'node:fs/promises'
import { readClaimBytes, assertHistoricalRoot } from './ta06-archive.mjs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  qualifyRootPackage,
  ROOT_PACKAGE,
  OLD_PACKAGE_SHA,
} from '../codex-app-server-m02-ta-matrix-r23/package-qualification.mjs'
import { digest } from '../codex-app-server-m02-ta-matrix-r23/policy.mjs'
import { requireTA04Absent, verifyTA04History } from '../codex-app-server-m02-ta-matrix-r23/prior-evidence.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const R21_ROOT = '/private/tmp/appraise-m02-ta-matrix-p7'
export const R23_ROOT = '/private/tmp/appraise-m02-ta-matrix-p9'
export const R21_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r21/manifest.json')
export const R21_SOURCE_REVIEW = join(REPO, '.appraisejs/m02-ta-matrix-r21-source-review-01.json')
export const R21_ACTUAL_REVIEW = join(REPO, '.appraisejs/m02-t2-r21-execution-review-01.json')
const PINS = Object.freeze({
  '.appraisejs/m02-ta-matrix-build-r21/manifest.json':
    '6b88000f383ecbac5ec55a0cb12a0fc39bd36abbce76d05958923c00a50d0303',
  '.appraisejs/m02-ta-matrix-build-r21/canonical-bridge.mjs':
    '8acadb617914321dbdb907faff17832aa0b6cf6d6b87fce68930c9828e8f94da',
  '.appraisejs/m02-ta-matrix-r21-source-review-01.json':
    '60c12f4a22d765aa1d83c352f6af4ddd02ea8cccb5323d8955cd27853805b960',
  '.appraisejs/m02-r21-offline-final-review-01.json':
    '9aeedba2243d0fea0854f80457d0099c3dfd658cdd6b44bde3164c2cff84e746',
  '.appraisejs/m02-t2-r21-exact-review.json': 'e1bffa213164786ac886e03e4e661f0c864e337d93140e76b78a1fd3419cb5d3',
  '.appraisejs/m02-t2-r21-recovery-user-decision.json':
    '07c0c362fd80f0e7d7bdf5cc36d96eeffd31804a0980026c26ab6d440c124baa',
  '.appraisejs/m02-t2-r21-execution-result-01.json': 'c4554badf5b8edb700665c685271a9e718782d59d306c9cb5d8d967549329a1a',
  '.appraisejs/m02-t2-r21-execution-review-01.json': '83a557788654d25340aa04fc345c68392f0afbdeaf8062e0c28f9bd9d7d1ac77',
  '.appraisejs/m02-ta-t2-r21-execution-evidence-01/index.json':
    'cb70aa99895b815f79a443f68472a8b2eb3a456370d4b85d1e8c2272fa87d54a',
  '.appraisejs/m02-r21-native-port-offline-repro-01.json':
    'd56d495b0543de7b313a5d072d912f4a407d05814ed710ea9bb326545ea2e941',
  'tasks/codex-app-server-journeys/m02-ta-t2-recovery-06.md':
    'aea1c4ad1c9c158edb60a086dac70a2c0d8ddb87212b316958aad24daefde983',
  'tasks/codex-app-server-journeys/m02-ta-r21-offline-record-01.md':
    '927bf4a1e87e3d5dc2409acc62c4efcd871560b95c97faaacfb4a77594745018',
  'tasks/codex-app-server-journeys/m02-ta-t2-runtime-record-07.md':
    '06d54b5739dacbdae148fca2584d10e9811e1f364b4a2e42c43827d46d3c9bf6',
})

export async function verifyR21Predecessor({ requireNewRootAbsent = true } = {}) {
  const pinnedFiles = []
  const fixed = new Map()
  for (const [relativePath, expected] of Object.entries(PINS)) {
    const path = join(REPO, relativePath)
    fixed.set(path, await readClaimBytes(path, expected))
    pinnedFiles.push(path)
  }
  const review = JSON.parse(fixed.get(R21_SOURCE_REVIEW))
  const actual = JSON.parse(fixed.get(R21_ACTUAL_REVIEW))
  const visible = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-t2-r21-execution-result-01.json')))
  const index = JSON.parse(fixed.get(join(REPO, '.appraisejs/m02-ta-t2-r21-execution-evidence-01/index.json')))
  const envelope = JSON.parse(fixed.get(R21_MANIFEST))
  if (
    review.schema !== 'appraise.m02-ta-matrix-r21-source-review/v1' ||
    review.verdict !== 'ACCEPT_EXACT_OFFLINE_SOURCE_FOR_ONE_PREPARE_ONLY' ||
    review.pins?.sourceTree?.files !== 23 ||
    review.pins?.tests?.length !== 3 ||
    envelope.schema !== 'appraise.m02-ta-matrix-r21-preparation/v1' ||
    digest(envelope.manifest) !== envelope.manifestDigest ||
    envelope.manifestDigest !== '40435b9a144e603034026e1fa836e824add4e4db5583a74418f0daf325237ca5' ||
    actual.verdict !== 'ACCEPT_ACTUAL_R21_TERMINAL_UNKNOWN_NO_T2_QUALIFICATION' ||
    actual.actualOutcome?.status !== 'UNKNOWN' ||
    actual.actualOutcome?.completedCases !== 0 ||
    actual.actualOutcome?.listenerReservation?.effect !== 'UNKNOWN' ||
    actual.actualOutcome?.listenerReservation?.cleanup !== 'UNKNOWN' ||
    visible.runtime?.status !== 'UNKNOWN' ||
    visible.runtime?.completed !== 0 ||
    visible.runtime?.sourceHostCapacity?.B01 !== 4 ||
    visible.runtime?.counts?.listenerStarts !== 1 ||
    index.sourceRoot !== R21_ROOT ||
    index.outcome !== 'UNKNOWN' ||
    index.completed !== 0 ||
    index.records?.length !== 291 ||
    index.records.filter(x => x.status === 'COPIED').length !== 3
  )
    throw new Error('R23 predecessor evidence contradiction')
  const tree = review.pins.sourceTree.entries
  if (tree?.length !== 23 || new Set(tree.map(x => x.name)).size !== 23) throw new Error('R21 source review tree drift')
  const sourceDir = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r21')
  const names = (await fs.readdir(sourceDir)).sort()
  if (JSON.stringify(names) !== JSON.stringify(tree.map(x => x.name).sort()))
    throw new Error('R21 source membership drift')
  const treeHash = createHash('sha256')
  for (const row of [...tree].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[a-z0-9-]+\.mjs$/.test(row.name)) throw new Error('R21 source name drift')
    const file = join(sourceDir, row.name)
    await readClaimBytes(file, row.sha256)
    pinnedFiles.push(file)
    treeHash.update(row.name).update('\0').update(row.sha256).update('\n')
  }
  if (treeHash.digest('hex') !== review.pins.sourceTree.sha256) throw new Error('R21 source tree digest drift')
  for (const row of review.pins.tests) {
    const file = join(REPO, row.path)
    await readClaimBytes(file, row.sha256)
    pinnedFiles.push(file)
  }
  const retained = await verifyRetainedP7()
  await assertHistoricalRoot(R21_ROOT, retained.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(R23_ROOT)
  const ta04 = await verifyTA04History({ requireNewRootAbsent: false })
  const old = envelope.manifest
  const witnessPaths = new Set(ta04.historicalSources.map(x => x.path))
  if (
    witnessPaths.size !== 23 ||
    old.artifacts.filter(x => x.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED').length !== 23 ||
    old.artifacts.length !== 6584 ||
    old.root !== R21_ROOT ||
    old.version !== 'appraise.m02-ta-matrix-r21/v1' ||
    old.priorEvidence?.p1?.status !== 'UNKNOWN' ||
    old.priorEvidence?.p2?.status !== 'UNKNOWN' ||
    old.priorEvidence?.p3?.status !== 'UNKNOWN' ||
    old.priorEvidence?.p4?.status !== 'UNKNOWN'
  )
    throw new Error('R21 manifest closure drift')
  for (const row of old.artifacts) {
    if (witnessPaths.has(row.path)) {
      const witness = ta04.historicalSources.find(x => x.path === row.path)
      if (row.availability !== 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' || row.sha256 !== witness.sha256)
        throw new Error('R21 historical mapping drift')
    } else {
      if (row.availability === 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED')
        throw new Error('R21 untrusted historical label')
      if (row.path === ROOT_PACKAGE && row.sha256 === OLD_PACKAGE_SHA) await qualifyRootPackage()
      else await readClaimBytes(row.path, row.sha256)
    }
  }
  await assertHistoricalRoot(R21_ROOT, retained.rootIdentity)
  if (requireNewRootAbsent) await requireTA04Absent(R23_ROOT)
  return Object.freeze({
    manifest: old,
    ta04,
    pinnedFiles: Object.freeze([...new Set(pinnedFiles)]),
    rootIdentity: retained.rootIdentity,
    currentOriginalRootIdentity: 'UNKNOWN',
    journalSha256: retained.journalSha256,
  })
}

export async function verifyRetainedP7() {
  const rootIdentity = Object.freeze({ dev: 16777233, ino: 69112685 })
  await assertHistoricalRoot(R21_ROOT, rootIdentity)
  const journalPath = join(R21_ROOT, 'phase-journal.jsonl')
  const journalSha256 = '4a46da63f2e9e609281c6a7d4b338d2b44f22ded8dbda4b01bffae4b38f1f617'
  const bytes = await readClaimBytes(journalPath, journalSha256)
  if (bytes.length !== 1207) throw new Error('retained p7 historical journal length drift')
  await assertHistoricalRoot(R21_ROOT, rootIdentity)
  return Object.freeze({
    rootIdentity,
    currentOriginalRootIdentity: 'UNKNOWN',
    journalSha256,
  })
}
