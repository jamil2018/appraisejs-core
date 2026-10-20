import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

// Additive T2 amendment: B14 may make one asking-only outer exec. The R9
// policy remains historical and unmodified. P00 starts no turn or host.
export const PHASE_OUTER_POLICY = Object.freeze({
  version: 'M02-TA-PHASE-R10-OUTER-v1',
  parentPolicyVersion: POLICY.version,
  conditionalB14Maximum: 1,
  aggregateMaximum: POLICY.outerCalls.aggregateMaximum + 1,
  auditRequestsAggregateMaximum: POLICY.cases
    .filter(item => item.phase === 'T2')
    .reduce((sum, item) => sum + 2 * item.limits.scopedCalls, 0),
})

export function outerMaximum(item) {
  if (item.id === 'P00') return 0
  if (item.id === 'B14') return PHASE_OUTER_POLICY.conditionalB14Maximum
  return POLICY.outerCalls.ceilings[item.id]
}

export function auditRequestMaximum(item) {
  return item.phase === 'T2' && item.id !== 'P00' && item.id !== 'B14' ? 2 * item.limits.scopedCalls : 0
}
