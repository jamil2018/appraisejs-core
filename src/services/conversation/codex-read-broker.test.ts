import { describe, expect, it, vi } from 'vitest'

import {
  codexLookupAcknowledgement,
  codexLookupModel,
  codexLookupPrompt,
} from '@/lib/conversation/codex-lookup-contract'
import { openCodexReadBroker } from './codex-read-broker'

const query = { kind: 'TEST_CASE', query: 'checkout' } as const
const accessToken = 'fixture-account-token'
const toolCall = {
  type: 'function_call',
  id: 'fc_fixture',
  call_id: 'call_fixture',
  namespace: 'appraise',
  name: 'workspace_record_search',
  arguments: '{}',
}

function stream(output: unknown[]) {
  const event = { type: 'response.completed', response: { status: 'completed', output } }
  return new Response(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
}

async function fixture(transport: typeof fetch) {
  const broker = await openCodexReadBroker({
    query,
    transport,
    readToken: async () => accessToken,
    signal: AbortSignal.timeout(5_000),
  })
  return Object.assign(broker, {
    send(input: unknown[], token = broker.token) {
      return fetch(`http://127.0.0.1:${broker.port}/v1/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: codexLookupModel, input, tools: [{ name: 'ambient-tool' }] }),
      })
    },
  })
}

const initial = [{ role: 'user', content: codexLookupPrompt(query) }]
const output = [{ type: 'function_call_output', call_id: toolCall.call_id, output: codexLookupAcknowledgement }]

describe('native Codex read broker', () => {
  it('sends only the scoped lookup and a fixed acknowledgement to Responses', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(stream([toolCall]))
      .mockResolvedValueOnce(stream([{ type: 'message' }]))
    const broker = await fixture(transport)
    try {
      expect((await broker.send([{ role: 'user', content: 'discarded native environment' }, ...initial])).status).toBe(
        200,
      )
      expect((await broker.send(output)).status).toBe(400)
      expect(() => broker.authorizeToolCall('another-call')).toThrow()
      broker.authorizeToolCall(toolCall.call_id)
      broker.confirmToolCall(toolCall.call_id)
      expect(() => broker.confirmToolCall(toolCall.call_id)).toThrow()
      expect((await broker.send([{ ...output[0], output: 'private local row' }])).status).toBe(400)
      expect((await broker.send(output)).status).toBe(200)
      expect((await broker.send(output)).status).toBe(400)
      expect(broker.completed()).toBe(true)
      expect(broker.sent()).toBe(2)
      const first = transport.mock.calls[0]
      expect(first[0]).toBe('https://api.openai.com/v1/responses')
      expect(first[1]).toMatchObject({ redirect: 'error', headers: { Authorization: `Bearer ${accessToken}` } })
      const bodies = transport.mock.calls.map(([, request]) => JSON.parse(String(request?.body)))
      expect(bodies[0]).toMatchObject({ input: initial, tool_choice: 'required', stream: true, store: false })
      expect(bodies[1]).toMatchObject({ input: [...initial, toolCall, ...output], tool_choice: 'none' })
      expect(JSON.stringify(bodies)).not.toMatch(/ambient-tool|discarded native environment|private local row/)
    } finally {
      await broker.stop()
    }
  })

  it.each([
    { ...toolCall, namespace: 'another' },
    { ...toolCall, arguments: '{"kind":"REPORT"}' },
  ])('rejects an unapproved tool result before the local lookup', async call => {
    const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(stream([call]))
    const broker = await fixture(transport)
    try {
      expect((await broker.send(initial, 'wrong-capability')).status).toBe(400)
      expect((await broker.send([{ role: 'user', content: 'wrong lookup' }])).status).toBe(400)
      expect(broker.sent()).toBe(0)
      expect((await broker.send(initial)).status).toBe(400)
      expect(() => broker.authorizeToolCall(toolCall.call_id)).toThrow()
      expect(broker.sent()).toBe(1)
      expect(broker.completed()).toBe(false)
    } finally {
      await broker.stop()
    }
  })
})
