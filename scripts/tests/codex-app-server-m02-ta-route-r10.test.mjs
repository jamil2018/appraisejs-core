import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  FIXED_EVIDENCE,
  loadSealedRouteEvidence,
  verifySealedRouteEvidence,
  validateSealedCapture,
  validateSdkProfiles,
  parseStrictJson,
  stableHash,
} from './fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs'
import {
  prepareSealedNativeRoutes,
  constructSealedNativeCall,
  constructSealedRejectionProbe,
  correlateSealedNativeCalls,
} from './fixtures/codex-app-server-m02-ta-route-r10/sealed-route.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const clone = value => structuredClone(value)
const blocked = value => {
  assert.equal(value.status, 'BLOCKED')
  assert.equal(value.runtimeQualified, false)
  assert.equal(value.dispatchAllowed, false)
}

test('R10 binds exact archived capture, accepted review and six SDK profile file identities', () => {
  for (const spec of Object.values(FIXED_EVIDENCE)) {
    const state = fs.lstatSync(spec.path)
    assert.equal(state.isFile(), true)
    assert.equal(state.isSymbolicLink(), false)
    assert.equal(sha(fs.readFileSync(spec.path)), spec.sha256)
  }
  const seal = loadSealedRouteEvidence()
  assert.equal(seal.status, 'SEALED_OFFLINE_ONLY')
  assert.equal(verifySealedRouteEvidence(seal).status, 'VALIDATED')
  assert.equal(Object.isFrozen(seal.capture.containers[0].tools[0]), true)
  assert.equal(Object.isFrozen(seal.profiles.roles[0].gatewayProfile.tools[0].inputSchema), true)
  assert.equal(seal.review.capture.callables, 11)
  assert.equal(seal.review.capture.typedLiteAtUuidV5IdsRetained, 1)
  assert.equal(seal.review.observedScope.scopedCalls, 0)
  assert.equal(seal.capture.provenance.attestation, 'SUPPLIED_NOT_ATTESTED')
  assert.equal(seal.capture.runtimeQualification, 'UNQUALIFIED')
})

test('R10 prepares one actual shared wrapper against all six validated role profiles without authority', () => {
  const seal = loadSealedRouteEvidence()
  const prepared = prepareSealedNativeRoutes(seal)
  assert.equal(prepared.status, 'PREPARED_NOT_RUNTIME_QUALIFIED')
  assert.equal(prepared.roleCount, 6)
  assert.equal(prepared.plannedOperationCount, 14)
  assert.equal(prepared.uniqueWrapperCount, 1)
  assert.equal(prepared.wrapper.nativeName, 'functions.exec')
  assert.equal(prepared.wrapper.type, 'custom')
  assert.equal(
    prepared.wrapper.descriptorHash,
    'sha256:bbe83d9646dbf56bb36a43ed1291f6e6aa401bc165947ed6c0affc1116128c40',
  )
  assert.equal(prepared.wrapper.descriptor, seal.capture.callables[0].descriptor)
  assert.equal(prepared.wrapper.codecStatus, 'NESTED_RUNTIME_DECODER_UNQUALIFIED')
  assert.equal(prepared.containerHash, seal.capture.containerHash)
  assert.equal(prepared.requestByteHash, seal.capture.requestByteHash)
  assert.equal(prepared.runtimeQualified, false)
  assert.equal(prepared.dispatchAllowed, false)
  assert.deepEqual(
    prepared.roles.map(role => role.role),
    ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER'],
  )
  assert.deepEqual(
    prepared.roles.map(role => role.routes.length),
    [2, 2, 3, 2, 2, 3],
  )
  for (const [index, role] of prepared.roles.entries()) {
    const source = seal.profiles.roles[index]
    assert.equal(role.gatewayProfile, source.gatewayProfile)
    assert.equal(role.advertisedProfile, source.advertisedProfile)
    assert.equal(role.sdkListedTools, source.toolsList.tools)
    assert.equal(role.gatewayProfileDigest, source.gatewayProfile.profileDigest)
    assert.equal(role.advertisedProfileDigest, source.advertisedProfile.profileDigest)
    assert.equal(role.sdkToolsListDigest, source.toolsList.digest)
    for (const route of role.routes) {
      assert.equal(route.nativeName, prepared.wrapper.nativeName)
      assert.equal(route.descriptorHash, prepared.wrapper.descriptorHash)
      assert.equal(route.mode, 'SHARED_WRAPPER_PENDING_CODEC')
      assert.equal(route.dispatchAllowed, false)
    }
  }
})

