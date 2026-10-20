/** R19 retains the accepted R17 T2 policy and changes only the fresh root. */
import {
  POLICY as BASE_POLICY,
  POLICY_DIGEST as PRIOR_POLICY_DIGEST,
  JOURNAL_BASE_POLICY_DIGEST,
  casePolicy,
  digest,
} from '../codex-app-server-m02-ta-matrix-r17/policy.mjs'

export { casePolicy, digest, JOURNAL_BASE_POLICY_DIGEST }
export const PRIOR_ROOT = BASE_POLICY.roots.T2
export const ROOT = '/private/tmp/appraise-m02-ta-matrix-p5'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  roots: Object.freeze({ ...BASE_POLICY.roots, T2: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
export const ROOT_AMENDMENT = Object.freeze({
  version: 'appraise.m02-ta-matrix-r19-root-amendment/v1',
  priorPolicyDigest: PRIOR_POLICY_DIGEST,
  from: PRIOR_ROOT,
  to: ROOT,
  priorAttempt: 'UNKNOWN',
  recovery: 'NEW_ROOT_NO_REPLAY',
})
