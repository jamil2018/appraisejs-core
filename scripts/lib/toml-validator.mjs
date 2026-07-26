const headerSegment = '(?:[A-Za-z0-9_-]+|"(?:[^"\\\\]|\\\\.)+")'
const headerPattern = new RegExp(`^${headerSegment}(?:\\.${headerSegment})*$`)

export function validateTomlBasicString(value, relative, lineNumber) {
  if (/\\(?!["\\btnfruU])/.test(value)) {
    throw new Error(`${relative}:${lineNumber}: invalid TOML string escape`)
  }
}

function parseValue(raw, relative, lineNumber) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  const integer = parseTomlInteger(raw, relative, lineNumber)
  if (integer !== undefined) return integer
  return parseQuotedTomlString(raw, relative, lineNumber)
}

function parseTomlInteger(raw, relative, lineNumber) {
  if (/^-?(?:0|[1-9]\d*)$/.test(raw)) return Number(raw)
  if (/^-?\d+$/.test(raw)) throw new Error(`${relative}:${lineNumber}: invalid TOML integer`)
}

function parseQuotedTomlString(raw, relative, lineNumber) {
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

export function parseProjectToml(contents, relative = '.codex/config.toml') {
  const sections = new Map([['', new Map()]])
  let current = sections.get('')
  for (const [index, sourceLine] of contents.split('\n').entries()) {
    current = parseTomlLine(sections, current, sourceLine, relative, index + 1)
  }
  return sections
}

function parseTomlLine(sections, current, sourceLine, relative, lineNumber) {
  const line = sourceLine.trim()
  if (!line || line.startsWith('#')) return current
  if (line.startsWith('[')) return addSection(sections, line, relative, lineNumber)
  addAssignment(current, line, relative, lineNumber)
  return current
}

function addSection(sections, line, relative, lineNumber) {
  const match = line.match(/^\[([^\]]+)\]$/)
  if (!match || !headerPattern.test(match[1])) throw new Error(`${relative}:${lineNumber}: invalid TOML table header`)
  if (sections.has(match[1])) throw new Error(`${relative}:${lineNumber}: duplicate TOML table`)
  const section = new Map()
  sections.set(match[1], section)
  return section
}

function addAssignment(section, line, relative, lineNumber) {
  const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/)
  if (!assignment) throw new Error(`${relative}:${lineNumber}: invalid TOML assignment`)
  const [, key, raw] = assignment
  if (section.has(key)) throw new Error(`${relative}:${lineNumber}: duplicate TOML key "${key}"`)
  section.set(key, parseValue(raw, relative, lineNumber))
}
