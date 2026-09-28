import { access } from 'node:fs/promises'
import { createServer, type IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { startTargetGate } from '@/test/c233-target-gate'

type Gate = Awaited<ReturnType<typeof startTargetGate>>
const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.reverse()) await close()
  cleanup.length = 0
})
async function syntheticHit(request: IncomingMessage) {
  let body = ''
  for await (const chunk of request) body += chunk.toString()
  return { path: request.url ?? '', method: request.method ?? '', cookie: request.headers.cookie ?? '', body }
}
async function fixture(status = 303, deniedRedirect = false) {
  const hits: Awaited<ReturnType<typeof syntheticHit>>[] = []
  const server = createServer(async (request, response) => {
    const hit = await syntheticHit(request)
    hits.push(hit)
    if (hit.path === '/login') {
      response.writeHead(status, { Location: '/secure', 'Set-Cookie': 'synthetic=target; HttpOnly; Path=/' })
      response.end()
    } else if (hit.path === '/secure' && deniedRedirect) {
      response.writeHead(302, { Location: '/denied' })
      response.end()
    } else {
      response.setHeader('Content-Type', 'text/html')
      response.end('<link rel="icon" href="data:,"><h1>Synthetic target</h1>')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  cleanup.push(
    () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  )
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No loopback port')
  const origin = `http://127.0.0.1:${address.port}`
  return { origin, hits }
}
async function ready(gate: Gate, id = gate.targetId) {
  await expect
    .poll(() => [...gate.targets.values()].some(entry => entry.target.targetId === id && entry.ready))
    .toBe(true)
}
async function opened(gate: Gate, url: string) {
  await ready(gate)
  await gate.navigate(url)
  await expect.poll(() => gate.evaluate('document.querySelector("h1")?.textContent')).toBe('Synthetic target')
}
async function gateFor(f: Awaited<ReturnType<typeof fixture>>, admitDirectPopup = false, headless = true) {
  const gate = await startTargetGate({
    headless,
    allow: facts =>
      new URL(facts.url).origin === f.origin &&
      ['/checkout', '/login', '/secure', '/allowed-popup'].includes(new URL(facts.url).pathname) &&
      ['GET', 'POST'].includes(facts.method) &&
      facts.resourceType === 'Document',
    admitDirectPopup,
  })
  cleanup.push(gate.revoke)
  return gate
}
function popupScript(kind: string, url: string) {
  const literal = JSON.stringify(url)
  if (kind === 'window.open') return `window.open(${literal}); true`
  if (kind === 'link')
    return `const a=document.createElement('a'); a.href=${literal}; a.target='_blank'; document.body.append(a); a.click(); true`
  return `const form=document.createElement('form'); form.action=${literal}; form.method='POST'; form.target='_blank'; document.body.append(form); form.submit(); true`
}
function paths(f: Awaited<ReturnType<typeof fixture>>) {
  return f.hits.map(hit => hit.path)
}

describe.each([true, false])('C2.3.3 target admission (headless=%s)', headless => {
  const createGate = (f: Awaited<ReturnType<typeof fixture>>, admitDirectPopup = false) =>
    gateFor(f, admitDirectPopup, headless)
  it('guards and resumes only the exact paused seed', async () => {
    const f = await fixture()
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    expect(gate.executableName.toLowerCase().includes('headless')).toBe(headless)
    const seedCommands = gate.commands.filter(entry => entry.targetId === gate.targetId).map(entry => entry.command)
    expect(seedCommands).toEqual(['Target.setAutoAttach', 'Fetch.enable', 'Runtime.runIfWaitingForDebugger'])
    expect(gate.attachments).toEqual([{ targetId: gate.targetId, type: 'page', paused: true, rejected: false }])
    expect(paths(f)).toEqual(['/checkout'])
  })

  it.each(['window.open', 'link', 'form'])('blocks a %s popup before its initial request', async kind => {
    const f = await fixture()
    const denied = await fixture()
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    await gate.evaluate(popupScript(kind, `${denied.origin}/denied`)).catch(() => undefined)
    await gate.exited
    expect(paths(f)).toEqual(['/checkout'])
    expect(denied.hits).toHaveLength(0)
    expect(gate.attachments).toContainEqual(expect.objectContaining({ type: 'page', paused: true, rejected: true }))
  })

  it('guards an explicitly admitted test popup, then denies its nested popup before contact', async () => {
    const f = await fixture()
    const denied = await fixture()
    const gate = await createGate(f, true)
    await opened(gate, `${f.origin}/checkout`)
    await gate.evaluate(popupScript('window.open', `${f.origin}/allowed-popup`))
    await expect.poll(() => paths(f)).toEqual(['/checkout', '/allowed-popup'])
    const popup = [...gate.targets.values()].find(
      entry => entry.target.openerId === gate.targetId && entry.target.type === 'page',
    )!
    await ready(gate, popup.target.targetId)
    await expect
      .poll(() => gate.evaluate('document.querySelector("h1")?.textContent', popup.target.targetId))
      .toBe('Synthetic target')
    expect(gate.commands.filter(entry => entry.targetId === popup.target.targetId).map(entry => entry.command)).toEqual(
      ['Target.setAutoAttach', 'Fetch.enable', 'Runtime.runIfWaitingForDebugger'],
    )
    expect(gate.decisions).toContainEqual(
      expect.objectContaining({ targetId: popup.target.targetId, url: `${f.origin}/allowed-popup`, allowed: true }),
    )
    await gate
      .evaluate(popupScript('window.open', `${denied.origin}/denied`), popup.target.targetId)
      .catch(() => undefined)
    await gate.exited
    expect(paths(f)).toEqual(['/checkout', '/allowed-popup'])
    expect(denied.hits).toHaveLength(0)
  })

  it('denies a forbidden initial URL even when the direct test popup target is admitted', async () => {
    const f = await fixture()
    const denied = await fixture()
    const gate = await createGate(f, true)
    await opened(gate, `${f.origin}/checkout`)
    await gate.evaluate(popupScript('window.open', `${denied.origin}/denied`)).catch(() => undefined)
    await gate.exited
    expect(denied.hits).toHaveLength(0)
    expect(gate.decisions).toContainEqual(expect.objectContaining({ url: `${denied.origin}/denied`, allowed: false }))
  })

  it.each([303, 307, 308])('preserves native POST %i redirect behavior under browser-level admission', async status => {
    const f = await fixture(status)
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    await gate.evaluate(
      `const form=document.createElement('form'); form.method='POST'; form.action='/login'; const input=document.createElement('input'); input.name='fixture'; input.value='synthetic'; form.append(input); document.body.append(form); form.submit(); true`,
    )
    await expect.poll(() => paths(f)).toEqual(['/checkout', '/login', '/secure'])
    expect(f.hits.at(-1)).toEqual({
      path: '/secure',
      method: status === 303 ? 'GET' : 'POST',
      cookie: 'synthetic=target',
      body: status === 303 ? '' : 'fixture=synthetic',
    })
    expect(gate.decisions.map(entry => new URL(entry.url).pathname)).toEqual(['/checkout', '/login', '/secure'])
  })

  it('blocks a denied redirect follow-up before contact', async () => {
    const f = await fixture(303, true)
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    await gate.navigate(`${f.origin}/login`).catch(() => undefined)
    await gate.exited
    expect(paths(f)).toEqual(['/checkout', '/login', '/secure'])
    expect(gate.decisions.at(-1)).toMatchObject({ url: `${f.origin}/denied`, allowed: false })
  })

  it.each(['Fetch.enable', 'Target.setAutoAttach'] as const)(
    'never resumes a page after %s installation fails',
    async failCommand => {
      const gate = await startTargetGate({ headless, allow: () => true, failCommand })
      cleanup.push(gate.revoke)
      await gate.exited
      expect(gate.commands.some(entry => entry.command === 'Runtime.runIfWaitingForDebugger')).toBe(false)
      expect(gate.decisions).toHaveLength(0)
    },
  )

  it('closes before sending a paused request when policy throws', async () => {
    const f = await fixture()
    const gate = await startTargetGate({
      headless,
      allow: () => {
        throw new Error('Synthetic policy failure')
      },
    })
    cleanup.push(gate.revoke)
    await ready(gate)
    await gate.navigate(`${f.origin}/checkout`).catch(() => undefined)
    await gate.exited
    expect(f.hits).toHaveLength(0)
  })

  it('terminates the owned browser on pipe loss before a delayed page request', async () => {
    const f = await fixture()
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    await gate.evaluate(`setTimeout(() => fetch('/denied'), 500); true`)
    gate.breakPipe()
    await gate.exited
    await gate.revoke()
    await expect(access(gate.profileDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(paths(f)).toEqual(['/checkout'])
    await expect(gate.evaluate('true')).rejects.toThrow('not ready')
  })

  it('rejects a worker target before its script can fetch', async () => {
    const f = await fixture()
    // Allow the HTTP destination so zero contact specifically tests target denial.
    const gate = await startTargetGate({ headless, allow: facts => new URL(facts.url).origin === f.origin })
    cleanup.push(gate.revoke)
    await opened(gate, `${f.origin}/checkout`)
    const script = `fetch(${JSON.stringify(`${f.origin}/denied`)})`
    await gate
      .evaluate(
        `new Worker(URL.createObjectURL(new Blob([${JSON.stringify(script)}], {type:'text/javascript'}))); true`,
      )
      .catch(() => undefined)
    await gate.exited
    expect(paths(f)).toEqual(['/checkout'])
    expect(gate.commands.filter(entry => entry.command === 'Runtime.runIfWaitingForDebugger')).toHaveLength(1)
  })

  it('does not resume a target revoked while guard setup is paused', async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let signal!: () => void
    const paused = new Promise<void>(resolve => {
      signal = resolve
    })
    const gate = await startTargetGate({
      headless,
      allow: () => true,
      beforeTargetReady: () => {
        signal()
        return held
      },
    })
    cleanup.push(gate.revoke)
    try {
      await paused
      await gate.revoke()
      expect(gate.commands.some(entry => entry.command === 'Runtime.runIfWaitingForDebugger')).toBe(false)
      expect(gate.decisions).toHaveLength(0)
    } finally {
      release()
    }
  })

  it('treats unexpected seed detach as terminal', async () => {
    const f = await fixture()
    const gate = await createGate(f)
    await opened(gate, `${f.origin}/checkout`)
    await gate.detachSeed().catch(() => undefined)
    await gate.exited
    expect(paths(f)).toEqual(['/checkout'])
    await expect(gate.evaluate('true')).rejects.toThrow('not ready')
  })
})
