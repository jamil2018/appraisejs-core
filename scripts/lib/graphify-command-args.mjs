const GRAPH_COMMANDS = new Set(['query', 'path', 'explain'])

export const DEFAULT_GRAPH_PATH = 'src/graphify-out/graph.json'

export function withDefaultGraph(args, graphPath = DEFAULT_GRAPH_PATH) {
  if (!GRAPH_COMMANDS.has(args[0]) || args.includes('--graph')) return [...args]
  return [...args, '--graph', graphPath]
}
