import { describe, expect, it, vi } from 'vitest'
import { createNativeQualificationProtocol } from './native-qualification-protocol'
import type { OwnedFixtureChild } from './owned-child'

describe('pinned native protocol facade', () => {
  it('preserves actual absent-params initialized wire compatibility and rejects malformed requests before transport', async () => {
    const request = vi.fn(),
      notifyInitialized = vi.fn()
    const protocol = createNativeQualificationProtocol({
      serverName: 'appraise_worker',
      enabledTools: ['quality_journey_analysis_get'],
      maxToolCalls: 4,
    })
    const facade = protocol.transport({
      request,
      notifyInitialized,
      fence: vi.fn(),
      snapshot: vi.fn(),
    } as OwnedFixtureChild['transport'])
    await facade.notifyInitialized()
    expect(notifyInitialized).toHaveBeenCalledTimes(1)
    await expect(facade.request('thread/resume', { threadId: 'existing' })).rejects.toThrow(/protocol refused/)
    await expect(facade.request('config/read', { cwd: 12 })).rejects.toThrow(/protocol refused/)
    expect(request).not.toHaveBeenCalled()
  })
  it('validates real installed response and notification schemas without accepting malformed provider data', async () => {
    const protocol = createNativeQualificationProtocol({
      serverName: 'appraise_worker',
      enabledTools: ['quality_journey_analysis_get'],
      maxToolCalls: 4,
    })
    const facade = protocol.transport({
      request: vi.fn().mockResolvedValue({}),
      notifyInitialized: vi.fn(),
      fence: vi.fn(),
      snapshot: vi.fn(),
    } as OwnedFixtureChild['transport'])
    await expect(
      facade.request('initialize', {
        clientInfo: { name: 'test', version: '1' },
        capabilities: { experimentalApi: true },
      }),
    ).rejects.toThrow(/protocol refused/)
    expect(() => protocol.notification('turn/completed', { threadId: 'thread', turn: {} })).toThrow(/protocol refused/)
    expect(() => protocol.notification('unknown/provider', {})).toThrow(/protocol refused/)
  })
})

async function activeProtocol() {
  const protocol = createNativeQualificationProtocol({
    serverName: 'appraise_worker',
    enabledTools: ['quality_journey_analysis_get'],
    maxToolCalls: 4,
  })
  const request = vi.fn().mockResolvedValue({ turn: { id: 'turn', items: [], status: 'inProgress' } })
  const transport = protocol.transport({
    request,
    notifyInitialized: vi.fn(),
    fence: vi.fn(),
    snapshot: vi.fn(),
  } as OwnedFixtureChild['transport'])
  await transport.request('turn/start', { threadId: 'thread', input: [], model: 'gpt-6.1-sol', effort: 'medium' })
  return protocol
}
const itemEvent = (item: Record<string, unknown>) => ({
  threadId: 'thread',
  turnId: 'turn',
  startedAtMs: 1,
  item: { id: 'item', ...item },
})
describe('schema-valid native item scope is separate from permission', () => {
  it.each([
    { type: 'userMessage', content: [] },
    { type: 'agentMessage', text: 'Synthetic' },
    { type: 'reasoning' },
    { type: 'plan', text: 'Synthetic' },
    {
      type: 'mcpToolCall',
      server: 'appraise_worker',
      tool: 'quality_journey_analysis_get',
      status: 'inProgress',
      arguments: {},
    },
  ])('accepts only presentation or scoped MCP $type', async item => {
    const protocol = await activeProtocol()
    expect(() => protocol.notification('item/started', itemEvent(item))).not.toThrow()
  })
  it.each([
    {
      type: 'mcpToolCall',
      server: 'foreign',
      tool: 'quality_journey_analysis_get',
      status: 'inProgress',
      arguments: {},
    },
    { type: 'mcpToolCall', server: 'appraise_worker', tool: 'foreign_tool', status: 'inProgress', arguments: {} },
    {
      type: 'commandExecution',
      command: 'synthetic command never executed',
      cwd: '/synthetic',
      commandActions: [],
      status: 'inProgress',
    },
    { type: 'fileChange', changes: [], status: 'inProgress' },
    { type: 'webSearch', query: 'synthetic' },
    { type: 'imageView', path: '/synthetic' },
    { type: 'sleep', durationMs: 1 },
    {
      type: 'collabAgentToolCall',
      agentsStates: {},
      receiverThreadIds: [],
      senderThreadId: 'thread',
      status: 'inProgress',
      tool: 'spawnAgent',
    },
    { type: 'dynamicToolCall', tool: 'foreign', arguments: {}, status: 'inProgress' },
  ])('poisons schema-valid foreign activity $type without retaining its payload', async item => {
    const protocol = await activeProtocol()
    expect(() => protocol.notification('item/started', itemEvent(item))).toThrow('Pinned native protocol refused')
    expect(() => protocol.notification('item/started', itemEvent({ type: 'plan', text: 'late' }))).toThrow(
      'Pinned native protocol refused',
    )
  })
  it('rejects premature, cross-turn and completion-embedded foreign activity', async () => {
    const premature = createNativeQualificationProtocol({
      serverName: 'appraise_worker',
      enabledTools: ['quality_journey_analysis_get'],
      maxToolCalls: 4,
    })
    expect(() => premature.notification('item/started', itemEvent({ type: 'plan', text: 'early' }))).toThrow(
      /protocol refused/,
    )
    const crossTurn = await activeProtocol()
    expect(() =>
      crossTurn.notification('item/started', { ...itemEvent({ type: 'plan', text: 'cross' }), turnId: 'foreign-turn' }),
    ).toThrow(/protocol refused/)
    const completion = await activeProtocol()
    expect(() =>
      completion.notification('turn/completed', {
        threadId: 'thread',
        turn: { id: 'turn', status: 'completed', items: [{ id: 'item', type: 'webSearch', query: 'synthetic' }] },
      }),
    ).toThrow(/protocol refused/)
  })
})
