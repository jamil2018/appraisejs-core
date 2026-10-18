/** Offline-only validation of the archived T1 descriptor capture. No request reconstruction. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const FIXED_EVIDENCE = Object.freeze({
  capture: Object.freeze({
    path: resolve(
      REPO,
      '.appraisejs/m02-ta-t1-r9-execution-evidence-01/cases--T1--supervisor--descriptor-capture.json',
    ),
    sha256: 'fb295b2419ac96431205e0c309428da242663404950b519c4ee97d17c7e66775',
    maxBytes: 1024 * 1024,
  }),
  profiles: Object.freeze({
    path: resolve(REPO, '.appraisejs/m02-ta-offline-sdk-profiles-01/profiles.json'),
    sha256: 'b5f29c101620944ff20a6f5ece33757fcc706d717577bc7fe999a504d25bc5c6',
    maxBytes: 1024 * 1024,
  }),
  review: Object.freeze({
    path: resolve(REPO, '.appraisejs/m02-t1-r9-execution-review.json'),
    sha256: 'b2c5b8d64b95f3046de08b9150c82aa415c38137f6a32a4d6b70db6c040b898f',
    maxBytes: 256 * 1024,
  }),
})

const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const hash = value => `sha256:${digest(stable(value))}`
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => Object.hasOwn(value, key)
const exact = (value, keys) => object(value) && Object.keys(value).sort().join() === [...keys].sort().join()
const hex = /^sha256:[a-f0-9]{64}$/
const name = /^[A-Za-z0-9_.:-]{1,200}$/
const atId = /^at_[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const descriptorFields = new Set([
  'type',
  'name',
  'description',
  'parameters',
  'strict',
  'format',
  'tools',
  'functions',
  'function',
])
const bad = reason => Object.freeze({ status: 'BLOCKED', reason, runtimeQualified: false, dispatchAllowed: false })
const issuedSeals = new WeakSet()

function stable(value, depth = 0) {
  if (depth > 40) throw new Error('JSON_DEPTH')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(child => stable(child, depth + 1)).join(',')}]`
  if (!object(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null))
    throw new Error('NON_JSON')
  const keys = Object.keys(value)
  if (keys.some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('PROTOTYPE_KEY')
  return `{${keys
    .sort()
    .map(key => `${JSON.stringify(key)}:${stable(value[key], depth + 1)}`)
    .join(',')}}`
}

function scanJson(source) {
  let at = 0
  const white = () => {
    while (at < source.length && /\s/.test(source[at])) at++
  }
  const string = () => {
    const start = at++
    while (at < source.length) {
      if (source[at] === '\\') at += 2
      else if (source[at++] === '"') return JSON.parse(source.slice(start, at))
    }
    throw new Error('INVALID_JSON')
  }
  const value = depth => {
    if (depth > 40) throw new Error('JSON_DEPTH')
    white()
    if (source[at] === '{') {
      at++
      white()
      const keys = new Set()
      if (source[at] === '}') {
        at++
        return
      }
      while (at < source.length) {
        white()
        if (source[at] !== '"') throw new Error('INVALID_JSON')
        const key = string()
        if (keys.has(key)) throw new Error('DUPLICATE_KEY')
        keys.add(key)
        white()
        if (source[at++] !== ':') throw new Error('INVALID_JSON')
        value(depth + 1)
        white()
        const next = source[at++]
        if (next === '}') return
        if (next !== ',') throw new Error('INVALID_JSON')
      }
    } else if (source[at] === '[') {
      at++
      white()
      if (source[at] === ']') {
        at++
        return
      }
      while (at < source.length) {
        value(depth + 1)
        white()
        const next = source[at++]
        if (next === ']') return
        if (next !== ',') throw new Error('INVALID_JSON')
      }
    } else if (source[at] === '"') {
      string()
      return
    } else {
      const start = at
      while (at < source.length && !/[\s,\]}]/.test(source[at])) at++
      if (at === start) throw new Error('INVALID_JSON')
      return
    }
    throw new Error('INVALID_JSON')
  }
  value(0)
  white()
  if (at !== source.length) throw new Error('INVALID_JSON')
}

export function parseStrictJson(source) {
  if (typeof source !== 'string' || Buffer.byteLength(source) > 1024 * 1024) throw new Error('JSON_LIMIT')
  scanJson(source)
  return JSON.parse(source)
}

function readPinned(spec, io) {
  const before = io.lstatSync(spec.path)
  if (!before.isFile() || before.isSymbolicLink() || (before.mode & 0o777) !== 0o600 || before.uid !== process.getuid())
    throw new Error('FILE_IDENTITY')
  const bytes = io.readFileSync(spec.path)
  const after = io.lstatSync(spec.path)
  if (
    bytes.length < 1 ||
    bytes.length > spec.maxBytes ||
    digest(bytes) !== spec.sha256 ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.uid !== after.uid ||
    before.mode !== after.mode
  )
    throw new Error('FILE_DRIFT')
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return {
    value: parseStrictJson(source),
    identity: Object.freeze({
      dev: after.dev,
      ino: after.ino,
      uid: after.uid,
      mode: after.mode,
      size: after.size,
      sha256: spec.sha256,
    }),
  }
}

function validateDescriptor(descriptor) {
  if (!object(descriptor) || Object.keys(descriptor).some(key => !descriptorFields.has(key)))
    throw new Error('DESCRIPTOR_SHAPE')
  stable(descriptor)
  if (
    own(descriptor, 'description') &&
    (typeof descriptor.description !== 'string' || descriptor.description.length > 65536)
  )
    throw new Error('DESCRIPTOR_SHAPE')
  if (descriptor.type === 'function') {
    const nested = own(descriptor, 'function')
    const named = nested ? descriptor.function : descriptor
    if (
      !object(named) ||
      typeof named.name !== 'string' ||
      !name.test(named.name) ||
      !object(named.parameters) ||
      named.parameters.type !== 'object' ||
      (nested &&
        (own(descriptor, 'name') ||
          own(descriptor, 'parameters') ||
          Object.keys(named).some(key => !['name', 'description', 'parameters', 'strict'].includes(key)))) ||
      (own(named, 'strict') && typeof named.strict !== 'boolean') ||
      (nested && own(descriptor, 'strict')) ||
      ['format', 'tools', 'functions'].some(key => own(descriptor, key))
    )
      throw new Error('DESCRIPTOR_SHAPE')
    return { type: 'function', name: named.name }
  }
  if (descriptor.type === 'custom') {
    const format = descriptor.format
    if (
      typeof descriptor.name !== 'string' ||
      !name.test(descriptor.name) ||
      !object(format) ||
      !['grammar', 'text'].includes(format.type) ||
      (format.type === 'grammar' &&
        (typeof format.syntax !== 'string' ||
          !format.syntax ||
          typeof format.definition !== 'string' ||
          !format.definition)) ||
      Object.keys(format).some(key =>
        format.type === 'grammar' ? !['type', 'syntax', 'definition'].includes(key) : key !== 'type',
      ) ||
      ['parameters', 'tools', 'functions', 'function', 'strict'].some(key => own(descriptor, key))
    )
      throw new Error('DESCRIPTOR_SHAPE')
    return { type: 'custom', name: descriptor.name }
  }
  if (descriptor.type === 'namespace') {
    if (
      typeof descriptor.name !== 'string' ||
      !name.test(descriptor.name) ||
      own(descriptor, 'tools') === own(descriptor, 'functions') ||
      !Array.isArray(own(descriptor, 'tools') ? descriptor.tools : descriptor.functions) ||
      !(own(descriptor, 'tools') ? descriptor.tools : descriptor.functions).length ||
      ['parameters', 'format', 'function', 'strict'].some(key => own(descriptor, key))
    )
      throw new Error('DESCRIPTOR_SHAPE')
    return { type: 'namespace', name: descriptor.name }
  }
  throw new Error('DESCRIPTOR_SHAPE')
}

/** Rebuild every callable from complete containers; hashes are never trusted in isolation. */
export function validateSealedCapture(capture) {
  try {
    if (
      !exact(capture, [
        'status',
        'fenced',
        'requestByteHash',
        'containerHash',
        'descriptorHash',
        'containers',
        'callables',
        'provenance',
        'runtimeQualification',
        'observedTuple',
      ]) ||
      capture.status !== 'CAPTURED' ||
      capture.fenced !== true ||
      capture.runtimeQualification !== 'UNQUALIFIED' ||
      !hex.test(capture.requestByteHash) ||
      !hex.test(capture.containerHash) ||
      !hex.test(capture.descriptorHash) ||
      !exact(capture.observedTuple, ['model', 'effort']) ||
      capture.observedTuple.model !== 'gpt-6.1-sol' ||
      capture.observedTuple.effort !== 'medium' ||
      !exact(capture.provenance, [
        'binarySha256',
        'platform',
        'configSha256',
        'schemaSha256',
        'runId',
        'requestId',
        'threadId',
        'turnId',
        'attestation',
      ]) ||
      capture.provenance.binarySha256 !== 'sha256:1afb28c01d7d49e892bd75f11076b10f1451e34e0ee308a95e5ab7f69f9c84fe' ||
      capture.provenance.schemaSha256 !== 'sha256:eadf6a761d55efcc17bd86178cf5ff192f113e425e4cfa129111a8dbf4251d7c' ||
      capture.provenance.runId !== '52b100f34b3332fde1987e73b49bf8d4a1cfb28467094f2d35e029fee43e1fb6' ||
      capture.provenance.requestId !== 'T1-listener-request-1' ||
      capture.provenance.platform !== 'darwin-arm64' ||
      capture.provenance.attestation !== 'SUPPLIED_NOT_ATTESTED' ||
      capture.provenance.configSha256 !== 'sha256:f02a492284e3db728feafe8b8cfde108184c09ff4fc79bb2c01c87cf62cbae71' ||
      !name.test(capture.provenance.threadId) ||
      !name.test(capture.provenance.turnId) ||
      !Array.isArray(capture.containers) ||
      capture.containers.length !== 1 ||
      !Array.isArray(capture.callables)
    )
      throw new Error('CAPTURE_SHAPE')
    const container = capture.containers[0]
    if (
      !exact(container, ['location', 'kind', 'metadata', 'tools']) ||
      container.location !== 'input[0].additional_tools' ||
      container.kind !== 'additional_tools' ||
      !exact(container.metadata, ['role', 'type', 'id']) ||
      container.metadata.role !== 'developer' ||
      container.metadata.type !== 'additional_tools' ||
      !atId.test(container.metadata.id) ||
      !Array.isArray(container.tools) ||
      container.tools.length === 0
    )
      throw new Error('CONTAINER_SHAPE')
    const rebuilt = []
    const names = new Set()
    let count = 0
    const visit = (descriptor, location, prefix, depth) => {
      if (depth > 24 || ++count > 256) throw new Error('DESCRIPTOR_LIMIT')
      const identity = validateDescriptor(descriptor)
      if (prefix && identity.name.includes('.')) throw new Error('CALLABLE_NAME')
      const fullName = `${prefix}${identity.name}`
      if (identity.type === 'namespace') {
        const key = own(descriptor, 'tools') ? 'tools' : 'functions'
        descriptor[key].forEach((child, index) =>
          visit(child, `${location}.${key}[${index}]`, `${fullName}.`, depth + 1),
        )
      } else {
        if (names.has(fullName)) throw new Error('CALLABLE_DUPLICATE')
        names.add(fullName)
        rebuilt.push({ name: fullName, type: identity.type, location, descriptorHash: hash(descriptor), descriptor })
      }
    }
    container.tools.forEach((tool, index) => visit(tool, `${container.location}[${index}]`, '', 0))
    if (
      rebuilt.length !== 11 ||
      capture.callables.length !== rebuilt.length ||
      hash(capture.containers) !== capture.containerHash ||
      hash(
        rebuilt.map(({ name: nativeName, type, location, descriptorHash }) => ({
          name: nativeName,
          type,
          location,
          descriptorHash,
        })),
      ) !== capture.descriptorHash ||
      stable(rebuilt) !== stable(capture.callables)
    )
      throw new Error('CAPTURE_HASH')
    const wrapper = rebuilt.filter(item => item.name === 'functions.exec')
    if (wrapper.length !== 1 || wrapper[0].type !== 'custom') throw new Error('WRAPPER_MISSING')
    return Object.freeze({
      status: 'VALIDATED',
      wrapper: Object.freeze({
        nativeName: wrapper[0].name,
        type: wrapper[0].type,
        location: wrapper[0].location,
        descriptorHash: wrapper[0].descriptorHash,
        formatHash: hash(wrapper[0].descriptor.format),
      }),
      callableCount: rebuilt.length,
      containerHash: capture.containerHash,
      descriptorHash: capture.descriptorHash,
      requestByteHash: capture.requestByteHash,
    })
  } catch {
    return bad('SEALED_CAPTURE_INVALID')
  }
}

