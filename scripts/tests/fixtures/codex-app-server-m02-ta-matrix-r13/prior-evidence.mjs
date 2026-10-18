/** Read-only proof that p1 and p2 remain distinct consumed UNKNOWN attempts. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, ROOT, PRIOR_ROOT } from './policy.mjs'
import { verifyPriorT2Unknown as verifyP1 } from '../codex-app-server-m02-ta-matrix-r12/prior-evidence.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r12-execution-evidence-01')
const INDEX = join(ARCHIVE, 'index.json')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r12-execution-review-01.json')
const RESULT = join(REPO, '.appraisejs/m02-t2-r12-execution-result-01.json')
const MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r12/manifest.json')
const CANONICAL = join(REPO, '.appraisejs/m02-ta-matrix-build-r12/canonical-bridge.mjs')
const EXACT_REVIEW = join(REPO, '.appraisejs/m02-t2-r12-exact-review.json')
const DECISION = join(REPO, '.appraisejs/m02-t2-r12-recovery-user-decision.json')
const EXPECTED = Object.freeze({
  index: 'b306ce22c1061a35c9c24144e5683e3d08be774cdb78c22661dfc55b2f640cb4',
  review: 'a3668b1538f2dbbefa66d50cfbf41c639b87b42ca0830317365e6618b09412cc',
  result: '33f52351c8d2b0cbb0c1b66a4028582006f51a0745bf6a87b847960bf3319c60',
  manifest: '7bb8aca0af7f5818be18cb56235b3bd1f4841259380feeb3183c41393244795d',
  manifestDigest: 'b491149d39635d1592092b1df76d4bbe0fe5f8a53a8337e1809cb75a21c2b48f',
  canonical: '56406b531245aeab4dff145a8641d231fe747e19dcadcd8b7df1af9df933e173',
  exactReview: '2bfd4b956e3b0f0a3e4d6c2fd4d89e720dae8d28bd5192023d1376fff403e8d4',
  decision: '82e18cbf29b8b50797e5a4c08d003419f745d3df77695eab1f26138a5d3b917b',
  journal: '4fa7a56e4075d7a2167adb03318a14d7b286480f0a73a3ae6c3aa5da3fbed4d6',
  terminalHash: '166fe1eb789697f9ad4a47a46fa0462d77406b125e9c624ff0497f3baf88fcef',
  rootDev: 16777230,
  rootIno: 68891739,
})
const SHA = /^[a-f0-9]{64}$/
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const cases = POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id)
const caseSet = new Set(cases)
const receipt =
  /^(?:mcp-startup|mcp-exit|script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)\.json$/
const safeSource = source => {
  if (['phase-journal.jsonl', 'supervisor/module-stage.json', 'startup-failure.json'].includes(source)) return true
  const match = /^cases\/([^/]+)\/supervisor\/([^/]+)$/.exec(source ?? '')
  return Boolean(match && caseSet.has(match[1]) && receipt.test(match[2]))
}
const identity = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])

async function exactFile(file, expected, { max = 8 * 1024 * 1024 } = {}) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o777) !== 0o600 ||
    before.size < 1 ||
    before.size > max
  )
    throw new Error('prior p2 file identity')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!identity(before, held)) throw new Error('prior p2 file changed before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const pathAfter = await fs.lstat(file)
    if (
      !identity(before, after) ||
      !identity(before, pathAfter) ||
      bytes.length !== before.size ||
      sha(bytes) !== expected
    )
      throw new Error('prior p2 file byte/identity drift')
    return bytes
  } finally {
    await handle.close()
  }
}

function verifyJournal(bytes, review) {
  if (sha(bytes) !== EXPECTED.journal || review.journal?.terminalHash !== EXPECTED.terminalHash)
    throw new Error('prior p2 journal hash drift')
  const lines = bytes.toString('utf8').trimEnd().split('\n')
  if (!bytes.toString('utf8').endsWith('\n') || lines.length !== 29) throw new Error('prior p2 journal length drift')
  let previous = '0'.repeat(64)
  for (const [index, line] of lines.entries()) {
    const record = JSON.parse(line)
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      throw new Error('prior p2 journal chain drift')
    if (
      index === 0 &&
      (record.event?.type !== 'init' ||
        record.event.phase !== 'T2' ||
        record.event.directoryIdentity?.dev !== EXPECTED.rootDev ||
        record.event.directoryIdentity?.ino !== EXPECTED.rootIno)
    )
      throw new Error('prior p2 journal root drift')
    if (index === 26 && (record.event?.type !== 'unknown' || record.event.reason !== 'AMBIGUOUS_EFFECT'))
      throw new Error('prior p2 UNKNOWN event drift')
    if (index === 27 && (record.event?.type !== 'recovery' || record.event.action !== 'owned-stop-intent'))
      throw new Error('prior p2 stop intent drift')
    if (index === 28 && (record.event?.type !== 'recovery' || record.event.action !== 'owned-stop-observed'))
      throw new Error('prior p2 stop observation drift')
    previous = record.hash
  }
  if (previous !== EXPECTED.terminalHash) throw new Error('prior p2 terminal hash drift')
}

export async function verifyPriorT2Unknown({ requireNewRootAbsent = true } = {}) {
  const p1 = await verifyP1({ requireNewRootAbsent: false })
  if (p1.status !== 'PRIOR_T2_UNKNOWN_PRESERVED') throw new Error('prior p1 UNKNOWN proof drift')
  const [indexBytes, reviewBytes, resultBytes, manifestBytes, canonicalBytes, exactReviewBytes, decisionBytes] =
    await Promise.all([
      exactFile(INDEX, EXPECTED.index),
      exactFile(REVIEW, EXPECTED.review),
      exactFile(RESULT, EXPECTED.result),
      exactFile(MANIFEST, EXPECTED.manifest),
      exactFile(CANONICAL, EXPECTED.canonical, { max: 40 * 1024 * 1024 }),
      exactFile(EXACT_REVIEW, EXPECTED.exactReview),
      exactFile(DECISION, EXPECTED.decision),
    ])
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
    throw new Error('prior p2 root identity drift')
  if (
    index.schema !== 'appraise.m02-ta-r12-sanitized-evidence-archive/v1' ||
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
    review.schema !== 'appraise.m02-ta-t2-r12-actual-review/v1' ||
    review.verdict !== 'ACCEPT_ACTUAL_R12_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION' ||
    review.runtimeVerdict !== 'UNKNOWN' ||
    review.unresolvedUnknown !== true ||
    review.casesCompleted !== 0 ||
    review.execution?.root !== PRIOR_ROOT ||
    review.execution.rootIdentity?.dev !== root.dev ||
    review.execution.rootIdentity?.ino !== root.ino ||
    review.archive?.indexSha256 !== EXPECTED.index ||
    review.journal?.sha256 !== EXPECTED.journal ||
    review.journal.unknown !== true ||
    review.journal.reason !== 'AMBIGUOUS_EFFECT' ||
    review.journal.records !== 29 ||
    review.journal.unknownSeq !== 27 ||
    review.journal.counts?.providerRequests !== 1 ||
    review.journal.counts?.outerCalls !== 1 ||
    review.journal.counts?.canonicalRequests !== 2 ||
    review.journal.counts?.scopedCalls !== 0 ||
    review.protocolFailure?.actualParams !== 'UNKNOWN_NOT_RETAINED' ||
    review.protocolFailure?.methodSha256 !== '39402612ae798040809cafb764eaabf5900680e335e9f7f83e79b9a7b9b51c18' ||
    review.protocolFailure.frameKind !== 'notification' ||
    review.protocolFailure.phase !== 'turn' ||
    result.commandConsumed !== true ||
    result.reportedStatus !== 'UNKNOWN' ||
    result.automaticSubsequentCampaignAuthorized !== false ||
    result.archiveIndexSha256 !== EXPECTED.index ||
    envelope?.manifestDigest !== EXPECTED.manifestDigest ||
    envelope?.manifest?.root !== PRIOR_ROOT ||
    envelope?.manifest?.artifacts?.length !== 6371 ||
    canonicalBytes.length === 0 ||
    exactReview?.verdict !== 'ACCEPT_ONE_FIXED_T2_R12_INVOCATION' ||
    decision?.verdict !== 'APPROVE_ONE_FIXED_T2_R12_RECOVERY'
  )
    throw new Error('prior p2 UNKNOWN evidence shape drift')
  if (!Array.isArray(index.records) || new Set(index.records.map(item => item.source)).size !== 267)
    throw new Error('prior p2 safe archive duplicate source')
  const pinnedFiles = [INDEX, REVIEW, RESULT, MANIFEST, CANONICAL, EXACT_REVIEW, DECISION]
  const archiveEntries = new Set(['index.json'])
  let copied = 0,
    missing = 0
  let journalBytes = null
  for (const record of index.records) {
    const source = record.source
    if (!safeSource(source) || record.sourceRelativePath !== source) throw new Error('prior p2 unsafe source path')
    const current = join(PRIOR_ROOT, source)
    if (record.status === 'MISSING_ENOENT') {
      missing++
      if (record.copy !== undefined) throw new Error('prior p2 missing copy')
      try {
        await fs.lstat(current)
        throw new Error('prior p2 missing source appeared')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      record.status !== 'COPIED' ||
      record.copy !== source.replaceAll('/', '--') ||
      !SHA.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 2 ||
      archiveEntries.has(record.copy)
    )
      throw new Error('prior p2 archive record drift')
    const archiveFile = join(ARCHIVE, record.copy)
    const [archiveBytes, currentBytes] = await Promise.all([
      exactFile(archiveFile, record.sha256),
      exactFile(current, record.sha256),
    ])
    if (archiveBytes.length !== record.bytes || currentBytes.length !== record.bytes)
      throw new Error('prior p2 copied byte count drift')
    if (source === 'phase-journal.jsonl') journalBytes = archiveBytes
    archiveEntries.add(record.copy)
    pinnedFiles.push(archiveFile, current)
    copied++
  }
  if (copied !== 7 || missing !== 260 || !journalBytes) throw new Error('prior p2 archive set drift')
  verifyJournal(journalBytes, review)
  const actualArchiveEntries = await fs.readdir(ARCHIVE)
  if (
    actualArchiveEntries.length !== archiveEntries.size ||
    actualArchiveEntries.some(name => !archiveEntries.has(name))
  )
    throw new Error('prior p2 archive directory changed')
  if (requireNewRootAbsent) {
    try {
      await fs.lstat(ROOT)
      throw new Error('fresh p3 root already exists; no resume')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return Object.freeze({
    status: 'PRIOR_P1_P2_UNKNOWN_PRESERVED',
    manifest: envelope.manifest,
    priorManifestDigest: EXPECTED.manifestDigest,
    priorManifestSha256: EXPECTED.manifest,
    priorCanonicalSha256: EXPECTED.canonical,
    p1,
    p2: Object.freeze({
      archiveIndexSha256: EXPECTED.index,
      actualReviewSha256: EXPECTED.review,
      resultSha256: EXPECTED.result,
      journalSha256: EXPECTED.journal,
      terminalHash: EXPECTED.terminalHash,
      rootIdentity: Object.freeze({ dev: root.dev, ino: root.ino }),
      consumed: Object.freeze({
        listenerStarts: 1,
        controlWrites: 3,
        codexStarts: 1,
        mcpStarts: 1,
        threadStarts: 1,
        turnStarts: 1,
        providerRequests: 1,
        outerCalls: 1,
        canonicalRequests: 2,
      }),
    }),
    pinnedFiles: Object.freeze([...new Set([...p1.pinnedFiles, ...pinnedFiles])]),
  })
}
