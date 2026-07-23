// Strict parsing centralizes all rejection paths and is covered through every swarm CLI.
// fallow-ignore-next-line complexity
export function parseStrictArgs(argv, specification) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!flag.startsWith('--') || !(flag.slice(2) in specification)) {
      throw new Error(`Unknown argument: ${flag}`)
    }
    const name = flag.slice(2)
    const definition = specification[name]
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${name}`)
    index += 1
    const normalized = value.trim()
    if (!normalized) throw new Error(`Blank value for --${name}`)
    if (!definition.multiple && values.has(name)) throw new Error(`Duplicate argument: --${name}`)
    if (definition.multiple) values.set(name, [...(values.get(name) ?? []), normalized])
    else values.set(name, normalized)
  }
  for (const [name, definition] of Object.entries(specification)) {
    if (definition.required && !values.has(name)) throw new Error(`Missing required argument: --${name}`)
  }
  return Object.fromEntries(values)
}
