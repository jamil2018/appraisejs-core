/** Read-only post-consumption evidence reader. This is deliberately not a preparation/run verifier. */
import { createHash } from 'node:crypto'
import { serializeR23Preparation } from '../codex-app-server-m02-ta-matrix-r23/preparation.mjs'
import { digest } from '../codex-app-server-m02-ta-matrix-r23/policy.mjs'
import { verifyR23HistoricalClosure } from '../codex-app-server-m02-ta-matrix-r23/runtime-effects.mjs'
import { readStableFile } from '../codex-app-server-m02-ta-matrix-r23/r21-evidence.mjs'
import { loadSealedRouteEvidence } from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export async function readConsumedR23OfflineInput() {
  const file = '.appraisejs/m02-ta-matrix-build-r23/manifest.json'
  const bytes = await readStableFile(file, 'd80106219ce5d4ac9ada3b18487551805750c9b727789a581a0bd6b7c4c72e93')
  const prepared = JSON.parse(bytes)
  if (prepared.manifestDigest !== digest(prepared.manifest) || prepared.runtimeEligible !== false)
    throw new Error('fixed R23 envelope drift')
  const historical = await verifyR23HistoricalClosure(prepared.manifest)
  let current = 0
  for (const row of prepared.manifest.artifacts) {
    if (historical.has(row.path)) continue
    await readStableFile(row.path, row.sha256)
    current++
  }
  if (current !== 6651 || historical.size !== 23) throw new Error('fixed R23 closure drift')
  const canonical = await readStableFile(
    '.appraisejs/m02-ta-matrix-build-r23/canonical-bridge.mjs',
    prepared.canonicalSha256,
  )
  // Production serialization format, reconstructed solely from the existing generated envelope.
  if (!bytes.equals(serializeR23Preparation({ ...prepared, canonicalBytes: canonical })))
    throw new Error('fixed R23 serialization drift')
  return { ...prepared, manifestFileSha256: sha(bytes), canonicalBytes: canonical, seal: loadSealedRouteEvidence() }
}
