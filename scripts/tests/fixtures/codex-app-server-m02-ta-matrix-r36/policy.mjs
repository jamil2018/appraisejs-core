/** Fresh full T2 profile; original case limits and deadlines remain exact. */
import { POLICY as BASE_POLICY, casePolicy, digest } from '../codex-app-server-m02-ta-matrix-r19/policy.mjs'
import {
  POLICY_DIGEST as PRIOR_POLICY_DIGEST,
  ROOT as R35_ROOT,
} from '../codex-app-server-m02-ta-matrix-r35/policy.mjs'

export { casePolicy, digest }
export const PRIOR_ROOT = R35_ROOT
export const ROOT = '/private/tmp/appraise-m02-ta-matrix-p21'
export const HISTORICAL_CANONICAL_ROOT = '/private/tmp/appraise-m02-ta-matrix-p4'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  cases: Object.freeze(BASE_POLICY.cases.filter(item => item.id === 'B14')),
  roots: Object.freeze({ ...BASE_POLICY.roots, T2: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
export const JOURNAL_BASE_POLICY_DIGEST = POLICY_DIGEST
export const ROOT_AMENDMENT = Object.freeze({
  version: 'appraise.m02-ta-matrix-r36-root-amendment/v1',
  priorPolicyDigest: PRIOR_POLICY_DIGEST,
  from: PRIOR_ROOT,
  to: ROOT,
  priorAttempt: 'R35_B14_NATIVE_DENIAL_CORRELATED_CASE_UNKNOWN_NOT_FULL_T2',
  recovery: 'NEW_ROOT_NO_REPLAY',
})
