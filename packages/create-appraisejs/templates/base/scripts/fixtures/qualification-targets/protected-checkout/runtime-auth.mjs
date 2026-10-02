import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE = '__Host-c27-runtime'
const PREAUTH_COOKIE = '__Host-c27-preauth'
const MAX_WINDOW_MS = 90 * 60_000
const SESSION_MS = 10 * 60_000
const PREAUTH_MS = 60_000
const MAX_ENTRIES = 128
const MAX_BODY_BYTES = 512
const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'referrer-policy': 'same-origin',
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
}

const hash = value => createHash('sha256').update(value).digest()
const token = () => randomBytes(32).toString('base64url')
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`
const clearCookie = name => cookie(name, '', 0)

function deny(res, status = 403) {
  res.writeHead(status, { ...RESPONSE_HEADERS, 'content-type': 'text/plain; charset=utf-8' })
  res.end(status === 404 ? 'Not found' : 'Forbidden')
  return true
}

function digestMatches(value, expected) {
  const actual = hash(value)
  return timingSafeEqual(actual, expected)
}

function readCookie(req, name) {
  const raw = req.headers.cookie
  if (raw === undefined) return { present: false }
  if (invalidCookieHeader(raw)) return { present: true, invalid: true }
  const matches = raw
    .split(';')
    .map(parseCookiePart)
    .filter(part => part.name === name)
  return singleCookie(matches)
}

function invalidCookieHeader(raw) {
  return typeof raw !== 'string' || raw.length > 4096
}

function singleCookie(matches) {
  if (matches.length === 0) return { present: false }
  if (matches.length !== 1 || !matches[0].valid) return { present: true, invalid: true }
  return { present: true, value: matches[0].value }
}

function parseCookiePart(part) {
  const [name, ...rest] = part.trim().split('=')
  return { name, value: rest[0], valid: rest.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(rest[0]) }
}

function trimMap(map, now) {
  for (const [key, entry] of map) if (entry.expiresAt <= now) map.delete(key)
  while (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value)
}

async function readForm(req) {
  const declared = req.headers['content-length']
  if (!validFormHeaders(req, declared)) return null
  const bytes = await readBoundedBytes(req, Number(declared))
  return bytes ? new URLSearchParams(bytes.toString('utf8')) : null
}

function validFormHeaders(req, declared) {
  return (
    req.headers['content-type'] === 'application/x-www-form-urlencoded' &&
    typeof declared === 'string' &&
    /^\d+$/.test(declared) &&
    Number(declared) <= MAX_BODY_BYTES
  )
}

async function readBoundedBytes(req, declaredLength) {
  const chunks = []
  let length = 0
  try {
    for await (const chunk of req) {
      length += chunk.length
      if (length > MAX_BODY_BYTES) return null
      chunks.push(chunk)
    }
  } catch {
    return null
  }
  return completeBody(req, chunks, length, declaredLength)
}

function completeBody(req, chunks, length, declaredLength) {
  if (req.aborted || length !== declaredLength) return null
  return Buffer.concat(chunks)
}

function fields(form, names) {
  if (!hasExactFieldCount(form, names)) return null
  const result = {}
  for (const name of names) {
    const all = form.getAll(name)
    if (all.length !== 1) return null
    result[name] = all[0]
  }
  return result
}

function hasExactFieldCount(form, names) {
  return form && [...form.keys()].length === names.length
}

function page(res, body, cookies) {
  res.writeHead(200, {
    ...RESPONSE_HEADERS,
    'content-type': 'text/html; charset=utf-8',
    ...(cookies ? { 'set-cookie': cookies } : {}),
  })
  res.end(`<!doctype html><html><body>${body}</body></html>`)
  return true
}

function validateOrigin(targetOrigin) {
  const origin = new URL(targetOrigin)
  const invalid = [
    origin.protocol !== 'https:',
    Boolean(origin.username),
    Boolean(origin.password),
    origin.pathname !== '/',
    Boolean(origin.search),
    Boolean(origin.hash),
    origin.origin !== targetOrigin,
  ]
  if (invalid.some(Boolean)) throw new TypeError('targetOrigin must be an exact HTTPS origin')
  return origin
}

function validateCredential(credential) {
  if (!credentialShapeIsValid(credential)) throw new TypeError('credential must be a 256-bit base64url value')
  const decoded = Buffer.from(credential, 'base64url')
  if (!credentialEncodingIsValid(decoded, credential))
    throw new TypeError('credential must be a 256-bit base64url value')
  return hash(credential)
}

function credentialShapeIsValid(credential) {
  return typeof credential === 'string' && /^[A-Za-z0-9_-]{43}$/.test(credential)
}

function credentialEncodingIsValid(decoded, credential) {
  return decoded.length === 32 && decoded.toString('base64url') === credential
}

function validateWindow(expiresAt, clock) {
  if (typeof clock !== 'function') throw new TypeError('clock must be a function')
  const startsAt = clock()
  const end = new Date(expiresAt).getTime()
  if (!validWindowBounds(startsAt, end)) throw new TypeError('expiresAt must be within 90 minutes')
  return end
}

function validWindowBounds(startsAt, end) {
  return [Number.isFinite(startsAt), Number.isFinite(end), end > startsAt, end <= startsAt + MAX_WINDOW_MS].every(
    Boolean,
  )
}

function redirect(res, location, cookies) {
  res.writeHead(303, { ...RESPONSE_HEADERS, location, 'set-cookie': cookies })
  res.end()
  return true
}

function pruneExpired(map, now) {
  for (const [key, entry] of map) if (entry.expiresAt <= now) map.delete(key)
}

export function createRuntimeAuthentication({ targetOrigin, credential, expiresAt, clock = Date.now }) {
  const origin = validateOrigin(targetOrigin)
  const credentialHash = validateCredential(credential)
  const end = validateWindow(expiresAt, clock)
  const preauth = new Map()
  const sessions = new Map()
  let revoked = false
  const enabled = () => !revoked && clock() < end
  const sameTarget = req => req.headers.host === origin.host && req.headers['x-forwarded-proto'] === 'https'
  const sameDocument = req =>
    req.headers['sec-fetch-mode'] === 'navigate' &&
    req.headers['sec-fetch-dest'] === 'document' &&
    req.headers['sec-fetch-site'] === 'same-origin'
  const loginEntry = req =>
    req.headers['sec-fetch-mode'] === 'navigate' &&
    req.headers['sec-fetch-dest'] === 'document' &&
    ['none', 'same-origin'].includes(req.headers['sec-fetch-site'])
  const samePost = req => sameDocument(req) && req.headers.origin === targetOrigin

  function serveLoginPage(res) {
    const id = token()
    const csrf = token()
    trimMap(preauth, clock())
    preauth.set(hash(id).toString('hex'), {
      csrfHash: hash(csrf),
      expiresAt: Math.min(end, clock() + PREAUTH_MS),
    })
    return page(
      res,
      `<form method="post" action="/runtime-login"><label for="runtime-credential">Runtime credential</label><input id="runtime-credential" name="credential" type="password" autocomplete="off" required><input name="csrf" type="hidden" value="${csrf}"><button type="submit">Sign in</button></form>`,
      cookie(PREAUTH_COOKIE, id, 60),
    )
  }

  function takeChallenge(req) {
    const pre = readCookie(req, PREAUTH_COOKIE)
    if (!pre.present || pre.invalid) return null
    const key = hash(pre.value).toString('hex')
    const challenge = preauth.get(key)
    preauth.delete(key)
    return unexpiredChallenge(challenge, clock())
  }

  function unexpiredChallenge(challenge, now) {
    return challenge?.expiresAt > now ? challenge : null
  }

  function createSession() {
    const id = token()
    const orderCsrf = token()
    trimMap(sessions, clock())
    sessions.set(hash(id).toString('hex'), {
      csrfHash: hash(orderCsrf),
      orderCsrf,
      expiresAt: Math.min(end, clock() + SESSION_MS),
      ordered: false,
    })
    return id
  }

  async function acceptLogin(req, res) {
    const challenge = takeChallenge(req)
    if (!challenge) return deny(res)
    const form = fields(await readForm(req), ['credential', 'csrf'])
    if (!enabled() || !validLoginForm(form, challenge)) return deny(res)
    const id = createSession()
    return redirect(res, '/checkout', [cookie(SESSION_COOKIE, id, 600), clearCookie(PREAUTH_COOKIE)])
  }

  function validLoginForm(form, challenge) {
    return form && digestMatches(form.csrf, challenge.csrfHash) && digestMatches(form.credential, credentialHash)
  }

  function serveLoginEntry(req, res) {
    return loginEntry(req) ? serveLoginPage(res) : deny(res)
  }

  async function handleLogin(req, res) {
    if (req.method === 'GET') return serveLoginEntry(req, res)
    if (req.method === 'POST' && samePost(req)) return acceptLogin(req, res)
    return deny(res)
  }

  function currentSession(req) {
    const sessionCookie = readCookie(req, SESSION_COOKIE)
    if (sessionCookie.invalid) return null
    const key = hash(sessionCookie.value).toString('hex')
    const session = sessions.get(key)
    if (!session || session.expiresAt <= clock()) {
      sessions.delete(key)
      return null
    }
    return { key, session }
  }

  async function acceptOrder(req, res, key, session) {
    const form = fields(await readForm(req), ['csrf'])
    if (!activeOrderSession(key, session) || !form || !digestMatches(form.csrf, session.csrfHash)) return deny(res)
    sessions.delete(key)
    const nextId = token()
    sessions.set(hash(nextId).toString('hex'), { expiresAt: session.expiresAt, ordered: true })
    return redirect(
      res,
      '/order-complete',
      cookie(SESSION_COOKIE, nextId, Math.max(1, Math.ceil((session.expiresAt - clock()) / 1000))),
    )
  }

  function activeOrderSession(key, session) {
    return enabled() && !session.ordered && session.expiresAt > clock() && sessions.get(key) === session
  }

  const isCheckoutRequest = (path, req, session) =>
    path === '/checkout' && req.method === 'GET' && sameDocument(req) && !session.ordered
  const isCompletionRequest = (path, req, session) =>
    path === '/order-complete' && req.method === 'GET' && sameDocument(req) && session.ordered
  const isOrderRequest = (path, req) => path === '/order' && req.method === 'POST' && samePost(req)

  async function handleSessionRoute(path, req, res) {
    const current = currentSession(req)
    if (!current) return deny(res)
    const { key, session } = current
    return routeSession(path, req, res, key, session)
  }

  function routeSession(path, req, res, key, session) {
    if (isCheckoutRequest(path, req, session))
      return page(
        res,
        `<h1>Protected checkout</h1><form method="post" action="/order"><input name="csrf" type="hidden" value="${session.orderCsrf}"><button id="submit-order" type="submit">Submit order</button></form>`,
      )
    if (isCompletionRequest(path, req, session)) return page(res, '<h1>Order complete</h1>')
    if (isOrderRequest(path, req)) return acceptOrder(req, res, key, session)
    return deny(res)
  }

  function isFixturePath(path) {
    return ['/runtime-login', '/checkout', '/order', '/order-complete'].includes(path)
  }

  function hasRequiredCookie(path, req) {
    return path === '/runtime-login' || readCookie(req, SESSION_COOKIE).present
  }

  function validTargetRequest(req, path) {
    return sameTarget(req) && enabled() && req.url === path
  }

  function dispatch(path, req, res) {
    return path === '/runtime-login' ? handleLogin(req, res) : handleSessionRoute(path, req, res)
  }

  return {
    revoke() {
      revoked = true
      preauth.clear()
      sessions.clear()
      credentialHash.fill(0)
    },
    status() {
      const now = clock()
      pruneExpired(preauth, now)
      pruneExpired(sessions, now)
      return {
        enabled: enabled(),
        sessionCount: sessions.size,
        preauthCount: preauth.size,
        expiresAt: new Date(end).toISOString(),
      }
    },
    async handler(req, res) {
      const path = req.url?.split('?')[0]
      if (!isFixturePath(path)) return false
      if (!hasRequiredCookie(path, req)) return false
      if (!validTargetRequest(req, path)) return deny(res)
      return dispatch(path, req, res)
    },
  }
}
