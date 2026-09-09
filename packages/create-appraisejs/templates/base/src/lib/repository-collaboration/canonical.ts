import { createHash, randomUUID } from 'node:crypto'

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  return value
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`
}

export function collaborationHash(value: unknown): string {
  const bytes = typeof value === 'string' ? value : canonicalJson(value)
  return createHash('sha256').update(bytes).digest('hex')
}

export function newPortableId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}
