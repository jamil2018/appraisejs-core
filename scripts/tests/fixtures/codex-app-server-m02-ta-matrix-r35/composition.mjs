/** T2-only operational profile layered over frozen R9 case path/config logic. */
import { prepareTrustedCase as prepareR9Case } from '../codex-app-server-m02-ta-runtime-r9/composition.mjs'
import { TrustedCaseCoordinator } from './case-coordinator.mjs'
import { POLICY, digest } from './policy.mjs'
import { applySelectedProfileApprovalPolicy } from '../codex-app-server-m02-ta-r25-approval-policy-01/approval-policy.mjs'
import { B14_PROFILE } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'
import { minimalPathForCase, assertMinimalEnvironmentProfile } from './environment-profile.mjs'

export { TrustedCaseCoordinator }

export function prepareTrustedCase(prepared, id, options) {
  assertMinimalEnvironmentProfile(prepared?.manifest)
  if (!POLICY.cases.some(item => item.id === id)) throw new Error('R35 selected case drift')
  if (prepared?.manifest?.phase !== 'T2' || prepared.manifest.root !== POLICY.roots.T2)
    throw new Error('exact T2 manifest required')
  const base = prepareR9Case(prepared, id, options)
  let config = structuredClone(base.config)
  config.features = {
    code_mode_host: true,
    code_mode_host_grpc: false,
    code_mode_prewarm: false,
    shell_snapshot: false,
    shell_snapshot_v2: false,
  }
  config.code_mode = { disable_in_process_fallback: true }
  if (id === 'B14') {
    Object.assign(config.features, B14_PROFILE.features)
    config.approval_policy = structuredClone(B14_PROFILE.approval_policy)
  }
  const role = POLICY.cases.find(item => item.id === id)?.role
  const profiles = prepared.seal?.profiles?.roles
  if (!['P00', 'B14'].includes(id) && (!Array.isArray(profiles) || profiles.filter(x => x.role === role).length !== 1))
    throw new Error('selected sealed profile missing')
  config = applySelectedProfileApprovalPolicy({
    caseId: id,
    selectedProfile: profiles?.find(x => x.role === role),
    config,
  })
  const threadStartParams = {
    ...structuredClone(base.threadStartParams),
    ...(id === 'B14' ? { approvalPolicy: structuredClone(B14_PROFILE.approval_policy) } : {}),
    config: structuredClone(config),
  }
  const result = {
    ...base,
    env: { ...base.env, PATH: minimalPathForCase(id) },
    config,
    threadStartParams,
    operationalConfigurationOnly: true,
    containmentQualified: false,
  }
  if (digest(result.threadStartParams.config) !== digest(result.config)) throw new Error('config split')
  return Object.freeze(result)
}
