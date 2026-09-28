import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { discoveryAuthTransitPolicyHash } from '@/lib/quality-journey/discovery-auth-transit-policy'

export const productionScope = {
  journeyId: 'journey-1',
  targetProjectId: 'target-1',
  discoveryRevisionId: 'revision-1',
}

/** Synthetic persistence only; this fixture never qualifies human authentication. */
export function productionFixtureClient(baseUrl: string, authPolicyJson: string) {
  const artifacts = new Map<string, { identityKey: string; contentHash: string; artifactJson: string }>()
  const environmentScope = { scopeVersion: 1, discoveryAuthTransitPolicyJson: authPolicyJson }
  const frozenBinding = {
    environmentId: 'environment-1',
    targetOrigin: new URL(baseUrl).origin,
    scopeVersion: 1,
    discoveryAuthTransitPolicyJson: authPolicyJson,
    discoveryAuthTransitPolicyHash: discoveryAuthTransitPolicyHash(authPolicyJson),
  }
  return {
    artifacts,
    environmentScope,
    qualityJourney: {
      findFirst: async () => ({
        id: 'journey-1',
        activeDiscoveryRevisionId: 'revision-1',
        activeCycleId: 'cycle-1',
      }),
    },
    qualityJourneyDiscoveryRevision: {
      findFirst: async () => ({
        ...productionScope,
        id: 'revision-1',
        cycleId: 'cycle-1',
        scoutWorkItemId: 'work-1',
        scoutScopeJson: JSON.stringify({
          environmentIds: ['environment-1'],
          routes: ['/checkout'],
          environmentBindings: [frozenBinding],
        }),
      }),
    },
    environment: {
      findFirst: async () => ({
        id: 'environment-1',
        baseUrl,
        targetProjectId: 'target-1',
        ...environmentScope,
      }),
    },
    qualityJourneyArtifact: {
      findUnique: async ({ where }: { where: { journeyId_identityKey: { identityKey: string } } }) =>
        artifacts.get(where.journeyId_identityKey.identityKey) ?? null,
      create: async ({ data }: { data: { identityKey: string; contentHash: string; artifactJson: string } }) => {
        artifacts.set(data.identityKey, data)
        return data
      },
      findMany: async () => [...artifacts.values()],
    },
    qualityJourneyBlocker: { updateMany: async () => ({ count: 0 }) },
  }
}