test('R10 construction, rejection and correlation gates revalidate seal and block missing codec', () => {
  const seal = loadSealedRouteEvidence()
  const prepared = prepareSealedNativeRoutes(seal)
  const role = prepared.roles[0].role
  const operation = prepared.roles[0].routes[0].operation
  for (const result of [
    constructSealedNativeCall({ seal, prepared, role, operation }),
    constructSealedRejectionProbe({ seal, prepared, role, selector: 'A01' }),
    correlateSealedNativeCalls({ seal, prepared }),
  ]) {
    blocked(result)
    assert.equal(result.reason, 'NESTED_RUNTIME_DECODER_UNQUALIFIED')
  }
  assert.equal(
    constructSealedNativeCall({ seal, prepared, role, operation: 'quality_journey_discovery_get' }).reason,
    'CROSS_ROLE_OPERATION',
  )
  assert.equal(
    constructSealedRejectionProbe({ seal, prepared, role, selector: 'A99' }).reason,
    'UNKNOWN_REJECTION_SELECTOR',
  )
  assert.equal(
    constructSealedRejectionProbe({ seal, prepared, role, selector: 'D01' }).reason,
    'SELECTOR_ROLE_MISMATCH',
  )
  const forged = { ...prepared, dispatchAllowed: true }
  assert.equal(constructSealedNativeCall({ seal, prepared: forged, role, operation }).reason, 'STALE_PREPARATION')
  const foreignSeal = { ...seal }
  assert.equal(constructSealedNativeCall({ seal: foreignSeal, prepared, role, operation }).reason, 'STALE_SEAL')
})

test('R10 independently detects capture shape, provenance, Lite ID, nested descriptor and every hash drift', () => {
  const original = loadSealedRouteEvidence().capture
  assert.equal(validateSealedCapture(original).status, 'VALIDATED')
  const mutants = [
    value => {
      value.status = 'INCOMPLETE'
    },
    value => {
      value.runtimeQualification = 'QUALIFIED'
    },
    value => {
      value.provenance.attestation = 'OS_ATTESTED'
    },
    value => {
      value.provenance.runId = 'foreign'
    },
    value => {
      value.observedTuple.model = 'wrong'
    },
    value => {
      value.containers[0].metadata.id = 'at_wrong'
    },
    value => {
      value.containers[0].metadata.content = 'private'
    },
    value => {
      value.containers[0].tools[0].tools[0].description += ' altered'
    },
    value => {
      value.callables[0].location = 'foreign'
    },
    value => {
      value.callables[0].descriptorHash = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.callables.push(value.callables[0])
    },
    value => {
      value.containerHash = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.descriptorHash = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.requestByteHash = 'unhashed'
    },
    value => {
      value.extra = true
    },
  ]
  for (const mutate of mutants) {
    const copy = clone(original)
    mutate(copy)
    blocked(validateSealedCapture(copy))
  }
  const nested = clone(original)
  nested.containers[0].tools[0].tools[0].__proto__ = { private: true }
  blocked(validateSealedCapture(nested))
})

