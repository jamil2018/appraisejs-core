import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import {
  assertLoopbackMcpHost,
  assertLoopbackMcpEndpoint,
  HttpMcpRequestError,
  readBoundedJsonBody,
  validateHttpMcpRequest,
} from './mcp-http-security.js'

const valid = (overrides: Partial<Parameters<typeof validateHttpMcpRequest>[0]> = {}) => ({
  authorization: 'Bearer local-secret',
  expectedToken: 'local-secret',
  host: '127.0.0.1:3010',
  port: 3010,
  origin: undefined,
  allowedOrigins: new Set(['http://127.0.0.1:3010', 'http://127.0.0.1:3000']),
  remoteAddress: '127.0.0.1',
  ...overrides,
})

describe('HTTP MCP security policy', () => {
  it.each(['0.0.0.0', '192.168.1.5', 'example.test'])('rejects non-loopback bind host %s', host => {
    expect(() => assertLoopbackMcpHost(host)).toThrow('HTTP MCP is local-only')
  })

  it('accepts only credential-free HTTP loopback bridge endpoints', () => {
    expect(assertLoopbackMcpEndpoint('http://127.0.0.1:3010/mcp').pathname).toBe('/mcp')
    expect(assertLoopbackMcpEndpoint('http://localhost:3010/mcp').hostname).toBe('localhost')
    expect(() => assertLoopbackMcpEndpoint('https://127.0.0.1:3010/mcp')).toThrow('loopback')
    expect(() => assertLoopbackMcpEndpoint('http://example.test:3010/mcp')).toThrow('loopback')
    expect(() => assertLoopbackMcpEndpoint('http://user:secret@127.0.0.1:3010/mcp')).toThrow('credential-free')
  })

  it('authenticates before request parsing with the coordinator bearer identity', () => {
    expect(() => validateHttpMcpRequest(valid({ authorization: undefined }))).toThrow(HttpMcpRequestError)
    expect(() => validateHttpMcpRequest(valid({ authorization: 'Bearer wrong' }))).toThrow(
      'Missing or invalid MCP bearer credentials',
    )
    expect(() => validateHttpMcpRequest(valid())).not.toThrow()
  })

  it('rejects non-local peers, rebinding hosts, and disallowed origins', () => {
    expect(() => validateHttpMcpRequest(valid({ remoteAddress: '203.0.113.8' }))).toThrow('Non-loopback')
    expect(() => validateHttpMcpRequest(valid({ host: '127.0.0.1.attacker.test:3010' }))).toThrow('Host')
    expect(() => validateHttpMcpRequest(valid({ origin: 'https://attacker.test' }))).toThrow('Origin')
  })

  it('returns 413 before buffering declared oversized bodies', async () => {
    const request = Object.assign(new EventEmitter(), {
      headers: { 'content-length': '17' },
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('{"ok":true}')
      },
    })
    await expect(readBoundedJsonBody(request as never, 16)).rejects.toMatchObject({ status: 413 })
  })
})
