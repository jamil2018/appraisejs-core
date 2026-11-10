// Exact existing duplicate-key parser; importing it evaluates no client.
import assert from 'node:assert/strict'

export function parseUniqueJson(text) {
  const parsed = JSON.parse(text),
    stack = []
  let previous
  for (const token of text.match(/"(?:[^"\\]|\\.)*"|[{}[\],:]|[^{}[\],:\s]+/g) ?? []) {
    const top = stack.at(-1)
    if (token.startsWith('"') && top?.keys && ['{', ','].includes(previous)) {
      const key = JSON.parse(token)
      assert(!top.keys.has(key), 'Duplicate JSON field: ' + key)
      top.keys.add(key)
    }
    if (token === '{') stack.push({ keys: new Set() })
    if (token === '[') stack.push({})
    if (token === '}' || token === ']') stack.pop()
    previous = token
  }
  return parsed
}
