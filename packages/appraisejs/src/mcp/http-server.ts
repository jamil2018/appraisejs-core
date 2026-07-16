import http from 'node:http'

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import type { CoordinatorOptions } from '../coordinator-client.js'
import { formatMcpBootstrapError } from '../diagnostics.js'
import {
  assertLoopbackMcpHost,
  DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES,
  DEFAULT_HTTP_MCP_MAX_CONCURRENCY,
  HttpMcpRequestError,
  readBoundedJsonBody,
  validateHttpMcpLocality,
  validateHttpMcpRequest,
} from '../mcp-http-security.js'
import { ensureLocalProjectIdentity } from '../project-identity.js'
import { createAppraiseMcpServer } from './server-factory.js'

export type AppraiseHttpMcpOptions = CoordinatorOptions & {
  host: string
  port: number
  path: string
  bodyLimitBytes?: number
  maxConcurrency?: number
}

function jsonRpcError(res: http.ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { Allow: 'POST', 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

export async function runAppraiseHttpMcp(options: AppraiseHttpMcpOptions): Promise<void> {
  assertLoopbackMcpHost(options.host)
  const { identity } = await ensureLocalProjectIdentity(options.cwd)
  const endpointOrigin = `http://${options.host}:${options.port}`
  const allowedOrigins = new Set([endpointOrigin, new URL(options.baseUrl).origin])
  const bodyLimit = options.bodyLimitBytes ?? DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_HTTP_MCP_MAX_CONCURRENCY
  let activeRequests = 0

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', endpointOrigin)
    try {
      validateHttpMcpLocality({
        host: req.headers.host,
        port: options.port,
        origin: req.headers.origin,
        allowedOrigins,
        remoteAddress: req.socket.remoteAddress,
      })
    } catch (error) {
      const requestError = error as HttpMcpRequestError
      jsonRpcError(res, requestError.status ?? 403, requestError.code ?? -32001, requestError.message)
      return
    }

    if (requestUrl.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, transport: 'streamable-http', path: options.path }))
      return
    }
    if (requestUrl.pathname !== options.path) {
      jsonRpcError(res, 404, -32000, 'Not found.')
      return
    }
    if (req.method !== 'POST') {
      jsonRpcError(res, 405, -32000, 'Method not allowed.')
      return
    }

    try {
      validateHttpMcpRequest({
        authorization: req.headers.authorization,
        expectedToken: identity.token,
        host: req.headers.host,
        port: options.port,
        origin: req.headers.origin,
        allowedOrigins,
        remoteAddress: req.socket.remoteAddress,
      })
    } catch (error) {
      const requestError = error as HttpMcpRequestError
      jsonRpcError(res, requestError.status ?? 403, requestError.code ?? -32001, requestError.message)
      return
    }

    if (activeRequests >= maxConcurrency) {
      res.setHeader('Retry-After', '1')
      jsonRpcError(res, 429, -32003, 'HTTP MCP concurrency limit reached; retry later.')
      return
    }
    activeRequests += 1
    let mcpServer: McpServer | undefined
    let transport: StreamableHTTPServerTransport | undefined

    try {
      const parsedBody = await readBoundedJsonBody(req, bodyLimit)
      mcpServer = await createAppraiseMcpServer(options)
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res, parsedBody)
    } catch (error) {
      if (error instanceof HttpMcpRequestError) {
        if (!res.headersSent) jsonRpcError(res, error.status, error.code, error.message)
      } else {
        console.error(formatMcpBootstrapError(error))
        if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error.')
      }
    } finally {
      activeRequests -= 1
      await transport?.close().catch(() => undefined)
      await mcpServer?.close().catch(() => undefined)
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  console.error(`AppraiseJS MCP HTTP server listening at http://${options.host}:${options.port}${options.path}`)
  await new Promise<void>(resolve => {
    const shutdown = () => server.close(() => resolve())
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}
