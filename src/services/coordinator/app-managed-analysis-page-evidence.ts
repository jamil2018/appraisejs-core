import type { PrismaClient } from '@prisma/client'
import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { readDiscoveryRegistries } from './quality-journey-discovery-prerequisites'

type Node = DefaultTreeAdapterTypes.Node
type Brief = { objective: string; environmentIds?: string[] }
const maximumBytes = 192 * 1024

// Inspect static document structure. Scripts, form values and credentials never enter the analysis prompt.
function hidden(node: DefaultTreeAdapterTypes.Element) {
  return node.attrs.some(attr => attr.name === 'hidden' || (attr.name === 'aria-hidden' && attr.value === 'true'))
}

export function inspectPageLabels(html: string) {
  const labels: Array<{ kind: string; label: string }> = []
  const pending: Node[] = [parse(html)]
  while (pending.length && labels.length < 24) {
    const node = pending.pop()!
    if ('tagName' in node) {
      if (['script', 'style', 'template', 'noscript', 'textarea'].includes(node.tagName)) continue
      if (hidden(node)) continue
      if (['title', 'h1', 'h2', 'h3', 'label', 'button'].includes(node.tagName)) {
        const fragments: string[] = []
        const children = [...node.childNodes].reverse()
        while (children.length && fragments.length < 32) {
          const child = children.pop()!
          if ('value' in child && child.nodeName === '#text') fragments.push(child.value)
          else if (
            'tagName' in child &&
            !hidden(child) &&
            ['span', 'strong', 'em', 'b', 'i', 'small'].includes(child.tagName)
          )
            children.push(...child.childNodes.toReversed())
        }
        const label = fragments.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120)
        if (label) labels.push({ kind: node.tagName, label })
      }
    }
    if ('childNodes' in node) pending.push(...node.childNodes.toReversed())
  }
  return labels
}

async function inspectDocument(url: URL) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
    headers: { Accept: 'text/html' },
  })
  const reader = response.body?.getReader()
  try {
    if (!reader || !response.ok || !/^text\/html\b/i.test(response.headers.get('content-type') ?? ''))
      return { path: url.pathname, observed: false, status: response.status }
    const parts: Uint8Array[] = []
    let size = 0
    while (size < maximumBytes) {
      const chunk = await reader.read()
      if (chunk.done) break
      const part = chunk.value.subarray(0, maximumBytes - size)
      size += part.length
      parts.push(part)
    }
    return { path: url.pathname, observed: true, labels: inspectPageLabels(Buffer.concat(parts).toString('utf8')) }
  } finally {
    await reader?.cancel()
  }
}

export async function readAnalysisPageEvidence(
  input: { journeyId: string; targetProjectId: string; requirement: Brief },
  client: PrismaClient,
  onInspect?: (path: string) => Promise<void>,
) {
  const registry = await readDiscoveryRegistries(input.targetProjectId, client)
  const eligible = registry.environments.filter(
    env => !input.requirement.environmentIds?.length || input.requirement.environmentIds.includes(env.id),
  )
  if (eligible.length !== 1) return { status: eligible.length ? 'AMBIGUOUS_TARGET' : 'NO_TARGET', pages: [] }
  const target = URL.parse(eligible[0]!.baseUrl)
  if (
    !target ||
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    return { status: 'INVALID_TARGET', pages: [] }

  const words = input.requirement.objective
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3)
  const paths = [...new Set(registry.locatorGroups.map(group => group.route))]
    .filter(path => path && words.some(word => path.toLowerCase().includes(word)))
    .sort()
  const urls = [target]
  for (const path of paths) {
    if (!path || !path.startsWith('/') || path === target.pathname) continue
    const url = URL.parse(path, target)
    if (url && url.origin === target.origin && url.pathname === path && !url.search && !url.hash) urls.push(url)
    if (urls.length === 3) break
  }
  await onInspect?.((urls[1] ?? target).pathname)
  const pages = await Promise.all(
    urls.map(async url => {
      try {
        return await inspectDocument(url)
      } catch {
        return { path: url.pathname, observed: false }
      }
    }),
  )
  return { status: 'INSPECTION_FINISHED', pages }
}
