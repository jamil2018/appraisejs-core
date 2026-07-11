export function canonicalContractJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalContractJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalContractJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
