/** Shared canonical serialization; keep this module free of runtime and Node dependencies. */
export function canonicalOperationJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalOperationJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
