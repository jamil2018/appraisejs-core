const GRAPH_COMMANDS = new Set(['query', 'path', 'explain'])

export const DEFAULT_GRAPH_PATH = 'src/graphify-out/graph.json'

export function withDefaultGraph(args, graphPath = DEFAULT_GRAPH_PATH) {
  if (!GRAPH_COMMANDS.has(args[0])) return [...args]
  const scopeIndex = args.indexOf('--scope')
  if (scopeIndex !== -1) {
    const scope = args[scopeIndex + 1]
    if (!['src', 'scripts', 'prisma', 'packages'].includes(scope)) throw new Error('Unknown Graphify scope')
    if (args.includes('--graph')) throw new Error('Select either --scope or --graph')
    const remaining = args.filter((_, index) => index !== scopeIndex && index !== scopeIndex + 1)
    return [...remaining, '--graph', `${scope}/graphify-out/graph.json`]
  }
  if (args.includes('--graph')) return [...args]
  return [...args, '--graph', graphPath]
}
