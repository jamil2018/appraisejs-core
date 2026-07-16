import { describe, expect, it } from 'vitest'
import { networkInterfaces } from 'node:os'
import net from 'node:net'

import { assertLoopbackHost, resolveLocalNextArgs } from './local-startup.mjs'

describe('local-only startup', () => {
  it('adds an explicit loopback bind to development and production startup', () => {
    expect(resolveLocalNextArgs('dev', ['-p', '3001'], {})).toEqual(['dev', '-H', '127.0.0.1', '-p', '3001'])
    expect(resolveLocalNextArgs('start', [], {})).toEqual(['start', '-H', '127.0.0.1'])
  })

  it.each(['0.0.0.0', '192.168.1.20', 'example.test'])('rejects a non-loopback host %s', host => {
    expect(() => assertLoopbackHost(host)).toThrow('Appraise 0.5 is local-only')
    expect(() => resolveLocalNextArgs('dev', ['--hostname', host], {})).toThrow('Remote exposure is unsupported')
  })

  it('rejects a non-loopback HOST environment override', () => {
    expect(() => resolveLocalNextArgs('start', [], { HOST: '0.0.0.0' })).toThrow('HOST must be 127.0.0.1')
  })

  it('does not expose a loopback-bound socket through a non-loopback interface', async () => {
    const nonLoopbackAddress = Object.values(networkInterfaces())
      .flatMap(value => value ?? [])
      .find(address => address.family === 'IPv4' && !address.internal)?.address
    if (!nonLoopbackAddress) return

    const server = net.createServer(socket => socket.end())
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test port.')

    try {
      await expect(
        new Promise<void>((resolve, reject) => {
          const socket = net.connect(address.port, nonLoopbackAddress, resolve)
          socket.once('error', reject)
        }),
      ).rejects.toBeDefined()
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
