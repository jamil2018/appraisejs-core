/** One-attempt, request-byte-bound route gate. It retains no raw provider body. */
import { NativeDescriptorCollector } from '../codex-app-server-m02-ta-runtime-r9/native-descriptor-capture-r9.mjs'
import { inspectObservedTuple } from '../codex-app-server-m02-ta-runtime-r9/provider-diagnostic.mjs'
import { POLICY, casePolicy } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import {
  validateSealedCapture,
  validateSdkProfiles,
  verifySealedRouteEvidence,
  stableHash,
} from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

const blocked = reason => Object.freeze({ status: 'BLOCKED', reason, dispatchAllowed: false })
const equal = (a, b) => stableHash(a) === stableHash(b)

export function validateMatrixProviderRequest({ seal, caseId, bodyBytes, context, parsedBody }) {
  try {
    const item = casePolicy(caseId)
    if (item.phase !== 'T2' || caseId === 'P00' || !Buffer.isBuffer(bodyBytes) || !parsedBody)
      return blocked('CASE_OR_BODY')
    if (
      verifySealedRouteEvidence(seal).status !== 'VALIDATED' ||
      validateSealedCapture(seal.capture).status !== 'VALIDATED' ||
      validateSdkProfiles(seal.profiles).status !== 'VALIDATED'
    )
      return blocked('SEALED_EVIDENCE_DRIFT')
    const role = seal.profiles.roles.find(entry => entry.role === item.role)
    if (!role || !role.gatewayProfile || !role.advertisedProfile || !role.toolsList)
      return blocked('ROLE_PROFILE_MISSING')
    const tuple = inspectObservedTuple(parsedBody)
    if (!tuple.accepted) return blocked('OBSERVED_TUPLE_MISMATCH')
    if (
      context?.binarySha256 !== `sha256:${POLICY.executable.sha256}` ||
      context?.schemaSha256 !== `sha256:${POLICY.executable.schemaDigest}`
    )
      return blocked('PROVENANCE_MISMATCH')
    const captured = new NativeDescriptorCollector().capture(
      { method: 'POST', path: '/v1/responses', headers: { 'content-type': 'application/json' }, body: bodyBytes },
      context,
    )
    if (captured.status !== 'CAPTURED' || captured.containers.length !== 1 || captured.callables.length !== 11)
      return blocked('COLLECTOR_REJECTED')
    const original = seal.capture
    const observed = captured.containers[0]
    const sealed = original.containers[0]
    const observedMetadata = { ...observed.metadata }
    const sealedMetadata = { ...sealed.metadata }
    delete observedMetadata.id
    delete sealedMetadata.id
    if (
      observed.location !== sealed.location ||
      observed.kind !== sealed.kind ||
      !equal(observedMetadata, sealedMetadata) ||
      !/^at_[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(observed.metadata.id) ||
      !equal(observed.tools, sealed.tools) ||
      captured.descriptorHash !== original.descriptorHash ||
      !equal(captured.callables, original.callables)
    )
      return blocked('WRAPPER_OR_DESCRIPTOR_DRIFT')
    return Object.freeze({
      status: 'VALIDATED',
      caseId,
      role: item.role,
      requestByteHash: captured.requestByteHash,
      descriptorHash: captured.descriptorHash,
      containerHash: captured.containerHash,
      wrapperDescriptorHash: original.callables.find(callable => callable.name === 'functions.exec')?.descriptorHash,
      gatewayProfileDigest: role.gatewayProfile.profileDigest,
      advertisedProfileDigest: role.advertisedProfile.profileDigest,
      sdkToolsListDigest: role.toolsList.digest,
      observedTuple: Object.freeze({ model: POLICY.model, effort: POLICY.reasoning }),
      dispatchAllowed: false,
      evidenceClass: 'REQUEST_DESCRIPTOR_VALIDATED_OFFLINE_NOT_RUNTIME_DISPATCH',
    })
  } catch {
    return blocked('REQUEST_VALIDATION_FAILED')
  }
}
