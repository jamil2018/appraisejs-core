import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRequestInterlock, P0_R2D_MODEL } from '../lib/p0-r2d-interlock-experiment.mjs'

test('R2d byte replay identity treats reserialized equivalent auth retries as new releases', async () => {
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
  const value = { model: P0_R2D_MODEL, tools: [] }
  const request = {
    body: Buffer.from(JSON.stringify(value)),
    method: 'POST',
    url: '/v1/responses',
    headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' },
  }
  const first = await gate(request)
  const repeated = await gate(request)
  const reserialized = await gate({ ...request, body: Buffer.from(JSON.stringify(value, null, 2)) })
  assert.equal(first.accepted, true)
  assert.equal(repeated.reason, 'replayed_request_binding')
  assert.equal(reserialized.accepted, true)
  assert.notEqual(reserialized.requestHash, first.requestHash)
  assert.equal(forwarded, 2)
  // This is a reproduced limitation, not desired production retry behavior.
})
