/** TA06 additive archival semantic replay. Recorded original identities remain historical; current original identity is UNKNOWN. */
/** Exact R22 reviewed-but-unlaunched provenance; TA05 is a separate current-file claim. */
import fs from 'node:fs/promises'
import { readClaimBytes } from './ta06-archive.mjs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { digest } from '../codex-app-server-m02-ta-matrix-r23/policy.mjs'
import { verifyR21Predecessor } from './history-r21-evidence.mjs'
import {
  ROOT_PACKAGE,
  OLD_PACKAGE_SHA,
  qualifyRootPackage,
} from '../codex-app-server-m02-ta-matrix-r23/package-qualification.mjs'
import { requireTA04Absent } from '../codex-app-server-m02-ta-matrix-r23/prior-evidence.mjs'
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r22')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r22-exact-review.json')
const BLOCKED = join(REPO, '.appraisejs/m02-r22-approved-blocked-current-pin-drift-01.json')
const EXPECTED_MANIFEST = 'a35aef1ffe9e5dda2c9108195d7f01e6b879df6f4ea963d3355772d2ce69ddd6'
const EXPECTED_REVIEW = '6f23c548f947d8cbf79899d02a7fea309aff3472f7307806fc2d40550bb1220b'

export async function verifyR22Predecessor({ requireNewRootAbsent = true } = {}) {
  const actual = await verifyR21Predecessor({ requireNewRootAbsent })
  const packageQualification = await qualifyRootPackage()
  const envelope = JSON.parse(await readClaimBytes(join(BUILD, 'manifest.json'), EXPECTED_MANIFEST))
  const review = JSON.parse(await readClaimBytes(REVIEW, EXPECTED_REVIEW))
  const old = envelope.manifest
  if (
    envelope.schema !== 'appraise.m02-ta-matrix-r22-preparation/v1' ||
    envelope.manifestDigest !== '38a6bd1c2552275068b8a5e09c9a89d8567dafdd989e26da9368018a008ae0b4' ||
    digest(old) !== envelope.manifestDigest ||
    old.version !== 'appraise.m02-ta-matrix-r22/v1' ||
    old.root !== '/private/tmp/appraise-m02-ta-matrix-p8' ||
    old.artifacts.length !== 6628 ||
    review.verdict !== 'ACCEPT_ONE_FIXED_T2_R22_INVOCATION' ||
    review.runtimeVerdict !== 'NOT_RUN'
  )
    throw new Error('R23 exact R22 predecessor drift')
  const pinned = new Set([...actual.pinnedFiles, join(BUILD, 'manifest.json'), REVIEW, BLOCKED])
  const historical = new Map(actual.ta04.historicalSources.map(x => [x.path, x]))
  for (const row of old.artifacts) {
    if (historical.has(row.path)) {
      if (
        row.availability !== 'HISTORICAL_SOURCE_ABSENT_ARCHIVE_VERIFIED' ||
        row.sha256 !== historical.get(row.path).sha256
      )
        throw new Error('R23 R22 historical claim drift')
    } else if (row.path === ROOT_PACKAGE) {
      if (row.sha256 !== OLD_PACKAGE_SHA || row.availability !== undefined)
        throw new Error('R23 old package claim drift')
    } else {
      if (row.availability !== undefined) throw new Error('R23 unexpected predecessor availability')
      await readClaimBytes(row.path, row.sha256)
      pinned.add(row.path)
    }
  }
  // Pin complete source/test/helper membership, not merely a count or label.
  for (const [group, match, expectedCount] of [
    ['sourceTree', p => p.includes('/fixtures/codex-app-server-m02-ta-matrix-r22/'), 24],
    ['testTree', p => /\/codex-app-server-m02-ta-matrix-r22-(cases|prior|composed)\.test\.mjs$/.test(p), 3],
    ['helperTree', p => /\/fixtures\/codex-app-server-m02-ta-matrix-r22-(offline|composed)\//.test(p), 4],
  ]) {
    const rows = old.artifacts
      .filter(x => match(x.path))
      .sort((a, b) => relative(REPO, a.path).localeCompare(relative(REPO, b.path)))
    const hash = createHash('sha256')
    for (const row of rows) hash.update(relative(REPO, row.path)).update('\0').update(row.sha256).update('\n')
    if (
      rows.length !== expectedCount ||
      review[group]?.files !== expectedCount ||
      review[group].sha256 !== hash.digest('hex')
    )
      throw new Error('R23 R22 reviewed membership drift')
  }
  const sourceNames = await fs.readdir(join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22'))
  if (sourceNames.length !== 24 || sourceNames.some(x => !/^[a-z0-9-]+\.mjs$/.test(x)))
    throw new Error('R23 R22 source additions')
  for (const suffix of ['offline', 'composed']) {
    const directory = join(REPO, `scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r22-${suffix}`)
    const names = await fs.readdir(directory)
    const pins = old.artifacts
      .filter(x => x.path.startsWith(directory + '/'))
      .map(x => x.path)
      .sort()
    if (JSON.stringify(names.map(x => join(directory, x)).sort()) !== JSON.stringify(pins))
      throw new Error('R23 R22 helper additions')
  }
  const blockedBytes = await readClaimBytes(BLOCKED, '00bd8f8d7cb5f6e7ef33824253aa1bf45d91434bf625c7bc8e399d67b8425868')
  const blocked = JSON.parse(blockedBytes)
  if (
    blocked.schema !== 'appraise.m02-r22-approved-blocked-before-precheck/v1' ||
    blocked.status !== 'APPROVED_BUT_BLOCKED_BY_CURRENT_PIN_DRIFT_BEFORE_ACTUAL_PRECHECK' ||
    blocked.actualPrecheckSubmitted !== false ||
    blocked.runtimeSubmitted !== false ||
    blocked.nativeAllocationsConsumed !== 0 ||
    blocked.manifestSha256 !== EXPECTED_MANIFEST ||
    blocked.exactReviewSha256 !== EXPECTED_REVIEW ||
    blocked.package?.oldSha256 !== OLD_PACKAGE_SHA ||
    blocked.package.currentSha256 !== packageQualification.currentSha256
  )
    throw new Error('R23 R22 unlaunched evidence drift')
  for (const [file, expected] of [
    [join(BUILD, 'canonical-bridge.mjs'), 'b3c620aec79545d6166ff00c0ce9c0b52cf5ba5fa700f605216f57fae071bc55'],
    [
      join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-r22-authorization-request-01.md'),
      'dce22f0b79854fd9b40c0cbd977b848fb41fa3f3b12900e699a1a5fda978714c',
    ],
    [
      join(REPO, '.appraisejs/m02-r22-proposed-decision-template-01.json'),
      '6eb01cd06a6876ab6f64892c67df32fcb4cad1b495ffab2f9ae95deb353f5b8c',
    ],
  ]) {
    await readClaimBytes(file, expected)
    pinned.add(file)
  }
  await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p8')
  await requireTA04Absent(join(REPO, '.appraisejs/m02-t2-r22-recovery-user-decision.json'))
  if (requireNewRootAbsent) await requireTA04Absent('/private/tmp/appraise-m02-ta-matrix-p9')
  return Object.freeze({
    ...actual,
    manifest: old,
    packageQualification,
    pinnedFiles: [...pinned],
    blockedEvidence: Object.freeze({
      path: BLOCKED,
      sha256: createHash('sha256').update(blockedBytes).digest('hex'),
      status: 'APPROVED_BLOCKED_BEFORE_PRECHECK',
      nativeAllocationsConsumed: 0,
      p8Absent: true,
      manifestSha256: EXPECTED_MANIFEST,
      exactReviewSha256: EXPECTED_REVIEW,
    }),
  })
}
