import { describe, expect, it, vi } from 'vitest'

import { type ClaudeCodeCli, type ClaudeCodeReply } from './claude-code-cli'
import { createClaudeCodeConnection } from './claude-code-connection-service'

function statusReply(email?: string) {
  return {
    exitCode: email ? 0 : 1,
    output: JSON.stringify({
      loggedIn: Boolean(email),
      email,
      authMethod: email ? 'claude.ai' : 'none',
      apiProvider: 'firstParty',
      subscriptionType: email ? 'pro' : null,
    }),
  }
}

describe('Claude Code connection', () => {
  it('lets the CLI own sign-in, restart recovery and sign-out', async () => {
    let email: string | undefined
    const login = Promise.withResolvers<ClaudeCodeReply>()
    const run = vi.fn<ClaudeCodeCli['run']>().mockImplementation(async command => {
      if (command === 'login') return login.promise
      if (command === 'status') return statusReply(email)
      email = undefined
      return { exitCode: 0, output: '' }
    })
    const resolveCli = async () => ({ run })
    const connection = createClaudeCodeConnection(resolveCli)

    expect(await connection.status()).toEqual({ state: 'disconnected' })
    expect(await connection.signIn()).toEqual({ state: 'authorizing' })
    expect(await connection.signIn()).toEqual({ state: 'authorizing' })
    expect(run.mock.calls.filter(([command]) => command === 'login')).toHaveLength(1)
    expect(await connection.status()).toEqual({ state: 'authorizing' })

    email = 'fixture@example.test'
    login.resolve({ exitCode: 0, output: 'private CLI output' })
    await vi.waitFor(async () => expect(await connection.status()).toEqual({ state: 'connected' }))
    const restarted = createClaudeCodeConnection(resolveCli)
    expect(await restarted.status()).toEqual({ state: 'connected' })
    expect(await restarted.signOut()).toEqual({ state: 'disconnected' })
  })

  it('rejects a lookup when the CLI account or sign-in revision changed', async () => {
    let email = 'fixture@example.test'
    const connection = createClaudeCodeConnection(async () => ({
      run: async command => (command === 'status' ? statusReply(email) : { exitCode: 0, output: '' }),
    }))
    const lookup = vi.fn()
    const bound = await connection.bindLookup()
    email = 'other@example.test'
    expect(await bound(lookup, new AbortController().signal)).toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()

    const otherBound = await connection.bindLookup()
    email = ''
    expect(await connection.signOut()).toEqual({ state: 'disconnected' })
    email = 'other@example.test'
    expect(await otherBound(lookup, new AbortController().signal)).toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('reports failed and unavailable status without returning raw CLI output', async () => {
    const unavailable = createClaudeCodeConnection(async () => undefined)
    expect(await unavailable.signIn()).toMatchObject({ state: 'unavailable' })

    const connection = createClaudeCodeConnection(async () => ({
      run: async () => ({ exitCode: 1, output: 'private failure details' }),
    }))
    expect(await connection.signIn()).toEqual({ state: 'authorizing' })
    await vi.waitFor(async () =>
      expect(await connection.status()).toEqual({
        state: 'failed',
        message: 'Claude Code could not complete sign-in.',
      }),
    )
  })

  it.each([
    { authMethod: 'api_key', apiProvider: 'firstParty', subscriptionType: null },
    { authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: null },
    { authMethod: 'claude.ai', apiProvider: 'bedrock', subscriptionType: 'pro' },
    { authMethod: 'claude.ai', apiProvider: 'firstParty', subscriptionType: 'api' },
  ])('keeps an unverified subscription from starting a lookup', async auth => {
    const run = vi.fn<ClaudeCodeCli['run']>().mockResolvedValue({
      exitCode: 0,
      output: JSON.stringify({ loggedIn: true, ...auth }),
    })
    const connection = createClaudeCodeConnection(async () => ({ run }))
    expect(await connection.status()).toMatchObject({ state: 'failed' })
    await expect(connection.bindLookup()).rejects.toThrow('Connect Claude Code')
    expect(run.mock.calls.every(([command]) => command === 'status')).toBe(true)
  })
})
