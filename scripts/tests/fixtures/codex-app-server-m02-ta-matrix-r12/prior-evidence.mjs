/** Read-only preservation gate for the consumed R11 T2 attempt. No old root writes. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRIOR_ROOT, ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r10-execution-evidence-01')
const INDEX = join(ARCHIVE, 'index.json')
const REVIEW = join(REPO, '.appraisejs/m02-t2-r11-execution-review-01.json')
const TRANSCRIPTION = join(REPO, '.appraisejs/m02-t2-r11-execution-result-01.json')
const EXACT_REVIEW = join(REPO, '.appraisejs/m02-t2-r11-exact-review.json')
const EXPECTED = Object.freeze({
  index: '42cd69577263d90a63eb97c617c54fc938802c93003c9f876802d54d3d248460',
  review: 'ef7e3ee1fde8fc310fc05f84f0e7682618b8e849c49bde7ca4e0302976514a0b',
  transcription: '415f1df82989eceda54ef235bcad4bc4a6376fcec649c1ed2ce64828eb5cd563',
  exactReview: '65fab01b36c415dbf9592a06077c2459baa0564d261d3c5bd57fc5f441aac330',
  journal: '7646c172a2340103eea5a01f0cdc9f39c06ed4eb46ff2b67b16e72761b5d654c',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function exactFile(file, expected) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    before.nlink !== 1 ||
    (before.mode & 0o022) !== 0 ||
    before.size < 1 ||
    before.size > 1024 * 1024
  )
    throw new Error('prior evidence file identity')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (held.dev !== before.dev || held.ino !== before.ino || held.size !== before.size)
      throw new Error('prior evidence changed before read')
    const bytes = await handle.readFile()
    const after = await fs.lstat(file)
    if (
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      bytes.length !== before.size ||
      sha(bytes) !== expected
    )
      throw new Error('prior evidence byte drift')
    return bytes
  } finally {
    await handle.close()
  }
}

export async function verifyPriorT2Unknown({ requireNewRootAbsent = true } = {}) {
  const [indexBytes, reviewBytes, transcriptionBytes] = await Promise.all([
    exactFile(INDEX, EXPECTED.index),
    exactFile(REVIEW, EXPECTED.review),
    exactFile(TRANSCRIPTION, EXPECTED.transcription),
    exactFile(EXACT_REVIEW, EXPECTED.exactReview),
  ])
  const index = JSON.parse(indexBytes)
  const review = JSON.parse(reviewBytes)
  const transcription = JSON.parse(transcriptionBytes)
  if (
    index.schema !== 'appraise.m02-ta-t2-r10-safe-archive/v1' ||
    index.sourceRoot !== PRIOR_ROOT ||
    index.outcome !== 'UNKNOWN' ||
    index.completed !== 0 ||
    index.failedCase !== 'B01' ||
    index.sourceEvidenceChanged !== false ||
    index.sourceRootIdentity?.dev !== 16777230 ||
    index.sourceRootIdentity?.ino !== 68828422 ||
    index.records?.length !== 266 ||
    review.decision !== 'ACCEPT_ACTUAL_R11_UNKNOWN_EVIDENCE_NO_T2_QUALIFICATION' ||
    review.archive?.indexSha256 !== EXPECTED.index ||
    review.journal?.sha256 !== EXPECTED.journal ||
    review.actual?.counts?.listenerStarts !== 1 ||
    review.actual?.counts?.controlWrites !== 1 ||
    review.actual?.counts?.codexStarts !== 0 ||
    review.actual?.counts?.threadStarts !== 0 ||
    transcription.reportedStatus !== 'UNKNOWN' ||
    transcription.commandConsumed !== true ||
    transcription.retryAuthorized !== false
  )
    throw new Error('prior UNKNOWN evidence shape drift')
  const root = await fs.lstat(PRIOR_ROOT)
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid() ||
    (root.mode & 0o777) !== 0o700 ||
    root.dev !== 16777230 ||
    root.ino !== 68828422
  )
    throw new Error('prior root identity drift')
  const copies = []
  for (const record of index.records) {
    const relative = record?.sourceRelativePath
    if (
      typeof relative !== 'string' ||
      relative.startsWith('/') ||
      relative.split('/').some(part => !part || part === '.' || part === '..')
    )
      throw new Error('prior archive path drift')
    const source = join(PRIOR_ROOT, relative)
    if (!source.startsWith(`${PRIOR_ROOT}${sep}`)) throw new Error('prior archive path escape')
    if (record.status === 'MISSING_ENOENT') {
      try {
        await fs.lstat(source)
        throw new Error('prior missing evidence appeared')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      record.status !== 'COPIED' ||
      !/^[A-Za-z0-9._-]+$/.test(record.copy ?? '') ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes)
    )
      throw new Error('prior archive record drift')
    const copy = join(ARCHIVE, record.copy)
    await Promise.all([exactFile(source, record.sha256), exactFile(copy, record.sha256)])
    copies.push(copy)
  }
  if (copies.length !== 3 || index.records[0].sha256 !== EXPECTED.journal)
    throw new Error('prior copied evidence set drift')
  if (requireNewRootAbsent) {
    try {
      await fs.lstat(ROOT)
      throw new Error('fresh R12 root already exists; no resume')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return Object.freeze({
    status: 'PRIOR_T2_UNKNOWN_PRESERVED',
    priorRoot: PRIOR_ROOT,
    archiveIndexSha256: EXPECTED.index,
    reviewSha256: EXPECTED.review,
    exactReviewSha256: EXPECTED.exactReview,
    journalSha256: EXPECTED.journal,
    consumed: Object.freeze({ listenerStarts: 1, controlWrites: 1, codexStarts: 0, threadStarts: 0, turnStarts: 0 }),
    pinnedFiles: Object.freeze([
      INDEX,
      REVIEW,
      TRANSCRIPTION,
      EXACT_REVIEW,
      ...copies,
      ...index.records
        .filter(record => record.status === 'COPIED')
        .map(record => join(PRIOR_ROOT, record.sourceRelativePath)),
    ]),
  })
}
