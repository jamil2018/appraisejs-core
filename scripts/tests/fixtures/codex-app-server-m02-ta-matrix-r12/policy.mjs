/** The sole R12 policy amendment is the fresh T2 root. R9 rules and digest remain historical. */
import {
  POLICY as BASE_POLICY,
  POLICY_DIGEST as BASE_POLICY_DIGEST,
  casePolicy,
  digest,
} from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

export { casePolicy, digest }
export const PRIOR_ROOT = BASE_POLICY.roots.T2
export const ROOT = '/private/tmp/appraise-m02-ta-matrix-p2'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  roots: Object.freeze({ ...BASE_POLICY.roots, T2: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
export const JOURNAL_BASE_POLICY_DIGEST = BASE_POLICY_DIGEST
export const ROOT_AMENDMENT = Object.freeze({
  version: 'appraise.m02-ta-matrix-r12-root-amendment/v1',
  priorPolicyDigest: BASE_POLICY_DIGEST,
  from: PRIOR_ROOT,
  to: ROOT,
  priorAttempt: 'UNKNOWN',
  recovery: 'NEW_ROOT_NO_REPLAY',
})
