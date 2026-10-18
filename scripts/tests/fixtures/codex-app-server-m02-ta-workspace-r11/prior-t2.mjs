/** Read-only R12 T2 actual prerequisite. A consumed R11 UNKNOWN cannot qualify T3. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY, digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const T2_ROOT = '/private/tmp/appraise-m02-ta-matrix-p2'
export const T2_MANIFEST = join(REPO, '.appraisejs/m02-ta-matrix-build-r12/manifest.json')
const R12_MANIFEST_DIGEST = 'b491149d39635d1592092b1df76d4bbe0fe5f8a53a8337e1809cb75a21c2b48f'
const R12_MANIFEST_FILE_SHA = '7bb8aca0af7f5818be18cb56235b3bd1f4841259380feeb3183c41393244795d'
export const T2_ARCHIVE = join(REPO, '.appraisejs/m02-ta-t2-r12-execution-evidence-01')
export const T2_INDEX = join(T2_ARCHIVE, 'index.json')
export const T2_ACTUAL_REVIEW = join(REPO, '.appraisejs/m02-t2-r12-execution-review-01.json')
const EXACT_REVIEW = join(REPO, '.appraisejs/m02-t2-r12-exact-review.json')
const USER_DECISION = join(REPO, '.appraisejs/m02-t2-r12-recovery-user-decision.json')
const R12_ENTRY = join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-ta-matrix-r12/entrypoint.mjs')
const NODE = '/opt/homebrew/Cellar/node/26.11.0/bin/node'
const PROPOSAL = join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t2-recovery-01.md')
const PROPOSAL_SHA = '31fc52c32913197df112ab14cd9eb7ed6e811b5ceed384432ee953a6965bf218'
const SHA = /^[a-f0-9]{64}$/
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const cases = POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id)
const caseSet = new Set(cases)
const receiptNames =
  /^(?:mcp-startup|mcp-exit|script-plan|provider-response-[1-4]|permission-request|permission-terminal|protocol-failure|case-outcome)\.json$/
const safeCopy = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name)
const identity = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])
function safeSource(source) {
  if (
    source === 'phase-journal.jsonl' ||
    source === 'supervisor/module-stage.json' ||
    source === 'startup-failure.json'
  )
    return true
  const match = /^cases\/([^/]+)\/supervisor\/([^/]+)$/.exec(source ?? '')
  return Boolean(match && caseSet.has(match[1]) && receiptNames.test(match[2]))
}
export function assertR12ActualIdentity({ index, review, manifestDigest, manifestFileSha256 }) {
  if (
    index?.schema !== 'appraise.m02-ta-r12-sanitized-evidence-archive/v1' ||
    index.sourceRoot !== T2_ROOT ||
    index.manifestDigest !== manifestDigest ||
    index.manifestSha256 !== manifestFileSha256 ||
    index.outcome !== 'T2_CASES_COMPLETED' ||
    review?.schema !== 'appraise.m02-ta-t2-r12-actual-review/v1' ||
    review.verdict !== 'ACCEPT_T2_R12_ACTUAL_WITH_LIMITS' ||
    review.runtimeVerdict !== 'T2_CASES_COMPLETED' ||
    review.execution?.root !== T2_ROOT ||
    review.manifestDigest !== manifestDigest ||
    review.manifestFileSha256 !== manifestFileSha256 ||
    review.unresolvedUnknown !== false
  )
    throw new Error('R12 actual identity absent or old UNKNOWN evidence supplied')
}
async function stableBytes(file, { privateMode = true, max = 8 * 1024 * 1024, owner = true, singleLink = true } = {}) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    (owner && before.uid !== process.getuid()) ||
    (singleLink && before.nlink !== 1) ||
    (before.mode & 0o022) !== 0 ||
    (privateMode && (before.mode & 0o777) !== 0o600) ||
    before.size < 1 ||
    before.size > max
  )
    throw new Error('accepted T2 file identity changed')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!identity(before, held)) throw new Error('accepted T2 file replaced')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const afterPath = await fs.lstat(file)
    if (!identity(before, after) || !identity(before, afterPath) || bytes.length !== before.size)
      throw new Error('accepted T2 file changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}
async function pinnedArtifact(item) {
  if (typeof item?.path !== 'string' || !item.path.startsWith('/') || !SHA.test(item.sha256 ?? ''))
    throw new Error('accepted T2 artifact pin invalid')
  const bytes = await stableBytes(item.path, {
    privateMode: false,
    max: 400 * 1024 * 1024,
    owner: false,
    singleLink: false,
  })
  if (sha(bytes) !== item.sha256) throw new Error('accepted T2 artifact drift')
}
function verifyJournal(bytes, review) {
  if (sha(bytes) !== review.journal.sha256 || bytes.length > 512 * 1024 || !bytes.toString('utf8').endsWith('\n'))
    throw new Error('accepted T2 terminal journal drift')
  const lines = bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .map(line => JSON.parse(line))
  if (lines.length !== review.journal.checkpointSeq || lines.at(-1)?.event?.type !== 'checkpoint')
    throw new Error('accepted T2 journal checkpoint missing')
  let previous = '0'.repeat(64),
    active = null,
    finished = 0
  for (const [index, record] of lines.entries()) {
    if (
      record.seq !== index + 1 ||
      record.previous !== previous ||
      record.hash !== sha(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event })) ||
      ['unknown', 'recovery'].includes(record.event?.type)
    )
      throw new Error('accepted T2 journal chain or UNKNOWN')
    if (
      index === 0 &&
      (record.event?.type !== 'init' ||
        record.event.phase !== 'T2' ||
        record.event.directoryIdentity?.dev !== review.execution.rootIdentity.dev ||
        record.event.directoryIdentity?.ino !== review.execution.rootIdentity.ino)
    )
      throw new Error('accepted T2 journal root changed')
    if (record.event?.type === 'begin') {
      if (active !== null || record.event.caseId !== cases[finished]) throw new Error('accepted T2 begin order')
      active = record.event.caseId
    } else if (record.event?.type === 'finish') {
      const witness = review.cases[finished]
      if (
        active !== witness?.caseId ||
        record.event.cleanupKnown !== true ||
        record.event.caseWitnessSha256 !== witness.witnessSha256 ||
        record.hash !== witness.finishHash
      )
        throw new Error('accepted T2 finish/witness mismatch')
      active = null
      finished++
    }
    previous = record.hash
  }
  if (active !== null || finished !== 24 || previous !== review.journal.terminalHash)
    throw new Error('accepted T2 terminal count/hash drift')
}

/** Verifies fixed R12 preparation after p2 exists; R12's pre-run verifier intentionally requires p2 absent. */
export async function verifyAcceptedT2Evidence() {
  const manifestBytes = await stableBytes(T2_MANIFEST, { max: 8 * 1024 * 1024 })
  const envelope = JSON.parse(manifestBytes)
  const manifest = envelope?.manifest
  const manifestFileSha256 = sha(manifestBytes)
  if (
    manifestFileSha256 !== R12_MANIFEST_FILE_SHA ||
    envelope.manifestDigest !== R12_MANIFEST_DIGEST ||
    envelope.schema !== 'appraise.m02-ta-matrix-r12-preparation/v1' ||
    envelope.manifestDigest !== digest(manifest) ||
    envelope.blockers?.length !== 0 ||
    envelope.runtimeEligible !== false ||
    manifest?.version !== 'appraise.m02-ta-matrix-r12/v1' ||
    manifest.phase !== 'T2' ||
    manifest.root !== T2_ROOT ||
    JSON.stringify(manifest.cases) !== JSON.stringify(cases) ||
    manifest.rootAmendment?.from !== POLICY.roots.T2 ||
    manifest.rootAmendment.to !== T2_ROOT ||
    manifest.recoveryProposalPath !== PROPOSAL ||
    manifest.recoveryProposalSha256 !== PROPOSAL_SHA ||
    manifest.recoveryBudget?.oldCommandConsumed !== true ||
    manifest.recoveryBudget?.newInvocationRequiresSeparateExplicitUserDecision !== true ||
    manifest.installedCodeModeHost?.uid !== 502 ||
    manifest.installedCodeModeHost.processImageAttested !== false
  )
    throw new Error('accepted R12 T2 preparation shape changed')
  if (
    !Array.isArray(manifest.artifacts) ||
    manifest.artifacts.length !== 6371 ||
    new Set(manifest.artifacts.map(item => item.path)).size !== manifest.artifacts.length
  )
    throw new Error('accepted R12 T2 closure changed')
  try {
    await Promise.all([fs.lstat(T2_INDEX), fs.lstat(T2_ACTUAL_REVIEW)])
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('independently accepted R12 T2 actual evidence unavailable')
    throw error
  }
  for (const item of manifest.artifacts) await pinnedArtifact(item)
  const proposalBytes = await stableBytes(PROPOSAL, { privateMode: false })
  if (sha(proposalBytes) !== PROPOSAL_SHA) throw new Error('R12 proposal changed')
  const root = await fs.lstat(T2_ROOT)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid() || (root.mode & 0o777) !== 0o700)
    throw new Error('accepted T2 p2 root identity changed')
  const directory = await fs.lstat(T2_ARCHIVE)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700 ||
    (await fs.realpath(T2_ARCHIVE)) !== T2_ARCHIVE
  )
    throw new Error('accepted T2 archive identity changed')
  const [indexBytes, reviewBytes, exactReviewBytes, decisionBytes] = await Promise.all([
    stableBytes(T2_INDEX),
    stableBytes(T2_ACTUAL_REVIEW),
    stableBytes(EXACT_REVIEW),
    stableBytes(USER_DECISION),
  ])
  const index = JSON.parse(indexBytes),
    review = JSON.parse(reviewBytes)
  const exactReview = JSON.parse(exactReviewBytes),
    decision = JSON.parse(decisionBytes)
  const indexSha256 = sha(indexBytes),
    reviewSha256 = sha(reviewBytes)
  assertR12ActualIdentity({ index, review, manifestDigest: envelope.manifestDigest, manifestFileSha256 })
  const invocation = [
    '/usr/bin/env',
    '-i',
    'PATH=/usr/bin:/bin',
    'LANG=C',
    NODE,
    R12_ENTRY,
    '--run',
    T2_MANIFEST,
    envelope.manifestDigest,
    manifestFileSha256,
  ]
  const entryPin = manifest.artifacts.find(item => item.path === R12_ENTRY)
  if (
    index.schema !== 'appraise.m02-ta-r12-sanitized-evidence-archive/v1' ||
    index.sourceRoot !== T2_ROOT ||
    index.manifestDigest !== envelope.manifestDigest ||
    index.manifestSha256 !== manifestFileSha256 ||
    index.outcome !== 'T2_CASES_COMPLETED' ||
    index.sourceEvidenceChanged !== false ||
    !Array.isArray(index.records)
  )
    throw new Error('R12 T2 archive outcome or binding changed')
  if (
    review.schema !== 'appraise.m02-ta-t2-r12-actual-review/v1' ||
    review.verdict !== 'ACCEPT_T2_R12_ACTUAL_WITH_LIMITS' ||
    review.runtimeVerdict !== 'T2_CASES_COMPLETED' ||
    review.manifestDigest !== envelope.manifestDigest ||
    review.manifestFileSha256 !== manifestFileSha256 ||
    review.archiveIndexSha256 !== indexSha256 ||
    review.casesCompleted !== 24 ||
    review.unresolvedUnknown !== false ||
    review.execution?.root !== T2_ROOT ||
    review.execution?.manifestDigest !== envelope.manifestDigest ||
    review.execution?.rootIdentity?.dev !== root.dev ||
    review.execution.rootIdentity.ino !== root.ino ||
    review.archive?.indexSha256 !== indexSha256 ||
    review.archive.sourceEvidenceChanged !== false ||
    review.archive.sourceArchiveByteEquality !== true ||
    review.archive.currentSourceIdentitiesMatch !== true ||
    review.journal?.unknown !== false ||
    JSON.stringify(review.journal.pending) !== '[]' ||
    !SHA.test(review.journal.sha256 ?? '') ||
    !SHA.test(review.journal.terminalHash ?? '') ||
    !Number.isSafeInteger(review.journal.checkpointSeq) ||
    !Array.isArray(review.cases) ||
    review.cases.length !== 24 ||
    review.cases.some(
      (item, index) =>
        item.caseId !== cases[index] || !SHA.test(item.finishHash ?? '') || !SHA.test(item.witnessSha256 ?? ''),
    ) ||
    typeof review.reviewer !== 'string' ||
    !/^\/root\/[A-Za-z0-9_-]{1,100}$/.test(review.reviewer) ||
    !Array.isArray(review.limits) ||
    review.limits.length === 0
  )
    throw new Error('independent R12 T2 actual review absent or changed')
  if (
    review.exactReview?.path !== EXACT_REVIEW ||
    review.exactReview.sha256 !== sha(exactReviewBytes) ||
    review.userDecision?.path !== USER_DECISION ||
    review.userDecision.sha256 !== sha(decisionBytes) ||
    review.recoveryProposal?.path !== PROPOSAL ||
    review.recoveryProposal.sha256 !== PROPOSAL_SHA ||
    exactReview.schema !== 'appraise.m02-ta-t2-r12-exact-review/v1' ||
    exactReview.verdict !== 'ACCEPT_ONE_FIXED_T2_R12_INVOCATION' ||
    exactReview.reviewer !== '/root/r6_exact_review' ||
    exactReview.runtimeVerdict !== 'NOT_RUN' ||
    JSON.stringify(exactReview.exactInvocationPrefix) !== JSON.stringify(invocation) ||
    exactReview.entrypointSha256 !== entryPin?.sha256 ||
    exactReview.recoveryProposalSha256 !== PROPOSAL_SHA ||
    exactReview.manifest?.path !== T2_MANIFEST ||
    exactReview.manifest?.manifestDigest !== envelope.manifestDigest ||
    exactReview.manifest.fileSha256 !== manifestFileSha256 ||
    exactReview.manifest.root !== T2_ROOT ||
    JSON.stringify(exactReview.manifest.cases) !== JSON.stringify(cases) ||
    decision.schema !== 'appraise.m02-ta-t2-r12-recovery-user-decision/v1' ||
    decision.verdict !== 'APPROVE_ONE_FIXED_T2_R12_RECOVERY' ||
    decision.scope !== 'ONE_NEW_FULL_T2_P2_INVOCATION_NO_RESUME' ||
    decision.evidenceClass !== 'VISIBLE_HOST_CONVERSATION_DECISION_TRANSCRIBED_NOT_CRYPTOGRAPHIC_ATTESTATION' ||
    decision.manifestDigest !== envelope.manifestDigest ||
    decision.manifestFileSha256 !== manifestFileSha256 ||
    decision.exactReviewSha256 !== sha(exactReviewBytes) ||
    decision.proposal?.path !== PROPOSAL ||
    JSON.stringify(decision.exactInvocationPrefix) !== JSON.stringify([...invocation, sha(exactReviewBytes)]) ||
    decision.priorT2UnknownPreserved !== true ||
    decision.cumulativeWholeCampaignCeilings?.listenerStarts !== 28 ||
    decision.cumulativeWholeCampaignCeilings?.controlWrites !== 109 ||
    decision.cumulativeWholeCampaignCeilings?.sourceCapacity !== 66 ||
    decision.proposal?.sha256 !== PROPOSAL_SHA
  )
    throw new Error('R12 T2 review/decision/proposal closure changed')
  const listed = new Set(['index.json']),
    pins = [
      { path: T2_MANIFEST, purpose: 'accepted-t2-r12-manifest', sha256: manifestFileSha256 },
      { path: T2_INDEX, purpose: 'accepted-t2-r12-archive-index', sha256: indexSha256 },
      { path: T2_ACTUAL_REVIEW, purpose: 'accepted-t2-r12-actual-review', sha256: reviewSha256 },
      { path: EXACT_REVIEW, purpose: 'accepted-t2-r12-exact-review', sha256: sha(exactReviewBytes) },
      { path: USER_DECISION, purpose: 'accepted-t2-r12-user-decision', sha256: sha(decisionBytes) },
      { path: PROPOSAL, purpose: 'accepted-t2-r12-recovery-proposal', sha256: PROPOSAL_SHA },
    ]
  const archiveBytes = new Map()
  const sources = new Set()
  for (const record of index.records) {
    const source = record?.source
    if (
      !safeSource(source) ||
      sources.has(source) ||
      (record.sourceRelativePath !== undefined && record.sourceRelativePath !== source)
    )
      throw new Error('R12 T2 archive source rejected')
    sources.add(source)
    const current = join(T2_ROOT, source)
    if (record.status === 'MISSING_ENOENT') {
      if (record.copy !== undefined) throw new Error('R12 missing record has copy')
      try {
        await fs.lstat(current)
        throw new Error('R12 missing source appeared')
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
      continue
    }
    if (
      record.status !== 'COPIED' ||
      !safeCopy(record.copy) ||
      record.copy !== source.replaceAll('/', '--') ||
      !SHA.test(record.sha256 ?? '') ||
      !Number.isSafeInteger(record.bytes) ||
      record.bytes < 2 ||
      listed.has(record.copy)
    )
      throw new Error('R12 T2 archive record invalid')
    listed.add(record.copy)
    const file = join(T2_ARCHIVE, record.copy)
    if (dirname(file) !== T2_ARCHIVE || basename(file) !== record.copy) throw new Error('R12 T2 archive escaped')
    const [copy, original] = await Promise.all([stableBytes(file), stableBytes(current)])
    if (
      copy.length !== record.bytes ||
      original.length !== record.bytes ||
      sha(copy) !== record.sha256 ||
      sha(original) !== record.sha256
    )
      throw new Error('R12 T2 safe archive/current byte mismatch')
    archiveBytes.set(source, copy)
    pins.push({ path: file, purpose: `accepted-t2-r12-safe:${record.copy}`, sha256: record.sha256 })
    pins.push({ path: current, purpose: `accepted-t2-r12-current:${source}`, sha256: record.sha256 })
  }
  if (sha(archiveBytes.get('phase-journal.jsonl') ?? Buffer.alloc(0)) !== review.journal.sha256)
    throw new Error('R12 T2 safe journal absent')
  verifyJournal(archiveBytes.get('phase-journal.jsonl'), review)
  for (const item of review.cases) {
    const source = `cases/${item.caseId}/supervisor/case-outcome.json`
    if (sha(archiveBytes.get(source) ?? Buffer.alloc(0)) !== item.witnessSha256)
      throw new Error('R12 T2 case witness absent or mismatched')
  }
  const actual = await fs.readdir(T2_ARCHIVE)
  if (actual.length !== listed.size || actual.some(file => !listed.has(file)))
    throw new Error('R12 T2 archive contains unindexed files')
  return Object.freeze({
    manifest,
    manifestDigest: envelope.manifestDigest,
    manifestFileSha256,
    canonicalSha256: envelope.canonicalSha256,
    seal: loadSealedRouteEvidence(),
    indexSha256,
    reviewSha256,
    casesCompleted: 24,
    unresolvedUnknown: false,
    exactReviewSha256: sha(exactReviewBytes),
    userDecisionSha256: sha(decisionBytes),
    recoveryProposalSha256: PROPOSAL_SHA,
    files: Object.freeze(pins),
  })
}
