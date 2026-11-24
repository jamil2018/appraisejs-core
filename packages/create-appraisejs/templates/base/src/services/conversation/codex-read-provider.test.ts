import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { codexLookupAcknowledgement } from '@/lib/conversation/codex-lookup-contract'

import { CodexReadAttemptError, runCodexRecordLookup } from './codex-read-provider'
import type { CodexReadLaunch, CodexReadTransport } from './codex-read-provider'

type Frame = Record<string, unknown>

type HostOptions = {
  tool?: string
  namespace?: string
  arguments?: Record<string, unknown>
  threadId?: string
  turnId?: string
  completedStatus?: string
  closeAfterTurn?: boolean
  onTurnStart?: () => void
  stopNever?: boolean
  malformedToolCall?: boolean
  duplicateToolCall?: boolean
}

function send(stdout: PassThrough, frame: Frame): void {
  stdout.write(JSON.stringify(frame) + '\n')
}

function toolCall(options: HostOptions, id = 43): Frame {
  return {
    id,
    method: 'item/tool/call',
    params: {
      threadId: options.threadId ?? 'thread-a',
      turnId: options.turnId ?? 'turn-a',
      callId: id === 43 ? 'call-a' : 'call-b',
      namespace: options.namespace ?? 'appraise',
      tool: options.tool ?? 'workspace_record_search',
      arguments: options.malformedToolCall ? null : (options.arguments ?? {}),
    },
  }
}

function turnStarted(stdout: PassThrough, options: HostOptions): void {
  send(stdout, { id: 2, result: { turn: { id: 'turn-a' } } })
  options.onTurnStart?.()
  if (options.closeAfterTurn) stdout.end()
  else send(stdout, toolCall(options))
}

function toolAnswered(stdout: PassThrough, options: HostOptions): void {
  if (options.duplicateToolCall) send(stdout, toolCall({}, 44))
  send(stdout, {
    method: 'item/agentMessage/delta',
    params: { threadId: 'thread-a', turnId: 'turn-a', delta: 'The model says an unrelated record exists.' },
  })
  send(stdout, {
    method: 'turn/completed',
    params: { threadId: 'thread-a', turn: { id: 'turn-a', status: options.completedStatus ?? 'completed' } },
  })
}

function respond(stdout: PassThrough, frame: Frame, options: HostOptions): void {
  if (frame.method === 'initialize') send(stdout, { id: 0, result: { userAgent: 'synthetic' } })
  else if (frame.method === 'thread/start') send(stdout, { id: 1, result: { thread: { id: 'thread-a' } } })
  else if (frame.method === 'turn/start') turnStarted(stdout, options)
  else if (frame.id === 43 && frame.result) toolAnswered(stdout, options)
}

function syntheticHost(options: HostOptions = {}) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const sent: Frame[] = []
  const stop = vi.fn(async () => {
    stdin.destroy()
    stdout.destroy()
    if (options.stopNever) await new Promise<void>(() => undefined)
  })
  let pending = ''
  stdin.on('data', (bytes: Buffer) => {
    pending += bytes.toString('utf8')
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) {
      const frame = JSON.parse(line) as Frame
      sent.push(frame)
      respond(stdout, frame, options)
    }
  })
  const open = vi.fn(async (launch: CodexReadLaunch, _signal: AbortSignal): Promise<CodexReadTransport> => {
    expect(_signal.aborted).toBe(false)
    expect(launch.args).toContain('sandbox_mode="read-only"')
    return {
      stdin,
      stdout,
      isolatedCwd: '/tmp/appraise-read-synthetic/cwd',
      isolatedHome: '/tmp/appraise-read-synthetic/home',
      isolationVerified: true,
      stop,
    }
  })
  return { open, sent, stop, stdout }
}

const input = () => ({
  query: { kind: 'TEST_CASE' as const, query: 'checkout' },
  lookup: vi.fn(async () => [{ kind: 'TEST_CASE' as const, id: 'case-1', title: 'Checkout' }]),
})

