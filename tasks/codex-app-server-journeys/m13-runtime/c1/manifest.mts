import { isDeepStrictEqual } from 'node:util'
import {
  assertNativePublicInput,
  readNativePublicBytes,
  verifyNativeCredential,
  type NativeCredentialDescriptor,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import {
  captureNativeQualificationPlan,
  nativeQualificationDigest,
  parseNativeQualificationManifest,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { requiredC1TaskInputPaths } from './runner.mts'

/** Original C1 public manifest bytes only; importing this reader grants no native allowance. */
export function readReviewedC1Manifest(request: {
  manifestPath: string
  manifestSha256: string
  credentialSource: NativeCredentialDescriptor
  connectorCapability: string
}) {
  verifyNativeCredential(request.credentialSource)
  assertNativePublicInput(request.manifestPath, request.credentialSource)
  const bytes = readNativePublicBytes(request.manifestPath, request.credentialSource, 1024 * 1024)
  if (
    !/^[a-f0-9]{64}$/.test(request.manifestSha256) ||
    nativeQualificationDigest(bytes) !== `sha256:${request.manifestSha256}`
  )
    throw new Error('Exact C1 manifest bytes required')
  const parsed = parseNativeQualificationManifest(JSON.parse(bytes.toString('utf8')))
  if (
    !isDeepStrictEqual(parsed.credentialSource, request.credentialSource) ||
    !isDeepStrictEqual(
      parsed.inputs.map(input => input.path),
      requiredC1TaskInputPaths(parsed.repositoryRoot),
    )
  )
    throw new Error('Exact C1 manifest identity and input inventory required')
  return captureNativeQualificationPlan(parsed, request.connectorCapability)
}
