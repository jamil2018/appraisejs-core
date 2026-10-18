/** Fixed-path, read-only T2 actual evidence prerequisite for every T3 preparation. */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const T2_ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r10-execution-evidence-01')
export const T2_INDEX = join(T2_ARCHIVE, 'index.json')
export const T2_ACTUAL_REVIEW = join(REPO, '.appraisejs/m02-t2-r10-execution-review-01.json')
const SHA = /^[a-f0-9]{64}$/
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const safeCopy = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name)
const caseIds = new Set(POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id))
const receiptNames =
  /^(?:mcp-startup|mcp-exit|script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)\.json$/
function safeSource(source) {
  if (source === 'phase-journal.jsonl' || source === 'supervisor/module-stage.json') return true
  const match = /^cases\/([A-Za-z0-9]+)\/supervisor\/([^/]+)$/.exec(source ?? '')
  return Boolean(match && caseIds.has(match[1]) && receiptNames.test(match[2]))
}

async function privateRegular(file, maxBytes = 8 * 1024 * 1024) {
  const state = await fs.lstat(file)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    state.nlink !== 1 ||
    (state.mode & 0o777) !== 0o600 ||
    state.size < 2 ||
    state.size > maxBytes
  )
    throw new Error('T2 prerequisite file identity changed')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    if (opened.dev !== state.dev || opened.ino !== state.ino || opened.size !== state.size)
      throw new Error('T2 prerequisite file replaced')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    if (
      after.dev !== state.dev ||
      after.ino !== state.ino ||
      after.size !== state.size ||
      after.mtimeMs !== state.mtimeMs ||
      bytes.length !== state.size
    )
      throw new Error('T2 prerequisite changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

export async function verifyAcceptedT2Evidence({ manifestDigest, manifestFileSha256 } = {}) {
  if (!SHA.test(manifestDigest ?? '') || !SHA.test(manifestFileSha256 ?? ''))
    throw new Error('accepted T2 manifest binding missing')
  const directory = await fs.lstat(T2_ARCHIVE)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700 ||
    (await fs.realpath(T2_ARCHIVE)) !== T2_ARCHIVE
  )
    throw new Error('T2 archive directory identity changed')
  const indexBytes = await privateRegular(T2_INDEX)
  const reviewBytes = await privateRegular(T2_ACTUAL_REVIEW)
  const indexSha256 = sha(indexBytes)
  const reviewSha256 = sha(reviewBytes)
  const index = JSON.parse(indexBytes)
  const review = JSON.parse(reviewBytes)
  if (
    index.schema !== 'appraise.m02-ta-t2-r10-safe-archive/v1' ||
    index.sourceRoot !== POLICY.roots.T2 ||
    index.manifestDigest !== manifestDigest ||
    index.manifestSha256 !== manifestFileSha256 ||
    index.outcome !== 'T2_CASES_COMPLETED' ||
    index.sourceEvidenceChanged !== false ||
    !Array.isArray(index.records)
  )
    throw new Error('T2 archive outcome or binding changed')
  if (
    review.schema !== 'appraise.m02-ta-t2-r10-actual-review/v1' ||
    review.verdict !== 'ACCEPT_T2_R10_ACTUAL_WITH_LIMITS' ||
    review.manifestDigest !== manifestDigest ||
    review.manifestFileSha256 !== manifestFileSha256 ||
    review.archiveIndexSha256 !== indexSha256 ||
    review.casesCompleted !== 24 ||
    review.unresolvedUnknown !== false ||
    typeof review.reviewer !== 'string' ||
    !/^\/root\/[A-Za-z0-9_-]{1,100}$/.test(review.reviewer) ||
    !Array.isArray(review.limits) ||
    review.limits.length === 0
  )
    throw new Error('independent T2 actual-review verdict absent or changed')
  const listed = new Set(['index.json'])
  const pinned = [
    { path: T2_INDEX, purpose: 'accepted-t2-archive-index', sha256: indexSha256 },
    { path: T2_ACTUAL_REVIEW, purpose: 'accepted-t2-actual-review', sha256: reviewSha256 },
  ]
  for (const record of index.records) {
    if (!safeSource(record.source)) throw new Error('T2 archive includes non-supervisor or raw source')
    if (record.status === 'MISSING_ENOENT') {
      if (record.copy !== undefined) throw new Error('T2 missing archive record has copy')
      continue
    }
    if (
      record.status !== 'COPIED' ||
      !safeCopy(record.copy) ||
      record.copy !== record.source.replaceAll('/', '--') ||
      !SHA.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 2 ||
      listed.has(record.copy)
    )
      throw new Error('T2 archive record invalid')
    listed.add(record.copy)
    const file = join(T2_ARCHIVE, record.copy)
    if (dirname(file) !== T2_ARCHIVE || basename(file) !== record.copy) throw new Error('T2 archive path escaped')
    const bytes = await privateRegular(file)
    if (bytes.length !== record.bytes || sha(bytes) !== record.sha256)
      throw new Error('T2 archived safe evidence bytes changed')
    pinned.push({ path: file, purpose: `accepted-t2-safe:${record.copy}`, sha256: record.sha256 })
  }
  for (const caseId of POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id)) {
    const source = `cases/${caseId}/supervisor/case-outcome.json`
    if (
      !index.records.some(
        record =>
          record.status === 'COPIED' &&
          record.source === source &&
          record.copy === `cases--${caseId}--supervisor--case-outcome.json`,
      )
    )
      throw new Error('T2 accepted case outcome missing from safe archive')
  }
  const actual = await fs.readdir(T2_ARCHIVE)
  if (actual.length !== listed.size || actual.some(file => !listed.has(file)))
    throw new Error('T2 archive contains unindexed evidence')
  return Object.freeze({
    manifestDigest,
    manifestFileSha256,
    indexSha256,
    reviewSha256,
    casesCompleted: 24,
    unresolvedUnknown: false,
    files: Object.freeze(pinned),
  })
}
