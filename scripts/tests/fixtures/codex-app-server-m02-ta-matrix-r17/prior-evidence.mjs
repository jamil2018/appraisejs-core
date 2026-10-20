/** Read-only proof that p1, p2 and p3 remain distinct consumed UNKNOWN attempts. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, ROOT, PRIOR_ROOT } from './policy.mjs'
import { verifyPriorT2Unknown as verifyP1P2 } from '../codex-app-server-m02-ta-matrix-r13/prior-evidence.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r13-execution-evidence-01')
const INDEX = join(ARCHIVE, 'index.json')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r13-execution-review-01.json')
const RESULT = join(REPO, '.appraisejs/m02-t2-r13-execution-result-01.json')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r13/manifest.json')
const CANONICAL = join(REPO, '.appraisejs/m02-ta-matrix-build-r13/canonical-bridge.mjs')
const EXACT_REVIEW = join(REPO, '.appraisejs/m02-t2-r13-exact-review.json')
const DECISION = join(REPO, '.appraisejs/m02-t2-r13-recovery-user-decision.json')
const EXPECTED = Object.freeze({
  index: 'a76be9ed669ee632a2a0222ab4e6dd0c4030a7019f1fb1f73a3746a9180f3784',
  review: '05a68bcbaaa6da09241d34f1800bad81f632b5c7ee13f52507c7fcc671fad028',
  result: 'bf210bec8a84625676e9e263199aee0e74bc72b3b4f2b12db58bb14575f20a6e',
  manifest: '23a57757e47d07925a54a3bc7785f02495a56e26c6769476a2cda7bf75fb35a2',
  manifestDigest: '29be1981e3602042b9652faaabfb6f0aec097479239fde226c499bc28aada565',
  canonical: 'c4cfd55d559a426d9f11a4e1bf50ad3d986a980dc272fc286d823cf49af167da',
  exactReview: '11a58fa5aa1f2a3a2ee905cf4c247c3c5cea7f7829b57bec8a289a45bbdfef2c',
  decision: '6be00c7182c2169d0c66ad06ea58274827f820928b5626da490986d539e3d378',
  journal: '5424f2dcb3474a77561d5a904aabc5f64f8568f7491c9648ecca9bd4edd5cdd4',
  terminalHash: '4c74d44842fb45796112678f61107e68d6049ce2030ea589a03912d07058c5d8',
  rootDev: 16777230,
  rootIno: 68938534,
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])
const caseSet = new Set(POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id))
const receipt =
  /^(?:mcp-startup|mcp-exit|script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)\.json$/
function safeSource(source) {
  if (['phase-journal.jsonl', 'supervisor/module-stage.json', 'startup-failure.json'].includes(source)) return true
  const match = /^cases\/([^/]+)\/supervisor\/([^/]+)$/.exec(source ?? '')
  return Boolean(match && caseSet.has(match[1]) && receipt.test(match[2]))
}

async function exactFile(file, expected, { max = 8 * 1024 * 1024 } = {}) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & 0o022) !== 0 ||
    before.nlink !== 1 ||
    before.size > max
  )
    throw new Error('prior p3 file identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!identity(before, held)) throw new Error('prior p3 file replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const pathAfter = await fs.lstat(file)
    if (
      !identity(before, after) ||
      !identity(before, pathAfter) ||
      bytes.length !== before.size ||
      sha(bytes) !== expected
    )
      throw new Error('prior p3 file hash or identity drift')
    return bytes
  } finally {
    await handle.close()
  }
}

function verifyJournal(bytes, review) {
  if (sha(bytes) !== EXPECTED.journal || review.journal?.terminalHash !== EXPECTED.terminalHash)
    throw new Error('prior p3 journal hash drift')
  const text = bytes.toString('utf8')
  const lines = text.trimEnd().split('\n')
  if (!text.endsWith('\n') || lines.length !== 5) throw new Error('prior p3 journal length drift')
  let previous = '0'.repeat(64)
  for (const [index, line] of lines.entries()) {
    const record = JSON.parse(line)
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      throw new Error('prior p3 journal chain drift')
    if (
      index === 0 &&
      (record.event?.type !== 'init' ||
        record.event.phase !== 'T2' ||
        record.event.directoryIdentity?.dev !== EXPECTED.rootDev ||
        record.event.directoryIdentity?.ino !== EXPECTED.rootIno)
    )
      throw new Error('prior p3 journal root drift')
    if (
      index === 1 &&
      (record.event?.type !== 'begin' || record.event.caseId !== 'B01' || record.event.sourceHostCapacity !== 4)
    )
      throw new Error('prior p3 source reservation drift')
    if (
      index === 2 &&
      (record.event?.type !== 'reserve' || record.event.kind !== 'listenerStarts' || record.event.id !== 'B01-listener')
    )
      throw new Error('prior p3 pending listener drift')
    if (index === 3 && (record.event?.type !== 'unknown' || record.event.reason !== 'AMBIGUOUS_EFFECT'))
      throw new Error('prior p3 UNKNOWN drift')
    if (index === 4 && (record.event?.type !== 'recovery' || record.event.action !== 'owned-stop-intent'))
      throw new Error('prior p3 stop intent drift')
    previous = record.hash
  }
  if (previous !== EXPECTED.terminalHash) throw new Error('prior p3 terminal hash drift')
}

export async function verifyPriorT2Unknown({ requireNewRootAbsent = true, readPinned = exactFile } = {}) {
  const old = await verifyP1P2({ requireNewRootAbsent: false })
  if (old.status !== 'PRIOR_P1_P2_UNKNOWN_PRESERVED') throw new Error('prior p1/p2 UNKNOWN drift')
  const [indexBytes, reviewBytes, resultBytes, manifestBytes, canonicalBytes, exactReviewBytes, decisionBytes] =
    await Promise.all([
      readPinned(INDEX, EXPECTED.index),
      readPinned(REVIEW, EXPECTED.review),
      readPinned(RESULT, EXPECTED.result),
      readPinned(MANIFEST, EXPECTED.manifest),
      readPinned(CANONICAL, EXPECTED.canonical, { max: 40 * 1024 * 1024 }),
      readPinned(EXACT_REVIEW, EXPECTED.exactReview),
      readPinned(DECISION, EXPECTED.decision),
    ])
  if (
    [
      [indexBytes, EXPECTED.index],
      [reviewBytes, EXPECTED.review],
      [resultBytes, EXPECTED.result],
      [manifestBytes, EXPECTED.manifest],
      [canonicalBytes, EXPECTED.canonical],
      [exactReviewBytes, EXPECTED.exactReview],
      [decisionBytes, EXPECTED.decision],
    ].some(([bytes, expected]) => !Buffer.isBuffer(bytes) || sha(bytes) !== expected)
  )
    throw new Error('prior p3 pinned evidence drift')
  const index = JSON.parse(indexBytes)
  const review = JSON.parse(reviewBytes)
  const result = JSON.parse(resultBytes)
  const envelope = JSON.parse(manifestBytes)
  const exactReview = JSON.parse(exactReviewBytes)
  const decision = JSON.parse(decisionBytes)
  const root = await fs.lstat(PRIOR_ROOT)
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid() ||
    (root.mode & 0o777) !== 0o700 ||
    root.dev !== EXPECTED.rootDev ||
    root.ino !== EXPECTED.rootIno
  )
    throw new Error('prior p3 root identity drift')
  if (
    index.schema !== 'appraise.m02-ta-r13-sanitized-evidence-archive/v1' ||
    index.sourceRoot !== PRIOR_ROOT ||
    index.rootIdentity?.dev !== root.dev ||
    index.rootIdentity?.ino !== root.ino ||
    index.manifestDigest !== EXPECTED.manifestDigest ||
    index.manifestSha256 !== EXPECTED.manifest ||
    index.outcome !== 'UNKNOWN' ||
    index.completed !== 0 ||
    index.failedCase !== 'B01' ||
    index.sourceEvidenceChanged !== false ||
    index.records?.length !== 267 ||
    review.schema !== 'appraise.m02-ta-t2-r13-actual-failure-review/v1' ||
    review.verdict !== 'ACCEPT_ACTUAL_R13_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION' ||
    review.runtimeVerdict !== 'UNKNOWN' ||
    review.unresolvedUnknown !== true ||
    review.casesCompleted !== 0 ||
    review.execution?.root !== PRIOR_ROOT ||
    review.execution.rootIdentity?.dev !== root.dev ||
    review.execution.rootIdentity?.ino !== root.ino ||
    review.archive?.indexSha256 !== EXPECTED.index ||
    review.archive.copied !== 3 ||
    review.archive.missingENOENT !== 264 ||
    review.archive.extraArchiveEntries !== false ||
    review.journal?.sha256 !== EXPECTED.journal ||
    review.journal.unknown !== true ||
    review.journal.reason !== 'AMBIGUOUS_EFFECT' ||
    review.journal.records !== 5 ||
    review.journal.sourceHostCapacityReserved !== 4 ||
    review.journal.counts?.listenerStarts !== 1 ||
    review.journal.counts?.controlWrites !== 0 ||
    review.journal.counts?.codexStarts !== 0 ||
    review.journal.counts?.mcpStarts !== 0 ||
    review.journal.counts?.threadStarts !== 0 ||
    review.journal.counts?.turnStarts !== 0 ||
    review.journal.counts?.providerRequests !== 0 ||
    review.journal.counts?.canonicalRequests !== 0 ||
    review.journal.counts?.scopedCalls !== 0 ||
    review.journal.counts?.outerCalls !== 0 ||
    review.journal.pending?.length !== 1 ||
    review.journal.pending[0]?.id !== 'B01-listener' ||
    review.journal.listenerStartAcknowledged !== false ||
    review.cleanup?.completeOwnedCleanupProved !== false ||
    result.status !== 'UNKNOWN' ||
    result.completed !== 0 ||
    result.root !== PRIOR_ROOT ||
    result.rootIdentity?.dev !== root.dev ||
    result.rootIdentity?.ino !== root.ino ||
    result.counts?.listenerStarts !== 1 ||
    result.sourceCapacityReserved !== 4 ||
    result.cleanup !== 'UNKNOWN_NO_PERSISTED_OWNED_STOP_OBSERVED_OR_EXIT_CLOSE_HOST_ABSENCE' ||
    result.archiveIndexSha256 !== EXPECTED.index ||
    result.newCampaignAuthorized !== false ||
    envelope.schema !== 'appraise.m02-ta-matrix-r13-preparation/v1' ||
    envelope.manifestDigest !== EXPECTED.manifestDigest ||
    envelope.manifest?.root !== PRIOR_ROOT ||
    envelope.manifest.artifacts?.length !== 6413 ||
    envelope.canonicalSha256 !== EXPECTED.canonical ||
    canonicalBytes.length === 0 ||
    exactReview.verdict !== 'ACCEPT_ONE_FIXED_T2_R13_INVOCATION' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_T2_R13_RECOVERY'
  )
    throw new Error('prior p3 UNKNOWN evidence shape drift')
  if (new Set(index.records.map(item => item.source)).size !== 267) throw new Error('prior p3 duplicate source')
  const pinnedFiles = [INDEX, REVIEW, RESULT, MANIFEST, CANONICAL, EXACT_REVIEW, DECISION]
  const archiveEntries = new Set(['index.json'])
  let copied = 0,
    missing = 0,
    journalBytes = null
  for (const record of index.records) {
    const source = record.source
    if (!safeSource(source) || record.sourceRelativePath !== source) throw new Error('prior p3 unsafe source')
    const current = join(PRIOR_ROOT, source)
    if (record.status === 'MISSING_ENOENT') {
      missing++
      if (record.copy !== undefined || record.sha256 !== undefined) throw new Error('prior p3 missing record drift')
      try {
        await fs.lstat(current)
        throw new Error('prior p3 missing source appeared')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      record.status !== 'COPIED' ||
      record.copy !== source.replaceAll('/', '--') ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 2 ||
      archiveEntries.has(record.copy)
    )
      throw new Error('prior p3 copied record drift')
    const archiveFile = join(ARCHIVE, record.copy)
    const [archiveBytes, currentBytes] = await Promise.all([
      exactFile(archiveFile, record.sha256),
      exactFile(current, record.sha256),
    ])
    if (
      archiveBytes.length !== record.bytes ||
      currentBytes.length !== record.bytes ||
      !archiveBytes.equals(currentBytes)
    )
      throw new Error('prior p3 archive equality drift')
    if (source === 'phase-journal.jsonl') journalBytes = archiveBytes
    archiveEntries.add(record.copy)
    pinnedFiles.push(archiveFile, current)
    copied++
  }
  if (copied !== 3 || missing !== 264 || !journalBytes) throw new Error('prior p3 archive set drift')
  verifyJournal(journalBytes, review)
  const actualArchiveEntries = await fs.readdir(ARCHIVE)
  if (
    actualArchiveEntries.length !== archiveEntries.size ||
    actualArchiveEntries.some(name => !archiveEntries.has(name))
  )
    throw new Error('prior p3 archive directory changed')
  if (requireNewRootAbsent) {
    try {
      await fs.lstat(ROOT)
      throw new Error('fresh p4 root already exists; no resume')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return Object.freeze({
    status: 'PRIOR_P1_P2_P3_UNKNOWN_PRESERVED',
    manifest: envelope.manifest,
    priorManifestDigest: EXPECTED.manifestDigest,
    priorManifestSha256: EXPECTED.manifest,
    priorCanonicalSha256: EXPECTED.canonical,
    p1: old.p1,
    p2: old.p2,
    p3: Object.freeze({
      archiveIndexSha256: EXPECTED.index,
      actualReviewSha256: EXPECTED.review,
      resultSha256: EXPECTED.result,
      journalSha256: EXPECTED.journal,
      terminalHash: EXPECTED.terminalHash,
      rootIdentity: Object.freeze({ dev: root.dev, ino: root.ino }),
      consumed: Object.freeze({ listenerStarts: 1, sourceCapacity: 4 }),
    }),
    pinnedFiles: Object.freeze([...new Set([...old.pinnedFiles, ...pinnedFiles])]),
  })
}
