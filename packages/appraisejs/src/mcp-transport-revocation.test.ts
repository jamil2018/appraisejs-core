import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, it } from 'vitest'

import { ensureLocalProjectIdentity } from './project-identity.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliSource = path.join(packageRoot, 'src', 'cli.ts')

function cliArgs(...args: string[]) {
  return ['--import', 'tsx', cliSource, ...args]
}

function localAction(cwd: string, action: 'disconnect' | 'reconnect') {
  const result = spawnSync(process.execPath, cliArgs('agent', action, '--cwd', cwd, '--json'), {
    cwd: packageRoot,
    encoding: 'utf8',
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).not.toMatch(/Bearer |"token"/)
  return JSON.parse(result.stdout) as { localAccess: string }
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return (server.address() as { port: number }).port
}

async function close(server: http.Server) {
  await new Promise<void>(resolve => server.close(() => resolve()))
}

async function waitForHealth(port: number, child: ChildProcess) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`MCP child exited with ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`)
      if (response.ok) return
    } catch {
      // The child may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  throw new Error('MCP HTTP child did not become healthy.')
}

function stdioClient(cwd: string, hubPort: number) {
  const client = new Client({ name: 'revocation-stdio-smoke', version: '1' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: cliArgs('mcp', '--cwd', cwd, '--base-url', `http://127.0.0.1:${hubPort}`),
    cwd: packageRoot,
    stderr: 'pipe',
  })
  return { client, transport }
}

function httpClient(port: number, token: string) {
  const client = new Client({ name: 'revocation-http-smoke', version: '1' })
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  return { client, transport }
}

it('revokes real stdio and HTTP MCP reads until a new credential and client are established', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-revoke-'))
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"mcp-revoke-smoke"}')
  const hub = http.createServer(async (request, response) => {
    const persisted = JSON.parse(await fs.readFile(path.join(cwd, '.appraisejs', 'coordinator.json'), 'utf8')) as {
      token: string
      disabled?: boolean
    }
    if (!persisted.token || persisted.disabled || request.headers.authorization !== `Bearer ${persisted.token}`) {
      response.writeHead(401).end()
      return
    }
    if (request.url !== '/api/internal/coordinator/target-projects') {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end('[]')
  })
  let httpChild: ChildProcess | undefined
  const clients: Client[] = []
  try {
    const hubPort = await listen(hub)
    const first = await ensureLocalProjectIdentity(cwd)
    const reservation = http.createServer()
    const mcpPort = await listen(reservation)
    await close(reservation)
    httpChild = spawn(
      process.execPath,
      cliArgs('mcp-http', '--cwd', cwd, '--base-url', `http://127.0.0.1:${hubPort}`, '--port', String(mcpPort)),
      { cwd: packageRoot, stdio: ['ignore', 'ignore', 'pipe'] },
    )
    await waitForHealth(mcpPort, httpChild)

    const stdio = stdioClient(cwd, hubPort)
    const httpAccess = httpClient(mcpPort, first.identity.token)
    clients.push(stdio.client, httpAccess.client)
    await stdio.client.connect(stdio.transport)
    await httpAccess.client.connect(httpAccess.transport)
    expect((await stdio.client.callTool({ name: 'project_list', arguments: {} })).isError).not.toBe(true)
    expect((await httpAccess.client.callTool({ name: 'project_list', arguments: {} })).isError).not.toBe(true)

    expect(localAction(cwd, 'disconnect').localAccess).toBe('disabled')
    expect((await stdio.client.callTool({ name: 'project_list', arguments: {} })).isError).toBe(true)
    await expect(httpAccess.client.callTool({ name: 'project_list', arguments: {} })).rejects.toThrow()
    expect(localAction(cwd, 'reconnect').localAccess).toBe('enabled')
    expect((await stdio.client.callTool({ name: 'project_list', arguments: {} })).isError).toBe(true)
    await expect(httpAccess.client.callTool({ name: 'project_list', arguments: {} })).rejects.toThrow()

    const rotated = await ensureLocalProjectIdentity(cwd)
    expect(rotated.identity.token).not.toBe(first.identity.token)
    const freshStdio = stdioClient(cwd, hubPort)
    const freshHttp = httpClient(mcpPort, rotated.identity.token)
    clients.push(freshStdio.client, freshHttp.client)
    await freshStdio.client.connect(freshStdio.transport)
    await freshHttp.client.connect(freshHttp.transport)
    expect((await freshStdio.client.callTool({ name: 'project_list', arguments: {} })).isError).not.toBe(true)
    expect((await freshHttp.client.callTool({ name: 'project_list', arguments: {} })).isError).not.toBe(true)
  } finally {
    await Promise.all(clients.map(client => client.close().catch(() => undefined)))
    if (httpChild && httpChild.exitCode === null) {
      httpChild.kill('SIGTERM')
      await new Promise(resolve => httpChild!.once('exit', resolve))
    }
    if (hub.listening) await close(hub)
    await fs.rm(cwd, { recursive: true, force: true })
  }
}, 30_000)
