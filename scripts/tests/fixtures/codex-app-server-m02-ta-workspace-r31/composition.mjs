/** T3-only operational profile over the frozen R9 case configuration. No effect on import. */
import { prepareTrustedCase as prepareR9Case } from '../codex-app-server-m02-ta-runtime-r9/composition.mjs'
import { TrustedCaseCoordinator } from '../codex-app-server-m02-ta-matrix-r34/case-coordinator.mjs'
import { POLICY, digest } from './policy.mjs'
import { applyNativeContractConfiguration } from './native-contracts.mjs'

export { TrustedCaseCoordinator }

export function prepareTrustedCase(prepared, id, options) {
  if (
    prepared?.manifest?.phase !== 'T3' ||
    prepared.manifest.root !== POLICY.roots.T3 ||
    !['N01', 'N02'].includes(id) ||
    prepared.manifest.cases?.join(',') !== 'N01,N02'
  )
    throw new Error('exact T3 manifest and case required')
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
  config = applyNativeContractConfiguration(config, id)
  const threadStartParams = { ...structuredClone(base.threadStartParams), config: structuredClone(config) }
  if (digest(threadStartParams.config) !== digest(config)) throw new Error('T3 config split')
  return Object.freeze({
    ...base,
    config,
    threadStartParams,
    operationalConfigurationOnly: true,
    containmentQualified: false,
  })
}
