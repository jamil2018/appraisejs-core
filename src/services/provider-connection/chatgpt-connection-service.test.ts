import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createChatGptConnection } from './chatgpt-connection-service'
import { createChatGptCredentialStore } from './chatgpt-credential-store'
import type { ProviderSecretVault } from './provider-secret-vault'

const secrets = new Map<string, Buffer>()
const fixtureVault: ProviderSecretVault = {
  async read(id) {
    const secret = secrets.get(id)
    return secret && Buffer.from(secret)
  },
  async create(id, secret) {
    if (secrets.has(id)) throw new Error('existing key')
    secrets.set(id, Buffer.from(secret))
  },
  async remove(id) {
    secrets.delete(id)
  },
}

function createFixtureStore(directory: string, vault: ProviderSecretVault = fixtureVault) {
  return createChatGptCredentialStore(directory, vault)
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'synthetic', alg: 'RS256', use: 'sig' }] }

function signedIdToken(nonce: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'RS256', kid: 'synthetic' })
  const iat = Math.floor(Date.now() / 1000)
  const payload = encode({
    iss: 'https://auth.openai.com',
    aud: 'oaiapp_synthetic',
    iat,
    exp: iat + 3600,
    nonce,
    sub: 'synthetic-subject',
  })
  const body = `${header}.${payload}`
  return `${body}.${sign('sha256', Buffer.from(body), privateKey).toString('base64url')}`
}

async function setup() {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'appraise-oauth-test-'))
  const store = createFixtureStore(directory)
  const fetchProvider = vi.fn<typeof fetch>()
  const connection = createChatGptConnection(store, fetchProvider)
  const dispose = async () => {
    await connection.cancel()
    await rm(directory, { recursive: true, force: true })
  }
  return { directory, store, connection, fetchProvider, dispose }
}

function callbackFrom(authorization: { state: string } | { state: 'awaiting-consent'; authorizationUrl: string }) {
  if (!('authorizationUrl' in authorization)) throw new Error('expected pending local authorization')
  const parameters = new URL(authorization.authorizationUrl).searchParams
  const callback = new URL(parameters.get('redirect_uri')!)
  callback.searchParams.set('state', parameters.get('state')!)
  return { parameters, callback }
}

function authorize(callback: URL) {
  callback.searchParams.set('code', 'synthetic-code')
  callback.searchParams.set('client_id', 'oaiapp_synthetic')
  return fetch(callback)
}

describe.skipIf(process.platform === 'win32')('ChatGPT loopback sign-in', () => {
  it('rejects unrelated callbacks and saves the verified account once, across service restarts', async () => {
    const { connection, fetchProvider, directory, dispose } = await setup()
    try {
      const first = await connection.start()
      expect(await connection.start()).toEqual(first)
      const { parameters, callback } = callbackFrom(first)
      callback.searchParams.set('code', 'synthetic-code')
      callback.searchParams.set('client_id', 'oaiapp_synthetic')
      const invalid = new URL(callback)
      invalid.searchParams.set('state', 'unrelated')
      expect((await fetch(invalid)).status).toBe(400)
      expect(fetchProvider).not.toHaveBeenCalled()

      fetchProvider
        .mockResolvedValueOnce(
          Response.json({
            id_token: signedIdToken(parameters.get('nonce')!),
            access_token: 'synthetic-access',
            refresh_token: 'synthetic-refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid offline_access resource.invoke chatgpt.tokens.use.direct',
          }),
        )
        .mockResolvedValueOnce(Response.json(jwks))
      expect((await authorize(callback)).status).toBe(200)
      await vi.waitFor(async () => expect(await connection.status()).toEqual({ state: 'connected' }))
      expect(fetchProvider).toHaveBeenCalledTimes(2)
      expect(fetchProvider.mock.calls[0][0]).toBe('https://auth.openai.com/api/accounts/oauth/token')
      expect(fetchProvider.mock.calls[0][1]?.body).toContain('code=synthetic-code')
      expect(fetchProvider.mock.calls[1][0]).toBe('https://auth.openai.com/.well-known/jwks.json')

      const restarted = createChatGptConnection(createFixtureStore(directory), fetchProvider)
      expect(await restarted.status()).toEqual({ state: 'connected' })
      expect(await restarted.disconnect()).toEqual({ state: 'disconnected' })
      expect(await connection.status()).toEqual({ state: 'disconnected' })
      const [saved] = await restarted.profiles()
      expect(saved.selected).toBe(false)
      expect(JSON.stringify(saved)).not.toContain('oaiapp_synthetic')
      const reauthorization = callbackFrom(await restarted.start(saved.key))
      expect(reauthorization.parameters.get('client_id')).toBe('oaiapp_synthetic')
      await restarted.cancel()
    } finally {
      await dispose()
    }
  })

  it('allows cancellation and reports provider denial without exchanging a code', async () => {
    const { connection, fetchProvider, dispose } = await setup()
    try {
      const first = await connection.start()
      expect(await connection.cancel()).toEqual({ state: 'disconnected' })
      const second = await connection.start()
      expect(second).not.toEqual(first)
      const { callback } = callbackFrom(second)
      callback.searchParams.set('error', 'access_denied')
      expect((await fetch(callback)).status).toBe(200)
      expect(await connection.status()).toEqual({ state: 'denied' })
      expect(fetchProvider).not.toHaveBeenCalled()
    } finally {
      await dispose()
    }
  })

  it('restarts an invalid grant with fresh proof and the newly issued client ID', async () => {
    const { connection, fetchProvider, dispose } = await setup()
    try {
      const first = callbackFrom(await connection.start())
      fetchProvider.mockResolvedValueOnce(Response.json({ error: 'invalid_grant' }, { status: 400 }))
      await authorize(first.callback)
      await vi.waitFor(async () => expect(await connection.status()).toEqual({ state: 'failed' }))

      const second = callbackFrom(await connection.start())
      expect(second.parameters.get('client_id')).toBe('oaiapp_synthetic')
      expect(second.parameters.get('state')).not.toBe(first.parameters.get('state'))
      expect(second.parameters.get('code_challenge')).not.toBe(first.parameters.get('code_challenge'))
      expect(fetchProvider).toHaveBeenCalledTimes(1)
    } finally {
      await dispose()
    }
  })

  it('requests consent again for a verified account without plan permission', async () => {
    const { connection, fetchProvider, dispose } = await setup()
    try {
      const { parameters, callback } = callbackFrom(await connection.start())
      fetchProvider
        .mockResolvedValueOnce(
          Response.json({
            id_token: signedIdToken(parameters.get('nonce')!),
            access_token: 'synthetic-access',
            refresh_token: 'synthetic-refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid offline_access',
          }),
        )
        .mockResolvedValueOnce(Response.json(jwks))
      await authorize(callback)
      await vi.waitFor(async () => expect(await connection.status()).toEqual({ state: 'plan-permission-required' }))
      const retry = callbackFrom(await connection.start())
      expect(retry.parameters.get('client_id')).toBe('oaiapp_synthetic')
      expect(retry.parameters.get('prompt')).toBe('consent')
    } finally {
      await dispose()
    }
  })
})
