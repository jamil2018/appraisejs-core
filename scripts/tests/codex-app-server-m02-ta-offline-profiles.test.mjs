import assert from 'node:assert/strict'
import test from 'node:test'
import {
  collectOfflineSdkProfiles,
  validateOfflineRoleProfile,
} from './fixtures/codex-app-server-m02-ta-offline-profiles/collect.mjs'

const roles = ['REQUIREMENT_ANALYZER', 'SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER', 'AUTOMATOR', 'TRIAGER']

test(
  'six disposable role endpoints yield only offline SDK tools/list profiles and no environment reads',
  { timeout: 120_000 },
  async () => {
    const evidence = await collectOfflineSdkProfiles()
    assert.deepEqual(Object.keys(evidence), ['schema', 'evidenceClass', 'qualification', 'provenance', 'roles'])
    assert.equal(evidence.evidenceClass, 'OFFLINE_SDK_TOOLS_LIST')
    assert.equal(evidence.qualification, 'OFFLINE_ONLY_NOT_NATIVE_CAPTURE_OR_ROUTE')
    assert.equal(evidence.provenance.rootTransform, 'TEST_ROOT_VARIANT_BYTE_EQUIVALENT_TO_P2')
    assert.equal(evidence.provenance.envReadAttempts, 0)
    assert.match(evidence.provenance.producerSha256, /^[a-f0-9]{64}$/)
    assert.match(evidence.provenance.sdkPackageSha256, /^[a-f0-9]{64}$/)
    assert.match(evidence.provenance.p2BackendSha256, /^[a-f0-9]{64}$/)
    assert.deepEqual(
      evidence.roles.map(item => item.role),
      roles,
    )
    assert.equal(new Set(evidence.roles.map(item => item.gatewayProfile.profileDigest)).size, 6)
    assert.equal(new Set(evidence.roles.map(item => item.advertisedProfile.profileDigest)).size, 6)
    for (const record of evidence.roles) {
      assert.deepEqual(Object.keys(record), ['role', 'gatewayProfile', 'advertisedProfile', 'toolsList'])
      assert.equal(validateOfflineRoleProfile(record), true)
      assert.ok(record.toolsList.tools.length >= 2)
      assert.ok(record.toolsList.tools.every(tool => /^sha256:[a-f0-9]{64}$/.test(tool.inputSchemaDigest)))
    }
    const serialized = JSON.stringify(evidence)
    assert.equal(serialized.includes('fixture.db'), false)
    assert.equal(serialized.includes('appraise-m02-ta-offline-profiles-'), false)
  },
)

test('profile validator refuses SDK catalog mismatches', () => {
  const profile = {
    role: 'SCOUT',
    gatewayProfile: { role: 'SCOUT', profileDigest: 'sha256:' + 'a'.repeat(64) },
    advertisedProfile: {
      profileDigest: 'sha256:' + 'b'.repeat(64),
      tools: [{ name: 'one', inputSchema: {}, schemaHash: 'sha256:' + 'c'.repeat(64) }],
    },
    toolsList: {
      tools: [{ name: 'different', inputSchema: {}, inputSchemaDigest: 'sha256:' + 'c'.repeat(64) }],
      digest: 'sha256:' + 'd'.repeat(64),
    },
  }
  assert.throws(() => validateOfflineRoleProfile(profile), /advertised schema mismatch/)
})
