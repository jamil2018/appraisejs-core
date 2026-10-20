/** Offline route bridge for one sealed native capture and six pinned SDK role profiles. */
import fs from 'node:fs'
import {
  loadSealedRouteEvidence,
  verifySealedRouteEvidence,
  validateSealedCapture,
  validateSdkProfiles,
  stableHash,
} from './sealed-capture.mjs'

const bad = reason => Object.freeze({ status: 'BLOCKED', reason, runtimeQualified: false, dispatchAllowed: false })
const issuedPreparations = new WeakMap()

export { loadSealedRouteEvidence }

export function prepareSealedNativeRoutes(seal, { io = fs } = {}) {
  if (verifySealedRouteEvidence(seal, { io }).status !== 'VALIDATED') return bad('STALE_SEAL')
  const capture = validateSealedCapture(seal.capture)
  const profiles = validateSdkProfiles(seal.profiles)
  if (capture.status !== 'VALIDATED' || profiles.status !== 'VALIDATED') return bad('INVALID_ROUTE_EVIDENCE')
  const native = seal.capture.callables.find(item => item.name === capture.wrapper.nativeName)
  if (!native || native.descriptorHash !== capture.wrapper.descriptorHash) return bad('WRAPPER_MISMATCH')
  const wrapper = Object.freeze({
    ...capture.wrapper,
    descriptor: native.descriptor,
    codecStatus: 'NESTED_RUNTIME_DECODER_UNQUALIFIED',
    provenance: 'ACTUAL_T1_DESCRIPTOR_ONLY',
  })
  const roles = profiles.roles.map((validated, index) => {
    const source = seal.profiles.roles[index]
    if (source.role !== validated.role) return bad('PROFILE_ORDER_DRIFT')
    return Object.freeze({
      role: validated.role,
      gatewayProfileDigest: validated.gatewayProfileDigest,
      advertisedProfileDigest: validated.advertisedProfileDigest,
      sdkToolsListDigest: validated.sdkToolsListDigest,
      gatewayProfile: source.gatewayProfile,
      advertisedProfile: source.advertisedProfile,
      sdkListedTools: source.toolsList.tools,
      routes: Object.freeze(
        validated.operations.map(operation =>
          Object.freeze({
            operation,
            nativeName: wrapper.nativeName,
            descriptorHash: wrapper.descriptorHash,
            mode: 'SHARED_WRAPPER_PENDING_CODEC',
            runtimeQualified: false,
            dispatchAllowed: false,
          }),
        ),
      ),
    })
  })
  if (roles.some(role => role.status === 'BLOCKED')) return bad('PROFILE_ORDER_DRIFT')
  const prepared = Object.freeze({
    status: 'PREPARED_NOT_RUNTIME_QUALIFIED',
    version: 'M02_SEALED_NATIVE_ROUTE_R10_V1',
    captureFileSha256: seal.identities.capture.sha256,
    profilesFileSha256: seal.identities.profiles.sha256,
    reviewFileSha256: seal.identities.review.sha256,
    requestByteHash: capture.requestByteHash,
    containerHash: capture.containerHash,
    descriptorHash: capture.descriptorHash,
    provenance: seal.capture.provenance,
    observedTuple: seal.capture.observedTuple,
    wrapper,
    roles: Object.freeze(roles),
    roleCount: 6,
    uniqueWrapperCount: 1,
    plannedOperationCount: roles.reduce((sum, role) => sum + role.routes.length, 0),
    codecStatus: 'NESTED_RUNTIME_DECODER_UNQUALIFIED',
    runtimeQualified: false,
    dispatchAllowed: false,
  })
  issuedPreparations.set(prepared, Object.freeze({ seal, hash: stableHash(prepared) }))
  return prepared
}

function verifyGate(seal, prepared, io) {
  if (verifySealedRouteEvidence(seal, { io }).status !== 'VALIDATED') return bad('STALE_SEAL')
  const issued = issuedPreparations.get(prepared)
  if (
    !issued ||
    issued.seal !== seal ||
    prepared.status !== 'PREPARED_NOT_RUNTIME_QUALIFIED' ||
    prepared.runtimeQualified !== false ||
    prepared.dispatchAllowed !== false ||
    stableHash(prepared) !== issued.hash
  )
    return bad('STALE_PREPARATION')
  return Object.freeze({ status: 'VALIDATED' })
}

/** The missing nested codec is a hard gate even for an otherwise valid operation. */
export function constructSealedNativeCall({ seal, prepared, role, operation, io = fs }) {
  const gate = verifyGate(seal, prepared, io)
  if (gate.status !== 'VALIDATED') return gate
  const selected = prepared.roles.find(item => item.role === role)
  if (!selected || !selected.routes.some(item => item.operation === operation)) return bad('CROSS_ROLE_OPERATION')
  return bad('NESTED_RUNTIME_DECODER_UNQUALIFIED')
}

export function constructSealedRejectionProbe({ seal, prepared, role, selector, io = fs }) {
  const gate = verifyGate(seal, prepared, io)
  if (gate.status !== 'VALIDATED') return gate
  if (!prepared.roles.some(item => item.role === role)) return bad('CROSS_ROLE_OPERATION')
  if (typeof selector !== 'string' || !/^(?:A(?:0[1-9]|1[0-4])|D01|T01)$/.test(selector))
    return bad('UNKNOWN_REJECTION_SELECTOR')
  const expectedRole = selector.startsWith('A')
    ? 'REQUIREMENT_ANALYZER'
    : selector === 'D01'
      ? 'TEST_SCENARIO_DESIGNER'
      : 'TRIAGER'
  if (role !== expectedRole) return bad('SELECTOR_ROLE_MISMATCH')
  return bad('NESTED_RUNTIME_DECODER_UNQUALIFIED')
}

export function correlateSealedNativeCalls({ seal, prepared, io = fs }) {
  const gate = verifyGate(seal, prepared, io)
  if (gate.status !== 'VALIDATED') return gate
  return bad('NESTED_RUNTIME_DECODER_UNQUALIFIED')
}
