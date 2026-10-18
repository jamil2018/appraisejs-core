/** Exact consumed R23 evidence. Reading it never retries, resumes or qualifies cleanup. */
import fs from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR22Predecessor } from './r22-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { serializeR23Preparation } from '../codex-app-server-m02-ta-matrix-r23/preparation.mjs'
import { verifyR23HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r23/runtime-effects.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest } from './policy.mjs'
import { ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const TERMINAL = join(REPO, '.appraisejs/m02-r23-native-terminal-01.json')
const INDEX = join(REPO, '.appraisejs/m02-r23-native-terminal-evidence-01/index.json')
const ROOT_R23 = '/private/tmp/appraise-m02-ta-matrix-p9'
export const R23_COUNTS = Object.freeze({
  threadStarts: 1,
  turnStarts: 1,
  providerRequests: 2,
  scopedCalls: 0,
  workspaceActions: 0,
  permissionReplies: 0,
  codexStarts: 1,
  mcpStarts: 1,
  listenerStarts: 1,
  controlWrites: 3,
  canonicalRequests: 2,
  helperStarts: 0,
  outerCalls: 1,
  auditRequests: 0,
})

async function readFrozenR23() {
  const manifestPath = join(REPO, '.appraisejs/m02-ta-matrix-build-r23/manifest.json')
  const bytes = await readStableFile(manifestPath, 'd80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93')
  const prepared = JSON.parse(bytes)
  if (prepared.manifestDigest !== digest(prepared.manifest) || prepared.runtimeEligible !== false)
    throw new Error('R24 fixed R23 manifest drift')
  const historical = await verifyR23HistoricalClosure(prepared.manifest)
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (historical.has(row.path)) continue
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 6651 || historical.size !== 23) throw new Error('R24 fixed R23 closure drift')
  const canonicalBytes = await readStableFile(
    join(REPO, '.appraisejs/m02-ta-matrix-build-r23/canonical-bridge.mjs'),
    prepared.canonicalSha256,
  )
  if (!bytes.equals(serializeR23Preparation({ ...prepared, canonicalBytes })))
    throw new Error('R24 fixed R23 serialization drift')
  return {
    ...prepared,
    canonicalBytes,
    manifestFileSha256: 'd80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93',
    seal: loadSealedRouteEvidence(),
  }
}

export async function verifyR23Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR22Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR23()
  const terminal = JSON.parse(
    await readStableFile(TERMINAL, 'cd3bb57ea14549aba30f1fd41f25f12f537a8733b54682ce54660e5ef21f2fe4'),
  )
  const index = JSON.parse(
    await readStableFile(INDEX, 'd81d48bda524bdcd4b59b8518e40e888a0c04a2183516214dc6629eaddf1c9a2'),
  )
  if (
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtime?.consumed !== true ||
    terminal.runtime.runtimeQualified !== false ||
    terminal.journal?.fenced !== true ||
    terminal.journal.reason !== 'AMBIGUOUS_EFFECT' ||
    terminal.journal.sourceHostCapacity?.B01 !== 4 ||
    JSON.stringify(terminal.journal.pending) !==
      JSON.stringify([{ caseId: 'B01', kind: 'providerRequests', id: 'B01-listener-request-2' }]) ||
    Object.keys(terminal.journal.counts).length !== Object.keys(R23_COUNTS).length ||
    Object.entries(R23_COUNTS).some(([key, count]) => terminal.journal.counts[key] !== count) ||
    index.root !== ROOT_R23 ||
    index.journalChainVerified !== true ||
    index.files?.length !== 5 ||
    index.cleanupQualification !== 'UNKNOWN' ||
    index.runtimeAuthority !== false
  )
    throw new Error('R24 consumed R23 terminal drift')
  const state = await fs.lstat(ROOT_R23)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700 ||
    state.dev !== index.rootIdentity.dev ||
    state.ino !== index.rootIdentity.ino
  )
    throw new Error('R24 retained R23 root identity drift')
  const names = [
    'phase-journal.jsonl',
    'provider-failure.json',
    'provider-response-1.json',
    'mcp-startup.json',
    'mcp-exit.json',
  ]
  for (const row of index.files) {
    if (
      !names.includes(row.copy) ||
      row.originalPath !==
        (row.copy === 'phase-journal.jsonl'
          ? join(ROOT_R23, row.copy)
          : join(ROOT_R23, 'cases/B01/supervisor', row.copy))
    )
      throw new Error('R24 R23 sanitized evidence scope drift')
    const copy = await readStableFile(join(dirname(INDEX), row.copy), row.sha256)
    const original = await readStableFile(row.originalPath, row.sha256)
    if (copy.length !== row.bytes || original.length !== row.bytes)
      throw new Error('R24 R23 sanitized evidence length drift')
  }
  if (new Set(index.files.map(row => row.copy)).size !== 5) throw new Error('R24 R23 evidence duplicate')
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r23TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: 'cd3bb57ea14549aba30f1fd41f25f12f537a8733b54682ce54660e5ef21f2fe4',
      indexPath: INDEX,
      indexSha256: 'd81d48bda524bdcd4b59b8518e40e888a0c04a2183516214dc6629eaddf1c9a2',
      status: 'UNKNOWN',
      casesCompleted: 0,
      cleanup: 'UNKNOWN',
      root: ROOT_R23,
      rootIdentity: index.rootIdentity,
      consumed: R23_COUNTS,
      sourceCapacityReserved: 4,
      pendingProviderRequest: 'B01-listener-request-2',
    }),
  })
}
