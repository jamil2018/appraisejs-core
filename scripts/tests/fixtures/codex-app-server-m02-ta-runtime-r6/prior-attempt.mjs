/** Durable metadata binds the lost p1 raw root; it cannot attest a current raw journal inode. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PRIOR_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p1'
export const PRIOR_JOURNAL_SHA = '00784593918012207cd76763ceecb7e5ce1aae91790a7d89a3dda21fad1c30ff'
export const PRIOR_TERMINAL_HASH = '6ccd152391b72c8e1ce61800a66028d0d8b7ae8098815a8f258a9e6c78c3c5ef'
export const PRIOR_R5_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p2'
export const PRIOR_R5_JOURNAL_SHA = '9c8146fb33fa802d0ea95993c9dde86758c9be8715f12192284670d45afcf575'
export const PRIOR_R5_TERMINAL_HASH = 'dfd6f3bfb618c09d3ed9e23810454d7b3b728fc57bc4dd40480c1f28c6826176'
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
  '.appraisejs/m02-ta-t1-build-r5/manifest.json': '02ab0bd9e744a892508e9f0927aee983a5a16ca2df3bef9efd9cc88ffe74dad0',
  '.appraisejs/m02-t1-r5-exact-review.json': '0c02950669b35f0e7025c7b75f5e3868c981097c5a109dba1d6b5b7c2892d7f2',
  '.appraisejs/m02-t1-r5-execution-review.json': 'e1bfd273f94cbaccd032358c457ef8e9f54d6668e2a42dca6524d469ff675606',
  '.appraisejs/m02-ta-t1-r5-execution-evidence-01/index.json':
    '84d88f76b79dfded1f891dfac7b6171c7c33462ef2578f41c461eb39c885292c',
  '.appraisejs/m02-ta-t1-r5-execution-evidence-01/supervisor--journal--journal.jsonl': PRIOR_R5_JOURNAL_SHA,
  '.appraisejs/m02-ta-t1-r5-execution-evidence-01/supervisor--module-stage.json':
    '3f79626fca226797d1df78b0a17845063f1e8ba4e9572db002c0fbe16ab497c0',
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
  const r5Manifest = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-build-r5/manifest.json'), 'utf8'))
  const r5ExactReview = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r5-exact-review.json'), 'utf8'))
  const r5Review = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r5-execution-review.json'), 'utf8'))
  const index = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r5-execution-evidence-01/index.json'), 'utf8'),
  )
  if (
    r5Manifest.manifestDigest !== 'd50d6e7d3fd6f672e6c55b54e8b3473b8f5d32750daba6b597017dd07561111d' ||
    r5Manifest.manifest?.root !== PRIOR_R5_ROOT ||
    r5ExactReview.verdict !== 'ACCEPT_ONE_BOUNDED_T1_R5_INVOCATION' ||
    r5ExactReview.manifest?.manifestDigest !== r5Manifest.manifestDigest ||
    r5Review.verdict !== 'UNKNOWN_CAMPAIGN_STOPPED' ||
    r5Review.journal?.terminal?.status !== 'UNKNOWN' ||
    r5Review.journal?.pending?.length !== 1 ||
    r5Review.journal.pending[0]?.kind !== 'mcpStarts' ||
    r5Review.journal?.noRecordedThreadTurnOrProviderReservation !== true ||
    index.status !== 'UNKNOWN_NO_RESEND' ||
    index.manifestDigest !== r5Manifest.manifestDigest ||
    index.sourceRoot !== PRIOR_R5_ROOT
  )
    fail()
  const root = io.lstatSync(PRIOR_R5_ROOT)
  if (
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid() ||
    (root.mode & 0o777) !== 0o700 ||
    root.dev !== index.rootIdentity?.dev ||
    root.ino !== index.rootIdentity?.ino ||
    root.mode !== index.rootIdentity?.mode ||
    root.uid !== index.rootIdentity?.uid
  )
    fail()
  for (const item of index.records) {
    if (item.status === 'ENOENT') {
      try {
        io.lstatSync(item.source)
        fail()
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (!item.archive || !item.identity || !item.source.startsWith(`${PRIOR_R5_ROOT}/`)) fail()
    const current = io.lstatSync(item.source)
    if (
      !current.isFile() ||
      current.isSymbolicLink() ||
      current.uid !== process.getuid() ||
      (current.mode & 0o777) !== 0o600 ||
      current.dev !== item.identity.dev ||
      current.ino !== item.identity.ino ||
      current.uid !== item.identity.uid ||
      current.mode !== item.identity.mode ||
      current.size !== item.bytes
    )
      fail()
    const fd = io.openSync(item.source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    let currentBytes
    try {
      const opened = io.fstatSync(fd)
      if (opened.dev !== current.dev || opened.ino !== current.ino || opened.size !== current.size) fail()
      currentBytes = io.readFileSync(fd)
    } finally {
      io.closeSync(fd)
    }
    const archived = io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r5-execution-evidence-01', item.archive))
    if (sha(currentBytes) !== item.sha256 || sha(archived) !== item.sha256 || !currentBytes.equals(archived)) fail()
  }
  const journalBytes = io.readFileSync(
    resolve(REPO, '.appraisejs/m02-ta-t1-r5-execution-evidence-01/supervisor--journal--journal.jsonl'),
  )
  if (sha(journalBytes) !== PRIOR_R5_JOURNAL_SHA || !journalBytes.toString('utf8').endsWith('\n')) fail()
  const r5Records = journalBytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  if (r5Records.length !== 16) fail()
  previous = '0'.repeat(64)
  for (const [index, record] of r5Records.entries()) {
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      fail()
    previous = record.hash
  }
  const journalRoot = io.lstatSync(`${PRIOR_R5_ROOT}/supervisor/journal`)
  if (
    !journalRoot.isDirectory() ||
    journalRoot.isSymbolicLink() ||
    journalRoot.uid !== process.getuid() ||
    (journalRoot.mode & 0o777) !== 0o700 ||
    previous !== PRIOR_R5_TERMINAL_HASH ||
    r5Records[0].event.rootIdentity?.dev !== journalRoot.dev ||
    r5Records[0].event.rootIdentity?.ino !== journalRoot.ino ||
    r5Records[0].event.retention?.unresolvedDecisionDueAt !== '2026-10-23T13:18:36.648Z' ||
    r5Records[13].event.type !== 'unknown' ||
    r5Records[13].event.reason !== 'ambiguous-effect' ||
    r5Records.some(
      record =>
        record.event.type === 'reserve' &&
        ['threadStarts', 'turnStarts', 'providerRequests'].includes(record.event.kind),
    )
  )
    fail()
  return Object.freeze({
    classification: 'LOST_RAW_ROOT_AFTER_REVIEW',
    status: 'UNKNOWN',
    journalSha256: PRIOR_JOURNAL_SHA,
    terminalHash: PRIOR_TERMINAL_HASH,
    originalUnresolvedDecisionDueAt: '2026-10-22T18:54:08.422Z',
    durablePins: checked,
    r5: Object.freeze({
      root: PRIOR_R5_ROOT,
      status: 'UNKNOWN_NO_RESEND',
      journalSha256: PRIOR_R5_JOURNAL_SHA,
      terminalHash: PRIOR_R5_TERMINAL_HASH,
      unresolvedDecisionDueAt: '2026-10-23T13:18:36.648Z',
      pending: 'mcpStarts:T1-codex-mcp',
    }),
  })
}