export async function productionFixtureServers() {
  const directory = await mkdtemp(join(tmpdir(), 'appraise-c233-production-'))
  await promisify(execFile)('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(directory, 'key.pem'),
    '-out',
    join(directory, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ])
  const [key, cert] = await Promise.all([readFile(join(directory, 'key.pem')), readFile(join(directory, 'cert.pem'))])
  const hits: Array<{ path: string; method: string; body: string; cookie: string }> = []
  let upgradeCount = 0
  let html = '<h1>Checkout</h1>'
  let providerHtml = '<h1>Provider</h1>'
  let encoding: 'plain' | 'gzip' | 'chunked' = 'plain'
  let originalCsp: string | undefined
  let redirectStatus = 303
  let denySecondHop = false
  let holdResponse = false
  let held: ServerResponse | undefined
  const serveDocument = (request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      ...(encoding === 'gzip' ? { 'content-encoding': 'gzip' } : {}),
      ...(originalCsp
        ? {
            'content-security-policy': originalCsp,
            'set-cookie': ['doc-one=1; Path=/; HttpOnly', 'doc-two=2; Path=/; HttpOnly'],
          }
        : {}),
    })
    const document = `<link rel="icon" href="data:,">${request.url === '/checkout' ? html : providerHtml}`
    if (encoding === 'chunked') {
      response.write(document.slice(0, 20))
      response.end(document.slice(20))
    } else response.end(encoding === 'gzip' ? gzipSync(document) : document)
  }
  const recordRequest = async (request: IncomingMessage) => {
    let body = ''
    for await (const chunk of request) body += chunk.toString()
    hits.push({ path: request.url ?? '', method: request.method ?? '', body, cookie: request.headers.cookie ?? '' })
  }
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    await recordRequest(request)
    if (request.url === '/login' && request.method === 'POST') {
      response
        .writeHead(redirectStatus, { location: '/secure', 'set-cookie': 'synthetic=adapter; Secure; HttpOnly; Path=/' })
        .end()
    } else if (request.url === '/image-redirect-a') {
      response.writeHead(302, { location: '/image-final-a' }).end()
    } else if (request.url === '/image-redirect-b') {
      response.writeHead(302, { location: '/image-final-b' }).end()
    } else if (['/image-final-a', '/image-final-b', '/image-independent'].includes(request.url ?? '')) {
      response.writeHead(200, { 'content-type': 'image/gif' }).end('GIF89a')
    } else if (request.url === '/cache.css') {
      const headers = { etag: '"synthetic-cache"', 'cache-control': 'max-age=0', 'content-type': 'text/css' }
      response
        .writeHead(request.headers['if-none-match'] === headers.etag ? 304 : 200, headers)
        .end(request.headers['if-none-match'] === headers.etag ? undefined : 'body { color: rgb(1, 2, 3) }')
    } else if (request.url === '/secure' && denySecondHop) {
      response.writeHead(302, { location: '/denied' }).end()
    } else if (request.url === '/slow' && holdResponse) {
      held = response
    } else if (request.url === '/download') {
      response.writeHead(200, { 'content-disposition': 'attachment; filename=synthetic.txt' }).end('synthetic')
    } else if (request.url === '/worker.js') {
      response
        .writeHead(200, { 'content-type': 'application/javascript' })
        .end('fetch("/secure"); globalThis.workerExecuted=true;')
    } else {
      serveDocument(request, response)
    }
  }
  const target = createServer((request, response) => void handle(request, response))
  const idp = createSecureServer({ key, cert }, (request, response) => void handle(request, response))
  const servers = [target, idp]
  for (const server of servers) {
    server.on('upgrade', (_request, socket) => {
      upgradeCount++
      socket.destroy()
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
  }
  const port = (server: typeof target | typeof idp) => {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture port')
    return address.port
  }
  const targetOrigin = `http://127.0.0.1:${port(target)}`
  const idpOrigin = `https://localhost:${port(idp)}`
  const policy = JSON.stringify({
    schemaVersion: 'appraise.discovery-auth-transit/v1',
    flows: [
      {
        flowId: 'test-login',
        rules: [
          {
            documentOrigin: '$TARGET',
            destinationOrigin: '$TARGET',
            path: { match: 'EXACT', value: '/cache.css' },
            methods: ['GET'],
            requestKinds: ['SUBRESOURCE', 'XHR_FETCH'],
          },
          ...['/image-redirect-a', '/image-redirect-b', '/image-final-a', '/image-final-b', '/image-independent'].map(
            value => ({
              documentOrigin: '$TARGET',
              destinationOrigin: '$TARGET',
              path: { match: 'EXACT', value },
              methods: ['GET'],
              requestKinds: ['SUBRESOURCE'],
            }),
          ),
          {
            documentOrigin: '$TARGET',
            destinationOrigin: idpOrigin,
            path: { match: 'EXACT', value: '/login' },
            methods: ['GET'],
            requestKinds: ['DOCUMENT'],
          },
          ...['/login', '/secure', '/slow', '/download', '/worker.js'].map(value => ({
            documentOrigin: idpOrigin,
            destinationOrigin: idpOrigin,
            path: { match: 'EXACT', value },
            methods: ['GET', 'POST'],
            requestKinds: ['DOCUMENT', 'SUBRESOURCE', 'XHR_FETCH'],
          })),
        ],
        returns: [{ fromOrigin: idpOrigin, targetPath: '/checkout', methods: ['GET'] }],
      },
    ],
  })
  return {
    targetOrigin,
    idpOrigin,
    policy,
    hits,
    upgrades: () => upgradeCount,
    setHtml: (value: string) => {
      html = value
    },
    setProviderHtml: (value: string) => {
      providerHtml = value
    },
    setDocumentTransport: (value: typeof encoding, policy?: string) => {
      encoding = value
      originalCsp = policy
    },
    setRedirect: (status: number, deny = false) => {
      redirectStatus = status
      denySecondHop = deny
    },
    hold: () => {
      holdResponse = true
    },
    release: () => {
      held?.writeHead(200, { 'content-type': 'text/html' }).end('<h1>Late</h1>')
    },
    async close() {
      for (const server of servers) {
        server.closeAllConnections()
        await new Promise<void>(resolve => server.close(() => resolve()))
      }
      await rm(directory, { recursive: true, force: true })
    },
  }
}
