import type { PrismaClient } from '@prisma/client'
import { afterEach, expect, it, vi } from 'vitest'
import { inspectPageLabels, readAnalysisPageEvidence } from './app-managed-analysis-page-evidence'

function client(baseUrls: string[]) {
  return {
    environment: { findMany: async () => baseUrls.map((baseUrl, index) => ({ id: String(index), baseUrl })) },
    module: { findMany: async () => [] },
    locatorGroup: {
      findMany: async () =>
        ['/checkout', '//external.example/checkout', '/checkout?secret', '/unrelated'].map(route => ({ route })),
    },
  } as unknown as PrismaClient
}
const input = { journeyId: 'journey', targetProjectId: 'shop', requirement: { objective: 'Check guest checkout.' } }

afterEach(() => vi.unstubAllGlobals())

it('reads only labels, without form values, scripts or hidden content', () => {
  expect(
    inspectPageLabels(
      '<h1>Guest <span>checkout</span><span hidden>private</span></h1><script>secret</script><div hidden><button>Hidden</button></div><input value="private"><textarea>draft</textarea>',
    ),
  ).toEqual([{ kind: 'h1', label: 'Guest checkout' }])
})

it('inspects only matching registered paths and records denied redirects as unobserved', async () => {
  const fetch = vi.fn(async (url: URL) =>
    url.pathname === '/'
      ? new Response(null, { status: 302, headers: { location: 'https://elsewhere.example' } })
      : new Response('<button>Pay</button>', { headers: { 'content-type': 'text/html' } }),
  )
  vi.stubGlobal('fetch', fetch)
  const inspect = vi.fn(async () => {
    expect(fetch).not.toHaveBeenCalled()
  })
  const evidence = await readAnalysisPageEvidence(input, client(['https://shop.example/']), inspect)
  expect(inspect).toHaveBeenCalledWith('/checkout')
  expect(evidence.pages).toEqual([
    { path: '/', observed: false, status: 302 },
    { path: '/checkout', observed: true, labels: [{ kind: 'button', label: 'Pay' }] },
  ])
  expect(fetch.mock.calls.map(([url]) => url.href)).toEqual(['https://shop.example/', 'https://shop.example/checkout'])
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ redirect: 'manual', credentials: 'omit', method: 'GET' }),
  )
})

it('waits for an unambiguous target', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  expect(await readAnalysisPageEvidence(input, client(['https://one.example', 'https://two.example']))).toMatchObject({
    status: 'AMBIGUOUS_TARGET',
    pages: [],
  })
  expect(fetch).not.toHaveBeenCalled()
})

it('bounds recorded paths and labels independently of the fetched URL', async () => {
  const route = `/checkout/${'a'.repeat(10_000)}`
  const fetch = vi.fn(async (url: URL) => {
    void url
    return new Response(`<h1>${'x'.repeat(20_000)}</h1>`, {
      headers: { 'content-type': 'text/html' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  const scopedClient = {
    environment: { findMany: async () => [{ id: 'one', baseUrl: 'https://shop.example/' }] },
    module: { findMany: async () => [] },
    locatorGroup: { findMany: async () => [{ route }] },
  } as unknown as PrismaClient
  const inspected = vi.fn(async (path: string) => {
    void path
  })
  const evidence = await readAnalysisPageEvidence(input, scopedClient, inspected)
  expect(fetch.mock.calls[1]![0].pathname).toBe(route)
  expect(inspected.mock.calls[0]![0]).toHaveLength(2048)
  expect(evidence.pages[1]!.path).toHaveLength(2048)
  expect(Buffer.byteLength(JSON.stringify(evidence))).toBeLessThan(128 * 1024)
})
