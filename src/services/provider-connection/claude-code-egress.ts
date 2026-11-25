import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

const host = '127.0.0.1'
const destinations = new Set(['api.anthropic.com', 'platform.claude.com'])

export async function openClaudeCodeLookupEgress() {
  const password = randomBytes(24).toString('hex')
  const authorization = `Basic ${Buffer.from(`appraise:${password}`).toString('base64')}`
  const connections = new Set<Duplex>()
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 5000, requestTimeout: 5000 }, (_, response) => {
    response.writeHead(405, { Connection: 'close' }).end()
  })
  server.maxConnections = 8
  server.on('connection', connection => {
    connections.add(connection)
    connection.once('close', () => connections.delete(connection))
  })
  server.on('connect', (request, client, buffered) => {
    client.on('error', () => client.destroy())
    const target = request.url?.replace(/:443$/, '')
    if (!target || !destinations.has(target) || request.url !== `${target}:443`) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      return
    }
    if (request.headers['proxy-authorization'] !== authorization) {
      client.end('HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n')
      return
    }

    const upstream = connect(443, target)
    connections.add(upstream)
    upstream.once('close', () => connections.delete(upstream))
    upstream.on('error', () => client.destroy())
    upstream.setTimeout(40_000, () => upstream.destroy())
    client.once('close', () => upstream.destroy())
    upstream.once('close', () => client.destroy())
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (buffered.length > 0) upstream.write(buffered)
      client.pipe(upstream).pipe(client)
    })
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (address && typeof address !== 'string') resolve(address.port)
      else reject(new Error('Claude Code egress could not bind its local socket.'))
    })
  })
  return {
    port,
    proxy: `http://appraise:${password}@${host}:${port}`,
    close() {
      for (const connection of connections) connection.destroy()
      server.close()
    },
  }
}
