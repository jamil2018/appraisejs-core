/** Read-only proof of consumed p4 and the accepted earlier UNKNOWN chain. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPriorT2Unknown as verifyP1P2P3 } from '../codex-app-server-m02-ta-matrix-r17/prior-evidence.mjs'
import { POLICY, PRIOR_ROOT, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r17-execution-evidence-01')
const INDEX = join(ARCHIVE, 'index.json')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r17-execution-review-01.json')
const RESULT = join(REPO, '.appraisejs/m02-t2-r17-execution-result-01.json')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r17/manifest.json')
const CANONICAL = join(REPO, '.appraisejs/m02-ta-matrix-build-r17/canonical-bridge.mjs')
const EXACT_REVIEW = join(REPO, '.appraisejs/m02-t2-r17-exact-review.json')
const DECISION = join(REPO, '.appraisejs/m02-t2-r17-recovery-user-decision.json')
const EXPECTED = Object.freeze({
  index: '941adadd5cd685e9b0a0b6594d13721db8a83dfac25477e41f071bad7c38265b',
  review: '3976c3c5f442ae6c856db9ca55ea1709c87a17c6dada436408c4e72005034535',
  result: '563bdfbbd81fab254df49f4b15e35c0dea9725d1b77918d585b5d04341406c29',
  manifest: '1152b718d331be89c4c2c49227effd8d9435a2b4062dc01f24e33006ec854124',
  manifestDigest: 'f66dcb2379ef2deb4f9e4076b13a31d0e7377a80de49ecf0873b18a716e8d871',
  canonical: '8d03c8156ce171c63135c57b716ee5b3e6b679cf3dc18005d87f0fa45eed1893',
  exactReview: '06390562c5392a15a5b3ea40e75c494d3ae1b154f7f41790712f07ad4d0296d2',
  decision: '5342de8f6cf0d0430d7baeafb3947428af40b75e48fae6f1e188601408c6741d',
  journal: '219c30ab437b5f7d98617f0ad54ff4f7bad0784fad1a8292cbc541aa9a3ebb4e',
  terminalHash: '29735e88459636415866b241acdbb0e5bbe02ddcc7a462a7a533d48cad733c7a',
  rootDev: 16777230,
  rootIno: 69032559,
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])
const caseSet = new Set(POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id))
const safeReceipt =
  /^(?:mcp-startup|mcp-exit|script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)\.json$/
const safeSource = source => {
  if (['phase-journal.jsonl', 'supervisor/module-stage.json', 'startup-failure.json'].includes(source)) return true
  const match = /^cases\/([^/]+)\/supervisor\/([^/]+)$/.exec(source ?? '')
  return Boolean(match && caseSet.has(match[1]) && safeReceipt.test(match[2]))
}

async function exactFile(file, expected, max = 40 * 1024 * 1024) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & 0o022) !== 0 ||
    before.nlink !== 1 ||
    before.size > max
  )
    throw new Error('p4 file identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!same(before, held)) throw new Error('p4 file replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const pathAfter = await fs.lstat(file)
    if (!same(before, after) || !same(before, pathAfter) || bytes.length !== before.size || sha(bytes) !== expected)
      throw new Error('p4 file changed or hash drift')
    return bytes
  } finally {
    await handle.close()
  }
}

function verifyJournal(bytes) {
  if (sha(bytes) !== EXPECTED.journal) throw new Error('p4 journal hash drift')
  const source = bytes.toString('utf8')
  const lines = source.trimEnd().split('\n')
  if (!source.endsWith('\n') || lines.length !== 30) throw new Error('p4 journal record count drift')
  let previous = '0'.repeat(64)
  for (const [index, line] of lines.entries()) {
    const record = JSON.parse(line)
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      throw new Error('p4 journal chain drift')
    if (
      index === 0 &&
      (record.event?.type !== 'init' ||
        record.event.directoryIdentity?.dev !== EXPECTED.rootDev ||
        record.event.directoryIdentity?.ino !== EXPECTED.rootIno)
    )
      throw new Error('p4 journal root drift')
    if (
      index === 26 &&
      (record.event?.type !== 'reserve' ||
        record.event.kind !== 'providerRequests' ||
        record.event.id !== 'B01-listener-request-2')
    )
      throw new Error('p4 pending provider reservation drift')
    if (index === 27 && (record.event?.type !== 'unknown' || record.event.reason !== 'AMBIGUOUS_EFFECT'))
      throw new Error('p4 UNKNOWN drift')
    previous = record.hash
  }
  if (previous !== EXPECTED.terminalHash) throw new Error('p4 journal terminal drift')
}

export async function verifyConsumedR17({ requireNewRootAbsent = true } = {}) {
  const earlier = await verifyP1P2P3({ requireNewRootAbsent: false })
  if (earlier.status !== 'PRIOR_P1_P2_P3_UNKNOWN_PRESERVED') throw new Error('earlier UNKNOWN drift')
  const fixed = [
    [INDEX, EXPECTED.index],
    [REVIEW, EXPECTED.review],
    [RESULT, EXPECTED.result],
    [MANIFEST, EXPECTED.manifest],
    [CANONICAL, EXPECTED.canonical],
    [EXACT_REVIEW, EXPECTED.exactReview],
    [DECISION, EXPECTED.decision],
  ]
  const bytes = await Promise.all(fixed.map(([file, hash]) => exactFile(file, hash)))
  const [index, review, result, envelope] = bytes.slice(0, 4).map(value => JSON.parse(value))
  const root = await fs.lstat(PRIOR_ROOT)
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid() ||
    (root.mode & 0o777) !== 0o700 ||
    root.dev !== EXPECTED.rootDev ||
    root.ino !== EXPECTED.rootIno
  )
    throw new Error('p4 root identity drift')
  if (
    index.schema !== 'appraise.m02-ta-r17-sanitized-evidence-archive/v1' ||
    index.sourceRoot !== PRIOR_ROOT ||
    index.sourceRootIdentity?.dev !== root.dev ||
    index.sourceRootIdentity?.ino !== root.ino ||
    index.manifestDigest !== EXPECTED.manifestDigest ||
    index.manifestSha256 !== EXPECTED.manifest ||
    index.outcome !== 'UNKNOWN' ||
    index.completed !== 0 ||
    index.failedCase !== 'B01' ||
    index.sourceEvidenceChanged !== false ||
    index.records?.length !== 267 ||
    review.schema !== 'appraise.m02-ta-t2-r17-actual-review/v1' ||
    review.runtimeVerdict !== 'UNKNOWN' ||
    review.journal?.records !== 30 ||
    review.journal.pending?.length !== 1 ||
    review.journal.pending[0]?.kind !== 'providerRequests' ||
    review.journal.pending[0]?.id !== 'B01-listener-request-2' ||
    review.journal.counts?.providerRequests !== 2 ||
    review.journal.counts?.outerCalls !== 1 ||
    review.journal.counts?.scopedCalls !== 0 ||
    review.journal.sourceCapacityReserved !== 4 ||
    review.root?.dev !== root.dev ||
    review.root?.ino !== root.ino ||
    review.safeArchive?.indexSha256 !== EXPECTED.index ||
    review.safeArchive.copied !== 6 ||
    review.safeArchive.missingENOENT !== 261 ||
    review.safeArchive.sourceEvidenceChanged !== false ||
    review.cleanup?.completeOwnedCleanupProved !== false ||
    review.scope?.newCampaignAuthorized !== false ||
    result.status !== 'UNKNOWN' ||
    result.completed !== 0 ||
    result.root !== PRIOR_ROOT ||
    envelope.schema !== 'appraise.m02-ta-matrix-r17-preparation/v1' ||
    envelope.manifestDigest !== EXPECTED.manifestDigest ||
    envelope.manifest?.root !== PRIOR_ROOT ||
    envelope.manifest.artifacts?.length !== 6470 ||
    envelope.canonicalSha256 !== EXPECTED.canonical
  )
    throw new Error('p4 UNKNOWN evidence shape drift')
  const archiveNames = new Set(['index.json'])
  const pinned = fixed.map(([file]) => file)
  let copied = 0,
    missing = 0,
    journal = null
  for (const record of index.records) {
    if (!safeSource(record.source) || record.sourceRelativePath !== record.source)
      throw new Error('p4 unsafe archive source')
    const current = join(PRIOR_ROOT, record.source)
    if (record.status === 'MISSING_ENOENT') {
      missing++
      if (record.copy !== undefined || record.sha256 !== undefined) throw new Error('p4 missing record drift')
      try {
        await fs.lstat(current)
        throw new Error('p4 missing source appeared')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      record.status !== 'COPIED' ||
      record.copy !== record.source.replaceAll('/', '--') ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 2 ||
      archiveNames.has(record.copy)
    )
      throw new Error('p4 copied record drift')
    const archiveFile = join(ARCHIVE, record.copy)
    const [archiveBytes, currentBytes] = await Promise.all([
      exactFile(archiveFile, record.sha256),
      exactFile(current, record.sha256),
    ])
    if (archiveBytes.length !== record.bytes || !archiveBytes.equals(currentBytes))
      throw new Error('p4 archive/source mismatch')
    if (record.source === 'phase-journal.jsonl') journal = archiveBytes
    archiveNames.add(record.copy)
    pinned.push(archiveFile, current)
    copied++
  }
  if (copied !== 6 || missing !== 261 || !journal) throw new Error('p4 archive set drift')
  verifyJournal(journal)
  const actualNames = await fs.readdir(ARCHIVE)
  if (actualNames.length !== archiveNames.size || actualNames.some(name => !archiveNames.has(name)))
    throw new Error('p4 archive directory drift')
  if (requireNewRootAbsent) {
    try {
      await fs.lstat(ROOT)
      throw new Error('fresh p5 root already exists; no resume')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return Object.freeze({
    status: 'PRIOR_P1_P2_P3_P4_UNKNOWN_PRESERVED',
    manifest: envelope.manifest,
    p1: earlier.p1,
    p2: earlier.p2,
    p3: earlier.p3,
    p4: Object.freeze({
      archiveIndexSha256: EXPECTED.index,
      actualReviewSha256: EXPECTED.review,
      resultSha256: EXPECTED.result,
      journalSha256: EXPECTED.journal,
      terminalHash: EXPECTED.terminalHash,
      rootIdentity: Object.freeze({ dev: root.dev, ino: root.ino }),
      consumed: Object.freeze({ providerRequests: 2, outerCalls: 1, sourceCapacity: 4 }),
    }),
    pinnedFiles: Object.freeze([...new Set([...earlier.pinnedFiles, ...pinned])]),
  })
}
