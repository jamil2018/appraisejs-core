import { createServer, type Server } from 'node:http'
import { driverDigest, readNativeDriverControl, type NativeDriverControl } from './native-driver-control.mts'
import type { NativeCredentialDescriptor } from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'

const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><title>Disposable checkout target</title><main><h1>Checkout</h1><p>Anonymous qualification target. No payment or account actions.</p></main></html>'
/** Fixed anonymous target. No listener is acquired until the exact independent control is accepted. */
export function createAnonymousQualificationTarget(provided: {
  baseUrl: string
  requestLimit: number
  lifetimeMs: number
  source: NativeCredentialDescriptor
  onExpired(): void
}) {
  const options = { ...provided, source: structuredClone(provided.source) },
    url = new URL(options.baseUrl)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/checkout' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !Number.isSafeInteger(options.requestLimit) ||
    options.requestLimit < 1 ||
    options.requestLimit > 128 ||
    !Number.isSafeInteger(options.lifetimeMs) ||
    options.lifetimeMs < 1 ||
    options.lifetimeMs > 3_600_000
  )
    throw new Error('Bounded anonymous target refused')
  const subject = Object.freeze({
      version: 'M13_ANONYMOUS_TARGET_V1',
      baseUrl: url.href,
      bindAddress: '127.0.0.1',
      methods: ['GET', 'HEAD'],
      paths: ['/checkout', '/favicon.ico'],
      htmlDigest: driverDigest(html),
      requestLimit: options.requestLimit,
      lifetimeMs: options.lifetimeMs,
      signIn: false,
      accountActions: false,
      paymentActions: false,
      production: false,
    }),
    subjectDigest = driverDigest(subject)
  let original: Server | undefined,
    startEntered = false,
    requests = 0,
    expired = false
  let timer: ReturnType<typeof setTimeout> | undefined, stop: Promise<void> | undefined
  let originalListen: Promise<void> | undefined
  function closeOriginal() {
    if (!stop)
      stop = (async () => {
        if (timer) clearTimeout(timer)
        try {
          await originalListen
        } catch {
          return
        }
        if (!original?.listening) return
        await new Promise<void>((resolve, reject) => {
          original!.close(error => (error ? reject(error) : resolve()))
          original!.closeAllConnections()
        })
      })()
    return stop
  }
  function expire() {
    if (expired) return
    expired = true
    try {
      options.onExpired()
    } finally {
      void closeOriginal().catch(() => {})
    }
  }
  return Object.freeze({
    publicPrepared: () => structuredClone({ subject, subjectDigest }),
    async startVerified(control: NativeDriverControl) {
      if (startEntered || stop) throw new Error('One original anonymous target start required')
      startEntered = true
      readNativeDriverControl(control, 'ANONYMOUS_TARGET', subjectDigest, options.source)
      original = createServer((request, response) => {
        requests++
        if (requests > options.requestLimit) {
          response.writeHead(429).end()
          expire()
          return
        }
        if (
          !['GET', 'HEAD'].includes(request.method ?? '') ||
          !['/checkout', '/favicon.ico'].includes(request.url ?? '')
        ) {
          response.writeHead(404).end()
          return
        }
        if (request.url === '/favicon.ico') {
          response.writeHead(204).end()
          return
        }
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
          connection: 'close',
        })
        response.end(request.method === 'HEAD' ? undefined : html)
      })
      const owned = original
      originalListen = new Promise<void>((resolve, reject) => {
        owned.once('error', reject)
        owned.listen(Number(url.port), '127.0.0.1', () => {
          owned.removeListener('error', reject)
          resolve()
        })
      })
      await originalListen
      if (stop) {
        await stop
        throw new Error('Original anonymous target fenced during acquisition')
      }
      owned.on('error', expire)
      timer = setTimeout(expire, options.lifetimeMs)
      return Object.freeze({ subjectDigest, state: 'LISTENING', runtimeQualified: false })
    },
    closeOriginal,
    snapshot: () => Object.freeze({ startEntered, requests, expired, stopped: !!stop }),
  })
}
