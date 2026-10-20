/** Durable metadata binds the lost p1 raw root; it cannot attest a current raw journal inode. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRIOR_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p1'
export const PRIOR_JOURNAL_SHA = '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff'
export const PRIOR_TERMINAL_HASH = '6ccd152391b72c8e1ce61800a66028d0d8b7ae8098815a8f258a9e6c78c3c5ef'
const REPO = resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const pinned = Object.freeze({
  '.appraisejs/m02-t1-failed-attempt-preservation.json':
    'd801b9d21f8cce65eb52116cfcb41013e17d5d3d63af5ba8df0811ed4bdb6c37',
  'tasks/codex-app-server-journeys/m02-ta-t1-execution-01.md':
    '8892222e4ee51d98e10aa8b62c6025675069a8e57b9252972343d9905d7372f8',
  '.appraisejs/m02-t1-execution-01-review.json': 'e15fa5b0aa53b5c82bb98ed17025ad0cc32f266c71fecb6a8ef4c53ae0241867',
  '.appraisejs/m02-t1-r4-exact-review.json': 'cc6aeac94091aaaaf7550f3c7d0ad787e3d571c7595d72d1d6876bef26099510',
  '.appraisejs/m02-prior-evidence-recovery-20261016-01/journal-from-historical-tool-output.jsonl':
    '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff',
  '.appraisejs/m02-prior-evidence-recovery-20261016-01/review.json':
    '053380a1e9929895904f1f0cfb001b1c7584e64980abf8e0e55d206ccc9e649b',
  '.appraisejs/m02-prior-evidence-recovery-20261016-01/provenance.json':
    '678cc4bee0802038670ab7c731b1b844e82c69d46d03278761172f556fe929d0',
  '.appraisejs/m02-ta-t1-build-r4/manifest.json': 'a02dc1aeced93ff399e65c78a2bdd62170222a02a27021b7bbee5a2a0ee76278',
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = () => {
  throw new Error('lost prior T1 UNKNOWN durable proof changed')
}

export function verifyPriorAttempt(io = fs) {
  try {
    io.lstatSync(PRIOR_ROOT)
    fail()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const checked = {}
  for (const [relative, expected] of Object.entries(pinned)) {
    const path = resolve(REPO, relative)
    const state = io.lstatSync(path)
    if (!state.isFile() || state.isSymbolicLink() || sha(io.readFileSync(path)) !== expected) fail()
    checked[relative] = expected
  }
  const archive = io.readFileSync(
    resolve(REPO, '.appraisejs/m02-prior-evidence-recovery-20261016-01/journal-from-historical-tool-output.jsonl'),
  )
  const provenance = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-prior-evidence-recovery-20261016-01/provenance.json'), 'utf8'),
  )
  if (
    archive.length !== 1253 ||
    sha(archive) !== PRIOR_JOURNAL_SHA ||
    provenance.sha256 !== PRIOR_JOURNAL_SHA ||
    provenance.bytes !== 1253 ||
    provenance.evidenceClass !== 'ARCHIVED_TOOL_OUTPUT_BYTES_MATCH_REVIEWED_JOURNAL_HASH' ||
    provenance.originalRootStatus !== 'LOST_RAW_ROOT_AFTER_REVIEW' ||
    provenance.originalInodesCurrentlyAttested !== false ||
    provenance.outcome !== 'UNKNOWN' ||
    provenance.unresolvedDecisionDueAt !== '2026-10-22T18:54:08.422Z'
  )
    fail()
  if (!archive.toString('utf8').endsWith('\n')) fail()
  const records = archive
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  if (records.length !== 2) fail()
  let previous = '0'.repeat(64)
  for (const [index, record] of records.entries()) {
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      fail()
    previous = record.hash
  }
  if (
    records[0].event.type !== 'init' ||
    records[0].event.policyDigest !== '6e9c2d3f1f371b9f0d7124539956f4735d8e4e92e49810d73c06dfc7896d77b4' ||
    records[1].event.type !== 'unknown' ||
    records[1].event.reason !== 'T1-runtime-ambiguity' ||
    records[1].hash !== PRIOR_TERMINAL_HASH ||
    records[0].event.retention?.unresolvedDecisionDueAt !== '2026-10-22T18:54:08.422Z'
  )
    fail()
  const archiveReview = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-prior-evidence-recovery-20261016-01/review.json'), 'utf8'),
  )
  if (
    archiveReview.verdict !== 'ACCEPT_ARCHIVAL_BYTES_ONLY' ||
    archiveReview.archive?.sha256 !== PRIOR_JOURNAL_SHA ||
    archiveReview.archive?.bytes !== 1253 ||
    archiveReview.chain?.terminalHash !== PRIOR_TERMINAL_HASH ||
    archiveReview.originalState?.status !== 'UNKNOWN' ||
    archiveReview.originalState?.currentLstat !== 'ENOENT'
  )
    fail()
  const preservation = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-failed-attempt-preservation.json'), 'utf8'),
  )
  const executionReview = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-execution-01-review.json'), 'utf8'),
  )
  const r4Review = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r4-exact-review.json'), 'utf8'))
  if (
    preservation.root !== PRIOR_ROOT ||
    preservation.entries?.[`${PRIOR_ROOT}/supervisor/journal/journal.jsonl`]?.sha256 !== PRIOR_JOURNAL_SHA ||
    executionReview.verdict !== 'ACCEPT_EXECUTION_DOCUMENT_ONLY' ||
    executionReview.runtimeVerdict !== 'UNKNOWN_CAMPAIGN_STOPPED' ||
    r4Review.verdict !== 'ACCEPT_T1_R4_OFFLINE_BUNDLE_ONLY' ||
    r4Review.manifestDigest !== 'f43ee23fb2fc1f3c1c68be63b8ca11771f7b59c0d7885456df0f804b8bf284d5' ||
    r4Review.verification?.p2T2T3Roots !== 'ABSENT'
  )
    fail()
  try {
    io.lstatSync(PRIOR_ROOT)
    fail()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return Object.freeze({
    classification: 'LOST_RAW_ROOT_AFTER_REVIEW',
    status: 'UNKNOWN',
    journalSha256: PRIOR_JOURNAL_SHA,
    terminalHash: PRIOR_TERMINAL_HASH,
    originalUnresolvedDecisionDueAt: '2026-10-22T18:54:08.422Z',
    durablePins: checked,
  })
}
