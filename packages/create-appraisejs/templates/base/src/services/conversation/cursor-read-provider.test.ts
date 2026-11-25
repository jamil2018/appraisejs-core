import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import type { CursorCli } from '@/services/provider-connection/cursor-cli'
import { createCursorConnection } from '@/services/provider-connection/cursor-connection-service'

import { createCursorReadProvider } from './cursor-read-provider'

type Packet = {
  id?: number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
}
type SessionBehavior = {
  permissionRequest?: boolean
  outcome?: string
  omitAsk?: boolean
  wrongSession?: boolean
  loginExitCode?: number
}

function protocolFixture(behavior: SessionBehavior) {
  const stdin = new PassThrough()
  const stdout = new PassThrough()
  const packets: Packet[] = []
  const child = Object.assign(new EventEmitter(), { stdin, stdout }) as unknown as ChildProcessWithoutNullStreams
  const send = (packet: Packet) => stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...packet })}\n`)
  stdin.on('data', (chunk: Buffer) => {
    const request: Packet = JSON.parse(chunk.toString())
    packets.push(request)
    const response = (result: unknown) => send({ id: request.id, result })
    switch (request.method) {
      case 'initialize':
        response({ protocolVersion: 1 })
        break
      case 'session/new':
        response({
          sessionId: 'fixture-session',
          modes: { currentModeId: 'agent', availableModes: behavior.omitAsk ? [{ id: 'agent' }] : [{ id: 'ask' }] },
        })
        break
      case 'session/set_mode':
        response({})
        break
      case 'session/prompt':
        if (behavior.permissionRequest) send({ id: 999, method: 'session/request_permission' })
        send({
          method: 'session/update',
          params: {
            sessionId: behavior.wrongSession ? 'different-session' : 'fixture-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '{"action":"workspace_record_search"}' },
            },
          },
        })
        response({ stopReason: behavior.outcome ?? 'end_turn' })
        break
    }
  })
  return { child, packets }
}

function createFixture(behavior: SessionBehavior = {}) {
  const providerSession = protocolFixture(behavior)
  const originalAccount = { userId: 101, email: 'first@example.com' }
  let account: typeof originalAccount | undefined = originalAccount
  const auth: CursorCli['auth'] = vi.fn(async command => {
    if (command === 'logout') account = undefined
    if (command === 'login') account = originalAccount
    return {
      exitCode: command === 'login' ? (behavior.loginExitCode ?? 0) : 0,
      output: JSON.stringify({
        status: account ? 'authenticated' : 'unauthenticated',
        isAuthenticated: Boolean(account),
        hasAccessToken: Boolean(account),
        hasRefreshToken: Boolean(account),
        ...(account ? { userInfo: account } : {}),
      }),
    }
  })
  const cli: CursorCli = {
    auth,
    lookup: interact => interact(providerSession.child, '/private/tmp/appraise-cursor-fixture'),
  }
  return {
    ...providerSession,
    connection: createCursorConnection(async () => cli),
    changeAccount(userId: number) {
      account = { ...originalAccount, userId }
    },
  }
}

const query = { kind: 'TEST_CASE' as const, query: 'Guest checkout' }
const signal = new AbortController().signal

describe('Cursor subscription lookup', () => {
  it('binds the account and runs one Ask session before performing the local lookup', async () => {
    const fixture = createFixture()
    expect(await fixture.connection.status()).toEqual({ state: 'connected' })
    const provider = await createCursorReadProvider(fixture.connection.bindLookup)
    const lookup = vi.fn(async () => [])
    await expect(provider({ query, lookup, signal })).resolves.toBe('completed')
    expect(lookup).toHaveBeenCalledOnce()
    expect(fixture.packets.map(packet => packet.method)).toEqual([
      'initialize',
      'session/new',
      'session/set_mode',
      'session/prompt',
    ])
    expect(fixture.packets[0].params?.clientCapabilities).toEqual({})
    expect(fixture.packets[1].params?.mcpServers).toEqual([])
    expect(fixture.packets[2].params).toEqual({ sessionId: 'fixture-session', modeId: 'ask' })
    expect(JSON.stringify(fixture.packets[3].params?.prompt)).not.toContain(query.query)
  })

  it('denies permission requests and rejects a terminal reply from that turn', async () => {
    const fixture = createFixture({ permissionRequest: true })
    const provider = await createCursorReadProvider(fixture.connection.bindLookup)
    const lookup = vi.fn()
    await expect(provider({ query, lookup, signal })).resolves.toBe('failed')
    expect(fixture.packets).toContainEqual({
      jsonrpc: '2.0',
      id: 999,
      result: { outcome: { outcome: 'cancelled' } },
    })
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each([{ omitAsk: true }, { outcome: 'cancelled' }])(
    'does not perform a lookup without a completed Ask turn (%j)',
    async behavior => {
      const fixture = createFixture(behavior)
      const provider = await createCursorReadProvider(fixture.connection.bindLookup)
      const lookup = vi.fn()
      await expect(provider({ query, lookup, signal })).resolves.toBe('failed')
      expect(lookup).not.toHaveBeenCalled()
    },
  )

  it('rejects an update for a different session without attempting a local lookup', async () => {
    const fixture = createFixture({ wrongSession: true })
    const provider = await createCursorReadProvider(fixture.connection.bindLookup)
    const lookup = vi.fn()
    await expect(provider({ query, lookup, signal })).rejects.toThrow('different session')
    expect(lookup).not.toHaveBeenCalled()
  })

  it('detects an account change by numeric ID even when the email stays the same', async () => {
    const fixture = createFixture()
    const provider = await createCursorReadProvider(fixture.connection.bindLookup)
    fixture.changeAccount(102)
    const lookup = vi.fn()
    await expect(provider({ query, lookup, signal })).resolves.toBe('failed')
    expect(fixture.packets).toHaveLength(0)
    expect(lookup).not.toHaveBeenCalled()
    expect(await fixture.connection.signOut()).toEqual({ state: 'disconnected' })
    await expect(createCursorReadProvider(fixture.connection.bindLookup)).rejects.toThrow('Connect Cursor in Settings')
    expect(await fixture.connection.signIn()).toEqual({ state: 'authorizing' })
    await vi.waitFor(async () => expect(await fixture.connection.status()).toEqual({ state: 'connected' }))
  })

  it('recovers an authenticated account after the login command reports failure', async () => {
    const fixture = createFixture({ loginExitCode: 1 })
    expect(await fixture.connection.signOut()).toEqual({ state: 'disconnected' })
    expect(await fixture.connection.signIn()).toEqual({ state: 'authorizing' })
    await vi.waitFor(async () => expect(await fixture.connection.status()).toEqual({ state: 'connected' }))
  })
})
