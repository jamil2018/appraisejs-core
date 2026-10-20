/** One explicit functional environment tuple; no ambient merge, shim or runtime qualification. */
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { ROOT } from './policy.mjs'

export const MINIMAL_ENVIRONMENT_PROFILE = Object.freeze({
  version: 'appraise.m02-r33-minimal-path/v1',
  caseId: 'B07-A06',
  keys: Object.freeze(['CODEX_HOME', 'HOME', 'PATH', 'TMPDIR']),
  path: join(ROOT, 'cases/B07-A06/bin'),
  pathDirectoryMustBeOwnedPrivateEmpty: true,
  ambientEnvironmentMerged: false,
  fallbackPathAllowed: false,
  shimOrReplacementGitAllowed: false,
  qualification: 'SINGLE_A06_FUNCTIONAL_PROFILE_ONLY_NOT_GENERAL_NATIVE_COMPATIBILITY',
})

export function assertMinimalEnvironmentProfile(manifest) {
  if (
    manifest?.phase !== 'T2' ||
    manifest.root !== ROOT ||
    manifest.cases?.join(',') !== 'B07-A06' ||
    manifest.diagnosticOnly !== true ||
    manifest.fullT2Qualification !== false ||
    !isDeepStrictEqual(manifest.environmentProfile, MINIMAL_ENVIRONMENT_PROFILE)
  )
    throw new Error('R33 minimal environment profile drift')
  return true
}
