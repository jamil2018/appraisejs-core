export async function createBrowserBoundarySession(browser, policy) {
  const receipts = []
  const allowedOrigins = new Set(policy.allowedOrigins)
  const allowedPaths = new Set(policy.allowedPaths)
  const context = await browser.newContext({
    acceptDownloads: false,
    serviceWorkers: 'block',
  })

  const isAllowed = (url, method) => {
    const parsed = new URL(url)
    return allowedOrigins.has(parsed.origin) && allowedPaths.has(parsed.pathname) && method === 'GET'
  }

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
    void download.cancel()
  })

  return {
    async navigate(url) {
      if (!decide(url, 'GET', 'navigation')) return { allowed: false }
      const receiptStart = receipts.length
      const loaded = await loadPage(page, url)
      const denied = receipts.slice(receiptStart).some(receipt => !receipt.allowed)
      return navigationOutcome(loaded, denied, isAllowed(page.url(), 'GET'), page.url())
    },
    async observeText(selector) {
      return page.locator(selector).innerText()
    },
    async authorizeSyntheticSession({ name, value, origin }) {
      if (!allowedOrigins.has(origin)) throw new Error('Session origin is outside the browser grant.')
      await context.addCookies([{ name, value, url: origin, httpOnly: true, sameSite: 'Strict' }])
    },
    request(method, url) {
      return { allowed: decide(url, method, 'worker-request') }
    },
    receiptSummary() {
      return receipts.map(receipt => ({ ...receipt }))
    },
    serviceWorkerCount() {
      return context.serviceWorkers().length
    },
    close() {
      return context.close()
    },
  }
}

async function loadPage(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await new Promise(resolve => setImmediate(resolve))
    return true
  } catch {
    return false
  }
}

function navigationOutcome(loaded, denied, finalUrlAllowed, finalUrl) {
  return loaded && !denied && finalUrlAllowed ? { allowed: true, finalUrl } : { allowed: false }
}
