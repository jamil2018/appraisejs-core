import { createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { homedir, platform } from 'node:os'
import path from 'node:path'

import {
  consumeChatGptSignInCallback,
  createChatGptSignInAttempt,
  type ChatGptSignInAttempt,
  type ChatGptSignInCallbackResult,
} from '@/lib/conversation/chatgpt-sign-in'

import { createChatGptCredentialStore } from './chatgpt-credential-store'
import { chatGptConnectionStatus, validateChatGptTokenResponse } from './chatgpt-identity'

const CALLBACK_LIFETIME = 5 * 60_000
const JWKS_URL = 'https://auth.openai.com/.well-known/jwks.json'
const MAX_RESPONSE_BYTES = 96 * 1024
const ISSUED_CLIENT_ID = /^oaiapp_[A-Za-z0-9_-]{1,240}$/

type AccountStatus = ReturnType<typeof chatGptConnectionStatus>
export type ChatGptSettingsStatus =
  | AccountStatus
  | { state: 'awaiting-consent'; authorizationUrl: string }
  | { state: 'starting' | 'verifying' | 'denied' | 'timed-out' | 'failed' | 'unavailable' }

export type ChatGptProfile = { key: string; label: string; selected: boolean }

type Registration = Awaited<ReturnType<ReturnType<typeof createChatGptCredentialStore>['listRegistrations']>>[number]

function registrationKey({ clientId, subject }: Registration) {
  return createHash('sha256')
    .update(JSON.stringify([clientId, subject]))
    .digest('hex')
}

type Pending = {
  attempt: ChatGptSignInAttempt
  subject?: string
  close: () => void
}

class InvalidAuthorizationGrant extends Error {}

function sendCallbackResponse(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(message)
}

function checkCallback(request: IncomingMessage, attempt: ChatGptSignInAttempt) {
  const expected = new URL(attempt.redirectUri)
  if (
    request.method !== 'GET' ||
    request.headers.host !== expected.host ||
    request.socket.remoteAddress !== '127.0.0.1' ||
    !request.url?.startsWith('/auth/callback?')
  ) {
    throw new Error('Invalid loopback request.')
  }
  return consumeChatGptSignInCallback(attempt, new URL(request.url, expected.origin).href)
}

async function providerJson(request: Promise<Response>, exchange = false): Promise<unknown> {
  const response = await request
  if (!response.body) throw new Error('ChatGPT authorization request failed.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new Error('ChatGPT authorization response exceeded the limit.')
      chunks.push(value)
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (response.ok) return value
    if (exchange && response.status === 400 && invalidGrant(value)) throw new InvalidAuthorizationGrant()
    throw new Error('ChatGPT authorization request failed.')
  } finally {
    await reader.cancel()
  }
}

function invalidGrant(value: unknown) {
  return !!value && typeof value === 'object' && 'error' in value && value.error === 'invalid_grant'
}

export function createChatGptConnection(
  store: ReturnType<typeof createChatGptCredentialStore>,
  fetchProvider: typeof fetch = fetch,
) {
  let pending: Pending | undefined
  let operation: 'starting' | 'verifying' | 'disconnecting' | undefined
  let outcome: 'denied' | 'timed-out' | 'failed' | undefined
  let retryClient: { clientId: string; until: number } | undefined

  async function profiles(): Promise<ChatGptProfile[]> {
    try {
      const [registrations, selected] = await Promise.all([store.listRegistrations(), store.readSelected()])
      return registrations.map(registration => {
        const key = registrationKey(registration)
        return {
          key,
          label: `${registration.email ?? 'Saved account'} · ${key.slice(0, 10).toUpperCase()}`,
          selected: registration.clientId === selected?.client_id && registration.subject === selected.subject,
        }
      })
    } catch {
      return []
    }
  }

  async function status(): Promise<ChatGptSettingsStatus> {
    if (operation) return { state: operation === 'disconnecting' ? 'verifying' : operation }
    if (pending) return { state: 'awaiting-consent', authorizationUrl: pending.attempt.authorizationUrl }
    if (outcome) return { state: outcome }
    try {
      return chatGptConnectionStatus(await store.readSelected())
    } catch {
      return { state: 'unavailable' }
    }
  }

  async function lookupCredentials() {
    if (operation || pending) return undefined
    const selected = await store.readSelected()
    if (operation || pending) return undefined
    return chatGptConnectionStatus(selected).state === 'connected' ? selected : undefined
  }

  async function exchange(
    { attempt, subject }: Pending,
    callback: Extract<ChatGptSignInCallbackResult, { status: 'authorized' }>,
  ) {
    const init = { redirect: 'error' as const, signal: AbortSignal.timeout(15_000) }
    const { url, ...request } = callback.exchange
    const tokenResponse = await providerJson(fetchProvider(url, { ...request, ...init }), true)
    const jwks = await providerJson(fetchProvider(JWKS_URL, init))
    await store.write(
      validateChatGptTokenResponse(tokenResponse, {
        clientId: callback.clientId,
        hostId: attempt.client.hostId,
        nonce: attempt.nonce,
        expectedSubject: subject,
        jwks,
      }),
    )
  }

  async function handleCallback(request: IncomingMessage, response: ServerResponse, listener: Pending) {
    let callback: ChatGptSignInCallbackResult
    try {
      if (pending !== listener) throw new Error('ChatGPT sign-in attempt has expired.')
      callback = checkCallback(request, listener.attempt)
      if (callback.status === 'authorized' && !ISSUED_CLIENT_ID.test(callback.clientId)) {
        throw new Error('Invalid ChatGPT client registration.')
      }
    } catch {
      sendCallbackResponse(response, 400, 'This callback does not match an active Appraise sign-in.')
      return
    }
    pending = undefined
    listener.close()
    if (callback.status !== 'authorized') {
      outcome = callback.status === 'denied' ? 'denied' : 'failed'
      sendCallbackResponse(response, 200, 'Sign-in did not finish. Return to Appraise Settings to try again.')
      return
    }
    operation = 'verifying'
    sendCallbackResponse(response, 200, 'Return to Appraise Settings to check your ChatGPT connection.')
    try {
      await exchange(listener, callback)
      retryClient = undefined
    } catch (error) {
      if (error instanceof InvalidAuthorizationGrant && !listener.subject) {
        retryClient = { clientId: callback.clientId, until: Date.now() + CALLBACK_LIFETIME }
      }
      outcome = 'failed'
    } finally {
      operation = undefined
    }
  }

  async function listen(client: ChatGptSignInAttempt['client'], subject?: string) {
    let listener: Pending | undefined
    const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, (request, response) => {
      if (listener) void handleCallback(request, response, listener)
      else sendCallbackResponse(response, 400, 'This sign-in attempt is unavailable.')
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    server.on('error', () => {
      if (pending === listener) {
        pending = undefined
        listener?.close()
        outcome = 'failed'
      }
    })
    server.unref()
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('The callback address is unavailable.')
      const attempt = createChatGptSignInAttempt({
        client,
        callbackPort: address.port,
        entropy: { verifier: randomBytes(32), state: randomBytes(32), nonce: randomBytes(32) },
      })
      const timer = setTimeout(() => {
        if (pending !== listener) return
        pending = undefined
        listener?.close()
        outcome = 'timed-out'
      }, CALLBACK_LIFETIME).unref()
      listener = {
        attempt,
        subject,
        close() {
          clearTimeout(timer)
          server.close()
        },
      }
      pending = listener
    } catch (error) {
      server.close()
      throw error
    }
  }

  async function accountFor(selection: string | undefined) {
    if (selection === 'new') return undefined
    if (!selection) {
      const previous = await store.readSelected()
      return (
        previous && {
          clientId: previous.client_id,
          subject: previous.subject,
          requestConsent: chatGptConnectionStatus(previous).state === 'plan-permission-required',
        }
      )
    }
    const registration = (await store.listRegistrations()).find(value => registrationKey(value) === selection)
    if (!registration) throw new Error('The saved ChatGPT registration is unavailable.')
    const previous = await store.read(registration.clientId, registration.subject)
    return {
      ...registration,
      requestConsent: chatGptConnectionStatus(previous).state === 'plan-permission-required',
    }
  }

  return {
    status,
    profiles,
    async readLookupProfile() {
      const selected = await lookupCredentials().catch(() => undefined)
      return (
        selected && {
          key: registrationKey({ clientId: selected.client_id, subject: selected.subject }),
          account: selected.email,
        }
      )
    },
    async readLookupAccessToken(profileKey: string) {
      const selected = await lookupCredentials()
      if (selected && registrationKey({ clientId: selected.client_id, subject: selected.subject }) === profileKey) {
        return selected.access_token
      }
    },
    async start(selection?: string): Promise<ChatGptSettingsStatus> {
      if (operation || pending) return status()
      operation = 'starting'
      outcome = undefined
      try {
        const account = await accountFor(selection)
        const hostId = await store.getOrCreateHostId()
        const retry = !selection && retryClient && Date.now() <= retryClient.until ? retryClient.clientId : undefined
        retryClient = undefined
        const clientId = retry ?? account?.clientId
        const client: ChatGptSignInAttempt['client'] = clientId
          ? { kind: 'returning', hostId, clientId, requestConsent: !retry && account?.requestConsent }
          : { kind: 'initial', hostId, agentName: 'AppraiseJS' }
        await listen(client, retry ? undefined : account?.subject)
      } catch {
        outcome = 'failed'
      } finally {
        operation = undefined
      }
      return status()
    },
    async cancel() {
      pending?.close()
      pending = undefined
      retryClient = undefined
      outcome = undefined
      return status()
    },
    async disconnect(): Promise<ChatGptSettingsStatus> {
      if (operation || pending) return status()
      operation = 'disconnecting'
      outcome = undefined
      retryClient = undefined
      try {
        const selected = await store.readSelected()
        if (selected) await store.disconnect(selected.client_id, selected.subject)
      } catch {
        outcome = 'failed'
      } finally {
        operation = undefined
      }
      return status()
    },
  }
}

const host = globalThis as typeof globalThis & {
  appraiseChatGptConnection?: ReturnType<typeof createChatGptConnection>
}

export const chatGptConnection = (host.appraiseChatGptConnection ??= createChatGptConnection(
  createChatGptCredentialStore(path.join(homedir(), '.appraisejs-chatgpt')),
))

export function isChatGptConnectionSupported() {
  return platform() === 'darwin' || platform() === 'linux'
}
