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
export const PRIOR_R6_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p3'
export const PRIOR_R6_JOURNAL_SHA = '7f220847ad2d0104a02b19597ab2923c93f292b5214ff0743079f912ffe50ae2'
export const PRIOR_R6_TERMINAL_HASH = 'a05bca42acf7f9c60d14917ed69bffa11b1d262ba1397a736fec47e95ae65db5'
export const PRIOR_R7_ROOT = '/private/tmp/appraise-m02-ta-descriptors-p4'
export const PRIOR_R7_JOURNAL_SHA = 'f49c0eeaaa1e4b923cbd861d5da842ca77a200c1542a648106f3c5e5dfa6b16a'
export const PRIOR_R7_TERMINAL_HASH = 'd711e1f2b14e16db8cbe22fbe4883e5b66b8ae7d7a44c35efa9784a6f54617c4'
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
  '.appraisejs/m02-ta-t1-build-r6/manifest.json': 'a714cf070b301be00165d5dafa00b06fd1fc359ac1fcd4e33b11ed4b47c3b841',
  '.appraisejs/m02-t1-r6-exact-review.json': '338fb7f4c24d63f53217b1e1c9624c545f399b9995058a787319e7136b5a5885',
  '.appraisejs/m02-t1-r6-execution-review.json': '4bda6ba13127fc48e22efe02cdd481ba6d4185fad6145be6a2ece8fcb38b0887',
  '.appraisejs/m02-t1-r6-execution-document-review.json':
    'cf6697a7cb6163d022557b0feec597cf03a9edf9a82e81000c1d3ddbbda2eb47',
  '.appraisejs/m02-ta-t1-r6-execution-evidence-01/index.json':
    '3a43204c8753c08e5fea18ef3fde38be52832fd75d3ec41e2c9f0a96d1b90b96',
  '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--journal--journal.jsonl': PRIOR_R6_JOURNAL_SHA,
  '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--protocol-failure.json':
    '54bd24742ca1444fb462ed08f85b643997e875ddb0eec803237d73d7f297dae9',
  '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--owned-child-observation.json':
    '32aa6cdff993b3971e51337c5de531d36201c7bcb990154b33ed0aabc9a16b98',
  '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--module-stage.json':
    'a2c09df1477a710dcdbdb97b5e8ef1bfa42c7a54d4bd2d4af780dd063bfa5a97',
  '.appraisejs/m02-ta-t1-build-r7/manifest.json': 'b4d62825dda3ee5351f2bccae3ad52ec322e75d61d87be699f1ce8a56610e432',
  '.appraisejs/m02-t1-r7-exact-review.json': 'bb24dca7f4ac0c61313322f66c28c34481063aad59491fc92b049d5b72ae017e',
  '.appraisejs/m02-t1-r7-execution-review.json': '4114466774656a793bae950006eb6185d966e31b1c84d30c9b86fb203d9e3163',
  '.appraisejs/m02-t1-r7-execution-document-review.json':
    'ca965f158f6c324533b9b8375953f0c1b5e5f554046f04144bc5fe8b20d9709c',
  'tasks/codex-app-server-journeys/m02-ta-t1-execution-04.md':
    'c1657427b271d7928e53866c489c3f0feacbd83a85730cd0bdc44a7ae27c2fa4',
  '.appraisejs/m02-ta-t1-r7-execution-evidence-01/index.json':
    'e1db9c39e08a209ee71c23a82f9d1b7aa18dcba9bb515371dd316079052d7021',
  '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--journal--journal.jsonl': PRIOR_R7_JOURNAL_SHA,
  '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--protocol-failure.json':
    'b651b23af53d3f07772280d6bd48f1675d66c464dd118b72ec0d2dad26c31aff',
  '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--owned-child-observation.json':
    '43c02c423bb6bbd39b67fa95117da29e25b933678f98a4b8b22385b98f93fb7b',
  '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--module-stage.json':
    '57421a3c68f92540f0176e35632ea75b744dbd90a51eb3487a40d1111e7c2bcf',
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
  const r6Manifest = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-build-r6/manifest.json'), 'utf8'))
  const r6ExactReview = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r6-exact-review.json'), 'utf8'))
  const r6Review = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r6-execution-review.json'), 'utf8'))
  const r6Index = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01/index.json'), 'utf8'),
  )
  const r6Failure = JSON.parse(
    io.readFileSync(
      resolve(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--protocol-failure.json'),
      'utf8',
    ),
  )
  const r6Child = JSON.parse(
    io.readFileSync(
      resolve(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--owned-child-observation.json'),
      'utf8',
    ),
  )
  if (
    r6Manifest.manifestDigest !== '7dd6df107dfe033056b12addf0d31beb99d3eece1efa3d6e5635aca636970a1f' ||
    r6Manifest.manifest?.root !== PRIOR_R6_ROOT ||
    r6Manifest.manifest?.artifacts?.length !== 6179 ||
    r6ExactReview.verdict !== 'ACCEPT_ONE_FIXED_T1_R6_INVOCATION' ||
    r6ExactReview.manifest?.manifestDigest !== r6Manifest.manifestDigest ||
    r6Review.verdict !== 'UNKNOWN_CAMPAIGN_STOPPED' ||
    r6Review.journal?.terminal?.status !== 'UNKNOWN' ||
    r6Review.journal?.pending?.length !== 2 ||
    r6Review.journal.pending[0]?.kind !== 'mcpStarts' ||
    r6Review.journal.pending[0]?.id !== 'T1-codex-mcp' ||
    r6Review.journal.pending[1]?.kind !== 'threadStarts' ||
    r6Review.journal.pending[1]?.id !== 'T1-thread-start' ||
    r6Review.journal.reservations?.listenerStarts !== 1 ||
    r6Review.journal.reservations?.controlWrites !== 3 ||
    r6Review.journal.reservations?.codexStarts !== 1 ||
    r6Review.journal.reservations?.mcpStarts !== 1 ||
    r6Review.journal.reservations?.threadStarts !== 1 ||
    r6Review.journal.acknowledgements !== 5 ||
    r6Review.journal.reservations?.turnStarts != null ||
    r6Review.journal.reservations?.providerRequests != null ||
    r6Review.cleanupAssessment?.ownedCodexExitAndCloseObserved !== true ||
    r6Review.cleanupAssessment?.mcpExitReceipt !== false ||
    r6Index.status !== 'UNKNOWN_NO_RESEND' ||
    r6Index.manifestDigest !== r6Manifest.manifestDigest ||
    r6Index.sourceRoot !== PRIOR_R6_ROOT ||
    r6Failure.category !== 'UNKNOWN_REQUEST_OR_NOTIFICATION' ||
    r6Failure.phase !== 'ready' ||
    r6Failure.pendingKind !== 'thread/start' ||
    r6Failure.methodSha256 !== 'fc90be8d31a9f1bb24948acd35f025e91f103bcde03fb735388a7169f1262d24' ||
    r6Child.status !== 'UNKNOWN' ||
    r6Child.exitObserved !== true ||
    r6Child.closeObserved !== true ||
    r6Child.exitCode !== 0 ||
    r6Child.closeCode !== 0 ||
    r6Child.exitSignal !== null ||
    r6Child.closeSignal !== null ||
    r6Child.processExitProved !== true
  )
    fail()
  const r6Root = io.lstatSync(PRIOR_R6_ROOT)
  if (
    !r6Root.isDirectory() ||
    r6Root.isSymbolicLink() ||
    r6Root.uid !== process.getuid() ||
    (r6Root.mode & 0o777) !== 0o700 ||
    r6Root.dev !== r6Index.rootIdentity?.dev ||
    r6Root.ino !== r6Index.rootIdentity?.ino ||
    r6Root.mode !== r6Index.rootIdentity?.mode ||
    r6Root.uid !== r6Index.rootIdentity?.uid
  )
    fail()
  for (const item of r6Index.records) {
    if (item.status === 'ENOENT') {
      try {
        io.lstatSync(item.source)
        fail()
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (!item.archive || !item.identity || !item.source.startsWith(`${PRIOR_R6_ROOT}/`)) fail()
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
    const archived = io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01', item.archive))
    if (sha(currentBytes) !== item.sha256 || sha(archived) !== item.sha256 || !currentBytes.equals(archived)) fail()
  }
  const r6JournalBytes = io.readFileSync(
    resolve(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--journal--journal.jsonl'),
  )
  if (sha(r6JournalBytes) !== PRIOR_R6_JOURNAL_SHA || !r6JournalBytes.toString('utf8').endsWith('\n')) fail()
  const r6Records = r6JournalBytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  if (r6Records.length !== 17) fail()
  previous = '0'.repeat(64)
  for (const [index, record] of r6Records.entries()) {
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      fail()
    previous = record.hash
  }
  const r6JournalRoot = io.lstatSync(`${PRIOR_R6_ROOT}/supervisor/journal`)
  if (
    !r6JournalRoot.isDirectory() ||
    r6JournalRoot.isSymbolicLink() ||
    r6JournalRoot.uid !== process.getuid() ||
    (r6JournalRoot.mode & 0o777) !== 0o700 ||
    previous !== PRIOR_R6_TERMINAL_HASH ||
    r6Records[0].event.rootIdentity?.dev !== r6JournalRoot.dev ||
    r6Records[0].event.rootIdentity?.ino !== r6JournalRoot.ino ||
    r6Records[0].event.retention?.unresolvedDecisionDueAt !== '2026-10-23T13:58:35.561Z' ||
    r6Records[14].event.type !== 'unknown' ||
    r6Records[14].event.reason !== 'ambiguous-effect' ||
    r6Records.filter(record => record.event.type === 'reserve' && record.event.kind === 'threadStarts').length !== 1 ||
    r6Records.some(
      record =>
        record.event.type === 'reserve' &&
        ['turnStarts', 'providerRequests', 'scopedCalls'].includes(record.event.kind),
    )
  )
    fail()
  const r7Manifest = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-build-r7/manifest.json'), 'utf8'))
  const r7Exact = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r7-exact-review.json'), 'utf8'))
  const r7Review = JSON.parse(io.readFileSync(resolve(REPO, '.appraisejs/m02-t1-r7-execution-review.json'), 'utf8'))
  const r7Index = JSON.parse(
    io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01/index.json'), 'utf8'),
  )
  const r7Failure = JSON.parse(
    io.readFileSync(
      resolve(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--protocol-failure.json'),
      'utf8',
    ),
  )
  const r7Child = JSON.parse(
    io.readFileSync(
      resolve(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--owned-child-observation.json'),
      'utf8',
    ),
  )
  if (
    r7Manifest.manifestDigest !== '7239aaabd3da269161d03a42dd7b1fdbb38290226b2b6815829a7f2eea14eb81' ||
    r7Manifest.manifest?.root !== PRIOR_R7_ROOT ||
    r7Manifest.manifest?.artifacts?.length !== 6206 ||
    r7Exact.verdict !== 'ACCEPT_ONE_FIXED_T1_R7_INVOCATION' ||
    r7Exact.manifest?.manifestDigest !== r7Manifest.manifestDigest ||
    r7Review.verdict !== 'UNKNOWN_CAMPAIGN_STOPPED' ||
    r7Review.runtimeVerdict !== 'UNKNOWN' ||
    r7Review.journal?.terminalStatus !== 'UNKNOWN' ||
    r7Review.journal?.pending?.length !== 2 ||
    r7Review.journal.pending[0]?.kind !== 'mcpStarts' ||
    r7Review.journal.pending[0]?.id !== 'T1-codex-mcp' ||
    r7Review.journal.pending[1]?.kind !== 'threadStarts' ||
    r7Review.journal.pending[1]?.id !== 'T1-thread-start' ||
    r7Review.journal.reserves?.listenerStarts !== 1 ||
    r7Review.journal.reserves?.controlWrites !== 3 ||
    r7Review.journal.reserves?.codexStarts !== 1 ||
    r7Review.journal.reserves?.mcpStarts !== 1 ||
    r7Review.journal.reserves?.threadStarts !== 1 ||
    r7Review.journal.noRecordedTurnProviderCanonicalScopedPermissionOrHelperReservation !== true ||
    r7Review.ownedCodexChild?.exitObserved !== true ||
    r7Review.ownedCodexChild?.closeObserved !== true ||
    r7Review.ownedCodexChild?.processExitProved !== true ||
    r7Review.observedScope?.mcpExitReceiptPresent !== false ||
    r7Index.outcome !== 'UNKNOWN' ||
    r7Index.sourceRoot !== PRIOR_R7_ROOT ||
    r7Index.manifestDigest !== r7Manifest.manifestDigest ||
    r7Index.manifestSha256 !== pinned['.appraisejs/m02-ta-t1-build-r7/manifest.json'] ||
    r7Index.records?.length !== 11 ||
    r7Index.sourceEvidenceChanged !== false ||
    r7Failure.category !== 'UNKNOWN_NOTIFICATION' ||
    r7Failure.phase !== 'ready' ||
    r7Failure.pendingKind !== 'thread/start' ||
    r7Failure.seq !== 14 ||
    r7Failure.methodSha256 !== null ||
    r7Failure.frameKind !== 'notification' ||
    r7Child.status !== 'UNKNOWN' ||
    r7Child.exitObserved !== true ||
    r7Child.closeObserved !== true ||
    r7Child.exitCode !== 0 ||
    r7Child.closeCode !== 0 ||
    r7Child.exitSignal !== null ||
    r7Child.closeSignal !== null ||
    r7Child.processExitProved !== true
  )
    fail()
  const r7Root = io.lstatSync(PRIOR_R7_ROOT)
  const rootIdentity = r7Review.execution?.rootIdentity
  if (
    !r7Root.isDirectory() ||
    r7Root.isSymbolicLink() ||
    r7Root.dev !== rootIdentity?.dev ||
    r7Root.ino !== rootIdentity?.ino ||
    r7Root.uid !== rootIdentity?.uid ||
    (r7Root.mode & 0o777) !== 0o700 ||
    rootIdentity.mode !== '0700'
  )
    fail()
  for (const item of r7Index.records) {
    if (typeof item.source !== 'string' || item.source.startsWith('/') || item.source.includes('..')) fail()
    const source = resolve(PRIOR_R7_ROOT, item.source)
    if (!source.startsWith(`${PRIOR_R7_ROOT}/`)) fail()
    if (item.status === 'MISSING_ENOENT') {
      try {
        io.lstatSync(source)
        fail()
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      item.status !== 'COPIED' ||
      typeof item.copy !== 'string' ||
      item.copy.includes('/') ||
      item.copy.includes('..')
    )
      fail()
    const stat = io.lstatSync(source)
    const identity = item.sourceIdentity
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.dev !== identity?.dev ||
      stat.ino !== identity?.ino ||
      stat.uid !== identity?.uid ||
      stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o600 ||
      identity.mode !== '0600' ||
      stat.size !== item.bytes
    )
      fail()
    const fd = io.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    let current
    try {
      const opened = io.fstatSync(fd)
      if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) fail()
      current = io.readFileSync(fd)
    } finally {
      io.closeSync(fd)
    }
    const archived = io.readFileSync(resolve(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01', item.copy))
    if (sha(current) !== item.sha256 || sha(archived) !== item.sha256 || !current.equals(archived)) fail()
  }
  const r7JournalBytes = io.readFileSync(
    resolve(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--journal--journal.jsonl'),
  )
  if (sha(r7JournalBytes) !== PRIOR_R7_JOURNAL_SHA || !r7JournalBytes.toString('utf8').endsWith('\n')) fail()
  const r7Records = r7JournalBytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  if (r7Records.length !== 17) fail()
  previous = '0'.repeat(64)
  for (const [index, record] of r7Records.entries()) {
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
    )
      fail()
    previous = record.hash
  }
  const r7JournalRoot = io.lstatSync(`${PRIOR_R7_ROOT}/supervisor/journal`)
  if (
    !r7JournalRoot.isDirectory() ||
    r7JournalRoot.isSymbolicLink() ||
    r7JournalRoot.uid !== process.getuid() ||
    (r7JournalRoot.mode & 0o777) !== 0o700 ||
    previous !== PRIOR_R7_TERMINAL_HASH ||
    r7Records[0].event.rootIdentity?.dev !== r7JournalRoot.dev ||
    r7Records[0].event.rootIdentity?.ino !== r7JournalRoot.ino ||
    r7Records[0].event.retention?.unresolvedDecisionDueAt !== '2026-10-23T14:18:50.368Z' ||
    r7Records[14].event.type !== 'unknown' ||
    r7Records[14].event.reason !== 'ambiguous-effect' ||
    r7Records.filter(record => record.event.type === 'reserve' && record.event.kind === 'threadStarts').length !== 1 ||
    r7Records.some(
      record =>
        record.event.type === 'reserve' &&
        ['turnStarts', 'providerRequests', 'scopedCalls', 'permissionReplies'].includes(record.event.kind),
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
    r6: Object.freeze({
      root: PRIOR_R6_ROOT,
      status: 'UNKNOWN_NO_RESEND',
      journalSha256: PRIOR_R6_JOURNAL_SHA,
      terminalHash: PRIOR_R6_TERMINAL_HASH,
      unresolvedDecisionDueAt: '2026-10-23T13:58:35.561Z',
      pending: Object.freeze(['mcpStarts:T1-codex-mcp', 'threadStarts:T1-thread-start']),
      ownedCodexExitObserved: true,
      mcpExitProved: false,
    }),
    r7: Object.freeze({
      root: PRIOR_R7_ROOT,
      status: 'UNKNOWN_NO_RESEND',
      journalSha256: PRIOR_R7_JOURNAL_SHA,
      terminalHash: PRIOR_R7_TERMINAL_HASH,
      unresolvedDecisionDueAt: '2026-10-23T14:18:50.368Z',
      pending: Object.freeze(['mcpStarts:T1-codex-mcp', 'threadStarts:T1-thread-start']),
      ownedCodexExitObserved: true,
      mcpExitProved: false,
    }),
  })
}
