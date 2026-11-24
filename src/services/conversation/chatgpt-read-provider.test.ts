import { describe, expect, it, vi } from 'vitest'

import { createChatGptReadProvider } from './chatgpt-read-provider'

const call = {
  type: 'function_call',
  namespace: 'appraise',
  name: 'workspace_record_search',
  call_id: 'call_disposable',
  status: 'completed',
  arguments: '{}',
}

function completed(output: unknown[]) {
  return { type: 'response.completed', response: { id: 'resp_disposable', status: 'completed', output } }
}

function events(...payloads: unknown[]) {
  const data = payloads.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join('')
  const bytes = new TextEncoder().encode(data)
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < bytes.length; index += 13) controller.enqueue(bytes.subarray(index, index + 13))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function fixture(response: Response, models = [{ slug: 'gpt-6.2-sol', visibility: 'list' }]) {
  const fetchProvider = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ models }))
    .mockResolvedValue(response)
  const readToken = vi.fn().mockResolvedValue('disposable-token')
  const handle = createChatGptReadProvider(readToken, fetchProvider)
  const lookup = vi.fn().mockResolvedValue([{ title: 'Private local case' }])
  const run = () =>
    handle({
      query: { kind: 'TEST_CASE', query: 'Guest checkout 📦' },
      lookup,
      signal: new AbortController().signal,
    })
  return { fetchProvider, lookup, run, readToken }
}

describe('ChatGPT plan record lookup', () => {
  it('emits one bounded namespaced function request and reads only on the exact terminal event', async () => {
    const { run, lookup, fetchProvider } = fixture(
      events({ type: 'response.output_item.done', item: call }, completed([{ type: 'reasoning' }, call])),
    )
    await expect(run()).resolves.toBe('completed')
    expect(lookup).toHaveBeenCalledExactlyOnceWith()
    expect(fetchProvider).toHaveBeenCalledTimes(2)
    const [catalogUrl, catalogInit] = fetchProvider.mock.calls[0]
    expect(catalogUrl).toBe('https://api.openai.com/v1/models')
    expect(catalogInit?.body).toBeUndefined()
    const [url, init] = fetchProvider.mock.calls[1]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init?.redirect).toBe('error')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer disposable-token' })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
      store: false,
      parallel_tool_calls: false,
      tool_choice: 'required',
      tools: [{ type: 'namespace', name: 'appraise', tools: [{ name: 'workspace_record_search', strict: true }] }],
    })
    expect(String(init?.body)).toContain('Guest checkout 📦')
    expect(String(init?.body)).not.toContain('Private local case')
  })

  it.each([
    ['substituted function', [{ ...call, name: 'delete_records' }]],
    ['substituted project', [{ ...call, arguments: '{"target":"other-project"}' }]],
    ['multiple calls', [call, call]],
    ['free-form assertion', [{ type: 'message', content: 'I already found the case.' }]],
  ])('refuses %s without running a local lookup', async (_scenario, output) => {
    const { run, lookup } = fixture(events(completed(output)))
    await expect(run()).resolves.toBe('failed')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('keeps an interrupted stream unresolved even if it already contained a tool call', async () => {
    const { run, lookup } = fixture(events({ type: 'response.output_item.done', item: call }))
    await expect(run()).rejects.toThrow('before a terminal event')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('distinguishes a rejection from an uncertain HTTP timeout', async () => {
    await expect(fixture(new Response(null, { status: 401 })).run()).resolves.toBe('failed')
    await expect(fixture(new Response(null, { status: 408 })).run()).rejects.toThrow('did not confirm')
  })

  it('requires a supported account-listed model and checks the same token before sending the query', async () => {
    const unavailable = fixture(events(completed([call])), [{ slug: 'gpt-6.2-sol', visibility: 'hidden' }])
    await expect(unavailable.run()).resolves.toBe('failed')
    expect(unavailable.fetchProvider).toHaveBeenCalledTimes(1)
    expect(unavailable.lookup).not.toHaveBeenCalled()

    const switched = fixture(events(completed([call])))
    switched.readToken.mockResolvedValueOnce('disposable-token').mockResolvedValueOnce(undefined)
    await expect(switched.run()).resolves.toBe('failed')
    expect(switched.fetchProvider).toHaveBeenCalledTimes(1)
    expect(switched.lookup).not.toHaveBeenCalled()
  })
})
