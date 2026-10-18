/** R25 retains the accepted T2 policy and uses fresh p11 after consumed R24 p10. */
import {
  POLICY as BASE_POLICY,
  JOURNAL_BASE_POLICY_DIGEST,
  casePolicy,
  digest,
} from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import {
  POLICY_DIGEST as PRIOR_POLICY_DIGEST,
  ROOT as R24_ROOT,
} from '../codex-app-server-m02-ta-matrix-r24/policy.mjs'

export { casePolicy, digest, JOURNAL_BASE_POLICY_DIGEST }
export const PRIOR_ROOT = R24_ROOT
export const ROOT = '/private/tmp/appraise-m02-ta-matrix-p11'
export const HISTORICAL_CANONICAL_ROOT = '/private/tmp/appraise-m02-ta-matrix-p4'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  roots: Object.freeze({ ...BASE_POLICY.roots, T2: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
export const ROOT_AMENDMENT = Object.freeze({
  version: 'appraise.m02-ta-matrix-r25-root-amendment/v1',
  priorPolicyDigest: PRIOR_POLICY_DIGEST,
  from: PRIOR_ROOT,
  to: ROOT,
  priorAttempt: 'UNKNOWN',
  recovery: 'NEW_ROOT_NO_REPLAY',
})