const expectedOperations = Object.freeze({
  REQUIREMENT_ANALYZER: ['quality_journey_analysis_get', 'quality_journey_external_analyzer_analysis_submit_v1'],
  SCOUT: ['quality_journey_discovery_get', 'quality_journey_external_scout_target_observation_submit_v1'],
  RESOURCE_EXPLORER: [
    'quality_journey_discovery_get',
    'operation_search',
    'quality_journey_external_resource_explorer_resolution_submit_v1',
  ],
  TEST_SCENARIO_DESIGNER: ['quality_journey_scenarios_get', 'quality_journey_external_scenarios_submit_v1'],
  AUTOMATOR: ['operation_search', 'quality_journey_external_automator_materialize_v1'],
  TRIAGER: [
    'quality_journey_triage_get',
    'quality_journey_triage_evidence_read',
    'quality_journey_external_triage_submit_v1',
  ],
})

export function validateSdkProfiles(profiles) {
  try {
    if (
      !exact(profiles, ['schema', 'evidenceClass', 'qualification', 'provenance', 'roles']) ||
      profiles.schema !== 'appraise.m02-ta-offline-sdk-profiles/v1' ||
      profiles.evidenceClass !== 'OFFLINE_SDK_TOOLS_LIST' ||
      profiles.qualification !== 'OFFLINE_ONLY_NOT_NATIVE_CAPTURE_OR_ROUTE' ||
      !Array.isArray(profiles.roles) ||
      profiles.roles.length !== 6
    )
      throw new Error('PROFILES_SHAPE')
    const roles = new Set()
    const validated = []
    for (const entry of profiles.roles) {
      if (
        !exact(entry, ['role', 'gatewayProfile', 'advertisedProfile', 'toolsList']) ||
        !own(expectedOperations, entry.role) ||
        roles.has(entry.role)
      )
        throw new Error('PROFILE_ROLE')
      roles.add(entry.role)
      const expected = expectedOperations[entry.role]
      const gateway = entry.gatewayProfile
      const advertised = entry.advertisedProfile
      const listed = entry.toolsList
      if (
        !exact(gateway, ['role', 'tools', 'resources', 'profileDigest']) ||
        gateway.role !== entry.role ||
        !Array.isArray(gateway.tools) ||
        gateway.tools.length !== expected.length ||
        !Array.isArray(gateway.resources) ||
        gateway.resources.length !== 0 ||
        gateway.tools.map(tool => tool.name).join() !== expected.join() ||
        gateway.tools.some(
          tool =>
            !exact(tool, ['name', 'inputSchema', 'canonicalSchemaHash', 'workerSchemaHash']) ||
            !hex.test(tool.canonicalSchemaHash) ||
            hash(tool.inputSchema) !== tool.workerSchemaHash,
        ) ||
        hash({ role: entry.role, tools: gateway.tools, resources: [] }) !== gateway.profileDigest
      )
        throw new Error('GATEWAY_PROFILE')
      if (
        !exact(advertised, ['gatewayProfileDigest', 'tools', 'profileDigest']) ||
        advertised.gatewayProfileDigest !== gateway.profileDigest ||
        !Array.isArray(advertised.tools) ||
        advertised.tools.length !== expected.length ||
        advertised.tools.map(tool => tool.name).join() !== expected.join() ||
        advertised.tools.some(
          tool => !exact(tool, ['name', 'inputSchema', 'schemaHash']) || hash(tool.inputSchema) !== tool.schemaHash,
        ) ||
        hash({ gatewayProfileDigest: gateway.profileDigest, tools: advertised.tools }) !== advertised.profileDigest
      )
        throw new Error('ADVERTISED_PROFILE')
      if (
        !exact(listed, ['tools', 'digest']) ||
        !Array.isArray(listed.tools) ||
        listed.tools.length !== expected.length ||
        listed.tools.map(tool => tool.name).join() !== expected.join() ||
        listed.tools.some(
          tool =>
            !exact(tool, ['name', 'description', 'inputSchema', 'inputSchemaDigest']) ||
            hash(tool.inputSchema) !== tool.inputSchemaDigest ||
            !advertised.tools.some(item => item.name === tool.name && item.schemaHash === tool.inputSchemaDigest),
        ) ||
        hash(listed.tools) !== listed.digest
      )
        throw new Error('SDK_LIST')
      validated.push(
        Object.freeze({
          role: entry.role,
          operations: Object.freeze([...expected]),
          gatewayProfileDigest: gateway.profileDigest,
          advertisedProfileDigest: advertised.profileDigest,
          sdkToolsListDigest: listed.digest,
        }),
      )
    }
    if (roles.size !== 6) throw new Error('PROFILE_ROLES')
    return Object.freeze({ status: 'VALIDATED', roles: Object.freeze(validated) })
  } catch {
    return bad('SDK_PROFILES_INVALID')
  }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function frozen(value) {
  if (value && typeof value === 'object') return Object.isFrozen(value) && Object.values(value).every(frozen)
  return true
}

export function loadSealedRouteEvidence({ io = fs } = {}) {
  try {
    const files = Object.fromEntries(Object.entries(FIXED_EVIDENCE).map(([key, spec]) => [key, readPinned(spec, io)]))
    const capture = validateSealedCapture(files.capture.value)
    const profiles = validateSdkProfiles(files.profiles.value)
    const review = files.review.value
    if (
      capture.status !== 'VALIDATED' ||
      profiles.status !== 'VALIDATED' ||
      review.schema !== 'appraise.m02-ta-t1-r9-execution-review/v1' ||
      review.verdict !== 'ACCEPT_T1_R9_ACTUAL_CAPTURE_WITH_LIMITS' ||
      review.runtimeVerdict !== 'T1_CAPTURED' ||
      review.execution?.resendAuthorized !== false ||
      review.execution?.nativeAttemptConsumed !== true ||
      review.execution?.manifestDigest !== files.capture.value.provenance.runId ||
      review.archive?.sourceArchiveByteEquality !== true ||
      review.archive?.currentSourceIdentitiesMatch !== true ||
      review.journal?.cleanupKnown !== true ||
      review.journal?.unknown !== false ||
      review.journal?.pending?.length !== 0 ||
      review.capture?.descriptorHash !== capture.descriptorHash ||
      review.capture?.containerHash !== capture.containerHash ||
      review.capture?.requestByteHash !== capture.requestByteHash ||
      review.capture?.status !== 'CAPTURED' ||
      review.capture?.runtimeQualification !== 'UNQUALIFIED' ||
      review.capture?.provenanceAttestation !== 'SUPPLIED_NOT_ATTESTED' ||
      review.capture?.typedLiteAtUuidV5IdsRetained !== 1 ||
      review.capture?.containers !== 1 ||
      review.capture?.callables !== capture.callableCount ||
      review.capture?.threadId !== files.capture.value.provenance.threadId ||
      review.capture?.turnId !== files.capture.value.provenance.turnId ||
      review.capture?.observedTuple?.model !== files.capture.value.observedTuple.model ||
      review.capture?.observedTuple?.effort !== files.capture.value.observedTuple.effort ||
      review.boundArtifacts?.[
        '.appraisejs/m02-ta-t1-r9-execution-evidence-01/cases--T1--supervisor--descriptor-capture.json'
      ] !== `fb295b2419ac96431205e0c309428da242663404950b519c4ee97d17c7e66775` ||
      review.observedScope?.scopedCalls !== 0 ||
      review.observedScope?.outerCalls !== 0 ||
      review.observedScope?.workspaceActions !== 0 ||
      review.observedScope?.permissionReplies !== 0
    )
      throw new Error('REVIEW_BINDING')
    const identities = Object.freeze(
      Object.fromEntries(Object.entries(files).map(([key, item]) => [key, item.identity])),
    )
    const seal = Object.freeze({
      status: 'SEALED_OFFLINE_ONLY',
      capture: freeze(files.capture.value),
      profiles: freeze(files.profiles.value),
      review: freeze(review),
      identities,
      captureValueHash: hash(files.capture.value),
      profilesValueHash: hash(files.profiles.value),
      reviewValueHash: hash(review),
    })
    issuedSeals.add(seal)
    return seal
  } catch {
    return bad('SEALED_EVIDENCE_INVALID')
  }
}

export function verifySealedRouteEvidence(seal, { io = fs } = {}) {
  try {
    if (
      !issuedSeals.has(seal) ||
      seal?.status !== 'SEALED_OFFLINE_ONLY' ||
      !frozen(seal.capture) ||
      !frozen(seal.profiles) ||
      !frozen(seal.review) ||
      hash(seal.capture) !== seal.captureValueHash ||
      hash(seal.profiles) !== seal.profilesValueHash ||
      hash(seal.review) !== seal.reviewValueHash ||
      validateSealedCapture(seal.capture).status !== 'VALIDATED' ||
      validateSdkProfiles(seal.profiles).status !== 'VALIDATED'
    )
      throw new Error('SEAL_VALUE')
    for (const [key, spec] of Object.entries(FIXED_EVIDENCE)) {
      const current = readPinned(spec, io).identity
      if (
        !exact(seal.identities?.[key], ['dev', 'ino', 'uid', 'mode', 'size', 'sha256']) ||
        Object.keys(current).some(field => current[field] !== seal.identities[key][field])
      )
        throw new Error('SEAL_FILE')
    }
    return Object.freeze({ status: 'VALIDATED' })
  } catch {
    return bad('SEALED_EVIDENCE_DRIFT')
  }
}

export { hash as stableHash }
