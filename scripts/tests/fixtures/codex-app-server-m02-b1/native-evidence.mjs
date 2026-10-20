import { createHash } from 'node:crypto'
import { runtimeUnavailable } from './framing.mjs'

const SOURCE_HASH = '033592963c48548e469a37b7a7570b98b1bd60d82b73873cd0a25e8deeba4ebc'
// Existing saved evidence only; names cannot be reconstructed into captured native descriptors.
export function inspectSavedNativeEvidence(bytes, scopedNames) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > 65536 ||
    createHash('sha256').update(bytes).digest('hex') !== SOURCE_HASH
  )
    throw new Error('saved native evidence identity changed')
  const source = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  if (
    source.evidenceClass !== 'actual-binary-no-model-mcp-elicitation' ||
    source.requests.length !== 1 ||
    source.externalInferenceTurns !== 0
  )
    throw new Error('saved evidence scope')
  const names = source.requests[0].toolNames
  if (
    !Array.isArray(names) ||
    names.length > 128 ||
    names.some(n => typeof n !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(n))
  )
    throw new Error('saved manifest names')
  const allowed = new Set(scopedNames)
  return {
    sourceHash: SOURCE_HASH,
    evidenceClass: 'saved-M01-negative-evidence',
    nativeMappingStatus: 'BLOCKED_MISSING_DESCRIPTORS',
    completeDescriptorsRetained: false,
    broaderNames: names.filter(name => !allowed.has(name)),
    scopedMcpPresent: names.some(name => allowed.has(name)),
    wireRoute: 'UNQUALIFIED',
    containmentQualified: false,
    runtimeExecutionAllowed: false,
  }
}
export function requireNativeMapping() {
  runtimeUnavailable()
}