describe('Codex read adapter with a synthetic JSONL host', () => {
  it('returns only locally verified Appraise rows after one matching tool call and completed turn', async () => {
    const host = syntheticHost()
    const request = input()
    const result = await runCodexRecordLookup(request, host.open)
    expect(result).toEqual({
      records: [{ kind: 'TEST_CASE', id: 'case-1', title: 'Checkout' }],
      threadId: 'thread-a',
      turnId: 'turn-a',
    })
    expect(request.lookup).toHaveBeenCalledTimes(1)
    expect(host.sent.filter(frame => frame.id === 43)).toHaveLength(1)
    expect(host.sent.find(frame => frame.id === 43)?.result).toEqual({
      contentItems: [{ type: 'inputText', text: codexLookupAcknowledgement }],
      success: true,
    })
    expect(host.stop).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['another tool', { tool: 'exec_command' }],
    ['another namespace', { namespace: 'other' }],
    ['a supplied record scope', { arguments: { kind: 'REPORT' } }],
    ['another thread', { threadId: 'thread-b' }],
    ['another turn', { turnId: 'turn-b' }],
    ['malformed arguments', { malformedToolCall: true }],
  ])('refuses %s before the local lookup', async (_label, options) => {
    const host = syntheticHost(options)
    const request = input()
    await expect(runCodexRecordLookup(request, host.open)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      threadId: 'thread-a',
      turnId: 'turn-a',
    })
    expect(request.lookup).not.toHaveBeenCalled()
    expect(host.stop).toHaveBeenCalledTimes(1)
  })

  it('keeps an interrupted completion and EOF as unknown rather than a success', async () => {
    for (const options of [{ completedStatus: 'interrupted' }, { closeAfterTurn: true }]) {
      const host = syntheticHost(options)
      await expect(runCodexRecordLookup(input(), host.open)).rejects.toBeInstanceOf(CodexReadAttemptError)
      expect(host.stop).toHaveBeenCalledTimes(1)
    }
  })

  it('refuses a second matching call after the local read', async () => {
    const host = syntheticHost({ duplicateToolCall: true })
    const request = input()
    await expect(runCodexRecordLookup(request, host.open)).rejects.toMatchObject({ outcome: 'UNKNOWN' })
    expect(request.lookup).toHaveBeenCalledTimes(1)
    expect(host.sent.filter(frame => frame.id === 44)).toHaveLength(0)
  })

  it('refuses an invalid local row even when the provider completes', async () => {
    const host = syntheticHost()
    const request = input()
    request.lookup.mockResolvedValueOnce([{ kind: 'TEST_CASE', id: 'foreign\nrecord', title: 'Injected' }])
    await expect(runCodexRecordLookup(request, host.open)).rejects.toMatchObject({ outcome: 'UNKNOWN' })
    expect(host.sent.filter(frame => frame.id === 43)).toHaveLength(0)
  })

  it('refuses local rows of a different requested kind', async () => {
    const host = syntheticHost()
    const request = input()
    request.lookup.mockResolvedValueOnce([{ kind: 'REPORT' as 'TEST_CASE', id: 'report-1', title: 'Other' }])
    await expect(runCodexRecordLookup(request, host.open)).rejects.toMatchObject({ outcome: 'UNKNOWN' })
    expect(host.sent.filter(frame => frame.id === 43)).toHaveLength(0)
  })

  it('marks an aborted issued turn as unknown and closes the synthetic host', async () => {
    const controller = new AbortController()
    const host = syntheticHost({ onTurnStart: () => controller.abort() })
    await expect(runCodexRecordLookup({ ...input(), signal: controller.signal }, host.open)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      threadId: 'thread-a',
    })
    expect(host.stop).toHaveBeenCalledTimes(1)
  })

  it('refuses a successful turn when host exit cannot be confirmed in time', async () => {
    const host = syntheticHost({ stopNever: true })
    await expect(runCodexRecordLookup(input(), host.open)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      threadId: 'thread-a',
      turnId: 'turn-a',
    })
    expect(host.stop).toHaveBeenCalledTimes(1)
  }, 5_000)
})
