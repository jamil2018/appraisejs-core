import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAppraiseMcpServer } from './server-factory.js'

const workspaces: string[] = []
const hash = (letter: string) => `sha256:${letter.repeat(64)}`

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

const receiptInput = {
  target: 'target-1',
  qualityPlanId: 'plan-1',
  revisionId: 'revision-1',
  expectedDesignHash: `sha256:${'a'.repeat(64)}`,
  validationBindings: [
    {
      validationId: 'validation-1',
      locatorIds: [],
      steps: [{ stepId: 'browser.ready', version: '1', inputs: {}, description: 'the page is ready' }],
    },
  ],
  environment: { environmentId: 'environment-1' },
  idempotencyKey: 'scope-receipt-1',
}

function invalidReceipt(mutate: (scope: Record<string, unknown>) => void) {
  const scope: Record<string, unknown> = {
    scopeHash: hash('a'),
    algorithmVersion: 'appraise.quality-assessment-preflight/v2',
    scopeIntentHash: hash('b'),
    realizationIntentHash: hash('c'),
    preflightHash: hash('d'),
    validationBindingsHash: hash('e'),
    environmentId: 'environment-1',
    expectedPreflight: {
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightHash: hash('d'),
    },
  }
  mutate(scope)
  return {
    subject: { id: 'subject-1', subjectKind: 'REMOTE_EVALUATION_SCOPE' },
    scope,
    scopeIntent: { password: 'secret' },
    nextRecommendedAction: 'do-not-return-this-successfully',
  }
}

async function callRemoteScopeTool(responsePayload: unknown) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-remote-scope-'))
  workspaces.push(cwd)
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-remote-scope-test"}')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
  const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
  const client = new Client({ name: 'remote-scope-receipt-test', version: '1' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  try {
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return await client.callTool({ name: 'evaluation_subject_remote_scope_create', arguments: receiptInput })
  } finally {
    await client.close()
    await server.close()
  }
}

describe('remote scope MCP receipt contract', () => {
  const invalidMutations: Array<[string, (scope: Record<string, unknown>) => void]> = [
    ['missing expectedPreflight', scope => delete scope.expectedPreflight],
    [
      'self-consistent v1',
      scope => {
        scope.algorithmVersion = 'appraise.quality-assessment-preflight/v1'
        scope.expectedPreflight = {
          algorithmVersion: 'appraise.quality-assessment-preflight/v1',
          preflightHash: hash('d'),
        }
      },
    ],
    [
      'conflicting algorithm',
      scope => {
        scope.expectedPreflight = {
          algorithmVersion: 'appraise.quality-assessment-preflight/v1',
          preflightHash: hash('d'),
        }
      },
    ],
    [
      'conflicting hash',
      scope => {
        scope.expectedPreflight = {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('f'),
        }
      },
    ],
    [
      'extra expectedPreflight field',
      scope => {
        scope.expectedPreflight = {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('d'),
          secret: 'leak',
        }
      },
    ],
    ['missing scope intent hash', scope => delete scope.scopeIntentHash],
    ['missing realization intent hash', scope => delete scope.realizationIntentHash],
    ['missing preflight hash', scope => delete scope.preflightHash],
    ['malformed scope intent hash', scope => (scope.scopeIntentHash = 'sha256:not-a-valid-digest')],
    ['malformed realization intent hash', scope => (scope.realizationIntentHash = 'sha256:not-a-valid-digest')],
    [
      'malformed preflight hash',
      scope => {
        scope.preflightHash = 'sha256:not-a-valid-digest'
        scope.expectedPreflight = {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: 'sha256:not-a-valid-digest',
        }
      },
    ],
  ]

  it.each(invalidMutations)(
    'returns a sanitized tool error instead of a partial successful receipt: %s',
    async (_label, mutate) => {
      const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-remote-scope-'))
      workspaces.push(cwd)
      await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-remote-scope-test"}')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(invalidReceipt(mutate)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      )

      const server = await createAppraiseMcpServer({ cwd, baseUrl: 'http://127.0.0.1:3999', coordinatorId: 'test' })
      const client = new Client({ name: 'remote-scope-receipt-test', version: '1' })
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
      try {
        await server.connect(serverTransport)
        await client.connect(clientTransport)
        const result = await client.callTool({
          name: 'evaluation_subject_remote_scope_create',
          arguments: receiptInput,
        })
        const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>

        expect(result.isError).toBe(true)
        expect(payload).toMatchObject({
          classification: 'appraise_runtime_defect',
          code: 'remote_scope_receipt_invalid',
          operation: { name: 'evaluation_subject_remote_scope_create' },
          operationOutcome: 'unknown',
          targetOutcome: 'not_evaluated',
          retry: {
            safe: false,
            strategy: 'read_state_then_retry',
            nextAction: {
              tool: 'evaluation_subject_remote_scope_create',
              reason: expect.stringContaining('original idempotency key'),
            },
          },
        })
        expect(payload).not.toHaveProperty('subject')
        expect(payload).not.toHaveProperty('scope')
        expect(JSON.stringify(payload)).not.toContain('secret')
        expect(JSON.stringify(payload)).not.toContain('do-not-return-this-successfully')
      } finally {
        await client.close()
        await server.close()
      }
    },
  )

  it.each([
    [
      'missing entire scope',
      () => {
        const payload = invalidReceipt(() => {}) as Record<string, unknown>
        delete payload.scope
        return payload
      },
    ],
    [
      'missing subject',
      () => {
        const payload = invalidReceipt(() => {}) as Record<string, unknown>
        delete payload.subject
        return payload
      },
    ],
    ['malformed subject', () => ({ ...invalidReceipt(() => {}), subject: { id: 42 } })],
  ])('rejects a 2xx scope issuance response missing a valid subject or scope: %s', async (_label, createPayload) => {
    const result = await callRemoteScopeTool(createPayload())
    const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    expect(result.isError).toBe(true)
    expect(payload).toMatchObject({
      classification: 'appraise_runtime_defect',
      code: 'remote_scope_receipt_invalid',
      operationOutcome: 'unknown',
      targetOutcome: 'not_evaluated',
    })
    expect(JSON.stringify(payload)).not.toContain('subject-1')
    expect(JSON.stringify(payload)).not.toContain('secret')
  })

  it('returns the complete bounded v2 handoff for a valid 2xx scope issuance response', async () => {
    const result = await callRemoteScopeTool(invalidReceipt(() => {}))
    const payload = JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>
    expect(result.isError).not.toBe(true)
    expect(payload).toMatchObject({
      subjectRevisionId: 'subject-1',
      scope: {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: hash('b'),
        realizationIntentHash: hash('c'),
        preflightHash: hash('d'),
        expectedPreflight: {
          algorithmVersion: 'appraise.quality-assessment-preflight/v2',
          preflightHash: hash('d'),
        },
      },
    })
    expect(JSON.stringify(payload)).not.toContain('secret')
  })
})
