/** Read-only binding of consumed R15/R16 preflight evidence; never reruns either command. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const R15_ROOT = '/private/tmp/appraise-m02-ta-host-preflight-p1'
const R16_ROOT = '/private/tmp/appraise-m02-ta-host-preflight-p2'
const ARCHIVE = join(REPO, '.appraisejs/m02-host-preflight-r16-execution-evidence-01')
const PINS = Object.freeze({
  r15Review: [
    '.appraisejs/m02-host-preflight-r15-execution-review-01.json',
    '1f17b62f5ae86f85c6baff7b674c5f2f200e27c92c7cf97209068cc53a89e2ce',
  ],
  r16Review: [
    '.appraisejs/m02-host-preflight-r16-execution-review-01.json',
    '9d21bac065f17090783356fd996773c2ac96ea1798461d7bd96401dcfaacc236',
  ],
  r16Visible: [
    '.appraisejs/m02-host-preflight-r16-execution-result-01.json',
    '1ea9063cfab713f13733c15e81fb5678369421ad1c92f090e88fff23fa4c04ae',
  ],
  r16Index: [
    '.appraisejs/m02-host-preflight-r16-execution-evidence-01/index.json',
    'c980e1b457ef50a1f36297f79d4ec61fdf7990e9de4b66fcf6c5be2a793ecb9e',
  ],
  r16Manifest: [
    '.appraisejs/m02-ta-host-preflight-build-r16/manifest.json',
    'ae05bb826450d276cbb880d603179c9fc64f6e3a12c9870364db67e8b536793a',
  ],
  r16ExactReview: [
    '.appraisejs/m02-host-preflight-r16-exact-review.json',
    'c5101a25a4d71a236da783dd460f309bbb75f54f77feb002fdb2966a71094a48',
  ],
  r16Decision: [
    '.appraisejs/m02-host-preflight-r16-user-decision.json',
    '748f37aa8059b2039a7b86834027dc609055c6eb36518eb91cb39f8b6439d009',
  ],
})
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => a[key] === b[key])
async function exactFile(file, expected, { privateFile = false } = {}) {
  const before = await fs.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & (privateFile ? 0o777 : 0o022)) !== (privateFile ? 0o600 : 0) ||
    before.nlink !== 1 ||
    before.size > 1024 * 1024
  )
    throw new Error('preflight file identity drift')
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const held = await handle.stat()
    if (!same(before, held)) throw new Error('preflight replaced before read')
    const bytes = await handle.readFile()
    const after = await handle.stat()
    const current = await fs.lstat(file)
    if (!same(before, after) || !same(before, current) || bytes.length !== before.size || sha(bytes) !== expected)
      throw new Error('preflight hash or identity drift')
    return bytes
  } finally {
    await handle.close()
  }
}
async function exactPrivateDir(path, expected) {
  const state = await fs.lstat(path)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700 ||
    state.dev !== expected.dev ||
    state.ino !== expected.ino
  )
    throw new Error('preflight directory identity drift')
}

export async function verifyConsumedPreflights({ readPinned = exactFile } = {}) {
  const bytes = {}
  const pins = []
  for (const [name, [relativePath, expected]] of Object.entries(PINS)) {
    const path = join(REPO, relativePath)
    bytes[name] = await readPinned(path, expected, { privateFile: true })
    if (!Buffer.isBuffer(bytes[name]) || sha(bytes[name]) !== expected)
      throw new Error('preflight pinned evidence drift')
    pins.push(path)
  }
  const r15 = JSON.parse(bytes.r15Review)
  const review = JSON.parse(bytes.r16Review)
  const visible = JSON.parse(bytes.r16Visible)
  const index = JSON.parse(bytes.r16Index)
  const manifest = JSON.parse(bytes.r16Manifest)
  const exactReview = JSON.parse(bytes.r16ExactReview)
  const decision = JSON.parse(bytes.r16Decision)
  if (
    r15.runtimeVerdict !== 'UNKNOWN' ||
    r15.oneShotConsumed !== true ||
    r15.actualObservation?.listenerBind !== 'NOT_OBSERVED' ||
    r15.actualObservation?.rootDev !== 16777230 ||
    r15.actualObservation?.rootIno !== 68970680 ||
    review.schema !== 'appraise.m02-ta-host-preflight-r16-actual-evidence-review/v1' ||
    review.verdict !== 'ACCEPT_ACTUAL_R16_OBSERVED_PERMISSION_CHECK_ONLY' ||
    review.actualObservation?.cliStatus !== 'OBSERVED_PERMISSION_CHECK_ONLY' ||
    review.actualObservation?.diskResultStatus !== 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE' ||
    review.actualObservation?.exitCode !== 0 ||
    review.actualObservation?.visibleToolSessionId !== 50732 ||
    review.actualObservation?.requestedHostToolMode !== 'require_escalated' ||
    review.actualObservation?.actualHostMode !== 'UNATTESTED' ||
    review.actualObservation?.root !== R16_ROOT ||
    review.actualObservation?.rootDev !== 16777230 ||
    review.actualObservation?.rootIno !== 68982623 ||
    review.actualObservation?.listenerStartsReported !== 1 ||
    review.actualObservation?.listenerCloseObservedReported !== true ||
    review.actualObservation?.directoriesCreatedReported !== 8 ||
    review.independentReadOnlyChecks?.rootTreeExactlyEightDirectoriesAndThreeNamedFiles !== true ||
    review.independentReadOnlyChecks?.allThreeArchiveCopiesByteEqualToOwnedSource !== true ||
    review.independentReadOnlyChecks?.r16SourcePinsMatch !== 4 ||
    review.scope?.oneShotConsumed !== true ||
    review.scope?.retryAuthority !== false ||
    review.scope?.t2OrT3Authorized !== false ||
    review.exactBindings?.visibleToolTranscriptionSha256 !== PINS.r16Visible[1] ||
    review.exactBindings?.archiveIndexSha256 !== PINS.r16Index[1] ||
    review.exactBindings?.manifestFileSha256 !== PINS.r16Manifest[1] ||
    review.exactBindings?.exactReviewSha256 !== PINS.r16ExactReview[1] ||
    review.exactBindings?.userDecisionSha256 !== PINS.r16Decision[1] ||
    visible.reportedResult?.status !== 'OBSERVED_PERMISSION_CHECK_ONLY' ||
    visible.reportedResult?.resultFileCandidateOnly !== true ||
    visible.reportedResult?.listenerCloseObserved !== true ||
    visible.exitCode !== 0 ||
    visible.actualHostMode !== 'UNATTESTED' ||
    visible.requestedHostToolMode !== 'require_escalated' ||
    visible.archiveIndexSha256 !== PINS.r16Index[1] ||
    index.outcomeProvenance !== 'CLI_COMPLETION_RECEIPT_PLUS_CANDIDATE_DISK_RESULT_NOT_DISK_RESULT_ALONE' ||
    index.outcome !== 'OBSERVED_PERMISSION_CHECK_ONLY' ||
    index.sourceRoot !== R16_ROOT ||
    index.sourceEvidenceChanged !== false ||
    index.rootIdentity?.dev !== 16777230 ||
    index.rootIdentity?.ino !== 68982623 ||
    index.records?.length !== 3 ||
    manifest.schema !== 'appraise.m02-ta-host-preflight-r16-preparation/v1' ||
    manifest.manifestDigest !== review.exactBindings.manifestDigest ||
    manifest.manifest?.prior?.r15Outcome !== 'UNKNOWN' ||
    manifest.manifest?.prior?.r15Root?.path !== R15_ROOT ||
    manifest.manifest?.prior?.r15Root?.ino !== 68970680 ||
    exactReview.verdict !== 'ACCEPT_ONE_FIXED_R16_HOST_PREFLIGHT_INVOCATION' ||
    decision.decision !== 'APPROVE_ONE_FIXED_R16_HOST_PREFLIGHT'
  )
    throw new Error('preflight provenance or scope drift')
  const r15Pins = manifest.manifest.prior.r15Evidence
  if (
    !Array.isArray(r15Pins) ||
    r15Pins.length !== 7 ||
    r15Pins.some(
      item =>
        !item.path.startsWith(`${REPO}${sep}.appraisejs${sep}m02-host-preflight-r15-`) ||
        !/^[a-f0-9]{64}$/.test(item.sha256),
    )
  )
    throw new Error('R15 inherited closure drift')
  for (const item of r15Pins) {
    await exactFile(item.path, item.sha256, { privateFile: true })
    pins.push(item.path)
  }
  const r16Sources = manifest.manifest.sources
  if (
    !Array.isArray(r16Sources) ||
    r16Sources.length !== 4 ||
    r16Sources.some(
      item => !item.path.startsWith(`${REPO}${sep}scripts${sep}tests${sep}`) || !/^[a-f0-9]{64}$/.test(item.sha256),
    )
  )
    throw new Error('R16 source closure drift')
  for (const item of r16Sources) {
    await exactFile(item.path, item.sha256)
    pins.push(item.path)
  }
  const r15Result = join(R15_ROOT, 'result.json')
  await exactPrivateDir(R15_ROOT, { dev: 16777230, ino: 68970680 })
  await exactFile(r15Result, '34d49d5f61079e0724482a54e1a3f7a41d62c7b141f141c8f358250b53893d74', { privateFile: true })
  if (JSON.stringify(await fs.readdir(R15_ROOT)) !== JSON.stringify(['result.json']))
    throw new Error('R15 retained root tree drift')
  pins.push(r15Result)
  if (
    index.directoryMetadata?.length !== 8 ||
    index.observedTreeEntries?.length !== 10 ||
    new Set(index.observedTreeEntries).size !== 10
  )
    throw new Error('R16 tree manifest drift')
  const expectedEntries = new Set(index.observedTreeEntries)
  const actualEntries = []
  async function walk(dir) {
    for (const name of await fs.readdir(dir)) {
      const file = join(dir, name)
      const rel = relative(R16_ROOT, file)
      if (rel.startsWith('..') || rel.includes(`${sep}..${sep}`)) throw new Error('preflight path escape')
      const state = await fs.lstat(file)
      if (state.isSymbolicLink()) throw new Error('preflight symlink')
      actualEntries.push(rel)
      if (state.isDirectory()) await walk(file)
      else if (!state.isFile()) throw new Error('preflight special file')
    }
  }
  await walk(R16_ROOT)
  if (actualEntries.length !== expectedEntries.size || actualEntries.some(item => !expectedEntries.has(item)))
    throw new Error('R16 exact tree drift')
  for (const item of index.directoryMetadata) {
    if (item.exists !== true || item.isDirectory !== true || item.isSymlink !== false || item.mode !== 0o700)
      throw new Error('R16 directory metadata drift')
    await exactPrivateDir(item.relativePath === '.' ? R16_ROOT : join(R16_ROOT, item.relativePath), item)
  }
  const archiveNames = new Set(['index.json'])
  for (const record of index.records) {
    if (
      record.status !== 'COPIED' ||
      !['listener-intent.json', 'result.json', 'cases/B01/workspace/synthetic.txt'].includes(record.source) ||
      !/^[a-f0-9]{64}$/.test(record.sha256 ?? '') ||
      archiveNames.has(record.copy)
    )
      throw new Error('R16 archive record drift')
    const source = join(R16_ROOT, record.source)
    const archive = join(ARCHIVE, record.copy)
    const [a, b] = await Promise.all([
      exactFile(source, record.sha256, { privateFile: true }),
      exactFile(archive, record.sha256, { privateFile: true }),
    ])
    if (!a.equals(b) || a.length !== record.bytes) throw new Error('R16 archive equality drift')
    archiveNames.add(record.copy)
    pins.push(source, archive)
    if (record.source === 'result.json' && JSON.parse(a).status !== 'CANDIDATE_OBSERVATION_PENDING_FINAL_DEADLINE')
      throw new Error('R16 disk result provenance drift')
    if (record.source === 'listener-intent.json') {
      const intent = JSON.parse(a)
      if (intent.host !== '127.0.0.1' || intent.port !== 0 || intent.listenerStarts !== 1)
        throw new Error('R16 listener intent drift')
    }
  }
  const archiveEntries = await fs.readdir(ARCHIVE)
  if (archiveEntries.length !== archiveNames.size || archiveEntries.some(name => !archiveNames.has(name)))
    throw new Error('R16 archive tree drift')
  return Object.freeze({
    status: 'R15_UNKNOWN_R16_CLI_OBSERVED_PERMISSION_CHECK_ONLY',
    evidenceClass: 'PINNED_DISK_AND_VISIBLE_CLI_TRANSCRIPTION_NOT_HOST_MODE_ATTESTATION',
    r15ReviewSha256: PINS.r15Review[1],
    r16ReviewSha256: PINS.r16Review[1],
    r16ArchiveIndexSha256: PINS.r16Index[1],
    r16VisibleSha256: PINS.r16Visible[1],
    r16ManifestSha256: PINS.r16Manifest[1],
    r16ManifestDigest: manifest.manifestDigest,
    r16RootIdentity: Object.freeze({ dev: 16777230, ino: 68982623 }),
    allocations: Object.freeze({
      r15: Object.freeze({ nodeCommands: 1, directories: 1, files: 1, listenerStarts: 0 }),
      r16: Object.freeze({ nodeCommands: 1, directories: 8, files: 3, listenerStarts: 1 }),
    }),
    pinnedFiles: Object.freeze([...new Set(pins)]),
  })
}
