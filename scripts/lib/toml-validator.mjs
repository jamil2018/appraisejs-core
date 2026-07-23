const headerSegment = '(?:[A-Za-z0-9_-]+|"(?:[^"\\\\]|\\\\.)+")'
const headerPattern = new RegExp(`^${headerSegment}(?:\\.${headerSegment})*$`)

export function validateTomlBasicString(value, relative, lineNumber) {
  if (/\\(?!["\\btnfruU])/.test(value)) {
    throw new Error(`${relative}:${lineNumber}: invalid TOML string escape`)
  }
}

// The bounded TOML value grammar is intentionally expressed as one ordered decision table.
// fallow-ignore-next-line complexity
function parseValue(raw, relative, lineNumber) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?(?:0|[1-9]\d*)$/.test(raw)) return Number(raw)
  if (/^-?\d+$/.test(raw)) throw new Error(`${relative}:${lineNumber}: invalid TOML integer`)
  if (/^"(?:[^"\\]|\\.)*"$/.test(raw)) {
    validateTomlBasicString(raw, relative, lineNumber)
    try {
      return JSON.parse(raw)
    } catch {
      throw new Error(`${relative}:${lineNumber}: invalid quoted string`)
    }
  }
  throw new Error(`${relative}:${lineNumber}: unsupported or invalid TOML value`)
}

// Project TOML validation keeps table and assignment state in a single deterministic pass.
// fallow-ignore-next-line complexity
export function parseProjectToml(contents, relative = '.codex/config.toml') {
  const sections = new Map([['', new Map()]])
  let current = sections.get('')
  for (const [index, sourceLine] of contents.split('\n').entries()) {
    const lineNumber = index + 1
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('[')) {
      const match = line.match(/^\[([^\]]+)\]$/)
      if (!match || !headerPattern.test(match[1])) {
        throw new Error(`${relative}:${lineNumber}: invalid TOML table header`)
      }
      if (sections.has(match[1])) throw new Error(`${relative}:${lineNumber}: duplicate TOML table`)
      current = new Map()
      sections.set(match[1], current)
      continue
    }
    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
    if (!assignment) throw new Error(`${relative}:${lineNumber}: invalid TOML assignment`)
    const [, key, raw] = assignment
    if (current.has(key)) throw new Error(`${relative}:${lineNumber}: duplicate TOML key "${key}"`)
    current.set(key, parseValue(raw, relative, lineNumber))
  }
  return sections
}
