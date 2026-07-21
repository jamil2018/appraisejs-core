import { describe, expect, it } from 'vitest'

import { DEFAULT_GRAPH_PATH, withDefaultGraph } from './graphify-command-args.mjs'

describe('withDefaultGraph', () => {
  it.each([
    ['query', ['query', 'plan lifecycle']],
    ['path', ['path', 'Plan', 'Coordinator']],
    ['explain', ['explain', 'ArtifactRepository']],
  ])('routes %s through the canonical source graph', (_command, args) => {
    expect(withDefaultGraph(args)).toEqual([...args, '--graph', DEFAULT_GRAPH_PATH])
  })

  it('preserves an explicitly selected graph', () => {
    const args = ['query', 'schema', '--graph', 'prisma/graphify-out/graph.json']
    expect(withDefaultGraph(args)).toEqual(args)
  })

  it('does not add a graph to build or MCP commands', () => {
    expect(withDefaultGraph(['src', '--update'])).toEqual(['src', '--update'])
    expect(withDefaultGraph(['mcp'])).toEqual(['mcp'])
  })
})
