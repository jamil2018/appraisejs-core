/** Exact consumed R24 evidence. Reading it never retries, resumes or qualifies cleanup. */
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readStableFile } from './r21-evidence.mjs'
import { verifyR23Predecessor } from '../codex-app-server-m02-ta-matrix-r24/r23-evidence.mjs'
import { requireTA04Absent } from './prior-evidence.mjs'
import { serializeR24Preparation } from '../codex-app-server-m02-ta-matrix-r24/preparation.mjs'
import { verifyR24HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r24/runtime-effects.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import { digest } from './policy.mjs'
import { ROOT } from './policy.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const TERMINAL = join(REPO, '.appraisejs/m02-r24-native-terminal-01.json')
const INDEX = join(REPO, '.appraisejs/m02-r24-native-terminal-evidence-01/index.json')
const ROOT_R24 = '/private/tmp/appraise-m02-ta-matrix-p10'
export const R24_COUNTS = Object.freeze({
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

async function readFrozenR24() {
  const manifestPath = join(REPO, '.appraisejs/m02-ta-matrix-build-r24/manifest.json')
  const bytes = await readStableFile(manifestPath, '742f17dbdbaeed3f243b71f3c572e53924cfc2b457a19ba0a1c1c5bb0ea1efd9')
  const prepared = JSON.parse(bytes)
  if (prepared.manifestDigest !== digest(prepared.manifest) || prepared.runtimeEligible !== false)
    throw new Error('R25 fixed R24 manifest drift')
  const historical = await verifyR24HistoricalClosure(prepared.manifest)
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (historical.has(row.path)) continue
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 6710 || historical.size !== 23) throw new Error('R25 fixed R24 closure drift')
  const canonicalBytes = await readStableFile(
    join(REPO, '.appraisejs/m02-ta-matrix-build-r24/canonical-bridge.mjs'),
    prepared.canonicalSha256,
  )
  if (!bytes.equals(serializeR24Preparation({ ...prepared, canonicalBytes })))
    throw new Error('R25 fixed R24 serialization drift')
  return {
    ...prepared,
    canonicalBytes,
    manifestFileSha256: '742f17dbdbaeed3f243b71f3c572e53924cfc2b457a19ba0a1c1c5bb0ea1efd9',
    seal: loadSealedRouteEvidence(),
  }
}

export async function verifyR24Predecessor({ requireNewRootAbsent = true } = {}) {
  const old = await verifyR23Predecessor({ requireNewRootAbsent: false })
  const prepared = await readFrozenR24()
  const terminal = JSON.parse(
    await readStableFile(TERMINAL, '7640d01ac8411514a7b199949a64511a6e8f16238b5121b6811de25fddc4427e'),
  )
  const index = JSON.parse(
    await readStableFile(INDEX, 'f727137bb84b1e1fe5b1d0f62c1a002d6baaed93fa4e15184769c5ecd30a7319'),
  )
  if (
    terminal.status !== 'UNKNOWN' ||
    terminal.completed !== 0 ||
    terminal.failedCase !== 'B01' ||
    terminal.runtimeQualified !== false ||
    terminal.reason !== 'AMBIGUOUS_EFFECT' ||
    terminal.cleanupQualification !== 'UNKNOWN' ||
    terminal.sourceHostCapacityReserved !== 4 ||
    JSON.stringify(terminal.pending) !==
      JSON.stringify([{ caseId: 'B01', kind: 'providerRequests', id: 'B01-listener-request-2' }]) ||
    Object.keys(terminal.consumed).length !== Object.keys(R24_COUNTS).length ||
    Object.entries(R24_COUNTS).some(([key, count]) => terminal.consumed[key] !== count) ||
    index.root !== ROOT_R24 ||
    index.journalChainVerified !== true ||
    index.files?.length !== 5 ||
    index.cleanupQualification !== 'UNKNOWN' ||
    index.runtimeAuthority !== false
  )
    throw new Error('R25 consumed R24 terminal drift')
  const state = await fs.lstat(ROOT_R24)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700 ||
    state.dev !== index.rootIdentity.dev ||
    state.ino !== index.rootIdentity.ino
  )
    throw new Error('R25 retained R24 root identity drift')
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
          ? join(ROOT_R24, row.copy)
          : join(ROOT_R24, 'cases/B01/supervisor', row.copy))
    )
      throw new Error('R25 R24 sanitized evidence scope drift')
    const copy = await readStableFile(join(dirname(INDEX), row.copy), row.sha256)
    const original = await readStableFile(row.originalPath, row.sha256)
    if (row.copy === 'phase-journal.jsonl') {
      let previous = '0'.repeat(64)
      const records = copy
        .toString('utf8')
        .trimEnd()
        .split('\n')
        .map(line => JSON.parse(line))
      for (const [i, record] of records.entries()) {
        const actual = createHash('sha256')
          .update(JSON.stringify({ seq: record.seq, previous: record.previous, event: record.event }))
          .digest('hex')
        if (record.seq !== i + 1 || record.previous !== previous || record.hash !== actual)
          throw new Error('R25 R24 chain drift')
        previous = record.hash
      }
      if (records.length !== 30 || previous !== index.journalLastHash || previous !== terminal.journal.terminalHash)
        throw new Error('R25 R24 terminal chain drift')
    }
    if (copy.length !== row.bytes || original.length !== row.bytes)
      throw new Error('R25 R24 sanitized evidence length drift')
  }
  if (new Set(index.files.map(row => row.copy)).size !== 5) throw new Error('R25 R24 evidence duplicate')
  if (requireNewRootAbsent) await requireTA04Absent(ROOT)
  return Object.freeze({
    ...old,
    prepared,
    r24TerminalEvidence: Object.freeze({
      path: TERMINAL,
      sha256: '7640d01ac8411514a7b199949a64511a6e8f16238b5121b6811de25fddc4427e',
      indexPath: INDEX,
      indexSha256: 'f727137bb84b1e1fe5b1d0f62c1a002d6baaed93fa4e15184769c5ecd30a7319',
      status: 'UNKNOWN',
      casesCompleted: 0,
      cleanup: 'UNKNOWN',
      root: ROOT_R24,
      rootIdentity: index.rootIdentity,
      consumed: R24_COUNTS,
      sourceCapacityReserved: 4,
      pendingProviderRequest: 'B01-listener-request-2',
    }),
  })
}
