import assert from 'node:assert/strict'
import { test } from 'node:test'
import Ajv from 'ajv'

import {
  buildProbeProfiles,
  collectSchemaDifferences,
  findSemanticallyEquivalentTransforms,
} from '../qualify-p0-r2f-schema.mjs'
import { createRequestInterlock, P0_R2D_MODEL } from '../lib/p0-r2d-interlock-experiment.mjs'

// These probes use only the draft-7 keyword subset supported by the installed Ajv.
// They do not claim validation support for arbitrary canonical draft-2020 schemas.
const ajv = new Ajv({ allErrors: true })
const cases = {
  'probe-inline-constraints': {
    valid: { boundedString: 'OK', boundedArray: ['x'], enumControl: 'alpha', minItemsControl: [1] },
    invalid: [
      { boundedString: 'X' },
      { boundedString: 'TOOLONGXX' },
      { boundedString: 'bad' },
      { boundedArray: ['a', 'b', 'c', 'd'] },
      { boundedArray: [] },
      { enumControl: 'other' },
      { minItemsControl: [] },
    ],
  },
  'probe-defs-ref': { valid: { payload: 'ok' }, invalid: [{ payload: 'a' }, { payload: 'BAD' }] },
  'probe-allof': {
    valid: { payload: 'okay' },
    invalid: [{ payload: 'a' }, { payload: 'TOO' }, { payload: 'toolongxx' }],
  },
  'probe-definitions-ref': { valid: { payload: [1] }, invalid: [{ payload: [] }, { payload: [1, 2, 3, 4] }] },
}

for (const [arm, values] of Object.entries(cases)) {
  test(`${arm} has a satisfiable schema and rejects its intended invalid values`, () => {
    const probe = buildProbeProfiles().find(candidate => candidate.arm === arm)
    assert.ok(probe, arm)
    const validate = ajv.compile(probe.profile.tools[0].inputSchema)
    assert.equal(validate(values.valid), true, JSON.stringify(validate.errors))
    for (const invalid of values.invalid) {
      assert.equal(validate({ ...values.valid, ...invalid }), false, JSON.stringify(invalid))
    }
  })
}

test('schema diff distinguishes removed constraints, changed values and lost object structure', () => {
  const expected = { type: 'object', properties: { value: { type: 'string', minLength: 2 } }, required: ['value'] }
  const changed = { type: 'object', properties: { value: { type: 'string', minLength: 1 } }, required: [] }
  const differences = collectSchemaDifferences(expected, changed)
  assert.ok(differences.some(item => item.path === '$.properties.value.minLength' && item.kind === 'changed'))
  assert.ok(differences.some(item => item.path === '$.required.length' && item.kind === 'changed'))
  const collapsed = collectSchemaDifferences(expected, { type: 'object', properties: {} })
  assert.ok(collapsed.some(item => item.path === '$.properties.value' && item.kind === 'missing'))
  assert.ok(collapsed.some(item => item.path === '$.required' && item.kind === 'missing'))
  assert.deepEqual(collectSchemaDifferences(expected, structuredClone(expected)), [])
})

test('schema diff reports added restrictions rather than calling them equivalent', () => {
  assert.ok(
    collectSchemaDifferences({ type: 'string' }, { type: 'string', enum: ['only'] }).some(
      item => item.path === '$.enum' && item.kind === 'added',
    ),
  )
})

test('current interlock rejects an unchanged request after an upstream 401 even with refreshed authorization', async () => {
  let forwarded = 0
  const gate = createRequestInterlock({
    authority: {
      attemptId: 'auth-fixture',
      configSha256: 'config',
      executableSha256: 'executable',
      processIdentity: 'process',
      profileDigest: 'profile',
      protocol: 'responses/v1',
      threadId: 'thread',
      turnId: 'turn',
      expiresAt: Date.now() + 60_000,
    },
    expectedTools: [],
    upstream: async () => {
      forwarded += 1
      return { statusCode: 401 }
    },
  })
  const request = {
    body: Buffer.from(JSON.stringify({ model: P0_R2D_MODEL, tools: [] })),
    method: 'POST',
    url: '/v1/responses',
    headers: { authorization: 'Bearer synthetic-initial', 'content-type': 'application/json' },
  }
  const first = await gate(request)
  assert.equal(first.accepted, true)
  assert.equal(first.upstreamResult.statusCode, 401)
  const retry = await gate({
    ...request,
    headers: { ...request.headers, authorization: 'Bearer synthetic-refreshed' },
  })
  assert.equal(retry.accepted, false)
  assert.equal(retry.reason, 'replayed_request_binding')
  assert.equal(forwarded, 1)
})

test('const equivalence requires exactly the same single enum value', () => {
  const expected = { type: 'string', const: 'fixed' }
  assert.deepEqual(findSemanticallyEquivalentTransforms(expected, { type: 'string', enum: ['fixed'] }), [
    { kind: 'const_to_single_enum', path: '$' },
  ])
  assert.deepEqual(findSemanticallyEquivalentTransforms(expected, { type: 'string', enum: ['other'] }), [])
  assert.deepEqual(findSemanticallyEquivalentTransforms(expected, { type: 'string', enum: ['fixed', 'other'] }), [])
})
