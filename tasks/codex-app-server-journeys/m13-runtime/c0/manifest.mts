import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { verifyC0TaskInputInventory } from './inputs.mts'
import { isDeepStrictEqual } from 'node:util'
import {
  captureNativeQualificationPlan,
  parseNativeQualificationManifest,
  nativeQualificationDigest,
  type CapturedNativeQualificationPlan,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  assertNativePublicInput,
  verifyNativeCredential,
  type NativeCredentialDescriptor,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'

/** Generate privately before review; never print or embed the connector secret in public evidence. */
export function createC0ConnectorCapability() {
  const capability = randomBytes(32).toString('hex')
  return Object.freeze({ capability, commitment: nativeQualificationDigest(capability) })
}

/** Task-only public manifest reader. The descriptor is frozen by the separate reviewed packet. */
export function readReviewedC0Manifest(options: {
  manifestPath: string
  manifestSha256: string
  credentialSource: NativeCredentialDescriptor
  connectorCapability: string
}): CapturedNativeQualificationPlan {
  if (!/^[a-f0-9]{64}$/.test(options.manifestSha256)) throw new Error('C0 manifest commitment refused')
  verifyNativeCredential(options.credentialSource)
  // Guard path aliases before the first public byte read; never parse an auth-file alias as a manifest.
  assertNativePublicInput(options.manifestPath, options.credentialSource)
  const bytes = readFileSync(options.manifestPath)
  if (nativeQualificationDigest(bytes) !== `sha256:${options.manifestSha256}`) throw new Error('C0 manifest changed')
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (
    !value ||
    typeof value !== 'object' ||
    !isDeepStrictEqual((value as { credentialSource?: unknown }).credentialSource, options.credentialSource)
  )
    throw new Error('C0 credential descriptor mismatch')
  const manifest = parseNativeQualificationManifest(value)
  verifyC0TaskInputInventory(manifest)
  return captureNativeQualificationPlan(manifest, options.connectorCapability)
}
