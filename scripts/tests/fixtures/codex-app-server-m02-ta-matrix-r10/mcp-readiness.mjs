/** Exact scoped-child self-report checks. These are not independent OS exit attestations. */
import { casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

const exact = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...fields].sort().join(',')

export function verifyMcpChildReceipt({ receipt, event, caseId, bootstrapProof, profileDigest }) {
  if (
    casePolicy(caseId).phase !== 'T2' ||
    caseId === 'P00' ||
    !['sdk-connect-returned', 'node-exit-handler'].includes(event) ||
    !/^sha256:[a-f0-9]{64}$/.test(bootstrapProof?.capabilityHash ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(bootstrapProof?.bootstrapHash ?? '') ||
    !/^sha256:[a-f0-9]{64}$/.test(profileDigest ?? '') ||
    !exact(
      receipt,
      event === 'node-exit-handler'
        ? ['schema', 'event', 'evidenceClass', 'caseId', 'capabilityHash', 'bootstrapHash', 'profileDigest', 'exitCode']
        : ['schema', 'event', 'evidenceClass', 'caseId', 'capabilityHash', 'bootstrapHash', 'profileDigest'],
    ) ||
    receipt.schema !== 'appraise.m02-ta-matrix-child-receipt/v1' ||
    receipt.evidenceClass !== 'TRUSTED_CHILD_SELF_REPORT' ||
    receipt.event !== event ||
    receipt.caseId !== caseId ||
    receipt.capabilityHash !== bootstrapProof.capabilityHash ||
    receipt.bootstrapHash !== bootstrapProof.bootstrapHash ||
    receipt.profileDigest !== profileDigest ||
    (event === 'node-exit-handler' && receipt.exitCode !== 0)
  )
    return false
  return true
}
