/** T2-only operational profile layered over frozen R9 case path/config logic. */
import {
  prepareTrustedCase as prepareR9Case,
  TrustedCaseCoordinator,
} from '../codex-app-server-m02-ta-runtime-r9/composition.mjs'
import { POLICY, digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { B14_PROFILE } from '../codex-app-server-m02-ta-native-plans-r10/plans.mjs'

export { TrustedCaseCoordinator }

export function prepareTrustedCase(prepared, id, options) {
  if (prepared?.manifest?.phase !== 'T2' || prepared.manifest.root !== POLICY.roots.T2)
    throw new Error('exact T2 manifest required')
  const base = prepareR9Case(prepared, id, options)
  const config = structuredClone(base.config)
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
  const threadStartParams = {
    ...structuredClone(base.threadStartParams),
    ...(id === 'B14' ? { approvalPolicy: structuredClone(B14_PROFILE.approval_policy) } : {}),
    config: structuredClone(config),
  }
  const result = { ...base, config, threadStartParams, operationalConfigurationOnly: true, containmentQualified: false }
  if (digest(result.threadStartParams.config) !== digest(result.config)) throw new Error('config split')
  return Object.freeze(result)
}
