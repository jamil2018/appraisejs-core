/** R21 retains the accepted R19 T2 policy and changes only the fresh root. */
import {
  POLICY as BASE_POLICY,
  POLICY_DIGEST as PRIOR_POLICY_DIGEST,
  JOURNAL_BASE_POLICY_DIGEST,
  casePolicy,
  digest,
} from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'

export { casePolicy, digest, JOURNAL_BASE_POLICY_DIGEST }
export const PRIOR_ROOT = BASE_POLICY.roots.T2
export const ROOT = '/private/tmp/appraise-m02-ta-matrix-p7'
export const HISTORICAL_CANONICAL_ROOT = '/private/tmp/appraise-m02-ta-matrix-p4'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  roots: Object.freeze({ ...BASE_POLICY.roots, T2: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
export const ROOT_AMENDMENT = Object.freeze({
  version: 'appraise.m02-ta-matrix-r21-root-amendment/v1',
  priorPolicyDigest: PRIOR_POLICY_DIGEST,
  from: PRIOR_ROOT,
  to: ROOT,
  priorAttempt: 'GATE_ONLY_REFUSED',
  recovery: 'NEW_ROOT_NO_REPLAY',
})
