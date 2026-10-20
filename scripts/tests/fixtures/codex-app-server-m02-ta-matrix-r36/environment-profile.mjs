/** Exact supervisor launch environment; effective process PATH and Git suppression are unqualified. */
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { ROOT, POLICY } from './policy.mjs'

const cases = Object.freeze(POLICY.cases.filter(item => item.phase === 'T2').map(item => item.id))
export const MINIMAL_ENVIRONMENT_PROFILE = Object.freeze({
  version: 'appraise.m02-r36-explicit-launch-environment/v1',
  cases,
  keys: Object.freeze(['CODEX_HOME', 'HOME', 'PATH', 'TMPDIR']),
  pathDirectory: 'cases/<exact-case-id>/bin',
  pathDirectoryMustBeOwnedPrivateEmpty: true,
  ambientEnvironmentMergedBySupervisor: false,
  fallbackPathAllowedBySupervisor: false,
  shimOrReplacementGitAllowed: false,
  effectiveProcessEnvironmentAttested: false,
  gitSuppressionClaimed: false,
  qualification: 'EXACT_SUPERVISOR_LAUNCH_VALUES_NOT_EFFECTIVE_PROCESS_ENVIRONMENT',
})

export function minimalPathForCase(caseId) {
  if (!cases.includes(caseId)) throw new Error('R36 environment case drift')
  return join(ROOT, 'cases', caseId, 'bin')
}

export function assertMinimalEnvironmentProfile(manifest) {
  if (
    manifest?.phase !== 'T2' ||
    manifest.root !== ROOT ||
    cases.length !== 1 ||
    !isDeepStrictEqual(manifest.cases, cases) ||
    manifest.diagnosticOnly !== true ||
    manifest.probeOnly !== true ||
    manifest.fullT2Qualification !== false ||
    !isDeepStrictEqual(manifest.environmentProfile, MINIMAL_ENVIRONMENT_PROFILE)
  )
    throw new Error('R36 explicit launch environment profile drift')
  return true
}
