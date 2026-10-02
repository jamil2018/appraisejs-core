import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { after, before, test } from 'node:test'
import { createRuntimeAuthentication } from './runtime-auth.mjs'

const targetOrigin = 'https://checkout.example.test'
const credential = randomBytes(32).toString('base64url')
let now = Date.parse('2026-10-02T00:00:00Z')
let auth = createRuntimeAuthentication({ targetOrigin, credential, expiresAt: now + 90 * 60_000, clock: () => now })
let delegated = 0
const server = createServer(async (req, res) => {
  if (await auth.handler(req, res)) return
  delegated++
  res.writeHead(200)
  res.end('human fixture')
})
let port

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  port = server.address().port
})
after(async () => {
  await new Promise(resolve => server.close(resolve))
})

function requestHeaders(method, cookie, origin, bytes, headers) {
  return {
    host: 'checkout.example.test',
    'x-forwarded-proto': 'https',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-dest': 'document',
    'sec-fetch-site': 'same-origin',
    ...(method === 'POST' ? postHeaders(origin, bytes) : {}),
    ...(cookie ? { cookie } : {}),
    ...headers,
  }
}

function postHeaders(origin, bytes) {
  return {
    origin,
    'content-type': 'application/x-www-form-urlencoded',
    'content-length': bytes?.length ?? 0,
  }
}

function send(path, { method = 'GET', cookie, origin = targetOrigin, body, headers = {} } = {}) {
  const bytes = body === undefined ? undefined : Buffer.from(body)
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: requestHeaders(method, cookie, origin, bytes, headers),
      },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    req.on('error', reject)
    req.end(bytes)
  })
}

function cookieFrom(response, name) {
  const match = response.headers['set-cookie']?.find(value => value.startsWith(`${name}=`))
  assert.ok(match)
  return match.split(';')[0]
}

function csrfFrom(body) {
  const match = body.match(/name="csrf" type="hidden" value="([A-Za-z0-9_-]{43})"/)
  assert.ok(match)
  return match[1]
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers['referrer-policy'], 'same-origin')
  assert.equal(response.headers['x-content-type-options'], 'nosniff')
  assert.equal(
    response.headers['content-security-policy'],
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  )
}

async function inFlightLogin(cookie, body, mutate) {
  const bytes = Buffer.from(body)
  let finish
  const response = new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/runtime-login',
        method: 'POST',
        headers: {
          host: 'checkout.example.test',
          'x-forwarded-proto': 'https',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-dest': 'document',
          'sec-fetch-site': 'same-origin',
          origin: targetOrigin,
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': bytes.length,
        },
      },
      res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        )
      },
    )
    req.on('error', reject)
    finish = () => req.end(bytes.subarray(1))
    req.write(bytes.subarray(0, 1))
  })
  await new Promise(resolve => server.once('request', resolve))
  mutate()
  finish()
  return response
}

async function login(value = credential) {
  const page = await send('/runtime-login')
  assert.equal(page.status, 200)
  const preauth = cookieFrom(page, '__Host-c27-preauth')
  const csrf = csrfFrom(page.body)
  const body = new URLSearchParams({ credential: value, csrf }).toString()
  return { preauth, csrf, response: await send('/runtime-login', { method: 'POST', cookie: preauth, body }) }
}

test('valid runtime login and order use only their own session; absence delegates', async () => {
  const prior = delegated
  assert.equal((await send('/checkout')).body, 'human fixture')
  assert.equal(delegated, prior + 1)
  const { response } = await login()
  assert.equal(response.status, 303)
  assertSecurityHeaders(response)
  assert.equal(response.headers.location, '/checkout')
  const session = cookieFrom(response, '__Host-c27-runtime')
  assert.match(response.headers['set-cookie'].join(' '), /Secure; HttpOnly; SameSite=Strict/)
  assert.equal((await send('/order-complete', { cookie: session })).status, 403)
  const checkout = await send('/checkout', { cookie: session })
  assertSecurityHeaders(checkout)
  assert.match(checkout.body, /Protected checkout/)
  assert.match(checkout.body, /id="submit-order"/)
  const csrf = csrfFrom(checkout.body)
  const order = await send('/order', {
    method: 'POST',
    cookie: session,
    body: new URLSearchParams({ csrf }).toString(),
  })
  assertSecurityHeaders(order)
  assert.equal(order.status, 303)
  assert.equal(order.headers.location, '/order-complete')
  assert.equal((await send('/order-complete', { cookie: cookieFrom(order, '__Host-c27-runtime') })).status, 200)
  assert.match(
    (await send('/order-complete', { cookie: cookieFrom(order, '__Host-c27-runtime') })).body,
    /<h1>Order complete<\/h1>/,
  )
  assert.equal(
    (await send('/order', { method: 'POST', cookie: session, body: new URLSearchParams({ csrf }).toString() })).status,
    403,
  )
})

