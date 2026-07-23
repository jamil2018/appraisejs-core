const REPO_ONLY_TEMPLATE_PATHS = new Set(['scripts/lib/swarm-ledger-lock.mjs', 'scripts/lib/toml-validator.mjs'])

const REPO_ONLY_TEMPLATE_PREFIXES = ['.agents/', '.codex/'] as const

export const REPO_ONLY_TEMPLATE_SCRIPT_NAMES = new Set([
  'check:swarm-harness',
  'swarm:record',
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
    (normalizedPath.includes('swarm') || normalizedPath.startsWith('scripts/tests/'))
  return (
    REPO_ONLY_TEMPLATE_PATHS.has(normalizedPath) ||
    isRepoOnlySwarmScript ||
    REPO_ONLY_TEMPLATE_PREFIXES.some(
      prefix => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix),
    )
  )
}
