const REPO_ONLY_TEMPLATE_PATHS = new Set(['scripts/lib/swarm-ledger-lock.mjs', 'scripts/lib/toml-validator.mjs'])

const REPO_ONLY_TEMPLATE_PREFIXES = [
  '.agents/',
  '.codex/',
  'config/development-harness/',
  'docs/development-harness/',
] as const

export const REPO_ONLY_TEMPLATE_SCRIPT_NAMES = new Set([
  'validate:harness:plan',
  'validate:harness',
  'validate:harness:ci',
  'check:development-harness',
  'harness:learn',
  'harness:select',
  'harness:replay-selection',
  'harness:diagnostic',
  'harness:validate',
  'harness:benchmark',
  'harness:review',
  'harness:graph-status',
  'check:swarm-harness',
  'swarm:record',
  'swarm:route',
  'swarm:evolve',
  'swarm:ledger',
  'test:swarm-harness',
])

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

export function isRepoOnlyTemplatePath(relativePath: string): boolean {
  const normalizedPath = toPosixPath(relativePath)
  const isRepoOnlySwarmScript =
    normalizedPath.startsWith('scripts/') &&
    (normalizedPath.includes('swarm') ||
      normalizedPath.includes('harness-') ||
      normalizedPath.startsWith('scripts/tests/'))
  return (
    REPO_ONLY_TEMPLATE_PATHS.has(normalizedPath) ||
    isRepoOnlySwarmScript ||
    REPO_ONLY_TEMPLATE_PREFIXES.some(
      prefix => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix),
    )
  )
}
