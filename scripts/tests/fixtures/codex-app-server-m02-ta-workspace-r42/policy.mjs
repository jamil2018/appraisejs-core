/** Additive T3 root relocation; accepted base limits and native-route history remain unchanged. */
import {
  POLICY as BASE_POLICY,
  POLICY_DIGEST as JOURNAL_BASE_POLICY_DIGEST,
  casePolicy,
  digest,
} from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'

export { casePolicy, digest, JOURNAL_BASE_POLICY_DIGEST }
export const ROOT = '/private/tmp/appraise-m02-ta-workspace-p2'
export const HISTORICAL_CANONICAL_ROOT = '/private/tmp/appraise-m02-ta-matrix-p4'
export const POLICY = Object.freeze({
  ...BASE_POLICY,
  roots: Object.freeze({ ...BASE_POLICY.roots, T3: ROOT }),
})
export const POLICY_DIGEST = digest(POLICY)
