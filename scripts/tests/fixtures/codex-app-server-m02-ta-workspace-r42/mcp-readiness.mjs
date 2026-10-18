/** T3 required MCP startup/exit self-report; this does not attest an OS child exit. */
import { casePolicy } from './policy.mjs'

const exact = (value, fields) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...fields].sort().join(',')

export function verifyWorkspaceMcpReceipt({ receipt, event, caseId, bootstrapProof, profileDigest }) {
  if (
    casePolicy(caseId).phase !== 'T3' ||
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
    receipt.schema !== 'appraise.m02-ta-workspace-child-receipt/v1' ||
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
