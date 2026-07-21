type StepDiscoveryDescriptor = {
  id: string
  title: string
  description: string
  categories: string[]
  capabilities: string[]
  agentProjection?: {
    searchTerms: string[]
    examples: Array<{ description: string }>
  }
  humanProjections: Array<{
    title: string
    description?: string
    signature: string
    group: string
  }>
  aliases: Array<{ value: string }>
}

const semanticConcepts = [['responsive', 'viewport', 'mobile', 'desktop', 'screen', 'breakpoint', 'layout']] as const

const conceptByTerm = new Map<string, readonly string[]>(
  semanticConcepts.flatMap(group => group.map(term => [term, group] as const)),
)

export function stepDiscoveryTerms(value: string) {
  const terms = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return new Set(terms.flatMap(term => [...(conceptByTerm.get(term) ?? [term])]))
}

export function canonicalStepDiscoveryText(descriptor: StepDiscoveryDescriptor) {
  return [
    descriptor.id,
    descriptor.title,
    descriptor.description,
    ...descriptor.categories,
    ...descriptor.capabilities,
    ...(descriptor.agentProjection?.searchTerms ?? []),
    ...(descriptor.agentProjection?.examples.map(example => example.description) ?? []),
    ...descriptor.humanProjections.flatMap(projection => [
      projection.title,
      projection.description,
      projection.signature,
      projection.group,
    ]),
    ...descriptor.aliases.map(alias => alias.value),
  ].join(' ')
}
