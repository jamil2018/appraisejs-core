import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { ensureLocalProjectIdentity } from './project-identity.js'

async function freePort(): Promise<number> {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to allocate an HTTP MCP test port.')
  await new Promise<void>(resolve => server.close(() => resolve()))
  return address.port
}

async function waitForHealth(origin: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`HTTP MCP exited before startup with code ${child.exitCode}.`)
    try {
      const response = await fetch(`${origin}/healthz`)
      if (response.ok) return
    } catch {
      // The child has not started listening yet.
    }
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for HTTP MCP health check.')
}

type StatusResponse = { status: number; text(): Promise<string> }

async function rawPost(origin: string, headers: Record<string, string>, body: string): Promise<StatusResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(`${origin}/mcp`, { method: 'POST', headers }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.from(chunk)))
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          text: async () => Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
    request.once('error', reject)
    request.end(body)
  })
}

async function expectStatus(response: StatusResponse, expected: number, label: string): Promise<void> {
  if (response.status !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${response.status}: ${await response.text()}`)
  }
}

async function main(): Promise<void> {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-mcp-http-'))
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  let stderr = ''
  let child: ChildProcess | undefined

  try {
    await writeFile(path.join(workspace, 'package.json'), '{"name":"mcp-http-e2e","private":true}\n')
    const { identity } = await ensureLocalProjectIdentity(workspace)
    child = spawn(
      'node',
      [
        path.resolve('dist/cli.js'),
        'mcp-http',
        '--cwd',
        workspace,
        '--base-url',
        'http://127.0.0.1:3000',
        '--port',
        String(port),
        '--body-limit-bytes',
        '512',
        '--max-concurrency',
        '1',
      ],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
    )
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.once('error', error => {
      stderr += String(error)
    })
    await waitForHealth(origin, child)

    const validHeaders = {
      Authorization: `Bearer ${identity.token}`,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    }
    const initializeBody = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'security-e2e', version: '1' } },
    })

    await expectStatus(
      await fetch(`${origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
      401,
      'missing bearer',
    )
    await expectStatus(
      await rawPost(origin, { ...validHeaders, Host: `127.0.0.1.attacker.test:${port}` }, initializeBody),
      403,
      'invalid Host',
    )
    await expectStatus(
      await fetch(`${origin}/mcp`, {
        method: 'POST',
        headers: { ...validHeaders, Origin: 'https://attacker.test' },
        body: initializeBody,
      }),
      403,
      'invalid Origin',
    )
    await expectStatus(
      await fetch(`${origin}/mcp`, { method: 'POST', headers: validHeaders, body: 'x'.repeat(513) }),
      413,
      'oversized body',
    )

    const blockedRequest = http.request(`${origin}/mcp`, {
      method: 'POST',
      headers: { ...validHeaders, 'Content-Length': '100' },
    })
    blockedRequest.on('error', () => undefined)
    blockedRequest.write('{')
    await once(blockedRequest, 'socket')
    await new Promise(resolve => setTimeout(resolve, 25))
    await expectStatus(
      await fetch(`${origin}/mcp`, { method: 'POST', headers: validHeaders, body: initializeBody }),
      429,
      'concurrency limit',
    )
    blockedRequest.destroy()

    await expectStatus(
      await fetch(`${origin}/mcp`, { method: 'POST', headers: validHeaders, body: initializeBody }),
      200,
      'authenticated initialize',
    )

    if (stderr.includes(identity.token)) throw new Error('HTTP MCP wrote its bearer token to normal logs.')
    console.log(JSON.stringify({ ok: true, cases: 6 }))
  } finally {
    child?.kill('SIGTERM')
    if (child && child.exitCode === null)
      await Promise.race([once(child, 'exit'), new Promise(r => setTimeout(r, 2000))])
    await rm(workspace, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
