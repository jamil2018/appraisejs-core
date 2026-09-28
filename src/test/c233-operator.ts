import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

function html(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Test-only local operator surface. It accepts no target/browser data or scope parameters. */
export async function startC233Operator(arm: () => Promise<{ returnUrl: string }>) {
  const nonce = randomBytes(24).toString('hex')
  let ready = false
  let used = false
  let origin = ''
  let resolveArm!: (value: { returnUrl: string }) => void
  let rejectArm!: (error: Error) => void
  const armed = new Promise<{ returnUrl: string }>((resolve, reject) => {
    resolveArm = resolve
    rejectArm = reject
  })
  // Cleanup may precede the consumer reaching this phase.
  void armed.catch(() => undefined)
  const page = (response: ServerResponse, status: number, content: string) => {
    response.writeHead(status, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Preserve Origin on the same-origin form POST; suppress cross-origin referrers.
      'referrer-policy': 'same-origin',
      'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    })
    response.end(`<!doctype html><title>Appraise qualification control</title><main>${content}</main>`)
  }
  const server = createServer((request, response) => {
    if (request.headers.host !== new URL(origin).host || request.url !== '/') {
      request.resume()
      response.writeHead(404).end()
      return
    }
    if (request.method === 'GET') {
      request.resume()
      page(
        response,
        200,
        `<h1>Appraise qualification control</h1><p>This is a basic sign-in smoke, not MFA qualification.</p>${
          used
            ? '<p>The return was already requested. Keep the scoped browser open.</p>'
            : ready
              ? `<p>When ready to return from the provider, press the button. You will have 15 seconds to paste the displayed URL into the scoped browser address bar.</p><form method="post"><input type="hidden" name="nonce" value="${nonce}"><button>Authorize exact return</button></form>`
              : '<p>Complete sign-in in the scoped browser, leave it on the success page, then refresh this control page.</p>'
        }`,
      )
      return
    }
    if (!isArmRequest(request, origin, nonce)) {
      request.resume()
      response.writeHead(403).end()
      return
    }
    if (!ready || used) {
      request.resume()
      page(response, 409, '<p>Return is unavailable. Refresh the control page.</p>')
      return
    }
    void readNonce(request, nonce)
      .then(async valid => {
        if (!valid || used) {
          response.writeHead(403).end()
          return
        }
        used = true
        return arm().then(
          value => {
            page(
              response,
              200,
              `<h1>Return now</h1><p>Paste this exact URL into the scoped browser address bar within 15 seconds. Do not use Back.</p><pre>${html(value.returnUrl)}</pre><p>Leave that browser open after returning.</p>`,
            )
            resolveArm(value)
          },
          () => {
            page(response, 409, '<p>Return could not be authorized. This qualification must start a fresh session.</p>')
            rejectArm(new Error('Operator return authorization failed.'))
          },
        )
      })
      .catch(() => {
        response.writeHead(400).end()
      })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Operator control did not bind.')
  origin = `http://127.0.0.1:${address.port}`
  return {
    url: `${origin}/`,
    armed,
    markReady: () => {
      ready = true
    },
    close: async () => {
      rejectArm(new Error('Operator control closed.'))
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

async function readNonce(request: IncomingMessage, nonce: string) {
  let body = ''
  for await (const chunk of request) {
    body += chunk.toString()
    if (body.length > 64) return false
  }
  const expected = Buffer.from(`nonce=${nonce}`)
  const received = Buffer.from(body)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function isArmRequest(request: IncomingMessage, origin: string, nonce: string) {
  return (
    request.method === 'POST' &&
    request.headers.origin === origin &&
    !request.headers['transfer-encoding'] &&
    request.headers['content-type'] === 'application/x-www-form-urlencoded' &&
    request.headers['content-length'] === String(`nonce=${nonce}`.length)
  )
}
