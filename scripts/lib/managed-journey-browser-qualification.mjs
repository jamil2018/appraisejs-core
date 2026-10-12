export async function createBrowserBoundarySession(browser, policy) {
  const receipts = []
  const allowedOrigins = new Set(policy.allowedOrigins)
  const allowedRequests = new Set(policy.allowedRequests.map(requestKey))
  const pendingDownloadCancellations = new Set()
  const clock = policy.clock ?? (() => new Date())
  const grant = policy.grant ?? null
  let revoked = false
  let authenticated = false
  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: 'block',
  })

  const isAllowed = (url, method) => {
    const parsed = new URL(url)
    return sessionActive() && allowedOrigins.has(parsed.origin) && allowedRequests.has(requestKey({ url, method }))
  }

  const sessionActive = () => !revoked && (!grant || clock() < new Date(grant.expiresAt))

  const decide = (url, method, channel) => {
    const parsed = new URL(url)
    const allowed = isAllowed(url, method)
    receipts.push({ channel, url: `${parsed.origin}${parsed.pathname}`, method, allowed })
    return allowed
  }

  await context.route('**/*', async route => {
    const request = route.request()
    if (!decide(request.url(), request.method(), 'http')) {
      await route.abort('blockedbyclient')
      return
    }

    const response = await route.fetch({ maxRedirects: 0 })
    const location = response.headers().location
    if (location) {
      const redirectUrl = new URL(location, request.url()).toString()
      if (!decide(redirectUrl, 'GET', 'redirect')) {
        await route.abort('blockedbyclient')
        return
      }
    }
    await route.fulfill({ response })
  })
  await context.routeWebSocket('**', webSocket => {
    decide(webSocket.url(), 'CONNECT', 'websocket')
    webSocket.close({ code: 1008, reason: 'Journey browser policy denied WebSocket' })
  })

  const page = await context.newPage()
  page.on('download', download => {
    receipts.push({ channel: 'download', url: download.url(), method: 'GET', allowed: false })
    const cancellation = download.cancel().catch(() => {})
    pendingDownloadCancellations.add(cancellation)
    void cancellation.finally(() => pendingDownloadCancellations.delete(cancellation))
  })

  const scopedWorker = {
    async navigate(url) {
      if (!decide(url, 'GET', 'navigation')) return { allowed: false }
      const receiptStart = receipts.length
      const loaded = await loadPage(page, url)
      const denied = receipts.slice(receiptStart).some(receipt => !receipt.allowed)
      return navigationOutcome(loaded, denied, isAllowed(page.url(), 'GET'), page.url())
    },
    async observeText(selector) {
      if (!sessionActive()) throw new Error('Browser grant is expired or revoked.')
      return page.locator(selector).innerText()
    },
    async request(method, url) {
      if (!decide(url, method, 'worker-request')) return { allowed: false }
      const response = await context.request.fetch(url, { method, maxRedirects: 0 })
      return { allowed: true, status: response.status() }
    },
  }

  const worker = {
    forScope({ journeyId, targetProjectId }) {
      if (!grant || journeyId !== grant.journeyId || targetProjectId !== grant.targetProjectId)
        throw new Error('Worker scope does not match the Journey browser grant.')
      return scopedWorker
    },
  }

  const controller = {
    async completeSyntheticHumanLogin({ journeyId, targetProjectId, origin, username, password, mfaCode }) {
      if (!grant) throw new Error('Browser session has no Journey grant.')
      if (!sessionActive()) throw new Error('Browser grant is expired or revoked.')
      if (journeyId !== grant.journeyId || targetProjectId !== grant.targetProjectId)
        throw new Error('Human login does not match the Journey browser grant.')
      if (!allowedOrigins.has(origin)) throw new Error('Session origin is outside the browser grant.')
      if (!username || !password || !mfaCode)
        throw new Error('Synthetic human login requires username, password, and MFA.')
      await context.addCookies([
        { name: 'fixture_session', value: 'signed-in', url: origin, httpOnly: true, sameSite: 'Strict' },
      ])
      authenticated = true
      return { authenticated: true, mfaSatisfied: true }
    },
    async logout(origin) {
      if (!allowedOrigins.has(origin)) throw new Error('Logout origin is outside the browser grant.')
      await context.clearCookies()
      authenticated = false
    },
    revoke() {
      revoked = true
      authenticated = false
    },
    sessionState() {
      return { active: sessionActive(), authenticated }
    },
    receiptSummary() {
      return receipts.map(receipt => ({ ...receipt }))
    },
    serviceWorkerCount() {
      return context.serviceWorkers().length
    },
    diagnostics() {
      return {
        active: sessionActive(),
        authenticated,
        journeyId: grant?.journeyId ?? null,
        targetProjectId: grant?.targetProjectId ?? null,
        allowedOrigins: [...allowedOrigins].sort(),
        receiptCount: receipts.length,
      }
    },
    async close() {
      await Promise.all(pendingDownloadCancellations)
      await context.close()
    },
  }

  return { worker, controller }
}

function requestKey({ url, method }) {
  return `${method.toUpperCase()} ${new URL(url).href}`
}

async function loadPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await new Promise(resolve => setImmediate(resolve))
    return true
  } catch {
    await new Promise(resolve => setTimeout(resolve, 50))
    return false
  }
}

function navigationOutcome(loaded, denied, finalUrlAllowed, finalUrl) {
  return loaded && !denied && finalUrlAllowed ? { allowed: true, finalUrl } : { allowed: false }
}
