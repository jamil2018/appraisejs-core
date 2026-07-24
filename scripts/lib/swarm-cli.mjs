export function parseStrictArgs(argv, specification) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const { name, definition, value } = readArgument(argv, index, specification)
    index += 1
    recordArgument(values, name, definition, value)
  }
  assertRequiredArguments(values, specification)
  return Object.fromEntries(values)
}

function readArgument(argv, index, specification) {
  const flag = argv[index]
  const name = argumentName(flag)
  assertKnownArgument(name, flag, specification)
  const value = readArgumentValue(argv, index, name)
  return { name, definition: specification[name], value }
}

function argumentName(flag) {
  return flag.startsWith('--') ? flag.slice(2) : ''
}

function assertKnownArgument(name, flag, specification) {
  if (!(name in specification)) throw new Error(`Unknown argument: ${flag}`)
}

function readArgumentValue(argv, index, name) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`)
  return value
}

function recordArgument(values, name, definition, value) {
  const normalized = normalizeArgumentValue(value, name)
  argumentWriters[Boolean(definition.multiple)](values, name, normalized)
}

function normalizeArgumentValue(value, name) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Blank value for --${name}`)
  return normalized
}

const argumentWriters = {
  false: writeSingleArgument,
  true: writeMultipleArgument,
}

function writeSingleArgument(values, name, value) {
  if (values.has(name)) throw new Error(`Duplicate argument: --${name}`)
  values.set(name, value)
}

function writeMultipleArgument(values, name, value) {
  const existing = values.get(name)
  values.set(name, existing ? [...existing, value] : [value])
}

function assertRequiredArguments(values, specification) {
  for (const [name, definition] of Object.entries(specification)) {
    if (definition.required && !values.has(name)) throw new Error(`Missing required argument: --${name}`)
  }
}