test('R10 validates six profile digest chains, complete tool lists and duplicate-free JSON', () => {
  const profiles = loadSealedRouteEvidence().profiles
  assert.equal(validateSdkProfiles(profiles).status, 'VALIDATED')
  for (const mutate of [
    value => {
      value.roles[0].gatewayProfile.tools[0].workerSchemaHash = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.roles[0].advertisedProfile.profileDigest = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.roles[1].toolsList.digest = `sha256:${'a'.repeat(64)}`
    },
    value => {
      value.roles[2].toolsList.tools[0].name = 'foreign'
    },
    value => {
      value.roles[3].role = value.roles[0].role
    },
    value => {
      value.roles[4].gatewayProfile.resources.push('foreign')
    },
  ]) {
    const copy = clone(profiles)
    mutate(copy)
    blocked(validateSdkProfiles(copy))
  }
  assert.throws(() => parseStrictJson('{"a":1,"a":2}'), /DUPLICATE_KEY/)
  assert.throws(() => parseStrictJson('{"a":{"b":1,"b":2}}'), /DUPLICATE_KEY/)
  assert.throws(() => parseStrictJson('{"a":1} trailing'), /INVALID_JSON/)
  assert.throws(() => parseStrictJson('['.repeat(41) + '0' + ']'.repeat(41)), /JSON_DEPTH/)
})

test('R10 file inode, mode, bytes and forged seal fail closed at every route gate', () => {
  const seal = loadSealedRouteEvidence()
  const prepared = prepareSealedNativeRoutes(seal)
  const role = prepared.roles[0].role
  const operation = prepared.roles[0].routes[0].operation
  const inodeDrift = {
    lstatSync(path) {
      const stat = fs.lstatSync(path)
      if (path !== FIXED_EVIDENCE.capture.path) return stat
      return { ...stat, ino: stat.ino + 1, isFile: () => true, isSymbolicLink: () => false }
    },
    readFileSync: path => fs.readFileSync(path),
  }
  assert.equal(verifySealedRouteEvidence(seal, { io: inodeDrift }).reason, 'SEALED_EVIDENCE_DRIFT')
  for (const result of [
    constructSealedNativeCall({ seal, prepared, role, operation, io: inodeDrift }),
    constructSealedRejectionProbe({ seal, prepared, role, selector: 'A01', io: inodeDrift }),
    correlateSealedNativeCalls({ seal, prepared, io: inodeDrift }),
  ])
    assert.equal(result.reason, 'STALE_SEAL')
  const symlink = {
    ...inodeDrift,
    lstatSync: path => {
      const stat = fs.lstatSync(path)
      return path === FIXED_EVIDENCE.capture.path ? { ...stat, isFile: () => true, isSymbolicLink: () => true } : stat
    },
  }
  assert.equal(loadSealedRouteEvidence({ io: symlink }).reason, 'SEALED_EVIDENCE_INVALID')
  const changedBytes = {
    lstatSync: path => fs.lstatSync(path),
    readFileSync: path => (path === FIXED_EVIDENCE.profiles.path ? Buffer.from('{}') : fs.readFileSync(path)),
  }
  assert.equal(loadSealedRouteEvidence({ io: changedBytes }).reason, 'SEALED_EVIDENCE_INVALID')
  const mismatched = { ...seal, captureValueHash: stableHash({ changed: true }) }
  assert.equal(verifySealedRouteEvidence(mismatched).reason, 'SEALED_EVIDENCE_DRIFT')
})

test('R10 is an offline fixture with no raw-request replay, native effects or inferred dispatch', () => {
  const route = fs.readFileSync('scripts/tests/fixtures/codex-app-server-m02-ta-route-r10/sealed-route.mjs', 'utf8')
  const capture = fs.readFileSync('scripts/tests/fixtures/codex-app-server-m02-ta-route-r10/sealed-capture.mjs', 'utf8')
  assert.doesNotMatch(
    route + capture,
    /NativeDescriptorCollector|\.capture\(input\.request|createServer|spawn\(|thread\/start|turn\/start/,
  )
  assert.doesNotMatch(route + capture, /@modelcontextprotocol\/sdk|codex-app-server-m02-ta-runtime-r9\/runtime-effects/)
  assert.match(route, /NESTED_RUNTIME_DECODER_UNQUALIFIED/)
  assert.match(capture, /ACTUAL_T1_DESCRIPTOR_ONLY|SEALED_OFFLINE_ONLY/)
})