test('invalid, missing, duplicated, replayed, and foreign login inputs fail closed', async () => {
  assert.equal((await login('incorrect')).response.status, 403)
  const page = await send('/runtime-login')
  const preauth = cookieFrom(page, '__Host-c27-preauth')
  const csrf = csrfFrom(page.body)
  const good = new URLSearchParams({ credential, csrf }).toString()
  const denied = await send('/runtime-login', { method: 'POST', body: good })
  assert.equal(denied.status, 403)
  assertSecurityHeaders(denied)
  assert.equal(
    (await send('/runtime-login', { method: 'POST', cookie: `${preauth}; ${preauth}`, body: good })).status,
    403,
  )
  assert.equal(
    (
      await send('/runtime-login', {
        method: 'POST',
        cookie: preauth,
        body: good,
        origin: 'https://other.example.test',
      })
    ).status,
    403,
  )
  assert.equal((await send('/runtime-login', { method: 'POST', cookie: preauth, body: good })).status, 303)
  assert.equal((await send('/runtime-login', { method: 'POST', cookie: preauth, body: good })).status, 403)
  const fresh = await send('/runtime-login')
  const nextCookie = cookieFrom(fresh, '__Host-c27-preauth')
  const nextCsrf = csrfFrom(fresh.body)
  const duplicate = `credential=${encodeURIComponent(credential)}&credential=${encodeURIComponent(credential)}&csrf=${nextCsrf}`
  assert.equal((await send('/runtime-login', { method: 'POST', cookie: nextCookie, body: duplicate })).status, 403)
  assert.equal((await send('/checkout', { cookie: '__Host-c27-runtime=invalid' })).status, 403)
  assert.equal(
    (await send('/checkout', { cookie: '__Host-c27-runtime=invalid; __Host-c27-runtime=invalid' })).status,
    403,
  )
})

test('length, target, fetch metadata, and order CSRF are enforced', async () => {
  const entry = await send('/runtime-login', { headers: { 'sec-fetch-site': 'none' } })
  assert.equal(entry.status, 200)
  assert.match(entry.body, /<label for="runtime-credential">/)
  assert.equal((await send('/runtime-login', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  const { response } = await login()
  const session = cookieFrom(response, '__Host-c27-runtime')
  assert.equal((await send('/checkout', { cookie: session, headers: { host: 'foreign.example.test' } })).status, 403)
  assert.equal((await send('/runtime-login', { headers: { host: 'foreign.example.test' } })).status, 403)
  assert.equal((await send('/checkout', { cookie: session, headers: { 'x-forwarded-proto': 'http' } })).status, 403)
  assert.equal((await send('/checkout', { cookie: session, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal(
    (await send('/order', { method: 'POST', cookie: session, origin: 'https://foreign.example.test', body: 'csrf=x' }))
      .status,
    403,
  )
  assert.equal((await send('/order', { method: 'POST', cookie: session, body: `csrf=${'x'.repeat(513)}` })).status, 403)
  assert.equal((await send('/order', { method: 'POST', cookie: session, body: 'csrf=x' })).status, 403)
  const checkout = await send('/checkout', { cookie: session })
  assert.equal(checkout.status, 200)
})

test('preauth and sessions expire; revoke disables the entire window without secret exposure', async () => {
  const page = await send('/runtime-login')
  const preauth = cookieFrom(page, '__Host-c27-preauth')
  const csrf = csrfFrom(page.body)
  now += 60_001
  assert.equal(
    (
      await send('/runtime-login', {
        method: 'POST',
        cookie: preauth,
        body: new URLSearchParams({ credential, csrf }).toString(),
      })
    ).status,
    403,
  )
  const { response } = await login()
  const session = cookieFrom(response, '__Host-c27-runtime')
  now += 10 * 60_000 + 1
  assert.equal((await send('/checkout', { cookie: session })).status, 403)
  const next = await login()
  assert.equal(next.response.status, 303)
  const status = auth.status()
  assert.equal(status.enabled, true)
  assert.equal(JSON.stringify(status).includes(credential), false)
  assert.equal(JSON.stringify(status).toLowerCase().includes('mfa'), false)
  auth.revoke()
  assert.equal(auth.status().enabled, false)
  assert.equal(auth.status().sessionCount, 0)
  assert.equal((await send('/checkout', { cookie: cookieFrom(next.response, '__Host-c27-runtime') })).status, 403)
  assert.equal((await send('/runtime-login')).status, 403)
})

test('expiry and revocation during a streaming login body cannot mint a session', async () => {
  now += 1
  auth = createRuntimeAuthentication({ targetOrigin, credential, expiresAt: now + 60_000, clock: () => now })
  let page = await send('/runtime-login')
  let body = new URLSearchParams({ credential, csrf: csrfFrom(page.body) }).toString()
  let result = await inFlightLogin(cookieFrom(page, '__Host-c27-preauth'), body, () => {
    now += 60_000
  })
  assert.equal(result.status, 403)
  assert.equal(auth.status().sessionCount, 0)

  auth = createRuntimeAuthentication({ targetOrigin, credential, expiresAt: now + 60_000, clock: () => now })
  page = await send('/runtime-login')
  body = new URLSearchParams({ credential, csrf: csrfFrom(page.body) }).toString()
  result = await inFlightLogin(cookieFrom(page, '__Host-c27-preauth'), body, () => auth.revoke())
  assert.equal(result.status, 403)
  assert.equal(auth.status().sessionCount, 0)
})

test('configuration rejects non-HTTPS origins, weak credentials, and long windows', () => {
  assert.throws(() =>
    createRuntimeAuthentication({
      targetOrigin: 'http://checkout.example.test',
      credential,
      expiresAt: now + 1000,
      clock: () => now,
    }),
  )
  assert.throws(() =>
    createRuntimeAuthentication({ targetOrigin, credential: 'weak', expiresAt: now + 1000, clock: () => now }),
  )
  assert.throws(() =>
    createRuntimeAuthentication({ targetOrigin, credential, expiresAt: now + 90 * 60_000 + 1, clock: () => now }),
  )
})
