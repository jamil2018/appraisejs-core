/**
 * Conditional complete native-variant descriptor-shape gate. Supplied context is not attestation;
 * a runtime issuer must independently bind manifest/config and active case/request/thread/turn.
 * No request body is retained and no tool is invoked.
 */
import { NativeDescriptorCollector } from '../codex-app-server-m02-ta-runtime-r9/native-descriptor-capture-r9.mjs'
import { inspectObservedTuple } from '../codex-app-server-m02-ta-runtime-r9/provider-diagnostic.mjs'
import { POLICY } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import {
  parseStrictJson,
  verifySealedRouteEvidence,
  stableHash,
} from '../codex-app-server-m02-ta-route-r10/sealed-capture.mjs'

export const PERMISSION_DECLARATION = `declare const tools: { request_permissions(args: {
  environment_id?: string;
  permissions: {
    file_system?: { read?: Array<string>; write?: Array<string>; };
    network?: { enabled?: boolean; };
  };
  reason?: string;
}): Promise<unknown>; };`
const tokens = text => text.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '')
const block = reason => Object.freeze({ status: 'BLOCKED', reason, dispatchAllowed: false, runtimeQualified: false })

export function inspectPermissionDeclaration(description) {
  if (typeof description !== 'string' || Buffer.byteLength(description) > 128 * 1024) return block('DESCRIPTION_BOUND')
  const marker = /^### `request_permissions`\r?\n/gm
  const sections = [...description.matchAll(marker)]
  if (sections.length !== 1) return block('PERMISSION_SECTION_MISSING_OR_DUPLICATE')
  const start = sections[0].index + sections[0][0].length
  const remainder = description.slice(start)
  const end = remainder.search(/^### /m)
  const section = end === -1 ? remainder : remainder.slice(0, end)
  const declarations = [...section.matchAll(/```ts\r?\n([\s\S]*?)```/g)]
  if (declarations.length !== 1 || tokens(declarations[0][1]) !== tokens(PERMISSION_DECLARATION))
    return block('PERMISSION_FULL_DECLARATION_DRIFT')
  const count = [...description.matchAll(/\brequest_permissions\s*\(/g)].length
  if (count !== 1) return block('AMBIGUOUS_PERMISSION_ROUTE')
  return Object.freeze({
    status: 'FULL_DECLARATION_MATCHED',
    declarationHash: stableHash(declarations[0][1]),
    sourceSchemaSha256: 'f63500f061206cec364f3f994fe4e5a8c18bb205b0f8f25bae83afe123505247',
    runtimeQualified: false,
  })
}

export function validateNativeVariantRequest({ seal, caseId, bodyBytes, context, expectedConfigSha256 }) {
  try {
    if (!['B14', 'N01', 'N02'].includes(caseId) || !Buffer.isBuffer(bodyBytes) || bodyBytes.length > 1024 * 1024)
      return block('CASE_OR_BODY')
    if (verifySealedRouteEvidence(seal).status !== 'VALIDATED') return block('STALE_SEAL')
    if (
      !/^sha256:[a-f0-9]{64}$/.test(expectedConfigSha256 ?? '') ||
      context?.configSha256 !== expectedConfigSha256 ||
      context.binarySha256 !== `sha256:${POLICY.executable.sha256}` ||
      context.schemaSha256 !== `sha256:${POLICY.executable.schemaDigest}` ||
      context.platform !== 'darwin-arm64'
    )
      return block('PROVENANCE')
    const parsed = parseStrictJson(bodyBytes.toString('utf8'))
    if (!inspectObservedTuple(parsed).accepted) return block('TUPLE')
    const captured = new NativeDescriptorCollector().capture(
      { method: 'POST', path: '/v1/responses', headers: { 'content-type': 'application/json' }, body: bodyBytes },
      context,
    )
    if (captured.status !== 'CAPTURED' || captured.containers.length !== 1) return block('INCOMPLETE_CAPTURE')
    const container = captured.containers[0]
    if (
      container.location !== 'input[0].additional_tools' ||
      container.kind !== 'additional_tools' ||
      container.metadata.role !== 'developer' ||
      container.metadata.type !== 'additional_tools' ||
      !/^at_[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(container.metadata.id ?? '')
    )
      return block('LITE_CONTAINER_VARIANT')
    const actual = captured.callables.filter(item => item.name === 'functions.exec')
    const original = seal.capture.callables.find(item => item.name === 'functions.exec')
    if (
      actual.length !== 1 ||
      actual[0].type !== 'custom' ||
      !original ||
      stableHash(actual[0].descriptor.format) !== stableHash(original.descriptor.format) ||
      actual[0].descriptor.name !== original.descriptor.name ||
      Object.keys(actual[0].descriptor).sort().join() !== 'description,format,name,type'
    )
      return block('EXECUTOR_CONTRACT')
    const prefixEnd = original.descriptor.description.indexOf('\n### ')
    if (
      prefixEnd < 1 ||
      !actual[0].descriptor.description.startsWith(original.descriptor.description.slice(0, prefixEnd) + '\n### ')
    )
      return block('EXECUTOR_SEMANTICS_DRIFT')
    const declaration = caseId === 'B14' ? inspectPermissionDeclaration(actual[0].descriptor.description) : null
    if (caseId === 'B14' && declaration.status !== 'FULL_DECLARATION_MATCHED') return declaration
    if (
      caseId !== 'B14' &&
      (captured.descriptorHash !== seal.capture.descriptorHash ||
        stableHash(captured.callables) !== stableHash(seal.capture.callables))
    )
      return block('NATIVE_DESCRIPTOR_DRIFT')
    return Object.freeze({
      status: 'VALIDATED',
      caseId,
      capture: Object.freeze({
        ...captured,
        observedTuple: Object.freeze({ model: POLICY.model, effort: POLICY.reasoning }),
      }),
      wrapperDescriptorHash: actual[0].descriptorHash,
      declaration,
      capabilityInventoryOnly: true,
      provenanceEvidence: 'SUPPLIED_NOT_ATTESTED_REQUIRES_ACTIVE_RUNTIME_PIN',
      dispatchAllowed: false,
      runtimeQualified: false,
      evidenceClass: 'FULL_CAPTURE_VARIANT_VALIDATED_REQUIRES_REVIEWED_SCRIPT_AND_RUNTIME_EVIDENCE',
    })
  } catch {
    return block('CAPTURE_OR_VALIDATION_FAILED')
  }
}
