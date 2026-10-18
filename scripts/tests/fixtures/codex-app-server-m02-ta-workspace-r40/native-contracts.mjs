/** Exact pinned public source contracts; native compatibility and binary provenance stay unqualified. */
import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { prepareNativeCase } from './native-plans.mjs'

export const NATIVE_CONTRACT_SOURCE_PINS = Object.freeze(
  [
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n02-runtime-source-20261017-01/apply_patch_runtime.rs',
      sha256: 'a4f0a56e78352d89434b2056aea84a617571a9bd9d5b785d25fa61205e71bd16',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n02-runtime-source-20261017-01/source-pin.json',
      sha256: '26389573e82641b6ef874f4cc41c0ccbe792d8f64adb0f0a86afba789b419549',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/exec_command.rs',
      sha256: 'de943c933a91cbfc8d241fc3f3e4ca1114c9d444f705f9c9bfe8d2752f73c318',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/process.rs',
      sha256: '866ccb594923f6d2b7a8cb46e06bc23cc49da0db9f5971e95b9e58c4ef7fa27d',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/process_manager.rs',
      sha256: '4be954f6940956b9413545e3f1954705eda7289cb1ef81c6998fac57dd0d3706',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/apply_patch_lib.rs',
      sha256: '81eeac02181ffb6b1c8e1bdb18457372f11ef800f18675f77f0e10f3ee5dd9f2',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/apply_patch_invocation.rs',
      sha256: 'c1b886b3c23cab9651f3b703ab9beb88b207074b3922ee1839c7f53bb5ec49d0',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-n01-token-count-source-20261017-01/source-pin.json',
      sha256: 'f95af60efb6635cd713b940b3e0d00c7caf724693fc0752e959c435ad1ef6691',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-code-mode-codec-reference-20261016-01/core_tools_context.rs',
      sha256: '9a9acc6daab2112bd9ca1a07a1e1f2105b20a7f565878157c726ee0d7a3e00cc',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-codex-code-mode-reference-20261016-01/codex-rs_features_src_lib.rs',
      sha256: '5317e79cb2f5a72044b15ef9c506e9906c295f5a4e43cc1f1f05b87455824542',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-codex-code-mode-reference-20261016-01/config_mod.rs',
      sha256: 'cbd8dd6d50cb7d61183d309cbefa95cd368de87bf44d2ac60e83c3a2aff59658',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-codex-code-mode-reference-20261016-02/codex-rs_core_src_tools_spec_plan.rs',
      sha256: '198432ab11c33b6509d72388ab04b7cb21de8ea500c7c0078b2921de14f7019e',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-native-tool-contract-reference-20261017-01/apply_patch.lark',
      sha256: 'd6367f4826ed608c424b0a308f3d6163527df63c22513d089b91863552f8bfeb',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-native-tool-contract-reference-20261017-01/apply_patch.rs',
      sha256: '1256b2219f6acb9c49ae472860ee69d73c75bb427dcca4dae2a30018d30216c0',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-native-tool-contract-reference-20261017-01/apply_patch_spec.rs',
      sha256: 'd024ebb925f64bcc34420d4db8376798c8e8bc4518e220bce47a7ebee44a345f',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-native-tool-contract-reference-20261017-01/shell_spec.rs',
      sha256: 'f63500f061206cec364f3f994fe4e5a8c18bb205b0f8f25bae83afe123505247',
    },
    {
      path: '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m02-native-tool-contract-reference-20261017-01/source-pin.json',
      sha256: '5efcfedf78022b00aa2c98ccd8975077a7832cc146ea6940e10b20a04a1f01c4',
    },
  ].map(row => Object.freeze(row)),
)
export const NATIVE_CONTRACT_QUALIFICATION = Object.freeze({
  upstreamCommit: '4ebc485ca321243727539187169425fcf972f2c4',
  evidenceClass: 'PINNED_PUBLIC_SOURCE_CONDITIONAL_PARAMETER_AND_RESULT_CONTRACTS',
  runtimeCompatibility: 'UNQUALIFIED',
  installedBinaryProvenanceAttested: false,
  helperLifetimeInventory: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED',
  selectors: Object.freeze({ unified_exec: true, unified_exec_tty: true, allow_login_shell: true }),
  actionLogin: false,
  actionTty: false,
})
const fail = () => {
  throw new Error('M02_NATIVE_CONTRACT_BINDING_REFUSED')
}
const validCase = id => id === 'N01' || id === 'N02'

export function verifyNativeContractConfiguration(config, caseId) {
  if (
    !validCase(caseId) ||
    !config ||
    config.approval_policy !== 'never' ||
    config.sandbox_mode !== 'workspace-write' ||
    config.model_provider !== 'm02-scripted' ||
    config.features?.code_mode_host !== true ||
    config.code_mode?.disable_in_process_fallback !== true ||
    config.features.unified_exec !== true ||
    config.features.unified_exec_tty !== true ||
    config.allow_login_shell !== true ||
    config.features.stable_environment_tools === true
  )
    fail()
  return true
}

export function applyNativeContractConfiguration(config, caseId) {
  if (!validCase(caseId) || !config || !config.features || !config.code_mode) fail()
  const result = structuredClone(config)
  result.features.unified_exec = true
  result.features.unified_exec_tty = true
  result.allow_login_shell = true
  verifyNativeContractConfiguration(result, caseId)
  return result
}

export function assertFixedNativePlanContract(plan, config) {
  verifyNativeContractConfiguration(config, plan?.caseId)
  const expected = prepareNativeCase(plan.caseId)
  if (
    plan.callId !== expected.callId ||
    plan.operation !== expected.operation ||
    plan.script !== expected.script ||
    plan.scriptSha256 !== expected.scriptSha256 ||
    !isDeepStrictEqual(plan.argument, expected.argument) ||
    plan.relativePath !== expected.relativePath ||
    plan.expectedBytes !== expected.expectedBytes
  )
    fail()
  return true
}

export async function verifyNativeContractSources() {
  for (const pin of NATIVE_CONTRACT_SOURCE_PINS) {
    const before = await fs.lstat(pin.path)
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== process.getuid() ||
      before.nlink !== 1 ||
      (before.mode & 0o022) !== 0 ||
      before.size < 1 ||
      before.size > 4 * 1024 * 1024
    )
      fail()
    const same = state =>
      state.isFile() &&
      ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'].every(key => state[key] === before[key])
    const handle = await fs.open(pin.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!same(await handle.stat())) fail()
      const bytes = await handle.readFile()
      if (
        bytes.length !== before.size ||
        !same(await handle.stat()) ||
        !same(await fs.lstat(pin.path)) ||
        createHash('sha256').update(bytes).digest('hex') !== pin.sha256
      )
        fail()
    } finally {
      await handle.close()
    }
  }
  return NATIVE_CONTRACT_QUALIFICATION
}
